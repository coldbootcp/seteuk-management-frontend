"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, logout, tokens } from "../lib/api-client";
import { handleLegacyRoute, loadWorkspace } from "../lib/workspace-adapter";
import { SignIn } from "./sign-in";
import { ChatView } from "./chat-view";
import type { CSSProperties } from "react";
import type {
  AssignmentAnalysis,
  ActivityReview,
  DnaDiagnosis,
  ProductWorkspace,
  ProfileInput,
  ReconciliationLog,
  Roadmap,
  RoadmapNode,
  RoadmapPlanEvent,
} from "../lib/product-harness";
import { withParticle } from "../lib/product-harness";
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
type TabId = "overview" | "roadmap" | "activities" | "grades" | "portfolio" | "chat" | "profile";

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

type ActivityDraft = {
  title: string;
  subject: string;
  summary?: string;
  planEventId?: string;
  roadmapNodeId?: string;
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
  why?: string;
  selectionMode?: "single" | "multiple";
  options: string[];
};

type ClarificationResponse = {
  summary?: string;
  questions?: ClarificationQuestion[];
  blocked?: boolean;
  complete?: boolean;
  draftChangeSummary?: string;
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
  name: "", grade: "", semester: "", targetCareer: "",
  concreteResearchQuestion: "", knowledgeLevel: "",
  targetMajors: "", interests: "", motivationTrigger: "",
  careerResolution: "",
  currentEngagement: "", preferredSubjects: "", strengths: "", gaps: "", constraints: "",
  outputPreference: "",
  collaborationStyle: "",
  roadmapDesignNotes: "",
};

const APP_VERSION = "0.7.0";
const AI_JUDGEMENT_OPTION = "잘 모르겠음 — AI 판단에 맡길게요";
const OTHER_CLARIFICATION_OPTION = "기타 직접 입력";

const ROADMAP_CATEGORIES: Array<{ category: RoadmapEventCategory; icon: string }> = [
  { category: "계획", icon: "📌" },
  { category: "상장", icon: "A" },
  { category: "활동", icon: "▤" },
  { category: "봉사", icon: "V" },
  { category: "독서", icon: "B" },
  { category: "시험", icon: "E" },
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

function clarificationOptions(question: ClarificationQuestion) {
  const options = question.options.some((option) => option.includes("잘 모르겠") || option.includes("AI 판단"))
    ? question.options
    : [...question.options.slice(0, 3), AI_JUDGEMENT_OPTION];
  return options.some((option) => option === OTHER_CLARIFICATION_OPTION) ? options : [...options, OTHER_CLARIFICATION_OPTION];
}

function clarificationAnswerParts(answer: string) {
  return answer.split(" | ").map((part) => part.trim()).filter(Boolean);
}

function allowsMultipleClarificationAnswers(question: ClarificationQuestion) {
  if (question.selectionMode) return question.selectionMode === "multiple";
  return !/(identity_conflict|grade_conflict|이름 확인|학년 확인)/.test(`${question.id} ${question.label}`);
}

function isGraduatedGrade(value: string) {
  return value === "graduated";
}

function hasSpecificCareerGoal(form: ProfileForm) {
  return form.careerResolution === "구체적인 학과나 직무까지 정한 단계";
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

  return questions;
}

function readClarificationAnswer(notes: string, id: string) {
  return notes.split("\n").find((line) => line.startsWith(`${id}: `))?.slice(id.length + 2) ?? "";
}

function removeClarificationAnswers(notes: string) {
  return notes.split("\n").filter((line) => !/^[a-z][a-z0-9_]*: /i.test(line)).join("\n");
}

function toProfileInput(form: ProfileForm): ProfileInput {
  const useSpecificGoal = hasSpecificCareerGoal(form);
  const branchInterests = [
    form.interests,
    useSpecificGoal && form.knowledgeLevel && `관련 배경지식 수준: ${form.knowledgeLevel}`,
    useSpecificGoal && form.concreteResearchQuestion && `핵심 탐구 질문: ${form.concreteResearchQuestion}`,
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
        isCurrent: false,
        instantiatedActivityId: null,
        planEvents: [],
      };
    }),
  };
}

/**
 * 예전에는 이 앱 안의 /api/* 라우트를 부르는 함수였다. 서버 로직이 전부 백엔드로
 * 옮겨간 뒤로는 어댑터가 그 경로를 백엔드 호출로 바꿔 준다 — 화면 코드를 그대로
 * 두기 위한 얇은 층이다.
 */
async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    return (await handleLegacyRoute(url, options)) as T;
  } catch (error) {
    if (error instanceof ApiError && error.status === 413) {
      throw new Error(`파일이 너무 큽니다. ${SCHOOL_RECORD_MAX_FILE_SIZE_LABEL} 이하의 PDF를 선택해주세요.`);
    }
    throw error instanceof Error ? error : new Error("요청을 처리하지 못했습니다.");
  }
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

const ROADMAP_EVENT_CATEGORIES: readonly RoadmapEventCategory[] = [
  "계획",
  "상장",
  "활동",
  "봉사",
  "독서",
  "시험",
];

/**
 * 갈래 이름을 그대로 받는다. 예전에는 부분 문자열로 찾았는데, 그러면 엉뚱한 곳에
 * 걸린다 — "영**상장**치"가 상장으로 읽히는 사고가 실제로 있었다. 어댑터가 이미
 * 정확한 갈래를 넣어 주므로 추측할 이유가 없다.
 */
function activityCategory(activityType: string): RoadmapEventCategory {
  const exact = ROADMAP_EVENT_CATEGORIES.find((category) => category === activityType);
  return exact ?? "활동";
}

function planTitleWithPriority(title: string, priority?: "core" | "optional") {
  return priority === "core" ? `★ ${title}` : title;
}

function commonSemesterCourseSuggestions(grade: number, semester: number, candidateSubjects: string[]) {
  const common: Record<string, string[]> = {
    "1-1": ["공통국어1", "공통수학1", "공통영어1", "통합사회1", "통합과학1", "한국사1"],
    "1-2": ["공통국어2", "공통수학2", "공통영어2", "통합사회2", "통합과학2", "한국사2"],
    "2-1": ["문학", "독서", "수학Ⅰ", "영어Ⅰ", "확률과 통계", "물리학Ⅰ", "화학Ⅰ", "생명과학Ⅰ", "지구과학Ⅰ"],
    "2-2": ["문학", "독서", "수학Ⅱ", "영어Ⅱ", "확률과 통계", "물리학Ⅰ", "화학Ⅰ", "생명과학Ⅰ", "지구과학Ⅰ"],
    "3-1": ["화법과 언어", "독서", "미적분", "확률과 통계", "영어 독해와 작문", "물리학Ⅱ", "화학Ⅱ", "생명과학Ⅱ", "지구과학Ⅱ"],
    "3-2": ["화법과 언어", "심화국어", "미적분", "확률과 통계", "영어 독해와 작문", "진로 선택 과목"],
  };
  return [...new Set([...candidateSubjects, ...(common[`${grade}-${semester}`] ?? [])])].slice(0, 10);
}

function subjectConceptGuide(subject: string) {
  const guides: Array<[RegExp, string]> = [
    [/화학/, "반응식, 물질의 구조와 성질, 반응 속도·평형, 산화·환원 중 주제와 직접 연결되는 개념"],
    [/물리/, "힘·운동, 에너지, 전기·자기, 파동, 반도체 물성 중 주제와 직접 연결되는 개념"],
    [/생명/, "세포와 항상성, 유전 정보, 생태계, 생명공학의 원리 중 주제와 직접 연결되는 개념"],
    [/지구|환경/, "지구 시스템의 상호작용, 기후 자료, 자원과 환경 영향 중 주제와 직접 연결되는 개념"],
    [/수학/, "함수·변화율, 확률과 통계, 모델링 중 주제를 설명하거나 비교할 수 있는 개념"],
    [/정보|컴퓨터/, "데이터의 수집·처리, 알고리즘, 정보 윤리 중 주제와 직접 연결되는 개념"],
    [/사회|역사|경제|정치/, "이해관계자, 제도·정책, 통계 자료, 사회적 영향 중 주제와 직접 연결되는 관점"],
  ];
  return guides.find(([pattern]) => pattern.test(subject))?.[1] ?? `${subject}에서 배운 핵심 개념 중 이 주제를 설명할 수 있는 개념`;
}

function evidenceGuide(title: string) {
  if (/비교|차이|대조/.test(title)) return "비교할 대상 두 가지와 비교 기준을 먼저 정한 뒤, 차이가 생기는 이유를 근거와 함께 설명하기";
  if (/원리|작동|구조|과정/.test(title)) return "구성 요소와 작동 과정을 순서대로 정리하고, 실제 사례에서 그 원리가 어떻게 드러나는지 확인하기";
  if (/영향|윤리|사회|환경|문제/.test(title)) return "누가 어떤 영향을 받는지 살피고, 장점과 한계를 같은 기준으로 판단하기";
  if (/한계|개선/.test(title)) return "현재 방식이 잘 작동하지 않는 조건을 찾고, 가능한 개선 방향을 근거와 함께 제안하기";
  return "주제와 직접 관련된 사례를 골라, 그 사례가 왜 이 탐구 질문에 적합한 근거인지 설명하기";
}

