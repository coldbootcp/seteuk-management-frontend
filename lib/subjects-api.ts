import { api } from "./api-client";
import type { HighSchoolCourseCategory, SubjectGroup } from "../app/types/academic";

/**
 * 고등학교 과목 카탈로그와 이번 학기 수강 과목.
 *
 * 과목은 학생이 자유롭게 타이핑하지 않고 백엔드 카탈로그의 후보에서 고른다 — 그래야
 * 기록이 과목 데이터(교과군·선택 구분·학점)와 1:1로 이어진다. 카탈로그에 없는 학교
 * 자체 과목만 "기타"로 이름을 직접 입력한다.
 *
 * 이 엔드포인트들은 lib/api-types.ts가 마지막으로 생성된 뒤에 생겼다. 백엔드를 띄운 뒤
 * `/openapi.json`에서 타입을 다시 생성하면 아래 손으로 적은 타입을 그 타입으로 바꾼다.
 */

export type Curriculum = "2015" | "2022";

export type CatalogSubject = {
  code: string;
  name: string;
  curriculum: Curriculum;
  /** 교과(군): 국어·수학·영어·사회·한국사·과학·체육·예술·기술·가정/정보·제2외국어·한문·교양 */
  group: string;
  /** 공통·일반선택·진로선택·융합선택·전문교과 */
  category: string;
  default_units: number;
  /** 특수목적고 전문 교과의 계열(과학 계열 등). 보통 교과는 null. */
  track: string | null;
  verified: boolean;
};

type SubjectListResponse = { curriculum: Curriculum; items: CatalogSubject[] };

export type CurrentCourse = {
  id: string;
  subject: string;
  subject_code: string | null;
  category: string;
  units: number | null;
  /** 카탈로그에 없어 학생이 직접 입력한 과목 */
  is_custom: boolean;
  /** 성적·생기부로 이미 있던 과목이라 이 화면에서 뺄 수 없다 */
  locked: boolean;
};

export type CurrentCourses = {
  grade: number;
  semester: number;
  curriculum: Curriculum;
  courses: CurrentCourse[];
};

/** 저장 요청의 과목 하나 — 카탈로그 코드 또는 기타 과목명 중 하나만. */
export type CurrentCourseInput = { subject_code: string } | { custom_name: string };

export async function searchSubjects(query: string, curriculum?: Curriculum): Promise<SubjectListResponse> {
  const params = new URLSearchParams({ q: query, limit: "12" });
  if (curriculum) params.set("curriculum", curriculum);
  return api<SubjectListResponse>(`/subjects/search?${params.toString()}`);
}

export async function listSubjects(curriculum?: Curriculum): Promise<SubjectListResponse> {
  const params = curriculum ? `?curriculum=${curriculum}` : "";
  return api<SubjectListResponse>(`/subjects${params}`);
}

export async function commonSubjects(
  grade: number,
  semester: number,
  curriculum?: Curriculum,
): Promise<SubjectListResponse> {
  const params = new URLSearchParams({ grade: String(grade), semester: String(semester) });
  if (curriculum) params.set("curriculum", curriculum);
  return api<SubjectListResponse>(`/subjects/common?${params.toString()}`);
}

export async function getCurrentCourses(): Promise<CurrentCourses> {
  return api<CurrentCourses>("/profile/current-courses");
}

export async function saveCurrentCourses(courses: CurrentCourseInput[]): Promise<CurrentCourses> {
  return api<CurrentCourses>("/profile/current-courses", { method: "PUT", body: { courses } });
}

/* ──────────────────────────────────────────────
   카탈로그 과목 → 시간표 칸의 교과군·선택 구분
   ────────────────────────────────────────────── */

const GROUP_TO_TIMETABLE: Record<string, SubjectGroup> = {
  국어: "국어",
  수학: "수학",
  영어: "영어",
  과학: "과학",
  사회: "사회",
  한국사: "사회",
  "기술·가정/정보": "기술가정/정보",
  체육: "체육/예술",
  예술: "체육/예술",
};

const CATEGORY_TO_TIMETABLE: Record<string, HighSchoolCourseCategory> = {
  공통: "공통",
  일반선택: "일반선택",
  진로선택: "진로선택",
  융합선택: "융합선택",
  // 특목고 전문 교과는 진로 방향으로 고르는 과목이라 시간표에서는 진로선택과 같은 칸에 둔다.
  전문교과: "진로선택",
};

/** 시간표는 교과군을 8개 색 묶음으로 보여 준다 — 카탈로그의 교과(군)을 그 묶음으로 옮긴다. */
export function timetableGroupOf(subject: CatalogSubject): SubjectGroup {
  return GROUP_TO_TIMETABLE[subject.group] ?? "기타";
}

export function timetableCategoryOf(subject: CatalogSubject): HighSchoolCourseCategory {
  return CATEGORY_TO_TIMETABLE[subject.category] ?? "교양/기타";
}
