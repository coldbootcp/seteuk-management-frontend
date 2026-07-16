import { env } from "cloudflare:workers";
import {
  type AssignmentAnalysis,
  type DnaDiagnosis,
  type ProductWorkspace,
  type ProfileInput,
  type Roadmap,
  type RoadmapPlanEvent,
  type StudentActivity,
  type StudentWorkspaceProfile,
} from "./product-harness";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash";

type RuntimeEnv = {
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
};

type ChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

type RoadmapPayload = {
  nodes?: Array<{
    grade?: number;
    semester?: number;
    narrativeStage?: string;
    title?: string;
    objective?: string;
    candidateSubjects?: string[];
    competencyGoals?: string[];
    planEvents?: Array<{
      monthDay?: string;
      category?: RoadmapPlanEvent["category"];
      subject?: string;
      title?: string;
    }>;
  }>;
};

type DnaPayload = {
  facts?: string[];
  interpretations?: Array<{
    statement?: string;
    evidenceIds?: string[];
    confidence?: number;
    verified?: boolean;
  }>;
  strengths?: string[];
  gaps?: string[];
  narrative?: string;
  riskFlags?: string[];
};

type AssignmentPayload = {
  parsedConditions?: string[];
  missingInformation?: string[];
  activeRoadmapConnection?: string;
  recommendations?: Array<{
    title?: string;
    reason?: string;
    method?: string;
    expectedOutput?: string;
    roadmapConnection?: string;
    difficulty?: string;
  }>;
  checklist?: string[];
};

function runtimeEnv() {
  const workerEnv = env as unknown as RuntimeEnv;
  const processEnv = typeof process === "undefined" ? undefined : process.env;
  return {
    apiKey: workerEnv.DEEPSEEK_API_KEY?.trim() || processEnv?.DEEPSEEK_API_KEY?.trim() || "",
    model: workerEnv.DEEPSEEK_MODEL?.trim() || processEnv?.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL,
  };
}

export function isDeepSeekConfigured() {
  return Boolean(runtimeEnv().apiKey);
}

function parseJsonContent(content: string) {
  const trimmed = content.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  return JSON.parse(unfenced) as unknown;
}

async function requestJson<T>(system: string, user: string, maxTokens: number) {
  const { apiKey, model } = runtimeEnv();
  if (!apiKey) return null;

  const response = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: `${system}\n반드시 JSON으로만 답하세요.` },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      temperature: 0.2,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`DeepSeek API ${response.status}: ${detail.slice(0, 240)}`);
  }

  const body = (await response.json()) as ChatResponse;
  const content = body.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error("DeepSeek API가 빈 응답을 반환했습니다.");
  return parseJsonContent(content) as T;
}

function cleanStrings(values: unknown, fallback: string[] = []) {
  if (!Array.isArray(values)) return fallback;
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim());
}

function activeIndex(profile: ProfileInput) {
  return Math.max(0, Math.min(5, (profile.grade - 1) * 2 + (profile.semester - 1)));
}

