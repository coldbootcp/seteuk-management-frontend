import { api } from "./api-client";
import type { components } from "./api-types";
import type { TimetableConfig, TimetableSlot } from "../app/types/academic";

type TimetableRead = components["schemas"]["TimetableRead"];
type TimetableSlotInput = components["schemas"]["TimetableSlotInput"];
type TimetableWrite = components["schemas"]["TimetableWrite"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toSlot(slot: TimetableSlot): TimetableSlotInput {
  return {
    id: slot.id,
    course_name: slot.courseName,
    teacher: slot.teacher ?? null,
    room: slot.room ?? null,
    day: slot.day,
    start_period: slot.startPeriod,
    period_span: slot.periodSpan,
    category: slot.category,
    group: slot.group,
    color_index: slot.colorIndex,
    units: slot.units,
    is_career_related: slot.isCareerRelated,
  };
}

function fromSlot(slot: TimetableSlotInput): TimetableSlot {
  return {
    id: slot.id,
    courseName: slot.course_name,
    teacher: slot.teacher ?? undefined,
    room: slot.room ?? undefined,
    day: slot.day,
    startPeriod: slot.start_period,
    periodSpan: slot.period_span,
    category: slot.category as TimetableSlot["category"],
    group: slot.group as TimetableSlot["group"],
    colorIndex: slot.color_index,
    units: slot.units,
    isCareerRelated: slot.is_career_related,
  };
}

function toWrite(timetable: TimetableConfig): TimetableWrite {
  return {
    // localStorage에서 옮겨 온 옛 id는 서버 id가 아니므로 새 시간표로 저장한다.
    ...(UUID.test(timetable.id) ? { id: timetable.id } : {}),
    name: timetable.name,
    grade: timetable.grade,
    semester: timetable.semester,
    is_default: timetable.isDefault,
    slots: timetable.slots.map(toSlot),
  };
}

function fromRead(timetable: TimetableRead): TimetableConfig {
  return {
    id: timetable.id,
    name: timetable.name,
    grade: timetable.grade,
    semester: timetable.semester,
    isDefault: timetable.is_default,
    slots: (timetable.slots ?? []).map(fromSlot),
    updatedAt: formatUpdatedAt(timetable.updated_at),
  };
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "저장됨";
  const minutesAgo = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutesAgo < 1) return "방금 전";
  if (minutesAgo < 60) return `${minutesAgo}분 전`;
  if (minutesAgo < 24 * 60) return `${Math.floor(minutesAgo / 60)}시간 전`;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export async function fetchTimetables(): Promise<TimetableConfig[]> {
  const response = await api<components["schemas"]["TimetableListResponse"]>("/timetables");
  return response.timetables.map(fromRead);
}

export async function saveTimetables(
  timetables: TimetableConfig[],
): Promise<TimetableConfig[]> {
  const response = await api<components["schemas"]["TimetableListResponse"]>("/timetables", {
    method: "PUT",
    body: { timetables: timetables.map(toWrite) },
  });
  return response.timetables.map(fromRead);
}
