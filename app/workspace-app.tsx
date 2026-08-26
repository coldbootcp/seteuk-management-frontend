"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  AssignmentAnalysis,
  DnaDiagnosis,
  ProductWorkspace,
  ProfileInput,
  ReconciliationLog,
  Roadmap,
  RoadmapNode,
} from "../lib/product-harness";
import {
  SCHOOL_RECORD_MAX_FILE_SIZE,
  SCHOOL_RECORD_MAX_FILE_SIZE_LABEL,
  getLatestSchoolRecordPeriod,
  parseSchoolRecordJson,
  type SeteukAnalysisResult,
  type SchoolRecordDraft,
  type SchoolRecordParseResult,
} from "../lib/school-record-parser";

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */
type TabId = "overview" | "roadmap" | "activities" | "profile";

type ProfileForm = {
  name: string; grade: string; semester: string;
  targetCareer: string; targetMajors: string; interests: string;
  concreteResearchQuestion: string; knowledgeLevel: string;
  motivationTrigger: string; careerResolution: string; currentEngagement: string;
  preferredSubjects: string; strengths: string; gaps: string; constraints: string;
  outputPreference: string; collaborationStyle: string; roadmapDesignNotes: string;
};

type RoadmapPhase = "past" | "current" | "future";
type RoadmapLayoutMode = "map" | "board";
type ActivityFilter = "all" | RoadmapEventCategory;
type RoadmapEventCategory = "계획" | "상장" | "활동" | "봉사" | "독서" | "시험";

type RoadmapTimelineEvent = {
  id: string; date: string;
  category: RoadmapEventCategory;
  subject: string; title: string; isPlan: boolean;
};

type OnboardingSuggestions = {
  majors: string[];
  keywords: string[];
  provider?: "deepseek" | "fallback";
};

type ClarificationQuestion = {
  id: string;
  label: string;
  question: string;
  options: string[];
};

type ClarificationResponse = {
  summary?: string;
  questions?: ClarificationQuestion[];
  blocked?: boolean;
  reason?: string;
  provider?: "deepseek" | "fallback";
};

type OnboardingRecordContext = {
  expectedGrade?: string | null;
  studentName?: string;
};

/* ──────────────────────────────────────────────
   Constants
   ────────────────────────────────────────────── */
const EMPTY_PROFILE: ProfileForm = {
  name: "김세연", grade: "2", semester: "2", targetCareer: "인공지능 연구원",
  concreteResearchQuestion: "자연어 처리 모델의 편향성 완화 방안", knowledgeLevel: "관련 도서 3권 이상 읽음",
  targetMajors: "컴퓨터공학과, 인공지능학과", interests: "딥러닝, 자연어 처리, 윤리적 AI", motivationTrigger: "관심분야와 목표학과 입력을 기반으로 판단",
  careerResolution: "인간에게 이로운 투명한 AI 모델 개발",
  currentEngagement: "파이썬 기초 학습 완료, 데이터 분석 동아리 활동 중", preferredSubjects: "수학, 정보, 물리", strengths: "논리적 사고, 끈기, 프로그래밍 기초", gaps: "고급 수학 지식 부족, 실전 프로젝트 경험 부족", constraints: "내신 성적 관리로 인한 시간 부족",
  outputPreference: "보고서·소논문, 실험·프로토타입, 발표·토론, 인포그래픽·시각자료",
  collaborationStyle: "교과 수행평가, 세특 보고서, 독서 확장, 대회·발표회, 동아리·팀 프로젝트",
  roadmapDesignNotes: "개발 모드 기본 예시 데이터입니다.",
};

const APP_VERSION = "0.7.0";

const ROADMAP_CATEGORIES: Array<{ category: RoadmapEventCategory; icon: string }> = [
  { category: "계획", icon: "📌" },
  { category: "상장", icon: "A" },
  { category: "활동", icon: "▤" },
  { category: "봉사", icon: "V" },
  { category: "독서", icon: "B" },
  { category: "시험", icon: "E" },
];

const OUTPUT_EVIDENCE_OPTIONS: Array<{ label: string; detail: string; icon: string }> = [
  { label: "보고서·소논문", detail: "탐구 질문, 근거, 결론을 글로 정리", icon: "▤" },
  { label: "실험·프로토타입", detail: "데이터, 제작물, 검증 과정으로 증명", icon: "T" },
  { label: "발표·토론", detail: "관점과 논리를 말로 설득", icon: "C" },
  { label: "인포그래픽·시각자료", detail: "복잡한 내용을 구조화해 표현", icon: "A" },
];

const ACTIVITY_CHANNEL_OPTIONS: Array<{ label: string; detail: string; icon: string }> = [
  { label: "교과 수행평가", detail: "수업 과제와 평가 안에서 연결", icon: "T" },
  { label: "세특 보고서", detail: "과목별 기록으로 남길 탐구", icon: "▤" },
  { label: "독서 확장", detail: "전공 키워드를 책과 논문으로 확장", icon: "B" },
  { label: "대회·발표회", detail: "외부 평가나 공개 발표로 검증", icon: "C" },
  { label: "동아리·팀 프로젝트", detail: "협업 활동과 장기 프로젝트로 확장", icon: "E" },
];

const SUBJECT_COLORS = [
  "#3182f6", "#00a881", "#f59f00", "#e64980",
  "#845ef7", "#12b886", "#15aabf", "#fa5252",
];

/* ──────────────────────────────────────────────
   Utilities
   ────────────────────────────────────────────── */
function splitList(value: string) {
  return value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

function isGraduatedGrade(value: string) {
  return value === "graduated";
}

function profileGradeValue(form: ProfileForm) {
  return isGraduatedGrade(form.grade) ? 3 : Number(form.grade);
}

function profileSemesterValue(form: ProfileForm) {
  return isGraduatedGrade(form.grade) ? 2 : Number(form.semester);
}

function currentGradeValueFromCompletedRecord(completedGrade: number) {
  return completedGrade >= 3 ? "graduated" : String(completedGrade + 1);
}

function recordIsFinalizedForClarification(parsed: SchoolRecordParseResult | null, form: ProfileForm) {
  const latestGrade = parsed ? getLatestSchoolRecordPeriod(parsed)?.grade ?? 0 : 0;
  return isGraduatedGrade(form.grade) || latestGrade >= 3;
}

function gradeLabel(value: string) {
  if (isGraduatedGrade(value)) return "졸업";
  return value ? `${value}학년` : "선택";
}

function buildClarificationQuestions(
  form: ProfileForm,
  parsed: SchoolRecordParseResult | null,
  recordContext: OnboardingRecordContext,
): ClarificationQuestion[] {
  const career = form.targetCareer.trim() || "희망 진로";
  const interests = splitList(form.interests).join(", ") || "관심 키워드";
  const hasRecords = !!parsed?.entries.length;
  const recordSubjects = parsed
    ? [...new Set(parsed.entries.map((entry) => entry.subject).filter(Boolean))].filter((subject) => subject !== "교과 외 활동").slice(0, 5)
    : [];
  const recordSubjectContext = recordSubjects.length ? recordSubjects.join(", ") : "기존 학생부 기록";
  const recordCategories = parsed
    ? [...new Set(parsed.entries.map((entry) => entry.category))].slice(0, 4).join(", ")
    : "";
  const questions: ClarificationQuestion[] = [];
  const expectedGrade = recordContext.expectedGrade;
  const finalized = recordIsFinalizedForClarification(parsed, form);

  if (recordContext.studentName?.trim() && form.name.trim() && recordContext.studentName.trim() !== form.name.trim()) {
    questions.push({
      id: "identity_conflict",
      label: "학생부 이름 확인",
      question: `업로드한 학생부의 이름은 ${recordContext.studentName.trim()}이고 입력한 이름은 ${form.name.trim()}입니다. 동일 학생의 자료인지 먼저 확인해주세요.`,
      options: [`${recordContext.studentName.trim()}이 맞습니다`, `${form.name.trim()}이 맞습니다`, "이름을 확인한 뒤 다시 업로드할게요"],
    });
  }

  if (finalized) return questions;

  if (!finalized && expectedGrade && form.grade && expectedGrade !== form.grade) {
    questions.push({
      id: "grade_conflict",
      label: "학년 확인",
      question: `학생부 기준 현재 상태 후보는 ${gradeLabel(expectedGrade)}인데, 입력값은 ${gradeLabel(form.grade)}입니다. 어느 쪽이 맞나요?`,
      options: [`${gradeLabel(expectedGrade)} 기준으로 로드맵 생성`, `${gradeLabel(form.grade)} 기준 유지`, "학년은 유지하되 학생부는 확정 기록으로만 반영"],
    });
  }

  if (!finalized && hasRecords) {
    questions.push({
      id: "narrative",
      label: "기존 기록 연결",
      question: `학생부에는 ${recordSubjectContext} 중심의 ${recordCategories || "활동"} 기록이 보입니다. ${career}와 어떤 방식으로 이어갈까요?`,
      options: ["기존 기록을 자연스럽게 이어 진로 전환 부담 줄이기", "기존 기록은 근거로 쓰고 새 진로축을 강하게 만들기", "기존 기록과 새 진로를 융합 주제로 연결하기"],
    });
  } else if (!finalized) {
    questions.push({
      id: "narrative",
      label: "서사 방향",
      question: `${career} 로드맵의 전체 서사를 어떤 방향으로 잡을까요?`,
      options: ["넓게 탐색하며 진로를 좁히기", "초반부터 희망 진로 중심으로 강하게 밀기", "교과 성취와 독서 기반을 먼저 쌓기"],
    });
  }

  if (form.grade === "2" || form.grade === "3") {
    questions.push({
      id: "remaining_record_strategy",
      label: "남은 학생부 전략",
      question: `현재 ${gradeLabel(form.grade)}이므로 남은 학생부에서 무엇을 가장 우선할까요?`,
      options: ["기존 기록의 강점을 희망 진로와 연결", "희망 진로의 핵심 역량을 짧은 기간에 집중 보완", "기존 방향과 새 진로를 융합한 대표 탐구 완성", "이미 확정된 기록은 유지하고 입시용 산출물 완성에 집중"],
    });
  }

  if (!finalized) questions.push(
    {
      id: "depth",
      label: "로드맵 전개안",
      question: `${interests}를 6학기 전체에 어떤 구조로 펼칠까요?`,
      options: ["기초→응용→심화로 단계적 전개", "여러 축을 6학기에 고르게 분산", "핵심 주제 1~2개를 반복 심화", "학생부 기록과 가까운 축부터 시작해 희망 진로로 이동"],
    },
    {
      id: "strategic_choice",
      label: "우선순위",
      question: "로드맵이 여러 방향 중 무엇을 가장 우선해야 할까요?",
      options: ["전공 적합성을 강하게 보여주기", "학생부 기존 결을 잃지 않기", "학교에서 실제 수행 가능한 활동으로 낮추기", "진로 변경의 이유를 설득력 있게 만들기"],
    },
    {
      id: "risk",
      label: "조심할 점",
      question: "로드맵을 만들 때 가장 피해야 할 방향은 무엇인가요?",
      options: ["너무 어려운 전공 심화부터 시작하는 것", "기존 학생부와 연결 없이 갑자기 방향을 바꾸는 것", "활동이 많지만 기록 근거가 약한 것"],
    },
  );

  return questions.slice(0, 3);
}

function readClarificationAnswer(notes: string, id: string) {
  return notes.split("\n").find((line) => line.startsWith(`${id}: `))?.slice(id.length + 2) ?? "";
}

function writeClarificationAnswer(notes: string, id: string, answer: string) {
  const lines = notes.split("\n").filter((line) => line && !line.startsWith(`${id}: `));
  return [...lines, `${id}: ${answer}`].join("\n");
}

function toProfileInput(form: ProfileForm): ProfileInput {
  const branchInterests = [
    form.interests,
    form.knowledgeLevel && `관련 배경지식 수준: ${form.knowledgeLevel}`,
    form.concreteResearchQuestion && `핵심 탐구 질문: ${form.concreteResearchQuestion}`,
    form.roadmapDesignNotes && `로드맵 설계 전 확인 답변:\n${form.roadmapDesignNotes}`,
  ].filter(Boolean).join("\n");
  return {
    name: form.name.trim(), grade: profileGradeValue(form), semester: profileSemesterValue(form),
    targetCareer: form.targetCareer.trim(), targetMajors: splitList(form.targetMajors),
    interests: splitList(branchInterests),
    motivationTrigger: form.motivationTrigger,
    careerResolution: form.careerResolution,
    currentEngagement: splitList(form.currentEngagement),
    preferredSubjects: splitList(form.preferredSubjects),
    strengths: splitList(form.strengths), gaps: splitList(form.gaps), constraints: splitList(form.constraints),
    outputPreference: form.outputPreference,
    collaborationStyle: form.collaborationStyle,
  };
}

function buildRecordOnlyRoadmap(studentId: string, career: string): Roadmap {
  const roadmapId = crypto.randomUUID();
  return {
    id: roadmapId,
    studentId,
    version: 1,
    careerTrack: career || "학생부 기록 정리",
    templateId: "record-only",
    status: "draft",
    nodes: Array.from({ length: 6 }, (_, index) => {
      const grade = Math.floor(index / 2) + 1;
      const semester = (index % 2) + 1;
      return {
        id: crypto.randomUUID(),
        roadmapId,
        studentId,
        orderIndex: index,
        grade,
        semester,
        narrativeStage: "확정 기록",
        title: "계획 없음",
        objective: "졸업자 학생부의 확정 기록만 표시합니다.",
        candidateSubjects: [],
        competencyGoals: [],
        status: "skipped" as const,
        instantiatedActivityId: null,
        planEvents: [],
      };
    }),
  };
}

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const raw = await response.text();
  let payload: (T & { error?: string }) | null = null;
  try { payload = JSON.parse(raw) as T & { error?: string }; } catch {
    if (response.status === 413) throw new Error(`파일이 너무 큽니다. ${SCHOOL_RECORD_MAX_FILE_SIZE_LABEL} 이하의 PDF를 선택해주세요.`);
    throw new Error("서버가 분석 결과를 정상적으로 반환하지 못했습니다.");
  }
  if (!response.ok) throw new Error(payload!.error ?? "요청을 처리하지 못했습니다.");
  return payload!;
}

type SchoolRecordProgress = {
  status?: "pending" | "processing" | "completed" | "failed";
  progress?: number;
  stage?: string;
  message?: string;
  result?: SeteukAnalysisResult;
  error?: string | null;
};

