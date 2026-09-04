/**
 * 도메인 타입 계약.
 *
 * 이 파일에는 원래 로드맵 생성·진단·정합 판정 로직이 함께 있었지만, 통합 결정
 * (시나리오 A)에 따라 전부 백엔드로 옮겼다. 프론트엔드는 화면만 담당하므로 여기에는
 * 타입만 남긴다 — 원본은 docs/reference에 보존돼 있고 main 히스토리에도 있다.
 *
 * 백엔드에 해당 모델이 생기면 이 파일은 OpenAPI 생성 타입으로 대체한다.
 */

export type ProfileInput = {
  name: string;
  grade: number;
  semester: number;
  targetCareer: string;
  targetMajors: string[];
  interests: string[];
  motivationTrigger: string;
  careerResolution: string;
  currentEngagement: string[];
  preferredSubjects: string[];
  strengths: string[];
  gaps: string[];
  constraints: string[];
  outputPreference: string;
  collaborationStyle: string;
};

export type StudentWorkspaceProfile = ProfileInput & {
  id: string;
  createdAt?: string;
  updatedAt?: string;
};

export type RoadmapNode = {
  id: string;
  roadmapId: string;
  studentId: string;
  orderIndex: number;
  grade: number;
  semester: number;
  narrativeStage: string;
  title: string;
  objective: string;
  candidateSubjects: string[];
  competencyGoals: string[];
  /** 진척 상태. "학생이 지금 어느 학기에 있는가"는 isCurrent가 답한다. */
  status: "planned" | "active" | "partial" | "done" | "instantiated" | "completed" | "skipped" | "revised";
  /** 학생이 선언한 현재 학년-학기의 마디인지. 이번 학기 화면은 이 값을 본다. */
  isCurrent: boolean;
  instantiatedActivityId?: string | null;
  planEvents?: RoadmapPlanEvent[];
};

export type RoadmapPlanEvent = {
  id: string;
  monthDay: string;
  category: "상장" | "활동" | "봉사" | "독서" | "시험";
  subject: string;
  priority: "core" | "optional";
  title: string;
  description: string;
};

export type Roadmap = {
  id: string;
  studentId: string;
  version: number;
  careerTrack: string;
  templateId: string;
  status: "draft" | "active" | "superseded";
  nodes: RoadmapNode[];
};

export type StudentActivity = {
  id: string;
  studentId: string;
  activityType: string;
  subject: string;
  title: string;
  summary: string;
  reflection: string;
  concepts: string[];
  outputs: string[];
  status: string;
  roadmapNodeId?: string | null;
  /** 계획에서 전환된 실제 기록일 때만 원래 계획을 가리킨다. */
  planEventId?: string | null;
  linkedPlanTitle?: string | null;
  completedAt: string;
  /** 학년-학기 표시용. 활동 시점의 정본은 날짜가 아니라 학년-학기다 —
   *  생기부에서 온 활동은 날짜를 알 수 없기 때문이다. */
  periodLabel?: string;
  createdAt?: string;
};

export type ActivityAttachment = {
  id: string;
  activityId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  extractedText?: string;
};

export type ActivityReview = {
  activityId: string;
  planEventId?: string | null;
  alignment: "aligned" | "partial" | "separate";
  summary: string;
  evidence: string[];
  gaps: string[];
  nextSteps: string[];
  provider: "deepseek" | "rule";
};

export type SchoolRecordCourseRecord = {
  id: string;
  studentId: string;
  importId: string;
  grade: number;
  semester: number;
  subject: string;
};

export type ReconciliationLog = {
  id: string;
  studentId: string;
  activityId: string;
  roadmapId: string;
  nodeId?: string | null;
  matchType: "MATCH" | "PARTIAL_MATCH" | "DIVERGE" | "MISS" | "UNCLASSIFIABLE";
  rationale: string;
  action: string;
  confidence: number;
  createdAt?: string;
};

export type DnaDiagnosis = {
  facts: string[];
  interpretations: Array<{
    statement: string;
    evidenceIds: string[];
    confidence: number;
    verified: boolean;
  }>;
  strengths: string[];
  gaps: string[];
  narrative: string;
  riskFlags: string[];
};

export type AssignmentAnalysis = {
  id: string;
  task: string;
  provider?: "deepseek" | "mock";
  parsedConditions: string[];
  missingInformation: string[];
  activeRoadmapConnection: string;
  recommendations: Array<{
    id: string;
    title: string;
    reason: string;
    method: string;
    expectedOutput: string;
    roadmapConnection: string;
    difficulty: string;
  }>;
  checklist: string[];
};

