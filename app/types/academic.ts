export type HighSchoolCourseCategory = "공통" | "일반선택" | "진로선택" | "융합선택" | "교양/기타";

export type SubjectGroup = "국어" | "수학" | "영어" | "과학" | "사회" | "기술가정/정보" | "체육/예술" | "기타";

export interface PresetCourse {
  code: string;
  name: string;
  group: SubjectGroup;
  category: HighSchoolCourseCategory;
  defaultUnits: number;
  description?: string;
  /** 이 과목이 있는 교육과정. 비어 있으면 2015·2022 개정 모두 같은 이름으로 있다. */
  curriculum?: Curriculum;
}

export interface TimetableSlot {
  id: string;
  courseName: string;
  /** 백엔드 과목 카탈로그 코드(예: "2022:대수"). "기타"로 직접 적은 과목과 예전 칸은 비어 있다. */
  subjectCode?: string;
  teacher?: string;
  room?: string;
  day: number; // 0: 월, 1: 화, 2: 수, 3: 목, 4: 금
  startPeriod: number; // 1 ~ 7교시
  periodSpan: number; // 연속 교시 수 (기본 1)
  category: HighSchoolCourseCategory;
  group: SubjectGroup;
  colorIndex: number;
  units: number;
  isCareerRelated: boolean; // 진로 연계 교과 여부
}

export interface TimetableConfig {
  id: string;
  name: string;
  grade: number;
  semester: number;
  isDefault: boolean;
  slots: TimetableSlot[];
  updatedAt: string;
}

export interface HighSchoolGradeItem {
  id: string;
  courseName: string;
  category: HighSchoolCourseCategory;
  group: SubjectGroup;
  units: number;
  rank: number | null; // 1~9등급 (또는 5등급제)
  achievement: "A" | "B" | "C" | "D" | "E" | "P" | null;
  rawScore: number | null; // 원점수
  subjectAverage: number | null; // 과목평균
  stdDev: number | null; // 표준편차
  isCareerRelated: boolean; // 진로교과(전공 관련) 여부
  seteukCount: number; // 연계된 세특 활동 건수
  note?: string;
}

export interface SemesterGradeData {
  grade: number;
  semester: number;
  items: HighSchoolGradeItem[];
}

/**
 * 학생이 적용받는 교육과정. 2025학년도 고1(입학생)부터 2022 개정 교육과정이고, 그 전
 * 입학생은 2015 개정이다. 어느 교육과정인지는 백엔드가 입학 학년도로 정하고, 시간표·
 * 수강 과목의 과목 목록과 학기별 예시도 백엔드 카탈로그(`lib/subjects-api.ts`)에서 온다.
 */
export type Curriculum = "2015" | "2022";

/**
 * 성적 화면이 과목명으로 교과 구분을 짐작할 때 쓰는 옛 과목 표(lib/academic-records-api.ts).
 * 시간표·수강 과목 선택은 더 이상 이 표를 쓰지 않는다 — 전체 과목은 백엔드 카탈로그에 있다.
 * 개설 과목 목록. curriculum이 없는 과목은 두 교육과정에 같은 이름으로 있다.
 * 출처: 2022 개정 교육과정 고등학교 보통교과 편제(교육부 고시, 고교학점제 지원센터 과목 소개).
 */
