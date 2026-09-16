"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api-client";
import {
  concludeConsultation,
  confirmFullReplan,
  createOrResumeConsultationSession,
  getConsultationMessages,
} from "../lib/workspace-adapter";
import { streamConsultationMessage, streamConsultationOpening, TOOL_LABELS } from "../lib/chat";
import type { ConsultationSession, ConsultationStatus } from "../lib/product-harness";
import { GateFrame } from "./gate-frame";
import { ChatComposer, ChatThread, type ChatBubble } from "./chat-thread";
import { MarkdownText } from "./markdown-text";
import { Icon } from "./icons";

type DiagnosisResult = {
  status: "processing" | "done" | "failed";
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  headline_comment: string | null;
};

type UserProfileBasics = {
  name: string;
  grade: number;
  semester: number;
  targetCareer: string;
  targetMajor: string;
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
  const [userProfile, setUserProfile] = useState<UserProfileBasics | null>(null);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [ready, setReady] = useState(false);
  const [replanProposal, setReplanProposal] = useState<{ rationale: string } | null>(null);
  const [concluding, setConcluding] = useState(false);
  const [error, setError] = useState("");
  const [showMiniSwot, setShowMiniSwot] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const sessionInitRef = useRef(false);
  const openingStartedRef = useRef(false);

  /**
   * 사용자가 한 번이라도 말을 건넸는지(대화 시작 여부).
   * 처음에는 진단 리포트를 함께 볼 수 있도록 컴팩트하게(560px) 두고,
   * 사용자가 한 번이라도 채팅을 시작하면 세로 폭을 충분히 늘려(820px) 대화 흐름을 편하게 읽을 수 있게 한다.
   */
  const hasUserChatted = bubbles.some((b) => b.role === "user");

  /**
   * 화면 모드:
   * - "report": 채팅 시작 전 기본 화면 (상세 진단 리포트 + 기본 챗봇 도입 상자)
   * - "chat_room": 채팅 시작 시 전환되는 1:1 컨설턴트 챗봇 전용 페이지 (preview-3200 4번 스타일)
   */
  const [viewMode, setViewMode] = useState<"report" | "chat_room">("report");

  // 프로필 기본 정보 조회 (학생 이름, 학년/학기, 지망 진로/학과)
  useEffect(() => {
    let cancelled = false;
    api<Record<string, unknown>>("/profile/me")
      .then((raw) => {
        if (cancelled || !raw) return;
        const careerGoal = (raw.career_goal ?? {}) as Record<string, unknown>;
        const rawName = (raw.name as string) || "";
        const rawGrade = typeof raw.grade === "number" ? raw.grade : 1;
        const rawSemester = typeof raw.semester === "number" ? raw.semester : 1;
        const rawGoal = (careerGoal.goal as string) || (raw.target_department as string) || "";
        const rawDept = (raw.target_department as string) || (careerGoal.goal as string) || "";

        setUserProfile({
          name: rawName || "학생",
          grade: rawGrade,
          semester: rawSemester,
          targetCareer: rawGoal || "컴퓨터공학 / HPC 시스템 아키텍트",
          targetMajor: rawDept || "컴퓨터공학부",
        });
      })
      .catch(() => {
        // 백엔드 프로필 실패 시 기본 fallback 유지
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  /**
   * 상담 세션의 첫 인사. 화면이 미리 적어 둔 고정 문구 대신, 실제 진단·학생
   * 데이터를 본 챗봇이 매번 직접 짓는다(스트리밍 말풍선 하나로 들어온다).
   */
  const startOpening = useCallback(async (sessionId: string) => {
    if (streaming || sendingRef.current) return;
    const pendingId = `opening-${Date.now()}`;
    setStreaming(true);
    setBubbles((prev) => {
      // 이미 첫 인사 어시스턴트 말풍선이 존재하면 중복 추가하지 않음
      const hasInitialOpening = prev.some((b) => b.role === "assistant" && !prev.some((ub) => ub.role === "user"));
      if (hasInitialOpening) return prev;
      return [
        ...prev,
        { id: pendingId, role: "assistant", content: "", actions: [], streaming: true },
      ];
    });
    try {
      await streamConsultationOpening(sessionId, {
        onToken: (delta) =>
          setBubbles((prev) =>
            prev.map((b) => (b.id === pendingId ? { ...b, content: b.content + delta } : b)),
          ),
        onDone: (payload) =>
          setBubbles((prev) =>
            prev.map((b) =>
              b.id === pendingId ? { ...b, id: payload.message_id ?? b.id, streaming: false } : b,
            ),
          ),
        onError: (payload) => {
          setError(`${payload.message} (${payload.error_code})`);
          setBubbles((prev) => prev.filter((b) => b.id !== pendingId));
        },
      });
    } finally {
      setStreaming(false);
    }
  }, [streaming]);

  useEffect(() => {
    if (!diagnosis || session || sessionInitRef.current) return;
    sessionInitRef.current = true;
    let cancelled = false;

    createOrResumeConsultationSession()
      .then(async (created) => {
        if (cancelled) return;
        setSession(created);
        setReady(created.ready);
        setPhase("ready");
        try {
          const history = await getConsultationMessages(created.id);
          if (cancelled) return;
          if (history.length > 0) {
            // 만약 학생의 첫 발화 이전에 어시스턴트 첫 인사가 2개 이상 들어와 있다면 (동시 호출 등으로 인한 중복)
            // 가장 마지막 첫 인사 1개만 남기도록 정제
            let cleanedHistory = history;
            const firstUserIdx = history.findIndex((m) => m.role === "user");
            if (firstUserIdx === -1) {
              if (history.length > 1) {
                cleanedHistory = [history[history.length - 1]];
              }
            } else {
              const preUser = history.slice(0, firstUserIdx);
              if (preUser.length > 1) {
                cleanedHistory = [preUser[preUser.length - 1], ...history.slice(firstUserIdx)];
              }
            }

            const mapped = cleanedHistory.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              actions: m.appliedActions ?? [],
            }));
            setBubbles(mapped);
            if (mapped.some((m) => m.role === "user")) {
              setViewMode("chat_room");
            }
          } else if (!openingStartedRef.current) {
            openingStartedRef.current = true;
            // 새로 만든 세션(재개가 아님) — 챗봇이 먼저 인사를 건넨다.
            await startOpening(created.id);
          }
        } catch (caught) {
          if (!cancelled) setError(caught instanceof Error ? caught.message : "지난 대화를 불러오지 못했습니다.");
        }
      })
      .catch((caught) => {
        sessionInitRef.current = false;
        if (!cancelled) setError(caught instanceof Error ? caught.message : "상담을 시작하지 못했습니다.");
      });

    return () => {
      cancelled = true;
    };
  }, [diagnosis, session, startOpening]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles, streaming]);

  useEffect(() => {
    if (hasUserChatted) {
      const timer = window.setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 320);
      return () => window.clearTimeout(timer);
    }
  }, [hasUserChatted, viewMode]);

  async function send(contentOverride?: string) {
    const content = (contentOverride !== undefined ? contentOverride : input).trim();
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

  const isReview = status.requiredKind === "semester_review";
  /** 진단이 근거로 삼을 기록이 아직 하나도 없는 상태인지. 배너 문구가 달라진다. */
  const diagnosisIsEmpty = Boolean(
    diagnosis &&
      !diagnosis.headline_comment &&
      diagnosis.strengths.length === 0 &&
      diagnosis.weaknesses.length === 0 &&
      diagnosis.opportunities.length === 0 &&
      diagnosis.threats.length === 0,
  );

  const studentName = userProfile?.name || "김민준";
  const targetGrade = userProfile?.grade ?? session?.targetGrade ?? 2;
  const targetSemester = userProfile?.semester ?? session?.targetSemester ?? 2;
  const targetCareer = userProfile?.targetCareer || "컴퓨터공학 / HPC 시스템 아키텍트";
  const targetMajor = userProfile?.targetMajor || "컴퓨터공학부";

  // 상담 진행 단계 동적 계산 (1~4단계)
  const userMessageCount = bubbles.filter((b) => b.role === "user").length;
  const consultationStep = ready ? 4 : userMessageCount >= 2 ? 3 : userMessageCount >= 1 ? 2 : 1;

  // 추천 답변 칩 목록 (단계 및 상태에 따른 가이드 제공)
  const quickReplies: string[] = ready
    ? ["✓ 제안해주신 로드맵과 목표대로 최종 확정할게요!"]
    : userMessageCount === 0
    ? [
        "이번 학기에 집중할 추천 탐구 방향을 알려주세요",
        "상위권 학종을 위해선 어떤 활동을 보강해야 할까요?",
        "교과 세특과 진로 연계는 어떻게 잡는 게 좋을까요?",
      ]
    : userMessageCount === 1
    ? [
        "제안해주신 방향이 좋습니다! 세부 탐구 주제도 추천해주세요",
        "학업 성적과 탐구 활동 비중을 어떻게 조율할까요?",
        "이 분야에서 평가관들이 가장 눈여겨보는 역량은 무엇인가요?",
      ]
    : [
        "제안해주신 목표로 이번 학기 로드맵을 확정하고 싶어요",
        "목표를 조금 더 수정하거나 보강하고 싶어요",
        "다른 교과목과의 연계 방안도 궁금해요",
      ];

  return (
    <GateFrame onSignOut={onSignOut} width="wide">
      <div className="space-y-6">
        {diagnosisError && <div className="banner banner-error">{diagnosisError}</div>}
        {error && <div className="banner banner-error">{error}</div>}

        {/* 1. 진단 대기 상태 (로딩 스피너/프로그레스) */}
        {phase === "diagnosing" && !diagnosisError && (
          <section className="bg-white p-8 rounded-2xl border border-gray-200/80 shadow-xs max-w-lg mx-auto text-center space-y-5">
            <span className="w-16 h-16 rounded-2xl bg-blue-50 text-brand-600 flex items-center justify-center mx-auto animate-pulse">
              <Icon name="zap" size={28} />
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

        {/* 2. 대화 시작 후 전용 페이지 (viewMode === "chat_room"): 3200 포트 4번 1:1 컨설턴트 챗봇 UI */}
        {phase === "ready" && viewMode === "chat_room" && (
          <div className="max-w-6xl mx-auto space-y-6 pb-12">
            {/* Top Status & Scenario Navigation Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 px-6 rounded-2xl border border-gray-200/80 shadow-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setViewMode("report")}
                  className="text-xs text-gray-500 hover:text-gray-900 font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Icon name="chevron-left" size={14} />
                  <span>진단 리포트 보기</span>
                </button>
                <span className="text-gray-300">|</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-brand-600 text-xs font-bold border border-blue-200/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                  {isReview
                    ? "학기말 정기 재평가 ➔ 다음 학기 목표 조율 & 심화 탐구 도출"
                    : "최초 진단 ➔ 3개년 마스터 플랜 1:1 심층 상담"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
                    ready
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-blue-50 text-brand-700 border-blue-200"
                  }`}
                >
                  {ready ? "상담 확정 준비 완료 ✓" : "실시간 상호 대화 중"}
                </span>
              </div>
            </div>

            {/* Split Consultation Layout (4 Cols / 8 Cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column (4 Cols): Student Profile & Context Dashboard */}
              <div className="lg:col-span-4 space-y-4">
                {/* 1. Profile Card */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-brand-600 to-sky-400 text-white font-bold flex items-center justify-center shadow-xs text-sm flex-none">
                      {studentName.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-gray-900 text-sm truncate">{studentName} 학생</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-brand-600 flex-none">
                          {targetGrade}학년 {targetSemester}학기
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                        {targetCareer}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-3 space-y-2 text-xs">
                    <div className="flex justify-between text-gray-600">
                      <span>진단 구분:</span>
                      <strong className="text-gray-900 font-bold">
                        {isReview ? "학기말 정기 재평가" : "최초 정밀 진단"}
                      </strong>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>목표 전공:</span>
                      <strong className="text-brand-600 font-bold truncate max-w-[170px] text-right">
                        {targetMajor}
                      </strong>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>진행 상태:</span>
                      <strong className={ready ? "text-emerald-600 font-bold" : "text-brand-600 font-bold"}>
                        {ready ? "목표 확정 완료 ✓" : "상호 의견 조율 중"}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* 2. 4-Step Consultation Progress Steps Tracker */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900">상담 진행 단계</span>
                    <span className="text-[10px] text-gray-400">4단계 프로세스</span>
                  </div>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center flex-none">
                          ✓
                        </span>
                        1단계: 학생부 진단 & 관심사 경청
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600">완료</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 flex items-center gap-2">
                        <span
                          className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center flex-none ${
                            consultationStep >= 2 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          {consultationStep >= 2 ? "✓" : "2"}
                        </span>
                        2단계: 3개년 학술 서사 맥락 협의
                      </span>
                      <span
                        className={`text-[10px] font-bold ${
                          consultationStep >= 2 ? "text-emerald-600" : "text-brand-600"
                        }`}
                      >
                        {consultationStep >= 2 ? "완료" : "진행 중"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 flex items-center gap-2">
                        <span
                          className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center flex-none ${
                            ready
                              ? "bg-emerald-100 text-emerald-700"
                              : consultationStep >= 3
                              ? "bg-blue-100 text-brand-700"
                              : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          {ready ? "✓" : "3"}
                        </span>
                        3단계: 현재 학기 3대 목표 조율
                      </span>
                      <span
                        className={`text-[10px] font-bold ${
                          ready ? "text-emerald-600" : consultationStep >= 3 ? "text-brand-600" : "text-gray-400"
                        }`}
                      >
                        {ready ? "확정" : consultationStep >= 3 ? "조율 중" : "대기"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 flex items-center gap-2">
                        <span
                          className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center flex-none ${
                            ready ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          {ready ? "✓" : "4"}
                        </span>
                        4단계: 10대 세특 심화 주제 확정
                      </span>
                      <span className={`text-[10px] font-bold ${ready ? "text-emerald-600" : "text-gray-400"}`}>
                        {ready ? "도출 완료" : "대기"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Mini-SWOT Quick Viewer Drawer */}
                {diagnosis && !diagnosisIsEmpty && (
                  <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs space-y-2.5">
                    <button
                      type="button"
                      onClick={() => setShowMiniSwot(!showMiniSwot)}
                      className="w-full flex items-center justify-between text-xs font-bold text-gray-800 hover:text-brand-600 transition cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <Icon className="text-brand-600" name="microscope" size={14} />
                        <span>진단 SWOT 요약 확인</span>
                      </span>
                      <span className="text-[10px] text-gray-400 font-semibold">
                        {showMiniSwot ? "접기 ▲" : "펼치기 ▼"}
                      </span>
                    </button>

                    {showMiniSwot && (
                      <div className="pt-2 border-t border-gray-100 space-y-2.5 text-xs">
                        {diagnosis.headline_comment && (
                          <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-100 text-[11px] font-medium text-gray-700 leading-relaxed">
                            {diagnosis.headline_comment}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-100">
                            <span className="font-bold text-emerald-800 block mb-1">강점</span>
                            <span className="text-gray-600">{diagnosis.strengths[0] || "균형 있는 성취"}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-red-50/50 border border-red-100">
                            <span className="font-bold text-red-800 block mb-1">약점/보완</span>
                            <span className="text-gray-600">{diagnosis.weaknesses[0] || "심화 탐구 확장"}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column (8 Cols): High-End Consultation Messenger Console */}
              <div className="lg:col-span-8 flex flex-col bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden h-[740px] md:h-[820px]">
                {/* Messenger Header */}
                <div className="p-4 px-5 border-b border-gray-200/80 bg-white flex items-center justify-between flex-none">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-gray-900 to-gray-700 text-white flex items-center justify-center text-lg font-bold shadow-xs flex-none">
                      🎓
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm text-gray-900">세특연구소 전담 수석 컨설턴트 AI</strong>
                        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-bold border border-emerald-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          실시간 1:1 상담 중
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500">서울대·카이스트 등 상위권 공학계열 학종 로드맵 전담</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setViewMode("report")}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Icon name="file" size={13} />
                    <span>진단 리포트</span>
                  </button>
                </div>

                {/* Scrollable Chat Feed */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#F8F9FA]/50">
                  {bubbles.map((msg) => {
                    if (msg.role === "user") {
                      return (
                        <div className="flex justify-end items-start gap-2.5" key={msg.id}>
                          <div className="flex flex-col items-end max-w-[82%]">
                            <div className="flex items-center gap-1.5 mb-1 text-[11px] text-gray-400 font-medium">
                              <span className="font-semibold text-gray-700">{studentName} 학생</span>
                            </div>
                            <div className="bg-brand-500 text-white p-3.5 px-4 rounded-2xl rounded-tr-sm text-xs leading-relaxed shadow-xs font-medium whitespace-pre-wrap break-keep">
                              {msg.content}
                            </div>
                          </div>
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-600 to-sky-400 text-white flex items-center justify-center font-bold text-[11px] flex-none mt-1 shadow-xs">
                            {studentName.slice(0, 2)}
                          </div>
                        </div>
                      );
                    }

                    // Assistant Message
                    return (
                      <div className="flex items-start gap-2.5" key={msg.id}>
                        <div className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center font-bold text-xs flex-none mt-1 shadow-xs">
                          🎓
                        </div>
                        <div className="flex flex-col items-start max-w-[88%] space-y-2.5">
                          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-medium">
                            <span className="font-bold text-gray-900">세특연구소 수석 컨설턴트 AI</span>
                          </div>
                          <div className="bg-white border border-gray-200/90 p-4 rounded-2xl rounded-tl-sm text-xs text-gray-800 shadow-xs leading-relaxed space-y-2.5 break-keep">
                            {msg.content ? (
                              <MarkdownText text={msg.content} />
                            ) : (
                              <em className="text-gray-400 not-italic">답변을 작성하는 중입니다…</em>
                            )}
                          </div>

                          {/* Tool action badges */}
                          {msg.actions.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {msg.actions.map((action, idx) => {
                                const failed = Boolean(action.result && "error" in action.result);
                                return (
                                  <span
                                    key={idx}
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                      failed
                                        ? "bg-red-50 text-red-700 border-red-200/80"
                                        : "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                                    }`}
                                  >
                                    {failed ? "✕" : "✓"} {TOOL_LABELS[action.tool] ?? action.tool}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Confirmed / Ready Card embedded in chat when ready */}
                  {ready && (
                    <div className="w-full bg-white p-5 rounded-2xl border-2 border-emerald-500 shadow-md space-y-3.5">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center">
                            ✓
                          </span>
                          <h3 className="text-xs font-extrabold text-gray-900">
                            {targetGrade}학년 {targetSemester}학기 핵심 목표 최종 조율 완료
                          </h3>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                          계획 확정 준비 완료
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        컨설턴트와의 대화를 통해 이번 학기 학술 로드맵 목표와 방향성이 정돈되었습니다.
                        아래 버튼을 눌러 계획을 확정하고 본격적인 활동을 시작해 보세요!
                      </p>
                      <button
                        type="button"
                        disabled={concluding}
                        onClick={() => void handleConclude()}
                        className="w-full py-3.5 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xs transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>{concluding ? "확정하는 중…" : "계획 확정 및 대시보드로 이동"}</span>
                        <span>➔</span>
                      </button>
                    </div>
                  )}

                  {/* AI Typing Indicator */}
                  {streaming && (
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center font-bold text-xs flex-none mt-1 shadow-xs">
                        🎓
                      </div>
                      <div className="flex flex-col items-start space-y-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-medium">
                          <span className="font-bold text-gray-900">세특연구소 수석 컨설턴트 AI</span>
                        </div>
                        <div className="bg-white border border-gray-200/90 p-3.5 px-4 rounded-2xl rounded-tl-sm shadow-xs flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-brand-500 animate-bounce" />
                            <span className="w-2 h-2 rounded-full bg-brand-500 animate-bounce [animation-delay:150ms]" />
                            <span className="w-2 h-2 rounded-full bg-brand-500 animate-bounce [animation-delay:300ms]" />
                          </div>
                          <span className="text-xs text-gray-500 font-medium ml-1">
                            학생부 분석 데이터를 바탕으로 답변을 작성 중입니다...
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={bottomRef} />
                </div>

                {/* Quick Replies Interactive Chips */}
                {!ready && !streaming && quickReplies.length > 0 && (
                  <div className="px-5 py-2.5 bg-white border-t border-gray-100 flex flex-wrap gap-2 items-center flex-none">
                    <span className="text-[11px] text-gray-400 font-semibold flex items-center gap-1 flex-none mr-1">
                      <span>💡</span> 추천 답변:
                    </span>
                    {quickReplies.map((replyText, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => void send(replyText)}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50/70 hover:bg-blue-100 border border-blue-200/80 text-brand-700 transition shadow-2xs cursor-pointer flex items-center gap-1"
                      >
                        <span>💬</span>
                        <span>{replyText}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Bottom Interactive Text Input Bar */}
                <div className="p-3.5 px-5 bg-white border-t border-gray-200/80 flex items-center gap-2.5 flex-none">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder={
                      ready
                        ? "상담 및 목표 조율이 완료되었습니다. 위의 [대시보드로 이동] 버튼을 눌러주세요."
                        : "컨설턴트 AI에게 진로 희망이나 수정하고 싶은 목표를 자유롭게 말씀해 보세요..."
                    }
                    disabled={concluding || streaming}
                    className="flex-1 py-3 px-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 focus:outline-none transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={!input.trim() || streaming || concluding}
                    className="px-4 py-3 rounded-xl bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:cursor-not-allowed flex-none"
                  >
                    <span>전송</span>
                    <span className="text-[10px]">➤</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. 대화 시작 전 기본 화면 (viewMode === "report"): 정밀 진단 리포트 + 챗봇 도입 상자 */}
        {phase === "ready" && viewMode === "report" && (
          <div className="space-y-6">
            {/* 만약 이미 대화를 시작했다면 상단에 바로 복귀할 수 있는 칩/배너 표시 */}
            {hasUserChatted && (
              <div className="flex items-center justify-between p-3.5 px-5 bg-blue-50/90 border border-blue-200 rounded-2xl shadow-xs">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse" />
                  <span className="text-xs font-bold text-brand-800">
                    세특연구소 전담 수석 컨설턴트와의 1:1 상담이 진행 중입니다.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode("chat_room")}
                  className="px-3.5 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <span>큰 화면에서 보기</span>
                  <Icon name="chevron-right" size={13} />
                </button>
              </div>
            )}

            <header className="text-center max-w-3xl mx-auto space-y-3">
              <h1 className="text-2xl md:text-3xl font-extrabold text-gray-950 tracking-tight leading-snug">
                {isReview ? (
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

            {diagnosis && diagnosisIsEmpty && (
              <section className="bg-white p-6 md:p-7 rounded-2xl border border-gray-200/80 shadow-xs">
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center flex-none">
                    <Icon name="file" size={18} />
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
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <Icon className="text-brand-600" name="microscope" size={18} />
                    <h2 className="text-base font-extrabold text-gray-950">AI 정밀 진단 리포트</h2>
                  </div>
                  {hasUserChatted && (
                    <button
                      type="button"
                      onClick={() => setViewMode("chat_room")}
                      className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                    >
                      <span>큰 화면에서 보기</span>
                      <Icon name="chevron-right" size={13} />
                    </button>
                  )}
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
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-gray-900 to-gray-700 text-white flex items-center justify-center text-sm font-bold shadow-xs flex-none">
                      🎓
                    </span>
                    <div>
                      <strong className="block text-xs font-extrabold text-gray-950">AI 입시 컨설턴트 1:1 심층 상담</strong>
                      <span className="block text-[11px] text-gray-400">
                        학생부 기반의 실시간 맞춤 상담을 진행합니다
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewMode("chat_room")}
                    className="px-3 py-1 rounded-full bg-blue-50 hover:bg-blue-100 border border-blue-200/80 text-brand-700 font-bold text-xs transition flex items-center gap-1 cursor-pointer"
                  >
                    <span>큰 화면에서 보기</span>
                    <Icon name="chevron-right" size={13} />
                  </button>
                </div>

                <ChatThread
                  bottomRef={bottomRef}
                  bubbles={bubbles}
                  empty={
                    isReview
                      ? "이번 학기가 어땠는지 편하게 이야기해주세요."
                      : "관심 분야나 앞으로의 방향에 대해 이야기해주세요."
                  }
                />

                {/* 추천 시작 질문 칩 */}
                {!streaming && quickReplies.length > 0 && (
                  <div className="px-5 py-2.5 bg-white border-t border-gray-100 flex flex-wrap gap-2 items-center flex-none">
                    <span className="text-[11px] text-gray-400 font-semibold flex items-center gap-1 flex-none mr-1">
                      <span>💡</span> 추천 답변:
                    </span>
                    {quickReplies.map((replyText, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => void send(replyText)}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50/70 hover:bg-blue-100 border border-blue-200/80 text-brand-700 transition shadow-2xs cursor-pointer flex items-center gap-1"
                      >
                        <span>💬</span>
                        <span>{replyText}</span>
                      </button>
                    ))}
                  </div>
                )}

                <ChatComposer
                  disabled={streaming}
                  onChange={setInput}
                  onSend={() => void send()}
                  placeholder="메시지를 입력하면 1:1 컨설턴트 전용 상담 화면으로 연결됩니다..."
                  streaming={streaming}
                  value={input}
                />

                {ready && (
                  <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/60 flex-none">
                    <button
                      className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xs shadow-xs transition"
                      type="button"
                      disabled={concluding}
                      onClick={() => void handleConclude()}
                    >
                      {concluding ? "확정하는 중…" : "상담 마치고 메인 화면으로 →"}
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* 4. 전체 재설계 동의 확인 모달 */}
        {replanProposal && (
          <div className="modal-overlay">
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-gray-100 space-y-4">
              <h3 className="text-base font-extrabold text-gray-950">계획을 처음부터 다시 세울까요?</h3>
              <p className="text-xs text-gray-600 leading-relaxed">{replanProposal.rationale}</p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold transition cursor-pointer"
                  type="button"
                  onClick={() => void respondToReplanProposal(false)}
                >
                  아니요, 지금 계획을 유지할게요
                </button>
                <button
                  className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition cursor-pointer"
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
