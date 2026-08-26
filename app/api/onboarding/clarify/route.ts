import { generateOnboardingClarificationWithDeepSeek } from "../../../../lib/deepseek-provider";

type ClarificationQuestion = {
  id: string;
  label: string;
  question: string;
  options: string[];
};

type ClarifyRequest = {
  form?: {
    name?: string;
    grade?: string;
    semester?: string;
    targetCareer?: string;
    targetMajors?: string[];
    interests?: string[];
    careerResolution?: string;
    concreteResearchQuestion?: string;
    knowledgeLevel?: string;
    currentEngagement?: string[];
    outputPreference?: string[];
    collaborationStyle?: string[];
    constraints?: string[];
  };
  schoolRecord?: {
    fileName?: string;
    completedGrade?: number | null;
    subjects?: string[];
    entries?: Array<{
      grade?: number;
      semester?: number;
      category?: string;
      subject?: string;
      title?: string;
      summary?: string;
    }>;
  } | null;
  recordContext?: {
    expectedGrade?: string | null;
    studentName?: string;
  };
};

function gradeLabel(value?: string | null) {
  if (!value) return "";
  if (value === "graduated") return "졸업";
  return `${value}학년`;
}

function isGraduatedInput(value?: string | null) {
  return value === "graduated" || value === "졸업";
}

function recordIsFinalized(record: ClarifyRequest["schoolRecord"], form: ClarifyRequest["form"]) {
  return isGraduatedInput(form?.grade) || (record?.completedGrade ?? 0) >= 3;
}

function fallbackClarification(input: ClarifyRequest): { summary: string; questions: ClarificationQuestion[] } {
  const form = input.form ?? {};
  const career = form.targetCareer?.trim() || "희망 진로";
  const interests = form.interests?.filter(Boolean).slice(0, 4).join(", ") || "관심 분야";
  const expectedGrade = input.recordContext?.expectedGrade;
  const record = input.schoolRecord;
  const subjects = record?.subjects?.filter(Boolean).slice(0, 5) ?? [];
  const recordHighlights = record?.entries?.filter((entry) => entry.title || entry.summary).slice(0, 2).map((entry) => entry.title || entry.summary).filter(Boolean) ?? [];
  const hasRecords = Boolean(record?.entries?.length);
  const finalized = recordIsFinalized(record, form);
  const questions: ClarificationQuestion[] = [];

  const typedName = form.name?.trim();
  const recordName = input.recordContext?.studentName?.trim();
  if (recordName && typedName && recordName !== typedName) {
    questions.push({
      id: "identity_conflict",
      label: "학생부 이름 확인",
      question: `업로드한 학생부의 이름은 ${recordName}이고 입력한 이름은 ${typedName}입니다. 동일 학생의 자료인지 먼저 확인해주세요.`,
      options: [`${recordName}이 맞습니다`, `${typedName}이 맞습니다`, "이름을 확인한 뒤 다시 업로드할게요"],
    });
  }

  if (!finalized && expectedGrade && form.grade && expectedGrade !== form.grade) {
    questions.push({
      id: "grade_conflict",
      label: "학년 확인",
      question: `학생부 기준 현재 상태 후보는 ${gradeLabel(expectedGrade)}인데, 입력값은 ${gradeLabel(form.grade)}입니다. 어느 쪽을 기준으로 할까요?`,
      options: [`${gradeLabel(expectedGrade)} 기준으로 로드맵 생성`, `${gradeLabel(form.grade)} 기준 유지`, "학년은 유지하되 학생부는 확정 기록으로만 반영"],
    });
  }

  if (!finalized && hasRecords) {
    const recordContextLabel = recordHighlights.length
      ? `‘${recordHighlights.join("’, ‘")}’`
      : subjects.length
        ? `${subjects.join(", ")} 기록`
        : "기존 학생부 기록";
    questions.push({
      id: "record_career_bridge",
      label: "학생부-진로 연결",
      question: `학생부의 ${recordContextLabel}을(를) ${career} 로드맵의 어느 지점에 연결할까요?`,
      options: ["기존 기록을 먼저 살리고 진로로 점진 전환", "기존 기록과 진로를 융합 주제로 연결", "새 진로축을 강하게 세우되 기존 기록은 근거로 활용"],
    });
  }

  if (!finalized && (form.grade === "2" || form.grade === "3")) {
    const remaining = form.grade === "2" ? "2학년 2학기부터 3학년까지" : "남은 3학년 학기";
    questions.push({
      id: "remaining_record_strategy",
      label: "남은 학생부 전략",
      question: `현재 ${gradeLabel(form.grade)}이므로 새로 반영할 수 있는 기간은 ${remaining}입니다. 남은 학생부에서 무엇을 가장 우선할까요?`,
      options: ["기존 기록의 강점을 희망 진로와 연결", "희망 진로의 핵심 역량을 짧은 기간에 집중 보완", "기존 방향과 새 진로를 융합한 대표 탐구 완성", "이미 확정된 기록은 유지하고 입시용 산출물 완성에 집중"],
    });
  }

  if (!finalized) {
    const architectureLabel = form.grade === "2" || form.grade === "3" ? "남은 학기 구조" : "6학기 구조";
    const architectureQuestion = form.grade === "2" || form.grade === "3"
      ? `${gradeLabel(form.grade)}부터 남은 학기를 어떤 순서로 설계할까요?`
      : `${interests}를 6학기 로드맵 안에서 어떤 큰 구조로 펼칠까요?`;
    questions.push({
      id: "roadmap_architecture",
      label: architectureLabel,
      question: architectureQuestion,
      options: ["기초 개념→응용 탐구→심화 산출물", "여러 관심축을 학기별로 고르게 분산", "핵심 1~2개 축을 반복 심화", "기존 학생부 기록과 가까운 축부터 시작"],
    });
  }

  return {
    summary: finalized
      ? "졸업생 학생부는 이미 마감된 확정 기록으로 반영하고, 추가 확인 질문 없이 입력한 진로를 기준으로 정리합니다."
      : hasRecords
      ? "학생부의 기존 기록과 희망 진로를 연결하는 방식이 로드맵 품질을 좌우합니다."
      : "학생부 기록 없이 시작하므로 6학기 전체 성장 구조와 실행 가능성을 먼저 확인합니다.",
    questions: questions.slice(0, 4),
  };
}