export const SUBJECT_PRESETS: PresetCourse[] = [
  // ── 2022 개정: 공통과목(1학년, 1·2로 나뉘어 학기마다 하나씩)
  { code: "K22-C1", name: "공통국어1", group: "국어", category: "공통", defaultUnits: 4, curriculum: "2022" },
  { code: "K22-C2", name: "공통국어2", group: "국어", category: "공통", defaultUnits: 4, curriculum: "2022" },
  { code: "M22-C1", name: "공통수학1", group: "수학", category: "공통", defaultUnits: 4, curriculum: "2022" },
  { code: "M22-C2", name: "공통수학2", group: "수학", category: "공통", defaultUnits: 4, curriculum: "2022" },
  { code: "E22-C1", name: "공통영어1", group: "영어", category: "공통", defaultUnits: 4, curriculum: "2022" },
  { code: "E22-C2", name: "공통영어2", group: "영어", category: "공통", defaultUnits: 4, curriculum: "2022" },
  { code: "S22-C1", name: "통합사회1", group: "사회", category: "공통", defaultUnits: 4, curriculum: "2022" },
  { code: "S22-C2", name: "통합사회2", group: "사회", category: "공통", defaultUnits: 4, curriculum: "2022" },
  { code: "H22-C1", name: "한국사1", group: "사회", category: "공통", defaultUnits: 3, curriculum: "2022" },
  { code: "H22-C2", name: "한국사2", group: "사회", category: "공통", defaultUnits: 3, curriculum: "2022" },
  { code: "P22-C1", name: "통합과학1", group: "과학", category: "공통", defaultUnits: 4, curriculum: "2022" },
  { code: "P22-C2", name: "통합과학2", group: "과학", category: "공통", defaultUnits: 4, curriculum: "2022" },
  { code: "P22-L1", name: "과학탐구실험1", group: "과학", category: "공통", defaultUnits: 1, curriculum: "2022" },
  { code: "P22-L2", name: "과학탐구실험2", group: "과학", category: "공통", defaultUnits: 1, curriculum: "2022" },
  // ── 2022 개정: 국어
  { code: "K22-G1", name: "화법과 언어", group: "국어", category: "일반선택", defaultUnits: 4, curriculum: "2022" },
  { code: "K22-G2", name: "독서와 작문", group: "국어", category: "일반선택", defaultUnits: 4, curriculum: "2022" },
  { code: "K22-R1", name: "주제 탐구 독서", group: "국어", category: "진로선택", defaultUnits: 4, curriculum: "2022" },
  { code: "K22-R2", name: "문학과 영상", group: "국어", category: "진로선택", defaultUnits: 4, curriculum: "2022" },
  { code: "K22-F1", name: "독서 토론과 글쓰기", group: "국어", category: "융합선택", defaultUnits: 4, curriculum: "2022" },
  // ── 2022 개정: 수학
  { code: "M22-G1", name: "대수", group: "수학", category: "일반선택", defaultUnits: 4, curriculum: "2022", description: "지수함수와 로그함수, 삼각함수, 수열" },
  { code: "M22-G2", name: "미적분Ⅰ", group: "수학", category: "일반선택", defaultUnits: 4, curriculum: "2022", description: "함수의 극한과 연속, 미분, 적분" },
  { code: "M22-R1", name: "미적분Ⅱ", group: "수학", category: "진로선택", defaultUnits: 4, curriculum: "2022", description: "수열의 극한, 여러 가지 미분법·적분법" },
  { code: "M22-R2", name: "경제 수학", group: "수학", category: "진로선택", defaultUnits: 4, curriculum: "2022" },
  { code: "M22-F1", name: "실용 통계", group: "수학", category: "융합선택", defaultUnits: 4, curriculum: "2022" },
  { code: "M22-F2", name: "수학과제 탐구", group: "수학", category: "융합선택", defaultUnits: 4, curriculum: "2022" },
  // ── 2022 개정: 영어
  { code: "E22-G1", name: "영어Ⅱ", group: "영어", category: "일반선택", defaultUnits: 4 },
  { code: "E22-R1", name: "영어 발표와 토론", group: "영어", category: "진로선택", defaultUnits: 4, curriculum: "2022" },
  { code: "E22-R2", name: "심화 영어", group: "영어", category: "진로선택", defaultUnits: 4, curriculum: "2022" },
  // ── 2022 개정: 사회
  { code: "S22-G1", name: "사회와 문화", group: "사회", category: "일반선택", defaultUnits: 4, curriculum: "2022" },
  { code: "S22-G2", name: "세계시민과 지리", group: "사회", category: "일반선택", defaultUnits: 4, curriculum: "2022" },
  { code: "S22-G3", name: "현대사회와 윤리", group: "사회", category: "일반선택", defaultUnits: 4, curriculum: "2022" },
  { code: "S22-R1", name: "경제", group: "사회", category: "진로선택", defaultUnits: 4 },
  { code: "S22-R2", name: "정치", group: "사회", category: "진로선택", defaultUnits: 4, curriculum: "2022" },
  { code: "S22-F1", name: "사회문제 탐구", group: "사회", category: "융합선택", defaultUnits: 4 },
  // ── 2022 개정: 과학
  { code: "P22-G1", name: "물리학", group: "과학", category: "일반선택", defaultUnits: 4, curriculum: "2022" },
  { code: "P22-G2", name: "화학", group: "과학", category: "일반선택", defaultUnits: 4, curriculum: "2022" },
  { code: "P22-G3", name: "생명과학", group: "과학", category: "일반선택", defaultUnits: 4, curriculum: "2022" },
  { code: "P22-G4", name: "지구과학", group: "과학", category: "일반선택", defaultUnits: 4, curriculum: "2022" },
  { code: "P22-R1", name: "역학과 에너지", group: "과학", category: "진로선택", defaultUnits: 4, curriculum: "2022" },
  { code: "P22-R2", name: "전자기와 양자", group: "과학", category: "진로선택", defaultUnits: 4, curriculum: "2022" },
  { code: "P22-R3", name: "물질과 에너지", group: "과학", category: "진로선택", defaultUnits: 4, curriculum: "2022" },
  { code: "P22-R4", name: "화학 반응의 세계", group: "과학", category: "진로선택", defaultUnits: 4, curriculum: "2022" },
  { code: "P22-R5", name: "세포와 물질대사", group: "과학", category: "진로선택", defaultUnits: 4, curriculum: "2022" },
  { code: "P22-R6", name: "생물의 유전", group: "과학", category: "진로선택", defaultUnits: 4, curriculum: "2022" },
  { code: "P22-R7", name: "지구시스템과학", group: "과학", category: "진로선택", defaultUnits: 4, curriculum: "2022" },
  { code: "P22-R8", name: "행성우주과학", group: "과학", category: "진로선택", defaultUnits: 4, curriculum: "2022" },
  { code: "P22-F1", name: "융합과학 탐구", group: "과학", category: "융합선택", defaultUnits: 4, curriculum: "2022" },
  { code: "P22-F2", name: "기후변화와 환경생태", group: "과학", category: "융합선택", defaultUnits: 4, curriculum: "2022" },
  // ── 2022 개정: 정보
  { code: "I22-R1", name: "인공지능 기초", group: "기술가정/정보", category: "진로선택", defaultUnits: 4, curriculum: "2022" },
  { code: "I22-R2", name: "데이터 과학", group: "기술가정/정보", category: "진로선택", defaultUnits: 4, curriculum: "2022" },
  { code: "I22-F1", name: "소프트웨어와 생활", group: "기술가정/정보", category: "융합선택", defaultUnits: 4, curriculum: "2022" },

  // ── 2015 개정
  { code: "SCI-01", name: "통합과학", group: "과학", category: "공통", defaultUnits: 4, curriculum: "2015" },
  { code: "SCI-02", name: "과학탐구실험", group: "과학", category: "공통", defaultUnits: 2, curriculum: "2015" },
  { code: "SCI-03", name: "물리학Ⅰ", group: "과학", category: "일반선택", defaultUnits: 4, curriculum: "2015", description: "역학과 에너지, 물질과 전자기장, 파동" },
  { code: "SCI-04", name: "물리학Ⅱ", group: "과학", category: "진로선택", defaultUnits: 4, curriculum: "2015", description: "역학적 상호작용, 전자기장, 양자" },
  { code: "SCI-05", name: "화학Ⅰ", group: "과학", category: "일반선택", defaultUnits: 4, curriculum: "2015", description: "화학의 첫걸음, 원자의 세계, 화학 결합" },
  { code: "SCI-06", name: "화학Ⅱ", group: "과학", category: "진로선택", defaultUnits: 4, curriculum: "2015", description: "물질의 상태, 화학 반응의 엔탈피와 평형" },
  { code: "SCI-07", name: "생명과학Ⅰ", group: "과학", category: "일반선택", defaultUnits: 4, curriculum: "2015" },
  { code: "SCI-09", name: "생명과학Ⅱ", group: "과학", category: "진로선택", defaultUnits: 4, curriculum: "2015" },
  { code: "SCI-08", name: "지구과학Ⅰ", group: "과학", category: "일반선택", defaultUnits: 4, curriculum: "2015" },
  { code: "MAT-00", name: "수학", group: "수학", category: "공통", defaultUnits: 4, curriculum: "2015" },
  { code: "MAT-02", name: "수학Ⅰ", group: "수학", category: "일반선택", defaultUnits: 4, curriculum: "2015", description: "지수함수와 로그함수, 삼각함수, 수열" },
  { code: "MAT-03", name: "수학Ⅱ", group: "수학", category: "일반선택", defaultUnits: 4, curriculum: "2015", description: "함수의 극한과 연속, 미분, 적분" },
  { code: "MAT-04", name: "미적분", group: "수학", category: "일반선택", defaultUnits: 4, curriculum: "2015", description: "수열의 극한, 미분법, 적분법" },
  { code: "MAT-05", name: "확률과 통계", group: "수학", category: "일반선택", defaultUnits: 4 },
  { code: "MAT-06", name: "기하", group: "수학", category: "진로선택", defaultUnits: 4, description: "이차곡선, 평면벡터, 공간도형과 공간좌표" },
  { code: "MAT-07", name: "인공지능 수학", group: "수학", category: "진로선택", defaultUnits: 3 },
  { code: "INF-01", name: "정보", group: "기술가정/정보", category: "일반선택", defaultUnits: 4, description: "정보과학, 알고리즘, 프로그래밍" },
  { code: "INF-02", name: "프로그래밍", group: "기술가정/정보", category: "진로선택", defaultUnits: 4, curriculum: "2015", description: "파이썬 기초 및 데이터 구조" },
  { code: "KOR-00", name: "국어", group: "국어", category: "공통", defaultUnits: 4, curriculum: "2015" },
  { code: "KOR-02", name: "문학", group: "국어", category: "일반선택", defaultUnits: 4 },
  { code: "KOR-03", name: "독서", group: "국어", category: "일반선택", defaultUnits: 4, curriculum: "2015" },
  { code: "KOR-04", name: "언어와 매체", group: "국어", category: "일반선택", defaultUnits: 4, curriculum: "2015" },
  { code: "KOR-05", name: "화법과 작문", group: "국어", category: "일반선택", defaultUnits: 4, curriculum: "2015" },
  { code: "ENG-00", name: "영어", group: "영어", category: "공통", defaultUnits: 4, curriculum: "2015" },
  { code: "ENG-02", name: "영어Ⅰ", group: "영어", category: "일반선택", defaultUnits: 4 },
  { code: "ENG-03", name: "영어 독해와 작문", group: "영어", category: "일반선택", defaultUnits: 4 },
  { code: "SOC-01", name: "통합사회", group: "사회", category: "공통", defaultUnits: 4, curriculum: "2015" },
  { code: "SOC-02", name: "한국사", group: "사회", category: "공통", defaultUnits: 3, curriculum: "2015" },
  { code: "SOC-03", name: "사회·문화", group: "사회", category: "일반선택", defaultUnits: 4, curriculum: "2015" },
  // ── 두 교육과정 공통
  { code: "ETC-01", name: "운동과 건강", group: "체육/예술", category: "일반선택", defaultUnits: 2 },
  { code: "ETC-02", name: "음악/미술", group: "체육/예술", category: "일반선택", defaultUnits: 2 },
];