function subjectConnectionTip(subject: string, plan: RoadmapPlanEvent) {
  const topic = plan.title.replace(/^★\s*/, "");
  const isEtching = /식각|etch/i.test(topic);
  const isLithography = /리소그래피|노광|EUV|포토/i.test(topic);
  const isSemiconductor = /반도체|소자|회로|웨이퍼|공정/i.test(topic);
  if (/수학/.test(subject) && isEtching) {
    return `식각 시간을 x축, 식각 깊이를 y축으로 두고 공개 자료의 값을 표로 정리해 보세요. 서로 다른 재료 두 가지의 식각률(깊이÷시간)을 비교하고, 시간이 길어져도 같은 비율로 깊어지는지 또는 선택비·균일도에 어떤 한계가 생기는지 그래프로 해석하면 ‘식각 공정의 물리적 메커니즘’과 수학적 분석이 직접 연결됩니다.`;
  }
  if (/수학/.test(subject) && isLithography) {
    return `노광량을 x축, 선폭(CD)이나 결함 발생 정도를 y축으로 놓은 공개 그래프를 찾아 읽어보세요. 노광량이 너무 낮거나 높을 때 모두 문제가 생기는 구간을 표시하고, 허용 범위가 왜 좁아지는지 설명하면 리소그래피 주제를 함수·그래프 해석과 자연스럽게 연결할 수 있습니다.`;
  }
  if (/수학/.test(subject) && isSemiconductor) {
    return `주제에서 바꿀 수 있는 조건 하나와 결과 지표 하나를 정하세요. 예를 들어 전압-전류, 저항-온도, 공정 시간-막 두께처럼 두 변수를 표로 정리한 뒤, 증가·감소 구간과 예외가 생기는 조건을 해석해 보세요. 단순 계산보다 ‘어떤 수치를 근거로 판단했는가’를 보여주는 것이 핵심입니다.`;
  }
  if (/물리/.test(subject) && isEtching) {
    return `플라즈마 속 이온이 표면에 충돌하는 과정과 화학 반응으로 물질이 제거되는 과정을 구분해 설명해 보세요. 이온 에너지·입사 방향·표면 결합 중 두 가지를 골라, 왜 식각 방향성이나 표면 손상이 달라지는지 연결하면 물리 과목의 개념이 분명해집니다.`;
  }
  if (/화학/.test(subject) && isEtching) {
    return `건식 식각에서 반응성 기체가 표면과 반응해 휘발성 생성물을 만드는 흐름을 반응물→표면 반응→생성물로 나누어 정리해 보세요. 물리적 충돌에 의한 제거와 화학 반응에 의한 제거를 비교하고, 선택비가 필요한 이유까지 연결하면 화학적 설명이 구체적입니다.`;
  }
  const tips: Array<[RegExp, string]> = [
    [/화학/, `‘${topic}’와 관련된 반응물·조건·생성물을 먼저 표로 정리한 뒤, 조건 하나를 바꾸면 결과가 왜 달라지는지 설명해 보세요. 교과서의 반응식 또는 분자 구조 그림을 출발점으로 쓰고, 실제 사례에서는 어떤 물질의 성질이 중요한지까지 연결하면 좋습니다.`],
    [/물리/, `‘${topic}’에서 작용하는 힘·에너지·전하·파동 중 핵심 원리 두 가지를 고르세요. 각 원리가 실제 결과에 어떤 변화를 만드는지 ‘조건 → 물리량 변화 → 결과’ 순서의 도식으로 정리하면 단순 개념 소개를 넘을 수 있습니다.`],
    [/수학/, `‘${topic}’에서 조절되는 조건 하나와 결과 지표 하나를 정해 공개 자료의 수치를 표로 옮겨 보세요. x축과 y축을 직접 정하고, 그래프의 증가·감소·변곡 또는 예외 구간을 찾아 왜 그런 패턴이 나왔는지 설명하면 됩니다.`],
    [/생명/, `‘${topic}’를 세포·기관·생태계 중 어느 수준에서 볼지 먼저 정하세요. 그 수준에서 일어나는 구조 변화 또는 상호작용을 한 과정도로 그린 뒤, 실제 사례가 그 과정의 어느 단계에 영향을 주는지 근거와 함께 설명해 보세요.`],
    [/정보|컴퓨터/, `‘${topic}’와 관련된 자료를 항목·단위·출처로 나눈 작은 데이터 표부터 만드세요. 그 뒤 어떤 기준으로 분류하거나 비교했는지 적고, 데이터가 부족하거나 편향될 수 있는 지점도 함께 점검하면 정보 과목의 탐구가 됩니다.`],
    [/사회|역사|경제|정치/, `‘${topic}’의 영향을 받는 집단을 최소 두 곳으로 나누고, 각 집단이 얻는 이익과 부담을 표로 비교해 보세요. 기사·통계·제도 자료 중 하나를 근거로 삼아 어떤 판단 기준이 공정한지까지 제안하면 좋습니다.`],
  ];
  return tips.find(([pattern]) => pattern.test(subject))?.[1]
    ?? `${subject}에서 다루는 핵심 개념 하나를 출발점으로 ‘${topic}’를 설명해 보세요. 이 주제가 왜 그 과목의 질문으로도 의미가 있는지 사례와 근거를 함께 제시하면 됩니다.`;
}

function planDetailGuide(plan: RoadmapPlanEvent, node: RoadmapNode, courseSubjects: string[] = []) {
  const relatedSubjects = [...new Set(courseSubjects.length ? courseSubjects : [plan.subject, ...node.candidateSubjects])].slice(0, 6);
  const conceptGuide = subjectConceptGuide(plan.subject);
  const sourceGuide = evidenceGuide(plan.title);
  const keywords = [...new Set([
    plan.subject,
    plan.title,
    ...node.competencyGoals,
    ...conceptGuide.split(/,|·/).map((keyword) => keyword.trim()).filter((keyword) => keyword.length < 16),
  ])].slice(0, 6);
  return {
    role: `${node.grade}학년 ${node.semester}학기 ‘${node.narrativeStage}’ 단계에서 ${node.objective}`,
    contents: [
      `탐구의 중심을 ‘${plan.title}’로 분명히 정하고, ${plan.description || "왜 이 질문을 살펴볼 가치가 있는지"}를 첫 부분에 제시하기`,
      `${plan.subject} 개념 중 ${conceptGuide}을(를) 골라 주제와 연결하기`,
      sourceGuide,
    ],
    relatedSubjects,
    keywords,
    formats: [
      "수행평가 탐구 보고서", "수업 발표 자료", "교과 심화 탐구", "교내 대회 주제",
    ],
  };
}

