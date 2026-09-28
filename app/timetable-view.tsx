"use client";

import { useState, useEffect, useMemo } from "react";
import {
  DAYS_KR,
  PERIOD_TIMES,
  PALETTE_COLORS,
  getGroupColor,
  type TimetableSlot,
  type TimetableConfig,
} from "./types/academic";
import type { StudentActivity } from "../lib/product-harness";
import {
  commonSubjects,
  getCurrentCourses,
  listSubjects,
  saveCurrentCourses,
  timetableCategoryOf,
  timetableGroupOf,
  type CatalogSubject,
  type CurrentCourse,
  type CurrentCourseInput,
  type CurrentCourses,
  type Curriculum,
} from "../lib/subjects-api";
import { SubjectSearchField } from "./course-picker";
import { Icon } from "./icons";

interface TimetableViewProps {
  currentGrade: number;
  currentSemester: number;
  /** 과목별 기록 수와 서랍의 목록을 실제 값으로 채우기 위한 활동 전체. */
  activities: StudentActivity[];
  timetables: TimetableConfig[];
  onTimetablesChange: (timetables: TimetableConfig[]) => void;
  onNavigateToGrades?: () => void;
  onNavigateToActivities?: (subjectName: string) => void;
}

type CourseDraft = {
  name: string;
  teacher?: string;
  room?: string;
  units?: number;
  /** 카탈로그에서 고른 과목. 없으면 목록에 없어 "기타"로 직접 적은 과목이다. */
  subject?: CatalogSubject;
  /** 오른쪽 블록에서 고른 과목이면 그 블록이 이미 가진 칸 내용(교사·강의실 포함)을 그대로 쓴다. */
  fields?: SlotFields;
};

const CAREER_GROUPS = ["과학", "수학", "기술가정/정보"];

/** 과목 한 칸의 과목 정보 — 카탈로그 과목이면 교과군·선택 구분을 카탈로그에서 가져온다. */
function slotFieldsFor(course: CourseDraft): Pick<
  TimetableSlot,
  "courseName" | "subjectCode" | "teacher" | "room" | "category" | "group" | "units" | "colorIndex" | "isCareerRelated"
> {
  const group = course.subject ? timetableGroupOf(course.subject) : "기타";
  return {
    courseName: course.name,
    subjectCode: course.subject?.code,
    teacher: course.teacher,
    room: course.room,
    category: course.subject ? timetableCategoryOf(course.subject) : "교양/기타",
    group,
    units: course.units ?? course.subject?.default_units ?? 0,
    colorIndex: courseColorIndex(course.name),
    isCareerRelated: CAREER_GROUPS.includes(group),
  };
}

type SlotFields = ReturnType<typeof slotFieldsFor>;

/** 이미 시간표에 든 칸에서 위치(요일·교시)를 뺀 과목 내용만. */
function fieldsOfSlot(slot: TimetableSlot): SlotFields {
  return {
    courseName: slot.courseName,
    subjectCode: slot.subjectCode,
    teacher: slot.teacher,
    room: slot.room,
    category: slot.category,
    group: slot.group,
    units: slot.units,
    colorIndex: slot.colorIndex,
    isCareerRelated: slot.isCareerRelated,
  };
}