async function analyzeSchoolRecordPdf(file: File, academicStartYear: number, signal?: AbortSignal, onProgress?: (state: SchoolRecordProgress) => void) {
  const payload = new FormData();
  payload.append("file", file);
  payload.append("academicStartYear", String(academicStartYear));
  if (signal?.aborted) throw new Error("학생부 분석을 취소했습니다.");
  const initial = await jsonRequest<{ task_id?: string }>("/api/school-record/parse", {
    method: "POST",
    body: payload,
    signal,
  });
  if (!initial.task_id) throw new Error("분석 작업 ID를 발급받지 못했습니다.");

  let temporaryFailures = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 1500));
    if (signal?.aborted) throw new Error("학생부 분석을 취소했습니다.");
    try {
      const task = await jsonRequest<SchoolRecordProgress>(`/api/school-record/status/${encodeURIComponent(initial.task_id)}`, { signal });
      temporaryFailures = 0;
      onProgress?.(task);
      if (task.status === "completed") {
        if (!task.result) throw new Error("분석 결과가 비어 있습니다.");
        return task.result;
      }
      if (task.status === "failed") throw new Error(task.error || "학생부 분석 중 오류가 발생했습니다.");
    } catch (error) {
      temporaryFailures += 1;
      if (temporaryFailures >= 3 || (error instanceof Error && /분석 중 오류|결과가 비어/.test(error.message))) {
        throw error;
      }
    }
  }
  throw new Error("분석 시간이 5분을 초과했습니다. 잠시 후 다시 시도해주세요.");
}

function roadmapIndex(grade: number, semester: number) { return (grade - 1) * 2 + semester - 1; }

function roadmapPhase(workspace: ProductWorkspace, node: RoadmapNode): RoadmapPhase {
  const current = roadmapIndex(workspace.profile.grade, workspace.profile.semester);
  const target = roadmapIndex(node.grade, node.semester);
  if (target < current) return "past";
  if (target === current) return "current";
  return "future";
}

function subjectColor(subject: string) {
  const hash = [...subject].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
}

function activityCategory(activityType: string): RoadmapEventCategory {
  if (/상장|수상|우수상/.test(activityType)) return "상장";
  if (/봉사/.test(activityType)) return "봉사";
  if (/독서|도서/.test(activityType)) return "독서";
  if (/시험|중간|기말/.test(activityType)) return "시험";
  return "활동";
}

function academicTimelinePosition(date: string) {
  const [, monthText = "3", dayText = "1"] = date.split("-");
  const month = Number(monthText); const day = Number(dayText);
  const academicMonth = month >= 3 ? month - 3 : month + 9;
  const daysInMonth = new Date(2024, month, 0).getDate();
  return Math.max(0.5, Math.min(99.5, ((academicMonth + (day - 1) / daysInMonth) / 12) * 100));
}

function timelineClusters(events: RoadmapTimelineEvent[]) {
  const clusters: Array<{ id: string; position: number; events: RoadmapTimelineEvent[] }> = [];
  for (const event of events) {
    const position = academicTimelinePosition(event.date);
    const prev = clusters[clusters.length - 1];
    if (prev && Math.abs(position - prev.position) <= 3) {
      prev.events.push(event);
      prev.position = prev.events.reduce((sum, e) => sum + academicTimelinePosition(e.date), 0) / prev.events.length;
    } else {
      clusters.push({ id: `cluster-${event.id}`, position, events: [event] });
    }
  }
  return clusters;
}

function summarizeOnboardingRecord(parsed: SchoolRecordParseResult, completedGrade?: number) {
  const isInScope = (item: { grade: number }) => !completedGrade || item.grade <= completedGrade;
  const courses = parsed.courses.filter(isInScope);
  const entries = parsed.entries.filter(isInScope);
  const subjects = [...new Set(courses.map((course) => course.subject).filter((subject) => subject && subject !== "교과 외 활동"))].slice(0, 8);
  const entryLabels = entries.slice(0, 8).map((entry) => `${entry.category}: ${entry.title}`);

  return {
    subjects,
    entries,
    currentActivities: entryLabels.length ? `학생부에서 확인된 기록\n${entryLabels.join("\n")}` : "",
  };
}

const FLOW_POSITIONS = [
  { x: 14.0, y: 73 },
  { x: 28.4, y: 27 },
  { x: 42.8, y: 73 },
  { x: 57.2, y: 27 },
  { x: 71.6, y: 73 },
  { x: 86.0, y: 27 },
];