function PlanDetailModal({ plan, node, courseSubjects, onClose, onConvertPlan }: {
  plan: RoadmapPlanEvent;
  node: RoadmapNode;
  courseSubjects?: string[];
  onClose: () => void;
  onConvertPlan: (draft: ActivityDraft) => void;
}) {
  const guide = planDetailGuide(plan, node, courseSubjects);
  const [selectedSubject, setSelectedSubject] = useState(plan.subject);
  const connectionTip = subjectConnectionTip(selectedSubject, plan);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <section aria-label="활동 주제 상세 안내" aria-modal="true" className="modal-panel plan-detail-panel" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="modal-head">
          <div>
            <span className="kicker">TOPIC GUIDE</span>
            <h2>{planTitleWithPriority(plan.title, plan.priority)}</h2>
            <p>{plan.description || "이 학기 목표와 연결되는 탐구 주제입니다."}</p>
          </div>
          <button aria-label="닫기" className="focus-close" onClick={onClose} type="button">×</button>
        </div>
        <div className="modal-body plan-detail-body">
          <p className="plan-detail-note">아래 내용은 학교에서 생긴 수행평가·발표·대회 등의 기회에 맞춰 골라 쓰는 추천입니다. 특정 형식을 반드시 해야 한다는 뜻은 아닙니다.</p>
          <section>
            <h3>로드맵에서의 역할</h3>
            <p>{guide.role}</p>
          </section>
          <section>
            <h3>이 주제에 담으면 좋은 내용</h3>
            <ul>{guide.contents.map((content) => <li key={content}>{content}</li>)}</ul>
          </section>
          <section>
            <h3>연결을 우선 검토할 과목</h3>
            <div className="focus-goal-chips plan-subject-selector">
              {guide.relatedSubjects.map((subject) => (
                <button className={selectedSubject === subject ? "is-selected" : ""} key={subject} onClick={() => setSelectedSubject(subject)} type="button">{subject}</button>
              ))}
            </div>
            <div className="plan-subject-tip">
              <strong>{selectedSubject} 연결 팁</strong>
              <p>{connectionTip}</p>
            </div>
          </section>
          <section>
            <h3>학교 기회에 따라 활용할 수 있는 형식</h3>
            <div className="focus-goal-chips">{guide.formats.map((format) => <span key={format}>{format}</span>)}</div>
          </section>
          <section>
            <h3>탐구 키워드</h3>
            <div className="focus-goal-chips">{guide.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
          </section>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose} type="button">닫기</button>
          <button className="btn btn-primary" onClick={() => onConvertPlan({ title: plan.title, subject: plan.subject, planEventId: plan.id, roadmapNodeId: node.id })} type="button">이 주제를 실제 활동에 연결</button>
        </div>
      </section>
    </div>
  );
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
    // 백엔드가 실제로 쓰는 값. 이 둘이 빠져 있어 완료·부분달성 마디의 배지가
    // undefined를 읽고 있었다.
    partial:      { label: "일부 달성", cls: "badge-active"  },
    done:         { label: "완료",     cls: "badge-done"    },
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
  const [clarificationComplete, setClarificationComplete] = useState(false);
  const [roadmapHypothesis, setRoadmapHypothesis] = useState<Roadmap | null>(null);
  const [clarificationAnswers, setClarificationAnswers] = useState<Array<{ id: string; question: string; answer: string }>>([]);
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

  function updateCareerResolution(value: string) {
    setForm((current) => value === "넓은 분야만 정한 단계"
      ? { ...current, careerResolution: value, knowledgeLevel: "", concreteResearchQuestion: "" }
      : { ...current, careerResolution: value });
  }

  function addListValue(key: "targetMajors" | "interests", value: string) {
    setForm((cur) => {
      const values = splitList(cur[key]);
      if (values.includes(value)) return cur;
      return { ...cur, [key]: [...values, value].join(", ") };
    });
  }

  function answerClarification(question: ClarificationQuestion, answer: string) {
    setClarificationAnswers((current) => [
      ...current.filter((item) => item.id !== question.id),
      { id: question.id, question: question.question, answer },
    ]);
    setForm((cur) => {
      const next = { ...cur };
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

  function chooseClarificationOption(question: ClarificationQuestion, option: string) {
    const current = clarificationAnswers.find((answer) => answer.id === question.id)?.answer ?? "";
    if (!allowsMultipleClarificationAnswers(question)) {
      answerClarification(question, option);
      return;
    }
    const parts = clarificationAnswerParts(current);
    const hasOption = option === OTHER_CLARIFICATION_OPTION ? parts.some((part) => part.startsWith("기타")) : parts.includes(option);
    const next = hasOption
      ? parts.filter((part) => option === OTHER_CLARIFICATION_OPTION ? !part.startsWith("기타") : part !== option)
      : [...parts, option];
    answerClarification(question, next.join(" | "));
  }

  function updateOtherClarificationAnswer(question: ClarificationQuestion, value: string) {
    const current = clarificationAnswers.find((answer) => answer.id === question.id)?.answer ?? "";
    const parts = clarificationAnswerParts(current);
    const nextOther = value.trim() ? `기타: ${value}` : OTHER_CLARIFICATION_OPTION;
    const next = parts.some((part) => part.startsWith("기타"))
      ? parts.map((part) => part.startsWith("기타") ? nextOther : part)
      : [...parts, nextOther];
    answerClarification(question, allowsMultipleClarificationAnswers(question) ? next.join(" | ") : nextOther);
  }

  function roadmapProfile(includeClarificationAnswers = true) {
    const answerNotes = includeClarificationAnswers
      ? clarificationAnswers.map((answer) => `${answer.question} / ${answer.answer}`)
      : [];
    return toProfileInput({
      ...form,
      roadmapDesignNotes: [removeClarificationAnswers(form.roadmapDesignNotes), ...answerNotes].filter(Boolean).join("\n"),
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
        const result = await jsonRequest<{ majors?: string[]; keywords?: string[]; provider?: "deepseek" | "fallback" }>(
          "/api/onboarding/suggest",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ targetCareer: topic }),
          },
        );
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
    if (!clarificationComplete) {
      setError("확인 질문의 답변을 반영한 뒤, AI가 추가 확인이 필요 없다고 판단하면 최종 로드맵 초안을 보여드릴게요.");
      return;
    }
    setBusy(true); setError("");
    try {
      const result = await jsonRequest<typeof preview>("/api/onboarding/preview", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(roadmapProfile()),
      });
      setPreview(result);
    } catch (e) { setError(e instanceof Error ? e.message : "로드맵을 만들지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function prepareClarification(restart = false) {
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
      setClarificationComplete(false);
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
      let hypothesis = restart ? null : roadmapHypothesis;
      if (!hypothesis) {
        const candidate = await jsonRequest<{ roadmap: Roadmap }>("/api/onboarding/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(roadmapProfile(!restart)),
        });
        hypothesis = candidate.roadmap;
        setRoadmapHypothesis(candidate.roadmap);
      }
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
            concreteResearchQuestion: hasSpecificCareerGoal(form) ? form.concreteResearchQuestion : "",
            knowledgeLevel: hasSpecificCareerGoal(form) ? form.knowledgeLevel : "",
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
          roadmapHypothesis: hypothesis,
          answers: restart ? [] : clarificationAnswers,
        }),
      });
      if (result.blocked) {
        setClarificationQuestions([]);
        setClarificationBlocked(true);
        setClarificationComplete(false);
        setClarificationSummary(result.summary || "업로드한 학생부가 졸업자 학생부로 확인되어 진행할 수 없습니다.");
        setStep(3);
        return;
      }
      const questions = Array.isArray(result.questions) ? result.questions : fallbackQuestions;
      setClarificationQuestions(questions);
      setClarificationComplete(Boolean(result.complete) && questions.length === 0);
      setClarificationSummary(result.draftChangeSummary
        ? `${result.summary || ""} ${result.draftChangeSummary}`.trim()
        : result.summary || "");
      setStep(3);
    } catch {
      setClarificationQuestions(fallbackQuestions);
      setClarificationComplete(false);
      setClarificationSummary(onboardingRecordParse
        ? "학생부의 기존 기록과 Step1·2 입력을 기준으로 확인 질문을 만들었습니다."
        : "Step1·2 입력을 기준으로 로드맵 구조 확인 질문을 만들었습니다.");
      setStep(3);
    } finally {
      setClarificationBusy(false);
    }
  }

  function continueClarification() {
    const unanswered = clarificationQuestions.some((question) => !clarificationAnswers.some((answer) => answer.id === question.id && answer.answer));
    if (unanswered) {
      setError("이번 확인 질문에 모두 답해주시면 답변을 반영해 다시 검토할게요.");
      return;
    }
    void prepareClarification();
  }

  function startClarification() {
    setRoadmapHypothesis(null);
    setClarificationAnswers([]);
    setClarificationComplete(false);
    setForm((current) => ({ ...current, roadmapDesignNotes: removeClarificationAnswers(current.roadmapDesignNotes) }));
    void prepareClarification(true);
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
    setClarificationComplete(false);
    setRoadmapHypothesis(null);
    setClarificationAnswers([]);
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
      setClarificationComplete(false);
      setRoadmapHypothesis(null);
      setClarificationAnswers([]);
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
    setClarificationComplete(false);
    setRoadmapHypothesis(null);
    setClarificationAnswers([]);
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
                        : onboardingRecordFile || "올리면 이름과 마지막 확정 학년을 읽어 기본 정보를 자동 입력합니다. 업로드한 원본은 계정에 보관됩니다."}
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
                          onClick={() => updateCareerResolution(item.value)}
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
              {/* 현실 제약만 확인 */}
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
                    AI가 현재 입력을 바탕으로 1차 로드맵 가설을 내부에서 만들었습니다. 그 가설의 학기 전략·대표 활동·증거 방식이 달라질 수 있는 질문만 확인하고, 답변 뒤에도 필요한 질문이 있으면 계속 이어갑니다.
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
                    const selected = clarificationAnswers.find((answer) => answer.id === question.id)?.answer ?? readClarificationAnswer(form.roadmapDesignNotes, question.id);
                    const selectedParts = clarificationAnswerParts(selected);
                    const otherSelected = selectedParts.some((part) => part.startsWith("기타"));
                    const otherValue = selectedParts.find((part) => part.startsWith("기타:"))?.replace(/^기타:\s*/, "") ?? "";
                    return (
                      <div className="branch-question-card" key={question.id}>
                        <div className="branch-question-head">
                          <strong>{question.question}</strong>
                          <small>{question.label}</small>
                        </div>
                        {question.why && <p className="onboarding-record-note">이 답이 필요한 이유: {question.why}</p>}
                        <div className="clarity-choice-row">
                          {clarificationOptions(question).map((option) => (
                            <button
                              className={`clarity-choice${(option === OTHER_CLARIFICATION_OPTION ? otherSelected : selectedParts.includes(option)) ? " is-active" : ""}`}
                              key={option}
                              onClick={() => chooseClarificationOption(question, option)}
                              type="button"
                            >
                              <strong>{option}</strong>
                            </button>
                          ))}
                        </div>
                        {allowsMultipleClarificationAnswers(question) && <small className="onboarding-record-note">복수 선택 가능</small>}
                        {otherSelected && (
                          <div className="form-field" style={{ marginTop: 10 }}>
                            <label htmlFor={`other-${question.id}`}>직접 입력</label>
                            <input id={`other-${question.id}`} value={otherValue} onChange={(event) => updateOtherClarificationAnswer(question, event.target.value)} placeholder="선택지에 없는 내용을 적어주세요" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!clarificationBlocked && clarificationComplete && (
                    <div className="form-field">
                      <label htmlFor="ob-roadmap-notes">선택지에 없던 추가 조건 (선택)</label>
                      <small className="onboarding-record-note">위에서 선택한 답변은 자동으로 반영됩니다. 여기에는 선택지에 없던 학교 상황이나 꼭 지켜야 할 방향만 적어주세요.</small>
                      <textarea
                        id="ob-roadmap-notes"
                        value={form.roadmapDesignNotes}
                        onChange={(e) => update("roadmapDesignNotes", e.target.value)}
                        placeholder="예: 2학기에는 과학 과목에서만 새 주제를 시도할 수 있음"
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
                  onClick={startClarification}
                  type="button"
                >
                  {onboardingRecordBusy ? "학생부 분석이 끝나면 확인 가능" : clarificationBusy ? "1차 로드맵 가설 만드는 중…" : "다음: 설계 방향 확인 →"}
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
                  disabled={(!recordOnlyMode && clarificationBlocked) || busy || clarificationBusy || onboardingRecordBusy || !canPreview}
                  onClick={recordOnlyMode ? confirmOnboarding : clarificationComplete ? createPreview : continueClarification}
                  type="button"
                >
                  {recordOnlyMode ? "학생부 기록으로 메인 화면 보기 →" : clarificationBlocked ? "졸업자 학생부로 진행 불가" : onboardingRecordBusy ? "학생부 분석 대기 중…" : clarificationBusy ? "답변 반영해 다시 검토 중…" : busy ? "로드맵 설계 중…" : clarificationComplete ? "최종 로드맵 초안 보기 →" : "답변 반영하고 다시 검토하기 →"}
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
function Overview({ workspace, onNavigate, onConvertPlan }: { workspace: ProductWorkspace; onNavigate: (tab: TabId) => void; onConvertPlan: (draft: ActivityDraft) => void }) {
  const active = workspace.roadmap.nodes.find((n) => n.isCurrent)
    ?? workspace.roadmap.nodes.find((n) => n.status === "active");
  // 백엔드가 쓰는 값은 done/partial이다. "completed"만 세면 실제로 달성한 학기가
  // 있어도 진행이 0으로 표시된다.
  const completed = workspace.roadmap.nodes.filter((n) => n.status === "done").length;
  const [selectedPlan, setSelectedPlan] = useState<RoadmapPlanEvent | null>(null);
  const completedPlanIds = new Set(workspace.activities.map((activity) => activity.planEventId).filter(Boolean));

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
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <h3 style={{ fontSize: "1rem", color: "var(--fg)" }}>이번 학기 활동 주제 제안</h3>
              <small style={{ color: "var(--fg-muted)" }}>★ 먼저 검토하면 좋은 주제</small>
            </div>
            {active?.planEvents && active.planEvents.length > 0 ? (
              active.planEvents.map((ev) => (
                <div
                  className="overview-plan-card"
                  key={ev.id}
                  onClick={() => setSelectedPlan(ev)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedPlan(ev); } }}
                  role="button"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, background: "var(--bg-elevated)", border: "1px dashed var(--border)", borderRadius: 8, cursor: "pointer" }}
                  tabIndex={0}
                >
                  <div>
                    <strong style={{ display: "block" }}>{planTitleWithPriority(ev.title, ev.priority)}{completedPlanIds.has(ev.id) && <small className="plan-completed-label">완료</small>}</strong>
                    <small style={{ color: "var(--fg-muted)" }}>연결 과목 {ev.subject}</small>
                    <p style={{ color: "var(--fg-muted)", margin: "6px 0 0", fontSize: "0.82rem", lineHeight: 1.5 }}>{ev.description || "이 학기의 목표와 연결되는 탐구 주제입니다."}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                    <button className="btn btn-secondary" onClick={(event) => { event.stopPropagation(); onConvertPlan({ title: ev.title, subject: ev.subject, planEventId: ev.id, roadmapNodeId: active.id }); }} type="button">이 주제를 실제 활동에 연결</button>
                  </div>
                </div>
              ))
            ) : (
              <p style={{ color: "var(--fg-muted)" }}>이번 학기에 제안된 활동 주제가 없습니다.</p>
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
                <small>{activity.completedAt || activity.periodLabel}</small>
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
      {selectedPlan && active && <PlanDetailModal plan={selectedPlan} node={active} courseSubjects={workspace.semesterCourses.filter((course) => course.roadmapNodeId === active.id).map((course) => course.subject)} onClose={() => setSelectedPlan(null)} onConvertPlan={onConvertPlan} />}
    </div>
  );
}

/* ──────────────────────────────────────────────
   RoadmapView
   ────────────────────────────────────────────── */
function RoadmapView({ workspace, onWorkspace, onConvertPlan }: { workspace: ProductWorkspace; onWorkspace: (workspace: ProductWorkspace) => void; onConvertPlan: (draft: ActivityDraft) => void }) {
  const [editing, setEditing] = useState<RoadmapNode | null>(null);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [layoutMode, setLayoutMode] = useState<RoadmapLayoutMode>("map");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<{ plan: RoadmapPlanEvent; node: RoadmapNode } | null>(null);
  const [studentNudge, setStudentNudge] = useState(false);
  const [studentHovering, setStudentHovering] = useState(false);
  const [recordFile, setRecordFile] = useState("");
  const [recordParse, setRecordParse] = useState<SchoolRecordParseResult | null>(null);
  const [recordBusy, setRecordBusy] = useState(false);
  const [recordMessage, setRecordMessage] = useState("");
  // state가 아니라 ref다. state로 두면 이 값을 바꾸는 순간 리렌더가 일어나고,
  // 복구 effect의 cleanup이 돌면서 자기가 띄운 요청을 스스로 취소해 버린다.
  const recordRestored = useRef(false);
  // 이미 반영한 항목. 화면의 카테고리(상장·활동·봉사·독서·시험)와 백엔드의 영역은
  // 1:1이 아니다 — 이름에 "봉사"가 든 활동은 봉사 탭에 보이지만 실제로는 activities
  // 영역에 있다. 그래서 한 카테고리만 보내면 백엔드가 그 영역을 "이게 전부"로 알고
  // 앞서 반영한 것을 지운다. 반영한 것을 모아 두었다가 매번 함께 보낸다.
  const importedEntries = useRef<Map<string, SchoolRecordDraft>>(new Map());
  const [gradeImportConflicts, setGradeImportConflicts] = useState<Array<{ courseId: string; grade: number; semester: number; subject: string; currentRank: number; importedRank: number }>>([]);
  const [gradeImportChoices, setGradeImportChoices] = useState<Record<string, "keep" | "replace">>({});
  const [courseDraft, setCourseDraft] = useState("");
  const [courseBusy, setCourseBusy] = useState(false);
  const [courseManagerOpen, setCourseManagerOpen] = useState(false);
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

  const focusedNode = workspace.roadmap.nodes.find((n) => n.id === focusedNodeId) ?? null;
  const currentNode = workspace.roadmap.nodes.find(
    (n) => n.grade === workspace.profile.grade && n.semester === workspace.profile.semester,
  );
  const academicStartYear = new Date().getFullYear() - (workspace.profile.grade - 1);

  // 파싱은 몇 분 걸린다. 그 사이 새로고침하면 예전에는 검토 화면을 통째로 잃었다 —
  // 업로드 id도 파싱 결과도 이 컴포넌트의 state에만 있었기 때문이다. 백엔드는
  // 마지막 업로드와 그 결과를 갖고 있으므로 화면을 그릴 때 되찾는다.
  useEffect(() => {
    if (recordRestored.current) return;
    recordRestored.current = true;
    (async () => {
      try {
        const { latest } = await jsonRequest<{
          latest: {
            uploadId: string;
            status: string;
            fileName: string | null;
            importedAt: string | null;
            error: string | null;
            result: unknown;
          } | null;
        }>("/api/school-record/latest");
        if (!latest) return;
        if (latest.fileName) setRecordFile(latest.fileName);
        if (latest.status === "failed") {
          setError(latest.error || "생기부 분석에 실패했습니다.");
          return;
        }
        // 이미 반영을 마친 업로드는 검토할 것이 없다 — 연결됨 상태만 보이면 된다.
        if (latest.status !== "done" || latest.importedAt || !latest.result) return;
        const parsed = parseSchoolRecordJson(latest.result, academicStartYear);
        parsed.fileName = latest.fileName ?? parsed.fileName;
        importedEntries.current = new Map();
        setRecordParse(parsed);
      } catch (e) {
        // 되찾기는 부가 기능이라 화면을 막지는 않지만, 조용히 삼키면 왜 검토 화면이
        // 안 뜨는지 알 길이 없다.
        console.warn("마지막 생기부 업로드를 되찾지 못했습니다", e);
      }
    })();
  }, [academicStartYear]);
  const allSubjects = [...new Set([
    ...workspace.roadmap.nodes.flatMap((n) => n.candidateSubjects),
    ...workspace.activities.map((a) => a.subject),
    ...workspace.schoolRecordCourses.map((c) => c.subject),
  ])];
  const recordConnected = workspace.schoolRecordCourses.length > 0 || workspace.activities.some((activity) => activity.outputs.includes("생활기록부"));
  const completedPlanIds = new Set(workspace.activities.map((activity) => activity.planEventId).filter(Boolean));

  function activitiesForNode(node: RoadmapNode) {
    // 학기를 아는 기록은 그 학기 마디에만 놓는다. 자율활동·동아리활동처럼 생기부가
    // 학기를 나누지 않는 기록은 그 학년의 두 학기에 함께 보여준다 — 어느 한 학기의
    // 것이 아니므로 한쪽에만 놓으면 나머지 학기가 근거 없이 비어 보인다.
    // 시점을 아예 알 수 없는 기록(날짜 없는 수상 등)은 어느 학기에도 놓지 않는다.
    return workspace.activities.filter(
      (a) =>
        a.roadmapNodeId === node.id ||
        (a.roadmapNodeId === null && a.semester === null && a.grade === node.grade),
    );
  }

  function eventsForNode(node: RoadmapNode): RoadmapTimelineEvent[] {
    const actualEvents = activitiesForNode(node).map((a) => ({
      id: a.id, date: a.completedAt,
      category: activityCategory(a.activityType),
      subject: a.subject || a.activityCategory, title: a.title, isPlan: false,
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
  const focusedPlanIds = new Set(focusedEvents.filter((ev) => ev.isPlan).map((ev) => ev.id));
  const focusedPlans = focusedNode ? (focusedNode.planEvents ?? []).filter((ev) => focusedPlanIds.has(ev.id)) : [];
  const focusedSemesterCourses = focusedNode ? workspace.semesterCourses.filter((course) => course.roadmapNodeId === focusedNode.id) : [];
  const suggestedSemesterCourses = focusedNode
    ? commonSemesterCourseSuggestions(focusedNode.grade, focusedNode.semester, focusedNode.candidateSubjects)
      .filter((subject) => !focusedSemesterCourses.some((course) => course.subject === subject))
    : [];

  async function addFocusedCourse(subject = courseDraft) {
    const normalizedSubject = subject.trim();
    // courseBusy(state)만으로는 부족하다 — 한글 입력 중 마지막 글자를 조합
    // 확정하며 누른 Enter가 keydown을 두 번(조합 확정용 + 실제 Enter) 낼 수
    // 있는데, 두 번째 호출이 state 갱신 전에 통과하면 같은 과목이 두 번 추가된다.
    if (!focusedNode || !normalizedSubject || courseBusy) return;
    setCourseBusy(true); setError("");
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace }>("/api/semester-courses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId: workspace.profile.id, roadmapNodeId: focusedNode.id, subject: normalizedSubject }),
      });
      onWorkspace(result.workspace); setCourseDraft("");
    } catch (e) { setError(e instanceof Error ? e.message : "과목을 추가하지 못했습니다."); }
    finally { setCourseBusy(false); }
  }

  async function removeFocusedCourse(courseId: string) {
    setCourseBusy(true); setError("");
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace }>("/api/semester-courses", {
        method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ studentId: workspace.profile.id, courseId }),
      });
      onWorkspace(result.workspace);
    } catch (e) { setError(e instanceof Error ? e.message : "과목을 삭제하지 못했습니다."); }
    finally { setCourseBusy(false); }
  }

  function closeFocusedNode() {
    setCourseManagerOpen(false);
    setFocusedNodeId(null);
  }

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

      // index는 이 파싱 결과 안에서만 유효하므로 지난 누적을 버린다.
      importedEntries.current = new Map();
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

  async function confirmRecordImport(courseGradeChoices?: Record<string, "keep" | "replace">) {
    if (!recordParse) return;
    const targetEntries = recordParse.entries.filter((e) => e.category === importCategory && e.selected);
    const targetCourses = importCategory === "시험" ? recordParse.courses : [];
    const isPastPeriod = (grade: number, semester: number) =>
      grade < workspace.profile.grade || (grade === workspace.profile.grade && semester < workspace.profile.semester);
    const currentCourses = new Map(workspace.semesterCourses.map((course) => [`${course.grade}-${course.semester}-${course.subject}`, course]));
    const currentGrades = new Map(workspace.courseGrades.map((grade) => [grade.semesterCourseId, grade]));
    const conflicts = targetCourses.filter((course) => isPastPeriod(course.grade, course.semester) && course.rank !== null && course.rank !== undefined).flatMap((course) => {
      const currentCourse = currentCourses.get(`${course.grade}-${course.semester}-${course.subject}`);
      const currentRank = currentCourse ? currentGrades.get(currentCourse.id)?.rank : null;
      return currentRank !== null && currentRank !== undefined && currentRank !== course.rank
        ? [{ courseId: course.id, grade: course.grade, semester: course.semester, subject: course.subject, currentRank, importedRank: course.rank! }]
        : [];
    });
    if (conflicts.length && !courseGradeChoices) {
      setGradeImportConflicts(conflicts);
      setGradeImportChoices(Object.fromEntries(conflicts.map((conflict) => [conflict.courseId, "keep"])));
      return;
    }
    setRecordBusy(true); setError("");
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace; importedCount: number }>("/api/school-record/import", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId: workspace.profile.id,
          fileName: recordParse.fileName,
          totalPages: recordParse.totalPages,
          courses: targetCourses,
          // 이번 카테고리 + 앞서 반영한 것을 함께 보낸다. 백엔드는 영역 단위로
          // 교체하므로, 이번 것만 보내면 같은 영역에 있던 지난 반영분이 사라진다.
          entries: [...importedEntries.current.values(), ...targetEntries],
          newEntryIds: targetEntries.map((entry) => entry.id),
          courseGradeChoices,
        }),
      });
      for (const entry of targetEntries) importedEntries.current.set(entry.id, entry);
      onWorkspace(result.workspace);
      setGradeImportConflicts([]); setGradeImportChoices({});

      const remainingEntries = recordParse.entries.filter((e) => e.category !== importCategory || (e.category === importCategory && !e.selected));
      const remainingCourses = importCategory === "시험" ? [] : recordParse.courses;

      setRecordMessage(`[${importCategory}] 항목 ${result.importedCount}개를 반영했습니다.${importCategory === "시험" ? " 지난 학기의 수강 과목·성적도 함께 갱신했습니다." : ""}`);

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
            {recordBusy ? "분석 중…" : recordFile || recordConnected ? "다른 PDF" : "생기부 PDF 분석"}
          </button>
        </div>
      </div>

      {recordMessage && <div className="banner banner-success">✓ {recordMessage}</div>}
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
              <h2>{withParticle(workspace.roadmap.careerTrack, "으로", "로")} 이어지는 6학기 경로</h2>
              <p>월별 세부 일정 대신, 각 학기에서 쌓은 기록과 앞으로의 계획을 하나의 서사 흐름으로 보여줍니다.</p>
            </div>
            <div className="map-summary">
              {/* 학년 단위 기록은 두 학기 카드에 함께 나오므로 id로 세야 합계가 부풀지 않는다. */}
              <span><strong>{new Set(workspace.roadmap.nodes.flatMap((n) => visibleEvents(n)).filter((ev) => !ev.isPlan).map((ev) => ev.id)).size}</strong>기록</span>
              <span><strong>{new Set(workspace.roadmap.nodes.flatMap((n) => visibleEvents(n)).filter((ev) => ev.isPlan).map((ev) => ev.id)).size}</strong>계획</span>
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
                  // 과목 없는 기록(자율활동 등)은 빈 칩이 되므로 뺀다.
                  ...activitiesForNode(node).map((a) => a.subject).filter(Boolean),
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
                    {/* 회고 마디의 objective는 "생기부 연동을 통해 과거 활동을 확인하세요"라는
                        안내다. 이미 기록이 쌓인 학기에 그 말을 띄우면 아직 아무것도 안
                        했다는 뜻으로 읽힌다 — 그때는 무엇이 있는지 말해 준다. */}
                    <span className="flow-node-objective">
                      {phase === "past" && recordCount > 0
                        ? `생활기록부에서 확인된 기록 ${recordCount}건`
                        : node.objective}
                    </span>
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
        <div className="focus-backdrop" onClick={closeFocusedNode} role="presentation">
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
              <div className="focus-header-right">
                <div className="focus-subjects focus-course-summary">
                  <small>이 학기 수강 과목</small>
                  <div className="focus-course-list">
                    {focusedSemesterCourses.map((course) => (
                      <span className="focus-subj-pill" key={course.id}>
                        <i style={{ background: subjectColor(course.subject) }} />{course.subject}
                      </span>
                    ))}
                    {!focusedSemesterCourses.length && <span className="focus-month-empty">등록된 과목이 없습니다.</span>}
                  </div>
                  <button className="focus-course-manage" onClick={() => setCourseManagerOpen(true)} type="button">과목 관리</button>
                </div>
                <button aria-label="닫기" className="focus-close" onClick={closeFocusedNode} type="button">×</button>
              </div>
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
                  <strong>활동 주제 제안</strong>
                  <small>★ 먼저 검토하면 좋은 주제</small>
                </div>
                <div className="focus-stream-list">
                  {focusedPlans.map((ev) => {
                    const cat = ROADMAP_CATEGORIES.find((c) => c.category === ev.category);
                    return (
                      <div
                        className="focus-event is-plan"
                        key={ev.id}
                        onClick={() => setSelectedPlan({ plan: ev, node: focusedNode })}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedPlan({ plan: ev, node: focusedNode }); } }}
                        role="button"
                        style={{ "--subj": subjectColor(ev.subject), cursor: "pointer" } as CSSProperties}
                        tabIndex={0}
                      >
                        <span className="focus-ev-icon">{cat?.icon}</span>
                        <small>{ev.category}</small>
                        <strong>{planTitleWithPriority(ev.title, ev.priority)}{completedPlanIds.has(ev.id) && <small className="plan-completed-label">완료</small>}</strong>
                        <em>{ev.subject} · 학교 기회에 맞춰 선택</em>
                        <p style={{ margin: "6px 0", fontSize: "0.82rem", lineHeight: 1.5 }}>{ev.description || "이 학기의 목표와 연결되는 탐구 주제입니다."}</p>
                        <button
                          className="btn btn-secondary"
                          onClick={(event) => { event.stopPropagation(); onConvertPlan({ title: ev.title, subject: ev.subject, planEventId: ev.id, roadmapNodeId: focusedNode?.id }); }}
                          type="button"
                        >
                          이 주제를 실제 활동에 연결
                        </button>
                      </div>
                    );
                  })}
                  {!focusedPlans.length && <span className="focus-month-empty">추가 활동 주제 제안이 없습니다.</span>}
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

      {courseManagerOpen && focusedNode && (
        <div className="modal-overlay course-modal-overlay" onClick={() => setCourseManagerOpen(false)} role="presentation">
          <section aria-label="학기 수강 과목 관리" aria-modal="true" className="modal-panel course-manager-panel" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="modal-head">
              <div>
                <span className="kicker">SEMESTER COURSES</span>
                <h2>{focusedNode.grade}학년 {focusedNode.semester}학기 수강 과목</h2>
              </div>
              <button aria-label="닫기" className="focus-close" onClick={() => setCourseManagerOpen(false)} type="button">×</button>
            </div>
            <div className="modal-body course-manager-body">
              <p>활동 기록과 과목별 탐구 팁에 쓰일 실제 수강 과목만 등록하세요.</p>
              <div className="course-manager-current">
                <small>등록한 과목</small>
                <div className="focus-course-list">
                  {focusedSemesterCourses.map((course) => (
                    <span className="focus-subj-pill" key={course.id}>
                      <i style={{ background: subjectColor(course.subject) }} />{course.subject}
                      <button aria-label={`${course.subject} 삭제`} disabled={courseBusy} onClick={() => removeFocusedCourse(course.id)} type="button">×</button>
                    </span>
                  ))}
                  {!focusedSemesterCourses.length && <span className="focus-month-empty">아직 등록한 과목이 없습니다.</span>}
                </div>
              </div>
              {suggestedSemesterCourses.length > 0 && (
                <div className="focus-course-suggestions">
                  <small>이 학기에 자주 편성되는 과목</small>
                  <div>
                    {suggestedSemesterCourses.map((subject) => (
                      <button disabled={courseBusy} key={subject} onClick={() => addFocusedCourse(subject)} type="button">+ {subject}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="focus-course-add">
                <input aria-label="수강 과목 직접 추가" disabled={courseBusy} onChange={(event) => setCourseDraft(event.target.value)} onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if (event.key === "Enter") { event.preventDefault(); void addFocusedCourse(); } }} placeholder="직접 입력 · 예: 수학Ⅰ" value={courseDraft} />
                <button className="btn btn-secondary btn-sm" disabled={courseBusy || !courseDraft.trim()} onClick={() => void addFocusedCourse()} type="button">추가</button>
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
                <strong>업로드한 생기부 원본은 계정에 보관됩니다.</strong>
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
                        {course.grade}학년 {course.semester}학기 · {course.subject}{course.rank ? ` · ${course.rank}등급` : ""}
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
                          {entry.dateBasis === "document" ? "문서 날짜" : "날짜 확인 안 됨 · 직접 입력"}
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
                onClick={() => void confirmRecordImport()}
                type="button"
              >
                {recordBusy ? "반영 중…" : `선택한 [${importCategory}] 항목 로드맵에 반영`}
              </button>
            </div>
          </section>
        </div>
      )}

      {gradeImportConflicts.length > 0 && (
        <div className="modal-overlay course-modal-overlay" onClick={() => setGradeImportConflicts([])} role="presentation">
          <section aria-label="생활기록부 성적 차이 확인" aria-modal="true" className="modal-panel grade-conflict-panel" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="modal-head">
              <div><span className="kicker">RECORD CHECK</span><h2>기존 성적과 다른 항목이 있어요</h2></div>
              <button aria-label="닫기" className="focus-close" onClick={() => setGradeImportConflicts([])} type="button">×</button>
            </div>
            <div className="modal-body">
              <p className="grade-conflict-lead">사용자가 입력한 성적을 기본으로 유지합니다. 생활기록부 내용으로 바꿀 항목만 선택하세요.</p>
              <div className="grade-conflict-list">
                {gradeImportConflicts.map((conflict) => (
                  <div className="grade-conflict-item" key={conflict.courseId}>
                    <strong>{conflict.grade}학년 {conflict.semester}학기 · {conflict.subject}</strong>
                    <span>기존 {conflict.currentRank}등급 · 생활기록부 {conflict.importedRank}등급</span>
                    <div>
                      <label><input checked={gradeImportChoices[conflict.courseId] !== "replace"} name={conflict.courseId} onChange={() => setGradeImportChoices((current) => ({ ...current, [conflict.courseId]: "keep" }))} type="radio" /> 기존 유지</label>
                      <label><input checked={gradeImportChoices[conflict.courseId] === "replace"} name={conflict.courseId} onChange={() => setGradeImportChoices((current) => ({ ...current, [conflict.courseId]: "replace" }))} type="radio" /> 생활기록부로 변경</label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setGradeImportConflicts([])} type="button">돌아가기</button>
              <button className="btn btn-primary" onClick={() => confirmRecordImport(gradeImportChoices)} type="button">선택대로 반영</button>
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
      {selectedPlan && <PlanDetailModal plan={selectedPlan.plan} node={selectedPlan.node} courseSubjects={workspace.semesterCourses.filter((course) => course.roadmapNodeId === selectedPlan.node.id).map((course) => course.subject)} onClose={() => setSelectedPlan(null)} onConvertPlan={onConvertPlan} />}
    </div>
  );
}

/* ──────────────────────────────────────────────
   ActivitiesView
   ────────────────────────────────────────────── */
function ActivitiesView({ workspace, onWorkspace, draft, clearDraft }: {
  workspace: ProductWorkspace;
  onWorkspace: (workspace: ProductWorkspace) => void;
  draft: ActivityDraft | null;
  clearDraft: () => void;
}) {
  const currentSemesterCourseSubjects = workspace.semesterCourses
    .filter((course) => course.grade === workspace.profile.grade && course.semester === workspace.profile.semester)
    .map((course) => course.subject);
  const [form, setForm] = useState({
    activityType: "",
    subject: currentSemesterCourseSubjects.includes(draft?.subject ?? "") ? draft!.subject : (currentSemesterCourseSubjects[0] ?? ""),
    title: draft?.title ?? "",
    summary: draft?.summary ?? "",
    reflection: "",
    concepts: "",
    outputs: "",
    completedAt: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [planEventId, setPlanEventId] = useState(draft?.planEventId ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [lastReview, setLastReview] = useState<ActivityReview | null>(null);
  const [qualityNotice, setQualityNotice] = useState<string[] | null>(null);
  const allSelectablePlans = workspace.roadmap.nodes.flatMap((node) => (node.planEvents ?? []).map((event) => ({
    ...event,
    nodeId: node.id,
    objective: node.objective,
    grade: node.grade,
    semester: node.semester,
    isCompleted: workspace.activities.some((activity) => activity.planEventId === event.id),
  })));
  const currentSemesterPlans = allSelectablePlans.filter(
    (plan) => plan.grade === workspace.profile.grade && plan.semester === workspace.profile.semester,
  );
  const selectedPlanIsOutsideCurrentSemester = !!planEventId && !currentSemesterPlans.some((plan) => plan.id === planEventId);
  const [showAllPlanOptions, setShowAllPlanOptions] = useState(selectedPlanIsOutsideCurrentSemester);
  const selectablePlans = showAllPlanOptions ? allSelectablePlans : currentSemesterPlans;

  function recordQualityPrompts() {
    const prompts: string[] = [];
    if (form.summary.trim().length < 120) prompts.push("활동의 이유, 과정, 사용한 자료·방법, 결과를 조금 더 구체적으로 적어보세요.");
    if (form.reflection.trim().length < 60) prompts.push("배운 점과 느낀 점에 생각이 어떻게 달라졌는지, 다음에 더 알아보고 싶은 점을 남겨보세요.");
    if (!files.length && form.summary.trim().length < 220) prompts.push("발표자료나 탐구보고서가 있다면 첨부해두면 나중에 활동을 정확히 떠올리는 데 도움이 됩니다.");
    return prompts;
  }

  async function submit(skipQualityCheck = false) {
    if (!skipQualityCheck) {
      const prompts = recordQualityPrompts();
      if (prompts.length) {
        setQualityNotice(prompts);
        return;
      }
    }
    setBusy(true); setError("");
    try {
      const selectedPlan = allSelectablePlans.find((plan) => plan.id === planEventId);
      const payload = new FormData();
      payload.append("studentId", workspace.profile.id);
      payload.append("activity", JSON.stringify({ ...form, roadmapNodeId: selectedPlan?.nodeId, planEventId: planEventId || undefined, concepts: splitList(form.concepts), outputs: splitList(form.outputs) }));
      files.forEach((file) => payload.append("files", file));
      const result = await jsonRequest<{ workspace?: ProductWorkspace; reconciliation?: ReconciliationLog; review?: ActivityReview; error?: string }>(
        "/api/activities",
        { method: "POST", body: payload },
      );
      // 상장·봉사·독서는 로드맵 마디와 대조하지 않으므로 정합 결과가 없다.
      // 정합을 저장 성공의 조건으로 두면 실제로 저장된 기록이 실패로 보인다.
      if (!result.workspace) throw new Error(result.error || "활동을 저장하지 못했습니다.");
      onWorkspace(result.workspace);
      setLastReview(result.workspace.activityReviews.find((review) => review.activityId === result.reconciliation?.activityId) ?? null);
      clearDraft();
      setPlanEventId(""); setFiles([]); setForm((cur) => ({ ...cur, title: "", summary: "", reflection: "", activityType: "" }));
      setQualityNotice(null);
    } catch (e) { setError(e instanceof Error ? e.message : "활동을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function deleteAttachment(id: string) {
    if (!window.confirm("이 첨부 파일을 영구 삭제할까요?")) return;
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace }>(
        `/api/activity-files/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      onWorkspace(result.workspace);
    } catch {
      setError("파일을 삭제하지 못했습니다.");
    }
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
        <div className="form-field" style={{ marginBottom: "14px" }}>
          <label htmlFor="act-plan">연결할 로드맵 활동 주제 (선택 · 변경 가능)</label>
          <select id="act-plan" value={planEventId} onChange={(e) => setPlanEventId(e.target.value)}>
            <option value="">로드맵과 별개의 실제 활동</option>
            {selectablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.subject} · {planTitleWithPriority(plan.title, plan.priority)}{plan.isCompleted ? " (완료)" : ""}{showAllPlanOptions ? ` (${plan.grade}학년 ${plan.semester}학기)` : ""}</option>)}
          </select>
          <label className="plan-options-toggle">
            <input
              checked={showAllPlanOptions}
              onChange={(event) => {
                const shouldShowAll = event.target.checked;
                setShowAllPlanOptions(shouldShowAll);
                if (!shouldShowAll && selectedPlanIsOutsideCurrentSemester) setPlanEventId("");
              }}
              type="checkbox"
            />
            <span>다른 학기 주제도 보기</span>
          </label>
        </div>
        <div className="form-grid-3" style={{ marginBottom: "14px" }}>
          <div className="form-field">
            <label htmlFor="act-type">활동 유형</label>
            <select id="act-type" value={form.activityType} onChange={(e) => setForm({ ...form, activityType: e.target.value })}>
              <option value="" disabled>실제로 진행한 유형 선택</option>
              <option value="상장(대회)">상장(대회)</option>
              <option value="활동">활동(세특용 보고서·그 외 활동)</option>
              <option>봉사</option>
              <option>독서</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="act-subject">과목</label>
            <select id="act-subject" disabled={!currentSemesterCourseSubjects.length} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
              <option value="">{currentSemesterCourseSubjects.length ? "수강 과목 선택" : "수강 과목을 먼저 등록해주세요"}</option>
              {currentSemesterCourseSubjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="act-date">완료일</label>
            <input id="act-date" type="date" value={form.completedAt} onChange={(e) => setForm({ ...form, completedAt: e.target.value })} />
          </div>
        </div>
        {!currentSemesterCourseSubjects.length && <div className="banner banner-error" style={{ marginBottom: "14px" }}><strong>현재 학기 수강 과목을 먼저 등록해주세요.</strong><br />3개년 기록에서 현재 학기 노드를 누른 뒤, 우측 상단의 수강 과목에 실제 과목을 추가할 수 있습니다.</div>}
        <div className="form-field" style={{ marginBottom: "14px" }}>
          <label htmlFor="act-title">활동 제목</label>
          <input id="act-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="활동의 핵심을 한 문장으로" />
        </div>
        <div className="form-field" style={{ marginBottom: "14px" }}>
          <label htmlFor="act-summary">무엇을 어떻게 했나요?</label>
          <textarea id="act-summary" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="탐구를 시작한 이유, 과정, 활용한 자료·방법, 결과와 한계를 최대한 자세히 적어주세요" />
        </div>
        <div className="form-field" style={{ marginBottom: "14px" }}>
          <label htmlFor="act-reflection">배운 점과 느낀 점</label>
          <textarea id="act-reflection" value={form.reflection} onChange={(e) => setForm({ ...form, reflection: e.target.value })} placeholder="활동 뒤 생각이 어떻게 달라졌는지, 새로 알게 된 점과 다음에 더 탐구하고 싶은 점을 기록하세요" />
        </div>
        <div className="form-field" style={{ marginBottom: "18px" }}>
          <label htmlFor="act-files">발표자료·탐구보고서 첨부 (선택, PDF/PPTX/DOCX · 파일당 10MB)</label>
          <input id="act-files" type="file" accept=".pdf,.pptx,.docx" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          {files.length > 0 && <small>{files.map((file) => file.name).join(", ")}</small>}
        </div>
        {error && <div className="banner banner-error" style={{ marginBottom: "14px" }}>{error}</div>}
        <button
          className="btn btn-primary"
          disabled={busy || !currentSemesterCourseSubjects.length || !form.activityType || !form.subject || !form.title.trim() || !form.summary.trim()}
          onClick={() => submit()}
          type="button"
        >
          {busy ? "저장·AI 검토 중…" : "활동 저장하고 AI 검토"}
        </button>
        {lastReview && <div className={`banner${lastReview.alignment === "separate" ? " banner-error" : ""}`} style={{ marginTop: "14px" }}><strong>{lastReview.alignment === "separate" ? "AI 연결 검토: 다시 선택해주세요" : "AI 활동 검토"}</strong><br />{lastReview.summary}{lastReview.evidence.length > 0 && <><br />근거: {lastReview.evidence.join(" · ")}</>}{lastReview.gaps.length > 0 && <><br />보완: {lastReview.gaps.join(" · ")}</>}{lastReview.nextSteps.length > 0 && <><br />다음: {lastReview.nextSteps.join(" · ")}</>}</div>}
      </div>
      {qualityNotice && (
        <div className="modal-overlay" onClick={() => setQualityNotice(null)} role="presentation">
          <section aria-label="활동 기록 보완 안내" aria-modal="true" className="modal-panel record-quality-panel" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="modal-head">
              <div>
                <span className="kicker">BEFORE SAVING</span>
                <h2>조금만 더 남겨볼까요?</h2>
              </div>
              <button aria-label="닫기" className="focus-close" onClick={() => setQualityNotice(null)} type="button">×</button>
            </div>
            <div className="modal-body">
              <p className="record-quality-lead">지금 남긴 구체적인 기록은 수시 시즌의 자소서와 면접에서 활동을 정확히 설명하는 근거가 됩니다.</p>
              <ul className="record-quality-list">{qualityNotice.map((prompt) => <li key={prompt}>{prompt}</li>)}</ul>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setQualityNotice(null)} type="button">더 작성하기</button>
              <button className="btn btn-primary" onClick={() => submit(true)} type="button">그래도 저장</button>
            </div>
          </section>
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
                  <time className="history-time">{activity.completedAt || activity.periodLabel}</time>
                  <div className="history-info">
                    <span className="type-pill">{activity.activityType} · {activity.subject}</span>
                    <h3>{activity.title}</h3>
                    <p>{activity.summary}</p>
                    {activity.reflection && <div className="activity-reflection"><strong>배운 점과 느낀 점</strong><p>{activity.reflection}</p></div>}
                    {activity.linkedPlanTitle && <small style={{ color: "var(--fg-muted)", display: "block", marginBottom: 8 }}>연결한 로드맵 주제: {activity.linkedPlanTitle}</small>}
                    <div className="concept-tags">
                      {activity.concepts.map((c) => <span className="concept-tag" key={c}>{c}</span>)}
                    </div>
                    {workspace.attachments.filter((attachment) => attachment.activityId === activity.id).map((attachment) => (
                      <div key={attachment.id} style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                        <a href={`/api/activity-files/${encodeURIComponent(attachment.id)}?studentId=${encodeURIComponent(workspace.profile.id)}`}>{attachment.fileName}</a>
                        <button className="btn btn-ghost btn-sm" onClick={() => deleteAttachment(attachment.id)} type="button">삭제</button>
                      </div>
                    ))}
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
            <span className="kicker">AI ACTIVITY REVIEW</span>
            <h2>AI 활동 검토 결과</h2>
          </div>
          {workspace.activityReviews.length ? (
            <div className="history-list">
              {workspace.activityReviews.map((review) => {
                const activity = workspace.activities.find((item) => item.id === review.activityId);
                const label = review.alignment === "aligned" ? "연결 적합" : review.alignment === "partial" ? "일부 보완 필요" : "별도 활동 권장";
                return <div className="recon-log-item" key={`${review.activityId}-${review.summary}`}>
                  <div className="recon-log-top">
                    <span className={`recon-log-type ${review.alignment}`}>{label}</span>
                    <span className="recon-log-conf">{activity?.title ?? "활동 검토"}</span>
                  </div>
                  <p className="recon-log-rationale">{review.summary}</p>
                  {review.evidence.length > 0 && <p className="recon-log-action">근거: {review.evidence.join(" · ")}</p>}
                  {review.gaps.length > 0 && <p className="recon-log-action">보완: {review.gaps.join(" · ")}</p>}
                </div>;
              })}
            </div>
          ) : (
            <div className="empty-state">
              <strong>활동을 저장하면 AI 검토 결과가 여기에 쌓입니다</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PortfolioView({ workspace }: { workspace: ProductWorkspace }) {
  const records = [...workspace.activities].sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  const themes = [...new Set(records.flatMap((record) => record.concepts))].slice(0, 6);
  return <div className="activities-page">
    <div className="activities-header"><span className="kicker">ADMISSIONS PORTFOLIO</span><h1>수시 준비 자료</h1><p>3년 활동의 사실과 증거를 자소서 서사와 면접 대비 질문으로 정리합니다.</p></div>
    <div className="activity-form-card"><h2>자소서 서사 초안</h2><p>{workspace.profile.targetCareer} 관심을 바탕으로 {records.length}개의 실제 활동을 축적했습니다. {themes.length ? `핵심 키워드는 ${themes.join(", ")}입니다.` : "활동을 더 기록하면 핵심 키워드가 자동으로 정리됩니다."}</p><ol>{records.map((record) => <li key={record.id}><strong>{record.completedAt || record.periodLabel} · {record.title}</strong><br />{record.summary}{record.reflection && <><br /><small>배운 점·느낀 점: {record.reflection}</small></>}</li>)}</ol></div>
    <div className="activity-form-card"><h2>면접 대비 질문</h2>{records.length ? <ol>{records.slice(-5).reverse().map((record) => <li key={record.id}>“{record.title}에서 무엇을 직접 탐구했고, 결과가 {workspace.profile.targetCareer} 관심과 어떻게 이어졌나요?”</li>)}</ol> : <p>실제 활동을 저장하면 활동별 면접 질문이 만들어집니다.</p>}</div>
  </div>;
}

function GradesView({ workspace, onWorkspace, onNavigate }: { workspace: ProductWorkspace; onWorkspace: (workspace: ProductWorkspace) => void; onNavigate: (tab: TabId) => void }) {
  const [period, setPeriod] = useState(`${workspace.profile.grade}-${workspace.profile.semester}`);
  const [drafts, setDrafts] = useState<Record<string, { rank: string; score: string; note: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [grade, semester] = period.split("-").map(Number);
  const courses = workspace.semesterCourses.filter((course) => course.grade === grade && course.semester === semester);
  const gradeByCourse = new Map(workspace.courseGrades.map((item) => [item.semesterCourseId, item]));
  const savedRanks = courses.map((course) => gradeByCourse.get(course.id)?.rank).filter((rank): rank is number => rank !== null && rank !== undefined);
  const savedScores = courses.map((course) => gradeByCourse.get(course.id)?.score).filter((score): score is number => score !== null && score !== undefined);
  const periodOptions = workspace.roadmap.nodes.map((node) => `${node.grade}-${node.semester}`);

  function valuesFor(courseId: string) {
    const saved = gradeByCourse.get(courseId);
    return drafts[courseId] ?? { rank: saved?.rank?.toString() ?? "", score: saved?.score?.toString() ?? "", note: saved?.note ?? "" };
  }

  function updateDraft(courseId: string, patch: Partial<{ rank: string; score: string; note: string }>) {
    setDrafts((current) => ({ ...current, [courseId]: { ...valuesFor(courseId), ...patch } }));
  }

  async function saveGrade(courseId: string) {
    const draft = valuesFor(courseId);
    const rank = draft.rank ? Number(draft.rank) : null;
    const score = draft.score ? Number(draft.score) : null;
    if ((rank !== null && (!Number.isInteger(rank) || rank < 1 || rank > 5)) || (score !== null && (score < 0 || score > 100))) {
      setError("내신 등급은 1~5, 원점수는 0~100 사이로 입력해주세요.");
      return;
    }
    setSavingId(courseId); setError(""); setMessage("");
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace }>("/api/course-grades", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId: workspace.profile.id, semesterCourseId: courseId, rank, score, note: draft.note }),
      });
      onWorkspace(result.workspace);
      setMessage("성적을 저장했습니다.");
    } catch (e) { setError(e instanceof Error ? e.message : "성적을 저장하지 못했습니다."); }
    finally { setSavingId(null); }
  }

  return <div className="grades-page">
    <div className="activities-header"><span className="kicker">ACADEMIC RECORD</span><h1>성적</h1><p>실제 수강 과목별 성적을 학기 단위로 기록해 학업 흐름을 관리합니다.</p></div>
    <section className="grade-overview-card">
      <div><small>선택 학기</small><strong>{grade}학년 {semester}학기</strong></div>
      <div><small>입력 과목</small><strong>{courses.length}개</strong></div>
      <div><small>평균 내신 등급</small><strong>{savedRanks.length ? `${(savedRanks.reduce((sum, value) => sum + value, 0) / savedRanks.length).toFixed(2)}등급` : "미입력"}</strong></div>
      <div><small>평균 원점수</small><strong>{savedScores.length ? `${(savedScores.reduce((sum, value) => sum + value, 0) / savedScores.length).toFixed(1)}점` : "미입력"}</strong></div>
    </section>
    <div className="grade-toolbar">
      <label htmlFor="grade-period">학기 선택</label>
      <select id="grade-period" value={period} onChange={(event) => { setPeriod(event.target.value); setError(""); setMessage(""); }}>
        {periodOptions.map((option) => { const [optionGrade, optionSemester] = option.split("-"); return <option key={option} value={option}>{optionGrade}학년 {optionSemester}학기</option>; })}
      </select>
    </div>
    {error && <div className="banner banner-error">{error}</div>}
    {message && <div className="banner">{message}</div>}
    {courses.length ? <div className="grade-course-list">{courses.map((course) => {
      const values = valuesFor(course.id);
      return <article className="grade-course-card" key={course.id}>
        <div className="grade-course-name"><i style={{ background: subjectColor(course.subject) }} /><strong>{course.subject}</strong></div>
        <div className="grade-inputs">
          <label>내신 등급<select aria-label={`${course.subject} 내신 등급`} value={values.rank} onChange={(event) => updateDraft(course.id, { rank: event.target.value })}><option value="">미입력</option>{[1, 2, 3, 4, 5].map((rank) => <option key={rank} value={rank}>{rank}등급</option>)}</select></label>
          <label>원점수<input aria-label={`${course.subject} 원점수`} inputMode="numeric" max="100" min="0" onChange={(event) => updateDraft(course.id, { score: event.target.value })} placeholder="선택" type="number" value={values.score} /></label>
          <label className="grade-note">메모<input aria-label={`${course.subject} 성적 메모`} onChange={(event) => updateDraft(course.id, { note: event.target.value })} placeholder="예: 중간 이후 오답 유형 보완" value={values.note} /></label>
        </div>
        <button className="btn btn-secondary btn-sm" disabled={savingId === course.id} onClick={() => saveGrade(course.id)} type="button">{savingId === course.id ? "저장 중…" : "저장"}</button>
      </article>;
    })}</div> : <section className="empty-state grade-empty"><strong>이 학기에 등록한 수강 과목이 없습니다</strong><p>먼저 3개년 기록에서 해당 학기의 수강 과목을 등록하면 성적을 기록할 수 있습니다.</p><button className="btn btn-secondary btn-sm" onClick={() => onNavigate("roadmap")} type="button">3개년 기록으로 이동</button></section>}
  </div>;
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
    concreteResearchQuestion: "",
    knowledgeLevel: "",
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

  return (
    <div className="profile-page">
      <div className="profile-header">
        <span className="kicker">STUDENT PROFILE</span>
        <h1>학생 정보</h1>
        <p>이 화면은 현재 학생과 확정된 로드맵 기준을 확인하는 용도입니다. 여기서 로드맵을 직접 수정하지 않습니다.</p>
      </div>

      <div className="profile-form-card">
        <div className="form-grid-3" style={{ marginBottom: "20px" }}>
          <div className="form-field"><label>이름</label><p>{workspace.profile.name || "미입력"}</p></div>
          <div className="form-field"><label>현재 학년</label><p>{workspace.profile.grade}학년</p></div>
          <div className="form-field"><label>현재 학기</label><p>{workspace.profile.semester}학기</p></div>
        </div>
        <div className="form-grid-2">
          <div className="form-field form-span-2"><label>현재 관심 분야 또는 진로</label><p>{workspace.profile.targetCareer || "미입력"}</p></div>
          <div className="form-field"><label>관심 학과</label><p>{workspace.profile.targetMajors.join(", ") || "미입력"}</p></div>
          <div className="form-field"><label>로드맵 관심 축</label><p>{workspace.profile.interests.join(", ") || "미입력"}</p></div>
        </div>
        <div className="banner banner-info" style={{ marginTop: "20px" }}>
          로드맵 기준을 바꾸고 싶다면 추후 챗봇에서 이유와 현재 기록을 함께 검토한 뒤 새 버전을 제안합니다. 과거 기록과 확정된 로드맵은 이 화면에서 임의로 바뀌지 않습니다.
        </div>
      </div>

      <div className="data-priority-card">
        <span className="kicker">DATA PRIORITY</span>
        <h2>현재 저장 원칙</h2>
        <div className="priority-list">
          {["학생이 직접 확인한 기본 정보", "실제 활동과 첨부자료의 근거", "학생이 확인한 AI 해석", "아직 확인되지 않은 잠정 추론"].map((text, i) => (
            <div className="priority-item" key={text}><span className="priority-num">{i + 1}</span>{text}</div>
          ))}
        </div>
      </div>
    </div>
  );

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

  function updateCareerResolution(value: string) {
    setForm((current) => value === "넓은 분야만 정한 단계"
      ? { ...current, careerResolution: value, knowledgeLevel: "", concreteResearchQuestion: "" }
      : { ...current, careerResolution: value });
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
        <h1>현재 상태와 로드맵 기준</h1>
        <p>학생이 직접 확인한 현재 상태와 제약만 바꿉니다. 저장 후 새 버전을 만들면 과거 기록은 유지하고 현재 이후의 주제 제안만 다시 구성합니다.</p>
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
            <label htmlFor="pf-career">현재 가장 끌리는 분야 또는 진로</label>
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

          <div className="form-field form-span-2">
            <label>현재 진로가 어느 정도 정해졌나요?</label>
            <div className="clarity-choice-row is-two">
              <button className={`clarity-choice${form.careerResolution === "넓은 분야만 정한 단계" ? " is-active" : ""}`} onClick={() => updateCareerResolution("넓은 분야만 정한 단계")} type="button"><strong>넓은 분야만 있음</strong><small>세부 키워드는 로드맵에서 천천히 좁혀갑니다.</small></button>
              <button className={`clarity-choice${hasSpecificCareerGoal(form) ? " is-active" : ""}`} onClick={() => updateCareerResolution("구체적인 학과나 직무까지 정한 단계")} type="button"><strong>구체 목표가 있음</strong><small>세부 키워드와 현재 지식을 로드맵에 반영합니다.</small></button>
            </div>
          </div>
          {hasSpecificCareerGoal(form) && <div className="form-field form-span-2">
            <label htmlFor="pf-detail">특히 궁금한 세부 키워드나 문제</label>
            <textarea id="pf-detail" value={form.concreteResearchQuestion} onChange={(event) => update("concreteResearchQuestion", event.target.value)} placeholder="예: 반도체 소자의 전력 효율과 집적회로 설계" />
          </div>}
          <div className="form-field form-span-2">
            <label htmlFor="pf-engagement">현재 실제로 진행 중인 활동</label>
            <textarea id="pf-engagement" value={form.currentEngagement} onChange={(e) => update("currentEngagement", e.target.value)} placeholder="실제로 참여 중이거나 시작한 활동만 적어주세요. 없으면 비워두세요." />
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
function ProductShell({ workspace, onWorkspace, onNewStudent, onRefresh }: {
  workspace: ProductWorkspace;
  onWorkspace: (workspace: ProductWorkspace) => void;
  onNewStudent: () => void;
  /** 챗봇 수정 모드가 기록을 바꾸면 다른 화면도 최신으로 맞춘다. */
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<TabId>("roadmap");
  const [activityDraft, setActivityDraft] = useState<ActivityDraft | null>(null);
  const initials = workspace.profile.name.slice(-2);

  const tabs: Array<{ id: TabId; label: string; icon: string }> = [
    { id: "roadmap",    label: "3개년 기록",    icon: "3Y" },
    { id: "overview",   label: "이번 학기",     icon: "●" },
    { id: "activities", label: "활동 기록",      icon: "◎"  },
    { id: "grades",     label: "성적",          icon: "A"  },
    { id: "portfolio",  label: "수시 준비",      icon: "↗"  },
    { id: "chat",       label: "챗봇",          icon: "◍"  },
    { id: "profile",    label: "프로필",         icon: "◉"  },
  ];

  function startActivity(draft: ActivityDraft) {
    setActivityDraft(draft);
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
          {/* 이 버튼은 실제로 로그아웃한다(토큰을 지우고 로그인 화면으로 보낸다).
              "신규 학생 시작"이라는 이름은 계정마다 학생이 하나인 지금 구조에서
              무슨 일이 일어나는지 감추기만 한다. */}
          <button className="new-student-btn" id="btn-new-student" onClick={onNewStudent} type="button">
            로그아웃
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
          {tab === "overview"   && <Overview workspace={workspace} onNavigate={setTab} onConvertPlan={startActivity} />}
          {tab === "roadmap"    && <RoadmapView workspace={workspace} onWorkspace={onWorkspace} onConvertPlan={startActivity} />}
          {tab === "activities" && (
            <ActivitiesView
              key={activityDraft?.title ?? "activity-entry"}
              workspace={workspace}
              onWorkspace={onWorkspace}
              draft={activityDraft}
              clearDraft={() => setActivityDraft(null)}
            />
          )}
          {tab === "grades"     && <GradesView workspace={workspace} onNavigate={setTab} onWorkspace={onWorkspace} />}
          {tab === "portfolio" && <PortfolioView workspace={workspace} />}
          {tab === "chat"       && <ChatView onRecordsChanged={onRefresh} />}
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
  // 학생 식별은 이제 백엔드 JWT가 한다 — localStorage의 studentId로 작업공간을 찾던
  // 방식은 서버 로직이 이 앱을 떠나면서 함께 사라졌다.
  const [signedIn, setSignedIn] = useState(false);

  /**
   * `quiet`는 로딩 화면을 띄우지 않고 데이터만 갈아 끼운다. 챗봇 수정 모드가 기록을
   * 바꿨을 때 쓰는데, 전체 로딩을 띄우면 셸이 다시 마운트되면서 보고 있던 탭에서
   * 튕겨 나간다.
   */
  const refresh = useCallback((options?: { quiet?: boolean }) => {
    if (!options?.quiet) setLoading(true);
    loadWorkspace()
      .then((next) => {
        // null이면 아직 온보딩 전이다 — 화면이 온보딩 폼을 띄운다.
        setWorkspace(next);
        setError("");
      })
      .catch((caught) => {
        // 온보딩 전에는 프로필이 비어 있어 실패하는 것이 정상이다 — 신규 가입
        // 화면으로 보내면 된다.
        setWorkspace(null);
        if (caught instanceof ApiError && caught.status !== 404) setError(caught.message);
      })
      .finally(() => {
        if (!options?.quiet) setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!tokens.access) {
      setSignedIn(false);
      setLoading(false);
      return;
    }
    setSignedIn(true);
    refresh();
  }, [refresh]);


  const loadingCopy = useMemo(() => (loading ? "학생 작업공간을 불러오는 중…" : ""), [loading]);

  // 조기 반환은 훅을 전부 부른 뒤에 온다. 훅보다 앞에 두면 로그인 전후로 호출
  // 순서가 달라져 Rules of Hooks를 어긴다.
  if (!signedIn) {
    return (
      <SignIn
        onSignedIn={() => {
          setSignedIn(true);
          refresh();
        }}
      />
    );
  }

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
      onRefresh={() => refresh({ quiet: true })}
      onNewStudent={() => {
        // 학생 전환은 이제 계정 전환이다 — 토큰을 지우고 로그인 화면으로 돌아간다.
        void logout().then(() => {
          setWorkspace(null);
          setSignedIn(false);
        });
      }}
    />
  );
}
