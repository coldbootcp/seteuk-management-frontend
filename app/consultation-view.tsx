"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api-client";
import {
  concludeConsultation,
  confirmFullReplan,
  createOrResumeConsultationSession,
} from "../lib/workspace-adapter";
import {
  streamConsultationMessage,
  TOOL_LABELS,
  type ChatAction,
} from "../lib/chat";
import type { ConsultationSession, ConsultationStatus } from "../lib/product-harness";

type DiagnosisPreQuestion = { key: string; prompt: string; options: string[]; allow_custom: boolean };

type DiagnosisResult = {
  status: "processing" | "done" | "failed";
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  headline_comment: string | null;
};

type Bubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: ChatAction[];
  streaming?: boolean;
};

/**
 * 진단+상담 필수 관문의 화면. Onboarding과 같은 "전체 화면 대체" 자리에 들어간다 —
 * 이 화면을 통과해야만(상담을 마쳐야만) ProductShell로 넘어간다.
 *
 * 단계: (1) 진단이 아직 없으면 실행 → (2) 보고서 표시 → (3) 상담 챗봇과 대화 →
 * (4) 챗봇이 종료 신호를 보내면 나가기 버튼이 켜짐 → (5) 학생이 눌러야 확정.
 */
export function ConsultationGate({
  status,
  onSatisfied,
}: {
  status: ConsultationStatus;
  onSatisfied: () => void;
}) {
  const [phase, setPhase] = useState<"diagnosing" | "ready">("diagnosing");
  const [diagnosisError, setDiagnosisError] = useState("");
  const [preQuestions, setPreQuestions] = useState<DiagnosisPreQuestion[] | null>(null);
  const [preAnswers, setPreAnswers] = useState<Record<string, string>>({});
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [session, setSession] = useState<ConsultationSession | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [ready, setReady] = useState(false);
  const [replanProposal, setReplanProposal] = useState<{ rationale: string } | null>(null);
  const [concluding, setConcluding] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  async function pollDiagnosis(diagnosisId: string): Promise<void> {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const result = await api<DiagnosisResult>(`/diagnosis/${diagnosisId}`);
      if (result.status === "done") {
        setDiagnosis(result);
        return;
      }
      if (result.status === "failed") throw new Error("진단 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
    throw new Error("진단이 예상보다 오래 걸리고 있습니다. 잠시 후 다시 시도해주세요.");
  }

  const runDiagnosis = useCallback(async (answers?: { key: string; prompt: string; answer: string | null }[]) => {
    setDiagnosisError("");
    try {
      if (answers) {
        await api("/diagnosis/pre-questions/answers", { method: "POST", body: { answers } });
      }
      const created = await api<{ diagnosis_id: string }>("/diagnosis", { method: "POST" });
      await pollDiagnosis(created.diagnosis_id);
    } catch (caught) {
      setDiagnosisError(caught instanceof Error ? caught.message : "진단을 실행하지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const latest = await api<DiagnosisResult>("/diagnosis/latest").catch(() => null);
        if (latest?.status === "done") {
          if (!cancelled) setDiagnosis(latest);
          return;
        }
        const pre = await api<{ questions: DiagnosisPreQuestion[] }>("/diagnosis/pre-questions");
        if (pre.questions.length > 0) {
          if (!cancelled) setPreQuestions(pre.questions);
          return;
        }
        await runDiagnosis();
      } catch (caught) {
        if (!cancelled) {
          setDiagnosisError(caught instanceof Error ? caught.message : "진단을 불러오지 못했습니다.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runDiagnosis]);

  useEffect(() => {
    if (!diagnosis || session) return;
    createOrResumeConsultationSession()
      .then((created) => {
        setSession(created);
        setReady(created.ready);
        setPhase("ready");
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "상담을 시작하지 못했습니다."));
  }, [diagnosis, session]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles]);

  async function send() {
    const content = input.trim();
    if (!content || streaming || sendingRef.current || !session) return;
    sendingRef.current = true;
    try {
      setInput("");
      setError("");
      setStreaming(true);
      const pendingId = `pending-${Date.now()}`;
      setBubbles((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: "user", content, actions: [] },
        { id: pendingId, role: "assistant", content: "", actions: [], streaming: true },
      ]);

      await streamConsultationMessage(session.id, content, {
        onToken: (delta) =>
          setBubbles((prev) =>
            prev.map((b) => (b.id === pendingId ? { ...b, content: b.content + delta } : b)),
          ),
        onAction: (action) => {
          setBubbles((prev) =>
            prev.map((b) => (b.id === pendingId ? { ...b, actions: [...b.actions, action] } : b)),
          );
          if (action.tool === "propose_full_replan_exception" && !("error" in (action.result ?? {}))) {
            setReplanProposal({ rationale: String(action.arguments?.rationale ?? "") });
          }
        },
        onDone: (payload) =>
          setBubbles((prev) =>
            prev.map((b) =>
              b.id === pendingId
                ? { ...b, id: payload.message_id, streaming: false, actions: payload.applied_actions ?? b.actions }
                : b,
            ),
          ),
        onError: (payload) => {
          setError(`${payload.message} (${payload.error_code})`);
          setBubbles((prev) => prev.map((b) => (b.id === pendingId ? { ...b, streaming: false } : b)));
        },
        onSignal: (payload) => setReady(Boolean(payload.ready)),
      });
      setStreaming(false);
    } finally {
      sendingRef.current = false;
    }
  }

  async function handleConclude() {
    if (!session) return;
    setConcluding(true);
    setError("");
    try {
      await concludeConsultation(session.id);
      onSatisfied();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "상담을 마무리하지 못했습니다.");
    } finally {
      setConcluding(false);
    }
  }

  async function respondToReplanProposal(confirmed: boolean) {
    if (!session) return;
    try {
      const updated = await confirmFullReplan(session.id, confirmed);
      setSession(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "확인을 저장하지 못했습니다.");
    } finally {
      setReplanProposal(null);
    }
  }

  const kindLabel = status.requiredKind === "semester_review" ? "학기말 재평가 상담" : "최초 진단 상담";

  return (
    <div className="consultation-gate">
      <header className="consultation-gate-head">
        <span className="kicker">{kindLabel}</span>
        <h1>
          {status.requiredKind === "semester_review"
            ? "이번 학기를 점검하고 다음 학기 목표를 정해요"
            : "3개년 큰 계획을 함께 세워요"}
        </h1>
        <p>이 상담을 마쳐야 성적·시간표·활동 기록 등 메인 화면으로 들어갈 수 있어요.</p>
      </header>

      {diagnosisError && <div className="banner banner-error">{diagnosisError}</div>}
      {error && <div className="banner banner-error">{error}</div>}

      {phase === "diagnosing" && !diagnosisError && (
        <div className="consultation-gate-loading">
          {preQuestions ? (
            <div className="consultation-pre-questions">
              <p>진단 전에 몇 가지만 확인할게요. 답하지 않고 넘어가도 됩니다.</p>
              {preQuestions.map((q) => (
                <label key={q.key} className="consultation-pre-question">
                  <span>{q.prompt}</span>
                  <input
                    value={preAnswers[q.key] ?? ""}
                    onChange={(event) =>
                      setPreAnswers((prev) => ({ ...prev, [q.key]: event.target.value }))
                    }
                  />
                </label>
              ))}
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  const answers = preQuestions.map((q) => ({
                    key: q.key,
                    prompt: q.prompt,
                    answer: preAnswers[q.key]?.trim() || null,
                  }));
                  setPreQuestions(null);
                  void runDiagnosis(answers);
                }}
              >
                진단 시작하기
              </button>
            </div>
          ) : (
            <p>지금까지의 기록을 분석하는 중입니다. 잠시만 기다려주세요…</p>
          )}
        </div>
      )}

      {diagnosis && (
        <section className="consultation-report">
          {diagnosis.headline_comment && <p className="consultation-headline">{diagnosis.headline_comment}</p>}
          <div className="consultation-report-grid">
            <div>
              <strong>강점</strong>
              <ul>{diagnosis.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <div>
              <strong>약점</strong>
              <ul>{diagnosis.weaknesses.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <div>
              <strong>기회</strong>
              <ul>{diagnosis.opportunities.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <div>
              <strong>반복되는 패턴</strong>
              <ul>{diagnosis.threats.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          </div>
        </section>
      )}

      {session && (
        <section className="consultation-chat">
          <div className="consultation-chat-scroll">
            {bubbles.length === 0 ? (
              <p className="chat-empty">
                {status.requiredKind === "semester_review"
                  ? "이번 학기가 어땠는지 편하게 이야기해주세요."
                  : "관심 분야나 앞으로의 방향에 대해 이야기해주세요."}
              </p>
            ) : (
              bubbles.map((bubble) => (
                <div key={bubble.id} className={`chat-row ${bubble.role}`}>
                  <div className="chat-bubble">
                    {bubble.content}
                    {bubble.streaming && !bubble.content && <em>생각하는 중…</em>}
                  </div>
                  {bubble.actions.length > 0 && (
                    <div className="chat-actions">
                      {bubble.actions.map((action, index) => (
                        <span
                          key={index}
                          className={action.result && "error" in action.result ? "chip failed" : "chip"}
                        >
                          {action.result && "error" in action.result ? "✕" : "✓"}{" "}
                          {TOOL_LABELS[action.tool] ?? action.tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          <div className="chat-input">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={2}
              placeholder="메시지를 입력하세요"
            />
            <button type="button" onClick={() => void send()} disabled={streaming || !input.trim()}>
              {streaming ? "…" : "보내기"}
            </button>
          </div>

          <div className="consultation-gate-footer">
            <button
              className="btn btn-primary"
              type="button"
              disabled={!ready || concluding}
              onClick={() => void handleConclude()}
              title={ready ? undefined : "챗봇이 상담을 마무리하자고 하면 눌러주세요"}
            >
              {concluding ? "확정하는 중…" : ready ? "상담 마치고 메인 화면으로 →" : "상담이 아직 끝나지 않았어요"}
            </button>
          </div>
        </section>
      )}

      {replanProposal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>3개년 계획을 처음부터 다시 세울까요?</h3>
            <p>{replanProposal.rationale}</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={() => void respondToReplanProposal(false)}>
                아니요, 지금 계획을 유지할게요
              </button>
              <button className="btn btn-primary" type="button" onClick={() => void respondToReplanProposal(true)}>
                네, 처음부터 다시 세워주세요
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
