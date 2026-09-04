export type SchoolRecordCategory = "상장" | "활동" | "봉사" | "독서" | "시험";

// The parser buffers the PDF in memory, so keep this below the Worker memory ceiling.
export const SCHOOL_RECORD_MAX_FILE_SIZE = 50 * 1024 * 1024;
export const SCHOOL_RECORD_MAX_FILE_SIZE_LABEL = "50MB";

export type SchoolRecordCourse = {
  id: string;
  grade: number;
  semester: number;
  subject: string;
  rank?: number | null;
};

export type SchoolRecordDraft = {
  id: string;
  selected: boolean;
  grade: number;
  semester: number;
  category: SchoolRecordCategory;
  subject: string;
  title: string;
  summary: string;
  completedAt: string;
  confidence: number;
  dateBasis: "document" | "inferred";
  /** 학기를 문서에서 읽었는지, 아니면 학생이 정해 줘야 하는지. */
  periodBasis: "document" | "unknown";
};

export type SchoolRecordParseResult = {
  fileName: string;
  totalPages: number;
  extractedCharacters: number;
  courses: SchoolRecordCourse[];
  entries: SchoolRecordDraft[];
  warnings: string[];
};

export type SchoolRecordPeriod = {
  grade: number;
  semester: number;
};

type SeteukReadingActivity = {
  author?: unknown;
  grade?: unknown;
  rank?: unknown;
  semester?: unknown;
  subject?: unknown;
  title?: unknown;
};

type SeteukAcademicPerformance = {
  achievement?: unknown;
  category?: unknown;
  grade?: unknown;
  rank?: unknown;
  semester?: unknown;
  subject?: unknown;
  units?: unknown;
};

type SeteukAward = {
  date?: unknown;
  grade?: unknown;
  name?: unknown;
  rank?: unknown;
  semester?: unknown;
};

type SeteukVolunteerRecord = {
  content?: unknown;
  date?: unknown;
  grade?: unknown;
  hours?: unknown;
  place?: unknown;
  semester?: unknown;
};

type SeteukActivity = {
  activity_category?: unknown;
  activity_name?: unknown;
  description?: unknown;
  grade?: unknown;
  keywords?: unknown;
  semester?: unknown;
  subject?: unknown;
};

export type SeteukAnalysisResult = {
  academic_performance?: SeteukAcademicPerformance[];
  activities?: SeteukActivity[];
  attendance?: unknown[];
  awards?: SeteukAward[];
  errors?: unknown[];
  reading_activities?: SeteukReadingActivity[];
  student_name?: unknown;
  time_logs?: unknown[];
  volunteer_records?: SeteukVolunteerRecord[];
};

const SUBJECTS = [
  "통합과학", "과학탐구실험", "물리학Ⅱ", "물리학Ⅰ", "물리학", "화학Ⅱ", "화학Ⅰ", "화학",
  "생명과학Ⅱ", "생명과학Ⅰ", "생명과학", "지구과학Ⅱ", "지구과학Ⅰ", "지구과학",
  "공통수학", "기본수학", "수학과제 탐구", "미적분", "확률과 통계", "기하", "수학Ⅰ", "수학Ⅱ", "수학",
  "공통국어", "화법과 작문", "독서와 작문", "문학", "독서", "국어",
  "공통영어", "영어 독해와 작문", "영어Ⅰ", "영어Ⅱ", "영어",
  "통합사회", "한국사", "사회문화", "생활과 윤리", "정치와 법", "경제", "사회",
  "정보", "기술·가정", "기술가정", "진로와 직업", "융합과학 탐구", "사회문제 탐구",
];

const SECTION_TITLES = /인적사항|학적사항|출결상황|수상경력|자격증|진로희망|창의적 체험활동|교과학습발달상황|세부능력 및 특기사항|독서활동상황|행동특성 및 종합의견/;

function cleanLine(value: string) {
  return value.replace(/\u0000/g, "").replace(/[\t ]+/g, " ").trim();
}

function detectSubject(line: string) {
  return SUBJECTS.find((subject) => line.includes(subject)) ?? "교과 외 활동";
}

function detectCategory(line: string, section: string): SchoolRecordCategory | null {
  if (/수상|상장|우수상|표창/.test(line) || section === "수상") return "상장";
  if (/봉사/.test(line)) return "봉사";
  if (/독서|도서|읽고|책을/.test(line) || section === "독서") return "독서";
  if (/중간고사|기말고사|정기고사|시험/.test(line)) return "시험";
  if (/대회|경진|발표회|공모전|수행평가|프로젝트|실험평가|보고서|탐구|세부능력|특기사항|발표|조사/.test(line) || section === "세특") return "활동";
  return null;
}

