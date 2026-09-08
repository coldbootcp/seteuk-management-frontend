"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, downloadFile, logout, tokens } from "../lib/api-client";
import { getConsultationStatus, handleLegacyRoute, loadWorkspace } from "../lib/workspace-adapter";
import { SignIn } from "./sign-in";
import { LandingView } from "./landing-view";
import { ConsultationGate } from "./consultation-view";
import { GateFrame } from "./gate-frame";
import { ChatView } from "./chat-view";
import { TimetableView } from "./timetable-view";
import { GradesView } from "./grades-view";
import { DashboardView } from "./dashboard-view";
import { createEmptyTimetable, type TimetableConfig } from "./types/academic";
import type {
  ActivityAttachment,
  ActivityReview,
  ConsultationStatus,
  ProductWorkspace,
  ProfileInput,
  ReconciliationLog,
  RoadmapNode,
  RoadmapPlanEvent,
  StudentActivity,
} from "../lib/product-harness";
import {
  SCHOOL_RECORD_MAX_FILE_SIZE,
  SCHOOL_RECORD_MAX_FILE_SIZE_LABEL,
  getLatestSchoolRecordPeriod,
  parseSchoolRecordJson,
  type SeteukAnalysisResult,
  type SchoolRecordParseResult,
  type SchoolRecordPeriod,
} from "../lib/school-record-parser";

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */
type TabId = "overview" | "dashboard" | "timetable" | "activities" | "grades" | "portfolio" | "chat" | "profile";

type ProfileForm = {
  name: string; grade: string; semester: string;
  targetCareer: string; targetMajors: string; interests: string;
  concreteResearchQuestion: string; knowledgeLevel: string;
  motivationTrigger: string; careerResolution: string; currentEngagement: string;
  preferredSubjects: string; strengths: string; gaps: string; constraints: string;
  outputPreference: string; collaborationStyle: string; roadmapDesignNotes: string;
};


/**
 * 온보딩 화면의 세 걸음. 예전에는 1/2/3 숫자였는데, 첫 화면(진단 방식 선택)이
 * 생기면서 숫자와 "Step N" 표기가 어긋나기 시작해 이름으로 바꿨다.
 */
type OnboardingStep = "select" | "profile" | "ai";

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

/** 진단 실행 전 생기부-답변 갭을 메우는 사전질문 하나. 최초 진단에만 나온다. */
type DiagnosisPreQuestion = {
  key: string;
  prompt: string;
  options: string[];
  allow_custom: boolean;
};

/** 활동 하나를 근거로 만든 후속 탐구 선택지 하나(기능2). */
type RecommendationOption = {
  topic: string;
  connection_reason: string;
  subject_relevance: string;
  career_relevance: string;
  record_potential: string;
  difficulty: "easy" | "medium" | "hard";
  materials: string[];
  expected_output: string;
  expansion_potential: string;
};

type FollowUpRecommendation = {
  id: string;
  source_activity_id: string | null;
  desired_activity_type: string | null;
  options: RecommendationOption[];
  created_at: string;
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

/**
 * 온보딩에서 학생이 직접 고르는 고민. 백엔드의 `self_assessed_weaknesses`로 그대로
 * 저장되므로 장식이 아니다 — 진단과 상담 프롬프트가 이 값을 읽는다.
 */
const ONBOARDING_CONCERNS = [
  { title: "세특의 학술적 깊이", desc: "교과서 개념 요약을 넘어서는 심화 탐구가 부족합니다" },
  { title: "활동 사이의 연계성", desc: "과목·동아리 활동이 하나의 서사로 이어지지 않습니다" },
  { title: "성적과 세특의 균형", desc: "내신 관리와 탐구 보고서 작성 시간이 서로 부딪힙니다" },
  { title: "차별화된 주제 찾기", desc: "같은 학과를 지망하는 학생들과 겹치지 않는 주제가 필요합니다" },
];

/** AI 확인 질문 카드의 색. 질문 순서대로 돌려 쓴다(목업의 파랑·보라·초록). */
const AI_QUESTION_TONES = [
  { chip: "bg-blue-50 text-brand-600", card: "border-brand-500 bg-blue-50/50 font-bold text-brand-800", dot: "bg-brand-500", badge: "bg-brand-100 text-brand-800" },
  { chip: "bg-purple-50 text-purple-700", card: "border-purple-500 bg-purple-50/50 font-bold text-purple-900", dot: "bg-purple-600", badge: "bg-purple-100 text-purple-800" },
  { chip: "bg-emerald-50 text-emerald-700", card: "border-emerald-500 bg-emerald-50/50 font-bold text-emerald-900", dot: "bg-emerald-600", badge: "bg-emerald-100 text-emerald-800" },
];

const APP_VERSION = "0.7.0";
const AI_JUDGEMENT_OPTION = "잘 모르겠음 — AI 판단에 맡길게요";
const OTHER_CLARIFICATION_OPTION = "기타 직접 입력";

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
  if (completedGrade === 2) return "2";
  return completedGrade >= 3 ? "graduated" : String(completedGrade + 1);
}

