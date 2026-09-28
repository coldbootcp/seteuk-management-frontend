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
  listSubjects,
  timetableCategoryOf,
  timetableGroupOf,
  type CatalogSubject,
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

type Placement = { day: number; period: number };

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
  const courseColorMap = useMemo(() => {
    const names = Array.from(new Set(slots.map((slot) => slot.courseName))).sort((a, b) => a.localeCompare(b));
    return new Map(names.map((name, index) => [name, index % PALETTE_COLORS.length]));
  }, [slots]);

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
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isDirectAddModalOpen, setIsDirectAddModalOpen] = useState(false);
  const [placementCourse, setPlacementCourse] = useState<CourseDraft | null>(null);
  const [directPlacement, setDirectPlacement] = useState<Placement | null>(null);
  const [lunchAfterPeriod, setLunchAfterPeriod] = useState(4);
  const [draggingLunch, setDraggingLunch] = useState(false);
  const [lunchHoverAfterPeriod, setLunchHoverAfterPeriod] = useState<number | null>(null);
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);

  // 등록된 고유 과목 목록
  const uniqueCourses = Array.from(new Set(slots.map((s) => s.courseName)));

  // 슬롯 추가 핸들러
  const handleAddSlot = (newSlot: TimetableSlot) => {
    handleAddSlots([newSlot]);
  };

  const handleAddSlots = (newSlots: TimetableSlot[]) => {
    const updated = {
      ...activeTimetable,
      slots: [...activeTimetable.slots, ...newSlots],
      updatedAt: "방금 전",
    };
    const exists = timetables.some((t) => t.grade === selGrade && t.semester === selSemester);
    const updatedAll = exists
      ? timetables.map((t) => (t.grade === selGrade && t.semester === selSemester ? updated : t))
      : [...timetables, updated];
    onTimetablesChange(updatedAll);
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

          return (
            <div className="p-1.5 border-r border-gray-100 last:border-r-0 flex flex-col" key={`${dayIdx}-${period}`}>
              {occupied ? null : slot && palette ? (
                <button
                  draggable
                  className="flex-1 w-full p-2 rounded-xl border text-left transition hover:shadow-md flex flex-col justify-between group"
                  onClick={() => setSelectedSlot(slot)}
                  onDragStart={(event) => { event.stopPropagation(); setDraggingSlotId(slot.id); }}
                  onDragEnd={() => setDraggingSlotId(null)}
                  onDragOver={(event) => { if (draggingSlotId) event.preventDefault(); }}
                  onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (draggingSlotId) handleMoveSlot(draggingSlotId, dayIdx, period); setDraggingSlotId(null); }}
                  style={{
                    backgroundColor: palette.bg,
                    borderColor: isSelected ? "#3182F6" : palette.border,
                    boxShadow: isSelected ? "0 0 0 2px rgba(49,130,246,0.25)" : undefined,
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
                  className="flex-1 w-full rounded-xl border border-dashed border-gray-200 hover:border-brand-400 hover:bg-blue-50/40 transition flex items-center justify-center text-gray-300 hover:text-brand-500 text-xs font-bold"
                  onClick={() => { setDirectPlacement({ day: dayIdx, period }); setIsDirectAddModalOpen(true); }}
                  onDragOver={(event) => { if (draggingSlotId) event.preventDefault(); }}
                  onDrop={(event) => { event.preventDefault(); if (draggingSlotId) handleMoveSlot(draggingSlotId, dayIdx, period); setDraggingSlotId(null); }}
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

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            className="px-3.5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition flex items-center gap-1.5"
            onClick={() => { setDirectPlacement(null); setIsDirectAddModalOpen(true); }}
            type="button"
          >
            <span>+</span>
            <span>과목 직접 등록</span>
          </button>
          <button
            className="px-3 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
            onClick={() => setIsSearchModalOpen(true)}
            type="button"
          >
            <Icon name="search" size={14} />
            <span>과목 검색·불러오기</span>
          </button>
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

        {/* 우측 패널 */}
        <div className="xl:col-span-4 space-y-4">
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

      {editingSlot && (
        <CourseEditModal slot={editingSlot} onClose={() => setEditingSlot(null)} onSave={handleUpdateSlot} />
      )}

      {isSearchModalOpen && (
        <CourseSearchModal
          onClose={() => setIsSearchModalOpen(false)}
          onSelectCourse={(subject) => {
            setPlacementCourse({ name: subject.name, units: subject.default_units, subject });
            setIsSearchModalOpen(false);
          }}
        />
      )}

      {isDirectAddModalOpen && (
        <DirectAddModal
          onClose={() => setIsDirectAddModalOpen(false)}
          grade={selGrade}
          semester={selSemester}
          initialPlacement={directPlacement}
          onAddCourse={(course, placement) => {
            if (placement) {
              handleAddSlot({
                id: `slot-${Date.now()}`,
                ...slotFieldsFor(course),
                day: placement.day,
                startPeriod: placement.period,
                periodSpan: 1,
              });
              setPlacementCourse(course);
            } else {
              setPlacementCourse(course);
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
            const fields = slotFieldsFor(placementCourse);
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
   CourseSearchModal (개설 과목 검색 바텀시트)
   ────────────────────────────────────────────── */
const SEARCH_GROUP_FILTERS = ["all", "국어", "수학", "영어", "사회", "과학", "기술가정/정보", "체육/예술", "기타"] as const;

function CourseSearchModal({
  onClose,
  onSelectCourse,
}: {
  onClose: () => void;
  onSelectCourse: (subject: CatalogSubject) => void;
}) {
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [subjects, setSubjects] = useState<CatalogSubject[] | null>(null);
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listSubjects()
      .then((response) => {
        if (cancelled) return;
        setSubjects(response.items);
        setCurriculum(response.curriculum);
      })
      .catch((caught) => {
        if (!cancelled) setLoadError(caught instanceof Error ? caught.message : "과목 목록을 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const keyword = searchKeyword.trim().toLowerCase().replace(/\s+/g, "");
  const filteredCourses = (subjects ?? []).filter((subject) => {
    const matchGroup = filterGroup === "all" || timetableGroupOf(subject) === filterGroup;
    const matchKeyword = !keyword || subject.name.toLowerCase().replace(/\s+/g, "").includes(keyword);
    return matchGroup && matchKeyword;
  });

  return (
    <div className="tt-modal-backdrop" onClick={onClose}>
      <div className="tt-bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tt-sheet-header">
          <div>
            <h3>{curriculum ? `${curriculum} 개정 교육과정 ` : ""}과목 목록</h3>
            <small>시간표에 추가할 과목을 선택하세요</small>
          </div>
          <button type="button" className="tt-sheet-close" onClick={onClose}>
            닫기
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          과목을 고른 뒤 요일과 교시를 한 번 더 선택합니다. 목록에 없는 학교 자체 과목은 &lsquo;직접 추가&rsquo;에서 기타로 넣을 수 있어요.
        </p>

        {/* 검색 필터 바 (에브리타임 스타일) */}
        <div className="tt-sheet-filters">
          <div className="tt-filter-tabs">
            {SEARCH_GROUP_FILTERS.map((grp) => (
              <button
                key={grp}
                type="button"
                className={`tt-filter-pill ${filterGroup === grp ? "active" : ""}`}
                onClick={() => setFilterGroup(grp)}
              >
                {grp === "all" ? "전체" : grp}
              </button>
            ))}
          </div>

          <div className="tt-search-input-box">
            <input
              type="text"
              placeholder="과목명 검색 (예: 물리, 기하, 미적분, 정보...)"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </div>
        </div>

        {/* 과목 목록 테이블 */}
        <div className="tt-course-table-container">
          {loadError ? (
            <p className="p-4 text-xs font-semibold text-red-600">{loadError}</p>
          ) : subjects === null ? (
            <p className="p-4 text-xs text-gray-400">과목 목록을 불러오는 중…</p>
          ) : filteredCourses.length === 0 ? (
            <p className="p-4 text-xs text-gray-500">조건에 맞는 과목이 없어요.</p>
          ) : (
            <table className="tt-course-table">
              <thead>
                <tr>
                  <th>교과구분</th>
                  <th>과목명</th>
                  <th>교과(군)</th>
                  <th>기본 학점</th>
                  <th>담기</th>
                </tr>
              </thead>
              <tbody>
                {filteredCourses.map((subject) => (
                  <tr key={subject.code}>
                    <td><span className="tt-cat-badge">{subject.track ?? subject.category}</span></td>
                    <td><strong>{subject.name}</strong></td>
                    <td>{subject.group}</td>
                    <td>{subject.default_units}학점(단위)</td>
                    <td>
                      <button
                        type="button"
                        className="tt-btn-add-course"
                        onClick={() => onSelectCourse(subject)}
                      >
                        + 담기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
          <h3>수업 직접 추가</h3>
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
          <p className="text-[11px] text-gray-400">{initialPlacement ? "입력하면 위 위치에 바로 추가되고, 이후 다른 시간에도 추가할 수 있습니다." : "입력 후 시간표에서 배치 위치를 선택합니다."}</p>
          <div className="tt-dialog-footer">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!picked}>
              시간표에 추가
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
