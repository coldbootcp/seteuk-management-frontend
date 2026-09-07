"use client";

import { api } from "./api-client";
import type {
  HighSchoolCourseCategory,
  HighSchoolGradeItem,
  SubjectGroup,
} from "../app/types/academic";
import { SUBJECT_PRESETS } from "../app/types/academic";

export interface AcademicRecordDTO {
  id: string;
  user_id?: string;
  grade: number;
  semester: number;
  category: string;
  subject: string;
  units: number | null;
  achievement_grade: string | null;
  student_count?: number | null;
  raw_score: number | null;
  subject_average: number | null;
  std_deviation: number | null;
  rank: string | null;
  note: string | null;
  roadmap_node_id?: string | null;
  created_at?: string;
}

export type AcademicRecordCreatePayload = {
  grade: number;
  semester: number;
  category: string;
  subject: string;
  units?: number | null;
  achievement_grade?: string | null;
  student_count?: number | null;
  raw_score?: number | null;
  subject_average?: number | null;
  std_deviation?: number | null;
  rank?: string | null;
  note?: string | null;
  roadmap_node_id?: string | null;
};

export type AcademicRecordUpdatePayload = Partial<AcademicRecordCreatePayload>;

export function inferSubjectGroup(subjectName: string, _category?: string): SubjectGroup {
  const match = SUBJECT_PRESETS.find((p) => p.name === subjectName);
  if (match) return match.group;
  if (/국어|문학|독서|화법|작문|언어|매체/.test(subjectName)) return "국어";
  if (/수학|미적|기하|확률|통계|대수|해석/.test(subjectName)) return "수학";
  if (/영어|회화|독해|작문/.test(subjectName)) return "영어";
  if (/물리|화학|생명|지구|과학|실험|생물/.test(subjectName)) return "과학";
  if (/사회|역사|한국사|지리|윤리|도덕|경제|정치|법/.test(subjectName)) return "사회";
  if (/정보|프로그래밍|컴퓨터|코딩|기술|가정|인공지능/.test(subjectName)) return "기술가정/정보";
  if (/체육|음악|미술|연극|예술/.test(subjectName)) return "체육/예술";
  return "기타";
}

export function backendRecordToGradeItem(record: AcademicRecordDTO): HighSchoolGradeItem {
  const group = inferSubjectGroup(record.subject, record.category);
  const parsedRank = record.rank ? Number.parseInt(record.rank, 10) : null;
  const isCareerRelated =
    record.category === "진로선택" ||
    SUBJECT_PRESETS.find((p) => p.name === record.subject)?.category === "진로선택" ||
    false;

  return {
    id: record.id,
    courseName: record.subject,
    category: (record.category as HighSchoolCourseCategory) || "일반선택",
    group,
    units: record.units ?? 4,
    rank: parsedRank !== null && !Number.isNaN(parsedRank) ? parsedRank : null,
    achievement: (record.achievement_grade as HighSchoolGradeItem["achievement"]) || null,
    rawScore: record.raw_score ?? null,
    subjectAverage: record.subject_average ?? null,
    stdDev: record.std_deviation ?? null,
    isCareerRelated,
    seteukCount: 0,
    note: record.note ?? undefined,
  };
}

export function gradeItemToCreatePayload(
  item: HighSchoolGradeItem,
  grade: number,
  semester: number,
  roadmapNodeId?: string | null
): AcademicRecordCreatePayload {
  return {
    grade,
    semester,
    category: item.category,
    subject: item.courseName,
    units: item.units,
    rank: item.rank !== null && item.rank !== undefined ? String(item.rank) : null,
    achievement_grade: item.achievement ?? null,
    raw_score: item.rawScore ?? null,
    subject_average: item.subjectAverage ?? null,
    std_deviation: item.stdDev ?? null,
    note: item.note ?? null,
    roadmap_node_id: roadmapNodeId ?? null,
  };
}

export function gradeItemToUpdatePayload(
  updates: Partial<HighSchoolGradeItem>
): AcademicRecordUpdatePayload {
  const payload: AcademicRecordUpdatePayload = {};
  if (updates.courseName !== undefined) payload.subject = updates.courseName;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.units !== undefined) payload.units = updates.units;
  if (updates.rank !== undefined) {
    payload.rank = updates.rank !== null ? String(updates.rank) : null;
  }
  if (updates.achievement !== undefined) payload.achievement_grade = updates.achievement;
  if (updates.rawScore !== undefined) payload.raw_score = updates.rawScore;
  if (updates.subjectAverage !== undefined) payload.subject_average = updates.subjectAverage;
  if (updates.stdDev !== undefined) payload.std_deviation = updates.stdDev;
  if (updates.note !== undefined) payload.note = updates.note;
  return payload;
}

export async function fetchAcademicRecords(params?: {
  grade?: number;
  semester?: number;
  limit?: number;
}): Promise<AcademicRecordDTO[]> {
  const searchParams = new URLSearchParams();
  if (params?.grade) searchParams.set("grade", String(params.grade));
  if (params?.semester) searchParams.set("semester", String(params.semester));
  searchParams.set("limit", String(params?.limit ?? 200));

  const res = await api<{ items: AcademicRecordDTO[]; total: number }>(
    `/academic-performance?${searchParams.toString()}`
  );
  return res.items ?? [];
}

export async function createAcademicRecord(
  payload: AcademicRecordCreatePayload
): Promise<AcademicRecordDTO> {
  return api<AcademicRecordDTO>("/academic-performance", {
    method: "POST",
    body: payload,
  });
}

export async function updateAcademicRecord(
  id: string,
  payload: AcademicRecordUpdatePayload
): Promise<AcademicRecordDTO> {
  return api<AcademicRecordDTO>(`/academic-performance/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteAcademicRecord(id: string): Promise<void> {
  return api<void>(`/academic-performance/${id}`, {
    method: "DELETE",
  });
}