function newSlotId() {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 오른쪽 과목 블록 하나. 끌어다 놓으면 이 내용으로 시간표 칸이 채워진다.
 * 현재 학기는 학생이 등록한 이번 학기 수강 과목(온보딩·상담에서 고른 목록)과 시간표에
 * 이미 들어간 과목을 합쳐 보여 주고, 다른 학기는 그 학기 시간표에 들어간 과목만 보여 준다.
 */
type PaletteCourse = {
  key: string;
  fields: SlotFields;
  /** 이번 학기 수강 과목 목록에서 온 블록 — 빼기(✕)는 이 목록에서 뺀다. */
  currentCourse?: CurrentCourse;
  /** 이 학기 시간표에 들어간 칸 수 */
  placedCount: number;
};

type Placement = { day: number; period: number };

/** 같은 과목인지 가르는 기준 — 카탈로그 과목은 코드, "기타" 과목은 이름. */
function courseKey(courseName: string, subjectCode?: string | null) {
  return subjectCode ? subjectCode : `name:${courseName.trim()}`;
}

function toCourseInput(course: CurrentCourse): CurrentCourseInput {
  return course.subject_code ? { subject_code: course.subject_code } : { custom_name: course.subject };
}

/** "+" 빈칸과 과목 블록 사이에 쓰는 끌기 데이터 형식. */
const PALETTE_DRAG_TYPE = "application/x-seteuk-course";

function courseColorIndex(courseName: string) {
  return Array.from(courseName).reduce((sum, character) => sum + character.charCodeAt(0), 0) % PALETTE_COLORS.length;
}

export function TimetableView({
  currentGrade,
  currentSemester,
  activities,
  timetables,
  onTimetablesChange,
  onNavigateToGrades,
  onNavigateToActivities,
}: TimetableViewProps) {
  const currentPeriod = `${currentGrade}-${currentSemester}`;
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);

  // Sync selectedPeriod when currentGrade or currentSemester changes
  useEffect(() => {
    setSelectedPeriod(`${currentGrade}-${currentSemester}`);
  }, [currentGrade, currentSemester]);

  const [selGrade, selSemester] = selectedPeriod.split("-").map(Number);
  // 과목 목록·예시는 백엔드 카탈로그에서 온다. 학생의 교육과정(2025 입학생부터 2022
  // 개정)은 서버가 입학 학년도로 정하므로 여기서 따로 계산하지 않는다.

  // 현재 활성 시간표 (선택된 학기 기준 단일 시간표 고정)
  const activeTimetable =
    timetables.find((t) => t.grade === selGrade && t.semester === selSemester) || {
      id: `tt-${selGrade}-${selSemester}-main`,
      name: `${selGrade}학년 ${selSemester}학기 시간표`,
      grade: selGrade,
      semester: selSemester,
      isDefault: true,
      slots: [],
      updatedAt: "방금 전",
    };
  const slots = activeTimetable.slots;
  const isCurrentPeriod = selectedPeriod === currentPeriod;

  // 이번 학기 수강 과목(온보딩·상담에서 등록)과, 그 과목의 교과군을 찾을 카탈로그.
  const [currentCourses, setCurrentCourses] = useState<CurrentCourses | null>(null);
  const [catalogByCode, setCatalogByCode] = useState<Map<string, CatalogSubject>>(() => new Map());
  const [paletteError, setPaletteError] = useState("");
  // 오른쪽 "+" 블록으로 방금 추가했지만 아직 칸에 넣지 않은 과목(학기별). 현재 학기는 수강
  // 과목에 저장되지만, 다른 학기는 시간표에 든 과목만 블록이 되므로 여기서 붙잡아 둔다.
  const [addedCourses, setAddedCourses] = useState<Record<string, CourseDraft[]>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCurrentCourses(), listSubjects()])
      .then(([courses, catalog]) => {
        if (cancelled) return;
        setCurrentCourses(courses);
        setCatalogByCode(new Map(catalog.items.map((subject) => [subject.code, subject])));
      })
      .catch(() => {
        // 못 불러와도 시간표는 쓸 수 있다 — 블록은 시간표에 든 과목만 보인다.
      });
    return () => {
      cancelled = true;
    };
  }, [currentGrade, currentSemester]);

  const paletteCourses = useMemo(() => {
    const byKey = new Map<string, PaletteCourse>();
    if (isCurrentPeriod && currentCourses) {
      for (const course of currentCourses.courses) {
        const subject = course.subject_code ? catalogByCode.get(course.subject_code) : undefined;
        const key = courseKey(course.subject, course.subject_code);
        byKey.set(key, {
          key,
          fields: slotFieldsFor({ name: course.subject, subject, units: course.units ?? undefined }),
          currentCourse: course,
          placedCount: 0,
        });
      }
    }
    for (const slot of slots) {
      const key = courseKey(slot.courseName, slot.subjectCode);
      const existing = byKey.get(key);
      if (existing && existing.placedCount > 0) {
        existing.placedCount += 1;
        continue;
      }
      // 시간표에 이미 든 칸의 내용(교사·강의실)을 블록이 이어받아, 다른 시간에 넣어도 같게 보인다.
      byKey.set(key, { key, fields: fieldsOfSlot(slot), currentCourse: existing?.currentCourse, placedCount: 1 });
    }
    for (const course of addedCourses[selectedPeriod] ?? []) {
      const key = courseKey(course.name, course.subject?.code);
      if (!byKey.has(key)) byKey.set(key, { key, fields: slotFieldsFor(course), placedCount: 0 });
    }
    return Array.from(byKey.values());
  }, [isCurrentPeriod, currentCourses, catalogByCode, slots, addedCourses, selectedPeriod]);

  // 색은 과목 이름 순서로 나눠 준다. 아직 시간표에 없는 블록도 넣어 계산해야, 블록을 칸에
  // 놓는 순간 다른 과목들의 색이 바뀌지 않는다.
  const courseColorMap = useMemo(() => {
    const names = Array.from(new Set(paletteCourses.map((course) => course.fields.courseName))).sort((a, b) =>
      a.localeCompare(b),
    );
    return new Map(names.map((name, index) => [name, index % PALETTE_COLORS.length]));
  }, [paletteCourses]);

  /**
   * 시간표에서 새로 추가한 과목을 이번 학기 수강 과목에도 넣는다(현재 학기만 — 수강 과목
   * 목록은 현재 학기 것이다). 다른 학기는 시간표에 든 과목이 곧 블록이라 따로 저장할 게 없다.
   */
  async function rememberCourse(course: CourseDraft) {
    if (!isCurrentPeriod || !currentCourses) return;
    const key = courseKey(course.name, course.subject?.code);
    if (currentCourses.courses.some((existing) => courseKey(existing.subject, existing.subject_code) === key)) return;
    const added: CurrentCourseInput = course.subject ? { subject_code: course.subject.code } : { custom_name: course.name };
    try {
      setCurrentCourses(await saveCurrentCourses([...currentCourses.courses.map(toCourseInput), added]));
      setPaletteError("");
    } catch {
      setPaletteError("수강 과목 목록에 저장하지 못했어요. 시간표에는 그대로 들어갔어요.");
    }
  }

  async function forgetCourse(course: CurrentCourse) {
    if (!currentCourses) return;
    if (!window.confirm(`'${course.subject}'을(를) 이번 학기 수강 과목에서 뺄까요?`)) return;
    try {
      setCurrentCourses(
        await saveCurrentCourses(currentCourses.courses.filter((existing) => existing.id !== course.id).map(toCourseInput)),
      );
      setPaletteError("");
    } catch {
      setPaletteError("수강 과목에서 빼지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  // 학기 변경 핸들러
  const handlePeriodChange = (newPeriod: string) => {
    setSelectedPeriod(newPeriod);
    const [g, s] = newPeriod.split("-").map(Number);
    const exists = timetables.some((t) => t.grade === g && t.semester === s);
    if (!exists) {
      const newTt: TimetableConfig = {
        id: `tt-${g}-${s}-main`,
        name: `${g}학년 ${s}학기 시간표`,
        grade: g,
        semester: s,
        isDefault: true,
        slots: [],
        updatedAt: "방금 전",
      };
      onTimetablesChange([...timetables, newTt]);
    }
    setSelectedSlot(null);
  };

  // 선택된 과목 슬롯 (세특 퀵 드로어용)
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);

  // 모달 상태
  const [isDirectAddModalOpen, setIsDirectAddModalOpen] = useState(false);
  const [placementCourse, setPlacementCourse] = useState<CourseDraft | null>(null);
  const [directPlacement, setDirectPlacement] = useState<Placement | null>(null);
  const [lunchAfterPeriod, setLunchAfterPeriod] = useState(4);
  const [draggingLunch, setDraggingLunch] = useState(false);
  const [lunchHoverAfterPeriod, setLunchHoverAfterPeriod] = useState<number | null>(null);
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null);
  const [draggingPaletteKey, setDraggingPaletteKey] = useState<string | null>(null);
  // 빈칸의 "+"를 눌렀을 때 — 그 칸에 넣을 과목 블록을 고르는 창.
  const [cellChooser, setCellChooser] = useState<Placement | null>(null);
  const [dropTarget, setDropTarget] = useState<Placement | null>(null);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);

  // 등록된 고유 과목 목록
  const uniqueCourses = Array.from(new Set(slots.map((s) => s.courseName)));

  // 슬롯 추가 핸들러
  const handleAddSlot = (newSlot: TimetableSlot) => {
    handleAddSlots([newSlot]);
  };

  const handleAddSlots = (newSlots: TimetableSlot[]) => {
    commitSlots([...activeTimetable.slots, ...newSlots]);
  };

  /** 이 학기 시간표의 칸 전체를 바꿔 저장한다(아직 없던 학기면 새로 만든다). */
  const commitSlots = (nextSlots: TimetableSlot[]) => {
    const updated = {
      ...activeTimetable,
      slots: nextSlots,
      updatedAt: "방금 전",
    };
    const exists = timetables.some((t) => t.grade === selGrade && t.semester === selSemester);
    const updatedAll = exists
      ? timetables.map((t) => (t.grade === selGrade && t.semester === selSemester ? updated : t))
      : [...timetables, updated];
    onTimetablesChange(updatedAll);
  };

  /** 오른쪽 블록을 칸에 놓았을 때. 빈칸이면 채우고, 다른 과목이 있으면 확인 후 바꾼다. */
  const handlePlaceFromPalette = (key: string, day: number, period: number) => {
    const course = paletteCourses.find((candidate) => candidate.key === key);
    if (!course) return;
    const covered = slots.some((slot) => slot.day === day && slot.startPeriod < period && slot.startPeriod + slot.periodSpan > period);
    if (covered) return;
    const target = slots.find((slot) => slot.day === day && slot.startPeriod === period);
    if (!target) {
      handleAddSlot({ id: newSlotId(), ...course.fields, day, startPeriod: period, periodSpan: 1 });
      return;
    }
    if (courseKey(target.courseName, target.subjectCode) === key) return;
    if (!window.confirm(`${DAYS_KR[day]}요일 ${period}교시의 '${target.courseName}'을(를) '${course.fields.courseName}'(으)로 바꿀까요?`)) return;
    commitSlots(slots.map((slot) => (slot.id === target.id ? { ...slot, ...course.fields } : slot)));
    if (selectedSlot?.id === target.id) setSelectedSlot(null);
  };

  const endPaletteDrag = () => {
    setDraggingPaletteKey(null);
    setDropTarget(null);
  };

  const handleMoveSlot = (slotId: string, day: number, period: number) => {
    const dragged = slots.find((slot) => slot.id === slotId);
    if (!dragged || (dragged.day === day && dragged.startPeriod === period)) return;
    const target = slots.find((slot) => slot.id !== slotId && slot.day === day && slot.startPeriod === period);
    const updatedSlots = slots.map((slot) => {
      if (slot.id === slotId) return { ...slot, day, startPeriod: period };
      if (target && slot.id === target.id) return { ...slot, day: dragged.day, startPeriod: dragged.startPeriod };
      return slot;
    });
    const updated = { ...activeTimetable, slots: updatedSlots, updatedAt: "방금 전" };
    onTimetablesChange(timetables.map((t) => (t.id === activeTimetable.id ? updated : t)));
  };

  const handleUpdateSlot = (updatedSlot: TimetableSlot) => {
    const updated = { ...activeTimetable, slots: slots.map((slot) => slot.id === updatedSlot.id ? updatedSlot : slot), updatedAt: "방금 전" };
    onTimetablesChange(timetables.map((t) => (t.id === activeTimetable.id ? updated : t)));
    setSelectedSlot(updatedSlot);
    setEditingSlot(null);
  };

  const updateLunchHover = (period: number, event: React.DragEvent<HTMLElement>) => {
    if (!draggingLunch) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const afterPeriod = event.clientY < rect.top + rect.height / 2 ? period - 1 : period;
    setLunchHoverAfterPeriod(Math.max(0, Math.min(7, afterPeriod)));
  };

  // 슬롯 삭제 핸들러 (확인 팝업 추가)
  const handleDeleteSlot = (slotId: string, courseName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`'${courseName}' 수업을 시간표에서 삭제하시겠습니까?`)) {
      return;
    }
    const updated = {
      ...activeTimetable,
      slots: activeTimetable.slots.filter((s) => s.id !== slotId),
      updatedAt: "방금 전",
    };
    const updatedAll = timetables.map((t) =>
      t.grade === selGrade && t.semester === selSemester ? updated : t
    );
    onTimetablesChange(updatedAll);
    if (selectedSlot?.id === slotId) setSelectedSlot(null);
  };

  const drawerRecords = selectedSlot
    ? activities.filter((activity) => activity.subject === selectedSlot.courseName).slice(0, 8)
    : [];

  const SEMESTER_OPTIONS = [
    { value: "1-1", label: "1학년 1학기" },
    { value: "1-2", label: "1학년 2학기" },
    { value: "2-1", label: "2학년 1학기" },
    { value: "2-2", label: "2학년 2학기" },
    { value: "3-1", label: "3학년 1학기" },
    { value: "3-2", label: "3학년 2학기" },
  ];

  /** 한 교시 줄. 오전(1~4)과 오후(5~7)를 점심 배너로 나눠 그리려고 쪼개 뒀다. */
  function periodRow(period: number) {
    return (
      <div
        className="grid grid-cols-6 min-h-[78px]"
        key={period}
      >
          <div
            className="flex flex-col items-center justify-center border-r border-gray-100 bg-gray-50/40 py-2 cursor-ns-resize"
            onDragEnter={() => { if (draggingLunch) setLunchHoverAfterPeriod(period); }}
            onDragOver={(event) => { if (draggingLunch) { event.preventDefault(); setLunchHoverAfterPeriod(period); } }}
            onDrop={(event) => { event.preventDefault(); if (draggingLunch) setLunchAfterPeriod(lunchHoverAfterPeriod ?? period); setDraggingLunch(false); setLunchHoverAfterPeriod(null); }}
          >
            <span className="font-extrabold text-sm text-gray-800">{period}</span>
          </div>

        {DAYS_KR.map((_, dayIdx) => {
          const slot = slots.find((s) => s.day === dayIdx && s.startPeriod === period);
          // 앞 교시에서 시작해 이 교시를 이미 차지하고 있으면 빈칸을 그리지 않는다.
          const occupied = slots.some(
            (s) => s.day === dayIdx && s.startPeriod < period && s.startPeriod + s.periodSpan > period,
          );
          const palette = slot ? getGroupColor(slot.group, courseColorMap.get(slot.courseName) ?? courseColorIndex(slot.courseName)) : null;
          const isSelected = Boolean(slot && selectedSlot?.id === slot.id);
          const isDropTarget = Boolean(draggingPaletteKey && dropTarget?.day === dayIdx && dropTarget.period === period);
          const acceptDrag = (event: React.DragEvent<HTMLElement>) => {
            if (!draggingSlotId && !draggingPaletteKey) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = draggingPaletteKey ? "copy" : "move";
            if (draggingPaletteKey && (dropTarget?.day !== dayIdx || dropTarget.period !== period)) {
              setDropTarget({ day: dayIdx, period });
            }
          };
          const dropHere = (event: React.DragEvent<HTMLElement>) => {
            event.preventDefault();
            event.stopPropagation();
            if (draggingPaletteKey) handlePlaceFromPalette(draggingPaletteKey, dayIdx, period);
            else if (draggingSlotId) handleMoveSlot(draggingSlotId, dayIdx, period);
            setDraggingSlotId(null);
            endPaletteDrag();
          };

          return (
            <div className="p-1.5 border-r border-gray-100 last:border-r-0 flex flex-col" key={`${dayIdx}-${period}`}>
              {occupied ? null : slot && palette ? (
                <button
                  draggable
                  className="flex-1 w-full p-2 rounded-xl border text-left transition hover:shadow-md flex flex-col justify-between group"
                  onClick={() => setSelectedSlot(slot)}
                  onDragStart={(event) => { event.stopPropagation(); setDraggingSlotId(slot.id); }}
                  onDragEnd={() => setDraggingSlotId(null)}
                  onDragOver={acceptDrag}
                  onDrop={dropHere}
                  style={{
                    backgroundColor: palette.bg,
                    borderColor: isSelected || isDropTarget ? "#3182F6" : palette.border,
                    boxShadow: isSelected || isDropTarget ? "0 0 0 2px rgba(49,130,246,0.25)" : undefined,
                    color: palette.text,
                  }}
                  type="button"
                >
                  <span className="flex items-start justify-between gap-1 w-full">
                    <span className="font-bold text-xs leading-tight break-keep">{slot.courseName}</span>
                    <span
                      className="text-[11px] leading-none opacity-0 group-hover:opacity-60 hover:!opacity-100 flex-none"
                      onClick={(event) => handleDeleteSlot(slot.id, slot.courseName, event)}
                      role="presentation"
                      title="수업 삭제"
                    >
                      ✕
                    </span>
                  </span>
                  <span className="text-[10px] opacity-80 font-medium mt-1 block truncate">
                    {[slot.room, slot.teacher].filter(Boolean).join(" · ") || (slot.units > 0 ? `${slot.units}단위` : "단위수 추후 입력")}
                  </span>
                </button>
              ) : (
                <button
                  className={`flex-1 w-full rounded-xl border border-dashed transition flex items-center justify-center text-xs font-bold ${
                    isDropTarget
                      ? "border-brand-500 bg-blue-50 text-brand-500"
                      : draggingPaletteKey
                        ? "border-brand-200 bg-blue-50/30 text-brand-300"
                        : "border-gray-200 text-gray-300 hover:border-brand-400 hover:bg-blue-50/40 hover:text-brand-500"
                  }`}
                  onClick={() => setCellChooser({ day: dayIdx, period })}
                  onDragOver={acceptDrag}
                  onDrop={dropHere}
                  title="과목 추가하기"
                  type="button"
                >
                  +
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  /**
   * 과목 블록 목록 + 맨 끝의 "+" 블록. 오른쪽 카드와 빈칸 "+"의 선택 창이 같은 모양을 쓴다.
   * draggable이면 블록을 시간표 칸으로 끌어 놓을 수 있다.
   */
  function renderCourseBlocks({
    draggable,
    onPick,
    onAdd,
  }: {
    draggable: boolean;
    onPick: (course: PaletteCourse) => void;
    onAdd: () => void;
  }) {
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {paletteCourses.map((course) => {
          const colors = getGroupColor(
            course.fields.group,
            courseColorMap.get(course.fields.courseName) ?? courseColorIndex(course.fields.courseName),
          );
          const removable = Boolean(course.currentCourse && !course.currentCourse.locked && course.placedCount === 0);
          return (
            <button
              className={`group relative min-h-[48px] px-1.5 py-1.5 rounded-lg border text-left transition hover:shadow-md flex flex-col justify-between ${
                draggable ? "cursor-grab active:cursor-grabbing" : ""
              } ${draggingPaletteKey === course.key ? "opacity-50" : ""}`}
              draggable={draggable}
              key={course.key}
              onClick={() => onPick(course)}
              onDragEnd={draggable ? endPaletteDrag : undefined}
              onDragStart={
                draggable
                  ? (event) => {
                      event.dataTransfer.effectAllowed = "copy";
                      event.dataTransfer.setData(PALETTE_DRAG_TYPE, course.key);
                      event.dataTransfer.setData("text/plain", course.fields.courseName);
                      setDraggingSlotId(null);
                      setDraggingPaletteKey(course.key);
                    }
                  : undefined
              }
              style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
              title={draggable ? `${course.fields.courseName} — 끌어다 시간표에 넣기` : course.fields.courseName}
              type="button"
            >
              <span className="flex items-start justify-between gap-0.5 w-full">
                <span className="font-bold text-[11px] leading-tight break-keep">{course.fields.courseName}</span>
                {draggable && removable && course.currentCourse && (
                  <span
                    className="text-[10px] leading-none opacity-0 group-hover:opacity-60 hover:!opacity-100 flex-none"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (course.currentCourse) void forgetCourse(course.currentCourse);
                    }}
                    role="presentation"
                    title="수강 과목에서 빼기"
                  >
                    ✕
                  </span>
                )}
              </span>
              <span className="text-[9px] opacity-75 font-medium mt-0.5 block truncate">
                {course.placedCount > 0 ? `주 ${course.placedCount}시간` : "미배치"}
              </span>
            </button>
          );
        })}
        <button
          aria-label="새 과목 추가"
          className="min-h-[48px] rounded-lg border border-dashed border-gray-300 hover:border-brand-400 hover:bg-blue-50/40 text-gray-400 hover:text-brand-500 transition flex items-center justify-center text-base font-bold"
          onClick={onAdd}
          title="새 과목 추가"
          type="button"
        >
          +
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 상단 툴바 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-200/80">
        <div>
          <div className="flex items-center gap-2 mb-1 text-xs text-gray-500 font-medium flex-wrap">
            <span className="font-semibold text-brand-600">{selGrade}학년 {selSemester}학기</span>
            <span className="text-gray-300">·</span>
            <span>시간표</span>
            {selectedPeriod === currentPeriod && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] font-bold">현재 학기</span>
              </>
            )}
          </div>
          <h2 className="text-2xl font-bold text-gray-950 tracking-tight">주간 학업 시간표</h2>
        </div>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* 시간표 그리드 */}
        <div className="xl:col-span-8 bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
          <div className="grid grid-cols-6 border-b border-gray-200/80 bg-gray-50/80 text-center text-xs font-bold text-gray-700 py-3">
            <div className="text-gray-400 font-semibold">순서</div>
            {DAYS_KR.map((day) => (
              <div className="flex items-center justify-center gap-1" key={day}>
                <span>{day}</span>
                <span className="text-[10px] text-gray-400 font-normal hidden sm:inline">요일</span>
              </div>
            ))}
          </div>

          <div className="divide-y divide-gray-100 text-xs">
            {PERIOD_TIMES.map(({ period }) => (
              <div
                key={period}
                onDragEnter={() => { if (draggingLunch) setLunchHoverAfterPeriod(period); }}
                onDragOver={(event) => { if (draggingLunch) { event.preventDefault(); updateLunchHover(period, event); } }}
                onDrop={(event) => { if (!draggingLunch) return; event.preventDefault(); setLunchAfterPeriod(lunchHoverAfterPeriod ?? period); setDraggingLunch(false); setLunchHoverAfterPeriod(null); }}
              >
                {draggingLunch && lunchHoverAfterPeriod !== null && period === lunchHoverAfterPeriod + 1 && (
                  <div className="pointer-events-none mx-2 h-1 rounded-full bg-gray-950" aria-hidden="true" />
                )}
                {period === lunchAfterPeriod + 1 && (
                  <div
                    className="relative bg-amber-50/70 border-y border-amber-200/70 py-2 px-4 flex items-center justify-center gap-2 text-xs font-semibold text-amber-900 cursor-ns-resize"
                    draggable
                    onDragStart={() => { setDraggingLunch(true); setLunchHoverAfterPeriod(null); }}
                    onDragEnd={() => { setDraggingLunch(false); setLunchHoverAfterPeriod(null); }}
                    title="왼쪽 교시 번호 위로 드래그해 점심시간 위치를 바꿀 수 있습니다"
                  >
                    <span aria-hidden="true" className="absolute left-4 inline-flex w-4 flex-col gap-1 opacity-60">
                      <span className="h-0.5 w-4 rounded-full bg-amber-700" />
                      <span className="h-0.5 w-4 rounded-full bg-amber-700" />
                    </span>
                    <span>🍽</span><span>점심시간 · 휴식</span>
                  </div>
                )}
                {periodRow(period)}
              </div>
            ))}
            {lunchAfterPeriod === 7 && (
              <>
                {draggingLunch && <div className="pointer-events-none mx-2 h-1 rounded-full bg-gray-950" aria-hidden="true" />}
                <div
                  className="relative bg-amber-50/70 border-y border-amber-200/70 py-2 px-4 flex items-center justify-center gap-2 text-xs font-semibold text-amber-900 cursor-ns-resize"
                  draggable
                  onDragStart={() => { setDraggingLunch(true); setLunchHoverAfterPeriod(null); }}
                  onDragEnd={() => { setDraggingLunch(false); setLunchHoverAfterPeriod(null); }}
                >
                  <span aria-hidden="true" className="absolute left-4 inline-flex w-4 flex-col gap-1 opacity-60">
                    <span className="h-0.5 w-4 rounded-full bg-amber-700" />
                    <span className="h-0.5 w-4 rounded-full bg-amber-700" />
                  </span>
                  <span>🍽</span><span>점심시간 · 휴식</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 우측 패널 — 과목 블록을 끌어 내리는 동안 보이도록 넓은 화면에서는 따라 내려온다. */}
        <div className="xl:col-span-4 space-y-4 xl:sticky xl:top-4">
          {/* 학기 선택 */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
            <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
              <Icon name="calendar" size={14} /> 학기 선택
            </span>
            <select
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold bg-gray-50/50 focus:bg-white focus:border-brand-500 focus:outline-none transition"
              onChange={(e) => handlePeriodChange(e.target.value)}
              value={selectedPeriod}
            >
              {SEMESTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}{opt.value === currentPeriod ? " (현재)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* 과목 블록 — 시간표 칸과 같은 모양. 끌어다 칸에 놓으면 그 과목이 들어간다.
              새 과목은 맨 끝의 "+" 블록에서만 추가한다. */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-900">
                {isCurrentPeriod ? "이번 학기 수강 과목" : "이 학기 과목"}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                {paletteCourses.length}개
              </span>
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed break-keep">
              {paletteCourses.length === 0
                ? "아래 + 블록으로 과목을 추가하면, 끌어다 시간표에 넣을 수 있어요."
                : "블록을 시간표 칸으로 끌어다 놓으세요."}
            </p>
            {renderCourseBlocks({
              draggable: true,
              onPick: (course) => setPlacementCourse({ name: course.fields.courseName, fields: course.fields }),
              onAdd: () => { setDirectPlacement(null); setIsDirectAddModalOpen(true); },
            })}
            {paletteError && <p className="text-[11px] font-semibold text-red-600 break-keep">{paletteError}</p>}
          </div>

          {/* 이 학기의 시간표 */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <span className="text-xs font-bold text-gray-900">이 학기의 시간표</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-brand-600">
                단일 시간표
              </span>
            </div>

            <div className="p-3 rounded-xl border border-brand-200/70 bg-blue-50/30 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-brand-900 truncate">
                  {selGrade}학년 {selSemester}학기 시간표
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-500 text-white flex-none">
                  고정
                </span>
              </div>
              <div className="text-[11px] text-gray-600 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">등록 과목</span>
                  <span className="font-semibold text-gray-800">{uniqueCourses.length}개 과목</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">주당 시수</span>
                  <span className="font-semibold text-gray-800">{slots.length}시수</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">최근 수정</span>
                  <span className="text-gray-600">{activeTimetable.updatedAt || "방금 전"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 과목 상세 드로어 */}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 p-4" onClick={() => setSelectedSlot(null)} role="presentation">
          <aside
            className="w-full max-w-lg max-h-[90vh] rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden"
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-3 flex-none">
              <div className="min-w-0">
                <h3 className="text-lg font-extrabold text-gray-950 tracking-tight truncate">{selectedSlot.courseName}</h3>
              </div>
              <div className="flex items-center gap-2 flex-none">
                <button className="px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700" onClick={() => setEditingSlot(selectedSlot)} type="button">수정</button>
                <button className="text-gray-400 hover:text-gray-700 text-sm" onClick={() => setSelectedSlot(null)} type="button">✕</button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: "이수 단위", value: selectedSlot.units > 0 ? `${selectedSlot.units}단위` : "추후 입력" },
                  { label: "수업 장소", value: selectedSlot.room || "미지정" },
                  { label: "담당 교사", value: selectedSlot.teacher || "미지정" },
                ].map((item) => (
                  <div className="p-3 rounded-xl bg-gray-50/70 border border-gray-100" key={item.label}>
                    <span className="block text-[10px] font-bold text-gray-400">{item.label}</span>
                    <strong className="block text-xs font-bold text-gray-900 mt-0.5 truncate">{item.value}</strong>
                  </div>
                ))}
              </div>

              {/* 이 과목으로 남긴 실제 기록. 없으면 없다고 말한다. */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-gray-900">이 과목으로 남긴 기록</h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-brand-600">
                    {drawerRecords.length}건
                  </span>
                </div>

                {drawerRecords.length === 0 ? (
                  <p className="text-xs text-gray-400 leading-relaxed py-3 break-keep">
                    아직 이 과목으로 남긴 활동이 없습니다. 아래에서 새 활동을 시작해보세요.
                  </p>
                ) : (
                  drawerRecords.map((record) => (
                    <div className="p-3 rounded-xl border border-gray-100 bg-gray-50/60" key={record.id}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-bold text-brand-600">
                          {record.completedAt || record.periodLabel}
                        </span>
                        {record.activityCategory && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-500">
                            {record.activityCategory}
                          </span>
                        )}
                      </div>
                      <strong className="block text-xs font-bold text-gray-900 leading-snug break-keep">{record.title}</strong>
                      {record.summary && (
                        <p className="text-[11px] text-gray-500 leading-relaxed mt-1 line-clamp-2 break-keep">{record.summary}</p>
                      )}
                    </div>
                  ))
                )}
              </section>
            </div>

          </aside>
        </div>
      )}

      {cellChooser && (
        <div className="tt-modal-backdrop" onClick={() => setCellChooser(null)}>
          <div className="tt-dialog-box" onClick={(event) => event.stopPropagation()}>
            <div className="tt-dialog-header">
              <div>
                <h3>{DAYS_KR[cellChooser.day]}요일 {cellChooser.period}교시</h3>
                <p className="text-xs text-gray-500 mt-1">이 칸에 넣을 과목을 고르세요.</p>
              </div>
              <button type="button" onClick={() => setCellChooser(null)}>✕</button>
            </div>
            {renderCourseBlocks({
              draggable: false,
              onPick: (course) => {
                handlePlaceFromPalette(course.key, cellChooser.day, cellChooser.period);
                setCellChooser(null);
              },
              onAdd: () => {
                setDirectPlacement(cellChooser);
                setCellChooser(null);
                setIsDirectAddModalOpen(true);
              },
            })}
          </div>
        </div>
      )}

      {editingSlot && (
        <CourseEditModal slot={editingSlot} onClose={() => setEditingSlot(null)} onSave={handleUpdateSlot} />
      )}


      {isDirectAddModalOpen && (
        <DirectAddModal
          onClose={() => setIsDirectAddModalOpen(false)}
          grade={selGrade}
          semester={selSemester}
          initialPlacement={directPlacement}
          onAddCourse={(course, placement) => {
            void rememberCourse(course);
            if (!isCurrentPeriod) {
              setAddedCourses((current) => ({
                ...current,
                [selectedPeriod]: [...(current[selectedPeriod] ?? []), course],
              }));
            }
            if (placement) {
              handleAddSlot({ id: newSlotId(), ...slotFieldsFor(course), day: placement.day, startPeriod: placement.period, periodSpan: 1 });
            }
            setDirectPlacement(null);
            setIsDirectAddModalOpen(false);
          }}
        />
      )}

      {placementCourse && (
        <PlacementModal
          course={placementCourse}
          onClose={() => setPlacementCourse(null)}
          existingSlots={slots}
          onPlace={(placements) => {
            const fields = placementCourse.fields ?? slotFieldsFor(placementCourse);
            const additions = placements.map(({ day, period }, index) => ({
              id: `slot-${Date.now()}-${index}`,
              ...fields,
              day,
              startPeriod: period,
              periodSpan: 1,
            }));
            handleAddSlots(additions);
          }}
        />
      )}
    </div>
  );
}

function CourseEditModal({ slot, onClose, onSave }: { slot: TimetableSlot; onClose: () => void; onSave: (slot: TimetableSlot) => void }) {
  const [courseName, setCourseName] = useState(slot.courseName);
  const [teacher, setTeacher] = useState(slot.teacher ?? "");
  const [room, setRoom] = useState(slot.room ?? "");
  const [units, setUnits] = useState(slot.units > 0 ? String(slot.units) : "later");

  return (
    <div className="tt-modal-backdrop" onClick={onClose}>
      <div className="tt-dialog-box" onClick={(event) => event.stopPropagation()}>
        <div className="tt-dialog-header"><h3>과목 정보 수정</h3><button type="button" onClick={onClose}>✕</button></div>
        <form className="tt-dialog-form" onSubmit={(event) => { event.preventDefault(); if (!courseName.trim()) return; onSave({ ...slot, courseName: courseName.trim(), teacher: teacher.trim() || undefined, room: room.trim() || undefined, units: units === "later" ? 0 : Number(units), colorIndex: courseColorIndex(courseName.trim()) }); }}>
          {/* 목록에서 고른 과목은 이름을 바꾸면 과목 정보와의 연결이 끊기므로 고정한다. 과목을
              바꾸려면 이 칸을 지우고 새로 추가한다. 기타 과목과 예전 칸만 이름을 고칠 수 있다. */}
          {slot.subjectCode ? (
            <label><span>과목명</span><input readOnly value={courseName} className="bg-gray-50 text-gray-500" /><em className="text-[11px] text-gray-400 not-italic">목록에서 고른 과목이라 이름은 바꿀 수 없어요. 다른 과목이면 지우고 새로 추가해 주세요.</em></label>
          ) : (
            <label><span>과목명 *</span><input required value={courseName} onChange={(event) => setCourseName(event.target.value)} /></label>
          )}
          <div className="tt-form-row">
            <label><span>교사명 <em>(선택)</em></span><input value={teacher} onChange={(event) => setTeacher(event.target.value)} /></label>
            <label><span>강의실 <em>(선택)</em></span><input value={room} onChange={(event) => setRoom(event.target.value)} /></label>
          </div>
          <label><span>단위수 *</span><select required value={units} onChange={(event) => setUnits(event.target.value)}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}단위</option>)}<option value="later">추후 입력</option></select></label>
          <div className="tt-dialog-footer"><button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>취소</button><button type="submit" className="btn btn-primary btn-sm">저장</button></div>
        </form>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   DirectAddModal (직접 과목 추가 모달)
   과목명은 자유 입력이 아니라 카탈로그 후보에서 고른다. 목록에 없는 학교 자체 과목만
   "기타"로 이름을 직접 적는다 — 온보딩의 수강 과목 등록과 같은 규칙이다.
   ────────────────────────────────────────────── */