export async function generateRoadmapWithDeepSeek(
  profile: ProfileInput,
  ids?: { studentId?: string; roadmapId?: string },
): Promise<Roadmap | null> {
  try {
    const payload = await requestJson<RoadmapPayload>(
      "고등학교 생활기록부와 반도체 진로를 연결하는 진로 코치입니다. 학생의 현재 학년부터 3학년까지 성장 서사가 이어지는 로드맵을 설계하세요.",
      JSON.stringify({
        task: "반도체 진로 학생의 3개년 로드맵 6개 노드 생성",
        profile,
        schema: {
          nodes: [
            {
              grade: 1,
              semester: 1,
              narrativeStage: "탐색",
              title: "짧은 노드 제목",
              objective: "학생이 수행할 수 있는 구체적인 목표",
              candidateSubjects: ["통합과학"],
              competencyGoals: ["진로 탐색"],
              planEvents: [{ monthDay: "03-20", category: "보고서", subject: "통합과학", title: "활동 제목" }],
            },
          ],
        },
        constraints: [
          "nodes는 정확히 6개이며 1·2·3학년의 1·2학기를 하나씩 포함",
          "각 학기는 이전 활동에서 다음 활동으로 발전하는 서사를 가져야 함",
          "학생의 관심·강점·보완 역량을 제목과 목표에 반영",
          "진로 선택의 동기(motivationTrigger)와 목표 해상도(careerResolution)를 로드맵 서사의 핵심 방향성으로 사용할 것",
          "산출물 선호도(outputPreference)와 작업 방식(collaborationStyle)을 반영하여 미래 활동(planEvents)의 방식을 제안할 것",
          "학교에서 실제로 수행 가능한 탐구·보고서·발표 중심으로 작성",
          "각 노드에 2~4개의 미래 활동을 만들고, 날짜는 해당 학기 안의 MM-DD 형식으로 작성",
          "미래 활동의 카테고리는 상장·대회·수행평가·보고서·독서·시험 중 하나",
        ],
      }),
      5000,
    );
    if (!payload?.nodes || payload.nodes.length !== 6) return null;

    const seen = new Set<string>();
    const studentId = ids?.studentId ?? crypto.randomUUID();
    const roadmapId = ids?.roadmapId ?? crypto.randomUUID();
    const current = activeIndex(profile);
    const nodes = payload.nodes
      .map((node, index) => {
        const grade = Number(node.grade);
        const semester = Number(node.semester);
        const key = `${grade}-${semester}`;
        if (![1, 2, 3].includes(grade) || ![1, 2].includes(semester) || seen.has(key)) return null;
        seen.add(key);
        const title = node.title?.trim();
        const objective = node.objective?.trim();
        if (!title || !objective) return null;
        return {
          id: crypto.randomUUID(),
          roadmapId,
          studentId,
          orderIndex: index,
          grade,
          semester,
          narrativeStage: node.narrativeStage?.trim() || "성장",
          title,
          objective,
          candidateSubjects: cleanStrings(node.candidateSubjects, ["통합과학"]),
          competencyGoals: cleanStrings(node.competencyGoals, ["탐구 설계"]),
          planEvents: Array.isArray(node.planEvents)
            ? node.planEvents
                .filter((event) => {
                  if (!/^\d{2}-\d{2}$/.test(event.monthDay ?? "") || !event.title?.trim() || !event.subject?.trim()) return false;
                  const month = Number(event.monthDay!.slice(0, 2));
                  return semester === 1 ? month >= 3 && month <= 8 : month >= 9 || month <= 2;
                })
                .map((event) => ({
                  id: crypto.randomUUID(),
                  monthDay: event.monthDay!,
                  category: event.category && ["상장", "대회", "수행평가", "보고서", "독서", "시험"].includes(event.category)
                    ? event.category
                    : "보고서",
                  subject: event.subject!.trim(),
                  title: event.title!.trim(),
                }))
            : [],
          status: index < current ? "skipped" : index === current ? "active" : "planned",
          instantiatedActivityId: null,
        } as Roadmap["nodes"][number];
      })
      .filter((node): node is NonNullable<typeof node> => Boolean(node));

    if (nodes.length !== 6 || seen.size !== 6 || nodes.some((node) => !node.planEvents?.length)) return null;
    nodes.sort((a, b) => a.orderIndex - b.orderIndex);
    return {
      id: roadmapId,
      studentId,
      version: 1,
      careerTrack: profile.targetCareer,
      templateId: "deepseek-semiconductor-v1",
      status: "draft",
      nodes,
    };
  } catch (error) {
    console.warn("DeepSeek roadmap fallback:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

export async function diagnoseStudentWithDeepSeek(
  profile: StudentWorkspaceProfile,
  activities: StudentActivity[],
): Promise<DnaDiagnosis | null> {
  try {
    const payload = await requestJson<DnaPayload>(
      "학생의 직접 입력 사실과 실제 활동을 구분해 Student DNA를 분석하는 교육 코치입니다.",
      JSON.stringify({
        task: "학생의 현재 강점·보완 역량·진로 서사 분석",
        profile,
        activities,
        schema: {
          facts: ["학생이 직접 입력했거나 활동에서 확인된 사실"],
          interpretations: [{ statement: "근거가 붙은 해석", evidenceIds: [], confidence: 70, verified: false }],
          strengths: ["강점"],
          gaps: ["보완 역량"],
          narrative: "현재까지의 성장 서사와 학생 고유의 탐구 성향(DNA)",
          riskFlags: ["확인이 필요한 위험 신호"],
        },
        constraints: [
          "profile의 motivationTrigger, careerResolution, outputPreference를 분석하여 학생의 고유한 학업 성향(DNA)을 서사에 반영할 것",
          "상투적인 칭찬보다는 학생의 성향에 맞는 구체적인 발전 방향을 제시할 것"
        ]
      }),
      2500,
    );
    if (!payload?.narrative?.trim()) return null;
    const evidenceIds = new Set(activities.map((activity) => activity.id));
    return {
      facts: cleanStrings(payload.facts),
      interpretations: Array.isArray(payload.interpretations)
        ? payload.interpretations
            .filter((item) => Boolean(item.statement?.trim()))
            .map((item) => ({
              statement: item.statement!.trim(),
              evidenceIds: cleanStrings(item.evidenceIds).filter((id) => evidenceIds.has(id)),
              confidence: Math.max(0, Math.min(100, Number(item.confidence) || 50)),
              verified: Boolean(item.verified),
            }))
        : [],
      strengths: cleanStrings(payload.strengths, profile.strengths),
      gaps: cleanStrings(payload.gaps, profile.gaps),
      narrative: payload.narrative.trim(),
      riskFlags: cleanStrings(payload.riskFlags),
    };
  } catch (error) {
    console.warn("DeepSeek DNA fallback:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

export async function analyzeAssignmentWithDeepSeek(
  task: string,
  workspace: Omit<ProductWorkspace, "latestAnalysis">,
): Promise<AssignmentAnalysis | null> {
  try {
    const payload = await requestJson<AssignmentPayload>(
      "수행평가 안내문을 분석하고 학생의 현재 로드맵과 생활기록부 활동에 맞는 후속 탐구를 설계하는 교육 코치입니다.",
      JSON.stringify({
        task,
        student: workspace.profile,
        activeRoadmap: workspace.roadmap.nodes.find((node) => node.status === "active") ?? null,
        recentActivities: workspace.activities.slice(0, 8),
        dna: workspace.dna,
        schema: {
          parsedConditions: ["안내문에서 확인한 조건"],
          missingInformation: ["안내문에서 확인되지 않은 조건"],
          activeRoadmapConnection: "현재 활성 노드와 연결하는 이유",
          recommendations: [{ title: "추천 활동", reason: "추천 근거", method: "실행 방법", expectedOutput: "산출물", roadmapConnection: "로드맵 연결", difficulty: "중" }],
          checklist: ["검토 기준"],
        },
        constraints: [
          "추천은 3개",
          "학생이 실제로 수행 가능한 안전한 활동",
          "기존 활동을 반복하지 않고 한 단계 확장",
          "반도체 진로와 교과 개념의 연결을 명시",
        ],
      }),
      4500,
    );
    if (!payload?.activeRoadmapConnection || !Array.isArray(payload.recommendations) || payload.recommendations.length < 3) return null;
    const recommendations = payload.recommendations.slice(0, 3).map((item) => ({
      id: crypto.randomUUID(),
      title: item.title?.trim() || "후속 탐구 활동",
      reason: item.reason?.trim() || "학생의 현재 로드맵과 연결되는 확장 활동입니다.",
      method: item.method?.trim() || "자료를 수집하고 교과 개념으로 비교·분석합니다.",
      expectedOutput: item.expectedOutput?.trim() || "근거와 한계가 포함된 탐구 기록",
      roadmapConnection: item.roadmapConnection?.trim() || payload.activeRoadmapConnection!.trim(),
      difficulty: item.difficulty?.trim() || "중",
    }));
    return {
      id: crypto.randomUUID(),
      task,
      parsedConditions: cleanStrings(payload.parsedConditions),
      missingInformation: cleanStrings(payload.missingInformation),
      activeRoadmapConnection: payload.activeRoadmapConnection.trim(),
      recommendations,
      checklist: cleanStrings(payload.checklist),
      provider: "deepseek",
    };
  } catch (error) {
    console.warn("DeepSeek assignment fallback:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}