function flowConnectorPath(points: typeof FLOW_POSITIONS) {
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const prev = points[index - 1];
    const midX = (prev.x + point.x) / 2;
    return `${path} C ${midX} ${prev.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

const FLOW_CONNECTOR_PATH = flowConnectorPath(FLOW_POSITIONS);

/* ──────────────────────────────────────────────
   Shared Components
   ────────────────────────────────────────────── */
function StatusBadge({ status }: { status: RoadmapNode["status"] }) {
  const config: Record<RoadmapNode["status"], { label: string; cls: string }> = {
    planned:      { label: "예정",     cls: "badge-planned" },
    active:       { label: "진행 중",  cls: "badge-active"  },
    instantiated: { label: "실행 중",  cls: "badge-active"  },
    completed:    { label: "완료",     cls: "badge-done"    },
    skipped:      { label: "건너뜀",   cls: "badge-muted"   },
    revised:      { label: "수정됨",   cls: "badge-muted"   },
  };
  const { label, cls } = config[status];
  return <span className={`status-badge ${cls}`}>{label}</span>;
}

/* ──────────────────────────────────────────────
   Onboarding
   ────────────────────────────────────────────── */
function Onboarding({ onComplete }: { onComplete: (workspace: ProductWorkspace) => void }) {
  const [form, setForm] = useState<ProfileForm>(EMPTY_PROFILE);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preview, setPreview] = useState<{
    profile: ProfileInput & { id: string };
    roadmap: Roadmap; dna: DnaDiagnosis;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [onboardingRecordFile, setOnboardingRecordFile] = useState("");
  const [onboardingRecordBusy, setOnboardingRecordBusy] = useState(false);
  const [onboardingRecordMessage, setOnboardingRecordMessage] = useState("");
  const [onboardingRecordStage, setOnboardingRecordStage] = useState("업로드 대기");
  const [onboardingRecordParse, setOnboardingRecordParse] = useState<SchoolRecordParseResult | null>(null);
  const [onboardingRecordAutoFields, setOnboardingRecordAutoFields] = useState(false);
  const [onboardingRecordContext, setOnboardingRecordContext] = useState<OnboardingRecordContext>({});
  const [suggestions, setSuggestions] = useState<OnboardingSuggestions | null>(null);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<ClarificationQuestion[]>([]);
  const [clarificationSummary, setClarificationSummary] = useState("");
  const [clarificationBusy, setClarificationBusy] = useState(false);
  const [clarificationBlocked, setClarificationBlocked] = useState(false);
  const [recordOnlyMode, setRecordOnlyMode] = useState(false);
  const onboardingRecordRef = useRef<HTMLInputElement>(null);
  const onboardingRecordAbortRef = useRef<AbortController | null>(null);

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((cur) => ({ ...cur, [key]: value }));
  }

  function updateGrade(value: string) {
    setForm((cur) => ({
      ...cur,
      grade: value,
      semester: isGraduatedGrade(value) ? "" : isGraduatedGrade(cur.grade) ? "" : cur.semester,
    }));
  }

  function toggleFormList(key: "outputPreference" | "collaborationStyle", option: string) {
    setForm((cur) => {
      const values = splitList(cur[key]);
      const next = values.includes(option)
        ? values.filter((value) => value !== option)
        : [...values, option];
      return { ...cur, [key]: next.join(", ") };
    });
  }

  function addListValue(key: "targetMajors" | "interests", value: string) {
    setForm((cur) => {
      const values = splitList(cur[key]);
      if (values.includes(value)) return cur;
      return { ...cur, [key]: [...values, value].join(", ") };
    });
  }

  function answerClarification(question: ClarificationQuestion, answer: string) {
    setForm((cur) => {
      const next = {
        ...cur,
        roadmapDesignNotes: writeClarificationAnswer(cur.roadmapDesignNotes, question.id, `${question.label} - ${question.question} / ${answer}`),
      };
      if (question.id === "identity_conflict" && onboardingRecordContext.studentName && answer.startsWith(onboardingRecordContext.studentName)) {
        next.name = onboardingRecordContext.studentName;
      }
      if (question.id === "grade_conflict" && onboardingRecordContext.expectedGrade && answer.startsWith(gradeLabel(onboardingRecordContext.expectedGrade))) {
        next.grade = onboardingRecordContext.expectedGrade;
        if (isGraduatedGrade(next.grade)) next.semester = "";
      }
      return next;
    });
  }

  useEffect(() => {
    const topic = form.targetCareer.trim();
    if (topic.length < 2) {
      setSuggestions(null);
      setSuggestBusy(false);
      return;
    }
    let cancelled = false;
    setSuggestBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/onboarding/suggest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetCareer: topic }),
        });
        const result = await response.json();
        if (!cancelled) setSuggestions({
          majors: Array.isArray(result.majors) ? result.majors : [],
          keywords: Array.isArray(result.keywords) ? result.keywords : [],
          provider: result.provider,
        });
      } catch {
        if (!cancelled) setSuggestions(null);
      } finally {
        if (!cancelled) setSuggestBusy(false);
      }
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.targetCareer]);

  useEffect(() => {
    if (!onboardingRecordParse || !onboardingRecordAutoFields || !form.grade) return;

    const latestPeriod = getLatestSchoolRecordPeriod(onboardingRecordParse);
    const completedGrade = latestPeriod?.grade;
    const expectedCurrentGrade = completedGrade ? currentGradeValueFromCompletedRecord(completedGrade) : null;
    const summary = summarizeOnboardingRecord(onboardingRecordParse, completedGrade);

    setForm((cur) => {
      let changed = false;
      const next = { ...cur };
      if (summary.currentActivities && (!cur.currentEngagement.trim() || cur.currentEngagement.startsWith("학생부에서 확인된 기록\n")) && cur.currentEngagement !== summary.currentActivities) {
        next.currentEngagement = summary.currentActivities;
        changed = true;
      }
      if (summary.subjects.length && !cur.preferredSubjects.trim()) {
        next.preferredSubjects = summary.subjects.join(", ");
        changed = true;
      }
      return changed ? next : cur;
    });

    const detectedMessage = completedGrade ? ` 학생부는 ${completedGrade}학년까지 확정된 기록으로 보았습니다.` : "";
    const gradeMessage = expectedCurrentGrade ? ` 현재 상태 후보는 ${gradeLabel(expectedCurrentGrade)}로 보이며, 입력값과 다르면 다음 확인 단계에서 묻습니다.` : "";
    setOnboardingRecordMessage(`학생부에서 과목 ${summary.subjects.length}개, 활동 후보 ${summary.entries.length}개를 기록에 반영합니다.${detectedMessage}${gradeMessage}`);
  }, [form.grade, onboardingRecordAutoFields, onboardingRecordParse]);

  async function createPreview() {
    if (clarificationBlocked) {
      setError("3학년까지 확정된 졸업자 학생부로 확인되어 재학생용 로드맵을 진행할 수 없습니다.");
      return;
    }
    if (onboardingRecordBusy) {
      setError("학생부 분석이 끝난 뒤 로드맵을 설계할 수 있어요. 분석 결과까지 반영해서 더 정확하게 만들겠습니다.");
      return;
    }
    setBusy(true); setError("");
    try {
      const result = await jsonRequest<typeof preview>("/api/onboarding/preview", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(toProfileInput(form)),
      });
      setPreview(result);
    } catch (e) { setError(e instanceof Error ? e.message : "로드맵을 만들지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function prepareClarification() {
    if (onboardingRecordBusy) {
      setError("학생부 분석이 아직 진행 중입니다. 분석이 끝나면 Step1·2와 학생부를 함께 읽고 필요한 확인 질문을 만들게요.");
      return;
    }
    setClarificationBusy(true);
    setError("");
    setClarificationBlocked(false);
    if (recordOnlyMode) {
      setClarificationQuestions([]);
      setClarificationSummary("졸업자 학생부로 확인되어 로드맵은 만들지 않고, 분석·정리한 학생부 기록만 보여드립니다.");
      setClarificationBlocked(true);
      setStep(3);
      setClarificationBusy(false);
      return;
    }
    const latestPeriod = onboardingRecordParse ? getLatestSchoolRecordPeriod(onboardingRecordParse) : null;
    const subjects = onboardingRecordParse
      ? [...new Set(onboardingRecordParse.entries.map((entry) => entry.subject).filter(Boolean))].filter((subject) => subject !== "교과 외 활동")
      : [];
    const fallbackQuestions = buildClarificationQuestions(form, onboardingRecordParse, onboardingRecordContext);

    try {
      const result = await jsonRequest<ClarificationResponse>("/api/onboarding/clarify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          form: {
            name: form.name.trim(),
            grade: form.grade,
            semester: form.semester,
            targetCareer: form.targetCareer.trim(),
            targetMajors: splitList(form.targetMajors),
            interests: splitList(form.interests),
            careerResolution: form.careerResolution,
            concreteResearchQuestion: form.concreteResearchQuestion,
            knowledgeLevel: form.knowledgeLevel,
            currentEngagement: splitList(form.currentEngagement),
            outputPreference: splitList(form.outputPreference),
            collaborationStyle: splitList(form.collaborationStyle),
            constraints: splitList(form.constraints),
          },
          schoolRecord: onboardingRecordParse
            ? {
                fileName: onboardingRecordParse.fileName,
                completedGrade: latestPeriod?.grade ?? null,
                subjects: subjects.slice(0, 10),
                entries: onboardingRecordParse.entries.slice(0, 30).map((entry) => ({
                  grade: entry.grade,
                  semester: entry.semester,
                  category: entry.category,
                  subject: entry.subject,
                  title: entry.title,
                  summary: entry.summary,
                })),
              }
            : null,
          recordContext: onboardingRecordContext,
        }),
      });
      if (result.blocked) {
        setClarificationQuestions([]);
        setClarificationBlocked(true);
        setClarificationSummary(result.summary || "업로드한 학생부가 졸업자 학생부로 확인되어 진행할 수 없습니다.");
        setStep(3);
        return;
      }
      const questions = Array.isArray(result.questions) && result.questions.length ? result.questions : fallbackQuestions;
      setClarificationQuestions(questions);
      setClarificationSummary(result.summary || "");
      setStep(3);
    } catch {
      setClarificationQuestions(fallbackQuestions);
      setClarificationSummary(onboardingRecordParse
        ? "학생부의 기존 기록과 Step1·2 입력을 기준으로 확인 질문을 만들었습니다."
        : "Step1·2 입력을 기준으로 로드맵 구조 확인 질문을 만들었습니다.");
      setStep(3);
    } finally {
      setClarificationBusy(false);
    }
  }

  async function analyzeOnboardingRecord(file: File | undefined) {
    if (!file) return;
    if (file.size > SCHOOL_RECORD_MAX_FILE_SIZE) {
      setError(`파일이 너무 큽니다. ${SCHOOL_RECORD_MAX_FILE_SIZE_LABEL} 이하의 PDF를 선택해주세요.`);
      if (onboardingRecordRef.current) onboardingRecordRef.current.value = "";
      return;
    }

    onboardingRecordAbortRef.current?.abort();
    const controller = new AbortController();
    onboardingRecordAbortRef.current = controller;
    setOnboardingRecordBusy(true); setOnboardingRecordFile(file.name); setOnboardingRecordMessage(""); setError("");
    setOnboardingRecordStage("업로드 완료 · 분석 준비 중");
    setRecordOnlyMode(false);
    setClarificationQuestions([]);
    setClarificationSummary("");
    setClarificationBlocked(false);
    try {
      const fallbackGrade = isGraduatedGrade(form.grade) ? 3 : Number(form.grade || 1);
      const fallbackAcademicStartYear = new Date().getFullYear() - (fallbackGrade - 1);
      const resultJson = await analyzeSchoolRecordPdf(file, fallbackAcademicStartYear, controller.signal, (state) => {
        if (state.stage) setOnboardingRecordStage(state.stage);
      });
      if (controller.signal.aborted) return;
      const initialParsed = parseSchoolRecordJson(resultJson, fallbackAcademicStartYear);
      const latestPeriod = getLatestSchoolRecordPeriod(initialParsed);
      const completedGrade = latestPeriod?.grade;
      const expectedCurrentGrade = completedGrade ? currentGradeValueFromCompletedRecord(completedGrade) : null;
      const studentName = typeof resultJson.student_name === "string" ? resultJson.student_name.trim() : "";

      const resolvedGrade = isGraduatedGrade(expectedCurrentGrade ?? form.grade) ? 3 : Number(expectedCurrentGrade ?? form.grade) || 1;
      const resolvedAcademicStartYear = new Date().getFullYear() - (resolvedGrade - 1);
      const parsed = parseSchoolRecordJson(resultJson, resolvedAcademicStartYear);
      parsed.fileName = file.name;
      const summary = summarizeOnboardingRecord(parsed, completedGrade);

      if (expectedCurrentGrade && !form.grade) {
        updateGrade(expectedCurrentGrade);
      }
      if (studentName && !form.name.trim()) update("name", studentName);
      if (summary.subjects.length && !form.preferredSubjects.trim()) update("preferredSubjects", summary.subjects.join(", "));
      if (summary.currentActivities && !form.currentEngagement.trim()) update("currentEngagement", summary.currentActivities);
      const periodMessage = completedGrade ? ` ${completedGrade}학년까지 확정된 기록으로 확인했습니다.` : "";
      const gradeMessage = expectedCurrentGrade ? ` 현재 상태는 ${gradeLabel(expectedCurrentGrade)} 후보로 자동 입력했습니다${isGraduatedGrade(expectedCurrentGrade) ? "." : ", 학기는 직접 선택해주세요."}` : "";
      const nameMessage = studentName && !form.name.trim() ? ` 이름은 ${studentName} 학생으로 자동 입력했습니다.` : "";
      setOnboardingRecordParse(parsed);
      setRecordOnlyMode(Boolean(completedGrade && completedGrade >= 3));
      setOnboardingRecordAutoFields(true);
      setOnboardingRecordContext({ expectedGrade: expectedCurrentGrade, studentName });
      setOnboardingRecordMessage(completedGrade && completedGrade >= 3
        ? "3학년까지 확정된 졸업자 학생부로 확인했습니다. 로드맵은 만들지 않고, 분석·정리한 학생부 기록을 보여드립니다."
        : `학생부에서 과목 ${summary.subjects.length}개, 활동 후보 ${summary.entries.length}개를 확인했습니다. 시작하면 3개년 기록에 함께 저장됩니다.${nameMessage}${periodMessage}${gradeMessage}`);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "학생부를 분석하지 못했습니다. 건너뛰고 시작해도 됩니다.");
      setOnboardingRecordFile("");
      setOnboardingRecordParse(null);
      setOnboardingRecordAutoFields(false);
      setOnboardingRecordContext({});
      setClarificationBlocked(false);
      setRecordOnlyMode(false);
    } finally {
      if (onboardingRecordAbortRef.current === controller) {
        onboardingRecordAbortRef.current = null;
        setOnboardingRecordBusy(false);
        setOnboardingRecordStage("분석 완료");
        if (onboardingRecordRef.current) onboardingRecordRef.current.value = "";
      }
    }
  }

  function cancelOnboardingRecordAnalysis() {
    onboardingRecordAbortRef.current?.abort();
    onboardingRecordAbortRef.current = null;
    setOnboardingRecordBusy(false);
    setOnboardingRecordStage("업로드 대기");
    setOnboardingRecordFile("");
    setOnboardingRecordMessage("");
    setOnboardingRecordContext({});
    setRecordOnlyMode(false);
    setClarificationQuestions([]);
    setClarificationSummary("");
    setClarificationBlocked(false);
    setError("");
    if (onboardingRecordRef.current) onboardingRecordRef.current.value = "";
  }

  function editPreviewNode(nodeId: string, field: "title" | "objective", value: string) {
    setPreview((cur) => cur ? {
      ...cur, roadmap: {
        ...cur.roadmap,
        nodes: cur.roadmap.nodes.map((n) => n.id === nodeId ? { ...n, [field]: value } : n),
      },
    } : cur);
  }

  async function confirmOnboarding() {
    if (!preview && !recordOnlyMode) return;
    setBusy(true); setError("");
    try {
      const recordOnlyRoadmap = recordOnlyMode
        ? buildRecordOnlyRoadmap(crypto.randomUUID(), form.targetCareer.trim())
        : null;
      const result = await jsonRequest<{ workspace: ProductWorkspace }>("/api/onboarding", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: toProfileInput(form), roadmap: recordOnlyRoadmap ?? preview?.roadmap }),
      });
      let workspace = result.workspace;
      if (onboardingRecordParse && (onboardingRecordParse.courses.length || onboardingRecordParse.entries.some((entry) => entry.selected))) {
        const imported = await jsonRequest<{ workspace: ProductWorkspace }>("/api/school-record/import", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            studentId: workspace.profile.id,
            fileName: onboardingRecordParse.fileName,
            totalPages: onboardingRecordParse.totalPages,
            courses: onboardingRecordParse.courses,
            entries: onboardingRecordParse.entries,
          }),
        });
        workspace = imported.workspace;
      }
      window.localStorage.setItem("seteuk-current-student", workspace.profile.id);
      onComplete(workspace);
    } catch (e) { setError(e instanceof Error ? e.message : "가입 정보를 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  const canPreview = !!form.name.trim() && !!form.grade && (isGraduatedGrade(form.grade) || !!form.semester) && !!form.targetCareer.trim();

  /* ── Preview Screen ── */
  if (preview) {
    return (
      <div className="onboarding-page">
        <div className="onboarding-layout">
          {/* Left panel */}
          <aside className="onboarding-panel">
            <div className="ob-brand">
              <img alt="세특연구소 로고" src="/logo.png?v=2" style={{ width: 32, height: 32, objectFit: 'contain' }} />
              <div>
                <strong>세특연구소 <span style={{ color: 'var(--blue-500)', fontWeight: 800 }}>Pro</span></strong>
                <small>Personalized School Coach</small>
              </div>
            </div>
            <div className="ob-tagline">
              <h1>{preview.profile.name} 학생의<br />첫 3개년</h1>
              <p>관심분야와 기존 기록을 바탕으로 만든 첫 설계안입니다. 내용을 직접 수정한 뒤 저장할 수 있어요.</p>
            </div>
            <div className="ob-progress">
              <span className="ob-step-dot is-done">✓</span>
              <span className="ob-step-connector is-done" />
              <span className="ob-step-dot is-done">✓</span>
              <span className="ob-step-connector is-done" />
              <span className="ob-step-dot is-active">3</span>
            </div>
          </aside>

          {/* Right — preview */}
          <main className="ob-preview-panel">
            <div className="ob-preview-header">
              <span className="kicker">ROADMAP PREVIEW · Version 1</span>
              <h2>{preview.profile.name}의 고교 3개년 로드맵</h2>
              <p>학기별 제목과 목표를 지금 바로 수정할 수 있어요. 저장 후에도 언제든지 편집 가능합니다.</p>
            </div>

            <div className="preview-dna-card">
              <small>잠정 전공 서사 DNA</small>
              <h3>{preview.dna.narrative}</h3>
              <div className="preview-dna-facts">
                {preview.dna.facts.map((fact) => <span key={fact}>{fact}</span>)}
              </div>
            </div>

            <div className="preview-notice">
              학생부 기록이나 실제 활동을 더 추가하면 관심분야와 로드맵 정합도를 다시 계산합니다.
            </div>

            <div className="preview-nodes">
              {preview.roadmap.nodes.map((node) => (
                <article className={`preview-node ${node.status}`} key={node.id}>
                  <div className="preview-node-head">
                    <span className="preview-node-period">{node.grade}학년 {node.semester}학기 · {node.narrativeStage}</span>
                    <StatusBadge status={node.status} />
                  </div>
                  <input
                    aria-label={`${node.grade}학년 ${node.semester}학기 제목`}
                    value={node.title}
                    onChange={(e) => editPreviewNode(node.id, "title", e.target.value)}
                  />
                  <textarea
                    aria-label={`${node.grade}학년 ${node.semester}학기 목표`}
                    value={node.objective}
                    onChange={(e) => editPreviewNode(node.id, "objective", e.target.value)}
                  />
                  <div className="preview-node-tags">
                    {node.candidateSubjects.map((s) => <span key={s}>{s}</span>)}
                  </div>
                </article>
              ))}
            </div>

            {error && <div className="banner banner-error">{error}</div>}

            <div className="preview-actions">
              <button className="btn btn-secondary" onClick={() => setPreview(null)} type="button">
                ← 응답 수정
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={confirmOnboarding} type="button">
                {busy ? "작업공간 만드는 중…" : "이 로드맵으로 시작 →"}
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  /* ── Form Screen ── */
  return (
    <div className="onboarding-page">
      <div className="onboarding-layout">
        {/* Left panel */}
        <aside className="onboarding-panel">
          <div className="ob-brand">
            <img alt="세특연구소 로고" src="/logo.png?v=2" style={{ width: 32, height: 32, objectFit: 'contain' }} />
            <div>
              <strong>세특연구소 <span style={{ color: 'var(--blue-500)', fontWeight: 800 }}>Pro</span></strong>
              <small>Personalized School Coach</small>
            </div>
          </div>
          <div className="ob-tagline">
            <h1>지금의 나에서<br />시작하는<br />3개년</h1>
            <p>학생부 기록과 관심분야를 바탕으로 고교 3개년 전공 서사를 설계합니다.</p>
          </div>
          <div className="ob-features">
            <strong>세 가지 원칙</strong>
            <div className="ob-feature">
              <span className="ob-feature-icon">1</span>
              <div className="ob-feature-text">
                <strong>학생부가 있으면 먼저 봅니다</strong>
                <small>이미 쌓인 기록이 로드맵의 출발점입니다</small>
              </div>
            </div>
            <div className="ob-feature">
              <span className="ob-feature-icon">2</span>
              <div className="ob-feature-text">
                <strong>관심분야를 구체화합니다</strong>
                <small>막연한 분야를 탐구 질문으로 좁힙니다</small>
              </div>
            </div>
            <div className="ob-feature">
              <span className="ob-feature-icon">3</span>
              <div className="ob-feature-text">
                <strong>실행 가능한 활동으로 바꿉니다</strong>
                <small>과목·대회·보고서·독서까지 이어갑니다</small>
              </div>
            </div>
          </div>
          <div className="ob-progress">
            <span className={`ob-step-dot ${step >= 1 ? "is-active" : ""}`}>1</span>
            <span className={`ob-step-connector ${step >= 2 ? "is-done" : ""}`} />
            <span className={`ob-step-dot ${step >= 2 ? "is-active" : ""}`}>2</span>
            <span className={`ob-step-connector ${step >= 3 ? "is-done" : ""}`} />
            <span className={`ob-step-dot ${step >= 3 ? "is-active" : ""}`}>3</span>
          </div>
        </aside>

        {/* Right — form */}
        <main className="ob-form-panel">
          <div className="ob-form-header">
            <span className="kicker">NEW STUDENT ONBOARDING · Step {step} / 3</span>
            <h2>{step === 1 ? "학생부와 관심분야" : step === 2 ? "탐구 설계와 실행 전략" : "로드맵 설계 전 확인"}</h2>
            <p>
              {step === 1
                ? "학생부 PDF가 있으면 먼저 올려주세요. 없거나 지금 올리기 싫다면 건너뛰어도 됩니다."
                : step === 2
                  ? "성격 검사가 아니라, 관심분야를 어떤 탐구와 활동으로 증명할지 정합니다."
                  : "학생부와 입력값을 바탕으로 로드맵 방향을 한 번 더 맞춥니다."}
            </p>
          </div>

          {error && <div className="banner banner-error onboarding-error-banner">{error}</div>}

          {step === 1 && (
            <div className="form-steps">
              <div className="ob-section">
                <div className="ob-section-title">
                  <small>학생부 선택 업로드</small>
                  <strong>이미 쌓인 기록이 있다면 먼저 반영하기</strong>
                </div>
                <div className={`onboarding-record-card${onboardingRecordFile ? " is-connected" : ""}`}>
                  <div className="record-import-info">
                    <strong>{onboardingRecordBusy ? "학생부 분석 중…" : onboardingRecordFile ? "학생부 분석 완료" : "학생부 PDF가 있나요?"}</strong>
                    <small>
                      {onboardingRecordBusy
                        ? `${onboardingRecordStage} · 약 1~2분 소요됩니다. 기다리는 동안 아래 기본 정보와 관심분야를 먼저 입력해 주세요.`
                        : onboardingRecordFile || "올리면 이름과 마지막 확정 학년을 읽어 기본 정보를 자동 입력합니다. 원본 PDF는 저장하지 않습니다."}
                    </small>
                  </div>
                  <input
                    accept="application/pdf,.pdf"
                    hidden
                    onChange={(e) => analyzeOnboardingRecord(e.target.files?.[0])}
                    ref={onboardingRecordRef}
                    type="file"
                  />
                  <div className="onboarding-record-actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={onboardingRecordBusy}
                      onClick={() => onboardingRecordRef.current?.click()}
                      type="button"
                    >
                      {onboardingRecordBusy ? "분석 중…" : onboardingRecordFile ? "다른 PDF" : "PDF 올리기"}
                    </button>
                    {onboardingRecordBusy && (
                      <button
                        aria-label="학생부 분석 취소"
                        className="record-cancel-button"
                        onClick={cancelOnboardingRecordAnalysis}
                        title="분석 취소"
                        type="button"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
                {onboardingRecordMessage && <div className="banner banner-success">{onboardingRecordMessage}</div>}
                <p className="onboarding-record-note">학생부를 넣으면 이름과 현재 학년 후보를 자동 입력합니다. 재학생 학생부는 보통 1년 단위 확정본이라 학기까지는 확정하지 않습니다. 예를 들어 1학년 기록까지 있으면 현재 학년은 2학년 후보로 입력하고, 1학기인지 2학기인지는 직접 선택합니다.</p>
              </div>

              {/* Section 1 */}
              <div className="ob-section">
                <div className="ob-section-title">
                  <small>기본 정보</small>
                  <strong>학생과 현재 시점</strong>
                </div>
                <div className="form-grid-3">
                  <div className="form-field">
                    <label htmlFor="ob-name">이름</label>
                    <input id="ob-name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="예: 김세특" disabled={Boolean(onboardingRecordFile || onboardingRecordBusy)} />
                  </div>
                  <div className="form-field">
                    <label htmlFor="ob-grade">학년</label>
                    <select id="ob-grade" value={form.grade} onChange={(e) => updateGrade(e.target.value)} disabled={Boolean(onboardingRecordFile || onboardingRecordBusy)}>
                      <option value="">선택</option>
                      <option value="1">1학년</option>
                      <option value="2">2학년</option>
                      <option value="3">3학년</option>
                      <option value="graduated">졸업</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label htmlFor="ob-semester">학기</label>
                    <select id="ob-semester" value={form.semester} onChange={(e) => update("semester", e.target.value)} disabled={Boolean(onboardingRecordFile || onboardingRecordBusy) || isGraduatedGrade(form.grade)}>
                      <option value="">{isGraduatedGrade(form.grade) ? "해당 없음" : "선택"}</option>
                      <option value="1">1학기</option>
                      <option value="2">2학기</option>
                    </select>
                  </div>
                </div>
                {onboardingRecordFile && <p className="onboarding-record-note">업로드한 학생부에서 확인한 이름과 현재 시점을 사용합니다. 직접 수정할 수 없습니다.</p>}
              </div>

              {/* Section 2 */}
              <div className="ob-section">
                <div className="ob-section-title">
                  <small>진로와 관심</small>
                  <strong>넓은 분야에서 세부 관심으로 좁히기</strong>
                </div>
                <div className="form-grid-2">
                  <div className="form-field form-span-2">
                    <label htmlFor="ob-career">현재 가장 끌리는 분야 또는 진로</label>
                    <input id="ob-career" value={form.targetCareer} onChange={(e) => update("targetCareer", e.target.value)} placeholder="예: 인공지능 의료, 뇌과학, 교육격차, 로봇공학" />
                  </div>
                  {(suggestBusy || suggestions) && (
                    <div className="ai-suggestion-panel form-span-2">
                      <div className="ai-suggestion-head">
                        <div>
                          <strong>AI가 연결 후보를 찾고 있어요</strong>
                          <small>마음에 드는 후보를 누르면 아래 입력칸에 추가됩니다.</small>
                        </div>
                        <span>{suggestBusy ? "생성 중…" : suggestions?.provider === "deepseek" ? "AI 추천" : "기본 추천"}</span>
                      </div>
                      <div className="ai-suggestion-group">
                        <small>학과 후보</small>
                        <div className="suggestion-chip-row">
                          {suggestBusy && !suggestions
                            ? Array.from({ length: 5 }).map((_, index) => <i className="suggestion-skeleton" key={index} />)
                            : suggestions?.majors.map((major) => (
                              <button key={major} onClick={() => addListValue("targetMajors", major)} type="button">{major}</button>
                            ))}
                        </div>
                      </div>
                      <div className="ai-suggestion-group">
                        <small>로드맵 큰 축 후보</small>
                        <div className="suggestion-chip-row">
                          {suggestBusy && !suggestions
                            ? Array.from({ length: 6 }).map((_, index) => <i className="suggestion-skeleton is-wide" key={index} />)
                            : suggestions?.keywords.map((keyword) => (
                              <button key={keyword} onClick={() => addListValue("interests", keyword)} type="button">{keyword}</button>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="form-field">
                    <label htmlFor="ob-majors">연결 가능한 학과 후보</label>
                    <input id="ob-majors" value={form.targetMajors} onChange={(e) => update("targetMajors", e.target.value)} placeholder="예: 컴퓨터공학, 의공학, 심리학, 교육학" />
                  </div>
                  <div className="form-field">
                    <label htmlFor="ob-interests">로드맵에서 다룰 큰 관심 축</label>
                    <textarea id="ob-interests" value={form.interests} onChange={(e) => update("interests", e.target.value)} placeholder="AI 추천 후보를 눌러 추가하거나, 6학기 동안 다뤄보고 싶은 큰 방향을 적어주세요." />
                  </div>
                </div>
              </div>

              <div className="ob-section">
                <div className="ob-section-title">
                  <small>진로 구체도에 따른 추가 질문</small>
                  <strong>정해진 정도에 따라 필요한 정보만 더 받기</strong>
                </div>
                <div className="form-grid-1">
                  <div className="form-field">
                    <label>현재 진로가 어느 정도 정해졌나요?</label>
                    <div className="clarity-choice-row is-two">
                      {[
                        { value: "넓은 분야만 정한 단계", label: "넓은 분야만 있음", desc: "예: 의료, AI, 교육. 추가 질문 없이 로드맵에서 좁혀갑니다." },
                        { value: "구체적인 학과나 직무까지 정한 단계", label: "구체 목표가 있음", desc: "학과·직무·주제가 꽤 명확" },
                      ].map((item) => (
                        <button
                          className={`clarity-choice${form.careerResolution === item.value ? " is-active" : ""}`}
                          key={item.value}
                          onClick={() => update("careerResolution", item.value)}
                          type="button"
                        >
                          <strong>{item.label}</strong>
                          <small>{item.desc}</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  {form.careerResolution === "구체적인 학과나 직무까지 정한 단계" && (
                    <div className="branch-question-card">
                      <div className="branch-question-head">
                        <strong>관련 배경지식에 맞춰 로드맵 난이도를 조절합니다</strong>
                        <small>배경지식이 있더라도 기초부터 차근차근 쌓고 싶다면 ‘하’를 선택하세요.</small>
                      </div>
                      <div className="form-grid-1">
                        <div className="form-field">
                          <label>관련 지식이 어느 정도 있나요?</label>
                          <div className="knowledge-choice-row">
                            {[
                              { value: "하", label: "하", desc: "기초 개념부터 로드맵을 쌓고 싶음" },
                              { value: "중", label: "중", desc: "기본 개념은 알고, 적용 활동을 해보고 싶음" },
                              { value: "상", label: "상", desc: "심화 탐구·차별화 활동부터 설계 가능" },
                            ].map((item) => (
                              <button
                                className={`knowledge-choice${form.knowledgeLevel === item.value ? " is-active" : ""}`}
                                key={item.value}
                                onClick={() => update("knowledgeLevel", item.value)}
                                type="button"
                              >
                                <strong>{item.label}</strong>
                                <small>{item.desc}</small>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="form-field">
                          <label>특히 궁금한 세부 키워드나 문제</label>
                          <textarea
                            value={form.concreteResearchQuestion}
                            onChange={(e) => update("concreteResearchQuestion", e.target.value)}
                            placeholder={
                              form.knowledgeLevel === "상"
                                ? "예: 의료 AI 진단 모델의 오류 원인을 데이터 편향 관점에서 분석하고 싶음"
                                : form.knowledgeLevel === "중"
                                  ? "예: AI 진단 정확도, 의료 데이터, 모델 비교처럼 관심 키워드를 적어주세요"
                                  : "아직 안 적어도 됩니다. 간략히 키워드 1~2개만 적어도 괜찮아요."
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {step === 2 && (
            <div className="form-steps">
              {/* Section 4: Output & Collaboration */}
              <div className="ob-section">
                <div className="ob-section-title">
                  <small>가능한 활동 범위</small>
                  <strong>학교생활에서 활용 가능한 방식 모두 선택</strong>
                </div>
                <div className="form-grid-1">
                  <div className="form-field">
                    <div className="choice-group-head">
                      <label>산출물 형태</label>
                      <small>불가능한 것만 해제하세요</small>
                    </div>
                    <div className="choice-grid evidence-choice-grid">
                      {OUTPUT_EVIDENCE_OPTIONS.map((option) => (
                        <label className="choice-card" key={option.label}>
                          <input
                            checked={splitList(form.outputPreference).includes(option.label)}
                            onChange={() => toggleFormList("outputPreference", option.label)}
                            type="checkbox"
                          />
                          <i className="choice-icon">{option.icon}</i>
                          <span>
                            <strong>{option.label}</strong>
                            <small>{option.detail}</small>
                          </span>
                          <b className="choice-check">✓</b>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="form-field">
                    <div className="choice-group-head">
                      <label>활동 채널</label>
                      <small>학교 여건상 불가능한 것만 해제하세요</small>
                    </div>
                    <div className="choice-grid">
                      {ACTIVITY_CHANNEL_OPTIONS.map((option) => (
                        <label className="choice-card" key={option.label}>
                          <input
                            checked={splitList(form.collaborationStyle).includes(option.label)}
                            onChange={() => toggleFormList("collaborationStyle", option.label)}
                            type="checkbox"
                          />
                          <i className="choice-icon">{option.icon}</i>
                          <span>
                            <strong>{option.label}</strong>
                            <small>{option.detail}</small>
                          </span>
                          <b className="choice-check">✓</b>
                        </label>
                      ))}
                    </div>
                  </div>
                  <p className="onboarding-record-note">
                    선호도를 묻는 단계가 아닙니다. 수행평가·대회·보고서·독서는 로드맵상 필요하면 배치하고, 여기서는 현실적으로 불가능한 방식만 제외합니다.
                  </p>
                </div>
              </div>

              {/* Section 5: Constraints */}
              <div className="ob-section">
                <div className="ob-section-title">
                  <small>현실 조건</small>
                  <strong>로드맵을 짤 때 반드시 피해야 할 제약</strong>
                </div>
                <div className="form-grid-1">
                  <div className="form-field form-span-2">
                    <label htmlFor="ob-constraints">시간·환경 등 명확한 제약조건</label>
                    <input id="ob-constraints" value={form.constraints} onChange={(e) => update("constraints", e.target.value)} placeholder="예: 코딩 불가, 실험실 사용 어려움, 교외대회 준비 시간 없음 / 없으면 비워두기" />
                  </div>
                  <p className="onboarding-record-note">
                    연결 과목, 강점, 보완점, 활용 자원은 학생부와 이후 활동 입력을 보고 시스템이 판단합니다.
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="form-steps">
              <div className="ob-section">
                <div className="ob-section-title">
                  <small>AI 확인 질문</small>
                  <strong>로드맵을 만들기 전에 방향 맞추기</strong>
                </div>
                <div className="form-grid-1">
                  <p className="onboarding-record-note">
                    학생부 기록, 희망 진로, 활동 가능 범위를 함께 보고 만든 질문입니다. 답변은 3개년 로드맵 설계 조건으로 반영됩니다.
                  </p>
                  {clarificationSummary && (
                    <div className={`banner ${clarificationBlocked ? "banner-warning" : "banner-info"}`}>
                      {clarificationSummary}
                    </div>
                  )}
                  {recordOnlyMode && onboardingRecordParse && (
                    <div className="record-only-summary">
                      <div className="record-only-summary-head">
                        <div>
                          <small>학생부 정리 결과</small>
                          <strong>{onboardingRecordParse.fileName}</strong>
                        </div>
                        <span>{onboardingRecordParse.entries.length}개 활동 · {onboardingRecordParse.courses.length}개 과목</span>
                      </div>
                      <div className="record-only-list">
                        {onboardingRecordParse.entries.slice(0, 12).map((entry) => (
                          <div className="record-only-item" key={entry.id}>
                            <span>{entry.grade}학년 {entry.semester ? `${entry.semester}학기` : ""}</span>
                            <div><strong>{entry.title}</strong><small>{entry.subject || entry.category} · {entry.summary}</small></div>
                          </div>
                        ))}
                        {!onboardingRecordParse.entries.length && <p>구조화할 활동 후보를 찾지 못했습니다. PDF 원문을 다시 확인해주세요.</p>}
                      </div>
                      {onboardingRecordParse.entries.length > 12 && <small className="record-only-more">활동 후보 {onboardingRecordParse.entries.length - 12}개가 더 있습니다.</small>}
                    </div>
                  )}
                  {clarificationQuestions.map((question) => {
                    const selected = readClarificationAnswer(form.roadmapDesignNotes, question.id);
                    return (
                      <div className="branch-question-card" key={question.id}>
                        <div className="branch-question-head">
                          <strong>{question.question}</strong>
                          <small>{question.label}</small>
                        </div>
                        <div className="clarity-choice-row">
                          {question.options.map((option) => (
                            <button
                              className={`clarity-choice${selected.endsWith(option) ? " is-active" : ""}`}
                              key={option}
                              onClick={() => answerClarification(question, option)}
                              type="button"
                            >
                              <strong>{option}</strong>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {!clarificationBlocked && (
                    <div className="form-field">
                      <label htmlFor="ob-roadmap-notes">추가로 꼭 반영할 방향</label>
                      <textarea
                        id="ob-roadmap-notes"
                        value={form.roadmapDesignNotes}
                        onChange={(e) => update("roadmapDesignNotes", e.target.value)}
                        placeholder="예: 1학년 기록은 자연스럽게 이어가되, 2학년부터는 반도체 공정 중심으로 강하게 전환하고 싶음"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="ob-submit-row">
            {step === 1 ? (
              <button
                className="btn btn-primary"
                disabled={!form.name || !form.grade || (!isGraduatedGrade(form.grade) && !form.semester) || !form.targetCareer || !form.careerResolution}
                onClick={() => setStep(2)}
                type="button"
              >
                다음: 탐구 설계하기 →
              </button>
            ) : step === 2 ? (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={() => setStep(1)}
                  type="button"
                >
                  ← 이전으로
                </button>
                <button
                  className="btn btn-primary"
                  disabled={clarificationBusy || onboardingRecordBusy}
                  onClick={prepareClarification}
                  type="button"
                >
                  {onboardingRecordBusy ? "학생부 분석이 끝나면 확인 가능" : clarificationBusy ? "Step1·2 분석 중…" : "다음: 설계 방향 확인 →"}
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={() => setStep(2)}
                  type="button"
                >
                  ← 이전으로
                </button>
                <button
                  className="btn btn-primary"
                  disabled={(!recordOnlyMode && clarificationBlocked) || busy || onboardingRecordBusy || !canPreview}
                  onClick={recordOnlyMode ? confirmOnboarding : createPreview}
                  type="button"
                >
                  {recordOnlyMode ? "학생부 기록으로 메인 화면 보기 →" : clarificationBlocked ? "졸업자 학생부로 진행 불가" : onboardingRecordBusy ? "학생부 분석 대기 중…" : busy ? "로드맵 설계 중…" : "3개년 로드맵 설계하기 →"}
                </button>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Overview
   ────────────────────────────────────────────── */
function Overview({ workspace, onWorkspace, onNavigate }: { workspace: ProductWorkspace; onWorkspace: (workspace: ProductWorkspace) => void; onNavigate: (tab: TabId) => void }) {
  const active = workspace.roadmap.nodes.find((n) => n.status === "active");
  const completed = workspace.roadmap.nodes.filter((n) => n.status === "completed").length;

  function confirmPlan(nodeId: string, planEventId: string, newCategory: RoadmapEventCategory) {
    const node = workspace.roadmap.nodes.find((n) => n.id === nodeId);
    const ev = node?.planEvents?.find((p) => p.id === planEventId);
    if (!node || !ev) return;
    
    const planYear = Number(workspace.profile.grade) > 1 ? new Date().getFullYear() : new Date().getFullYear(); // simplified year
    const date = `${planYear}-${ev.monthDay}`;
    const activityTypeMap: Record<string, string> = {
      "활동": "세특", "상장": "수상", "봉사": "봉사", "독서": "독서", "시험": "시험"
    };
    const newActivity: StudentActivity = {
      id: crypto.randomUUID(),
      studentId: workspace.profile.id,
      activityType: activityTypeMap[newCategory] || "세특",
      subject: ev.subject,
      title: ev.title,
      summary: "",
      concepts: [],
      outputs: ["생활기록부"],
      status: "completed",
      roadmapNodeId: nodeId,
      completedAt: date,
    };
    
    const updatedNodes = workspace.roadmap.nodes.map((n) => 
      n.id === nodeId 
        ? { ...n, planEvents: n.planEvents?.filter((p) => p.id !== planEventId) }
        : n
    );
    
    onWorkspace({
      ...workspace,
      activities: [...workspace.activities, newActivity],
      roadmap: { ...workspace.roadmap, nodes: updatedNodes }
    });
  }

  return (
    <div className="overview-page">
      {/* Current Semester Plans */}
      <section className="mission-hero">
        <div className="mission-content">
          <span className="kicker">THIS SEMESTER</span>
          <h2>이번 학기 목표: {active?.objective ?? "목표 없음"}</h2>
          <div className="mission-meta" style={{ marginTop: 12 }}>
            {active?.competencyGoals.map(g => <span className="mission-meta-chip" key={g}>{g}</span>)}
          </div>
          
          <div className="overview-plans" style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ fontSize: "1rem", color: "var(--fg)" }}>남은 계획 리스트</h3>
            {active?.planEvents && active.planEvents.length > 0 ? (
              active.planEvents.map(ev => (
                <div key={ev.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, background: "var(--bg-elevated)", border: "1px dashed var(--border)", borderRadius: 8 }}>
                  <div>
                    <strong style={{ display: "block" }}>{ev.title}</strong>
                    <small style={{ color: "var(--fg-muted)" }}>{ev.subject} · {ev.monthDay}</small>
                  </div>
                  <select
                    className="plan-confirm-select"
                    onChange={(e) => {
                      if (e.target.value) {
                        confirmPlan(active.id, ev.id, e.target.value as RoadmapEventCategory);
                      }
                    }}
                    value=""
                    style={{
                      padding: "4px 8px", fontSize: "0.8rem",
                      borderRadius: 4, border: "1px solid var(--border)",
                      background: "var(--bg)", color: "var(--fg)", cursor: "pointer"
                    }}
                  >
                    <option value="" disabled>✅ 확정하기</option>
                    <option value="활동">활동</option>
                    <option value="상장">상장</option>
                    <option value="봉사">봉사</option>
                    <option value="독서">독서</option>
                    <option value="시험">시험</option>
                  </select>
                </div>
              ))
            ) : (
              <p style={{ color: "var(--fg-muted)" }}>이번 학기에 계획된 활동이 없습니다.</p>
            )}
          </div>
        </div>
      </section>

      {/* Metrics */}
      <div className="metrics-row">
        <div className="metric-card">
          <small>로드맵 진행</small>
          <strong>{completed} / 6</strong>
          <span>완료 노드</span>
        </div>
        <div className="metric-card">
          <small>활동 메모리</small>
          <strong>{workspace.activities.length}</strong>
          <span>구조화 기록</span>
        </div>
        <div className="metric-card">
          <small>현재 단계</small>
          <strong>{active?.narrativeStage ?? "회고"}</strong>
          <span>{active ? `${active.grade}학년 ${active.semester}학기` : "전체 완료"}</span>
        </div>
        <div className="metric-card">
          <small>정합 기록</small>
          <strong>{workspace.reconciliations.length}</strong>
          <span>계획-실행 비교</span>
        </div>
      </div>

      {/* Grid: DNA + Active Node */}
      <div className="overview-grid">
        {/* DNA Card */}
        <section className="dna-card">
          <div className="dna-card-header">
            <div>
              <span className="kicker">MAJOR NARRATIVE DNA</span>
              <h2>관심분야와 증거를 분리해 보여줘요</h2>
            </div>
            <span className="live-badge">LIVE</span>
          </div>
          <div className="dna-card-body">
            <p className="dna-narrative">{workspace.dna.narrative}</p>
            <div className="dna-cols">
              <div className="dna-col">
                <strong>확인된 사실</strong>
                {workspace.dna.facts.map((fact) => (
                  <div className="dna-fact" key={fact}>{fact}</div>
                ))}
              </div>
              <div className="dna-col">
                <strong>AI 해석</strong>
                {workspace.dna.interpretations.map((item) => (
                  <div className="dna-interp" key={item.statement}>
                    {item.statement}
                    <small>{item.confidence}% · 미확인</small>
                  </div>
                ))}
              </div>
            </div>
            {workspace.dna.riskFlags.length > 0 && (
              <div className="dna-risks">
                {workspace.dna.riskFlags.map((flag) => <span key={flag}>주의 {flag}</span>)}
              </div>
            )}
          </div>
        </section>

        {/* Active Node Card */}
        <section className="active-node-card">
          <div className="active-node-header">
            <div>
              <span className="kicker">ACTIVE ROADMAP NODE</span>
              <h2>{active?.title ?? "로드맵 회고"}</h2>
            </div>
            {active && <StatusBadge status={active.status} />}
          </div>
          <div className="active-node-body">
            <p className="active-node-objective">
              {active?.objective ?? "모든 노드를 검토했습니다. 새로운 진로 방향이 있다면 로드맵을 다시 설계해보세요."}
            </p>
            {active && (
              <div className="subject-chips">
                {active.candidateSubjects.map((s) => (
                  <span className="subject-chip-pill" key={s}>{s}</span>
                ))}
              </div>
            )}
            <button className="btn btn-ghost" onClick={() => onNavigate("roadmap")} type="button">
              전체 로드맵 보기 →
            </button>
          </div>
        </section>
      </div>

      {/* Recent Activities */}
      <section className="recent-card">
        <div className="recent-card-header">
          <div>
            <span className="kicker">RECENT ACTIVITY</span>
            <h2>최근 활동과 정합 결과</h2>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate("activities")} type="button">
            활동 추가
          </button>
        </div>
        {workspace.activities.length ? (
          workspace.activities.slice(0, 3).map((activity) => (
            <div className="activity-compact" key={activity.id}>
              <span className="activity-subj-pill">{activity.subject}</span>
              <div className="activity-compact-info">
                <strong>{activity.title}</strong>
                <small>{activity.completedAt}</small>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <strong>아직 활동이 없습니다</strong>
            <p>첫 활동을 추가하면 DNA와 로드맵 정합이 갱신됩니다.</p>
          </div>
        )}
      </section>
    </div>
  );
}

/* ──────────────────────────────────────────────
   RoadmapView
   ────────────────────────────────────────────── */
function RoadmapView({ workspace, onWorkspace }: { workspace: ProductWorkspace; onWorkspace: (workspace: ProductWorkspace) => void }) {
  const [editing, setEditing] = useState<RoadmapNode | null>(null);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [layoutMode, setLayoutMode] = useState<RoadmapLayoutMode>("map");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [studentNudge, setStudentNudge] = useState(false);
  const [studentHovering, setStudentHovering] = useState(false);
  const [recordFile, setRecordFile] = useState("");
  const [recordParse, setRecordParse] = useState<SchoolRecordParseResult | null>(null);
  const [recordBusy, setRecordBusy] = useState(false);
  const [recordMessage, setRecordMessage] = useState("");
  const [importCategory, setImportCategory] = useState<RoadmapEventCategory>("상장");
  const [summarizingNodeId, setSummarizingNodeId] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  async function summarizeNode(nodeId: string) {
    setSummarizingNodeId(nodeId);
    setError("");
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace }>("/api/roadmaps/summarize-node", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId: workspace.profile.id, nodeId }),
      });
      onWorkspace(result.workspace);
    } catch (e) {
      setError(e instanceof Error ? e.message : "노드 요약을 실패했습니다.");
    } finally {
      setSummarizingNodeId(null);
    }
  }

  function confirmPlan(nodeId: string, planEventId: string, newCategory: RoadmapEventCategory) {
    const node = workspace.roadmap.nodes.find((n) => n.id === nodeId);
    const ev = node?.planEvents?.find((p) => p.id === planEventId);
    if (!node || !ev) return;
    
    // Create new Activity
    const planYear = academicStartYear + node.grade - 1;
    const date = `${planYear}-${ev.monthDay}`;
    // map UI category to backend activityType
    const activityTypeMap: Record<string, string> = {
      "활동": "세특", "상장": "수상", "봉사": "봉사", "독서": "독서", "시험": "시험"
    };
    const newActivity = {
      id: crypto.randomUUID(),
      studentId: workspace.profile.id,
      activityType: activityTypeMap[newCategory] || "세특",
      subject: ev.subject,
      title: ev.title,
      summary: "",
      concepts: [],
      outputs: ["생활기록부"],
      status: "completed",
      roadmapNodeId: nodeId,
      completedAt: date,
    };
    
    // Remove from planEvents
    const updatedNodes = workspace.roadmap.nodes.map((n) => 
      n.id === nodeId 
        ? { ...n, planEvents: n.planEvents?.filter((p) => p.id !== planEventId) }
        : n
    );
    
    onWorkspace({
      ...workspace,
      activities: [...workspace.activities, newActivity],
      roadmap: { ...workspace.roadmap, nodes: updatedNodes }
    });
  }

  const focusedNode = workspace.roadmap.nodes.find((n) => n.id === focusedNodeId) ?? null;
  const currentNode = workspace.roadmap.nodes.find(
    (n) => n.grade === workspace.profile.grade && n.semester === workspace.profile.semester,
  );
  const academicStartYear = new Date().getFullYear() - (workspace.profile.grade - 1);
  const allSubjects = [...new Set([
    ...workspace.roadmap.nodes.flatMap((n) => n.candidateSubjects),
    ...workspace.activities.map((a) => a.subject),
    ...workspace.schoolRecordCourses.map((c) => c.subject),
  ])];
  const recordConnected = workspace.schoolRecordCourses.length > 0 || workspace.activities.some((activity) => activity.outputs.includes("생활기록부"));

  function activitiesForNode(node: RoadmapNode) {
    return workspace.activities.filter(
      (a) => a.roadmapNodeId === node.id || (!a.roadmapNodeId && node.id === currentNode?.id),
    );
  }

  function eventsForNode(node: RoadmapNode): RoadmapTimelineEvent[] {
    const actualEvents = activitiesForNode(node).map((a) => ({
      id: a.id, date: a.completedAt,
      category: activityCategory(a.activityType),
      subject: a.subject, title: a.title, isPlan: false,
    }));
    const planYear = academicStartYear + node.grade - 1;
    const plannedEvents = roadmapPhase(workspace, node) === "past" ? [] :
      (node.planEvents ?? []).map((ev) => ({
        id: ev.id, date: `${planYear}-${ev.monthDay}`,
        category: activityCategory(ev.category), subject: ev.subject, title: ev.title, isPlan: true,
      }));
    const remaining = plannedEvents.filter((plan) => !actualEvents.some((actual) => {
      const dist = Math.abs(new Date(actual.date).getTime() - new Date(plan.date).getTime()) / 86_400_000;
      return actual.category === plan.category && dist <= 21;
    }));
    return [...actualEvents, ...remaining].sort((a, b) => a.date.localeCompare(b.date));
  }

  function applyActivityFilter(events: RoadmapTimelineEvent[]) {
    return activityFilter === "all" ? events : events.filter((ev) => ev.category === activityFilter);
  }

  function visibleEvents(node: RoadmapNode) {
    return applyActivityFilter(eventsForNode(node));
  }

  const focusedEvents = focusedNode ? applyActivityFilter(eventsForNode(focusedNode)) : [];
  const focusedRecords = focusedEvents.filter((ev) => !ev.isPlan);
  const focusedPlans = focusedEvents.filter((ev) => ev.isPlan);
  const focusedImportedSubjects = focusedNode
    ? [...new Set(workspace.schoolRecordCourses
        .filter((c) => c.grade === focusedNode.grade && c.semester === focusedNode.semester)
        .map((c) => c.subject))]
    : [];

  function reconciliationsForNode(node: RoadmapNode) {
    return workspace.reconciliations.filter((log) => log.nodeId === node.id);
  }

  function attentionCount(node: RoadmapNode) {
    const visibleRecordIds = new Set(applyActivityFilter(eventsForNode(node)).filter((ev) => !ev.isPlan).map((ev) => ev.id));
    return reconciliationsForNode(node).filter((log) =>
      ["PARTIAL_MATCH", "DIVERGE", "MISS"].includes(log.matchType),
    ).filter((log) =>
      activityFilter === "all" || visibleRecordIds.has(log.activityId),
    ).length;
  }

  async function analyzeRecordFile(file: File | undefined) {
    if (!file) return;
    if (file.size > SCHOOL_RECORD_MAX_FILE_SIZE) {
      setError(`파일이 너무 큽니다. ${SCHOOL_RECORD_MAX_FILE_SIZE_LABEL} 이하의 PDF를 선택해주세요.`);
      if (uploadRef.current) uploadRef.current.value = "";
      return;
    }
    setRecordBusy(true); setRecordFile(file.name); setRecordMessage(""); setError("");
    try {
      const resultJson = await analyzeSchoolRecordPdf(file, academicStartYear);
      const parsedResult = parseSchoolRecordJson(resultJson, academicStartYear);
      parsedResult.fileName = file.name;

      setRecordParse(parsedResult);
      // 첫 번째 카테고리로 탭 초기화
      setImportCategory("상장");
    } catch (e) { setError(e instanceof Error ? e.message : "생기부를 분석하지 못했습니다."); setRecordFile(""); }
    finally { setRecordBusy(false); if (uploadRef.current) uploadRef.current.value = ""; }
  }

  function updateRecordEntry(id: string, patch: Partial<SchoolRecordDraft>) {
    setRecordParse((cur) => cur ? {
      ...cur, entries: cur.entries.map((e) => e.id === id ? { ...e, ...patch } : e),
    } : cur);
  }

  async function confirmRecordImport() {
    if (!recordParse) return;
    setRecordBusy(true); setError("");
    try {
      const targetEntries = recordParse.entries.filter((e) => e.category === importCategory && e.selected);
      const targetCourses = importCategory === "시험" ? recordParse.courses : [];

      const result = await jsonRequest<{ workspace: ProductWorkspace; importedCount: number }>("/api/school-record/import", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId: workspace.profile.id,
          fileName: recordParse.fileName,
          totalPages: recordParse.totalPages,
          courses: targetCourses,
          entries: targetEntries,
        }),
      });
      onWorkspace(result.workspace);

      const remainingEntries = recordParse.entries.filter((e) => e.category !== importCategory || (e.category === importCategory && !e.selected));
      const remainingCourses = importCategory === "시험" ? [] : recordParse.courses;

      setRecordMessage(`[${importCategory}] 항목 ${result.importedCount}개를 로드맵에 반영했습니다.`);

      if (remainingEntries.length === 0 && remainingCourses.length === 0) {
        setRecordParse(null);
      } else {
        setRecordParse({ ...recordParse, entries: remainingEntries, courses: remainingCourses });
        const nextCat = ROADMAP_CATEGORIES.map((c) => c.category).find((cat) => remainingEntries.some((e) => e.category === cat) || (cat === "시험" && remainingCourses.length > 0));
        if (nextCat) setImportCategory(nextCat);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "생기부 기록을 반영하지 못했습니다."); }
    finally { setRecordBusy(false); }
  }

  async function saveNode() {
    if (!editing) return;
    setBusy(true);
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace }>("/api/roadmaps/nodes", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId: workspace.profile.id, nodeId: editing.id, title: editing.title, objective: editing.objective }),
      });
      onWorkspace(result.workspace); setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : "노드를 수정하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function regenerate() {
    setBusy(true); setError("");
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace }>("/api/roadmaps/regenerate", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ studentId: workspace.profile.id }),
      });
      onWorkspace(result.workspace);
    } catch (e) { setError(e instanceof Error ? e.message : "로드맵을 다시 만들지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function recordMiss(decision: "carry" | "skip") {
    setBusy(true); setError("");
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace }>("/api/roadmaps/checkpoint", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ studentId: workspace.profile.id, decision }),
      });
      onWorkspace(result.workspace); setCheckpointOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "학기 점검을 기록하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return (
    <div className="roadmap-page">
      {/* Header */}
      <div className="roadmap-header">
        <div>
          <span className="kicker">3-YEAR SCHOOL RECORD</span>
          <h1>{workspace.profile.name}의 고교 3개년</h1>
          <p>지나온 학기는 생활기록부의 사실로, 앞으로의 학기는 로드맵 제안으로 이어서 봅니다.</p>
        </div>
        <div className={`record-import-card${recordFile || recordConnected ? " is-connected" : ""}`}>
          <input
            accept=".pdf,application/pdf"
            aria-label="생활기록부 파일 선택"
            hidden
            onChange={(e) => analyzeRecordFile(e.target.files?.[0])}
            ref={uploadRef}
            type="file"
          />
          <span className={`record-dot ${recordBusy ? "record-dot-busy" : recordFile || recordConnected ? "record-dot-connected" : "record-dot-idle"}`} />
          <div className="record-import-info">
            <strong>{recordBusy ? "생기부 분석 중" : recordFile || recordConnected ? "생기부 연결됨" : "생기부 미연결"}</strong>
            <small>{recordFile || (recordConnected ? "분석된 학생부 기록이 메인 화면에 반영되어 있습니다" : "학생부 PDF를 업로드하면 AI가 구조화된 데이터를 자동 추출합니다")}</small>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            disabled={recordBusy}
            onClick={() => uploadRef.current?.click()}
            type="button"
          >
            {recordBusy ? "분석 중…" : recordFile ? "다른 PDF" : "생기부 PDF 분석"}
          </button>
        </div>
      </div>

      {recordMessage && <div className="banner banner-success">✓ {recordMessage} 원본 PDF는 저장하지 않았습니다.</div>}
      {error && !editing && !checkpointOpen && <div className="banner banner-error">{error}</div>}

      {/* Toolbar */}
      <div className="timeline-toolbar">
        <div className="category-legend">
          <button
            className={`legend-item legend-filter${activityFilter === "all" ? " active" : ""}`}
            onClick={() => setActivityFilter("all")}
            type="button"
          >
            <i>ALL</i>전체
          </button>
          {ROADMAP_CATEGORIES.map((item) => (
            <button
              className={`legend-item legend-filter${activityFilter === item.category ? " active" : ""}`}
              key={item.category}
              onClick={() => setActivityFilter(item.category)}
              type="button"
            >
              <i>{item.icon}</i>{item.category}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <div className="view-toggle">
            <button
              className={`toggle-btn${layoutMode === "map" ? " active" : ""}`}
              onClick={() => setLayoutMode("map")}
              type="button"
            >플로우 맵</button>
            <button
              className={`toggle-btn${layoutMode === "board" ? " active" : ""}`}
              onClick={() => setLayoutMode("board")}
              type="button"
            >보드 뷰</button>
          </div>
        </div>
      </div>

      {/* Subject legend */}
      <div className="subject-legend">
        <small>SUBJECT COLOR</small>
        {allSubjects.map((s) => (
          <span className="subj-chip" key={s}>
            <i style={{ background: subjectColor(s) }} />{s}
          </span>
        ))}
      </div>

      {/* Grid Timeline (Board View) */}
      {layoutMode === "board" && (
        <div className="grid-timeline">
        {[1, 2, 3].map((grade) => {
          const year = academicStartYear + grade - 1;
          return (
            <div className={`grid-year-row${grade === workspace.profile.grade ? " is-current-year" : ""}`} key={grade}>
              <div className="grid-year-label">
                <span className="grid-year-num">{grade}</span>
                <span className="grid-year-txt">학년</span>
                <span className="grid-year-range">{year}.03 — {year + 1}.02</span>
              </div>
              <div className="grid-semesters">
                {[1, 2].map((semester) => {
                  const node = workspace.roadmap.nodes.find((n) => n.grade === grade && n.semester === semester);
                  if (!node) return null;
                  const semEvents = visibleEvents(node);
                  return (
                    <div className={`grid-semester phase-${roadmapPhase(workspace, node)}`} key={semester}>
                      <button
                        aria-label={`${grade}학년 ${semester}학기 상세 보기`}
                        className="grid-sem-header"
                        onClick={() => setFocusedNodeId(node.id)}
                        type="button"
                      >
                        <div className="grid-sem-title">
                          <strong>{semester}학기</strong>
                          <span className="grid-sem-stage">{node.narrativeStage}</span>
                        </div>
                        <StatusBadge status={node.status} />
                      </button>
                      
                      <div className="grid-sem-body">
                        {semEvents.length === 0 ? (
                          <div className="grid-sem-empty">표시할 활동이 없습니다.</div>
                        ) : (
                          semEvents.map((ev) => {
                            const cat = ROADMAP_CATEGORIES.find((c) => c.category === ev.category);
                            return (
                              <div
                                className={`grid-event-card ${ev.isPlan ? "is-plan" : "is-record"}`}
                                key={ev.id}
                                style={{ "--subj": subjectColor(ev.subject) } as CSSProperties}
                              >
                                <div className="grid-event-indicator" />
                                <div className="grid-event-icon" style={{ color: subjectColor(ev.subject) }}>
                                  {cat?.icon}
                                </div>
                                <div className="grid-event-content">
                                  <strong className="grid-event-title">{ev.title}</strong>
                                  <div className="grid-event-meta">
                                    <span className="grid-event-subject">{ev.subject}</span>
                                    <span className="grid-event-date">{ev.date.slice(5).replace("-", ".")}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="timeline-footer">
          <span><i className="dot-record" /> 생활기록부 확정 기록 (채워진 카드)</span>
          <span><i className="dot-plan" /> 앞으로의 계획 (점선 테두리 카드)</span>
          <span>학기 헤더를 클릭하면 상세 보기가 열립니다</span>
        </div>
      </div>
      )}

      {/* Narrative Flow Map */}
      {layoutMode === "map" && (
        <div className="narrative-map-section">
          <div className="narrative-map-header">
            <div>
              <span className="kicker">SEMESTER FLOW MAP</span>
              <h2>{workspace.roadmap.careerTrack}로 이어지는 6학기 경로</h2>
              <p>월별 세부 일정 대신, 각 학기에서 쌓은 기록과 앞으로의 계획을 하나의 서사 흐름으로 보여줍니다.</p>
            </div>
            <div className="map-summary">
              <span><strong>{workspace.roadmap.nodes.flatMap((n) => visibleEvents(n)).filter((ev) => !ev.isPlan).length}</strong>기록</span>
              <span><strong>{workspace.roadmap.nodes.flatMap((n) => visibleEvents(n)).filter((ev) => ev.isPlan).length}</strong>계획</span>
              <span><strong>{workspace.roadmap.nodes.reduce((sum, node) => sum + attentionCount(node), 0)}</strong>보정</span>
            </div>
          </div>

          <div className="narrative-flow-canvas">
            <svg aria-hidden="true" className="flow-connector-svg" preserveAspectRatio="none" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="flow-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
                  <stop offset="0%" stopColor="#3182F6" />
                  <stop offset="55%" stopColor="#00A881" />
                  <stop offset="100%" stopColor="#845EF7" />
                </linearGradient>
              </defs>
              <path className="flow-connector-shadow" d={FLOW_CONNECTOR_PATH} />
              <path className="flow-connector-line" d={FLOW_CONNECTOR_PATH} />
            </svg>
            {workspace.roadmap.nodes
              .slice()
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((node, index) => {
                const position = FLOW_POSITIONS[index] ?? { x: 50, y: 50 };
                const phase = roadmapPhase(workspace, node);
                const semEvents = visibleEvents(node);
                const recordCount = semEvents.filter((ev) => !ev.isPlan).length;
                const planCount = semEvents.filter((ev) => ev.isPlan).length;
                const correctionCount = attentionCount(node);
                const isMuted = false;
                const subjects = [...new Set([
                  ...node.candidateSubjects,
                  ...activitiesForNode(node).map((a) => a.subject),
                ])].slice(0, 3);

                return (
                  <button
                    aria-label={`${node.grade}학년 ${node.semester}학기 상세 보기`}
                    className={`flow-node phase-${phase}${isMuted ? " is-muted" : ""}${phase === "current" && studentHovering ? " student-hovering" : ""}`}
                    key={node.id}
                    onClick={() => setFocusedNodeId(node.id)}
                    style={{ left: `${position.x}%`, top: `${position.y}%` } as CSSProperties}
                    type="button"
                  >
                    {phase === "current" && (
                      <span
                        aria-hidden="true"
                        className={`flow-node-student${studentNudge ? " is-playing" : ""}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setStudentNudge(false);
                          window.setTimeout(() => setStudentNudge(true), 0);
                          window.setTimeout(() => setStudentNudge(false), 620);
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onMouseEnter={() => setStudentHovering(true)}
                        onMouseLeave={() => setStudentHovering(false)}
                      >
                        <span className="student-head" />
                        <span className="student-body" />
                        <span className="student-arm student-arm-left" />
                        <span className="student-arm student-arm-right" />
                        <span className="student-leg student-leg-left" />
                        <span className="student-leg student-leg-right" />
                      </span>
                    )}
                    <span className="flow-node-period">{node.grade}-{node.semester}</span>
                    <span className="flow-node-stage">{node.narrativeStage}</span>
                    <strong>{node.title}</strong>
                    <span className="flow-node-objective">{node.objective}</span>
                    <span className="flow-node-stats">
                      <i>{recordCount} 기록</i>
                      <i>{planCount} 계획</i>
                      {correctionCount > 0 && <i className="needs-attention">{correctionCount} 보정</i>}
                    </span>
                    <span className="flow-node-subjects">
                      {subjects.map((subject) => (
                        <em key={subject} style={{ "--subj": subjectColor(subject) } as CSSProperties}>{subject}</em>
                      ))}
                    </span>
                    <span className="flow-node-events">
                      {semEvents.slice(0, 5).map((ev) => (
                        <b
                          className={ev.isPlan ? "is-plan" : "is-record"}
                          key={ev.id}
                          style={{ "--subj": subjectColor(ev.subject) } as CSSProperties}
                          title={ev.title}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
          </div>

          <div className="timeline-footer">
            <span><i className="dot-record" /> 실제 기록</span>
            <span><i className="dot-plan" /> 앞으로의 계획</span>
            <span>학기 노드를 누르면 기록과 계획이 학기 단위로 열립니다</span>
          </div>
        </div>
      )}

      {/* Semester focus modal */}
      {focusedNode && (
        <div className="focus-backdrop" onClick={() => setFocusedNodeId(null)} role="presentation">
          <section
            aria-label={`${focusedNode.grade}학년 ${focusedNode.semester}학기 상세`}
            aria-modal="true"
            className="focus-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="focus-header">
              <div>
                <span className="kicker">SEMESTER FOCUS</span>
                <h2>{focusedNode.grade}학년 {focusedNode.semester}학기</h2>
                <p>{focusedNode.narrativeStage} · {focusedNode.title}</p>
                {focusedNode.status === "skipped" && focusedRecords.length > 0 && focusedNode.title === "기존 활동 기록" && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => summarizeNode(focusedNode.id)}
                    disabled={summarizingNodeId === focusedNode.id}
                    style={{ marginTop: "12px", fontSize: "0.85rem", padding: "6px 12px" }}
                    type="button"
                  >
                    {summarizingNodeId === focusedNode.id ? "AI가 요약하는 중..." : "✨ 기록 바탕으로 AI 학기 요약 생성하기"}
                  </button>
                )}
              </div>
              <button aria-label="닫기" className="focus-close" onClick={() => setFocusedNodeId(null)} type="button">×</button>
            </div>

            <div className="focus-subjects">
              <small>이 학기의 과목</small>
              {(focusedImportedSubjects.length ? focusedImportedSubjects : focusedNode.candidateSubjects).map((s) => (
                <span className="focus-subj-pill" key={s}>
                  <i style={{ background: subjectColor(s) }} />{s}
                </span>
              ))}
            </div>

            <div className="focus-semester-stream">
              <div className="focus-stream-column">
                <div className="focus-stream-head">
                  <span className="kicker">RECORDS</span>
                  <strong>실제 기록</strong>
                </div>
                <div className="focus-stream-list">
                  {focusedRecords.map((ev) => {
                    const cat = ROADMAP_CATEGORIES.find((c) => c.category === ev.category);
                    return (
                      <div className="focus-event" key={ev.id} style={{ "--subj": subjectColor(ev.subject) } as CSSProperties}>
                        <span className="focus-ev-icon">{cat?.icon}</span>
                        <small>{ev.category}</small>
                        <strong>{ev.title}</strong>
                        <em>{ev.subject} · 기록</em>
                      </div>
                    );
                  })}
                  {!focusedRecords.length && <span className="focus-month-empty">아직 이 학기에 연결된 실제 기록이 없습니다.</span>}
                </div>
              </div>

              <div className="focus-stream-column is-plan">
                <div className="focus-stream-head">
                  <span className="kicker">PLANS</span>
                  <strong>앞으로의 계획</strong>
                </div>
                <div className="focus-stream-list">
                  {focusedPlans.map((ev) => {
                    const cat = ROADMAP_CATEGORIES.find((c) => c.category === ev.category);
                    return (
                      <div className="focus-event is-plan" key={ev.id} style={{ "--subj": subjectColor(ev.subject) } as CSSProperties}>
                        <span className="focus-ev-icon">{cat?.icon}</span>
                        <small>{ev.category}</small>
                        <strong>{ev.title}</strong>
                        <em>{ev.subject} · 계획</em>
                        <select
                          className="plan-confirm-select"
                          onChange={(e) => {
                            if (e.target.value && focusedNode) {
                              confirmPlan(focusedNode.id, ev.id, e.target.value as RoadmapEventCategory);
                            }
                          }}
                          value=""
                          style={{
                            marginTop: 8, padding: "4px 8px", fontSize: "0.8rem",
                            borderRadius: 4, border: "1px solid var(--border)",
                            background: "var(--bg)", color: "var(--fg)", cursor: "pointer"
                          }}
                        >
                          <option value="" disabled>✅ 확정하기</option>
                          <option value="활동">활동</option>
                          <option value="상장">상장</option>
                          <option value="봉사">봉사</option>
                          <option value="독서">독서</option>
                          <option value="시험">시험</option>
                        </select>
                      </div>
                    );
                  })}
                  {!focusedPlans.length && <span className="focus-month-empty">추가 계획이 없습니다.</span>}
                </div>
              </div>
            </div>

            <div className="focus-footer">
              <div className="focus-footer-info">
                <span className="kicker">학기 목표</span>
                <p>{focusedNode.objective}</p>
                <div className="focus-goal-chips">
                  {focusedNode.competencyGoals.map((goal) => <span key={goal}>{goal}</span>)}
                </div>
              </div>
              <div className="focus-footer-actions">
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setEditing({ ...focusedNode })} type="button">학기 내용 수정</button>
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setCheckpointOpen(true)} type="button">학기 점검</button>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={regenerate} type="button">새 버전 생성</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* School record review modal */}
      {recordParse && (
        <div className="record-review-overlay" role="presentation">
          <section aria-label="생활기록부 분석 결과" aria-modal="true" className="record-review-panel" role="dialog">
            <div className="record-review-head">
              <div>
                <span className="kicker">SCHOOL RECORD REVIEW</span>
                <h2>분석 결과를 확인해주세요</h2>
                <p>{recordParse.fileName} · {recordParse.totalPages ? `${recordParse.totalPages}쪽 · ` : ""}구조화 데이터 {recordParse.extractedCharacters.toLocaleString()}자</p>
              </div>
              <button aria-label="닫기" className="focus-close" onClick={() => setRecordParse(null)} type="button">×</button>
            </div>
            <div className="record-review-body">
              <div className="rr-privacy-note">
                <strong>원본 파일은 저장하지 않습니다.</strong>
                <span>아래에서 선택한 과목과 활동만 학생 기록에 반영됩니다.</span>
              </div>
              {recordParse.warnings.map((w) => <div className="rr-warning" key={w}>! {w}</div>)}
              <div className="parsed-tabs">
                {ROADMAP_CATEGORIES.map((c) => {
                  const entryCount = recordParse.entries.filter((e) => e.category === c.category).length;
                  const count = entryCount;
                  if (count === 0) return null;
                  
                  return (
                    <button
                      key={c.category}
                      className={`parsed-tab-btn ${importCategory === c.category ? "is-active" : ""}`}
                      onClick={() => setImportCategory(c.category)}
                      type="button"
                      style={{ 
                        padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "6px", 
                        background: importCategory === c.category ? "var(--accent)" : "var(--surface)", 
                        color: importCategory === c.category ? "white" : "inherit",
                        marginRight: "8px", marginBottom: "8px", cursor: "pointer"
                      }}
                    >
                      {c.icon} {c.category} <span style={{ opacity: 0.7, marginLeft: "4px" }}>({count})</span>
                    </button>
                  );
                })}
              </div>

              {importCategory === "시험" && recordParse.courses.length > 0 && (
                <div className="parsed-section">
                  <div className="parsed-section-title">
                    <strong>인식한 교과 성적</strong>
                    <span>{recordParse.courses.length}개</span>
                  </div>
                  <div className="parsed-courses">
                    {recordParse.courses.map((course) => (
                      <span className="parsed-course-pill" key={course.id}>
                        <i style={{ background: subjectColor(course.subject), borderRadius: "3px", height: "8px", width: "14px", display: "inline-block", marginRight: "5px" }} />
                        {course.grade}학년 {course.semester}학기 · {course.subject}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="parsed-section">
                <div className="parsed-section-title">
                  <strong>로드맵에 표시할 [{importCategory}] 활동</strong>
                  <span>{recordParse.entries.filter((e) => e.category === importCategory && e.selected).length}개 선택</span>
                </div>
                <div className="parsed-entries">
                  {recordParse.entries.filter((e) => e.category === importCategory).map((entry) => (
                    <div className={`entry-card${entry.selected ? " is-selected" : ""}`} key={entry.id}>
                      <div className="entry-card-top">
                        <div className="entry-toggle">
                          <input
                            checked={entry.selected}
                            onChange={(e) => updateRecordEntry(entry.id, { selected: e.target.checked })}
                            type="checkbox"
                          />
                          <span>{entry.selected ? "반영" : "제외"}</span>
                        </div>
                        <div className="entry-period">
                          <select aria-label="학년" value={entry.grade} onChange={(e) => updateRecordEntry(entry.id, { grade: Number(e.target.value) })}>
                            <option value={1}>1학년</option><option value={2}>2학년</option><option value={3}>3학년</option>
                          </select>
                          <select aria-label="학기" value={entry.semester} onChange={(e) => updateRecordEntry(entry.id, { semester: Number(e.target.value) })}>
                            <option value={1}>1학기</option><option value={2}>2학기</option>
                          </select>
                          <input aria-label="날짜" type="date" value={entry.completedAt} onChange={(e) => updateRecordEntry(entry.id, { completedAt: e.target.value, dateBasis: "document" })} />
                        </div>
                      </div>
                      <div className="entry-fields">
                        <input aria-label="연계 과목" value={entry.subject} onChange={(e) => updateRecordEntry(entry.id, { subject: e.target.value })} />
                        <input aria-label="활동 제목" value={entry.title} onChange={(e) => updateRecordEntry(entry.id, { title: e.target.value })} />
                      </div>
                      <div className="entry-card-foot">
                        <span className={entry.dateBasis === "document" ? "" : "date-inferred"}>
                          {entry.dateBasis === "document" ? "문서 날짜" : "임시 날짜 · 수정 권장"}
                        </span>
                        <span>신뢰도 {entry.confidence}%</span>
                      </div>
                    </div>
                  ))}
                  {!recordParse.entries.filter((e) => e.category === importCategory).length && (
                    <div className="empty-state">
                      <strong>자동으로 찾은 활동이 없습니다</strong>
                    </div>
                  )}
                </div>
              </div>
              {error && <div className="banner banner-error">{error}</div>}
            </div>
            <div className="record-review-foot">
              <button className="btn btn-secondary" disabled={recordBusy} onClick={() => setRecordParse(null)} type="button">취소</button>
              <button
                className="btn btn-primary"
                disabled={recordBusy || (importCategory === "시험" ? (!recordParse.courses.length && !recordParse.entries.some((e) => e.category === importCategory && e.selected)) : !recordParse.entries.some((e) => e.category === importCategory && e.selected))}
                onClick={confirmRecordImport}
                type="button"
              >
                {recordBusy ? "반영 중…" : `선택한 [${importCategory}] 항목 로드맵에 반영`}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Edit node modal */}
      {editing && (
        <div className="modal-overlay">
          <div className="modal-panel">
            <div className="modal-head">
              <div>
                <span className="kicker">ROADMAP NODE</span>
                <h2>{editing.grade}학년 {editing.semester}학기 수정</h2>
              </div>
              <button className="focus-close" onClick={() => setEditing(null)} type="button">×</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label htmlFor="edit-title">노드 제목</label>
                <input id="edit-title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="edit-objective">목표</label>
                <textarea id="edit-objective" value={editing.objective} onChange={(e) => setEditing({ ...editing, objective: e.target.value })} />
              </div>
              {error && <div className="banner banner-error">{error}</div>}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setEditing(null)} type="button">취소</button>
              <button className="btn btn-primary" disabled={busy} onClick={saveNode} type="button">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* Checkpoint modal */}
      {checkpointOpen && (
        <div className="modal-overlay">
          <div className="modal-panel">
            <div className="modal-head">
              <div>
                <span className="kicker">SEMESTER CHECKPOINT</span>
                <h2>현재 노드를 완료하지 못했나요?</h2>
              </div>
              <button className="focus-close" onClick={() => setCheckpointOpen(false)} type="button">×</button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--muted)", fontSize: "13px", lineHeight: "1.65" }}>
                MISS는 새 활동의 성격이 아니라 예정 시점까지 완료 활동이 없는 상태입니다. 자동으로 실패 처리하지 않고 학생이 이월 또는 건너뛰기를 결정합니다.
              </p>
              {error && <div className="banner banner-error">{error}</div>}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" disabled={busy} onClick={() => recordMiss("carry")} type="button">다음 학기로 이월</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => recordMiss("skip")} type="button">건너뛰고 다음 노드</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   ActivitiesView
   ────────────────────────────────────────────── */
function ActivitiesView({ workspace, onWorkspace, draft, clearDraft }: {
  workspace: ProductWorkspace;
  onWorkspace: (workspace: ProductWorkspace) => void;
  draft: { title: string; summary: string } | null;
  clearDraft: () => void;
}) {
  const [form, setForm] = useState({
    activityType: "활동",
    subject: workspace.profile.preferredSubjects[0] ?? "통합과학",
    title: draft?.title ?? "",
    summary: draft?.summary ?? "",
    concepts: workspace.profile.interests.join(", "),
    outputs: "탐구 보고서",
    completedAt: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastLog, setLastLog] = useState<ReconciliationLog | null>(null);

  async function submit() {
    setBusy(true); setError("");
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace; reconciliation: ReconciliationLog }>("/api/activities", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId: workspace.profile.id,
          activity: { ...form, concepts: splitList(form.concepts), outputs: splitList(form.outputs) },
        }),
      });
      onWorkspace(result.workspace);
      setLastLog(result.reconciliation);
      clearDraft();
      setForm((cur) => ({ ...cur, title: "", summary: "" }));
    } catch (e) { setError(e instanceof Error ? e.message : "활동을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return (
    <div className="activities-page">
      {/* Header */}
      <div className="activities-header">
        <span className="kicker">ACTIVITY MEMORY</span>
        <h1>모든 활동 기록과 정합</h1>
        <p>수행평가를 포함한 모든 활동을 기록하고 생기부와의 일치 여부를 점검합니다.</p>
      </div>

      {/* Form */}
      <div className="activity-form-card">
        <h2>활동 추가</h2>
        <div className="form-grid-3" style={{ marginBottom: "14px" }}>
          <div className="form-field">
            <label htmlFor="act-type">활동 유형</label>
            <select id="act-type" value={form.activityType} onChange={(e) => setForm({ ...form, activityType: e.target.value })}>
              <option>상장</option>
              <option>활동</option>
              <option>봉사</option>
              <option>독서</option>
              <option>시험</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="act-subject">과목</label>
            <input id="act-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <div className="form-field">
            <label htmlFor="act-date">완료일</label>
            <input id="act-date" type="date" value={form.completedAt} onChange={(e) => setForm({ ...form, completedAt: e.target.value })} />
          </div>
        </div>
        <div className="form-field" style={{ marginBottom: "14px" }}>
          <label htmlFor="act-title">활동 제목</label>
          <input id="act-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="활동의 핵심을 한 문장으로" />
        </div>
        <div className="form-field" style={{ marginBottom: "14px" }}>
          <label htmlFor="act-summary">무엇을 어떻게 했나요?</label>
          <textarea id="act-summary" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="탐구 과정, 발견한 내용, 적용한 방법을 간략히 적어주세요" />
        </div>
        <div className="form-grid-2" style={{ marginBottom: "18px" }}>
          <div className="form-field">
            <label htmlFor="act-concepts">핵심 개념 (쉼표로 구분)</label>
            <input id="act-concepts" value={form.concepts} onChange={(e) => setForm({ ...form, concepts: e.target.value })} />
          </div>
          <div className="form-field">
            <label htmlFor="act-outputs">산출물 (쉼표로 구분)</label>
            <input id="act-outputs" value={form.outputs} onChange={(e) => setForm({ ...form, outputs: e.target.value })} />
          </div>
        </div>
        {error && <div className="banner banner-error" style={{ marginBottom: "14px" }}>{error}</div>}
        <button
          className="btn btn-primary"
          disabled={busy || !form.title.trim() || !form.summary.trim()}
          onClick={submit}
          type="button"
        >
          {busy ? "저장·정합 중…" : "활동 저장하고 로드맵과 비교"}
        </button>
      </div>

      {/* Reconciliation result */}
      {lastLog && (
        <div className={`recon-banner ${lastLog.matchType.toLowerCase()}`}>
          <div className="recon-banner-head">
            <span className="recon-type">{lastLog.matchType}</span>
            <span className="recon-conf">신뢰도 {lastLog.confidence}%</span>
          </div>
          <div className="recon-body">
            <p className="recon-rationale">{lastLog.rationale}</p>
            <p className="recon-action">{lastLog.action}</p>
          </div>
        </div>
      )}

      {/* History */}
      <div className="history-cols">
        <div className="history-card">
          <div className="history-card-head">
            <span className="kicker">ACTIVITY MEMORY</span>
            <h2>활동 타임라인</h2>
          </div>
          {workspace.activities.length ? (
            <div className="history-list">
              {workspace.activities.map((activity) => (
                <div className="history-item" key={activity.id}>
                  <time className="history-time">{activity.completedAt}</time>
                  <div className="history-info">
                    <span className="type-pill">{activity.activityType} · {activity.subject}</span>
                    <h3>{activity.title}</h3>
                    <p>{activity.summary}</p>
                    <div className="concept-tags">
                      {activity.concepts.map((c) => <span className="concept-tag" key={c}>{c}</span>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>등록된 활동이 없습니다</strong>
            </div>
          )}
        </div>

        <div className="history-card">
          <div className="history-card-head">
            <span className="kicker">RECONCILIATION LOG</span>
            <h2>정합 판정 이력</h2>
          </div>
          {workspace.reconciliations.length ? (
            <div className="history-list">
              {workspace.reconciliations.map((log) => (
                <div className="recon-log-item" key={log.id}>
                  <div className="recon-log-top">
                    <span className={`recon-log-type ${log.matchType.toLowerCase()}`}>{log.matchType}</span>
                    <span className="recon-log-conf">{log.confidence}%</span>
                  </div>
                  <p className="recon-log-rationale">{log.rationale}</p>
                  <p className="recon-log-action">{log.action}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>첫 활동을 저장하면 판정 근거와 조치가 기록됩니다</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   ProfileView
   ────────────────────────────────────────────── */
function ProfileView({ workspace, onWorkspace }: { workspace: ProductWorkspace; onWorkspace: (workspace: ProductWorkspace) => void }) {
  const [form, setForm] = useState<ProfileForm>({
    name: workspace.profile.name,
    grade: String(workspace.profile.grade),
    semester: String(workspace.profile.semester),
    targetCareer: workspace.profile.targetCareer,
    targetMajors: workspace.profile.targetMajors.join(", "),
    interests: workspace.profile.interests.join(", "),
    motivationTrigger: workspace.profile.motivationTrigger,
    careerResolution: workspace.profile.careerResolution,
    currentEngagement: workspace.profile.currentEngagement.join(", "),
    preferredSubjects: workspace.profile.preferredSubjects.join(", "),
    strengths: workspace.profile.strengths.join(", "),
    gaps: workspace.profile.gaps.join(", "),
    constraints: workspace.profile.constraints.join(", "),
    outputPreference: workspace.profile.outputPreference,
    collaborationStyle: workspace.profile.collaborationStyle,
    roadmapDesignNotes: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((cur) => ({ ...cur, [key]: value }));
  }

  function updateGrade(value: string) {
    setForm((cur) => ({
      ...cur,
      grade: value,
      semester: isGraduatedGrade(value) ? "" : isGraduatedGrade(cur.grade) ? "" : cur.semester,
    }));
  }

  async function save(regenerate: boolean) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace }>("/api/profile", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId: workspace.profile.id, profile: toProfileInput(form) }),
      });
      let nextWorkspace = result.workspace;
      if (regenerate) {
        const regen = await jsonRequest<{ workspace: ProductWorkspace }>("/api/roadmaps/regenerate", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ studentId: workspace.profile.id }),
        });
        nextWorkspace = regen.workspace;
      }
      onWorkspace(nextWorkspace);
      setMessage(regenerate ? "프로필을 저장하고 로드맵 새 버전을 만들었습니다." : "프로필과 Student DNA를 갱신했습니다.");
    } catch (e) { setError(e instanceof Error ? e.message : "프로필을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return (
    <div className="profile-page">
      <div className="profile-header">
        <span className="kicker">MEMORY UPDATE</span>
        <h1>학생 프로필과 진로 변화</h1>
        <p>학생이 직접 입력한 정보가 AI 추론보다 우선합니다. 진로가 바뀌면 기존 로드맵을 덮어쓰지 않고 새 버전으로 만들 수 있어요.</p>
      </div>

      <div className="profile-form-card">
        <div className="form-grid-3" style={{ marginBottom: "20px" }}>
          <div className="form-field">
            <label htmlFor="pf-name">이름</label>
            <input id="pf-name" value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-grade">학년</label>
            <select id="pf-grade" value={form.grade} onChange={(e) => updateGrade(e.target.value)}>
              <option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option><option value="graduated">졸업</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="pf-semester">학기</label>
            <select id="pf-semester" value={form.semester} onChange={(e) => update("semester", e.target.value)} disabled={isGraduatedGrade(form.grade)}>
              <option value="">{isGraduatedGrade(form.grade) ? "해당 없음" : "선택"}</option><option value="1">1학기</option><option value="2">2학기</option>
            </select>
          </div>
        </div>
        <div className="form-grid-2">
          <div className="form-field form-span-2">
            <label htmlFor="pf-career">희망 진로</label>
            <input id="pf-career" value={form.targetCareer} onChange={(e) => update("targetCareer", e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-majors">관심 학과</label>
            <input id="pf-majors" value={form.targetMajors} onChange={(e) => update("targetMajors", e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-interests">관심 키워드</label>
            <textarea id="pf-interests" value={form.interests} onChange={(e) => update("interests", e.target.value)} />
          </div>

          <div className="form-field">
            <label htmlFor="pf-motivation">진로 관심 계기</label>
            <select id="pf-motivation" value={form.motivationTrigger} onChange={(e) => update("motivationTrigger", e.target.value)}>
              <option value="">선택해주세요</option>
              <option value="순수 학문적 호기심과 탐구욕">순수 학문적 호기심과 탐구욕</option>
              <option value="특정 사회 문제나 불편함을 해결하고 싶어서">사회적 문제 해결</option>
              <option value="유망한 산업군이며 직업적 안정성이 높아서">직업적 안정성 / 유망함</option>
              <option value="실생활에서의 직접적인 경험을 통해">실생활에서의 경험</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="pf-resolution">진로 해상도</label>
            <select id="pf-resolution" value={form.careerResolution} onChange={(e) => update("careerResolution", e.target.value)}>
              <option value="">선택해주세요</option>
              <option value="막연히 관심만 가지고 있는 단계">이제 막 관심 생긴 단계</option>
              <option value="관련 도서나 다큐멘터리 등을 찾아보며 알아가는 단계">조금씩 알아가는 단계</option>
              <option value="구체적인 세부 전공과 희망 직업군을 확정한 상태">구체적 목표 확정 단계</option>
            </select>
          </div>
          <div className="form-field form-span-2">
            <label htmlFor="pf-engagement">현재 진행 중인 관련 활동</label>
            <textarea id="pf-engagement" value={form.currentEngagement} onChange={(e) => update("currentEngagement", e.target.value)} />
          </div>

          <div className="form-field">
            <label htmlFor="pf-output">선호 산출물 형태</label>
            <select id="pf-output" value={form.outputPreference} onChange={(e) => update("outputPreference", e.target.value)}>
              <option value="">선택해주세요</option>
              <option value="논문, 보고서, 에세이 등 텍스트 중심">보고서 등 글쓰기</option>
              <option value="코드, 프로토타입, 모형 등 실물 제작">코드/실물 제작</option>
              <option value="발표자료, 인포그래픽 등 시각 자료">PPT 등 시각 자료</option>
              <option value="발표, 토론, 발표회 등 구두 전달">발표/토론 구두 전달</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="pf-collab">팀플 선호 역할</label>
            <select id="pf-collab" value={form.collaborationStyle} onChange={(e) => update("collaborationStyle", e.target.value)}>
              <option value="">선택해주세요</option>
              <option value="팀을 이끌고 계획을 주도하는 리더">리더 (계획 및 주도)</option>
              <option value="새로운 아이디어와 관점을 제시하는 기획자">기획자 (아이디어 제시)</option>
              <option value="주어진 역할을 확실하게 완수하는 팔로워">실행자 (역할 수행)</option>
              <option value="혼자 깊게 몰입하는 개인 연구 선호">개인 연구 선호</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="pf-subjects">선호 과목</label>
            <textarea id="pf-subjects" value={form.preferredSubjects} onChange={(e) => update("preferredSubjects", e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-strengths">강점</label>
            <textarea id="pf-strengths" value={form.strengths} onChange={(e) => update("strengths", e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-gaps">보완 역량</label>
            <textarea id="pf-gaps" value={form.gaps} onChange={(e) => update("gaps", e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-constraints">제약 조건</label>
            <textarea id="pf-constraints" value={form.constraints} onChange={(e) => update("constraints", e.target.value)} />
          </div>
        </div>

        {message && <div className="banner banner-success" style={{ marginTop: "20px" }}>{message}</div>}
        {error   && <div className="banner banner-error"   style={{ marginTop: "20px" }}>{error}</div>}

        <div className="profile-actions">
          <button className="btn btn-secondary" disabled={busy} onClick={() => save(false)} type="button">프로필만 저장</button>
          <button className="btn btn-primary"   disabled={busy} onClick={() => save(true)}  type="button">저장하고 로드맵 새 버전</button>
        </div>
      </div>

      <div className="data-priority-card">
        <span className="kicker">DATA PRIORITY</span>
        <h2>현재 저장 원칙</h2>
        <div className="priority-list">
          {[
            "학생이 직접 입력한 사실",
            "활동 원문에서 추출한 Evidence",
            "학생이 확인한 AI 해석",
            "아직 확인되지 않은 잠정 추론",
          ].map((text, i) => (
            <div className="priority-item" key={text}>
              <span className="priority-num">{i + 1}</span>
              {text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   ProductShell
   ────────────────────────────────────────────── */
function ProductShell({ workspace, onWorkspace, onNewStudent }: {
  workspace: ProductWorkspace;
  onWorkspace: (workspace: ProductWorkspace) => void;
  onNewStudent: () => void;
}) {
  const [tab, setTab] = useState<TabId>("roadmap");
  const [activityDraft, setActivityDraft] = useState<{ title: string; summary: string } | null>(null);
  const initials = workspace.profile.name.slice(-2);

  const tabs: Array<{ id: TabId; label: string; icon: string }> = [
    { id: "roadmap",    label: "3개년 기록",    icon: "3Y" },
    { id: "overview",   label: "이번 학기",     icon: "●" },
    { id: "activities", label: "활동 기록",      icon: "◎"  },
    { id: "profile",    label: "프로필",         icon: "◉"  },
  ];

  function startActivity(title: string, summary: string) {
    setActivityDraft({ title, summary });
    setTab("activities");
  }

  const currentTabLabel = tabs.find((t) => t.id === tab)?.label ?? "";

  return (
    <div className="product-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img alt="세특연구소 로고" src="/logo.png?v=2" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <div className="brand-text">
            <strong>세특연구소 <span style={{ color: 'var(--blue-500)', fontWeight: 800 }}>Pro</span></strong>
            <small>Personal Coach</small>
          </div>
        </div>

        <div className="sidebar-student">
          <div className="student-avatar">{initials}</div>
          <div className="student-info">
            <strong>{workspace.profile.name}</strong>
            <small>{workspace.profile.grade}학년 {workspace.profile.semester}학기 · {workspace.profile.targetCareer}</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          {tabs.map((item) => (
            <button
              className={`nav-btn${tab === item.id ? " active" : ""}`}
              id={`nav-${item.id}`}
              key={item.id}
              onClick={() => setTab(item.id)}
              type="button"
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="new-student-btn" id="btn-new-student" onClick={onNewStudent} type="button">
            ＋ 신규 학생 시작
          </button>
        </div>
      </aside>

      {/* Main */}
      <section className="product-main">
        <header className="product-topbar">
          <div>
            <strong>{currentTabLabel}</strong>
            <small>v{APP_VERSION} · 로드맵 v{workspace.roadmap.version}</small>
          </div>
          <span className="privacy-chip">학생별 데이터 격리</span>
        </header>

        <div className="product-content">
          {tab === "overview"   && <Overview    workspace={workspace} onNavigate={setTab} />}
          {tab === "roadmap"    && <RoadmapView workspace={workspace} onWorkspace={onWorkspace} />}
          {tab === "assignment" && <AssignmentView workspace={workspace} onWorkspace={onWorkspace} onStartActivity={startActivity} />}
          {tab === "activities" && (
            <ActivitiesView
              key={activityDraft?.title ?? "activity-entry"}
              workspace={workspace}
              onWorkspace={onWorkspace}
              draft={activityDraft}
              clearDraft={() => setActivityDraft(null)}
            />
          )}
          {tab === "profile"    && <ProfileView workspace={workspace} onWorkspace={onWorkspace} />}
        </div>
      </section>
    </div>
  );
}

/* ──────────────────────────────────────────────
   WorkspaceApp (Entry Point)
   ────────────────────────────────────────────── */
export function WorkspaceApp() {
  const [workspace, setWorkspace] = useState<ProductWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const studentId = window.localStorage.getItem("seteuk-current-student");
    if (!studentId) { queueMicrotask(() => setLoading(false)); return; }
    jsonRequest<{ workspace: ProductWorkspace }>(`/api/workspace?studentId=${encodeURIComponent(studentId)}`)
      .then((result) => setWorkspace(result.workspace))
      .catch(() => {
        window.localStorage.removeItem("seteuk-current-student");
        setError("이전 작업공간을 찾지 못해 신규 가입 화면으로 돌아왔습니다.");
      })
      .finally(() => setLoading(false));
  }, []);

  const loadingCopy = useMemo(() => (loading ? "학생 작업공간을 불러오는 중…" : ""), [loading]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-brand">
          <span className="brand-mark">세특</span>
          <p>{loadingCopy}</p>
          <div className="loading-dots">
            <span /><span /><span />
          </div>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <>
        <Onboarding onComplete={setWorkspace} />
        {error && <div className="floating-error">{error}</div>}
      </>
    );
  }

  return (
    <ProductShell
      workspace={workspace}
      onWorkspace={setWorkspace}
      onNewStudent={() => {
        window.localStorage.removeItem("seteuk-current-student");
        setWorkspace(null);
      }}
    />
  );
}
