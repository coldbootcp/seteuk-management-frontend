"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api-client";
import {
  concludeConsultation,
  confirmConsultationFlow,
  confirmFullReplan,
  createOrResumeConsultationSession,
  getConsultationMessages,
  toConsultationFlow,
  toConsultationSemesterGoal,
} from "../lib/workspace-adapter";
import {
  streamConsultationMessage,
  streamConsultationOpening,
  TOOL_LABELS,
  type ConsultationSignal,
} from "../lib/chat";
import type {
  ConsultationFlow,
  ConsultationSemesterGoal,
  ConsultationSession,
  ConsultationStage,
  ConsultationStatus,
} from "../lib/product-harness";
import { GateFrame } from "./gate-frame";
import { CurrentCoursePicker } from "./course-picker";
import { getCurrentCourses, type CurrentCourses } from "../lib/subjects-api";
import { JumpToBottomButton, type ChatBubble } from "./chat-thread";
import { useChatScroll } from "../lib/use-chat-scroll";
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
 * (4) 챗봇이 종료 신호를 보내면 [상담 마치고 메인 화면으로] 버튼이 켜짐 → (5) 학생이 눌러야 확정.
 *
 * 상담 대화 자체는 큰 그림에서 작은 그림으로 좁혀 간다: 3개년 흐름 → 이번 학기 목표 →
 * 구체 탐구 주제 → 마무리. 어느 단계인지(stage)는 서버가 세션에 저장된 사실로 계산해
 * 매 턴 signal 이벤트로 알려 주고, 화면은 그 값만 따른다. 3개년 흐름은 챗봇이 초안을
 * 올리면 흐름 카드가 뜨고, 학생이 카드의 확정 버튼을 눌러야 다음 단계로 넘어간다.
 */

/** 서버 stage를 진행 트래커의 순서(0~3)로. 졸업생 상담은 트래커를 쓰지 않는다. */
const STAGE_ORDER: Record<ConsultationStage, number> = {
  flow: 0,
  semester_goal: 1,
  topics: 2,
  wrap_up: 3,
  graduate_fit: 0,
};

const STAGE_STEPS = [
  { label: "3개년 흐름 조율", hint: "3학년 말 도착점을 정하고, 거기로 가는 학기별 큰 방향을 잡아요" },
  { label: "이번 학기 목표", hint: "확정한 흐름 안에서 이번 학기에 할 일을 정해요" },
  { label: "구체 탐구 주제", hint: "목표에서 나온 주제를 2~3개씩 좁혀 골라요" },
  { label: "초안 확인·확정", hint: "정리된 초안을 확인하고 상담을 마쳐요" },
];