function DirectAddModal({
  onClose,
  onAddCourse,
  grade,
  semester,
  initialPlacement,
}: {
  onClose: () => void;
  onAddCourse: (course: CourseDraft, placement: Placement | null) => void;
  /** 지금 보고 있는 시간표의 학년·학기 — 학생의 현재 학기가 아닐 수 있다. */
  grade: number;
  semester: number;
  initialPlacement: Placement | null;
}) {
  const [picked, setPicked] = useState<{ name: string; subject?: CatalogSubject } | null>(null);
  const [teacher, setTeacher] = useState("");
  const [room, setRoom] = useState("");
  const [units, setUnits] = useState("");
  const [commonCourses, setCommonCourses] = useState<CatalogSubject[]>([]);
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    commonSubjects(grade, semester)
      .then((response) => {
        if (cancelled) return;
        setCommonCourses(response.items);
        setCurriculum(response.curriculum);
      })
      .catch(() => {
        // 예시는 도움일 뿐이라 못 불러와도 검색으로 고를 수 있다.
        if (!cancelled) setCommonCourses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [grade, semester]);

  const pickSubject = (subject: CatalogSubject) => {
    setPicked({ name: subject.name, subject });
    // 학점을 아직 안 골랐으면 과목의 기본 학점을 채워 준다.
    setUnits((current) => current || String(Math.min(Math.max(subject.default_units, 1), 5)));
    setError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked) {
      setError("과목을 목록에서 골라 주세요. 목록에 없으면 기타로 직접 입력할 수 있어요.");
      return;
    }
    onAddCourse({
      name: picked.name,
      subject: picked.subject,
      teacher: teacher.trim() || undefined,
      room: room.trim() || undefined,
      units: units === "later" || units === "" ? 0 : Number(units),
    }, initialPlacement);
  };

  return (
    <div className="tt-modal-backdrop" onClick={onClose}>
      <div className="tt-dialog-box" onClick={(e) => e.stopPropagation()}>
        <div className="tt-dialog-header">
          <h3>새 과목 추가</h3>
          <button type="button" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="tt-dialog-form">
          <div className="space-y-2">
            <span className="block text-xs font-bold text-gray-700">과목 *</span>
            {picked ? (
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-brand-300 bg-brand-50">
                <span className="text-xs font-bold text-brand-800 truncate">
                  {picked.name}
                  <span className="ml-1.5 font-medium text-gray-500">
                    {picked.subject ? `${picked.subject.group} · ${picked.subject.track ?? picked.subject.category}` : "기타(직접 입력)"}
                  </span>
                </span>
                <button className="text-[11px] font-bold text-gray-500 hover:text-gray-800 flex-none" onClick={() => setPicked(null)} type="button">
                  다시 고르기
                </button>
              </div>
            ) : (
              <SubjectSearchField
                autoFocus
                onPickCustom={(name) => { setPicked({ name }); setError(""); }}
                onPickSubject={pickSubject}
              />
            )}
            {error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}
          </div>
          {!picked && commonCourses.length > 0 && (
            <div className="space-y-2">
              <span className="block text-xs font-bold text-gray-700">
                {grade}학년 {semester}학기에 흔히 듣는 과목 예시
                {curriculum && <span className="ml-1 font-medium text-gray-400">({curriculum} 개정 교육과정)</span>}
              </span>
              <div className="flex flex-wrap gap-2">
                {commonCourses.map((subject) => (
                  <button
                    className="px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition border-gray-200 bg-gray-50 text-gray-600 hover:border-brand-300 hover:bg-brand-50"
                    key={subject.code}
                    onClick={() => pickSubject(subject)}
                    type="button"
                  >
                    {subject.name}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400">학교마다 개설 과목이 달라요. 위 검색칸에서 찾아 고르세요.</p>
            </div>
          )}
          <div className="tt-form-row">
            <label>
              <span>교사명 <em>(선택)</em></span>
              <input
                type="text"
                placeholder="예: 박교사"
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
              />
            </label>
            <label>
              <span>강의실 <em>(선택)</em></span>
              <input
                type="text"
                placeholder="예: 과학실"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
              />
            </label>
          </div>
          <div className="tt-form-row">
            <label>
              <span>단위수 *</span>
              <select required value={units} onChange={(e) => setUnits(e.target.value)}>
                <option value="">단위수 선택</option>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}단위</option>)}
                <option value="later">추후 입력</option>
              </select>
            </label>
          </div>
          <p className="text-[11px] text-gray-400">{initialPlacement ? "고른 칸에 바로 들어가고, 오른쪽 과목 블록에도 생겨 다른 시간에도 넣을 수 있어요." : "오른쪽 과목 블록에 추가돼요. 블록을 끌어다 시간표에 넣으세요."}</p>
          <div className="tt-dialog-footer">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!picked}>
              {initialPlacement ? "이 칸에 추가" : "과목 블록에 추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PlacementModal({
  course,
  existingSlots,
  onClose,
  onPlace,
}: {
  course: CourseDraft;
  existingSlots: TimetableSlot[];
  onClose: () => void;
  onPlace: (placements: Placement[]) => void;
}) {
  const [selected, setSelected] = useState<Placement[]>([]);
  // 부모 시간표 갱신이 반영되기 전에도 방금 추가한 칸을 즉시 점유 상태로 표시한다.
  const [addedPlacements, setAddedPlacements] = useState<Placement[]>([]);

  const isOccupied = (day: number, period: number) =>
    existingSlots.some((slot) => slot.day === day && slot.startPeriod === period) ||
    addedPlacements.some((placement) => placement.day === day && placement.period === period);

  return (
    <div className="tt-modal-backdrop" onClick={onClose}>
      <div className="tt-dialog-box" onClick={(event) => event.stopPropagation()}>
        <div className="tt-dialog-header">
          <div><h3>시간표에 배치</h3><p className="text-xs text-gray-500 mt-1">{course.name}을(를) 어느 시간에 넣을까요?</p></div>
          <button type="button" onClick={onClose}>✕</button>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
            <div className="grid grid-cols-6 bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 text-center">
              <span className="py-2">교시</span>{DAYS_KR.map((day) => <span className="py-2" key={day}>{day}</span>)}
            </div>
            {PERIOD_TIMES.map(({ period }) => (
              <div className="grid grid-cols-6 border-b last:border-b-0 border-gray-100" key={period}>
                <span className="flex items-center justify-center py-2 text-[11px] font-bold text-gray-400 bg-gray-50/60">{period}</span>
                {DAYS_KR.map((_, day) => {
                  const occupied = existingSlots.find((slot) => slot.day === day && slot.startPeriod === period);
                  const newlyAdded = addedPlacements.some((placement) => placement.day === day && placement.period === period);
                  const isSelected = selected.some((placement) => placement.day === day && placement.period === period);
                  return <button aria-label={`${DAYS_KR[day]}요일 ${period}교시`} className={`min-h-10 m-1 rounded-lg border text-[10px] font-bold transition ${isSelected ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-100" : occupied || newlyAdded ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed" : "border-dashed border-gray-200 text-gray-300 hover:border-brand-300 hover:bg-brand-50/60 hover:text-brand-600"}`} disabled={Boolean(occupied || newlyAdded)} key={`${day}-${period}`} onClick={() => setSelected((current) => isSelected ? current.filter((placement) => !(placement.day === day && placement.period === period)) : [...current, { day, period }])} type="button">{occupied ? occupied.courseName : newlyAdded ? course.name : isSelected ? course.name : "+"}</button>;
                })}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">원하는 칸을 누르면 파란색으로 표시됩니다. 같은 과목을 다른 칸에 추가하려면 배치를 반복하세요.</p>
          <div className="tt-dialog-footer"><button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>닫기</button><button type="button" className="btn btn-primary btn-sm" disabled={selected.length === 0} onClick={() => { if (selected.length === 0) return; onPlace(selected); setAddedPlacements((current) => [...current, ...selected]); setSelected([]); }}>선택한 {selected.length || ""}곳에 추가</button></div>
        </div>
      </div>
    </div>
  );
}
