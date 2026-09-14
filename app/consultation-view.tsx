"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api-client";
import {
  concludeConsultation,
  confirmFullReplan,
  createOrResumeConsultationSession,
} from "../lib/workspace-adapter";
import { streamConsultationMessage } from "../lib/chat";
import type { ConsultationSession, ConsultationStatus } from "../lib/product-harness";
import { GateFrame } from "./gate-frame";
import { ChatComposer, ChatThread, type ChatBubble } from "./chat-thread";

type DiagnosisResult = {
  status: "processing" | "done" | "failed";
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  headline_comment: string | null;
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
  onSignOut,
}: {
  status: ConsultationStatus;
  onSatisfied: () => void;
  onSignOut: () => void;
}) {
  const [phase, setPhase] = useState<"diagnosing" | "ready">("diagnosing");
  const [diagnosisError, setDiagnosisError] = useState("");
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [session, setSession] = useState<ConsultationSession | null>(null);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
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

  const runDiagnosis = useCallback(async () => {
    setDiagnosisError("");
    try {
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
        // 진단 전 설문은 없다. 기록으로 진단을 먼저 만든 뒤, 필요한 확인만
        // 학사 시점을 아는 상담 대화에서 한 번에 하나씩 다룬다.
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
  const isReview = status.requiredKind === "semester_review";
  const targetLabel =
    status.targetGrade && status.targetSemester
      ? `${status.targetGrade}학년 ${status.targetSemester}학기`
      : "이번 학기";
  /** 진단이 근거로 삼을 기록이 아직 하나도 없는 상태인지. 있으면 여는 말이 달라진다. */
  const diagnosisIsEmpty = Boolean(
    diagnosis &&
      !diagnosis.headline_comment &&
      diagnosis.strengths.length === 0 &&
      diagnosis.weaknesses.length === 0 &&
      diagnosis.opportunities.length === 0 &&
      diagnosis.threats.length === 0,
  );

  /**
   * 상담 창을 열자마자 놓이는 여는 말. 학생이 빈 입력칸 앞에서 "무슨 얘기를 하라는
   * 거지?" 하고 멈추던 자리다. 화면이 그리는 문장이므로 사실만 적는다 — 무엇을 근거로
   * 보는지, 무엇이 언제 확정되는지, 먼저 무슨 말을 하면 되는지.
   */
  const consultationIntro = (
    <>
      <p>
        안녕하세요. <strong className="font-bold">세특연구소 AI 입시 컨설턴트</strong>입니다.
        {isReview
          ? " 지난 학기를 함께 돌아보고, 다음 학기에 무엇을 목표로 삼을지 정하는 상담이에요."
          : " 학생의 기록을 처음 읽고, 앞으로 무엇을 목표로 삼고 어떤 탐구를 할지 함께 정하는 상담이에요."}
      </p>
      <p>
        제가 보고 있는 것은 <strong className="font-bold">방금 만든 정밀 진단 리포트</strong>와, 지금까지 쌓인
        성적·활동·독서·수상·봉사 기록, 그리고 가입할 때 답해주신 진로와 관심 축입니다.
        {diagnosisIsEmpty && " 다만 아직 쌓인 기록이 없어 진단이 비어 있어요 — 그만큼 이 대화에서 들려주시는 이야기가 근거가 됩니다."}
      </p>
      <p>
        이야기가 충분해지면 제가 <strong className="font-bold">{targetLabel} 목표와 탐구 주제 초안</strong>을 제안드릴게요.
        마음에 들지 않으면 얼마든지 고쳐 말씀해주세요. <strong className="font-bold">대화만으로는 아무것도 확정되지 않고</strong>,
        아래 [상담 마치고 메인 화면으로] 버튼을 누르는 순간에만 계획으로 저장됩니다.
      </p>
      <p className="text-gray-500">
        {isReview
          ? "먼저 이번 학기에 실제로 한 것과 아쉬웠던 것부터 편하게 들려주세요."
          : "먼저 관심 있는 분야, 해보고 싶은 것, 피하고 싶은 제약을 편하게 들려주세요."}
      </p>
    </>
  );

  return (
    <GateFrame badge={kindLabel} onSignOut={onSignOut} width="wide">
      <div className="space-y-6">
        <header className="text-center max-w-3xl mx-auto space-y-3">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200/80 text-brand-600 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-brand-500" />
            세특연구소 AI 정밀 학업 진단 · {kindLabel}
          </span>
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-950 tracking-tight leading-snug">
            {status.requiredKind === "semester_review" ? (
              <>
                이번 학기를 점검하고
                <br />
                <span className="text-brand-500">다음 학기 목표를 함께 정해요</span>
              </>
            ) : (
              <>
                맞춤 계획 설계를 위해
                <br />
                <span className="text-brand-500">AI 정밀 학업 진단</span>을 먼저 진행합니다
              </>
            )}
          </h1>
          <p className="text-sm text-gray-600">
            이 상담을 마쳐야 성적·시간표·활동 기록 등 메인 화면으로 들어갈 수 있어요.
          </p>
        </header>

        {diagnosisError && <div className="banner banner-error">{diagnosisError}</div>}
        {error && <div className="banner banner-error">{error}</div>}

        {/* 진단 대기 — 몇 분 걸리므로 진행을 지어내지 않고 무엇을 하는 중인지만 말한다. */}
        {phase === "diagnosing" && !diagnosisError && (
          <section className="bg-white p-8 rounded-2xl border border-gray-200/80 shadow-xs max-w-lg mx-auto text-center space-y-5">
            <span className="w-16 h-16 rounded-2xl bg-blue-50 text-brand-600 text-2xl flex items-center justify-center mx-auto animate-pulse">
              ⚡
            </span>
            <div>
              <h2 className="text-lg font-bold text-gray-900">지금까지의 기록을 정밀 분석하는 중…</h2>
              <p className="text-xs text-gray-500 mt-1">
                성적 추이 · 학기별 리뷰 · 활동 인벤토리 · 지식 연계를 각각 계산합니다. 보통 1~3분 걸립니다.
              </p>
            </div>
            <div className="space-y-2 text-left bg-gray-50 p-4 rounded-xl border border-gray-100 text-xs text-gray-600">
              {[
                "학기별 성적 추이와 이수 단위 정리",
                "학기별 성적·독서·활동 리뷰 생성",
                "활동 인벤토리와 지식 연계 그래프 구성",
                "강점·약점·기회·반복 패턴 종합",
              ].map((item) => (
                <div className="flex items-center gap-2 font-medium" key={item}>
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-300 flex-none" />
                  {item}
                </div>
              ))}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div className="bg-brand-500 h-1.5 w-1/3 rounded-full animate-pulse" />
            </div>
          </section>
        )}

        {diagnosis && diagnosisIsEmpty && (
          <section className="bg-white p-6 md:p-7 rounded-2xl border border-gray-200/80 shadow-xs">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center flex-none text-base">
                ⌁
              </span>
              <div className="space-y-1.5">
                <h2 className="text-base font-extrabold text-gray-950">아직 과거 기록 기반 진단은 만들지 않았어요</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  학생부 PDF나 이전 활동·성적 기록이 없으면 강점·약점·반복 패턴을 사실처럼 판단할 수 없습니다.
                  기록을 추가하면 그 내용을 근거로 정밀 진단을 만들 수 있어요. 지금은 입력해 주신 진로와 관심사를 바탕으로 상담을 이어가겠습니다.
                </p>
              </div>
            </div>
          </section>
        )}

        {diagnosis && !diagnosisIsEmpty && (
          <section className="bg-white p-6 md:p-7 rounded-2xl border border-gray-200/80 shadow-xs space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <span className="text-base">🔬</span>
              <h2 className="text-base font-extrabold text-gray-950">AI 정밀 진단 리포트</h2>
            </div>

            {diagnosis.headline_comment && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-brand-50/70 to-blue-50/40 border border-brand-100/80">
                <p className="text-xs md:text-sm font-semibold text-gray-800 leading-relaxed">
                  {diagnosis.headline_comment}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: "강점 (Strengths)", items: diagnosis.strengths, dot: "bg-emerald-500", box: "bg-emerald-50/50 border-emerald-200/70" },
                { label: "약점 (Weaknesses)", items: diagnosis.weaknesses, dot: "bg-red-500", box: "bg-red-50/40 border-red-200/70" },
                { label: "기회 (Opportunities)", items: diagnosis.opportunities, dot: "bg-brand-500", box: "bg-blue-50/50 border-blue-200/70" },
                { label: "반복되는 패턴 (Threats)", items: diagnosis.threats, dot: "bg-amber-500", box: "bg-amber-50/50 border-amber-200/70" },
              ].map((group) => (
                <div className={`p-4 rounded-xl border space-y-2 ${group.box}`} key={group.label}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${group.dot}`} />
                    <strong className="text-xs font-extrabold text-gray-900">{group.label}</strong>
                  </div>
                  {group.items.length ? (
                    <ul className="space-y-1.5">
                      {group.items.map((item) => (
                        <li className="text-xs text-gray-600 leading-relaxed" key={item}>· {item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-400">해당 항목이 없습니다.</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {session && (
          <section className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden flex flex-col h-[560px]">
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100 flex-none">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center text-xs flex-none">🤖</span>
                <div>
                  <strong className="block text-xs font-extrabold text-gray-950">AI 입시 컨설턴트 상담</strong>
                  <span className="block text-[11px] text-gray-400">대화를 마치면 이번 학기 목표와 탐구 주제가 정해집니다</span>
                </div>
              </div>
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex-none ${
                  ready ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80" : "bg-gray-100 text-gray-500"
                }`}
              >
                {ready ? "확정 준비 완료" : "상담 진행 중"}
              </span>
            </div>

            <ChatThread
              bottomRef={bottomRef}
              bubbles={bubbles}
              empty={
                isReview
                  ? "이번 학기가 어땠는지 편하게 이야기해주세요."
                  : "관심 분야나 앞으로의 방향에 대해 이야기해주세요."
              }
              intro={consultationIntro}
            />

            <ChatComposer
              disabled={streaming || !input.trim()}
              onChange={setInput}
              onSend={() => void send()}
              placeholder="메시지를 입력하세요"
              streaming={streaming}
              value={input}
            />

            <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/60 flex-none">
              <button
                className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xs shadow-xs transition"
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
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-gray-100 space-y-4">
              <h3 className="text-base font-extrabold text-gray-950">계획을 처음부터 다시 세울까요?</h3>
              <p className="text-xs text-gray-600 leading-relaxed">{replanProposal.rationale}</p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold transition"
                  type="button"
                  onClick={() => void respondToReplanProposal(false)}
                >
                  아니요, 지금 계획을 유지할게요
                </button>
                <button
                  className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition"
                  type="button"
                  onClick={() => void respondToReplanProposal(true)}
                >
                  네, 처음부터 다시 세워주세요
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </GateFrame>
  );
}
