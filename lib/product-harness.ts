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
  status: "planned" | "active" | "instantiated" | "completed" | "skipped" | "revised";
  instantiatedActivityId?: string | null;
  planEvents?: RoadmapPlanEvent[];
};

export type RoadmapPlanEvent = {
  id: string;
  monthDay: string;
  category: "상장" | "대회" | "수행평가" | "보고서" | "독서" | "시험";
  subject: string;
  title: string;
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
  concepts: string[];
  outputs: string[];
  status: string;
  roadmapNodeId?: string | null;
  completedAt: string;
  createdAt?: string;
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

export type ProductWorkspace = {
  profile: StudentWorkspaceProfile;
  roadmap: Roadmap;
  activities: StudentActivity[];
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

const SEMICONDUCTOR_STAGES = [
  {
    grade: 1,
    semester: 1,
    stage: "탐색",
    title: "반도체 산업과 나의 관심 지점 찾기",
    objective: "반도체가 일상 기술에 쓰이는 방식을 살펴보고 공정·소재, 회로·소자, 장비·데이터 중 관심 경로를 가설로 세웁니다.",
    subjects: ["통합과학", "정보"],
    competencies: ["진로 탐색", "기술 이해"],
  },
  {
    grade: 1,
    semester: 2,
    stage: "기초",
    title: "물질의 전기적 성질과 반도체 원리 연결",
    objective: "도체·부도체·반도체의 차이와 규소의 특성을 교과 개념으로 설명하고 간단한 데이터나 회로로 확인합니다.",
    subjects: ["통합과학", "수학", "정보"],
    competencies: ["개념 연결", "기초 모델링"],
  },
  {
    grade: 2,
    semester: 1,
    stage: "연결",
    title: "소자 원리와 회로 동작을 증거로 설명",
    objective: "다이오드·트랜지스터의 물리적 성질이 전압-전류 그래프와 회로 동작으로 이어지는 과정을 분석합니다.",
    subjects: ["물리학", "수학", "정보"],
    competencies: ["정량 분석", "모형 해석"],
  },
  {
    grade: 2,
    semester: 2,
    stage: "분화",
    title: "세부 경로를 선택해 공정·회로·장비 문제 심화",
    objective: "학생의 관심과 이전 활동을 바탕으로 하나의 세부 경로를 선택하고 실제 데이터가 포함된 후속 탐구를 수행합니다.",
    subjects: ["물리학", "화학", "수학과제 탐구", "정보"],
    competencies: ["탐구 설계", "데이터 해석"],
  },
  {
    grade: 3,
    semester: 1,
    stage: "독립 탐구",
    title: "반도체 문제를 데이터 기반 독립 프로젝트로 해결",
    objective: "공개 데이터, 시뮬레이션 또는 안전한 교육용 실험을 활용해 가설·방법·결론을 갖춘 독립 탐구를 완성합니다.",
    subjects: ["전자기와 양자", "물질과 에너지", "융합과학 탐구"],
    competencies: ["문제 해결", "근거 기반 결론"],
  },
  {
    grade: 3,
    semester: 2,
    stage: "종합",
    title: "기술의 한계와 사회적 영향을 포함해 서사 종합",
    objective: "이전 활동의 발전 과정을 정리하고 반도체 기술의 환경·안전·공급망 상충 관계를 포함한 최종 관점을 제시합니다.",
    subjects: ["융합과학 탐구", "사회문제 탐구", "국어"],
    competencies: ["비판적 사고", "서사 구성"],
  },
];

function activeIndex(profile: ProfileInput) {
  return Math.max(0, Math.min(5, (profile.grade - 1) * 2 + (profile.semester - 1)));
}

export function generateRoadmap(
  profile: ProfileInput,
  ids?: { studentId?: string; roadmapId?: string },
): Roadmap {
  const studentId = ids?.studentId ?? crypto.randomUUID();
  const roadmapId = ids?.roadmapId ?? crypto.randomUUID();
  const currentIndex = activeIndex(profile);
  const focus = profile.interests[0] ?? profile.targetMajors[0] ?? "반도체 기술";

  const nodes = SEMICONDUCTOR_STAGES.map((stage, index): RoadmapNode => ({
    id: crypto.randomUUID(),
    roadmapId,
    studentId,
    orderIndex: index,
    grade: stage.grade,
    semester: stage.semester,
    narrativeStage: stage.stage,
    title: index === currentIndex ? `${focus} 관점으로 ${stage.title}` : stage.title,
    objective: stage.objective,
    candidateSubjects: stage.subjects,
    competencyGoals: stage.competencies,
    status: index < currentIndex ? "skipped" : index === currentIndex ? "active" : "planned",
    instantiatedActivityId: null,
    planEvents: [],
  }));

  return {
    id: roadmapId,
    studentId,
    version: 1,
    careerTrack: profile.targetCareer,
    templateId: "semiconductor-narrative-v1",
    status: "draft",
    nodes,
  };
}

export function diagnoseStudent(
  profile: StudentWorkspaceProfile,
  activities: StudentActivity[],
): DnaDiagnosis {
  const evidenceIds = activities.map((activity) => activity.id);
  const facts = [
    `${profile.grade}학년 ${profile.semester}학기`,
    `희망 진로: ${profile.targetCareer}`,
    `관심 분야: ${profile.interests.join(", ") || "아직 탐색 중"}`,
    `등록된 활동: ${activities.length}개`,
  ];
  const interpretations = [
    {
      statement: activities.length
        ? `${profile.preferredSubjects.join("·") || "교과"} 활동을 중심으로 희망 진로(${profile.targetCareer})와 연결되는 근거를 쌓고 있습니다.`
        : "아직 활동 근거가 적어 현재 강점은 온보딩 응답을 기반으로 한 잠정 분석입니다.",
      evidenceIds,
      confidence: activities.length >= 2 ? 84 : 58,
      verified: false,
    },
    {
      statement: `${profile.gaps.join("·") || "탐구 구체성"}을 다음 활동에서 의도적으로 보완하면 서사의 발전이 더 분명해집니다.`,
      evidenceIds,
      confidence: 72,
      verified: false,
    },
  ];
  return {
    facts,
    interpretations,
    strengths: profile.strengths,
    gaps: profile.gaps,
    narrative: `${profile.name} 학생의 현재 관심 분야는 ${profile.interests.join("·") || profile.targetCareer}입니다. ${profile.strengths.join("·") || "기초 탐색 역량"} 강점을 바탕으로 진로 서사를 시작하고 있습니다.`,
    riskFlags: activities.length === 0 ? ["실제 활동 근거 부족", "온보딩 응답 확인 필요"] : [],
  };
}

export function makeNextMission(roadmap: Roadmap) {
  const active = roadmap.nodes.find((node) => node.status === "active") ?? roadmap.nodes.find((node) => node.status === "planned");
  if (!active) {
    return {
      title: "로드맵 회고와 다음 진로 방향 확인",
      whyNow: "현재 로드맵의 모든 제안 노드를 검토했습니다.",
      period: "1주",
      output: "3개년 활동 회고표",
    };
  }
  return {
    title: active.title,
    whyNow: `${active.grade}학년 ${active.semester}학기의 활성 로드맵 노드이며, ${active.competencyGoals.join("·")} 역량을 보완하는 단계입니다.`,
    period: "2~3주",
    output: "근거 자료와 자기평가가 포함된 탐구 기록",
    roadmapNodeId: active.id,
  };
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

export function analyzeAssignment(
  task: string,
  workspace: Omit<ProductWorkspace, "latestAnalysis">,
): AssignmentAnalysis {
  const conditions = [
    ["그래프 또는 정량 자료", ["그래프", "자료", "데이터", "수치"]],
    ["교과 원리 설명", ["원리", "개념", "이론"]],
    ["실제 사례", ["사례", "활용", "적용"]],
    ["한계 또는 사회적 영향", ["한계", "영향", "윤리", "환경"]],
    ["산출물 형식", ["보고서", "발표", "포스터", "영상"]],
  ] as const;
  const parsedConditions = conditions
    .filter(([, words]) => includesAny(task, [...words]))
    .map(([label]) => label);
  const missingInformation = conditions
    .filter(([, words]) => !includesAny(task, [...words]))
    .map(([label]) => `${label} 조건이 안내문에 명확하지 않습니다.`);
  const active = workspace.roadmap.nodes.find((node) => node.status === "active");
  const recent = workspace.activities[0];
  const interest = workspace.profile.interests[0] ?? "반도체 기술";
  const gap = workspace.profile.gaps[0] ?? "정량적 근거";
  const base = active?.narrativeStage ?? "탐색";

  const recommendations = [
    {
      id: crypto.randomUUID(),
      title: `${interest}의 핵심 변수를 데이터로 비교하기`,
      reason: `${recent ? `‘${recent.title}’ 활동을 반복하지 않고 확장하며` : "온보딩 관심 분야를 출발점으로"}, 부족 역량인 ‘${gap}’을 보완합니다.`,
      method: "공개 자료에서 조건이 다른 데이터 2종 이상을 수집해 표와 그래프로 비교",
      expectedOutput: "비교 그래프와 한계 분석이 포함된 탐구 보고서",
      roadmapConnection: `${base} 단계의 목표를 현재 수행평가로 구체화`,
      difficulty: "중",
    },
    {
      id: crypto.randomUUID(),
      title: `${interest}의 모형과 실제 결과가 달라지는 조건 찾기`,
      reason: `학생의 강점인 ‘${workspace.profile.strengths[0] ?? "개념 연결"}’을 활용하면서 비판적 분석을 추가합니다.`,
      method: "교과 모형의 예측과 실제 사례를 비교하고 오차·가정·적용 범위를 분류",
      expectedOutput: "모형-실제 비교표와 개선된 설명 모형",
      roadmapConnection: `${base} 단계에서 단순 설명을 넘어 근거 기반 판단으로 발전`,
      difficulty: "중상",
    },
    {
      id: crypto.randomUUID(),
      title: `${interest} 기술 선택의 성능·환경 상충 관계 분석`,
      reason: "반도체 진로 연결을 기술 찬양에 그치지 않고 사회·환경적 관점까지 확장합니다.",
      method: "성능 지표와 에너지·물·재료 지표를 각각 하나 이상 찾아 의사결정 기준 제안",
      expectedOutput: "상충 관계 매트릭스와 학생의 판단 기준",
      roadmapConnection: "향후 종합 단계에서 사용할 윤리·사회 관점의 초기 근거 확보",
      difficulty: "중",
    },
  ];

  return {
    id: crypto.randomUUID(),
    task,
    parsedConditions,
    missingInformation,
    activeRoadmapConnection: active
      ? `현재 활성 노드 ‘${active.title}’와 연결합니다.`
      : "활성 로드맵 노드가 없어 학생 프로필을 우선합니다.",
    recommendations,
    checklist: [
      "학생의 기존 활동과 다른 질문인가",
      "교과 개념이 탐구 방법에 실제로 사용되는가",
      "그래프·표·출처 중 하나 이상의 근거가 있는가",
      "실제로 수행 가능한 안전한 방법인가",
      "결론에서 한계와 다음 질문을 제시하는가",
    ],
  };
}

function tokens(text: string) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^가-힣a-z0-9]+/)
      .filter((token) => token.length >= 2),
  );
}