function sanitizeQuestions(values: unknown): ClarificationQuestion[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value, index) => {
      if (!value || typeof value !== "object") return null;
      const item = value as Partial<ClarificationQuestion>;
      const options = Array.isArray(item.options)
        ? item.options.filter((option): option is string => typeof option === "string" && option.trim().length > 0).map((option) => option.trim()).slice(0, 4)
        : [];
      if (typeof item.question !== "string" || !item.question.trim() || options.length < 2) return null;
      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `clarify_${index + 1}`,
        label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : "확인 질문",
        question: item.question.trim(),
        options,
      };
    })
    .filter((value): value is ClarificationQuestion => Boolean(value))
    .slice(0, 5);
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as ClarifyRequest;
    const fallback = fallbackClarification(input);
    if (recordIsFinalized(input.schoolRecord, input.form)) {
      return Response.json({
        summary: "업로드한 학생부가 3학년까지 확정된 졸업자 학생부로 확인되었습니다. 이 서비스는 재학생의 남은 학생부 활동을 설계하는 기능이라, 해당 자료로는 로드맵을 진행할 수 없습니다.",
        questions: [],
        blocked: true,
        reason: "graduated_record",
        provider: "fallback",
      });
    }
    const ai = await generateOnboardingClarificationWithDeepSeek(input);
    // 질문의 순서와 내용은 먼저 구조화한 Step1·2/학생부 판단을 따른다.
    // AI가 반환한 임의의 일반 질문으로 핵심 쟁점을 덮어쓰지 않는다.
    const coreQuestions = fallback.questions;
    return Response.json({
      summary: ai?.summary?.trim() || fallback.summary,
      questions: coreQuestions,
      provider: ai?.summary ? "deepseek-guided" : "fallback",
    });
  } catch {
    const fallback = fallbackClarification({});
    return Response.json({ ...fallback, provider: "fallback" });
  }
}
