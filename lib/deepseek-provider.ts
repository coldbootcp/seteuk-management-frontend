import { env } from "cloudflare:workers";
import {
  type AssignmentAnalysis,
  type ActivityReview,
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
      priority?: "core" | "optional";
      title?: string;
      description?: string;
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
  why?: string;
  selectionMode?: "single" | "multiple";
  options?: string[];
};

export type OnboardingClarificationPayload = {
  summary?: string;
  questions?: OnboardingClarificationQuestionPayload[];
  complete?: boolean;
  draftChangeSummary?: string;
};

type ActivityReviewPayload = { alignment?: "aligned" | "partial" | "separate"; summary?: string; evidence?: string[]; gaps?: string[]; nextSteps?: string[] };

export async function reviewActivityWithDeepSeek(input: { activity: { title: string; subject: string; summary: string; reflection: string; concepts: string[]; outputs: string[] }; plan?: { title: string; objective: string; subject: string } | null; attachmentText: string[] }): Promise<ActivityReview | null> {
  try {
    const payload = await requestJson<ActivityReviewPayload>("학생의 실제 활동이 선택한 로드맵 계획의 의도에 부합하는지, 첨부한 발표자료·보고서의 텍스트와 학생 작성 기록을 근거로 검토하는 교육 코치입니다.", JSON.stringify({ task: "실제 활동 정합 검토", ...input, schema: { alignment: "aligned | partial | separate", summary: "판단 요약", evidence: ["근거"], gaps: ["부족한 점"], nextSteps: ["실행 가능한 보완 행동"] }, constraints: ["실제로 제공된 기록과 첨부 텍스트에 있는 사실만 근거로 쓸 것", "계획을 선택하지 않았으면 separate로 판단", "부족한 점이 없으면 gaps는 빈 배열", "한국어"] }), 1800);
    if (!payload?.alignment || !payload.summary) return null;
    return { activityId: "", alignment: payload.alignment, summary: payload.summary.trim(), evidence: cleanStrings(payload.evidence), gaps: cleanStrings(payload.gaps), nextSteps: cleanStrings(payload.nextSteps), provider: "deepseek" };
  } catch { return null; }
}

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
      "세특연구소 Pro의 개인화 로드맵 설계 엔진입니다. 학생의 실제 학교 기록과 앞으로 가능한 학기만 구분하고, 학교가 정해지지 않은 활동 방식은 지시하지 않는 진로 설계 코치입니다.",
      JSON.stringify({
        task: "학생 개인화 3개년 기록 지도와 현재 이후 활동 주제 후보 생성",
        profile,
        productContract: {
          pastSemesters: "현재 학기 이전 노드는 이미 끝난 사실 기록이다. 새 활동 계획·수정 지시·가상의 완료를 만들지 않는다.",
          currentAndFuture: "현재 학기부터 3학년 2학기까지만 새 주제 후보를 제안한다.",
          planEvents: "계획 항목은 프로젝트·과제·결과물이 아니라 학생이 학교에서 실제 기회를 만났을 때 선택할 수 있는 탐구 주제 후보이다.",
          execution: "수행평가·대회·발표·보고서·동아리·산출물 형식은 학교 기회가 생긴 뒤 학생이 정한다. 로드맵에서 강제하거나 전제하지 않는다.",
        },
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
              planEvents: [{ monthDay: "03-20", category: "활동", subject: "통합과학", priority: "core", title: "활동 주제", description: "이 주제에서 무엇을 탐구하고 왜 중요한지 설명" }],
            },
          ],
        },
        constraints: [
          "nodes는 화면의 시간축을 위해 정확히 6개이며 1·2·3학년의 1·2학기를 하나씩 포함한다. 단, 새 계획은 profile.grade·profile.semester 이후에만 둔다",
          "현재 학기 이전 노드는 기존 기록 자리로만 남기고 planEvents를 빈 배열로 둘 것",
          "현재·미래 노드는 이전 실제 기록에서 다음 관심으로 이어지는 서사를 갖되, 실제로 한 적 없는 활동을 했다고 쓰지 말 것",
          "학생의 관심분야, 직접 입력한 현재 활동, 보완해야 할 근거를 제목과 목표에 반영. 반도체를 기본값으로 가정하지 말 것",
          "profile.careerResolution이 '넓은 분야만 정한 단계'이면 세부 탐구 질문이나 배경지식처럼 보이는 잔여 텍스트를 확정 목표로 해석하지 말고, 넓은 관심 축에서 탐색하는 로드맵으로 작성할 것",
          "interests 안에 '로드맵 설계 전 확인 답변'이 있으면 그것을 단순 관심 키워드보다 우선하는 설계 조건으로 반영",
          "작은 키워드 하나에 6학기 전체가 매몰되지 않도록, 큰 성장 서사와 단계적 전개를 먼저 설계",
          "진로 선택의 동기(motivationTrigger)와 목표 해상도(careerResolution)를 로드맵 서사의 핵심 방향성으로 사용할 것",
          "planEvents는 학생이 해당 학기에 학교에서 생기는 수행평가·동아리·대회·발표·독서 등의 기회에 골라 녹일 수 있는 '탐구 주제 제안'이다. 특정 형식이나 행사 참여를 지시하는 계획이 아니다",
          "각 노드에 정확히 10개의 서로 다른 주제를 만들 것. priority가 core인 꼭 하면 좋은 주제 4개를 먼저, optional인 여유가 있을 때 좋은 주제 6개를 뒤에 둘 것",
          "각 주제에는 description으로 학생이 무엇을 탐구·비교·판단하면 되는지, 왜 이 학기와 연결되는지를 2문장 이내로 구체적으로 설명할 것",
          "'보고서로 작성', '대회에 출전', '발표하기', '수행평가로 하기'처럼 방식·형식을 제목에 넣거나 강요하지 말 것. 학교에서 실제 기회가 생겼을 때 학생이 형식을 선택한다",
          "학생의 관심·기존 기록·보완할 증거와 연결되지만, 한 학기에 모두 해야 하는 할 일 목록처럼 쓰지 말 것",
          "날짜는 단지 해당 학기 안의 권장 검토 시점이며 마감이나 실행 지시가 아니다. 해당 학기 안의 MM-DD 형식으로 작성",
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
                  priority: event.priority === "optional" ? "optional" : "core",
                  title: event.title!.trim(),
                  description: event.description?.trim() || "이 학기의 목표와 연결되는 탐구 주제입니다. 학교에서 적절한 기회가 생겼을 때 실제 활동으로 연결하세요.",
                }))
            : [],
          status: index < current ? "skipped" : index === current ? "active" : "planned",
          instantiatedActivityId: null,
        } as Roadmap["nodes"][number];
      })
      .filter((node): node is NonNullable<typeof node> => Boolean(node));

    if (nodes.length !== 6 || seen.size !== 6 || nodes.some((node) => node.status !== "skipped" && node.planEvents?.length !== 10)) return null;
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
      "세특연구소 Pro의 로드맵 검증 엔진입니다. 일반 진로 설문을 만들지 않고, 내부 1차 가설에서 현재 이후 학기의 주제 우선순위가 실제로 달라질 때만 확인하는 코치입니다.",
      JSON.stringify({
        task: "1차 로드맵 가설 검토 및 반복 확인 질문 생성",
        input,
        productContract: {
          roadmap: "로드맵은 현재 이후 학기에 학교 기회가 생겼을 때 선택할 탐구 주제 후보의 우선순위다. 프로젝트·결과물·활동 채널을 미리 확정하지 않는다.",
          past: "현재 학기 이전은 학생의 확정 기록이며 질문이나 새 계획의 대상이 아니다.",
          clarification: "확인 질문은 학년·학생부 사실의 충돌, 기존 기록과 새 관심의 연결 방식처럼 가설을 바꾸는 불확실성에 한정한다.",
          default: "불확실성이 없거나 이미 입력에 답이 있으면 questions는 빈 배열, complete는 true다.",
        },
        schema: {
          summary: "현재 가설을 어떻게 보고 있는지와 이번 확인의 이유를 설명하는 1~2문장",
          complete: "추가 답변이 로드맵의 학기 전략·대표 활동·증거 방식에 영향을 주지 않으면 true, 아니면 false",
          draftChangeSummary: "답변을 반영하면 바뀌는 로드맵 방향 요약",
          questions: [
            {
              id: "짧은 영문 snake_case",
              label: "질문 분류",
              question: "학생에게 물어볼 구체 질문",
              why: "이 답이 어느 학기 전략·대표 활동·증거 방식에 영향을 주는지",
              selectionMode: "single | multiple (복수 선택이 실제로 필요할 때만 multiple)",
              options: ["선택지 2~4개"],
            },
          ],
        },
        constraints: [
          "이미 받은 답변은 다시 묻지 말 것. input.answers의 내용과 동일한 주제는 답변이 충분하지 않을 때만 더 구체적으로 물을 것",
          "input.form, input.schoolRecord, input.roadmapHypothesis에 명시되지 않은 동아리·프로그래밍 언어·수업·활동을 학생이 했다고 전제하거나 질문에 언급하지 말 것. 예를 들어 파이썬, 데이터 분석 동아리는 입력 근거가 있을 때만 언급 가능하다",
          "input.form.careerResolution이 '넓은 분야만 정한 단계'이면 input.form.concreteResearchQuestion과 knowledgeLevel은 무시하고, 넓은 관심 축을 탐색하는 가설만 검토할 것",
          "학생이 '잘 모르겠음 — AI 판단에 맡길게요'를 선택하면 그 변수는 제공된 학생부·입력 정보·1차 가설을 근거로 AI가 판단할 것. 같은 내용을 다시 물어보지 말 것",
          "설계 전 확인 단계에서는 아직 학생에게 개별 활동 주제가 제시되지 않았다는 점을 지킬 것. '주 1~2시간 투자 가능 여부', '어떤 프로젝트를 완료할 수 있는지', 특정 프로젝트의 난이도·분량·완료 가능성은 절대 묻지 말 것",
          "시간·학교 환경 같은 제약은 Step2의 constraints에 이미 있는 범위만 반영할 것. 구체적인 학교 기회와 활동 주제가 연결된 뒤에만 실행 방식이나 부담을 판단한다",
          "같은 의도를 표현만 바꿔 반복하지 말 것. input.answers에 있는 질문과 의미가 겹치면 새 질문을 만들지 말고, 로드맵에 영향이 없으면 complete를 true로 할 것",
          "input.roadmapHypothesis는 학생에게 아직 보여주지 않는 내부 1차 가설이다. 일반 설문을 만들지 말고, 이 가설의 시작 학기·학기별 전략·대표 활동·증거 방식이 실제로 달라질 수 있는 불확실성만 물을 것",
          "질문마다 why에 해당 답변이 바꾸는 가설의 지점을 구체적으로 설명할 것",
          "이름·학년처럼 사실을 하나로 확정해야 하는 질문만 selectionMode를 single로 작성할 것. 그 외 관심축·기존 기록 연결·우선순위 질문은 여러 답이 함께 성립할 수 있으므로 기본적으로 multiple로 작성할 것",
          "질문 횟수의 총량에는 제한이 없다. 이번 묶음에서 필요한 질문이 없으면 questions를 빈 배열로 두고 complete를 true로 할 것. 질문이 필요하면 complete는 false로 할 것",
          "학생부 이름과 입력 이름이 다르면 동일 학생 자료인지 확인하는 질문을 반드시 포함할 것. 이름 질문은 단순 행정 확인이지만 분석 신뢰도를 위해 필요하다",
          "재학생일 때만 학생부의 확정 마지막 학년과 입력 학년이 실제로 충돌하는지 검토할 것. 단순히 학생부가 1학년까지 있다는 이유로 현재 학년을 단정하거나 묻지 말 것",
          "학생부가 3학년까지 확정됐거나 Step1 학년이 졸업이면 마감된 기록에 대한 진로 연결 질문은 만들지 말되, 이름이 다르면 이름 확인 질문은 유지할 것",
          "재학생 학생부 분석 결과가 있으면 기존 기록과 희망 진로의 연결/충돌, 이미 쌓인 과목·활동의 결을 우선 검토할 것",
          "현재 학년과 학기를 함께 써서 남은 학기 수를 정확히 계산할 것. 현재 학기를 포함해 2학년 1학기는 4개, 2학년 2학기는 3개, 3학년 1학기는 2개, 3학년 2학기는 1개 학기만 설계 대상이다",
          "2학년·3학년 학생에게 '6학기 전체'나 지난 학기를 새 계획처럼 묻지 말 것. 남은 학기에서 이미 확정된 기록을 어떻게 잇거나 보완할지만 물을 것",
          "학생부의 활동이 희망 진로와 다르면 관심의 출처를 막연히 묻지 말고, 기존 기록 중 어떤 강점/주제를 새 진로의 근거로 살릴지 또는 남은 학기에 어떤 다리를 놓을지 물을 것",
          "학생부 분석 결과가 비어 있거나 없으면 그 사실을 전제로 로드맵 전략상 정말 필요한 질문만 만들 것",
          "관심을 갖게 된 계기·동기·출처처럼 심리적 배경을 일반적으로 묻지 말 것. 학생부의 기존 방향과 현재 진로가 달라 실제 연결 전략이 달라지는 경우에만 '무엇이 어떻게 바뀌었는지'를 물을 것",
          "질문은 학생에게 실제로 남은 학기의 큰 방향을 바꿀 수 있는 것만 포함하고, 작은 세부 키워드 하나에 매몰되지 말 것",
          "6학기 전체 구조 질문은 1학년에게만 가능하다. 2·3학년에게는 남은 학기의 시작점, 기존 기록과의 연결, 대표 주제의 우선순위처럼 구조적 선택만 물을 것",
          "선택지는 서로 다른 로드맵 설계 전략이 되도록 2~3개만 작성할 것. 시스템이 별도로 '잘 모르겠음 — AI 판단에 맡길게요' 선택지를 붙인다",
          "이름·학년 불일치처럼 객관적 충돌이 있으면 가장 앞 질문으로 둘 것",
          "한 번의 질문 묶음은 학생이 부담 없이 답할 수 있도록 1~4개로 제한할 것. 단, 추가 확인이 필요하면 다음 묶음에서 이어갈 수 있다",
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
            why: question.why?.trim() || "",
            selectionMode: question.selectionMode === "multiple" ? "multiple" : "single",
            options: cleanStrings(question.options).slice(0, 4),
          }))
          .filter((question) => question.question && question.options.length >= 2)
          .slice(0, 4)
      : [];
    const complete = payload?.complete === true && questions.length === 0;
    if (!questions.length && !complete) return null;
    return {
      summary: payload?.summary?.trim() || "",
      questions,
      complete,
      draftChangeSummary: payload?.draftChangeSummary?.trim() || "",
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