export type StudentSemesterCourse = {
  id: string;
  studentId: string;
  roadmapNodeId: string;
  grade: number;
  semester: number;
  subject: string;
};

export type StudentCourseGrade = {
  id: string;
  studentId: string;
  semesterCourseId: string;
  rank: number | null;
  score: number | null;
  note: string;
};

/**
 * 학생이 "하기로 한 것". 로드맵 제안(고를 수 있는 후보)과도, 활동 기록(이미 한 일)과도
 * 다른 층이다 — 제안은 마디당 10개로 고정이고 계획은 개수가 자유로우며, 완료되면
 * 기록으로 승격되면서 계보가 이어진다.
 */
export type PlanItem = {
  id: string;
  title: string;
  itemType: string;
  targetGrade: number | null;
  targetSemester: number | null;
  status: "planned" | "in_progress" | "done" | "dropped";
  origin: string;
  description: string;
  roadmapNodeId: string | null;
  sourcePlanEventId: string | null;
};

export type ProductWorkspace = {
  plans: PlanItem[];
  profile: StudentWorkspaceProfile;
  roadmap: Roadmap;
  activities: StudentActivity[];
  attachments: ActivityAttachment[];
  activityReviews: ActivityReview[];
  semesterCourses: StudentSemesterCourse[];
  courseGrades: StudentCourseGrade[];
  schoolRecordCourses: SchoolRecordCourseRecord[];
  reconciliations: ReconciliationLog[];
  dna: DnaDiagnosis;
  nextMission: {
    title: string;
    whyNow: string;
    period: string;
    output: string;
    roadmapNodeId?: string;
  };
  latestAnalysis?: AssignmentAnalysis | null;
};

function activeIndex(profile: ProfileInput) {
  return Math.max(0, Math.min(5, (profile.grade - 1) * 2 + (profile.semester - 1)));
}

function suggestedTopicsForSemester(
  focus: string,
  stage: { subjects: string[]; competencies: string[] },
  semester: number,
): RoadmapPlanEvent[] {
  const startMonth = semester === 1 ? "04" : "09";
  const subject = stage.subjects[0] ?? "자율 탐구";
  const competency = stage.competencies[0] ?? "탐구 설계";
  const topics = [
    ["core", `${focus}의 핵심 개념과 실제 사례 연결`, `교과의 핵심 개념이 ${focus}의 실제 사례에서 어떻게 쓰이는지 비교해 설명하는 주제입니다.`],
    ["core", `${focus}에서 ${competency}을(를) 보여줄 수 있는 비교 질문`, "조건이 다른 사례를 비교해 어떤 기준으로 판단해야 하는지 탐구하는 주제입니다."],
    ["core", `${focus}의 작동 원리와 한계 함께 살피기`, "기술 또는 현상이 잘 작동하는 조건과 한계를 함께 정리해 균형 잡힌 관점을 만드는 주제입니다."],
    ["core", `${focus}와 현재 교과의 연결 고리 찾기`, `현재 ${subject}에서 배우는 개념을 출발점으로 진로 관심을 자연스럽게 연결하는 주제입니다.`],
    ["optional", `${focus} 관련 공개 자료의 해석 차이 비교`, "같은 주제라도 자료마다 결론이 달라지는 이유와 신뢰할 근거를 살피는 확장 주제입니다."],
    ["optional", `${focus}가 해결하는 문제와 남는 문제`, "기술의 장점만 소개하지 않고 해결되지 않은 문제를 함께 정의해 보는 주제입니다."],
    ["optional", `${focus}의 사회·환경적 영향`, "진로 관심을 사회, 환경, 윤리 관점과 연결해 판단 기준을 세워 보는 주제입니다."],
    ["optional", `${focus}와 인접 분야의 공통점과 차이`, "인접 전공 또는 교과와 비교해 자신의 관심 분야를 더 구체화하는 주제입니다."],
    ["optional", `${focus}의 핵심 용어를 학생 언어로 재구성`, "어려운 개념을 정확하면서도 쉽게 설명할 수 있는지 점검하는 주제입니다."],
    ["optional", `${focus}에서 이어질 다음 탐구 질문 만들기`, "이번 학기에서 바로 실행하지 않아도 다음 학기 심화로 이어질 질문을 남기는 주제입니다."],
  ] as const;
  return topics.map(([priority, title, description], index) => ({ id: crypto.randomUUID(), monthDay: `${String(Number(startMonth) + Math.min(index, 2)).padStart(2, "0")}-15`, category: "활동" as const, subject, priority, title, description }));
}
