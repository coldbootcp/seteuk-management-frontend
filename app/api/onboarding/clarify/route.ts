import { generateOnboardingClarificationWithDeepSeek } from "../../../../lib/deepseek-provider";

type ClarificationQuestion = {
  id: string;
  label: string;
  question: string;
  why?: string;
  selectionMode?: "single" | "multiple";
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
  roadmapHypothesis?: unknown;
  answers?: Array<{ id?: string; question?: string; answer?: string }>;
};

const AI_JUDGEMENT_OPTION = "잘 모르겠음 — AI 판단에 맡길게요";

function withAiJudgementOption(question: ClarificationQuestion): ClarificationQuestion {
  if (question.options.some((option) => option.includes("잘 모르겠") || option.includes("AI 판단"))) return question;
  return { ...question, options: [...question.options.slice(0, 3), AI_JUDGEMENT_OPTION] };
}

function defaultSelectionMode(question: ClarificationQuestion): ClarificationQuestion {
  if (question.selectionMode) return question;
  return { ...question, selectionMode: /(identity_conflict|grade_conflict|이름 확인|학년 확인)/.test(`${question.id} ${question.label}`) ? "single" : "multiple" };
}

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
      why: "다른 학생의 기록을 근거로 로드맵을 설계하는 오류를 막기 위해서입니다.",
      options: [`${recordName}이 맞습니다`, `${typedName}이 맞습니다`, "이름을 확인한 뒤 다시 업로드할게요"],
    });
  }

  if (!finalized && expectedGrade && form.grade && expectedGrade !== form.grade) {
    questions.push({
      id: "grade_conflict",
      label: "학년 확인",
      question: `학생부 기준 현재 상태 후보는 ${gradeLabel(expectedGrade)}인데, 입력값은 ${gradeLabel(form.grade)}입니다. 어느 쪽을 기준으로 할까요?`,
      why: "남은 학기 수가 바뀌면 각 학기의 활동 난이도와 우선순위가 달라집니다.",
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
      why: "기존 기록을 이어갈지 새 축을 세울지에 따라 첫 대표 활동과 증거의 구성이 달라집니다.",
      options: ["기존 기록을 먼저 살리고 진로로 점진 전환", "기존 기록과 진로를 융합 주제로 연결", "새 진로축을 강하게 세우되 기존 기록은 근거로 활용"],
    });
  }

  return {
    summary: finalized
      ? "졸업생 학생부는 이미 마감된 확정 기록으로 반영하고, 추가 확인 질문 없이 입력한 진로를 기준으로 정리합니다."
      : hasRecords
      ? "학생부의 기존 기록과 희망 진로를 연결하는 방식이 로드맵 품질을 좌우합니다."
      : "학생부 기록 없이 시작하므로 6학기 전체 성장 구조에 영향을 주는 정보만 확인합니다.",
    questions: questions.slice(0, 4),
  };
}

function normalizeQuestion(value: string) {
  return value.toLowerCase().replace(/[^가-힣a-z0-9]/g, "");
}

function isNearDuplicateQuestion(question: string, previous: string) {
  const left = normalizeQuestion(question);
  const right = normalizeQuestion(previous);
  if (!left || !right) return false;
  if (left.includes(right) || right.includes(left)) return true;
  const grams = (value: string) => new Set(Array.from({ length: Math.max(0, value.length - 2) }, (_, index) => value.slice(index, index + 3)));
  const leftGrams = grams(left);
  const rightGrams = grams(right);
  if (!leftGrams.size || !rightGrams.size) return false;
  const overlap = [...leftGrams].filter((gram) => rightGrams.has(gram)).length;
  return overlap / Math.min(leftGrams.size, rightGrams.size) >= 0.62;
}

function mentionsUnsupportedStudentFact(question: string, input: ClarifyRequest) {
  const evidence = [
    ...(input.form?.currentEngagement ?? []),
    ...(input.form?.interests ?? []),
    input.form?.concreteResearchQuestion ?? "",
    ...(input.schoolRecord?.entries ?? []).flatMap((entry) => [entry.title ?? "", entry.summary ?? "", entry.subject ?? ""]),
  ].join(" ").toLowerCase();
  const claims = ["파이썬", "데이터 분석", "동아리"];
  return claims.some((claim) => question.includes(claim) && !evidence.includes(claim));
}

