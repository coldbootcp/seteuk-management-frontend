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

export type OnboardingSuggestionPayload = {
  majors?: string[];
  keywords?: string[];
};

export type OnboardingClarificationQuestionPayload = {
  id?: string;
  label?: string;
  question?: string;
  options?: string[];
};

export type OnboardingClarificationPayload = {
  summary?: string;
  questions?: OnboardingClarificationQuestionPayload[];
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
              planEvents: [{ monthDay: "03-20", category: "활동", subject: "통합과학", title: "활동 제목" }],
            },
          ],
        },
        constraints: [
          "nodes는 정확히 6개이며 1·2·3학년의 1·2학기를 하나씩 포함",
          "각 학기는 이전 활동에서 다음 활동으로 발전하는 서사를 가져야 함",
          "학생의 관심분야, 기존 기록, 보완해야 할 증거를 제목과 목표에 반영",
          "interests 안에 '로드맵 설계 전 확인 답변'이 있으면 그것을 단순 관심 키워드보다 우선하는 설계 조건으로 반영",
          "작은 키워드 하나에 6학기 전체가 매몰되지 않도록, 큰 성장 서사와 단계적 전개를 먼저 설계",
          "진로 선택의 동기(motivationTrigger)와 목표 해상도(careerResolution)를 로드맵 서사의 핵심 방향성으로 사용할 것",
          "산출물 선호도(outputPreference)와 실행 전략(collaborationStyle)을 반영하여 미래 활동(planEvents)의 방식을 제안할 것",
          "학교에서 실제로 수행 가능한 탐구·보고서·발표 중심으로 작성",
          "각 노드에 2~4개의 미래 활동을 만들고, 날짜는 해당 학기 안의 MM-DD 형식으로 작성",
          "미래 활동의 카테고리는 상장·활동·봉사·독서·시험 중 하나. 대회와 수행평가는 별도 카테고리로 쓰지 말고 활동으로 통합할 것",
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
          narrativeStage: index < current ? "회고" : (node.narrativeStage?.trim() || "성장"),
          title: index < current ? "기존 활동 기록" : title,
          objective: index < current ? "생기부 연동을 통해 과거 활동을 확인하세요." : objective,
          candidateSubjects: index < current ? [] : cleanStrings(node.candidateSubjects, ["통합과학"]),
          competencyGoals: index < current ? [] : cleanStrings(node.competencyGoals, ["탐구 설계"]),
          planEvents: index < current ? [] : Array.isArray(node.planEvents)
            ? node.planEvents
                .filter((event) => {
                  if (!/^\d{2}-\d{2}$/.test(event.monthDay ?? "") || !event.title?.trim() || !event.subject?.trim()) return false;
                  const month = Number(event.monthDay!.slice(0, 2));
                  return semester === 1 ? month >= 3 && month <= 8 : month >= 9 || month <= 2;
                })
                .map((event) => ({
                  id: crypto.randomUUID(),
                  monthDay: event.monthDay!,
                  category: "계획",
                  subject: event.subject!.trim(),
                  title: event.title!.trim(),
                }))
            : [],
          status: index < current ? "skipped" : index === current ? "active" : "planned",
          instantiatedActivityId: null,
        } as Roadmap["nodes"][number];
      })
      .filter((node): node is NonNullable<typeof node> => Boolean(node));

    if (nodes.length !== 6 || seen.size !== 6 || nodes.some((node) => node.status !== "skipped" && !node.planEvents?.length)) return null;
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

