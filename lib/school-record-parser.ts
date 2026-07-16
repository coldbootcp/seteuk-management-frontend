export type SchoolRecordCategory = "상장" | "대회" | "수행평가" | "보고서" | "독서" | "시험";

// The parser buffers the PDF in memory, so keep this below the Worker memory ceiling.
export const SCHOOL_RECORD_MAX_FILE_SIZE = 50 * 1024 * 1024;
export const SCHOOL_RECORD_MAX_FILE_SIZE_LABEL = "50MB";

export type SchoolRecordCourse = {
  id: string;
  grade: number;
  semester: number;
  subject: string;
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
};

export type SchoolRecordParseResult = {
  fileName: string;
  totalPages: number;
  extractedCharacters: number;
  courses: SchoolRecordCourse[];
  entries: SchoolRecordDraft[];
  warnings: string[];
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
  if (/대회|경진|발표회|공모전/.test(line)) return "대회";
  if (/수행평가|프로젝트|실험평가/.test(line)) return "수행평가";
  if (/독서|도서|읽고|책을/.test(line) || section === "독서") return "독서";
  if (/중간고사|기말고사|정기고사|시험/.test(line)) return "시험";
  if (/보고서|탐구|세부능력|특기사항|발표|조사/.test(line) || section === "세특") return "보고서";
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

function inferredDate(baseYear: number, grade: number, semester: number, category: SchoolRecordCategory) {
  const year = baseYear + grade - 1;
  const monthDays: Record<SchoolRecordCategory, [string, string]> = {
    상장: ["07-12", "12-12"],
    대회: ["05-20", "10-20"],
    수행평가: ["05-28", "11-18"],
    보고서: ["06-18", "11-25"],
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
    대회: "교내외 대회 활동",
    수행평가: `${subject} 수행평가`,
    보고서: `${subject} 세부능력 및 특기사항`,
    독서: `${subject} 독서 활동`,
    시험: `${subject} 시험 기록`,
  };
  return defaults[category];
}

function keyFor(grade: number, semester: number, subject: string, title: string) {
  return `${grade}-${semester}-${subject}-${title.replace(/\s/g, "").slice(0, 30)}`;
}

export function parseSchoolRecordText(
  rawText: string,
  options: { fileName: string; totalPages: number; academicStartYear: number },
): SchoolRecordParseResult {
  const structuredText = rawText
    .replace(/(20\d{2})\s*[.]\s*(\d{1,2})\s*[.]\s*(\d{1,2})\s*[.]?/g, "\n$1-$2-$3 ")
    .replace(/([1-3]\s*학년\s*[1-2]\s*학기)/g, "\n$1\n")
    .replace(/(교과학습발달상황|세부능력 및 특기사항|독서활동상황|수상경력|창의적 체험활동상황|행동특성 및 종합의견)/g, "\n$1\n")
    .replace(/([함됨임음다])\.\s+/g, "$1.\n");
  const lines = structuredText
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line.length >= 2);
  const courses = new Map<string, SchoolRecordCourse>();
  const entries = new Map<string, SchoolRecordDraft>();
  let grade = 1;
  let semester = 1;
  let section = "";

  lines.forEach((line, lineIndex) => {
    const gradeMatch = line.match(/([1-3])\s*학년/);
    const semesterMatch = line.match(/([1-2])\s*학기/);
    if (gradeMatch) grade = Number(gradeMatch[1]);
    if (semesterMatch) semester = Number(semesterMatch[1]);
    if (/^[1-3]\s*학년\s*[1-2]\s*학기$/.test(line)) {
      section = "";
      return;
    }
    if (/수상경력/.test(line)) section = "수상";
    else if (/독서활동상황/.test(line)) section = "독서";
    else if (/세부능력 및 특기사항/.test(line)) section = "세특";
    else if (/창의적 체험활동/.test(line)) section = "창체";
    else if (/교과학습발달상황/.test(line)) section = "교과";
    else if (SECTION_TITLES.test(line)) section = "";

    if (SECTION_TITLES.test(line) && line.length < 35) return;
    const foundSubjects = ["교과", "세특", "독서"].includes(section)
      ? SUBJECTS.filter((subject) => line.includes(subject))
      : [];
    foundSubjects.forEach((subject) => {
      const id = `${grade}-${semester}-${subject}`;
      courses.set(id, { id, grade, semester, subject });
    });

    const category = detectCategory(line, section);
    if (!category) return;
    const subject = detectSubject(line);
    const title = entryTitle(line, category, subject);
    const fallbackYear = options.academicStartYear + grade - 1;
    const documentDate = extractDocumentDate(line, fallbackYear);
    const id = keyFor(grade, semester, subject, title);
    if (entries.has(id)) return;
    entries.set(id, {
      id: `record-${lineIndex}-${id}`,
      selected: true,
      grade,
      semester,
      category,
      subject,
      title,
      summary: line.slice(0, 280),
      completedAt: documentDate ?? inferredDate(options.academicStartYear, grade, semester, category),
      confidence: documentDate ? 92 : subject === "교과 외 활동" ? 58 : 76,
      dateBasis: documentDate ? "document" : "inferred",
    });
  });

  const warnings: string[] = [];
  if (!courses.size) warnings.push("과목명을 충분히 찾지 못했습니다. PDF가 스캔 이미지라면 OCR이 필요할 수 있습니다.");
  if (!entries.size) warnings.push("자동 배치할 활동을 찾지 못했습니다. 텍스트형 PDF인지 확인해주세요.");
  if ([...entries.values()].some((entry) => entry.dateBasis === "inferred")) {
    warnings.push("생기부에 정확한 날짜가 없는 항목은 학기 안의 임시 날짜에 배치했습니다. 반영 전에 수정할 수 있습니다.");
  }

  return {
    fileName: options.fileName,
    totalPages: options.totalPages,
    extractedCharacters: rawText.length,
    // Keep every deduplicated course and activity. The review screen lets the
    // user deselect records before import, so truncating here would silently
    // hide valid school-record evidence.
    courses: [...courses.values()],
    entries: [...entries.values()],
    warnings,
  };
}