function extractDocumentDate(line: string, fallbackYear: number) {
  const match = line.match(/(?:(20\d{2})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?:\s*일)?/);
  if (!match) return null;
  const year = Number(match[1] ?? fallbackYear);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseApiDate(value: unknown) {
  const source = textValue(value);
  if (!source) return null;
  const match = source.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?:\s*일)?/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function periodFromDate(date: string, academicStartYear: number): SchoolRecordPeriod {
  const [yearText, monthText] = date.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const schoolYearStart = month <= 2 ? year - 1 : year;
  const grade = Math.min(3, Math.max(1, schoolYearStart - academicStartYear + 1));
  const semester = month >= 3 && month <= 8 ? 1 : 2;
  return { grade, semester };
}

function inferredDate(baseYear: number, grade: number, semester: number, category: SchoolRecordCategory) {
  const year = baseYear + grade - 1;
  const monthDays: Record<SchoolRecordCategory, [string, string]> = {
    상장: ["07-12", "12-12"],
    활동: ["06-18", "11-25"],
    봉사: ["05-10", "10-15"],
    독서: ["04-18", "09-24"],
    시험: ["07-05", "12-06"],
  };
  return `${year}-${monthDays[category][semester === 1 ? 0 : 1]}`;
}

function entryTitle(line: string, category: SchoolRecordCategory, subject: string) {
  const withoutDate = line.replace(/(?:(?:20\d{2})\s*[.\-/년]\s*)?\d{1,2}\s*[.\-/월]\s*\d{1,2}(?:\s*일)?/g, "");
  const withoutSubject = withoutDate.replace(subject, "").replace(/^\s*[:：·\-]\s*/, "").trim();
  const compact = withoutSubject.replace(/\s+/g, " ");
  if (compact.length >= 4 && !SECTION_TITLES.test(compact)) return compact.slice(0, 56);
  const defaults: Record<SchoolRecordCategory, string> = {
    상장: "수상 기록",
    활동: `${subject} 활동 기록`,
    봉사: "봉사활동 기록",
    독서: `${subject} 독서 활동`,
    시험: `${subject} 시험 기록`,
  };
  return defaults[category];
}

function keyFor(grade: number, semester: number, subject: string, title: string) {
  return `${grade}-${semester}-${subject}-${title.replace(/\s/g, "").slice(0, 30)}`;
}

function textValue(value: unknown, fallback = "") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function gradeValue(value: unknown) {
  const grade = Number(value);
  return Number.isInteger(grade) && grade >= 1 && grade <= 3 ? grade : 1;
}

function semesterValue(value: unknown) {
  const semester = Number(value);
  // 모를 때 2학기로 단정하던 것을 1학기로 바꿨다. 어느 쪽이든 추측이지만, 학생이
  // 고칠 대상이라는 사실은 periodBasis로 따로 알린다 — 예전에는 확신 있는 오답이
  // 조용히 들어갔다.
  return semester === 1 || semester === 2 ? semester : 1;
}

/** 문서가 학기를 말해 주지 않았는지. 검토 화면이 학생에게 물어야 할 항목을 가른다. */
function periodIsKnown(value: unknown) {
  const semester = Number(value);
  return semester === 1 || semester === 2;
}

function apiActivityCategory(item: SeteukActivity): SchoolRecordCategory {
  const source = [
    textValue(item.activity_category),
    textValue(item.activity_name),
    textValue(item.description),
    Array.isArray(item.keywords) ? item.keywords.filter((value): value is string => typeof value === "string").join(" ") : "",
  ].join(" ");
  if (/수상|상장|우수상|표창/.test(source)) return "상장";
  if (/봉사/.test(source)) return "봉사";
  if (/독서|도서|책을|읽고/.test(source)) return "독서";
  if (/시험|중간고사|기말고사/.test(source)) return "시험";
  return "활동";
}

function isSeteukAnalysisResult(value: unknown): value is SeteukAnalysisResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as SeteukAnalysisResult;
  return ["academic_performance", "activities", "awards", "reading_activities", "volunteer_records"].some((key) =>
    Array.isArray(candidate[key as keyof SeteukAnalysisResult]),
  );
}

// 생기부 파싱은 백엔드 Python 하이브리드 파서 하나로 통일했다(T-1). 여기 있던
// TypeScript 파서 parseSchoolRecordText는 그래서 제거했다 — 원본은
// docs/reference/school-record-parser.ts와 main 히스토리에 있다.