export function reconcileActivity(
  activity: StudentActivity,
  roadmap: Roadmap,
): Omit<ReconciliationLog, "id" | "studentId" | "activityId" | "roadmapId"> {
  const active = roadmap.nodes.find((node) => node.status === "active");
  if (!active) {
    return {
      nodeId: null,
      matchType: "UNCLASSIFIABLE",
      rationale: "현재 활성 로드맵 노드가 없어 활동을 독립 기록으로 저장했습니다.",
      action: "활동 저장 후 로드맵 검토 요청",
      confidence: 45,
    };
  }
  const activityTokens = tokens(`${activity.subject} ${activity.title} ${activity.summary} ${activity.concepts.join(" ")}`);
  const nodeTokens = tokens(`${active.title} ${active.objective} ${active.candidateSubjects.join(" ")} ${active.competencyGoals.join(" ")}`);
  const overlap = [...activityTokens].filter((token) => nodeTokens.has(token)).length;
  const semiconductorSignal = includesAny(`${activity.title} ${activity.summary}`, ["반도체", "다이오드", "트랜지스터", "공정", "센서", "회로", "규소", "데이터"]);
  const subjectMatch = active.candidateSubjects.some((subject) => subject.includes(activity.subject) || activity.subject.includes(subject));
  const score = overlap * 2 + (semiconductorSignal ? 2 : 0) + (subjectMatch ? 2 : 0);

  if (score >= 6) {
    return {
      nodeId: active.id,
      matchType: "MATCH",
      rationale: `활동의 교과·개념·산출물이 활성 노드 ‘${active.title}’의 목표와 직접 연결됩니다.`,
      action: "현재 노드 완료 및 다음 노드 활성화",
      confidence: Math.min(95, 72 + score * 3),
    };
  }
  if (score >= 3) {
    return {
      nodeId: active.id,
      matchType: "PARTIAL_MATCH",
      rationale: `활동이 활성 노드와 일부 연결되지만 ‘${active.competencyGoals.join("·")}’ 목표를 모두 충족하지는 않습니다.`,
      action: "부분 충족으로 기록하고 후속 보완 활동 제안",
      confidence: 68,
    };
  }
  return {
    nodeId: active.id,
    matchType: "DIVERGE",
    rationale: "현재 활성 노드와 직접 연결되는 교과·개념 근거가 적습니다. 유의미한 별도 활동일 수 있으므로 이탈로 단정하지 않습니다.",
    action: "로드맵 밖 활동으로 저장하고 학생 의도 확인",
    confidence: 61,
  };
}