const FLOW_CONFIRM_MESSAGE = "3개년 흐름은 이대로 확정할게요. 이제 이번 학기 목표를 정해 볼까요?";
const FLOW_REVISE_PREFILL = "3개년 흐름에서 바꾸고 싶은 부분이 있어요: ";
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
  // 상담 진행 단계와 3개년 흐름·이번 학기 목표. 세션 조회와 매 턴 signal로 갱신된다.
  const [stage, setStage] = useState<ConsultationStage>("flow");
  const [flow, setFlow] = useState<ConsultationFlow | null>(null);
  const [flowConfirmed, setFlowConfirmed] = useState(false);
  const [semesterGoal, setSemesterGoal] = useState<ConsultationSemesterGoal | null>(null);
  const [flowSubmitting, setFlowSubmitting] = useState(false);
  // 이번 학기 수강 과목 — 상담이 이번 학기 주제를 과목과 연결하는 근거. 온보딩에서
  // 건너뛰었거나 바뀌었으면 여기서 등록한다(챗봇은 매 턴 최신 과목을 다시 읽는다).
  const [currentCourses, setCurrentCourses] = useState<CurrentCourses | null>(null);
  const [coursePickerOpen, setCoursePickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [concluding, setConcluding] = useState(false);
  const [error, setError] = useState("");
  // 추천 답변은 더 이상 고정 문구가 아니다. 챗봇의 마지막 말에 맞춰 백엔드가 매 턴
  // 3개를 만들어 SSE done 이벤트로 실어 보내며, 여기에 담긴다.
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const sendingRef = useRef(false);
  const sessionInitRef = useRef(false);
  const openingStartedRef = useRef(false);
  const diagnosisInitRef = useRef(false);

  useEffect(() => {
    if (status.requiredKind === "graduate_fit") return;
    let cancelled = false;
    getCurrentCourses()
      .then((courses) => {
        if (!cancelled) setCurrentCourses(courses);
      })
      .catch(() => {
        // 과목을 못 불러와도 상담은 이어진다 — 카드만 빈 상태로 보인다.
      });
    return () => {
      cancelled = true;
    };
  }, [status.requiredKind]);

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

  /** 세션 응답(생성·재개·확정 버튼)의 진행 상태를 화면에 반영한다. */
  const applySessionProgress = useCallback((next: ConsultationSession) => {
    setStage(next.stage);
    setFlow(next.flow);
    setFlowConfirmed(next.flowConfirmed);
    setSemesterGoal(next.semesterGoal);
  }, []);

  /** 상담 턴 끝 signal 이벤트의 진행 상태를 화면에 반영한다. */
  function applySignal(payload: ConsultationSignal) {
    setReady(Boolean(payload.ready));
    if (payload.stage) setStage(payload.stage as ConsultationStage);
    if ("flow" in payload) setFlow(toConsultationFlow(payload.flow));
    if ("flow_confirmed" in payload) setFlowConfirmed(Boolean(payload.flow_confirmed));
    if ("semester_goal" in payload) setSemesterGoal(toConsultationSemesterGoal(payload.semester_goal));
  }

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
    // React StrictMode(dev)에서 이펙트가 두 번 돌면 진단이 중복 생성되고 폴링이
    // 꼬여 화면이 "진단 중"에 갇힌다. ref로 한 번만 실행되게 막는다.
    if (diagnosisInitRef.current) return;
    diagnosisInitRef.current = true;
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
    if (sendingRef.current) return;
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
        onDone: (payload) => {
          setBubbles((prev) =>
            prev.map((b) =>
              b.id === pendingId ? { ...b, id: payload.message_id ?? b.id, streaming: false } : b,
            ),
          );
          setQuickReplies(payload.suggested_replies ?? []);
        },
        onError: (payload) => {
          setError(`${payload.message} (${payload.error_code})`);
          setBubbles((prev) => prev.filter((b) => b.id !== pendingId));
        },
      });
    } finally {
      setStreaming(false);
    }
  }, []);

  useEffect(() => {
    // session은 일부러 의존성/가드에 넣지 않는다 — 아래에서 만든 세션을
    // setSession으로 반영하는 순간(그 직후 await 지점) 이 effect가 session
    // 의존성 때문에 스스로 정리(cleanup)되면서 그 클로저의 cancelled를
    // true로 바꿔, 아직 진행 중이던 같은 흐름의 나머지(첫 인사 시작)가
    // "취소된 것"처럼 조용히 건너뛰어지는 문제가 있었다. 재실행 방지는
    // sessionInitRef 하나로 충분하다.
    if (!diagnosis || sessionInitRef.current) return;
    sessionInitRef.current = true;
    let cancelled = false;

    createOrResumeConsultationSession()
      .then(async (created) => {
        if (cancelled) return;
        setSession(created);
        setReady(created.ready);
        applySessionProgress(created);
        setPhase("ready");
        try {
          const history = await getConsultationMessages(created.id);
          // cancelled(StrictMode의 이펙트 cleanup)여도 여기서 그냥 return하면,
          // 재실행은 sessionInitRef 가드에 막혀 첫 인사를 아무도 못 부른다.
          // 그래서 cancelled여도 아래 로직은 진행하되, 중복은 openingStartedRef와
          // setBubbles의 멱등 처리로 막는다.
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
  }, [diagnosis, startOpening, applySessionProgress]);

  const { feedRef, spacerRef, onScroll, showJump, jumpToBottom, pinNextUserMessage } = useChatScroll(bubbles);

  async function send(contentOverride?: string) {
    const content = (contentOverride !== undefined ? contentOverride : input).trim();
    if (!content || streaming || sendingRef.current || !session) return;
    sendingRef.current = true;

    try {
      setInput("");
      setError("");
      setStreaming(true);
      // 방금 보낸 답변에 딸려 있던 칩은 더 이상 맥락에 맞지 않으니 즉시 비운다.
      // 새 추천은 이번 턴의 done 이벤트로 다시 채운다.
      setQuickReplies([]);
      const pendingId = `pending-${Date.now()}`;
      pinNextUserMessage();
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
        onDone: (payload) => {
          setBubbles((prev) =>
            prev.map((b) =>
              b.id === pendingId
                ? { ...b, id: payload.message_id, streaming: false, actions: payload.applied_actions ?? b.actions }
                : b,
            ),
          );
          setQuickReplies(payload.suggested_replies ?? []);
        },
        onError: (payload) => {
          setError(`${payload.message} (${payload.error_code})`);
          setBubbles((prev) => prev.map((b) => (b.id === pendingId ? { ...b, streaming: false } : b)));
        },
        onSignal: applySignal,
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

  /**
   * 3개년 흐름 카드의 버튼. 확정하면 서버가 이번 학기 목표 단계로 넘기고, 챗봇이 이어서
   * 말하도록 확정했다는 메시지를 대신 보낸다. "다시 조율"은 입력창에 운을 띄워 준다.
   */
  async function respondToFlow(confirmed: boolean) {
    if (!session || flowSubmitting || streaming) return;
    setFlowSubmitting(true);
    setError("");
    try {
      if (confirmed || flowConfirmed) {
        const updated = await confirmConsultationFlow(session.id, confirmed);
        setSession(updated);
        applySessionProgress(updated);
        setReady(updated.ready);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "흐름 확정을 저장하지 못했습니다.");
      return;
    } finally {
      setFlowSubmitting(false);
    }
    if (confirmed) {
      await send(FLOW_CONFIRM_MESSAGE);
    } else {
      setInput(FLOW_REVISE_PREFILL);
      inputRef.current?.focus();
    }
  }

  async function respondToReplanProposal(confirmed: boolean) {
    if (!session) return;
    try {
      const updated = await confirmFullReplan(session.id, confirmed);
      setSession(updated);
      applySessionProgress(updated);
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

  const userMessageCount = bubbles.filter((b) => b.role === "user").length;
  // 진행 단계는 메시지 수로 추측하지 않고 서버가 계산한 stage를 그대로 쓴다.
  const stageIndex = ready ? STAGE_STEPS.length : STAGE_ORDER[stage] ?? 0;

  // 졸업생(수시 재수생)은 생기부가 이미 확정되어 로드맵을 세우지 않는다. 확정된
  // 기록과 목표 학과의 적합성·지원 전략만 상담하므로 문구와 마무리 흐름이 다르다.
  const isGraduate = status.requiredKind === "graduate_fit";
  // 졸업생 상담은 로드맵 확정 신호(ready)가 없어 버튼을 열어 두지만, 대화를 한
  // 마디도 안 하고 통과하는 것은 막는다 — 학생이 최소 2번은 말을 걸어야 마칠 수 있게
  // 한다(백엔드 conclude의 GRADUATE_FIT_MIN_USER_MESSAGES와 같은 기준).
  const graduateMinMessages = 2;
  const graduateCanConclude = isGraduate && userMessageCount >= graduateMinMessages;
  const canConclude = isGraduate ? graduateCanConclude : ready;
  // 3학년 2학기는 새 탐구 계획을 세우는 시기가 아니라 수시 원서·마무리 시기다.
  // 신입생·저학년과 같은 "정밀 진단으로 계획을 세운다" 문구를 그대로 쓰면 시점에
  // 맞지 않아, 이 학기에는 게이트 문구를 따로 둔다.
  const isFinalSemester = status.targetGrade === 3 && status.targetSemester === 2;

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
                "학기별 성적·활동 리뷰 생성",
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

        {/* 대화 화면: 좌측에 진행단계·간단 프로필 위젯, 우측에 1:1 컨설턴트 챗봇 콘솔.
            예전에 별도 모드로 나뉘던 리포트/챗룸을 하나의 레이아웃으로 합쳤다. */}
        {phase === "ready" && (
          <div className="max-w-6xl mx-auto space-y-6 pb-12">
            {/* 상단 시나리오 배너 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 px-6 rounded-2xl border border-gray-200/80 shadow-xs">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-brand-600 text-xs font-bold border border-blue-200/60">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                {isGraduate
                  ? "확정된 생기부 ➔ 목표 학과 적합성 & 지원 전략 상담"
                  : isFinalSemester
                  ? "3학년 2학기 점검 ➔ 남은 기록 정리 & 수시 지원 준비"
                  : isReview
                  ? "학기말 정기 재평가 ➔ 다음 학기 목표 조율 & 심화 탐구 도출"
                  : "최초 진단 ➔ 3개년 마스터 플랜 1:1 심층 상담"}
              </span>
              <span
                className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
                  ready
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-blue-50 text-brand-700 border-blue-200"
                }`}
              >
                {!isGraduate && ready ? "상담 확정 준비 완료 ✓" : "실시간 상호 대화 중"}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* 좌측: 학생 프로필 & 진행 단계 & 진단 요약 */}
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
                      <span className="text-xs text-gray-500 line-clamp-1 mt-0.5">{targetCareer}</span>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-3 space-y-2 text-xs">
                    <div className="flex justify-between text-gray-600">
                      <span>진단 구분:</span>
                      <strong className="text-gray-900 font-bold">
                        {isGraduate ? "지원 전략 상담" : isReview ? "학기말 정기 재평가" : "최초 정밀 진단"}
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
                      <strong className={canConclude ? "text-emerald-600 font-bold" : "text-brand-600 font-bold"}>
                        {isGraduate
                          ? graduateCanConclude
                            ? "마무리 가능"
                            : "상담 진행 중"
                          : ready
                          ? "초안 확정 준비 완료 ✓"
                          : STAGE_STEPS[STAGE_ORDER[stage] ?? 0].label}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* 2. 4단계 진행 트래커 — 서버가 계산한 stage를 따른다. 졸업생 상담에는 숨긴다. */}
                {!isGraduate && (
                  <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-900">상담 진행 단계</span>
                      <span className="text-[10px] text-gray-400">큰 그림 → 이번 학기 → 주제</span>
                    </div>
                    <ol className="space-y-2.5 text-xs">
                      {STAGE_STEPS.map((step, index) => {
                        const done = index < stageIndex;
                        const current = index === stageIndex;
                        return (
                          <li className="flex items-start justify-between gap-2" key={step.label}>
                            <span className="text-gray-600 flex items-start gap-2 min-w-0">
                              <span
                                className={`w-4 h-4 mt-0.5 rounded-full text-[10px] font-bold flex items-center justify-center flex-none ${
                                  done
                                    ? "bg-emerald-100 text-emerald-700"
                                    : current
                                    ? "bg-blue-100 text-brand-700"
                                    : "bg-gray-100 text-gray-400"
                                }`}
                              >
                                {done ? "✓" : index + 1}
                              </span>
                              <span className="min-w-0">
                                <span className={current ? "font-bold text-gray-900" : undefined}>
                                  {step.label}
                                  {index === 0 && isReview && !flow ? " (기존 흐름 유지)" : ""}
                                </span>
                                {current && (
                                  <span className="block text-[10px] text-gray-400 leading-snug mt-0.5">
                                    {step.hint}
                                  </span>
                                )}
                              </span>
                            </span>
                            <span
                              className={`text-[10px] font-bold flex-none ${
                                done ? "text-emerald-600" : current ? "text-brand-600" : "text-gray-400"
                              }`}
                            >
                              {done ? "완료" : current ? "진행 중" : "대기"}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}

                {/* 2-0. 이번 학기 수강 과목 — 이번 학기 목표·주제를 과목과 연결하는 근거. */}
                {!isGraduate && (
                  <div
                    className={`bg-white p-5 rounded-2xl border shadow-xs space-y-3 ${
                      currentCourses && currentCourses.courses.length === 0
                        ? "border-amber-300"
                        : "border-gray-200/80"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-gray-900">이번 학기 수강 과목</span>
                      <button
                        className="text-[11px] font-bold text-brand-600 hover:text-brand-700 transition cursor-pointer"
                        onClick={() => setCoursePickerOpen(true)}
                        type="button"
                      >
                        {currentCourses && currentCourses.courses.length > 0 ? "수정" : "과목 등록"}
                      </button>
                    </div>
                    {currentCourses && currentCourses.courses.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {currentCourses.courses.map((course) => (
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                              course.is_custom
                                ? "bg-amber-50 border-amber-200 text-amber-900"
                                : "bg-gray-50 border-gray-200 text-gray-700"
                            }`}
                            key={course.id}
                          >
                            {course.subject}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        아직 등록된 과목이 없어요. 과목을 등록하면 이번 학기 목표와 탐구 주제를 실제로 듣는 과목과
                        연결해 추천해 드려요.
                      </p>
                    )}
                  </div>
                )}

                {/* 2-1. 확정한 3개년 흐름과 이번 학기 목표 — 이후 대화의 기준이 된다. */}
                {!isGraduate && flow && flowConfirmed && (
                  <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-xs space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-gray-900">확정한 3개년 흐름</span>
                      <button
                        className="text-[10px] font-bold text-gray-400 hover:text-brand-600 transition cursor-pointer disabled:cursor-not-allowed"
                        disabled={flowSubmitting || streaming || concluding}
                        onClick={() => void respondToFlow(false)}
                        type="button"
                      >
                        흐름 다시 조율
                      </button>
                    </div>
                    {flow.destination && (
                      <p className="text-[11px] font-bold text-gray-900 leading-relaxed">도착점 · {flow.destination}</p>
                    )}
                    {flow.focus && <p className="text-[11px] text-gray-600 leading-relaxed">{flow.focus}</p>}
                    <ol className="space-y-1.5 text-[11px]">
                      {flow.nodes.map((node) => {
                        const isCurrent = node.grade === targetGrade && node.semester === targetSemester;
                        return (
                          <li
                            className={`flex gap-2 ${isCurrent ? "font-bold text-gray-900" : "text-gray-600"}`}
                            key={`${node.grade}-${node.semester}`}
                          >
                            <span className="flex-none w-14 text-gray-400 font-semibold">
                              {node.grade}-{node.semester}
                              {isCurrent ? " ●" : ""}
                            </span>
                            <span className="min-w-0">{node.title}</span>
                          </li>
                        );
                      })}
                    </ol>
                    {semesterGoal && (
                      <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-100 space-y-0.5">
                        <span className="block text-[10px] font-bold text-brand-700">이번 학기 목표</span>
                        <span className="block text-[11px] font-bold text-gray-900">{semesterGoal.title}</span>
                        <span className="block text-[11px] text-gray-600 leading-relaxed">{semesterGoal.objective}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. 기록이 없어 진단을 만들지 못한 경우 안내 */}
                {diagnosis && diagnosisIsEmpty && (
                  <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs space-y-1.5">
                    <h3 className="text-xs font-extrabold text-gray-900">과거 기록 기반 진단은 아직 없어요</h3>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      학생부·활동·성적 기록이 없으면 강점·약점을 사실처럼 판단할 수 없어요. 입력한 진로와 관심사를
                      바탕으로 상담을 이어갑니다.
                    </p>
                  </div>
                )}
              </div>

              {/* 우측: 1:1 컨설턴트 챗봇 콘솔 */}
              <div className="lg:col-span-8 flex flex-col bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden h-[740px] md:h-[820px]">
                {/* 헤더 */}
                <div className="p-4 px-5 border-b border-gray-200/80 bg-white flex items-center gap-3 flex-none">
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

                {/* 대화 피드 */}
                <div className="relative flex-1 min-h-0 flex flex-col">
                  <div
                    className="relative flex-1 min-h-0 overflow-y-auto p-5 space-y-4 bg-[#F8F9FA]/50"
                    onScroll={onScroll}
                    ref={feedRef}
                  >
                    {bubbles.map((msg) => {
                      if (msg.role === "user") {
                        return (
                          <div className="flex justify-end items-start gap-2.5" data-chat-role="user" key={msg.id}>
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

                            {(() => {
                              const visibleActions = msg.actions.filter((action) => {
                                if (action.result && "error" in action.result) return false;
                                if (
                                  action.tool === "propose_three_year_flow" ||
                                  action.tool === "set_semester_goal" ||
                                  action.tool === "propose_draft_plan" ||
                                  action.tool === "signal_ready_to_conclude" ||
                                  action.tool === "propose_full_replan_exception" ||
                                  action.tool === "remember"
                                ) {
                                  return false;
                                }
                                return true;
                              });

                              if (visibleActions.length === 0) return null;

                              return (
                                <div className="flex flex-wrap gap-1.5">
                                  {visibleActions.map((action, idx) => (
                                    <span
                                      key={idx}
                                      className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200/80"
                                    >
                                      ✓ {TOOL_LABELS[action.tool] ?? action.tool}
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}

                    {/* 3개년 흐름 카드 — 아직 확정 전일 때만 대화 맨 아래에 둔다. 학생이 이
                        카드의 버튼으로 확정해야 이번 학기 목표로 넘어간다. */}
                    {!isGraduate && flow && !flowConfirmed && (
                      <div className="w-full bg-white p-5 rounded-2xl border-2 border-brand-400 shadow-md space-y-3.5">
                        <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-3">
                          <h3 className="text-xs font-extrabold text-gray-900">3개년 흐름 초안</h3>
                          <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-brand-700 text-[10px] font-bold border border-blue-200">
                            확정 전
                          </span>
                        </div>
                        {flow.destination && (
                          <div className="p-3 rounded-xl bg-gray-900 text-white space-y-0.5">
                            <span className="block text-[10px] font-bold text-gray-300">3학년 말 도착점</span>
                            <span className="block text-xs font-bold leading-relaxed">{flow.destination}</span>
                          </div>
                        )}
                        {flow.focus && (
                          <p className="text-xs font-semibold text-gray-800 leading-relaxed">{flow.focus}</p>
                        )}
                        {flow.soFar && (
                          <p className="text-[11px] text-gray-500 leading-relaxed">
                            <span className="font-bold text-gray-600">지금까지 · </span>
                            {flow.soFar}
                          </p>
                        )}
                        <ol className="space-y-2">
                          {flow.nodes.map((node) => {
                            const isCurrent = node.grade === targetGrade && node.semester === targetSemester;
                            return (
                              <li
                                className={`p-3 rounded-xl border text-xs ${
                                  isCurrent ? "border-brand-300 bg-blue-50/50" : "border-gray-100 bg-gray-50/60"
                                }`}
                                key={`${node.grade}-${node.semester}`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] font-bold text-gray-500">
                                    {node.grade}학년 {node.semester}학기
                                  </span>
                                  {node.narrativeStage && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600">
                                      {node.narrativeStage}
                                    </span>
                                  )}
                                  {isCurrent && (
                                    <span className="text-[10px] font-bold text-brand-600">이번 학기</span>
                                  )}
                                </div>
                                <p className="font-bold text-gray-900">{node.title}</p>
                                <p className="text-[11px] text-gray-600 leading-relaxed mt-0.5">{node.objective}</p>
                              </li>
                            );
                          })}
                        </ol>
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          이 흐름을 확정하면, 그 안에서 이번 학기 목표와 탐구 주제를 이어서 정해요. 바꾸고 싶은
                          학기가 있으면 컨설턴트에게 말해 주세요.
                        </p>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={flowSubmitting || streaming || concluding}
                            onClick={() => void respondToFlow(false)}
                            type="button"
                          >
                            다시 조율할래요
                          </button>
                          <button
                            className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition cursor-pointer disabled:cursor-not-allowed disabled:bg-gray-300"
                            disabled={flowSubmitting || streaming || concluding}
                            onClick={() => void respondToFlow(true)}
                            type="button"
                          >
                            {flowSubmitting ? "확정하는 중…" : "이 흐름으로 확정"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 준비 완료 카드 */}
                    {!isGraduate && ready && (
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
                          컨설턴트와의 대화를 통해 이번 학기 학술 로드맵 목표와 방향성이 정돈되었습니다. 아래
                          [상담 마치고 메인 화면으로] 버튼을 눌러 계획을 확정하고 본격적인 활동을 시작해 보세요!
                        </p>
                      </div>
                    )}

                    {/* AI 타이핑 인디케이터 */}
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

                    <div aria-hidden ref={spacerRef} />
                  </div>
                  {showJump && <JumpToBottomButton onClick={jumpToBottom} />}
                </div>

                {/* 추천 답변 칩 (챗봇 마지막 말에 맞춰 동적으로 생성) */}
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

                {/* 입력 바 */}
                <div className="p-3.5 px-5 bg-white border-t border-gray-200/80 flex items-center gap-2.5 flex-none">
                  <input
                    ref={inputRef}
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
                        ? "상담 및 목표 조율이 완료되었습니다. 아래 [상담 마치고 메인 화면으로] 버튼을 눌러주세요."
                        : isGraduate
                        ? "목표 학과나 지원 전략에 대해 궁금한 점을 말씀해 보세요..."
                        : stage === "flow"
                        ? "3년 동안 어떤 방향으로 가고 싶은지, 흐름에서 바꾸고 싶은 점을 말씀해 보세요..."
                        : stage === "semester_goal"
                        ? "이번 학기 목표에 대한 생각을 말씀해 보세요..."
                        : "끌리는 탐구 주제나 바꾸고 싶은 점을 말씀해 보세요..."
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

                {/* 마무리 버튼: 처음부터 항상 보이되, 상담을 마칠 수 있을 때만 눌린다. */}
                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex-none space-y-2">
                  <button
                    type="button"
                    disabled={concluding || !canConclude}
                    onClick={() => void handleConclude()}
                    title={
                      canConclude
                        ? "상담이 충분하다고 느끼면 눌러 메인 화면으로 들어갈 수 있어요"
                        : isGraduate
                        ? "목표 학과와 적합성에 대해 조금 더 이야기한 뒤 마칠 수 있어요"
                        : "컨설턴트와 목표를 조율해 준비가 되면 눌러 마칠 수 있어요"
                    }
                    className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    <span>{concluding ? "확정하는 중…" : "상담 마치고 메인 화면으로"}</span>
                    {!concluding && <span>→</span>}
                  </button>
                  {!canConclude && (
                    <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                      상담을 마쳐야 다음으로 넘어갈 수 있어요.
                      {isGraduate
                        ? " 목표 학과·적합성에 대해 조금 더 이야기해 주세요."
                        : " 3개년 흐름 → 이번 학기 목표 → 탐구 주제를 정하면 버튼이 활성화돼요."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 이번 학기 수강 과목 등록·수정 모달 */}
        {coursePickerOpen && (
          <div className="modal-overlay">
            <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-end">
                <button
                  aria-label="닫기"
                  className="text-xs font-bold text-gray-400 hover:text-gray-700"
                  onClick={() => setCoursePickerOpen(false)}
                  type="button"
                >
                  ✕
                </button>
              </div>
              <CurrentCoursePicker
                onSaved={(saved) => {
                  setCurrentCourses(saved);
                  setCoursePickerOpen(false);
                }}
                submitLabel="수강 과목 저장"
              />
            </div>
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