export function parseSchoolRecordJson(
  jsonData: unknown,
  academicStartYear: number
): SchoolRecordParseResult {
  const courses = new Map<string, SchoolRecordCourse>();
  const entries = new Map<string, SchoolRecordDraft>();
  const warnings: string[] = [];

  const result: SeteukAnalysisResult = isSeteukAnalysisResult(jsonData)
    ? jsonData
    : Array.isArray(jsonData)
      ? { reading_activities: jsonData, academic_performance: jsonData, activities: jsonData }
      : {};

  (result.reading_activities ?? []).forEach((item, index) => {
    const title = textValue(item.title);
    const author = textValue(item.author);
    if (title && author) {
      const grade = gradeValue(item.grade);
      const semester = semesterValue(item.semester);
      const subject = textValue(item.subject, "독서");

      const id = `${grade}-${semester}-${subject}`;
      const parsedRank = Number.parseInt(textValue(item.rank), 10);
      const rank = Number.isInteger(parsedRank) && parsedRank >= 1 && parsedRank <= 5 ? parsedRank : null;
      const existingCourse = courses.get(id);
      if (!existingCourse) {
        courses.set(id, { id, grade, semester, subject, rank });
      } else if (rank !== null) {
        courses.set(id, { ...existingCourse, rank });
      }

      const entryId = keyFor(grade, semester, subject, title);
      if (!entries.has(entryId)) {
        entries.set(entryId, {
          id: `json-read-${index}-${entryId}`,
          selected: true,
          grade,
          semester,
          category: "독서",
          subject,
          title: `${title} (${author})`,
          summary: `${author} 저. ${subject} 관련 독서 활동.`,
          completedAt: inferredDate(academicStartYear, grade, semester, "독서"),
          confidence: 100,
          dateBasis: "inferred",
          periodBasis: "document",
        });
      }
    }
  });

  (result.academic_performance ?? []).forEach((item, index) => {
    const achievement = textValue(item.achievement);
    if (achievement) {
      const grade = gradeValue(item.grade);
      const semester = semesterValue(item.semester);
      const subject = textValue(item.subject, "공통");

      const id = `${grade}-${semester}-${subject}`;
      if (!courses.has(id)) {
        courses.set(id, { id, grade, semester, subject });
      }

      const title = `${subject} 학기말 성적`;
      const entryId = keyFor(grade, semester, subject, title);
      const rank = textValue(item.rank);
      const units = textValue(item.units, "-");
      const summary = `성취도: ${achievement}, 석차등급: ${rank ? `${rank}등급` : "석차없음"}, 단위: ${units}`;

      if (!entries.has(entryId)) {
        entries.set(entryId, {
          id: `json-grade-${index}-${entryId}`,
          selected: true,
          grade,
          semester,
          category: "시험",
          subject,
          title,
          summary,
          completedAt: inferredDate(academicStartYear, grade, semester, "시험"),
          confidence: 100,
          dateBasis: "inferred",
          periodBasis: "document",
        });
      }
    }
  });

  (result.awards ?? []).forEach((item, index) => {
    const name = textValue(item.name);
    if (!name) return;

    const rank = textValue(item.rank);
    const parsedDate = parseApiDate(item.date);
    const inferredPeriod = parsedDate ? periodFromDate(parsedDate, academicStartYear) : null;
    const grade = gradeValue(item.grade ?? inferredPeriod?.grade);
    const semester = semesterValue(item.semester ?? inferredPeriod?.semester);
    const subject = "수상경력";
    const title = rank ? `${name} · ${rank}` : name;
    const entryId = keyFor(grade, semester, subject, title);
    if (entries.has(entryId)) return;

    entries.set(entryId, {
      id: `json-award-${index}-${entryId}`,
      selected: true,
      grade,
      semester,
      category: "상장",
      subject,
      title,
      summary: rank ? `${name}에서 ${rank}을 수상했습니다.` : `${name} 수상 기록입니다.`,
      completedAt: parsedDate ?? inferredDate(academicStartYear, grade, semester, "상장"),
      confidence: parsedDate ? 100 : 86,
      dateBasis: parsedDate ? "document" : "inferred",
      periodBasis: "document",
    });
  });

  (result.volunteer_records ?? []).forEach((item, index) => {
    const content = textValue(item.content);
    const place = textValue(item.place);
    if (!content && !place) return;

    const parsedDate = parseApiDate(item.date);
    const inferredPeriod = parsedDate ? periodFromDate(parsedDate, academicStartYear) : null;
    const grade = gradeValue(item.grade ?? inferredPeriod?.grade);
    const semester = semesterValue(item.semester ?? inferredPeriod?.semester);
    const hours = textValue(item.hours);
    const title = content || "봉사활동";
    const summary = [
      place && `장소: ${place}`,
      content && `내용: ${content}`,
      hours && `시간: ${hours}시간`,
    ].filter(Boolean).join(" · ");
    const subject = "봉사활동";
    const entryId = keyFor(grade, semester, subject, `${title}-${parsedDate ?? index}`);
    if (entries.has(entryId)) return;

    entries.set(entryId, {
      id: `json-volunteer-${index}-${entryId}`,
      selected: true,
      grade,
      semester,
      category: "봉사",
      subject,
      title,
      summary: summary || "봉사활동 기록입니다.",
      completedAt: parsedDate ?? inferredDate(academicStartYear, grade, semester, "봉사"),
      confidence: parsedDate ? 100 : 86,
      dateBasis: parsedDate ? "document" : "inferred",
      periodBasis: "document",
    });
  });

  (result.activities ?? []).forEach((item, index) => {
    const title = textValue(item.activity_name);
    const summary = textValue(item.description);
    // 설명이 없다고 버리지 않는다 — 모델이 description을 빠뜨린 항목도 이름은
    // 멀쩡하고, 여기서 버리면 학생이 존재조차 모른 채 사라진다.
    if (!title) return;
    const grade = gradeValue(item.grade);
    const semester = semesterValue(item.semester);
    const periodKnown = periodIsKnown(item.semester);
    const category = apiActivityCategory(item);
    const sourceCategory = textValue(item.activity_category, "교과 외 활동");
    const subject = textValue(item.subject, sourceCategory);
    const entryId = keyFor(grade, semester, subject, title);
    if (entries.has(entryId)) return;
    entries.set(entryId, {
      id: `json-activity-${index}-${entryId}`,
      selected: true,
      grade,
      semester,
      category,
      subject,
      title,
      summary,
      completedAt: inferredDate(academicStartYear, grade, semester, category),
      confidence: periodKnown ? 96 : 60,
      dateBasis: "inferred",
      periodBasis: periodKnown ? "document" : "unknown",
    });
  });

  courses.forEach((course, index) => {
    const title = `${course.subject} 교과 기록 확인`;
    const entryId = keyFor(course.grade, course.semester, course.subject, title);
    if (entries.has(entryId) || [...entries.values()].some((entry) =>
      entry.category === "시험" && entry.grade === course.grade && entry.semester === course.semester && entry.subject === course.subject,
    )) return;
    entries.set(entryId, {
      id: `json-course-${index}-${entryId}`,
      selected: true,
      grade: course.grade,
      semester: course.semester,
      category: "시험",
      subject: course.subject,
      title,
      summary: "성취도 세부값은 확인되지 않았지만, 학생부에서 교과 기록이 인식되었습니다. 반영 전 실제 성적 정보로 보완할 수 있습니다.",
      completedAt: inferredDate(academicStartYear, course.grade, course.semester, "시험"),
      confidence: 62,
      dateBasis: "inferred",
      periodBasis: "document",
    });
  });

  const upstreamErrors = Array.isArray(result.errors) ? result.errors.filter(Boolean) : [];
  if (upstreamErrors.length) {
    warnings.push(`분석 과정에서 확인이 필요한 항목이 ${upstreamErrors.length}개 있습니다.`);
  }
  if (!courses.size) warnings.push("교과 성적 또는 독서 과목을 찾지 못했습니다.");
  if (!entries.size) warnings.push("분석 결과에서 반영 가능한 학생부 활동을 찾지 못했습니다.");
  if (entries.size) warnings.push("학생부 API는 활동의 정확한 날짜를 제공하지 않아 학기 안의 임시 날짜에 배치했습니다. 반영 전에 수정할 수 있습니다.");
  // 생기부의 세특은 과목당 한 덩어리로 쓰여 있어 어느 활동이 몇 학기인지 문서가
  // 말해 주지 않는다. 예전에는 조용히 2학기로 정해 버렸는데, 그러면 학생이 고칠
  // 대상이 있다는 것조차 모른다.
  const unknownPeriod = [...entries.values()].filter((e) => e.periodBasis === "unknown").length;
  if (unknownPeriod) {
    warnings.push(
      `생활기록부가 학기를 밝히지 않은 활동이 ${unknownPeriod}개 있습니다. 1학기로 두었으니 반영 전에 확인해주세요.`,
    );
  }

  return {
    fileName: "structured_data.json",
    totalPages: 0,
    extractedCharacters: JSON.stringify(jsonData).length,
    courses: [...courses.values()],
    entries: [...entries.values()],
    warnings,
  };
}

export function getLatestSchoolRecordPeriod(
  parsed: Pick<SchoolRecordParseResult, "courses" | "entries">
): SchoolRecordPeriod | null {
  const periods = [
    ...parsed.courses.map((course) => ({ grade: course.grade, semester: course.semester })),
    ...parsed.entries.map((entry) => ({ grade: entry.grade, semester: entry.semester })),
  ].filter((period) =>
    [1, 2, 3].includes(period.grade) && [1, 2].includes(period.semester),
  );

  if (!periods.length) return null;

  return periods.reduce((latest, period) => {
    const latestIndex = (latest.grade - 1) * 2 + latest.semester;
    const periodIndex = (period.grade - 1) * 2 + period.semester;
    return periodIndex > latestIndex ? period : latest;
  });
}