export async function summarizeNodeWithDeepSeek(
  profile: ProfileInput,
  grade: number,
  semester: number,
  activityDetails: string
): Promise<{ title: string; objective: string } | null> {
  try {
    const payload = await requestJson<{ title: string; objective: string }>(
      "고등학생의 생활기록부 활동을 바탕으로 진로와 연관된 학기 요약을 작성하는 진로 설계 코치입니다.",
      JSON.stringify({
        task: `${grade}학년 ${semester}학기 활동 요약 생성`,
        context: {
          targetCareer: profile.targetCareer,
          targetMajors: profile.targetMajors,
          interests: profile.interests,
        },
        activities: activityDetails,
        schema: {
          title: "학기를 대표하는 간결한 노드 제목 (예: 기초 역량 탐색)",
          objective: "진로와 연관지어 작성한 해당 학기 활동의 핵심 요약 (1~2문장)"
        },
        constraints: [
          "title은 15자 이내로 명사형으로 끝맺을 것",
          "objective는 해당 학기에 수행한 주요 활동을 진로 목표와 연결하여 1~2문장으로 간결하게 작성할 것",
          "과장된 표현(위대한, 완벽한)을 피하고 객관적 서술을 유지할 것"
        ]
      }),
      800,
    );
    if (!payload?.title || !payload?.objective) return null;
    return { title: payload.title, objective: payload.objective };
  } catch (error) {
    console.warn("DeepSeek node summary failed:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

export async function suggestOnboardingDirectionWithDeepSeek(
  targetCareer: string,
): Promise<OnboardingSuggestionPayload | null> {
  const topic = targetCareer.trim();
  if (topic.length < 2) return null;
  try {
    const payload = await requestJson<OnboardingSuggestionPayload>(
      "고등학생의 관심 분야를 대학 학과 후보와 6학기 로드맵의 큰 설계 축으로 구체화하는 진로 설계 코치입니다.",
      JSON.stringify({
        task: "관심 분야 기반 온보딩 후보 생성",
        targetCareer: topic,
        schema: {
          majors: ["연결 가능한 학과 후보 5개"],
          keywords: ["6학기 로드맵의 큰 방향이 될 범주형 키워드 6개"],
        },
        constraints: [
          "한국 고등학생의 생활기록부와 교과 탐구에 연결 가능한 후보로 작성",
          "학과명은 너무 넓지 않게, 실제 대학 학과/전공명에 가깝게 작성",
          "키워드는 한 번의 보고서 주제가 아니라 6학기 로드맵의 축이 될 큰 범주로 작성",
          "너무 미시적인 실험명, 특정 논문 주제, 단발성 문제 제안은 피할 것",
          "각 항목은 24자 이내로 간결하게 작성",
          "성격이나 선호가 아니라 전공 정합성과 탐구 가능성을 기준으로 추천",
        ],
      }),
      1200,
    );
    return {
      majors: cleanStrings(payload?.majors).slice(0, 6),
      keywords: cleanStrings(payload?.keywords).slice(0, 10),
    };
  } catch (error) {
    console.warn("DeepSeek onboarding suggestion fallback:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

export async function generateOnboardingClarificationWithDeepSeek(
  input: unknown,
): Promise<OnboardingClarificationPayload | null> {
  try {
    const payload = await requestJson<OnboardingClarificationPayload>(
      "학생의 Step1 기본정보, Step2 실행조건, 그리고 학생부 분석 결과를 모두 읽은 뒤 3개년 로드맵 설계 전에 꼭 확인해야 할 질문만 뽑는 진로 설계 코치입니다.",
      JSON.stringify({
        task: "온보딩 Step1·Step2·학생부 분석 기반 로드맵 설계 전 확인 질문 생성",
        input,
        schema: {
          summary: "Step1·Step2·학생부를 함께 보고 생긴 핵심 판단 요약 1문장",
          questions: [
            {
              id: "짧은 영문 snake_case",
              label: "질문 분류",
              question: "학생에게 물어볼 구체 질문",
              options: ["선택지 2~4개"],
            },
          ],
        },
        constraints: [
          "Step1과 Step2에서 이미 답한 내용을 다시 묻지 말 것",
          "학생부 이름과 입력 이름이 다르면 동일 학생 자료인지 확인하는 질문을 반드시 포함할 것. 이름 질문은 단순 행정 확인이지만 분석 신뢰도를 위해 필요하다",
          "재학생일 때만 학생부의 확정 마지막 학년과 입력 학년이 실제로 충돌하는지 검토할 것. 단순히 학생부가 1학년까지 있다는 이유로 현재 학년을 단정하거나 묻지 말 것",
          "학생부가 3학년까지 확정됐거나 Step1 학년이 졸업이면 마감된 기록에 대한 진로 연결 질문은 만들지 말되, 이름이 다르면 이름 확인 질문은 유지할 것",
          "재학생 학생부 분석 결과가 있으면 기존 기록과 희망 진로의 연결/충돌, 이미 쌓인 과목·활동의 결을 우선 검토할 것",
          "현재 2학년 또는 3학년이면 남은 학기 수를 계산하고, 이미 확정된 기록과 남은 기록에서 무엇을 보완·전환할 수 있는지 질문할 것",
          "2학년은 3~4학기, 3학년은 1~2학기만 새 활동을 반영할 수 있다는 점을 고려해 질문의 선택지를 남은 기간에 맞출 것",
          "학생부의 활동이 희망 진로와 다르면 관심의 출처를 막연히 묻지 말고, 기존 기록 중 어떤 강점/주제를 새 진로의 근거로 살릴지 또는 남은 학기에 어떤 다리를 놓을지 물을 것",
          "학생부 분석 결과가 비어 있거나 없으면 그 사실을 전제로 로드맵 전략상 정말 필요한 질문만 만들 것",
          "관심을 갖게 된 계기·동기·출처처럼 심리적 배경을 일반적으로 묻지 말 것. 학생부의 기존 방향과 현재 진로가 달라 실제 연결 전략이 달라지는 경우에만 '무엇이 어떻게 바뀌었는지'를 물을 것",
          "질문은 6학기 로드맵의 큰 방향을 바꿀 수 있는 것만 포함하고, 작은 세부 키워드 하나에 매몰되지 말 것",
          "예: 반도체 8대공정 관심이라면 8대공정을 6학기에 고르게 펼칠지, 기초과학/소자/재료 지식 후 공정으로 갈지, 기존 학생부 기록과 어떤 축으로 연결할지처럼 구조적 선택을 물을 것",
          "선택지는 서로 다른 로드맵 설계 전략이 되도록 작성할 것",
          "이름·학년 불일치처럼 객관적 충돌이 있으면 가장 앞 질문으로 둘 것",
          "질문은 이름 확인을 포함해 2~5개만 만들 것",
          "한국어로 작성할 것",
        ],
      }),
      2200,
    );
    const questions = Array.isArray(payload?.questions)
      ? payload.questions
          .map((question, index) => ({
            id: question.id?.trim() || `clarify_${index + 1}`,
            label: question.label?.trim() || "확인 질문",
            question: question.question?.trim() || "",
            options: cleanStrings(question.options).slice(0, 4),
          }))
          .filter((question) => question.question && question.options.length >= 2)
          .slice(0, 5)
      : [];
    if (!questions.length) return null;
    return {
      summary: payload?.summary?.trim() || "",
      questions,
    };
  } catch (error) {
    console.warn("DeepSeek onboarding clarification fallback:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

export async function diagnoseStudentWithDeepSeek(
  profile: StudentWorkspaceProfile,
  activities: StudentActivity[],
): Promise<DnaDiagnosis | null> {
  try {
    const payload = await requestJson<DnaPayload>(
      "학생의 직접 입력 사실과 실제 활동을 구분해 전공 서사 DNA를 분석하는 교육 코치입니다.",
      JSON.stringify({
        task: "학생의 관심분야 구체도·탐구 질문·증거 기반성·전공 서사 분석",
        profile,
        activities,
        schema: {
          facts: ["학생이 직접 입력했거나 활동에서 확인된 사실"],
          interpretations: [{ statement: "근거가 붙은 해석", evidenceIds: [], confidence: 70, verified: false }],
          strengths: ["강점"],
          gaps: ["보완 역량"],
          narrative: "현재까지의 기록과 관심분야가 어떤 전공 서사로 이어질 수 있는지",
          riskFlags: ["확인이 필요한 위험 신호"],
        },
        constraints: [
          "성격검사처럼 쓰지 말고, 관심분야가 얼마나 구체적인지와 어떤 증거가 필요한지를 중심으로 분석할 것",
          "상투적인 칭찬보다는 전공 정합성, 탐구 질문, 다음 활동으로 보완할 지점을 구체적으로 제시할 것"
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