export const PERIOD_TIMES = [
  { period: 1, time: "09:00 - 09:50", hourLabel: "오전 9시" },
  { period: 2, time: "10:00 - 10:50", hourLabel: "오전 10시" },
  { period: 3, time: "11:00 - 11:50", hourLabel: "오전 11시" },
  { period: 4, time: "12:00 - 12:50", hourLabel: "오후 12시" },
  { period: 5, time: "13:50 - 14:40", hourLabel: "오후 1시" },
  { period: 6, time: "14:50 - 15:40", hourLabel: "오후 2시" },
  { period: 7, time: "15:50 - 16:40", hourLabel: "오후 3시" },
];

export const DAYS_KR = ["월", "화", "수", "목", "금"];

export const PALETTE_COLORS = [
  { bg: "#e2eefb", border: "#d0e2f7", text: "#1e3a5f", label: "소프트 블루" },
  { bg: "#def3ea", border: "#c8ebd9", text: "#164e3b", label: "소프트 민트" },
  { bg: "#fce8ec", border: "#fad1d9", text: "#711d2e", label: "소프트 로즈" },
  { bg: "#eee8f8", border: "#dfd3f4", text: "#3f2668", label: "소프트 라벤더" },
  { bg: "#fae8d8", border: "#f5d3b6", text: "#633512", label: "소프트 피치" },
  { bg: "#eaf3ce", border: "#dceba8", text: "#42560d", label: "소프트 라임" },
  { bg: "#fff3cc", border: "#fee899", text: "#6b5006", label: "소프트 옐로우" },
  { bg: "#f0f2f5", border: "#e1e5ea", text: "#334155", label: "소프트 그레이" },
];