function sanitizeQuestions(values: unknown, input: ClarifyRequest): ClarificationQuestion[] {
  if (!Array.isArray(values)) return [];
  const typedName = input.form?.name?.trim();
  const recordName = input.recordContext?.studentName?.trim();
  const hasIdentityConflict = Boolean(typedName && recordName && typedName !== recordName);
  const expectedGrade = input.recordContext?.expectedGrade;
  const hasGradeConflict = Boolean(expectedGrade && input.form?.grade && expectedGrade !== input.form.grade);
  const hasRecordEntries = Boolean(input.schoolRecord?.entries?.length);
  const priorQuestions = (input.answers ?? []).map((answer) => answer.question).filter((question): question is string => typeof question === "string" && question.trim().length > 0);
  const candidates = values
    .map((value, index) => {
      if (!value || typeof value !== "object") return null;
      const item = value as Partial<ClarificationQuestion>;
      const options = Array.isArray(item.options)
        ? item.options.filter((option): option is string => typeof option === "string" && option.trim().length > 0).map((option) => option.trim()).slice(0, 4)
        : [];
      if (typeof item.question !== "string" || !item.question.trim() || options.length < 2) return null;
      const questionText = `${item.label ?? ""} ${item.question ?? ""}`;
      // 모델이 입력에 없는 학생부 불일치를 만들어내지 않도록, 객관적으로
      // 확인 가능한 충돌 질문은 실제 충돌이 있을 때만 통과시킨다.
      if (!hasIdentityConflict && /(이름|동일 학생)/.test(questionText)) return null;
      if (!hasGradeConflict && /(학생부.*학년|학년.*학생부|기록.*학년)/.test(questionText)) return null;
      if (!hasRecordEntries && /학생부/.test(questionText)) return null;
      if (mentionsUnsupportedStudentFact(questionText, input)) return null;
      if ((input.form?.grade === "2" || input.form?.grade === "3") && /(6학기|전체에.*구조|전체.*구조)/.test(questionText)) return null;
      if (/(관심.*계기|관심을.*갖)/.test(questionText)) return null;
      if ((input.form?.outputPreference?.length || input.form?.collaborationStyle?.length) && /(활동.*선호|어떤 유형.*선호)/.test(questionText)) return null;
      if (/(주\s*[0-9]+\s*시간|[0-9]+\s*시간.*투자|시간.*투자|현실적.*가능|가능.*생각|프로젝트.*완료)/.test(questionText)) return null;
      if (priorQuestions.some((previous) => isNearDuplicateQuestion(item.question!.trim(), previous))) return null;
      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `clarify_${index + 1}`,
        label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : "확인 질문",
        question: item.question.trim(),
        why: typeof item.why === "string" && item.why.trim() ? item.why.trim() : "이 답에 따라 로드맵의 학기별 전략과 대표 활동이 달라질 수 있습니다.",
        selectionMode: item.selectionMode === "single" || item.selectionMode === "multiple" ? item.selectionMode : undefined,
        options,
      };
    })
    .filter((value): value is ClarificationQuestion => Boolean(value))
    .slice(0, 5);

  return candidates
    .filter((question, index) => !candidates.slice(0, index).some((previous) => isNearDuplicateQuestion(question.question, previous.question)))
    .map(withAiJudgementOption)
    .map(defaultSelectionMode);
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
    const answeredIds = new Set((input.answers ?? []).map((answer) => answer.id).filter((id): id is string => typeof id === "string" && id.length > 0));
    const ai = await generateOnboardingClarificationWithDeepSeek(input);
    const aiQuestions = sanitizeQuestions(ai?.questions, input).filter((question) => !answeredIds.has(question.id));
    const remainingFallbackQuestions = fallback.questions.filter((question) => !answeredIds.has(question.id)).map(withAiJudgementOption).map(defaultSelectionMode);
    const questions = aiQuestions.length ? aiQuestions : remainingFallbackQuestions;
    const complete = questions.length === 0 && (ai?.complete === true || remainingFallbackQuestions.length === 0);
    return Response.json({
      summary: ai?.summary?.trim() || fallback.summary,
      questions,
      complete,
      draftChangeSummary: ai?.draftChangeSummary?.trim() || "",
      provider: ai?.summary ? "deepseek-guided" : "fallback",
    });
  } catch {
    const fallback = fallbackClarification({});
    return Response.json({ ...fallback, questions: fallback.questions.map(withAiJudgementOption).map(defaultSelectionMode), provider: "fallback" });
  }
}