function expectedCurrentPeriodFromRecord(period: SchoolRecordPeriod | null): { grade: string; semester: string } | null {
  if (!period) return null;
  if (period.grade >= 3) return { grade: "graduated", semester: "" };
  if (period.grade === 2) {
    return { grade: "2", semester: "2" };
  }
  if (period.semester === 1) {
    return { grade: String(period.grade), semester: "2" };
  }
  return { grade: String(period.grade + 1), semester: "1" };
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
      options: [`${gradeLabel(expectedGrade)} 기준으로 계획 세우기`, `${gradeLabel(form.grade)} 기준 유지`, "학년은 유지하되 학생부는 확정 기록으로만 반영"],
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
      question: `${career} 탐구의 전체 서사를 어떤 방향으로 잡을까요?`,
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
    form.roadmapDesignNotes && `계획 설계 전 확인 답변:\n${form.roadmapDesignNotes}`,
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


/**
 * 갈래 이름을 그대로 받는다. 예전에는 부분 문자열로 찾았는데, 그러면 엉뚱한 곳에
 * 걸린다 — "영**상장**치"가 상장으로 읽히는 사고가 실제로 있었다. 어댑터가 이미
 * 정확한 갈래를 넣어 주므로 추측할 이유가 없다.
 */
function planTitleWithPriority(title: string, priority?: "core" | "optional") {
  return priority === "core" ? `★ ${title}` : title;
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
            <h3>이번 학기 목표에서의 역할</h3>
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
function Onboarding({ onComplete, onSignOut }: { onComplete: () => void; onSignOut: () => void }) {
  const [form, setForm] = useState<ProfileForm>(EMPTY_PROFILE);
  const [step, setStep] = useState<OnboardingStep>("select");
  const [dragOver, setDragOver] = useState(false);
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
      setClarificationSummary("졸업자 학생부로 확인되어 계획은 만들지 않고, 분석·정리한 학생부 기록만 보여드립니다.");
      setClarificationBlocked(true);
      setClarificationComplete(false);
      setStep("ai");
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
          answers: restart ? [] : clarificationAnswers,
        }),
      });
      if (result.blocked) {
        setClarificationQuestions([]);
        setClarificationBlocked(true);
        setClarificationComplete(false);
        setClarificationSummary(result.summary || "업로드한 학생부가 졸업자 학생부로 확인되어 진행할 수 없습니다.");
        setStep("ai");
        return;
      }
      const questions = Array.isArray(result.questions) ? result.questions : fallbackQuestions;
      setClarificationQuestions(questions);
      setClarificationComplete(Boolean(result.complete) && questions.length === 0);
      setClarificationSummary(result.draftChangeSummary
        ? `${result.summary || ""} ${result.draftChangeSummary}`.trim()
        : result.summary || "");
      setStep("ai");
    } catch {
      setClarificationQuestions(fallbackQuestions);
      setClarificationComplete(false);
      setClarificationSummary(onboardingRecordParse
        ? "학생부의 기존 기록과 Step1·2 입력을 기준으로 확인 질문을 만들었습니다."
        : "Step1·2 입력을 기준으로 확인 질문을 만들었습니다.");
      setStep("ai");
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
      const expectedPeriod = expectedCurrentPeriodFromRecord(latestPeriod);
      const expectedCurrentGrade = expectedPeriod?.grade ?? (completedGrade ? currentGradeValueFromCompletedRecord(completedGrade) : null);
      const expectedCurrentSemester = expectedPeriod?.semester ?? null;
      const studentName = typeof resultJson.student_name === "string" ? resultJson.student_name.trim() : "";

      const resolvedGrade = isGraduatedGrade(expectedCurrentGrade ?? form.grade) ? 3 : Number(expectedCurrentGrade ?? form.grade) || 1;
      const resolvedAcademicStartYear = new Date().getFullYear() - (resolvedGrade - 1);
      const targetMaxGrade = isGraduatedGrade(expectedCurrentGrade ?? form.grade) ? 3 : Number(expectedCurrentGrade ?? form.grade) || 2;
      const targetMaxSemester = isGraduatedGrade(expectedCurrentGrade ?? form.grade) ? null : Number(form.semester) || (expectedCurrentSemester ? Number(expectedCurrentSemester) : 2);
      const parsed = parseSchoolRecordJson(resultJson, resolvedAcademicStartYear, {
        grade: targetMaxGrade,
        semester: targetMaxSemester,
      });
      parsed.fileName = file.name;
      const summary = summarizeOnboardingRecord(parsed, completedGrade);

      if (expectedCurrentGrade && !form.grade) {
        updateGrade(expectedCurrentGrade);
        if (expectedCurrentSemester && !isGraduatedGrade(expectedCurrentGrade)) {
          update("semester", expectedCurrentSemester);
        }
      }
      if (studentName && !form.name.trim()) update("name", studentName);
      if (summary.subjects.length && !form.preferredSubjects.trim()) update("preferredSubjects", summary.subjects.join(", "));
      if (summary.currentActivities && !form.currentEngagement.trim()) update("currentEngagement", summary.currentActivities);
      const periodMessage = completedGrade ? ` ${completedGrade}학년까지 확정된 기록으로 확인했습니다.` : "";
      const gradeMessage = expectedCurrentGrade ? ` 현재 상태는 ${gradeLabel(expectedCurrentGrade)}${expectedCurrentSemester ? ` ${expectedCurrentSemester}학기` : ""} 후보로 자동 입력했습니다.` : "";
      const nameMessage = studentName && !form.name.trim() ? ` 이름은 ${studentName} 학생으로 자동 입력했습니다.` : "";
      setOnboardingRecordParse(parsed);
      setRecordOnlyMode(Boolean(completedGrade && completedGrade >= 3));
      setOnboardingRecordAutoFields(true);
      setOnboardingRecordContext({ expectedGrade: expectedCurrentGrade, studentName });
      setOnboardingRecordMessage(completedGrade && completedGrade >= 3
        ? "3학년까지 확정된 졸업자 학생부로 확인했습니다. 계획은 만들지 않고, 분석·정리한 학생부 기록을 보여드립니다."
        : `학생부에서 과목 ${summary.subjects.length}개, 활동 후보 ${summary.entries.length}개를 확인했습니다. 시작하면 활동 기록에 함께 저장됩니다.${nameMessage}${periodMessage}${gradeMessage}`);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "학생부를 분석하지 못했습니다. 건너뛰고 시작해도 됩니다.");
      setOnboardingRecordFile("");
      setOnboardingRecordParse(null);
      setOnboardingRecordAutoFields(false);
      setOnboardingRecordContext({});
      setClarificationBlocked(false);
      setClarificationComplete(false);
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
    setClarificationAnswers([]);
    setError("");
    if (onboardingRecordRef.current) onboardingRecordRef.current.value = "";
  }

  async function confirmOnboarding() {
    setBusy(true); setError("");
    try {
      await jsonRequest("/api/onboarding", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: toProfileInput(form) }),
      });
      if (onboardingRecordParse && (onboardingRecordParse.courses.length || onboardingRecordParse.entries.some((entry) => entry.selected))) {
        await jsonRequest("/api/school-record/import", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fileName: onboardingRecordParse.fileName,
            totalPages: onboardingRecordParse.totalPages,
            courses: onboardingRecordParse.courses,
            entries: onboardingRecordParse.entries,
          }),
        });
      }
      // 3개년 큰 계획은 이제 진단+상담 관문을 거쳐야 만들어진다 — 여기서는
      // 프로필(과 선택적 생기부 반영)만 끝내고, 다음 화면 선택은 onComplete가
      // 관문 상태를 다시 확인해서 정한다.
      onComplete();
    } catch (e) { setError(e instanceof Error ? e.message : "가입 정보를 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  const canSubmitProfile = !!form.name.trim() && !!form.grade && (isGraduatedGrade(form.grade) || !!form.semester) && !!form.targetCareer.trim();
  const canLeaveProfileStep = canSubmitProfile && !!form.careerResolution;
  const recordLocked = Boolean(onboardingRecordFile || onboardingRecordBusy);
  /**
   * 이름은 학생부를 올려도 잠그지 않는다. 파서가 읽은 이름이 틀리거나(붙어 나온 글자,
   * 옛 이름) 학생이 다르게 쓰고 싶을 때 고칠 길이 아예 없었다. 대신 학생부와 다르면
   * 그 사실을 그 자리에서 알려 준다 — 다른 학생의 자료를 올린 것일 수도 있어서다.
   */
  const recordStudentName = onboardingRecordContext.studentName?.trim() ?? "";
  const recordNameMismatch = Boolean(recordStudentName && form.name.trim() && recordStudentName !== form.name.trim());
  const gapValues = splitList(form.gaps);

  /** 학생부로 시작하기. 분석은 화면을 막지 않고 뒤에서 돌아, 그동안 폼을 채울 수 있다. */
  function startWithRecord(file: File | undefined) {
    if (!file) return;
    setStep("profile");
    void analyzeOnboardingRecord(file);
  }

  function toggleGap(value: string) {
    setForm((cur) => {
      const values = splitList(cur.gaps);
      const next = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
      return { ...cur, gaps: next.join(", ") };
    });
  }

  /** 진행 표시. "지금 어느 걸음인가"만 말하고 남은 걸음 수를 지어내지 않는다. */
  function stepper(current: "profile" | "ai") {
    return (
      <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            className="text-xs text-gray-500 hover:text-gray-900 font-bold flex items-center gap-1"
            onClick={() => setStep(current === "ai" ? "profile" : "select")}
            type="button"
          >
            <span>←</span> {current === "ai" ? "1단계 수정" : "처음으로"}
          </button>
          <span className="text-gray-300">|</span>
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              current === "ai" ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-brand-600"
            }`}
          >
            {current === "ai" ? "Step 2 / 2 · AI 맞춤 확인 질문" : "Step 1 / 2 · 기본 정보와 목표"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold">
          {current === "ai" ? (
            <>
              <span className="text-emerald-600 font-bold">✓ 1. 기본 프로필</span>
              <span>➔</span>
              <span className="w-2 h-2 rounded-full bg-purple-600" />
              <span className="text-purple-700 font-bold">2. AI 맞춤 질문</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-brand-500" />
              <span className="text-brand-600 font-bold">1. 기본 프로필</span>
              <span>➔</span>
              <span>2. AI 맞춤 질문</span>
            </>
          )}
          <span>➔</span>
          <span>3. 정밀 진단</span>
        </div>
      </div>
    );
  }

  return (
    <GateFrame badge={step === "select" ? "신규 온보딩" : step === "profile" ? "Step 1 / 2" : "Step 2 / 2"} onSignOut={onSignOut}>
      {/* 파일 선택기는 세 화면이 함께 쓴다 — 어느 걸음에서도 학생부를 올릴 수 있다. */}
      <input
        accept="application/pdf,.pdf"
        hidden
        onChange={(event) => startWithRecord(event.target.files?.[0])}
        ref={onboardingRecordRef}
        type="file"
      />

      {error && <div className="banner banner-error mb-5">{error}</div>}

      {/* ───────── 진단 방식 선택 ───────── */}
      {step === "select" && (
        <div className="w-full space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-brand-600 text-xs font-bold tracking-wide">
              <span className="w-2 h-2 rounded-full bg-brand-500" />
              세특연구소 AI 정밀 학업 진단 · 시작하기
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-950 tracking-tight leading-tight">
              지금의 나에서 시작하는
              <br />
              <span className="text-brand-500">맞춤 탐구 설계</span>를 먼저 진행해 주세요.
            </h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              세특연구소는 단순한 주제 추천에 그치지 않습니다.
              <br className="hidden sm:inline" />
              지금까지의 기록과 관심분야를 읽어 <strong>이번 학기의 목표와 탐구 주제</strong>를 함께 정합니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            {/* 경로 1 — 학생부 업로드 */}
            <div className="bg-white rounded-2xl border-2 border-brand-500/80 p-7 shadow-lg flex flex-col justify-between relative overflow-hidden">
              <span className="absolute top-0 right-0 bg-brand-500 text-white text-[11px] font-extrabold px-3 py-1 rounded-bl-xl">
                추천 · 기록부터 읽습니다
              </span>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="w-12 h-12 rounded-xl bg-blue-50 text-brand-600 flex items-center justify-center text-xl flex-none">📄</span>
                  <span className="block">
                    <span className="block text-lg font-bold text-gray-900">학교생활기록부(PDF)로 시작</span>
                    <span className="block text-xs text-gray-500">정부24 · 나이스에서 내려받은 생기부 파일</span>
                  </span>
                </div>

                <div
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition ${
                    dragOver ? "border-brand-500 bg-blue-50/50" : "border-gray-200 hover:border-brand-400 bg-gray-50/60"
                  }`}
                  onClick={() => onboardingRecordRef.current?.click()}
                  onDragLeave={() => setDragOver(false)}
                  onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(false);
                    startWithRecord(event.dataTransfer.files?.[0]);
                  }}
                >
                  <span className="text-2xl block mb-1">📤</span>
                  <span className="text-xs font-bold text-gray-800 block">PDF를 끌어다 놓거나 눌러서 선택</span>
                  <span className="text-[11px] text-gray-400 mt-0.5 block">{SCHOOL_RECORD_MAX_FILE_SIZE_LABEL} 이하 · 분석에 1~2분</span>
                </div>

                <div className="space-y-2 text-xs text-gray-600 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span> 과목·세특·수상·봉사·독서를 항목으로 정리
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span> 이름과 현재 학년을 읽어 기본 정보를 자동 입력
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span> 정리한 기록이 그대로 진단과 상담의 근거가 됨
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-4 border-t border-gray-100">
                <button
                  className="w-full py-3 rounded-xl bg-brand-500 text-white font-bold text-sm hover:bg-brand-600 transition shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                  onClick={() => onboardingRecordRef.current?.click()}
                  type="button"
                >
                  <span>학생부 올리고 시작하기</span>
                  <span>➔</span>
                </button>
              </div>
            </div>

            {/* 경로 2 — 기록 없이 시작 */}
            <div className="bg-white rounded-2xl border border-gray-200/90 p-7 shadow-xs flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="w-12 h-12 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center text-xl flex-none">🌱</span>
                  <span className="block">
                    <span className="block text-lg font-bold text-gray-900">학생부 없이 새로 시작</span>
                    <span className="block text-xs text-gray-500">1학년이거나, 지금은 올리고 싶지 않은 경우</span>
                  </span>
                </div>

                <p className="text-xs text-gray-600 leading-relaxed">
                  과거 기록이 없어도 괜찮습니다. 관심분야와 목표를 답해주시면 AI가 그 자리에서 확인 질문을 만들고,
                  이어지는 상담에서 이번 학기 목표와 탐구 주제를 함께 정합니다. 학생부는 나중에 [활동 &amp; 세특] 화면에서
                  언제든 올릴 수 있습니다.
                </p>

                <div className="space-y-2.5 p-4 rounded-xl bg-gray-50 border border-gray-100 text-xs">
                  <div>
                    <span className="text-[11px] font-bold text-gray-500 block mb-1.5">이런 걸 물어봅니다</span>
                    <div className="flex flex-wrap gap-1.5">
                      {["이름", "현재 학년·학기", "끌리는 진로 분야", "연결하고 싶은 학과", "탐구 관심 축", "지켜야 할 제약"].map((item) => (
                        <span className="px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-white border border-gray-200 text-gray-700" key={item}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-gray-600 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-500 font-bold">✓</span> 진로 분야를 적으면 AI가 학과·탐구 축 후보를 제안
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-blue-500 font-bold">✓</span> 답한 내용만으로도 진단과 상담이 진행됨
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-4 border-t border-gray-100">
                <button
                  className="w-full py-3 rounded-xl bg-gray-900 text-white font-bold text-sm hover:bg-gray-800 transition flex items-center justify-center gap-2"
                  onClick={() => setStep("profile")}
                  type="button"
                >
                  <span>기본 정보로 시작하기</span>
                  <span>➔</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-gray-500 bg-white/80 border border-gray-200/70 px-4 py-2 rounded-full mx-auto w-fit text-center">
            <span>🔒</span>
            <span>업로드한 학생부는 본인 계정에만 보관되며, 다른 학생의 화면에서는 조회되지 않습니다.</span>
          </div>
        </div>
      )}

      {/* ───────── Step 1 — 기본 정보와 목표 ───────── */}
      {step === "profile" && (
        <div className="w-full max-w-3xl mx-auto space-y-6">
          {stepper("profile")}

          {/* 학생부 상태 — 분석은 이 화면을 막지 않고 뒤에서 돈다 */}
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              onboardingRecordBusy
                ? "bg-blue-50/60 border-brand-200"
                : onboardingRecordFile
                  ? "bg-emerald-50/50 border-emerald-200"
                  : "bg-white border-gray-200/80"
            }`}
          >
            <div className="flex items-start gap-3 min-w-0">
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-none ${
                  onboardingRecordBusy ? "bg-brand-500 text-white animate-pulse" : onboardingRecordFile ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"
                }`}
              >
                {onboardingRecordBusy ? "⚡" : onboardingRecordFile ? "✓" : "📄"}
              </span>
              <div className="min-w-0">
                <strong className="block text-xs font-extrabold text-gray-900">
                  {onboardingRecordBusy ? "학생부 분석 중" : onboardingRecordFile ? "학생부 분석 완료" : "학생부 없이 진행 중"}
                </strong>
                <span className="block text-[11px] text-gray-500 leading-relaxed mt-0.5">
                  {onboardingRecordBusy
                    ? "보통 1~2분 걸립니다. 기다리는 동안 아래 정보를 먼저 채워 주세요."
                    : onboardingRecordFile || "지금 올려도 되고, 나중에 [활동 & 세특] 화면에서 올려도 됩니다."}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-none">
              <button
                className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-[11px] font-bold transition"
                disabled={onboardingRecordBusy}
                onClick={() => onboardingRecordRef.current?.click()}
                type="button"
              >
                {onboardingRecordBusy ? "분석 중…" : onboardingRecordFile ? "다른 PDF" : "PDF 올리기"}
              </button>
              {onboardingRecordBusy && (
                <button
                  aria-label="학생부 분석 취소"
                  className="w-7 h-7 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-gray-700 text-xs font-bold transition"
                  onClick={cancelOnboardingRecordAnalysis}
                  title="분석 취소"
                  type="button"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {onboardingRecordBusy && (
            <div className="h-1 w-full rounded-full bg-gray-200 overflow-hidden">
              <div className="h-1 w-1/3 rounded-full bg-brand-500 animate-pulse" />
            </div>
          )}
          {onboardingRecordMessage && !onboardingRecordBusy && (
            <div className="banner banner-success">{onboardingRecordMessage}</div>
          )}

          <div className="bg-white p-6 sm:p-7 rounded-2xl border border-gray-200/80 shadow-xs space-y-6">
            <div>
              <h2 className="text-xl font-extrabold text-gray-950 tracking-tight">기본 정보와 목표를 확인해 주세요</h2>
              <p className="text-xs text-gray-500 mt-1">
                여기 적은 내용을 바탕으로 다음 화면에서 AI가 맞춤 확인 질문을 만듭니다.
              </p>
            </div>

            {/* 1. 인적 사항 */}
            <div className="space-y-4 pt-2 border-t border-gray-100">
              <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-1.5">
                <span>👤</span>
                <span>1. 학생 기본 정보</span>
              </h3>

              <div>
                <label className="text-[11px] font-bold text-gray-600 block mb-1" htmlFor="ob-name">학생 이름</label>
                <input
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs font-semibold focus:outline-none bg-gray-50/50 focus:bg-white transition ${
                    recordNameMismatch ? "border-amber-400 focus:border-amber-500" : "border-gray-200 focus:border-brand-500"
                  }`}
                  id="ob-name"
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="예: 김세특"
                  value={form.name}
                />
                {recordNameMismatch && (
                  <div className="mt-2 p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-[11px] text-amber-900 leading-relaxed">
                      업로드한 학생부의 이름은 <strong className="font-bold">{recordStudentName}</strong>입니다. 다른 학생의 자료라면 학생부를 다시 올려주세요.
                    </span>
                    <button
                      className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-800 text-[11px] font-bold hover:bg-amber-100 transition flex-none"
                      onClick={() => update("name", recordStudentName)}
                      type="button"
                    >
                      학생부 이름으로 바꾸기
                    </button>
                  </div>
                )}
              </div>

              <div>
                <span className="text-[11px] font-bold text-gray-600 block mb-1.5">현재 학년 및 학기</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { grade: "1", semester: "1" }, { grade: "1", semester: "2" },
                    { grade: "2", semester: "1" }, { grade: "2", semester: "2" },
                    { grade: "3", semester: "1" }, { grade: "3", semester: "2" },
                  ].map((item) => {
                    const isActive = form.grade === item.grade && form.semester === item.semester;
                    return (
                      <button
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition disabled:opacity-50 ${
                          isActive ? "bg-brand-500 text-white font-bold" : "bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200"
                        }`}
                        disabled={recordLocked}
                        key={`${item.grade}-${item.semester}`}
                        onClick={() => setForm((cur) => ({ ...cur, grade: item.grade, semester: item.semester }))}
                        type="button"
                      >
                        {item.grade}학년 {item.semester}학기
                      </button>
                    );
                  })}
                  <button
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition disabled:opacity-50 ${
                      isGraduatedGrade(form.grade) ? "bg-gray-900 text-white font-bold" : "bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200"
                    }`}
                    disabled={recordLocked}
                    onClick={() => updateGrade("graduated")}
                    type="button"
                  >
                    졸업
                  </button>
                </div>
                {recordLocked && (
                  <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                    학년과 학기는 업로드한 학생부에서 확인한 값을 사용합니다. 다르면 다음 확인 질문에서 바로잡습니다.
                  </p>
                )}
              </div>
            </div>

            {/* 2. 목표와 관심 */}
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-1.5">
                  <span>🎯</span>
                  <span>2. 목표 진로와 탐구 관심 축</span>
                </h3>
                <span className="text-[10px] text-gray-400 font-semibold">적으면 AI가 후보를 제안합니다</span>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-600 block mb-1" htmlFor="ob-career">현재 가장 끌리는 분야 또는 진로</label>
                <input
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:border-brand-500 focus:outline-none bg-gray-50/50 focus:bg-white transition"
                  id="ob-career"
                  onChange={(e) => update("targetCareer", e.target.value)}
                  placeholder="예: 인공지능 의료, 뇌과학, 교육격차, 로봇공학"
                  value={form.targetCareer}
                />
              </div>

              {(suggestBusy || suggestions) && (
                <div className="p-3.5 rounded-2xl bg-gray-50/80 border border-gray-200/80 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-gray-700">AI가 찾은 연결 후보 · 누르면 아래에 담깁니다</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500">
                      {suggestBusy ? "생성 중…" : suggestions?.provider === "deepseek" ? "AI 추천" : "기본 추천"}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-gray-500 block">학과 후보</span>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestBusy && !suggestions
                        ? Array.from({ length: 5 }).map((_, index) => (
                          <span className="h-6 w-20 rounded-lg bg-gray-200/70 animate-pulse" key={index} />
                        ))
                        : suggestions?.majors.map((major) => (
                          <button
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white text-gray-700 hover:bg-brand-50 hover:text-brand-700 border border-gray-200/80 transition"
                            key={major}
                            onClick={() => addListValue("targetMajors", major)}
                            type="button"
                          >
                            {major}
                          </button>
                        ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-gray-500 block">탐구 큰 축 후보</span>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestBusy && !suggestions
                        ? Array.from({ length: 6 }).map((_, index) => (
                          <span className="h-6 w-28 rounded-lg bg-gray-200/70 animate-pulse" key={index} />
                        ))
                        : suggestions?.keywords.map((keyword) => (
                          <button
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white text-gray-700 hover:bg-brand-50 hover:text-brand-700 border border-gray-200/80 transition"
                            key={keyword}
                            onClick={() => addListValue("interests", keyword)}
                            type="button"
                          >
                            {keyword}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-gray-600 block mb-1" htmlFor="ob-majors">연결 가능한 학과 후보</label>
                  <input
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:border-brand-500 focus:outline-none bg-gray-50/50 focus:bg-white transition"
                    id="ob-majors"
                    onChange={(e) => update("targetMajors", e.target.value)}
                    placeholder="예: 컴퓨터공학, 의공학, 심리학"
                    value={form.targetMajors}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-600 block mb-1" htmlFor="ob-interests">앞으로 다룰 큰 관심 축</label>
                  <input
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:border-brand-500 focus:outline-none bg-gray-50/50 focus:bg-white transition"
                    id="ob-interests"
                    onChange={(e) => update("interests", e.target.value)}
                    placeholder="예: 데이터 편향, 의료 영상, 학습 격차"
                    value={form.interests}
                  />
                </div>
              </div>
            </div>

            {/* 3. 진로 구체도 */}
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-1.5">
                <span>🧭</span>
                <span>3. 진로가 어느 정도 정해졌나요?</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { value: "넓은 분야만 정한 단계", label: "넓은 분야만 있음", desc: "예: 의료, AI, 교육. 추가 질문 없이 상담에서 좁혀갑니다." },
                  { value: "구체적인 학과나 직무까지 정한 단계", label: "구체 목표가 있음", desc: "학과·직무·주제가 꽤 명확합니다." },
                ].map((item) => {
                  const isActive = form.careerResolution === item.value;
                  return (
                    <button
                      className={`p-3.5 rounded-xl border text-left transition ${
                        isActive ? "border-brand-500 bg-blue-50/40" : "border-gray-200 hover:border-gray-300 bg-gray-50/30"
                      }`}
                      key={item.value}
                      onClick={() => updateCareerResolution(item.value)}
                      type="button"
                    >
                      <span className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-none ${
                          isActive ? "bg-brand-500 text-white" : "border border-gray-300 bg-white"
                        }`}>
                          {isActive ? "✓" : ""}
                        </span>
                        <span className={`font-bold text-xs ${isActive ? "text-brand-700" : "text-gray-800"}`}>{item.label}</span>
                      </span>
                      <span className="text-[11px] text-gray-500 block leading-snug mt-1 pl-6">{item.desc}</span>
                    </button>
                  );
                })}
              </div>

              {form.careerResolution === "구체적인 학과나 직무까지 정한 단계" && (
                <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-200/80 space-y-3.5">
                  <div>
                    <strong className="block text-[11px] font-extrabold text-gray-900">관련 배경지식에 맞춰 탐구 난이도를 조절합니다</strong>
                    <span className="block text-[11px] text-gray-500 mt-0.5">배경지식이 있더라도 기초부터 쌓고 싶다면 &lsquo;하&rsquo;를 고르세요.</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { value: "하", desc: "기초 개념부터 차근히" },
                      { value: "중", desc: "기본 개념은 알고 적용해보고 싶음" },
                      { value: "상", desc: "심화·차별화 탐구부터 가능" },
                    ].map((item) => {
                      const isActive = form.knowledgeLevel === item.value;
                      return (
                        <button
                          className={`px-3 py-2.5 rounded-xl border text-left transition ${
                            isActive ? "border-brand-500 bg-white" : "border-gray-200 bg-white/60 hover:border-gray-300"
                          }`}
                          key={item.value}
                          onClick={() => update("knowledgeLevel", item.value)}
                          type="button"
                        >
                          <span className={`block text-xs font-bold ${isActive ? "text-brand-600" : "text-gray-800"}`}>{item.value}</span>
                          <span className="block text-[11px] text-gray-500 leading-snug mt-0.5">{item.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-600 block mb-1" htmlFor="ob-question">특히 궁금한 세부 키워드나 문제</label>
                    <textarea
                      className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:border-brand-500 focus:outline-none bg-white transition min-h-20"
                      id="ob-question"
                      onChange={(e) => update("concreteResearchQuestion", e.target.value)}
                      placeholder={
                        form.knowledgeLevel === "상"
                          ? "예: 의료 AI 진단 모델의 오류 원인을 데이터 편향 관점에서 분석하고 싶음"
                          : form.knowledgeLevel === "중"
                            ? "예: AI 진단 정확도, 의료 데이터, 모델 비교처럼 관심 키워드를 적어주세요"
                            : "아직 안 적어도 됩니다. 키워드 1~2개만 적어도 괜찮아요."
                      }
                      value={form.concreteResearchQuestion}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 4. 고민 (자기평가 약점으로 저장된다) */}
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-1.5">
                  <span>💭</span>
                  <span>4. 지금 가장 고민되는 부분 (복수 선택 · 선택 사항)</span>
                </h3>
                <span className="text-[10px] text-gray-400 font-medium">선택 {gapValues.length}건</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ONBOARDING_CONCERNS.map((item) => {
                  const isChecked = gapValues.includes(item.title);
                  return (
                    <button
                      className={`p-3.5 rounded-xl border text-left transition flex items-start gap-2.5 ${
                        isChecked ? "border-brand-500 bg-blue-50/40" : "border-gray-200 hover:border-gray-300 bg-gray-50/30"
                      }`}
                      key={item.title}
                      onClick={() => toggleGap(item.title)}
                      type="button"
                    >
                      <span className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center text-[10px] font-bold flex-none ${
                        isChecked ? "bg-brand-500 text-white" : "border border-gray-300 bg-white"
                      }`}>
                        {isChecked ? "✓" : ""}
                      </span>
                      <span className="block">
                        <span className={`font-bold text-xs block ${isChecked ? "text-brand-700" : "text-gray-800"}`}>{item.title}</span>
                        <span className="text-[11px] text-gray-500 block leading-snug">{item.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5. 제약 */}
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-1.5">
                <span>⚠️</span>
                <span>5. 계획을 짤 때 반드시 피해야 할 제약 (선택 사항)</span>
              </h3>
              <input
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:border-brand-500 focus:outline-none bg-gray-50/50 focus:bg-white transition"
                id="ob-constraints"
                onChange={(e) => update("constraints", e.target.value)}
                placeholder="예: 코딩 불가, 실험실 사용 어려움, 교외대회 준비 시간 없음 / 없으면 비워두기"
                value={form.constraints}
              />
              <p className="text-[11px] text-gray-400 leading-relaxed">
                연결 과목·강점·활용 자원은 학생부와 이후 활동 기록을 보고 시스템이 판단합니다. 여기에는 꼭 지켜야 할 제약만 적어주세요.
              </p>
            </div>

            {/* 하단 버튼 */}
            <div className="pt-6 border-t border-gray-100 flex items-center justify-between gap-4">
              <button
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold transition"
                onClick={() => setStep("select")}
                type="button"
              >
                ← 이전으로
              </button>
              <button
                className="px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xs shadow-xs hover:shadow transition flex items-center gap-1.5"
                disabled={!canLeaveProfileStep || clarificationBusy || onboardingRecordBusy}
                onClick={startClarification}
                type="button"
              >
                <span>
                  {onboardingRecordBusy
                    ? "학생부 분석이 끝나면 진행할 수 있어요"
                    : clarificationBusy
                      ? "확인 질문을 만드는 중…"
                      : "다음 단계: AI 맞춤 확인 질문 ➔"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────── Step 2 — AI 맞춤 확인 질문 ───────── */}
      {step === "ai" && (
        <div className="w-full max-w-3xl mx-auto space-y-6">
          {stepper("ai")}

          <div className="bg-white p-5 rounded-2xl border border-gray-200/90 shadow-xs space-y-2.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-5 h-5 rounded-md bg-blue-50 text-brand-600 flex items-center justify-center text-xs font-bold flex-none">💡</span>
              <span className="text-gray-950 font-extrabold">AI 사전 확인 브리핑</span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              {clarificationSummary || (
                <>
                  <strong className="text-gray-900 font-bold">{form.name || "학생"}</strong>
                  {" "}학생이 입력한 정보
                  {form.grade && (
                    <span className="text-gray-800 font-semibold">
                      ({isGraduatedGrade(form.grade) ? "졸업" : `${form.grade}학년 ${form.semester}학기`}
                      {form.targetCareer ? ` · ${form.targetCareer}` : ""})
                    </span>
                  )}
                  와 학생부 기록을 대조해, 방향이 달라질 수 있는 것만 골라 확인합니다. 답변한 뒤에도 더 물을 것이 있으면 계속 이어집니다.
                </>
              )}
            </p>
          </div>

          {recordOnlyMode && onboardingRecordParse && (
            <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-gray-100">
                <div className="min-w-0">
                  <span className="block text-[10px] font-bold text-gray-400">학생부 정리 결과</span>
                  <strong className="block text-sm font-extrabold text-gray-900 truncate">{onboardingRecordParse.fileName}</strong>
                </div>
                <span className="text-[11px] font-bold text-gray-500 flex-none">
                  활동 {onboardingRecordParse.entries.length}개 · 과목 {onboardingRecordParse.courses.length}개
                </span>
              </div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {onboardingRecordParse.entries.slice(0, 12).map((entry) => (
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50/60 border border-gray-100" key={entry.id}>
                    <span className="text-[10px] font-bold text-gray-400 flex-none pt-0.5">
                      {entry.grade}학년 {entry.semester ? `${entry.semester}학기` : ""}
                    </span>
                    <span className="min-w-0">
                      <strong className="block text-xs font-bold text-gray-900 truncate">{entry.title}</strong>
                      <span className="block text-[11px] text-gray-500 truncate">{entry.subject || entry.category} · {entry.summary}</span>
                    </span>
                  </div>
                ))}
                {!onboardingRecordParse.entries.length && (
                  <p className="text-xs text-gray-400">구조화할 활동 후보를 찾지 못했습니다. PDF 원문을 다시 확인해주세요.</p>
                )}
              </div>
              {onboardingRecordParse.entries.length > 12 && (
                <span className="block text-[11px] text-gray-400">활동 후보 {onboardingRecordParse.entries.length - 12}개가 더 있습니다.</span>
              )}
            </div>
          )}

          {clarificationQuestions.length > 0 && (
            <div className="bg-white p-6 sm:p-7 rounded-2xl border border-gray-200/80 shadow-xs space-y-7">
              {clarificationQuestions.map((question, index) => {
                const tone = AI_QUESTION_TONES[index % AI_QUESTION_TONES.length];
                const selected = clarificationAnswers.find((answer) => answer.id === question.id)?.answer
                  ?? readClarificationAnswer(form.roadmapDesignNotes, question.id);
                const selectedParts = clarificationAnswerParts(selected);
                const otherSelected = selectedParts.some((part) => part.startsWith("기타"));
                const otherValue = selectedParts.find((part) => part.startsWith("기타:"))?.replace(/^기타:\s*/, "") ?? "";
                return (
                  <div className={`space-y-3 ${index > 0 ? "pt-5 border-t border-gray-100" : ""}`} key={question.id}>
                    <div className="space-y-1">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${tone.chip}`}>
                        AI 맞춤 질문 {String(index + 1).padStart(2, "0")} · {question.label}
                      </span>
                      <h3 className="text-sm font-extrabold text-gray-900">{question.question}</h3>
                      {question.why && <p className="text-xs text-gray-500">이 답이 필요한 이유: {question.why}</p>}
                    </div>

                    <div className="space-y-2">
                      {clarificationOptions(question).map((option) => {
                        const isSelected = option === OTHER_CLARIFICATION_OPTION ? otherSelected : selectedParts.includes(option);
                        return (
                          <button
                            className={`w-full p-3.5 rounded-xl border text-left transition flex items-center justify-between gap-3 text-xs ${
                              isSelected ? tone.card : "border-gray-200 hover:border-gray-300 bg-gray-50/30 text-gray-700"
                            }`}
                            key={option}
                            onClick={() => chooseClarificationOption(question, option)}
                            type="button"
                          >
                            <span className="flex items-center gap-2.5">
                              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] flex-none ${
                                isSelected ? `${tone.dot} text-white font-bold` : "border border-gray-300 bg-white"
                              }`}>
                                {isSelected ? "✓" : ""}
                              </span>
                              <span>{option}</span>
                            </span>
                            {isSelected && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-none ${tone.badge}`}>선택됨</span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {allowsMultipleClarificationAnswers(question) && (
                      <span className="block text-[11px] text-gray-400">복수 선택 가능</span>
                    )}

                    {otherSelected && (
                      <div>
                        <label className="text-[11px] font-bold text-gray-600 block mb-1" htmlFor={`other-${question.id}`}>직접 입력</label>
                        <input
                          className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:border-brand-500 focus:outline-none bg-gray-50/50 focus:bg-white transition"
                          id={`other-${question.id}`}
                          onChange={(event) => updateOtherClarificationAnswer(question, event.target.value)}
                          placeholder="선택지에 없는 내용을 적어주세요"
                          value={otherValue}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {clarificationBlocked && (
            <div className="banner banner-warning">{clarificationSummary || "업로드한 학생부로는 진행할 수 없습니다."}</div>
          )}

          {!clarificationBlocked && clarificationComplete && (
            <div className="bg-white p-6 sm:p-7 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
              <div>
                <strong className="block text-sm font-extrabold text-gray-900">더 확인할 것이 없습니다</strong>
                <span className="block text-xs text-gray-500 mt-1">
                  선택한 답변은 자동으로 반영됩니다. 선택지에 없던 학교 상황이나 꼭 지켜야 할 방향만 아래에 적어주세요.
                </span>
              </div>
              <textarea
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-brand-500 focus:outline-none bg-gray-50/50 focus:bg-white transition min-h-20"
                id="ob-roadmap-notes"
                onChange={(e) => update("roadmapDesignNotes", e.target.value)}
                placeholder="예: 2학기에는 과학 과목에서만 새 주제를 시도할 수 있음"
                value={form.roadmapDesignNotes}
              />
            </div>
          )}

          <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between gap-4">
            <button
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold transition"
              onClick={() => setStep("profile")}
              type="button"
            >
              ← 기본 정보 수정
            </button>
            <button
              className="px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center gap-2"
              disabled={(!recordOnlyMode && clarificationBlocked) || busy || clarificationBusy || onboardingRecordBusy || !canSubmitProfile}
              onClick={recordOnlyMode || clarificationComplete ? confirmOnboarding : continueClarification}
              type="button"
            >
              <span>
                {recordOnlyMode
                  ? "학생부 기록으로 시작하기"
                  : clarificationBlocked
                    ? "졸업자 학생부로는 진행 불가"
                    : onboardingRecordBusy
                      ? "학생부 분석 대기 중…"
                      : clarificationBusy
                        ? "답변 반영해 다시 검토 중…"
                        : busy
                          ? "저장하는 중…"
                          : clarificationComplete
                            ? "AI 정밀 진단 시작하기"
                            : "답변 반영하고 다시 검토하기"}
              </span>
              <span>➔</span>
            </button>
          </div>
        </div>
      )}
    </GateFrame>
  );
}


/* ──────────────────────────────────────────────
   Overview
   ────────────────────────────────────────────── */
function Overview({ workspace, onNavigate, onConvertPlan, onWorkspace }: { workspace: ProductWorkspace; onNavigate: (tab: TabId) => void; onConvertPlan: (draft: ActivityDraft) => void; onWorkspace: (workspace: ProductWorkspace) => void }) {
  const active = workspace.roadmap.nodes.find((n) => n.isCurrent)
    ?? workspace.roadmap.nodes.find((n) => n.status === "active");
  // 백엔드가 쓰는 값은 done/partial이다. "completed"만 세면 실제로 달성한 학기가
  // 있어도 진행이 0으로 표시된다.
  const completed = workspace.roadmap.nodes.filter((n) => n.status === "done").length;
  const [selectedPlan, setSelectedPlan] = useState<RoadmapPlanEvent | null>(null);
  const completedPlanIds = new Set(workspace.activities.map((activity) => activity.planEventId).filter(Boolean));

  const [diagnosisBusy, setDiagnosisBusy] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState("");
  const [preQuestions, setPreQuestions] = useState<DiagnosisPreQuestion[] | null>(null);
  const [preAnswerDrafts, setPreAnswerDrafts] = useState<Record<string, string>>({});
  const [diagnosisDetailOpen, setDiagnosisDetailOpen] = useState(false);
  const hasDiagnosis = Boolean(workspace.dna.narrative);
  const activityTitleById = new Map(workspace.activities.map((a) => [a.id, a.title]));

  // 진단은 순서대로 이어지는 여러 LLM 호출을 거치는 백그라운드 job이라 즉시
  // 끝나지 않는다. 생기부 분석과 같은 방식으로 상태를 폴링한다.
  async function pollDiagnosis(diagnosisId: string) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const poll = await jsonRequest<{ status: string; workspace?: ProductWorkspace }>(
        `/api/diagnosis/status/${encodeURIComponent(diagnosisId)}`,
      );
      if (poll.status === "done") {
        if (poll.workspace) onWorkspace(poll.workspace);
        return;
      }
      if (poll.status === "failed") throw new Error("진단 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
    throw new Error("진단이 예상보다 오래 걸리고 있습니다. 잠시 후 다시 시도해주세요.");
  }

  async function startDiagnosisJob() {
    setDiagnosisBusy(true);
    setDiagnosisError("");
    try {
      const created = await jsonRequest<{ diagnosisId: string; status: string }>("/api/diagnosis/run", {
        method: "POST",
      });
      await pollDiagnosis(created.diagnosisId);
    } catch (error) {
      setDiagnosisError(error instanceof Error ? error.message : "진단을 실행하지 못했습니다.");
    } finally {
      setDiagnosisBusy(false);
    }
  }

  /** 진단 버튼을 누르면 사전질문부터 확인한다 — 최초 진단에만 나오고, 재진단은 빈
   *  배열을 받아 바로 진단으로 넘어간다. */
  async function beginDiagnosis() {
    setDiagnosisError("");
    setDiagnosisBusy(true);
    try {
      const pre = await jsonRequest<{ questions: DiagnosisPreQuestion[] }>("/api/diagnosis/pre-questions");
      if (pre.questions.length > 0) {
        setPreAnswerDrafts({});
        setPreQuestions(pre.questions);
        setDiagnosisBusy(false);
        return;
      }
    } catch (error) {
      setDiagnosisError(error instanceof Error ? error.message : "사전 질문을 불러오지 못했습니다.");
      setDiagnosisBusy(false);
      return;
    }
    await startDiagnosisJob();
  }

  async function submitPreQuestions(questions: DiagnosisPreQuestion[], skip: boolean) {
    const answers = questions.map((question) => ({
      key: question.key,
      prompt: question.prompt,
      answer: skip ? null : preAnswerDrafts[question.key]?.trim() || null,
    }));
    setPreQuestions(null);
    setDiagnosisBusy(true);
    try {
      await jsonRequest("/api/diagnosis/pre-questions/answers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers }),
      });
    } catch (error) {
      setDiagnosisError(error instanceof Error ? error.message : "답변을 저장하지 못했습니다.");
      setDiagnosisBusy(false);
      return;
    }
    await startDiagnosisJob();
  }

  return (
    <div className="overview-page">
      {/* Current Semester Plans */}
      <section className="bg-white p-6 md:p-8 rounded-2xl border border-gray-200/80 shadow-xs space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-brand-600 bg-brand-50 px-3 py-1 rounded-full border border-brand-200/60 inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              THIS SEMESTER · {workspace.profile.grade}학년 {workspace.profile.semester}학기
            </span>
            {workspace.profile.targetCareer && (
              <span className="text-xs text-gray-500 font-semibold">
                진로 집중: <strong className="text-gray-900 font-bold">{workspace.profile.targetCareer}</strong>
              </span>
            )}
          </div>

          <h2 className="text-xl md:text-2xl font-extrabold text-gray-950 tracking-tight leading-snug">
            이번 학기 목표: <span className="text-brand-600">{active?.objective ?? "아직 목표가 없습니다"}</span>
          </h2>

          {active && active.competencyGoals.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {active.competencyGoals.map((goal) => (
                <span className="px-3 py-1 rounded-lg bg-gray-50 border border-gray-200/90 text-xs font-semibold text-gray-700" key={goal}>
                  {goal}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="pt-5 border-t border-gray-100 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-base">💡</span>
              <h3 className="text-sm font-bold text-gray-950">이번 학기 활동 주제 제안</h3>
              {active && (
                <span className="text-xs text-gray-400">
                  · {active.grade}-{active.semester}학기 목표에서 이어지는 주제
                </span>
              )}
            </div>
            <span className="text-xs font-bold text-amber-700 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200/80">
              ★ 먼저 검토하면 좋은 주제
            </span>
          </div>

          {active?.planEvents && active.planEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {active.planEvents.map((ev) => {
                const isCore = ev.priority === "core";
                const isCompleted = completedPlanIds.has(ev.id);
                return (
                  <div
                    className="p-4 rounded-xl border border-gray-200/90 bg-white hover:border-brand-400 hover:shadow-sm transition cursor-pointer flex flex-col justify-between gap-3 group"
                    key={ev.id}
                    onClick={() => setSelectedPlan(ev)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedPlan(ev); } }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap ${isCore ? "bg-amber-100 text-amber-900 border border-amber-200" : "bg-gray-100 text-gray-700"}`}>
                            {isCore ? "★ 최우선" : "선택 심화"}
                          </span>
                          {ev.subject && (
                            <span className="text-[11px] font-semibold text-brand-600 bg-brand-50 px-2 py-0.5 rounded truncate">
                              {ev.subject}
                            </span>
                          )}
                        </div>
                        {isCompleted && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap">
                            <span>✓</span> 작성 완료
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs md:text-sm font-bold text-gray-950 group-hover:text-brand-600 transition leading-snug">
                        {ev.title}
                      </h4>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        {ev.description || "이 학기의 목표와 연결되는 탐구 주제입니다."}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2 text-xs">
                      <span className="text-gray-400 text-[11px]">클릭하여 상세 가이드 확인</span>
                      <button
                        className="px-2.5 py-1 rounded-lg bg-gray-50 hover:bg-brand-50 text-brand-600 hover:text-brand-700 font-bold text-xs border border-gray-200 hover:border-brand-200 transition whitespace-nowrap"
                        onClick={(event) => {
                          event.stopPropagation();
                          onConvertPlan({ title: ev.title, subject: ev.subject, planEventId: ev.id, roadmapNodeId: active.id });
                        }}
                        type="button"
                      >
                        이 주제를 실제 활동에 연결 →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400">이번 학기에 제안된 활동 주제가 없습니다.</p>
          )}
        </div>
      </section>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* 배지는 실제로 센 값만 보여준다 — 셀 수 없는 자리는 배지를 아예 그리지 않는다. */}
        {[
          {
            label: "학기 진행",
            value: `${completed} / 6`,
            desc: "완료 노드",
            badge: `${Math.round((completed / 6) * 100)}%`,
            badgeColor: "bg-blue-50 text-brand-600",
          },
          {
            label: "활동 메모리",
            value: `${workspace.activities.length}건`,
            desc: "구조화 기록",
            badge: `탐구 활동 ${workspace.activities.filter((a) => a.recordKind === "activity").length}건`,
            badgeColor: "bg-emerald-50 text-emerald-600",
          },
          {
            label: "현재 단계",
            value: active?.narrativeStage ?? "회고",
            desc: active ? `${active.grade}학년 ${active.semester}학기` : "전체 완료",
            badge: active ? `${active.grade}-${active.semester}` : null,
            badgeColor: "bg-purple-50 text-purple-600",
          },
          {
            label: "정합 기록",
            value: `${workspace.reconciliations.length}건`,
            desc: "계획-실행 비교",
            badge: workspace.reconciliations.length
              ? `일치 ${workspace.reconciliations.filter((r) => r.matchType === "MATCH").length}건`
              : null,
            badgeColor: "bg-amber-50 text-amber-700",
          },
        ].map((metric) => (
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-2" key={metric.label}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-400">{metric.label}</span>
              {metric.badge && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${metric.badgeColor}`}>
                  {metric.badge}
                </span>
              )}
            </div>
            <strong className="text-2xl font-extrabold text-gray-950 block tracking-tight">{metric.value}</strong>
            <span className="text-xs text-gray-500 font-medium block">{metric.desc}</span>
          </div>
        ))}
      </div>

      {/* Grid: DNA + Active Node */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* DNA Card */}
        <section className="lg:col-span-2 bg-white p-6 md:p-7 rounded-2xl border border-gray-200/80 shadow-xs space-y-5">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600">MAJOR NARRATIVE DNA</span>
              <h3 className="text-base font-extrabold text-gray-950 mt-0.5">관심분야와 증거를 분리해 보여줘요</h3>
            </div>
            <button
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60 ${
                hasDiagnosis
                  ? "border border-gray-200 hover:bg-gray-50 text-gray-700"
                  : "bg-brand-500 hover:bg-brand-600 text-white shadow-brand-glow"
              }`}
              disabled={diagnosisBusy}
              onClick={() => void beginDiagnosis()}
              type="button"
            >
              <span>{hasDiagnosis ? "🔄" : "✨"}</span>
              <span>{diagnosisBusy ? "진단 중…" : hasDiagnosis ? "다시 진단하기" : "AI 진단 실행"}</span>
            </button>
          </div>
          <div>
            {diagnosisBusy && (
              <p className="text-xs text-gray-500 mb-3">
                기록을 분석해 진단을 만드는 중입니다. 활동이 많으면 1~2분 정도 걸릴 수 있어요.
              </p>
            )}
            {diagnosisError && <div className="banner banner-error" style={{ marginBottom: 12 }}>{diagnosisError}</div>}
            {hasDiagnosis ? (
              <>
                <div className="p-4 rounded-xl bg-gradient-to-r from-brand-50/70 to-blue-50/40 border border-brand-100/80">
                  <p className="text-xs md:text-sm font-semibold text-gray-800 leading-relaxed">{workspace.dna.narrative}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="p-4 rounded-xl bg-gray-50/70 border border-gray-200/80 space-y-2.5">
                    <div className="flex items-center gap-1.5 pb-1 border-b border-gray-200/60">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <strong className="text-xs font-extrabold text-gray-900">확인된 사실 (Fact)</strong>
                    </div>
                    <div className="space-y-2">
                      {workspace.dna.facts.length ? (
                        workspace.dna.facts.map((fact) => (
                          <p className="text-xs text-gray-600 leading-relaxed" key={fact}>{fact}</p>
                        ))
                      ) : (
                        <p className="text-xs text-gray-400">기록에서 확인된 사실이 아직 없습니다.</p>
                      )}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-brand-50/40 border border-brand-100/70 space-y-2.5">
                    <div className="flex items-center gap-1.5 pb-1 border-b border-brand-100">
                      <span className="w-2 h-2 rounded-full bg-brand-500" />
                      <strong className="text-xs font-extrabold text-gray-900">AI 해석 (Interpretation)</strong>
                    </div>
                    <div className="space-y-2">
                      {workspace.dna.interpretations.map((item) => (
                        <p className="text-xs text-gray-600 leading-relaxed" key={item.statement}>{item.statement}</p>
                      ))}
                    </div>
                  </div>
                </div>
                {workspace.dna.riskFlags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {workspace.dna.riskFlags.map((flag) => (
                      <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200/80 px-2.5 py-1 rounded-lg" key={flag}>
                        주의 · {flag}
                      </span>
                    ))}
                  </div>
                )}
                {workspace.dna.opportunities.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {workspace.dna.opportunities.map((item) => (
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-lg" key={item}>
                        기회 · {item}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  className="text-xs font-bold text-brand-600 hover:text-brand-700 transition mt-4"
                  onClick={() => setDiagnosisDetailOpen((cur) => !cur)}
                  type="button"
                >
                  {diagnosisDetailOpen ? "진단 상세 접기 ▲" : "진단 상세 보기 ▼"}
                </button>
                {diagnosisDetailOpen && (
                  <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 18 }}>
                    {workspace.dna.gradesTrend.length > 0 && (
                      <div>
                        <strong>성적 추이 (학기별 평균 석차등급 · 1에 가까울수록 좋음)</strong>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 100, marginTop: 10, padding: "0 4px" }}>
                          {workspace.dna.gradesTrend.map((point) => {
                            const rank = point.averageRank;
                            const heightPct = rank == null ? 0 : Math.max(6, ((10 - rank) / 9) * 100);
                            return (
                              <div key={`${point.grade}-${point.semester}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, height: "100%", justifyContent: "flex-end" }}>
                                <small style={{ color: "var(--fg-muted)" }}>{rank == null ? "기록 없음" : rank.toFixed(1)}</small>
                                <div style={{ width: "60%", height: `${heightPct}%`, background: rank == null ? "var(--border)" : "var(--blue-500)", borderRadius: "4px 4px 0 0", minHeight: 4 }} />
                                <small style={{ color: "var(--fg-muted)", marginTop: 4 }}>{point.grade}-{point.semester}</small>
                              </div>
                            );
                          })}
                        </div>
                        {workspace.dna.gradesTrend.some((p) => p.excludedCount > 0) && (
                          <small style={{ color: "var(--fg-muted)" }}>석차등급이 없는 과목(진로선택·전문교과 등)은 평균에서 제외했습니다.</small>
                        )}
                      </div>
                    )}
                    {workspace.dna.semesterReviews.length > 0 && (
                      <div>
                        <strong>학기별 평가</strong>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                          {workspace.dna.semesterReviews.map((review) => (
                            <div className="dna-interp" key={`${review.grade}-${review.semester}`} style={{ display: "block" }}>
                              <strong>{review.grade}학년 {review.semester}학기</strong>
                              <p style={{ margin: "6px 0 0" }}>{review.gradesReview}</p>
                              <p style={{ margin: "6px 0 0" }}>{review.readingReview}</p>
                              <p style={{ margin: "6px 0 0" }}>{review.activitiesReview}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {workspace.dna.activityInventory.length > 0 && (
                      <div>
                        <strong>활동 인벤토리 (역량 × 심화도)</strong>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                          {workspace.dna.activityInventory.map((entry) => (
                            <div className="dna-fact" key={entry.activityId}>
                              {entry.grade}학년{entry.semester ? ` ${entry.semester}학기` : ""} · {entry.competency} · {entry.depthLevel} — {entry.headline}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {workspace.dna.knowledgeGraphLinks.length > 0 && (
                      <div>
                        <strong>숨은 연결 (계보로는 안 잡히는 활동 간 연결)</strong>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                          {workspace.dna.knowledgeGraphLinks.map((link, index) => (
                            <div className="dna-fact" key={`${link.fromActivityId}-${link.toActivityId}-${index}`}>
                              {activityTitleById.get(link.fromActivityId) ?? "활동"} ↔ {activityTitleById.get(link.toActivityId) ?? "활동"}
                              <small style={{ display: "block", color: "var(--fg-muted)" }}>
                                {link.linkType === "vertical" ? "심화 연결" : "융합 연결"} · {link.relationLabel}
                              </small>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              !diagnosisBusy && (
                <p style={{ color: "var(--fg-muted)" }}>
                  아직 진단을 실행하지 않았습니다. 지금까지 쌓인 기록으로 강점·약점과 진로 흐름을 분석하려면 진단을 실행해주세요.
                </p>
              )
            )}
          </div>
        </section>

        {/* Active Node Card */}
        <section className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs flex flex-col gap-4">
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-gray-100">
            <div className="min-w-0">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600">ACTIVE ROADMAP NODE</span>
              <h3 className="text-base font-extrabold text-gray-950 mt-0.5 leading-snug">{active?.title ?? "이번 학기 회고"}</h3>
            </div>
            {active && <StatusBadge status={active.status} />}
          </div>
          <p className="text-xs text-gray-600 leading-relaxed flex-1">
            {active?.objective ?? "이번 학기 목표가 아직 없습니다. 상담을 마치면 여기에 표시됩니다."}
          </p>
          {active && active.candidateSubjects.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {active.candidateSubjects.map((subject) => (
                <span className="text-[11px] font-semibold text-gray-700 bg-gray-50 border border-gray-200/90 px-2 py-0.5 rounded-lg" key={subject}>
                  {subject}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Recent Activities */}
      <section className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600">RECENT ACTIVITY</span>
            <h3 className="text-base font-extrabold text-gray-950 mt-0.5">최근 활동과 정합 결과</h3>
          </div>
          <button
            className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition whitespace-nowrap"
            onClick={() => onNavigate("activities")}
            type="button"
          >
            + 활동 추가
          </button>
        </div>
        {workspace.activities.length ? (
          <div className="space-y-2">
            {workspace.activities.slice(0, 3).map((activity) => (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200/90 hover:border-brand-300 transition" key={activity.id}>
                <span className="text-[11px] font-semibold text-brand-600 bg-brand-50 px-2 py-0.5 rounded whitespace-nowrap">
                  {activity.subject || activity.activityCategory || "활동"}
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block text-xs font-bold text-gray-900 truncate">{activity.title}</strong>
                  <small className="block text-[11px] text-gray-400 mt-0.5">{activity.completedAt || activity.periodLabel}</small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <strong className="block text-xs font-bold text-gray-700">아직 활동이 없습니다</strong>
            <p className="text-[11px] text-gray-400 mt-1">첫 활동을 추가하면 진단과 정합 판정이 갱신됩니다.</p>
          </div>
        )}
      </section>
      {selectedPlan && active && <PlanDetailModal plan={selectedPlan} node={active} courseSubjects={workspace.semesterCourses.filter((course) => course.roadmapNodeId === active.id).map((course) => course.subject)} onClose={() => setSelectedPlan(null)} onConvertPlan={onConvertPlan} />}
      {preQuestions && (
        <div className="modal-overlay" onClick={() => setPreQuestions(null)} role="presentation">
          <section aria-label="진단 전 확인 질문" aria-modal="true" className="modal-panel diagnosis-prequestion-panel" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="modal-head">
              <h3>진단하기 전에 몇 가지만 확인할게요</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setPreQuestions(null)} type="button">닫기</button>
            </div>
            <div className="modal-body">
              <p className="onboarding-record-note">
                생기부만으로는 알 수 없는 부분이에요. 답하지 않고 넘어가도 진단은 실행됩니다.
              </p>
              {preQuestions.map((question) => (
                <div className="branch-question-card" key={question.key}>
                  <div className="branch-question-head">
                    <strong>{question.prompt}</strong>
                  </div>
                  {question.options.length > 0 && (
                    <div className="clarity-choice-row">
                      {question.options.map((option) => (
                        <button
                          className={`clarity-choice${preAnswerDrafts[question.key] === option ? " is-active" : ""}`}
                          key={option}
                          onClick={() => setPreAnswerDrafts((cur) => ({ ...cur, [question.key]: option }))}
                          type="button"
                        >
                          <strong>{option}</strong>
                        </button>
                      ))}
                    </div>
                  )}
                  {question.allow_custom && (
                    <div className="form-field" style={{ marginTop: 10 }}>
                      <label htmlFor={`pre-question-${question.key}`}>직접 입력</label>
                      <input
                        id={`pre-question-${question.key}`}
                        onChange={(event) => setPreAnswerDrafts((cur) => ({ ...cur, [question.key]: event.target.value }))}
                        placeholder="답변을 입력해주세요 (선택)"
                        value={preAnswerDrafts[question.key] ?? ""}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => void submitPreQuestions(preQuestions, true)} type="button">
                건너뛰고 진단하기
              </button>
              <button className="btn btn-primary" onClick={() => void submitPreQuestions(preQuestions, false)} type="button">
                답변 제출하고 진단하기
              </button>
            </div>
          </section>
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
  const [recommendationPanelOpen, setRecommendationPanelOpen] = useState(false);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);
  const [recommendationBusyId, setRecommendationBusyId] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<FollowUpRecommendation | null>(null);
  const [recommendationActivityTitle, setRecommendationActivityTitle] = useState("");
  const [recommendationError, setRecommendationError] = useState("");
  const [adoptBusyIndex, setAdoptBusyIndex] = useState<number | null>(null);
  const [adoptedIndexes, setAdoptedIndexes] = useState<Set<number>>(new Set());
  const [rejectedIndexes, setRejectedIndexes] = useState<Set<number>>(new Set());
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

  /**
   * 이 앱은 Next.js API 라우트가 없는 순수 클라이언트 SPA라, `<a href="/api/...">`로
   * 첨부파일 다운로드를 걸면 실제 브라우저 내비게이션이 되는 순간 Authorization
   * 헤더를 못 실어 404가 난다. fetch로 받아 blob URL을 만들어 그 자리에서 내려받는다.
   */
  async function downloadAttachment(attachment: ActivityAttachment) {
    setDownloadingAttachmentId(attachment.id);
    try {
      const blob = await downloadFile(`/activities/attachments/${encodeURIComponent(attachment.id)}/file`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("파일을 내려받지 못했습니다.");
    } finally {
      setDownloadingAttachmentId(null);
    }
  }

  /** 활동 하나를 근거로 후속 탐구 선택지를 만든다(기능2) — 대상 활동 하나가 아니라
   *  그 활동의 계보 사슬 전체와 최신 진단을 근거로 삼는 것은 백엔드가 처리한다. */
  async function requestFollowUp(activity: StudentActivity) {
    setRecommendationPanelOpen(true);
    setRecommendationBusyId(activity.id);
    setRecommendationError("");
    setRecommendation(null);
    setRecommendationActivityTitle(activity.title);
    setAdoptedIndexes(new Set());
    setRejectedIndexes(new Set());
    try {
      const result = await jsonRequest<FollowUpRecommendation>("/api/recommendations/follow-up", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceActivityId: activity.id }),
      });
      setRecommendation(result);
    } catch (e) {
      setRecommendationError(e instanceof Error ? e.message : "후속 추천을 만들지 못했습니다.");
    } finally {
      setRecommendationBusyId(null);
    }
  }

  /** 선택지를 계획으로 담는다 — "추천 → 계획 → 실행 → 기록" 루프를 잇는 지점.
   *  계획(plan_items) 탭 화면이 아직 없어 담은 뒤 화면이 바로 바뀌지는 않는다. */
  async function adoptRecommendationOption(optionIndex: number) {
    if (!recommendation) return;
    setAdoptBusyIndex(optionIndex);
    try {
      await jsonRequest(`/api/recommendations/${recommendation.id}/adopt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          optionIndex,
          targetGrade: workspace.profile.grade,
          targetSemester: workspace.profile.semester,
        }),
      });
      setAdoptedIndexes((cur) => new Set(cur).add(optionIndex));
      await jsonRequest(`/api/recommendations/${recommendation.id}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionIndex, action: "saved" }),
      }).catch(() => undefined);
    } catch (e) {
      setRecommendationError(e instanceof Error ? e.message : "계획에 담지 못했습니다.");
    } finally {
      setAdoptBusyIndex(null);
    }
  }

  async function rejectRecommendationOption(optionIndex: number) {
    if (!recommendation) return;
    setRejectedIndexes((cur) => new Set(cur).add(optionIndex));
    try {
      await jsonRequest(`/api/recommendations/${recommendation.id}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionIndex, action: "rejected" }),
      });
    } catch {
      /* 피드백 저장 실패는 조용히 무시 — 다음 추천의 개인화 신호일 뿐, 화면 흐름을 막을 정도는 아니다. */
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 pb-4 border-b border-gray-200/80">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600">ACTIVITY MEMORY</span>
          <h2 className="text-xl font-bold text-gray-950 tracking-tight mt-0.5">활동 기록 &amp; AI 정합 검토</h2>
          <p className="text-xs text-gray-500 mt-1">수행평가를 포함한 모든 활동을 기록하고 생기부와의 일치 여부를 점검합니다.</p>
        </div>
        <div className="text-right flex-none">
          <span className="text-[11px] text-gray-400 block font-medium">누적 기록</span>
          <strong className="text-lg font-bold text-gray-950">{workspace.activities.length}건</strong>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
      {/* Form */}
      <div className="activity-form-card md:col-span-1">
        <h2>활동 간편 등록</h2>
        <div className="form-field" style={{ marginBottom: "14px" }}>
          <label htmlFor="act-plan">연결할 이번 학기 주제 (선택 · 변경 가능)</label>
          <select id="act-plan" value={planEventId} onChange={(e) => setPlanEventId(e.target.value)}>
            <option value="">제안 주제와 별개의 활동</option>
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
        {/* 폼이 좁은 왼쪽 열에 들어가므로 3열로 눌러 담지 않고 세로로 쌓는다. */}
        <div style={{ marginBottom: "14px", display: "grid", gap: "12px" }}>
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
        {!currentSemesterCourseSubjects.length && <div className="banner banner-error" style={{ marginBottom: "14px" }}><strong>현재 학기 수강 과목을 먼저 등록해주세요.</strong><br />[성적 관리] 또는 [시간표] 화면에서 이번 학기 과목을 추가하면 여기에서 고를 수 있습니다.</div>}
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
      <div className="md:col-span-2 space-y-4">
        <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600">ACTIVITY TIMELINE</span>
              <h3 className="text-base font-extrabold text-gray-950 mt-0.5">활동 타임라인</h3>
            </div>
            <span className="text-[11px] text-gray-400">{workspace.activities.length}건</span>
          </div>
          {workspace.activities.length ? (
            <div className="space-y-3">
              {workspace.activities.map((activity) => {
                const match = workspace.reconciliations.find((log) => log.activityId === activity.id);
                return (
                <div className="bg-white p-4 rounded-xl border border-gray-200/80 hover:border-brand-300 transition space-y-2" key={activity.id}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-brand-600 truncate">{activity.subject || activity.activityCategory || activity.activityType}</span>
                      <span className="text-xs text-gray-400 font-medium tabular-nums whitespace-nowrap">{activity.completedAt || activity.periodLabel}</span>
                    </div>
                    {/* 일치도는 백엔드의 정합 판정(confidence)이다 — 없는 활동에는 배지를 그리지 않는다. */}
                    {match && (
                      <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded whitespace-nowrap">
                        일치도 {Math.round(match.confidence * (match.confidence <= 1 ? 100 : 1))}%
                      </span>
                    )}
                  </div>
                  <div className="history-info">
                    <h3 className="text-sm font-semibold text-gray-900">{activity.title}</h3>
                    <p>{activity.summary}</p>
                    {activity.reflection && <div className="activity-reflection"><strong>배운 점과 느낀 점</strong><p>{activity.reflection}</p></div>}
                    {activity.linkedPlanTitle && <small style={{ color: "var(--fg-muted)", display: "block", marginBottom: 8 }}>연결한 주제: {activity.linkedPlanTitle}</small>}
                    <div className="concept-tags">
                      {activity.concepts.map((c) => <span className="concept-tag" key={c}>{c}</span>)}
                    </div>
                    {workspace.attachments.filter((attachment) => attachment.activityId === activity.id).map((attachment) => (
                      <div key={attachment.id} style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                        <button
                          className="btn-link"
                          disabled={downloadingAttachmentId === attachment.id}
                          onClick={() => void downloadAttachment(attachment)}
                          type="button"
                        >
                          {downloadingAttachmentId === attachment.id ? "내려받는 중…" : attachment.fileName}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => deleteAttachment(attachment.id)} type="button">삭제</button>
                      </div>
                    ))}
                    {activity.recordKind === "activity" && (
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={recommendationBusyId === activity.id}
                        onClick={() => void requestFollowUp(activity)}
                        style={{ marginTop: 10 }}
                        type="button"
                      >
                        {recommendationBusyId === activity.id ? "후속 탐구 찾는 중…" : "이 활동 기반 후속 탐구 추천"}
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <strong>등록된 활동이 없습니다</strong>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
          <div className="pb-3 border-b border-gray-100">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600">AI ACTIVITY REVIEW</span>
            <h3 className="text-base font-extrabold text-gray-950 mt-0.5">AI 활동 검토 결과</h3>
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
      {recommendationPanelOpen && (
        <div className="modal-overlay" onClick={() => setRecommendationPanelOpen(false)} role="presentation">
          <section
            aria-label="후속 탐구 추천"
            aria-modal="true"
            className="modal-panel diagnosis-prequestion-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-head">
              <div>
                <span className="kicker">FOLLOW-UP RECOMMENDATION</span>
                <h2>{recommendationActivityTitle || "이 활동"}의 다음 탐구 후보</h2>
              </div>
              <button aria-label="닫기" className="focus-close" onClick={() => setRecommendationPanelOpen(false)} type="button">×</button>
            </div>
            <div className="modal-body">
              {recommendationBusyId && (
                <p className="onboarding-record-note">
                  이 활동의 계보와 최신 진단을 근거로 후속 탐구를 만드는 중입니다. 20~40초 정도 걸릴 수 있어요.
                </p>
              )}
              {recommendationError && <div className="banner banner-error">{recommendationError}</div>}
              {recommendation?.options.map((option, index) => {
                const difficultyLabel = option.difficulty === "easy" ? "쉬움" : option.difficulty === "hard" ? "심화" : "보통";
                const adopted = adoptedIndexes.has(index);
                const rejected = rejectedIndexes.has(index);
                return (
                  <div className="branch-question-card" key={option.topic}>
                    <div className="branch-question-head">
                      <strong>{option.topic}</strong>
                      <small>난이도 {difficultyLabel}</small>
                    </div>
                    <p className="onboarding-record-note">{option.connection_reason}</p>
                    <p><small style={{ color: "var(--fg-muted)" }}>연결 과목: {option.subject_relevance}</small></p>
                    <p><small style={{ color: "var(--fg-muted)" }}>진로 연결: {option.career_relevance}</small></p>
                    <p><small style={{ color: "var(--fg-muted)" }}>생기부 기록 가능성: {option.record_potential}</small></p>
                    <p><small style={{ color: "var(--fg-muted)" }}>예상 산출물: {option.expected_output}</small></p>
                    {option.materials.length > 0 && (
                      <div className="concept-tags">
                        {option.materials.map((material) => <span className="concept-tag" key={material}>{material}</span>)}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={adopted || adoptBusyIndex === index}
                        onClick={() => void adoptRecommendationOption(index)}
                        type="button"
                      >
                        {adopted ? "계획에 담았습니다" : adoptBusyIndex === index ? "담는 중…" : "계획에 담기"}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={adopted || rejected}
                        onClick={() => void rejectRecommendationOption(index)}
                        type="button"
                      >
                        {rejected ? "관심없음으로 표시했습니다" : "관심없음"}
                      </button>
                    </div>
                  </div>
                );
              })}
              {adoptedIndexes.size > 0 && (
                <p className="onboarding-record-note">
                  계획으로 담은 주제는 완료하면 이 활동의 후속 기록으로 이어집니다. 계획 목록 화면은 아직 준비 중이라, 지금은 챗봇에게 &ldquo;내 계획 보여줘&rdquo;라고 물어보면 확인할 수 있습니다.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function PortfolioView({ workspace }: { workspace: ProductWorkspace }) {
  const records = [...workspace.activities].sort((a, b) => (a.completedAt || "").localeCompare(b.completedAt || ""));
  const themes = [...new Set(records.flatMap((record) => record.concepts))].slice(0, 8);
  const [copiedQuestionId, setCopiedQuestionId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      setCopiedQuestionId(id);
      setTimeout(() => setCopiedQuestionId(null), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-gray-200/80">
        <div>
          <h2 className="text-xl font-bold text-gray-950 tracking-tight">수시 학생부종합전형 준비 자료</h2>
          <p className="text-xs text-gray-500 mt-1">
            실제로 기록한 활동만 근거로 씁니다 — 자소서 서사 흐름과 면접 검증 질문을 정리합니다.
          </p>
        </div>
        <div className="text-left md:text-right flex-none">
          <span className="text-[11px] text-gray-400 block font-medium">누적 검증 활동</span>
          <strong className="text-lg font-bold text-gray-950 tabular-nums">{records.length}건</strong>
        </div>
      </div>

      {/* 목표와 핵심 키워드 */}
      <div className="bg-white p-6 rounded-xl border border-gray-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="min-w-0">
          <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-brand-600 text-[10px] font-bold">
            목표 진로 및 학과
          </span>
          <h3 className="text-lg font-extrabold text-gray-950 tracking-tight mt-1.5">
            {workspace.profile.targetCareer || "진로 미입력"}{" "}
            <span className="text-sm font-bold text-gray-400">
              ({workspace.profile.targetMajors.join(", ") || "전공 미정"})
            </span>
          </h3>
          <p className="text-xs text-gray-600 leading-relaxed mt-1.5 break-keep">
            {records.length > 0
              ? `${workspace.profile.targetCareer} 전공 적합성을 중심으로 ${records.length}개의 탐구·수행 기록이 이어져 있습니다.`
              : "활동을 기록하면 진로 관심과 연결된 자소서 핵심 서사가 자동으로 구조화됩니다."}
          </p>
        </div>
        {themes.length > 0 && (
          <div className="lg:max-w-sm w-full flex-none p-3.5 rounded-xl bg-gray-50/70 border border-gray-200/60">
            <span className="text-[10px] font-bold text-gray-400 block mb-1.5">핵심 역량 키워드</span>
            <div className="flex flex-wrap gap-1.5">
              {themes.map((theme) => (
                <span
                  className="px-2 py-0.5 rounded-lg bg-white border border-gray-200/80 text-[11px] font-semibold text-gray-700"
                  key={theme}
                >
                  #{theme}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 자소서 서사 흐름 */}
        <section className="bg-white p-6 rounded-xl border border-gray-200/80 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="text-sm font-bold text-gray-950">자소서 서사 흐름</h3>
            <span className="text-xs text-gray-400 font-medium">{records.length}개 탐구 연계</span>
          </div>

          {records.length === 0 ? (
            <p className="text-xs text-gray-400 leading-relaxed py-6 text-center break-keep">
              아직 기록된 활동이 없습니다. [활동 &amp; 세특] 화면에서 이번 학기 수행평가와 탐구 활동을 남겨보세요.
            </p>
          ) : (
            <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
              {records.map((record) => (
                <article className="p-3.5 rounded-lg bg-gray-50/70 border border-gray-200/60" key={record.id}>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold text-brand-600">{record.completedAt || record.periodLabel}</span>
                    {record.subject && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-500">
                        {record.subject}
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-bold text-gray-900 leading-snug break-keep">{record.title}</h4>
                  {record.summary && (
                    <p className="text-xs text-gray-600 leading-relaxed mt-1 break-keep">{record.summary}</p>
                  )}
                  {record.reflection && (
                    <div className="text-xs text-gray-600 bg-white p-2.5 rounded border-l-2 border-brand-500 mt-2">
                      <strong className="block text-[10px] text-gray-400 font-semibold mb-0.5">배운 점 · 느낀 점</strong>
                      <span className="break-keep">{record.reflection}</span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* 면접 대비 */}
        <section className="bg-white p-6 rounded-xl border border-gray-200/80 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="text-sm font-bold text-gray-950">면접 대비 예상 질문 &amp; 답변 포인트</h3>
            <span className="text-xs text-gray-400 font-medium">심층 검증</span>
          </div>

          {records.length === 0 ? (
            <p className="text-xs text-gray-400 leading-relaxed py-6 text-center break-keep">
              활동을 저장하면 그 기록을 근거로 면접 검증 질문이 만들어집니다.
            </p>
          ) : (
            <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
              {records.slice(-6).reverse().map((record, index) => {
                const questionText = `“${record.title}”에서 본인이 주도적으로 탐구한 핵심 원리는 무엇이며, 이 과정이 ${workspace.profile.targetCareer} 진로에 미친 영향은?`;
                const isCopied = copiedQuestionId === record.id;
                return (
                  <div className="p-3.5 rounded-lg border border-gray-200/70 bg-white space-y-2" key={record.id}>
                    <div className="flex items-start justify-between gap-2">
                      <h5 className="text-xs font-bold text-gray-900 leading-snug break-keep">
                        Q{index + 1}. {questionText}
                      </h5>
                      <button
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border transition flex-none ${
                          isCopied
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                        }`}
                        onClick={() => copyToClipboard(questionText, record.id)}
                        type="button"
                      >
                        {isCopied ? "복사됨 ✓" : "복사"}
                      </button>
                    </div>
                    <div className="text-xs text-gray-600 bg-gray-50 p-2.5 rounded border-l-2 border-brand-500 space-y-1">
                      <div>
                        <strong className="block text-[10px] text-gray-400 font-semibold mb-0.5">검증 포인트</strong>
                        <span className="break-keep">단순 참여가 아니라 본인이 무엇을 어떻게 해결했는지 설명해야 합니다.</span>
                      </div>
                      <div>
                        <strong className="block text-[10px] text-gray-400 font-semibold mb-0.5">근거 기록</strong>
                        <span className="break-keep">{record.title} ({record.completedAt || record.periodLabel})</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

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
  const hasDiagnosis = Boolean(workspace.dna.narrative);
  const hasSchoolRecord = workspace.schoolRecordCourses.length > 0;

  useEffect(() => {
    setForm({
      name: workspace.profile.name,
      grade: String(workspace.profile.grade),
      semester: workspace.profile.semester ? String(workspace.profile.semester) : "",
      targetCareer: workspace.profile.targetCareer,
      targetMajors: workspace.profile.targetMajors.join(", "),
      interests: workspace.profile.interests.join(", "),
      concreteResearchQuestion: "",
      knowledgeLevel: "",
      motivationTrigger: workspace.profile.motivationTrigger,
      preferredSubjects: workspace.profile.preferredSubjects.join(", "),
      currentEngagement: workspace.profile.currentEngagement.join(", "),
      careerResolution: workspace.profile.careerResolution,
      strengths: workspace.profile.strengths.join(", "),
      gaps: workspace.profile.gaps.join(", "),
      constraints: workspace.profile.constraints.join(", "),
      outputPreference: workspace.profile.outputPreference,
      collaborationStyle: workspace.profile.collaborationStyle,
      roadmapDesignNotes: "",
    });
  }, [workspace.profile]);

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

  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace }>("/api/profile", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId: workspace.profile.id, profile: toProfileInput(form) }),
      });
      onWorkspace(result.workspace);
      setMessage("프로필을 저장했습니다. 다음 진단과 주제 제안에 반영됩니다.");
    } catch (e) { setError(e instanceof Error ? e.message : "프로필을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 pb-4 border-b border-gray-200/80 flex-wrap">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
            🎓 공식 학적 프로필
          </span>
          <h2 className="text-xl font-bold text-gray-950 tracking-tight mt-1.5">학생 프로필 및 진로 설정</h2>
          <p className="text-xs text-gray-500 mt-1">
            학생이 직접 확인한 현재 상태와 제약만 바꿉니다. 저장하면 다음 진단과 주제 제안에 반영됩니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="profile-form-card lg:col-span-8">
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
              <button className={`clarity-choice${form.careerResolution === "넓은 분야만 정한 단계" ? " is-active" : ""}`} onClick={() => updateCareerResolution("넓은 분야만 정한 단계")} type="button"><strong>넓은 분야만 있음</strong><small>세부 키워드는 상담에서 천천히 좁혀갑니다.</small></button>
              <button className={`clarity-choice${hasSpecificCareerGoal(form) ? " is-active" : ""}`} onClick={() => updateCareerResolution("구체적인 학과나 직무까지 정한 단계")} type="button"><strong>구체 목표가 있음</strong><small>세부 키워드와 현재 지식을 계획에 반영합니다.</small></button>
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
          <button
            className="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-extrabold transition disabled:opacity-60"
            disabled={busy}
            onClick={() => save()}
            type="button"
          >
            {busy ? "저장 중…" : "프로필 저장하기"}
          </button>
        </div>
      </div>

      {/* SETEUK PASS — 목업의 우측 카드. 상태 값은 전부 실제 기록에서 센 것이다. */}
      <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-6">
        <div className="bg-white rounded-2xl border border-gray-200/90 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-5 text-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold tracking-widest text-blue-200">SETEUK PASS</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/30">
                {workspace.profile.grade}학년 {workspace.profile.semester}학기
              </span>
            </div>
          </div>

          <div className="p-6 text-center -mt-10 relative">
            <div className="relative inline-block mx-auto mb-3">
              <div className="w-20 h-20 rounded-full border-4 border-white shadow-md bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center text-white text-2xl font-black">
                {workspace.profile.name.slice(-2)}
              </div>
              {hasSchoolRecord && (
                <div
                  className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-amber-400 text-amber-950 border-2 border-white font-black text-xs flex items-center justify-center"
                  title="생기부가 연동된 계정"
                >
                  ✓
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-1.5 mb-0.5">
              <h4 className="text-lg font-extrabold text-gray-950 tracking-tight">{workspace.profile.name}</h4>
            </div>
            <p className="text-xs text-gray-500 font-medium">
              {workspace.profile.grade}학년 {workspace.profile.semester}학기
              {workspace.profile.targetCareer && ` · ${workspace.profile.targetCareer}`}
            </p>
            {workspace.profile.targetMajors.length > 0 && (
              <p className="text-[11px] text-brand-600 font-bold mt-0.5">
                {workspace.profile.targetMajors.join(", ")} 지망
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 mt-5">
              <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-100/80 text-center">
                <span className="text-[10px] font-semibold text-blue-600 block mb-0.5">AI 진단</span>
                <span className="text-xs font-black text-blue-950">{hasDiagnosis ? "완료" : "미실행"}</span>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200/80 text-center">
                <span className="text-[10px] font-semibold text-gray-500 block mb-0.5">누적 기록</span>
                <span className="text-xs font-black text-gray-900">{workspace.activities.length}건</span>
              </div>
            </div>

            <div className="mt-5 space-y-2.5 text-left border-t border-gray-100 pt-4 text-xs">
              {[
                {
                  icon: "📄",
                  label: "생기부 연동",
                  ok: hasSchoolRecord,
                  okText: "연동됨",
                  noText: "미연결",
                },
                {
                  icon: "🔬",
                  label: "AI 진단 리포트",
                  ok: hasDiagnosis,
                  okText: "완료",
                  noText: "미실행",
                },
                {
                  icon: "🎯",
                  label: "활동 정합 검토",
                  ok: workspace.reconciliations.length > 0,
                  okText: `${workspace.reconciliations.length}건`,
                  noText: "없음",
                },
              ].map((row) => (
                <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50/50" key={row.label}>
                  <div className="flex items-center gap-2">
                    <span>{row.icon}</span>
                    <span className="text-gray-700 font-medium">{row.label}</span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      row.ok
                        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                        : "bg-gray-100 text-gray-500 border-gray-200"
                    }`}
                  >
                    {row.ok ? row.okText : row.noText}
                  </span>
                </div>
              ))}
            </div>
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
  const [tab, setTab] = useState<TabId>("overview");
  const [activityDraft, setActivityDraft] = useState<ActivityDraft | null>(null);
  const studentId = workspace.profile.id;
  const storageKey = `seteuk-timetables-${studentId}`;

  const [timetables, setTimetables] = useState<TimetableConfig[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {
        // ignore parse error
      }
    }
    return [createEmptyTimetable(workspace.profile.grade, workspace.profile.semester)];
  });

  const handleTimetablesChange = (updated: TimetableConfig[]) => {
    setTimetables(updated);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {
        // ignore storage error
      }
    }
  };

  useEffect(() => {
    const hasCurrent = timetables.some(
      (t) => t.grade === workspace.profile.grade && t.semester === workspace.profile.semester
    );
    if (!hasCurrent) {
      const newTt = createEmptyTimetable(workspace.profile.grade, workspace.profile.semester);
      handleTimetablesChange([...timetables, newTt]);
    }
  }, [workspace.profile.grade, workspace.profile.semester]);

  const defaultTimetable = useMemo(
    () => timetables.find((t) => t.isDefault) || timetables[0] || null,
    [timetables]
  );

  const initials = workspace.profile.name.slice(-2);

  // 상단 전역 검색 — 백엔드에 검색 엔드포인트가 없으므로 이미 불러온 기록 안에서만
  // 찾는다. 눌러도 아무 일이 없는 장식 입력창을 두지 않기 위해 실제로 동작시킨다.
  const [searchQuery, setSearchQuery] = useState("");
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 1) return [];
    return workspace.activities
      .filter((activity) =>
        [activity.title, activity.subject, activity.activityCategory, ...activity.concepts]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q)),
      )
      .slice(0, 6);
  }, [searchQuery, workspace.activities]);

  const tabs: Array<{ id: TabId; label: string; badge?: string; icon: React.ReactNode }> = [
    {
      id: "overview",
      label: "이번 학기",
      badge: `${workspace.profile.grade}-${workspace.profile.semester}`,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      ),
    },
    {
      id: "dashboard",
      label: "대시보드",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      ),
    },
    {
      id: "grades",
      label: "성적 관리",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      id: "timetable",
      label: "시간표",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      id: "activities",
      label: "활동 & 세특",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
    },
    {
      id: "portfolio",
      label: "수시 포트폴리오",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      ),
    },
    {
      id: "chat",
      label: "AI 컨설턴트",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      ),
    },
    {
      id: "profile",
      label: "프로필 설정",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
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
        <div className="flex-1 flex flex-col justify-between p-4 md:p-5 min-h-0">
          <div>
            <div className="flex items-center gap-3 px-2 py-2 mb-3 pb-4 border-b border-gray-100">
              <img alt="세특연구소 로고" src="/logo.png?v=2" className="w-9 h-9 object-contain flex-none" />
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-[15px] text-gray-950 tracking-tight flex items-center gap-1.5 leading-none">
                  <span>세특연구소</span>
                  <span className="text-brand-600 font-extrabold text-[11px] px-1.5 py-0.5 rounded bg-brand-50 border border-brand-200/80 leading-none">Pro</span>
                </div>
                <div className="text-[11px] text-gray-400 font-medium leading-none mt-1.5">Personal Coach</div>
              </div>
            </div>

            <button
              className="w-full flex items-center gap-3 p-2.5 mb-4 rounded-xl bg-gray-50/80 border border-gray-200/70 hover:border-brand-300 hover:bg-gray-100/70 transition cursor-pointer group text-left"
              onClick={() => setTab("profile")}
              type="button"
            >
              <span className="w-9 h-9 rounded-full bg-brand-500 text-white font-bold text-xs flex items-center justify-center flex-none">
                {initials}
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="font-bold text-gray-900 text-xs truncate group-hover:text-brand-600 transition">{workspace.profile.name}</span>
                  <span className="text-[10px] font-bold px-1.5 rounded bg-blue-50 text-brand-600 border border-blue-100">재학생</span>
                </span>
                <span className="text-[11px] text-gray-400 block truncate mt-0.5">
                  {workspace.profile.grade}학년 {workspace.profile.semester}학기 · {workspace.profile.targetCareer}
                </span>
              </span>
            </button>

            <nav className="space-y-1">
              {tabs.map((item) => {
                const isActive = tab === item.id;
                return (
                  <button
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? "bg-brand-50 text-brand-600 font-bold border border-brand-200/60"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-950 border border-transparent"
                    }`}
                    id={`nav-${item.id}`}
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    type="button"
                  >
                    <span className="flex items-center gap-3">
                      <span className={`flex-none ${isActive ? "text-brand-600" : "text-gray-400"}`}>{item.icon}</span>
                      <span>{item.label}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      {item.badge && (
                        <span className={`text-[10px] font-bold px-1.5 rounded ${isActive ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                          {item.badge}
                        </span>
                      )}
                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="space-y-2.5 pt-4 border-t border-gray-100">
            {/* 이 버튼은 실제로 로그아웃한다(토큰을 지우고 로그인 화면으로 보낸다). */}
            <button
              className="w-full py-2.5 px-3 rounded-xl border border-dashed border-gray-300 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50/40 text-gray-500 text-xs font-semibold transition flex items-center justify-center gap-1.5"
              id="btn-new-student"
              onClick={onNewStudent}
              type="button"
            >
              <span>🚪</span>
              <span>로그아웃</span>
            </button>
            <div className="flex items-center justify-between text-[11px] text-gray-400 px-1 pt-0.5">
              <span>계획 v{workspace.roadmap.version}</span>
              <span>·</span>
              <span className="text-gray-400 font-mono text-[10px]">v{APP_VERSION}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <section className="product-main">
        <header className="product-topbar">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-base text-gray-950 tracking-tight">Academic Hub</span>
            <span className="text-gray-300">/</span>
            <span className="text-xs font-semibold text-gray-500">{currentTabLabel}</span>
          </div>

          <div className="relative w-80 max-w-[38%]">
            <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-xs pointer-events-none">🔍</span>
            <input
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200/90 text-xs bg-gray-50/60 focus:bg-white focus:border-brand-500 focus:outline-none transition"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="과목, 탐구 키워드, 활동 검색…"
              type="search"
              value={searchQuery}
            />
            {searchQuery.trim() && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-floating overflow-hidden z-40">
                {searchResults.length ? (
                  searchResults.map((activity) => (
                    <button
                      className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 transition border-b border-gray-50 last:border-b-0"
                      key={activity.id}
                      onClick={() => {
                        setSearchQuery("");
                        setTab("activities");
                      }}
                      type="button"
                    >
                      <span className="block text-xs font-semibold text-gray-900 truncate">{activity.title}</span>
                      <span className="block text-[11px] text-gray-400 mt-0.5">
                        {activity.periodLabel} · {activity.subject || activity.activityCategory}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3.5 py-3 text-[11px] text-gray-400">기록에서 찾지 못했습니다.</p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200/80">
              <span className="w-2 h-2 rounded-full bg-brand-500" />
              <span className="text-[11px] font-bold text-brand-700">학기 계획 연동 · 학생별 데이터 격리</span>
            </span>
            <span className="h-4 w-px bg-gray-200" />
            <button
              aria-label="프로필 설정"
              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition"
              onClick={() => setTab("profile")}
              type="button"
            >
              <span className="text-sm">⚙️</span>
            </button>
          </div>
        </header>

        <div className="product-content">
          {tab === "dashboard" && <DashboardView workspace={workspace} onNavigate={setTab} />}
          {tab === "overview"   && <Overview workspace={workspace} onNavigate={setTab} onConvertPlan={startActivity} onWorkspace={onWorkspace} />}
          {tab === "timetable"  && (
            <TimetableView
              activities={workspace.activities}
              currentGrade={workspace.profile.grade}
              currentSemester={workspace.profile.semester}
              timetables={timetables}
              onTimetablesChange={handleTimetablesChange}
              onNavigateToGrades={() => setTab("grades")}
              onNavigateToActivities={(subject) => {
                startActivity({ title: `${subject} 심화 탐구`, subject });
              }}
              onUpdateCurrentPeriod={async (grade, semester) => {
                const updatedProfile = {
                  ...workspace.profile,
                  grade,
                  semester,
                };
                const result = (await handleLegacyRoute("/api/profile", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ profile: updatedProfile }),
                })) as { workspace: ProductWorkspace };
                if (result?.workspace) {
                  onWorkspace(result.workspace);
                }
              }}
            />
          )}
          {tab === "activities" && (
            <ActivitiesView
              key={activityDraft?.title ?? "activity-entry"}
              workspace={workspace}
              onWorkspace={onWorkspace}
              draft={activityDraft}
              clearDraft={() => setActivityDraft(null)}
            />
          )}
          {tab === "grades"     && (
            <GradesView
              currentGrade={workspace.profile.grade}
              currentSemester={workspace.profile.semester}
              defaultTimetable={defaultTimetable}
              timetables={timetables}
              onNavigateToTimetable={() => setTab("timetable")}
              onNavigateToActivities={(subject) => {
                startActivity({ title: `${subject} 세특 활동`, subject });
              }}
              onRecordsChanged={onRefresh}
            />
          )}
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
  /** 랜딩에서 로그인/시작하기를 눌렀는지. 누르기 전에는 인증 화면을 띄우지 않는다. */
  const [authOpen, setAuthOpen] = useState(false);
  // null이면 아직 확인 전, satisfied=false면 진단+상담 관문이 메인 화면을 막는다.
  const [consultationStatus, setConsultationStatus] = useState<ConsultationStatus | null>(null);

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

  /**
   * 로그인/온보딩 직후, 그리고 상담이 끝난 직후에 부른다. 진단+상담 관문이 안
   * 풀렸으면 무거운 loadWorkspace()(로드맵 등 관문에 막힌 자원을 부른다)를 아예
   * 건너뛰고 상담 화면을 보여준다 — 관문을 만족했을 때만(또는 프로필이 아직 없어
   * 이 관문의 관심사가 아닐 때만) 원래 흐름으로 넘어간다.
   */
  const checkGate = useCallback(() => {
    setLoading(true);
    getConsultationStatus()
      .then((status) => {
        setConsultationStatus(status);
        if (status.satisfied) {
          refresh();
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        // 상태 조회 자체가 실패하면(네트워크 등) 기존 흐름으로 넘어가 원인을
        // 다시 드러낸다.
        refresh();
      });
  }, [refresh]);

  useEffect(() => {
    if (!tokens.access) {
      setSignedIn(false);
      setLoading(false);
      return;
    }
    setSignedIn(true);
    checkGate();
  }, [checkGate]);

  /**
   * 어느 화면에서든 계정을 빠져나가는 길. 온보딩과 진단·상담 관문에도 준다 —
   * 이 두 화면은 사이드바가 없어서, 예전에는 온보딩을 끝내지 못한 계정이 화면에
   * 갇혀 로그아웃조차 할 수 없었다.
   */
  const signOut = useCallback(() => {
    void logout().finally(() => {
      setWorkspace(null);
      setConsultationStatus(null);
      setSignedIn(false);
      // 로그아웃은 대개 계정을 바꾸려는 것이므로 랜딩이 아니라 로그인 화면으로 둔다.
      setAuthOpen(true);
    });
  }, []);


  const loadingCopy = useMemo(() => (loading ? "학생 작업공간을 불러오는 중…" : ""), [loading]);

  // 조기 반환은 훅을 전부 부른 뒤에 온다. 훅보다 앞에 두면 로그인 전후로 호출
  // 순서가 달라져 Rules of Hooks를 어긴다.
  if (!signedIn) {
    // 처음 오는 사람은 랜딩을 먼저 본다. 로그인/시작하기를 누른 뒤에만 인증 화면으로.
    if (!authOpen) return <LandingView onGoToLogin={() => setAuthOpen(true)} />;
    return (
      <SignIn
        onSignedIn={() => {
          setSignedIn(true);
          checkGate();
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

  // satisfied=false는 프로필이 이미 있는(=온보딩을 마친) 학생에게만 나온다 — 관문은
  // current_grade/semester가 있어야 판단하므로, 이 분기가 !workspace 체크보다
  // 먼저 와야 재방문 학생이 온보딩 화면으로 잘못 돌아가지 않는다.
  if (consultationStatus && !consultationStatus.satisfied) {
    return <ConsultationGate status={consultationStatus} onSatisfied={checkGate} onSignOut={signOut} />;
  }

  if (!workspace) {
    return (
      <>
        <Onboarding onComplete={checkGate} onSignOut={signOut} />
        {error && <div className="floating-error">{error}</div>}
      </>
    );
  }

  return (
    <ProductShell
      workspace={workspace}
      onWorkspace={setWorkspace}
      onRefresh={() => refresh({ quiet: true })}
      // 학생 전환은 이제 계정 전환이다 — 토큰을 지우고 로그인 화면으로 돌아간다.
      onNewStudent={signOut}
    />
  );
}