export function getGroupColor(group: SubjectGroup, colorIndex?: number) {
  if (colorIndex !== undefined && PALETTE_COLORS[colorIndex]) {
    return PALETTE_COLORS[colorIndex];
  }
  switch (group) {
    case "수학": return PALETTE_COLORS[0];
    case "과학": return PALETTE_COLORS[1];
    case "국어": return PALETTE_COLORS[2];
    case "영어": return PALETTE_COLORS[3];
    case "사회": return PALETTE_COLORS[4];
    case "기술가정/정보": return PALETTE_COLORS[5];
    case "체육/예술": return PALETTE_COLORS[7];
    default: return PALETTE_COLORS[6];
  }
}

/**
 * 시간표 슬롯에서 중복 없이 과목 목록을 추출합니다.
 */
export function extractCoursesFromSlots(slots: TimetableSlot[]) {
  const map = new Map<string, {
    courseName: string;
    category: HighSchoolCourseCategory;
    group: SubjectGroup;
    units: number;
    isCareerRelated: boolean;
  }>();

  slots.forEach((s) => {
    if (!map.has(s.courseName)) {
      map.set(s.courseName, {
        courseName: s.courseName,
        category: s.category,
        group: s.group,
        units: s.units,
        isCareerRelated: s.isCareerRelated,
      });
    }
  });

  return Array.from(map.values());
}

export function createEmptyTimetable(
  grade: number = 1,
  semester: number = 1,
  name?: string
): TimetableConfig {
  return {
    id: `tt-${grade}-${semester}-main`,
    name: name || `${grade}학년 ${semester}학기 시간표`,
    grade,
    semester,
    isDefault: true,
    updatedAt: "방금 전",
    slots: [],
  };
}

export const DEFAULT_TIMETABLES: TimetableConfig[] = [
  createEmptyTimetable(1, 1),
];


