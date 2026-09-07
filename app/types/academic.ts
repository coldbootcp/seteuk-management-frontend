export type HighSchoolCourseCategory = "공통" | "일반선택" | "진로선택" | "융합선택" | "교양/기타";

export type SubjectGroup = "국어" | "수학" | "영어" | "과학" | "사회" | "기술가정/정보" | "체육/예술" | "기타";

export interface PresetCourse {
  code: string;
  name: string;
  group: SubjectGroup;
  category: HighSchoolCourseCategory;
  defaultUnits: number;
  description?: string;
}

export interface TimetableSlot {
  id: string;
  courseName: string;
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

export const SUBJECT_PRESETS: PresetCourse[] = [
  // 과학계열
  { code: "SCI-01", name: "통합과학", group: "과학", category: "공통", defaultUnits: 4 },
  { code: "SCI-02", name: "과학탐구실험", group: "과학", category: "공통", defaultUnits: 2 },
  { code: "SCI-03", name: "물리학Ⅰ", group: "과학", category: "일반선택", defaultUnits: 4, description: "역학과 에너지, 물질과 전자기장, 파동" },
  { code: "SCI-04", name: "물리학Ⅱ", group: "과학", category: "진로선택", defaultUnits: 4, description: "역학적 상호작용, 전자기장, 양자" },
  { code: "SCI-05", name: "화학Ⅰ", group: "과학", category: "일반선택", defaultUnits: 4, description: "화학의 첫걸음, 원자의 세계, 화학 결합" },
  { code: "SCI-06", name: "화학Ⅱ", group: "과학", category: "진로선택", defaultUnits: 4, description: "물질의 상태, 화학 반응의 엔탈피와 평형" },
  { code: "SCI-07", name: "생명과학Ⅰ", group: "과학", category: "일반선택", defaultUnits: 4 },
  { code: "SCI-08", name: "지구과학Ⅰ", group: "과학", category: "일반선택", defaultUnits: 4 },
  // 수학계열
  { code: "MAT-01", name: "공통수학", group: "수학", category: "공통", defaultUnits: 4 },
  { code: "MAT-02", name: "수학Ⅰ", group: "수학", category: "일반선택", defaultUnits: 4, description: "지수함수와 로그함수, 삼각함수, 수열" },
  { code: "MAT-03", name: "수학Ⅱ", group: "수학", category: "일반선택", defaultUnits: 4, description: "함수의 극한과 연속, 미분, 적분" },
  { code: "MAT-04", name: "미적분", group: "수학", category: "일반선택", defaultUnits: 4, description: "수열의 극한, 미분법, 적분법" },
  { code: "MAT-05", name: "확률과 통계", group: "수학", category: "일반선택", defaultUnits: 4 },
  { code: "MAT-06", name: "기하", group: "수학", category: "진로선택", defaultUnits: 4, description: "이차곡선, 평면벡터, 공간도형과 공간좌표" },
  { code: "MAT-07", name: "인공지능 수학", group: "수학", category: "진로선택", defaultUnits: 3 },
  // 정보계열
  { code: "INF-01", name: "정보", group: "기술가정/정보", category: "일반선택", defaultUnits: 4, description: "정보과학, 알고리즘, 프로그래밍" },
  { code: "INF-02", name: "프로그래밍", group: "기술가정/정보", category: "진로선택", defaultUnits: 4, description: "파이썬 기초 및 데이터 구조" },
  { code: "INF-03", name: "데이터 과학", group: "기술가정/정보", category: "융합선택", defaultUnits: 3 },
  // 국어/영어계열
  { code: "KOR-01", name: "공통국어", group: "국어", category: "공통", defaultUnits: 4 },
  { code: "KOR-02", name: "문학", group: "국어", category: "일반선택", defaultUnits: 4 },
  { code: "KOR-03", name: "독서", group: "국어", category: "일반선택", defaultUnits: 4 },
  { code: "KOR-04", name: "언어와 매체", group: "국어", category: "일반선택", defaultUnits: 4 },
  { code: "ENG-01", name: "공통영어", group: "영어", category: "공통", defaultUnits: 4 },
  { code: "ENG-02", name: "영어Ⅰ", group: "영어", category: "일반선택", defaultUnits: 4 },
  { code: "ENG-03", name: "영어 독해와 작문", group: "영어", category: "일반선택", defaultUnits: 4 },
  // 사회/기타
  { code: "SOC-01", name: "통합사회", group: "사회", category: "공통", defaultUnits: 4 },
  { code: "SOC-02", name: "한국사", group: "사회", category: "공통", defaultUnits: 3 },
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
  name: string = "기본 시간표"
): TimetableConfig {
  return {
    id: `tt-${grade}-${semester}-main`,
    name,
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


