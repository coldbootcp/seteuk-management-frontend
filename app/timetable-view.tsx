"use client";

import { useState, useEffect } from "react";
import {
  DAYS_KR,
  PERIOD_TIMES,
  SUBJECT_PRESETS,
  PALETTE_COLORS,
  getGroupColor,
  type TimetableSlot,
  type TimetableConfig,
  type PresetCourse,
  type HighSchoolCourseCategory,
  type SubjectGroup,
} from "./types/academic";
import type { StudentActivity } from "../lib/product-harness";

interface TimetableViewProps {
  currentGrade: number;
  currentSemester: number;
  /** 과목별 기록 수와 서랍의 목록을 실제 값으로 채우기 위한 활동 전체. */
  activities: StudentActivity[];
  timetables: TimetableConfig[];
  onTimetablesChange: (timetables: TimetableConfig[]) => void;
  onNavigateToGrades?: () => void;
  onNavigateToActivities?: (subjectName: string) => void;
  onUpdateCurrentPeriod?: (grade: number, semester: number) => Promise<void> | void;
}

export function TimetableView({
  currentGrade,
  currentSemester,
  activities,
  timetables,
  onTimetablesChange,
  onNavigateToGrades,
  onNavigateToActivities,
  onUpdateCurrentPeriod,
}: TimetableViewProps) {
  const currentPeriod = `${currentGrade}-${currentSemester}`;
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);
  const [isUpdatingPeriod, setIsUpdatingPeriod] = useState(false);

  // Sync selectedPeriod when currentGrade or currentSemester changes
  useEffect(() => {
    setSelectedPeriod(`${currentGrade}-${currentSemester}`);
  }, [currentGrade, currentSemester]);

  const [selGrade, selSemester] = selectedPeriod.split("-").map(Number);
  const periodTimetables = timetables.filter(
    (t) => t.grade === selGrade && t.semester === selSemester
  );

  const [activeTimetableId, setActiveTimetableId] = useState<string>(() => {
    const matching = timetables.filter((t) => t.grade === currentGrade && t.semester === currentSemester);
    return matching.find((t) => t.isDefault)?.id || matching[0]?.id || timetables.find((t) => t.isDefault)?.id || timetables[0]?.id || "tt-main";
  });

  // 현재 활성 시간표 (선택된 학기 기준)
  const activeTimetable =
    periodTimetables.find((t) => t.id === activeTimetableId) ||
    periodTimetables.find((t) => t.isDefault) ||
    periodTimetables[0] || {
      id: `tt-${selGrade}-${selSemester}-main`,
      name: `${selGrade}학년 ${selSemester}학기 기본 시간표`,
      grade: selGrade,
      semester: selSemester,
      isDefault: true,
      slots: [],
      updatedAt: "방금 전",
    };
  const slots = activeTimetable.slots;

  // 학기 변경 핸들러
  const handlePeriodChange = (newPeriod: string) => {
    setSelectedPeriod(newPeriod);
    const [g, s] = newPeriod.split("-").map(Number);
    const matching = timetables.filter((t) => t.grade === g && t.semester === s);
    if (matching.length > 0) {
      const def = matching.find((t) => t.isDefault) || matching[0];
      setActiveTimetableId(def.id);
    } else {
      const newTt: TimetableConfig = {
        id: `tt-${g}-${s}-${Date.now()}`,
        name: `${g}학년 ${s}학기 기본 시간표`,
        grade: g,
        semester: s,
        isDefault: true,
        slots: [],
        updatedAt: "방금 전",
      };
      onTimetablesChange([...timetables, newTt]);
      setActiveTimetableId(newTt.id);
    }
    setSelectedSlot(null);
  };

  // 선택된 과목 슬롯 (세특 퀵 드로어용)
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);

  // 모달 상태
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isDirectAddModalOpen, setIsDirectAddModalOpen] = useState(false);

  // 총 이수 단위 계산 (고유 과목명 기준)
  const uniqueCourses = Array.from(new Set(slots.map((s) => s.courseName)));
  const totalUnits = uniqueCourses.reduce((acc, courseName) => {
    const found = slots.find((s) => s.courseName === courseName);
    return acc + (found?.units || 4);
  }, 0);

  // 기본 시간표로 설정 핸들러 (학생의 공식 수강 과목으로 확정)
  const handleSetAsDefault = (targetId: string) => {
    const updated = timetables.map((t) => ({
      ...t,
      isDefault: t.id === targetId,
      updatedAt: t.id === targetId ? "방금 전 (기본 설정)" : t.updatedAt,
    }));
    onTimetablesChange(updated);
  };

  // 슬롯 추가 핸들러
  const handleAddSlot = (newSlot: TimetableSlot) => {
    const updated = {
      ...activeTimetable,
      slots: [...activeTimetable.slots, newSlot],
      updatedAt: "방금 전",
    };
    const updatedAll = timetables.some((t) => t.id === activeTimetable.id)
      ? timetables.map((t) => (t.id === activeTimetable.id ? updated : t))
      : [...timetables, updated];
    onTimetablesChange(updatedAll);
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
    const updatedAll = timetables.map((t) => (t.id === activeTimetable.id ? updated : t));
    onTimetablesChange(updatedAll);
    if (selectedSlot?.id === slotId) setSelectedSlot(null);
  };

  // 시간표 삭제 핸들러 (최소 1개 유지 및 확인)
  const handleDeleteTimetable = (timetableId: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (periodTimetables.length <= 1) {
      alert("해당 학기에는 최소 1개의 시간표가 유지되어야 합니다.");
      return;
    }
    if (!window.confirm(`'${name}' 시간표를 정말 삭제하시겠습니까?`)) {
      return;
    }
    const filtered = timetables.filter((t) => t.id !== timetableId);
    const remainingPeriodTimetables = filtered.filter((t) => t.grade === selGrade && t.semester === selSemester);
    if (activeTimetable.isDefault && remainingPeriodTimetables.length > 0) {
      remainingPeriodTimetables[0].isDefault = true;
    }
    onTimetablesChange(filtered);
    if (activeTimetableId === timetableId && remainingPeriodTimetables.length > 0) {
      setActiveTimetableId(remainingPeriodTimetables[0].id);
      setSelectedSlot(null);
    }
  };

  /**
   * 과목별 요약. 예전 서랍은 "2건 진행 중 · D-12" 같은 값을 하드코딩해 보여줬는데,
   * 그건 어디에도 없는 숫자였다. 이제 실제 활동 기록에서 센다.
   */
  const courseSummary = uniqueCourses
    .map((name) => {
      const courseSlots = slots.filter((s) => s.courseName === name);
      return {
        name,
        slot: courseSlots[0],
        hours: courseSlots.reduce((sum, s) => sum + s.periodSpan, 0),
        recordCount: activities.filter((activity) => activity.subject === name).length,
      };
    })
    .sort((a, b) => b.hours - a.hours);

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
  function periodRow(period: number, time: string) {
    return (
      <div className="grid grid-cols-6 min-h-[78px]" key={period}>
        <div className="flex flex-col items-center justify-center border-r border-gray-100 bg-gray-50/40 py-2">
          <span className="font-extrabold text-sm text-gray-800">{period}</span>
          <span className="text-[10px] text-gray-400 font-mono mt-0.5">{time.split(" - ")[0]}</span>
        </div>

        {DAYS_KR.map((_, dayIdx) => {
          const slot = slots.find((s) => s.day === dayIdx && s.startPeriod === period);
          // 앞 교시에서 시작해 이 교시를 이미 차지하고 있으면 빈칸을 그리지 않는다.
          const occupied = slots.some(
            (s) => s.day === dayIdx && s.startPeriod < period && s.startPeriod + s.periodSpan > period,
          );
          const palette = slot ? getGroupColor(slot.group, slot.colorIndex) : null;
          const isSelected = Boolean(slot && selectedSlot?.id === slot.id);

          return (
            <div className="p-1.5 border-r border-gray-100 last:border-r-0 flex flex-col" key={`${dayIdx}-${period}`}>
              {occupied ? null : slot && palette ? (
                <button
                  className="flex-1 w-full p-2 rounded-xl border text-left transition hover:shadow-md flex flex-col justify-between group"
                  onClick={() => setSelectedSlot(slot)}
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
                    {[slot.room, slot.teacher].filter(Boolean).join(" · ") || `${slot.units}단위`}
                  </span>
                </button>
              ) : (
                <button
                  className="flex-1 w-full rounded-xl border border-dashed border-gray-200 hover:border-brand-400 hover:bg-blue-50/40 transition flex items-center justify-center text-gray-300 hover:text-brand-500 text-xs font-bold"
                  onClick={() => setIsDirectAddModalOpen(true)}
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
            <span>{activeTimetable.name}</span>
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
            onClick={() => setIsDirectAddModalOpen(true)}
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
            <span>🔍</span>
            <span>과목 검색·불러오기</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* 시간표 그리드 */}
        <div className="xl:col-span-8 bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
          <div className="grid grid-cols-6 border-b border-gray-200/80 bg-gray-50/80 text-center text-xs font-bold text-gray-700 py-3">
            <div className="text-gray-400 font-semibold">교시</div>
            {DAYS_KR.map((day) => (
              <div className="flex items-center justify-center gap-1" key={day}>
                <span>{day}</span>
                <span className="text-[10px] text-gray-400 font-normal hidden sm:inline">요일</span>
              </div>
            ))}
          </div>

          <div className="divide-y divide-gray-100 text-xs">
            {PERIOD_TIMES.filter((p) => p.period <= 4).map(({ period, time }) => periodRow(period, time))}
          </div>

          <div className="bg-amber-50/70 border-y border-amber-200/70 py-2 px-4 flex items-center justify-center gap-2 text-xs font-semibold text-amber-900">
            <span>🍽</span>
            <span>점심시간 &amp; 휴식 (12:50 ~ 13:50 · 60분)</span>
          </div>

          <div className="divide-y divide-gray-100 text-xs">
            {PERIOD_TIMES.filter((p) => p.period >= 5).map(({ period, time }) => periodRow(period, time))}
          </div>

          <div className="p-4 px-5 bg-gray-50/70 border-t border-gray-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-600 font-medium">
            <div className="flex items-center gap-4 flex-wrap">
              <span>수강 과목 <strong className="text-gray-900">{uniqueCourses.length}개</strong></span>
              <span className="text-gray-300">·</span>
              <span>주당 <strong className="text-gray-900">{slots.length}시수</strong></span>
              <span className="text-gray-300">·</span>
              <span className="text-brand-600 font-bold">총 {totalUnits}단위</span>
            </div>
            <div className="text-[11px] text-gray-500">💡 과목 카드를 누르면 그 과목의 기록이 열립니다.</div>
          </div>
        </div>

        {/* 우측 패널 */}
        <div className="xl:col-span-4 space-y-4">
          {/* 학기 선택 */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
            <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
              <span>🗓</span> 학기 선택
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

            {selectedPeriod !== currentPeriod && onUpdateCurrentPeriod && (
              <button
                className="w-full py-2.5 rounded-xl bg-blue-50 border border-brand-200 text-brand-600 text-xs font-bold hover:bg-blue-100 disabled:opacity-60 transition"
                disabled={isUpdatingPeriod}
                onClick={async () => {
                  setIsUpdatingPeriod(true);
                  try {
                    await onUpdateCurrentPeriod(selGrade, selSemester);
                  } finally {
                    setIsUpdatingPeriod(false);
                  }
                }}
                type="button"
              >
                {isUpdatingPeriod ? "변경 중…" : `📍 현재 학기를 ${selGrade}학년 ${selSemester}학기로 설정`}
              </button>
            )}
          </div>

          {/* 시간표 목록 */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <span className="text-xs font-bold text-gray-900">이 학기의 시간표</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-brand-600">
                {periodTimetables.length || 1}개
              </span>
            </div>

            <div className="space-y-1.5">
              {periodTimetables.map((t) => {
                const isActive = t.id === activeTimetable.id;
                return (
                  <div
                    className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-2 ${
                      isActive ? "border-brand-300 bg-blue-50/40" : "border-gray-100 hover:border-gray-200"
                    }`}
                    key={t.id}
                  >
                    <button
                      className="flex-1 min-w-0 text-left"
                      onClick={() => {
                        setActiveTimetableId(t.id);
                        setSelectedSlot(null);
                      }}
                      type="button"
                    >
                      <span className={`block text-xs font-bold truncate ${isActive ? "text-brand-700" : "text-gray-800"}`}>
                        {t.name}
                      </span>
                      <span className="block text-[10px] text-gray-400 mt-0.5">{t.updatedAt} 변경</span>
                    </button>

                    {t.isDefault ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-900 text-white flex-none">기본</span>
                    ) : (
                      <button
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 flex-none"
                        onClick={() => handleSetAsDefault(t.id)}
                        title="이 시간표를 기본으로 설정"
                        type="button"
                      >
                        기본으로
                      </button>
                    )}

                    {periodTimetables.length > 1 && (
                      <button
                        className="text-gray-300 hover:text-red-500 text-xs font-bold flex-none"
                        onClick={(e) => handleDeleteTimetable(t.id, t.name, e)}
                        title="시간표 삭제"
                        type="button"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              className="w-full py-2.5 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50/40 text-xs font-semibold transition"
              onClick={() => {
                const name = prompt("새 시간표 이름을 입력하세요 (예: 2학기 이동수업안)");
                if (name) {
                  const newTt: TimetableConfig = {
                    id: `tt-${Date.now()}`,
                    name,
                    grade: selGrade,
                    semester: selSemester,
                    isDefault: false,
                    slots: [],
                    updatedAt: "방금 전",
                  };
                  onTimetablesChange([...timetables, newTt]);
                  setActiveTimetableId(newTt.id);
                }
              }}
              type="button"
            >
              + 새 시간표 만들기
            </button>
          </div>

          {/* 과목별 주당 시수 */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <span className="text-xs font-bold text-gray-900">과목별 주당 시수</span>
              <span className="text-[11px] text-gray-400">누르면 상세</span>
            </div>

            {courseSummary.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center break-keep">
                아직 등록한 과목이 없습니다. 위의 [과목 직접 등록]으로 시작하세요.
              </p>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {courseSummary.map((course) => {
                  const palette = getGroupColor(course.slot.group, course.slot.colorIndex);
                  return (
                    <button
                      className="w-full p-3 rounded-xl border border-gray-100 hover:border-brand-200 hover:bg-blue-50/30 transition flex items-center justify-between gap-2 text-left"
                      key={course.name}
                      onClick={() => setSelectedSlot(course.slot)}
                      type="button"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ backgroundColor: palette.border }} />
                        <span className="min-w-0">
                          <span className="block font-bold text-xs text-gray-900 truncate">{course.name}</span>
                          <span className="block text-[10px] text-gray-500 truncate">
                            {[course.slot.teacher, course.slot.room].filter(Boolean).join(" · ") || course.slot.group}
                          </span>
                        </span>
                      </span>
                      <span className="text-right flex-none">
                        <span className="block text-xs font-bold text-gray-900 font-mono">주 {course.hours}시수</span>
                        <span className="block text-[10px] font-semibold text-brand-600">기록 {course.recordCount}건</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 과목 상세 드로어 */}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/30" onClick={() => setSelectedSlot(null)} role="presentation">
          <aside
            className="w-full max-w-sm h-full bg-white shadow-2xl flex flex-col"
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-3 flex-none">
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-gray-400 block">
                  {selectedSlot.category} · {selectedSlot.group}
                </span>
                <h3 className="text-lg font-extrabold text-gray-950 tracking-tight truncate">{selectedSlot.courseName}</h3>
              </div>
              <button
                className="text-gray-400 hover:text-gray-700 text-sm flex-none"
                onClick={() => setSelectedSlot(null)}
                type="button"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: "이수 단위", value: `${selectedSlot.units}단위` },
                  { label: "수업 장소", value: selectedSlot.room || "미지정" },
                  { label: "담당 교사", value: selectedSlot.teacher || "미지정" },
                  { label: "교과 구분", value: selectedSlot.category },
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

            <div className="p-5 border-t border-gray-100 space-y-2 flex-none">
              <button
                className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition"
                onClick={() => onNavigateToActivities?.(selectedSlot.courseName)}
                type="button"
              >
                📝 이 과목으로 새 활동 기록하기
              </button>
              <button
                className="w-full py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-100 transition"
                onClick={onNavigateToGrades}
                type="button"
              >
                📊 이 과목 성적 입력 / 조회
              </button>
            </div>
          </aside>
        </div>
      )}

      {isSearchModalOpen && (
        <CourseSearchModal
          onClose={() => setIsSearchModalOpen(false)}
          onSelectCourse={(course, day, period) => {
            const newSlot: TimetableSlot = {
              id: `slot-${Date.now()}`,
              courseName: course.name,
              category: course.category,
              group: course.group,
              units: course.defaultUnits,
              day,
              startPeriod: period,
              periodSpan: 1,
              colorIndex: Math.floor(Math.random() * PALETTE_COLORS.length),
              isCareerRelated: course.group === "과학" || course.group === "수학" || course.group === "기술가정/정보",
            };
            handleAddSlot(newSlot);
            setIsSearchModalOpen(false);
          }}
        />
      )}

      {isDirectAddModalOpen && (
        <DirectAddModal
          onClose={() => setIsDirectAddModalOpen(false)}
          onAddSlot={(slot) => {
            handleAddSlot(slot);
            setIsDirectAddModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   CourseSearchModal (개설 과목 검색 바텀시트)
   ────────────────────────────────────────────── */
function CourseSearchModal({
  onClose,
  onSelectCourse,
}: {
  onClose: () => void;
  onSelectCourse: (course: PresetCourse, day: number, period: number) => void;
}) {
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [selectedPeriod, setSelectedPeriod] = useState<number>(1);

  const filteredCourses = SUBJECT_PRESETS.filter((c) => {
    const matchGroup = filterGroup === "all" || c.group === filterGroup;
    const matchKeyword = !searchKeyword || c.name.toLowerCase().includes(searchKeyword.toLowerCase());
    return matchGroup && matchKeyword;
  });

  return (
    <div className="tt-modal-backdrop" onClick={onClose}>
      <div className="tt-bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tt-sheet-header">
          <div>
            <h3>2022 개정 교육과정 개설 과목 검색</h3>
            <small>시간표에 추가할 과목을 선택하세요</small>
          </div>
          <button type="button" className="tt-sheet-close" onClick={onClose}>
            닫기
          </button>
        </div>

        {/* 시간대 선택기 */}
        <div className="tt-slot-picker-row">
          <label>추가할 시간:</label>
          <select value={selectedDay} onChange={(e) => setSelectedDay(Number(e.target.value))}>
            {DAYS_KR.map((day, idx) => (
              <option key={day} value={idx}>{day}요일</option>
            ))}
          </select>
          <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(Number(e.target.value))}>
            {PERIOD_TIMES.map(({ period }) => (
              <option key={period} value={period}>{period}교시</option>
            ))}
          </select>
        </div>

        {/* 검색 필터 바 (에브리타임 스타일) */}
        <div className="tt-sheet-filters">
          <div className="tt-filter-tabs">
            {["all", "과학", "수학", "기술가정/정보", "국어", "영어", "사회"].map((grp) => (
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
              placeholder="과목명 검색 (예: 물리학, 기하, 미적분, 정보...)"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </div>
        </div>

        {/* 과목 목록 테이블 */}
        <div className="tt-course-table-container">
          <table className="tt-course-table">
            <thead>
              <tr>
                <th>코드</th>
                <th>교과구분</th>
                <th>과목명</th>
                <th>교과군</th>
                <th>단위수</th>
                <th>설명</th>
                <th>담기</th>
              </tr>
            </thead>
            <tbody>
              {filteredCourses.map((course) => (
                <tr key={course.code}>
                  <td><span className="tt-code-badge">{course.code}</span></td>
                  <td><span className="tt-cat-badge">{course.category}</span></td>
                  <td><strong>{course.name}</strong></td>
                  <td>{course.group}</td>
                  <td>{course.defaultUnits}학점(단위)</td>
                  <td className="tt-desc-cell">{course.description || "-"}</td>
                  <td>
                    <button
                      type="button"
                      className="tt-btn-add-course"
                      onClick={() => onSelectCourse(course, selectedDay, selectedPeriod)}
                    >
                      + 담기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   DirectAddModal (직접 과목 추가 모달)
   ────────────────────────────────────────────── */
function DirectAddModal({
  onClose,
  onAddSlot,
}: {
  onClose: () => void;
  onAddSlot: (slot: TimetableSlot) => void;
}) {
  const [courseName, setCourseName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [room, setRoom] = useState("");
  const [day, setDay] = useState(0);
  const [startPeriod, setStartPeriod] = useState(1);
  const [category, setCategory] = useState<HighSchoolCourseCategory>("일반선택");
  const [group, setGroup] = useState<SubjectGroup>("과학");
  const [units, setUnits] = useState(4);
  const [isCareerRelated, setIsCareerRelated] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName.trim()) {
      alert("과목명을 입력해주세요.");
      return;
    }
    const newSlot: TimetableSlot = {
      id: `slot-${Date.now()}`,
      courseName: courseName.trim(),
      teacher: teacher.trim() || undefined,
      room: room.trim() || undefined,
      day,
      startPeriod,
      periodSpan: 1,
      category,
      group,
      units,
      colorIndex: Math.floor(Math.random() * PALETTE_COLORS.length),
      isCareerRelated,
    };
    onAddSlot(newSlot);
  };

  return (
    <div className="tt-modal-backdrop" onClick={onClose}>
      <div className="tt-dialog-box" onClick={(e) => e.stopPropagation()}>
        <div className="tt-dialog-header">
          <h3>수업 직접 추가</h3>
          <button type="button" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="tt-dialog-form">
          <label>
            <span>과목명 *</span>
            <input
              type="text"
              required
              placeholder="예: 물리학Ⅱ"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
            />
          </label>
          <div className="tt-form-row">
            <label>
              <span>교사명</span>
              <input
                type="text"
                placeholder="예: 박교사"
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
              />
            </label>
            <label>
              <span>강의실</span>
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
              <span>요일</span>
              <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
                {DAYS_KR.map((d, idx) => (
                  <option key={d} value={idx}>{d}요일</option>
                ))}
              </select>
            </label>
            <label>
              <span>교시</span>
              <select value={startPeriod} onChange={(e) => setStartPeriod(Number(e.target.value))}>
                {PERIOD_TIMES.map(({ period }) => (
                  <option key={period} value={period}>{period}교시</option>
                ))}
              </select>
            </label>
            <label>
              <span>단위수</span>
              <input
                type="number"
                min="1"
                max="8"
                value={units}
                onChange={(e) => setUnits(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="tt-form-row">
            <label>
              <span>교과군</span>
              <select value={group} onChange={(e) => setGroup(e.target.value as SubjectGroup)}>
                <option value="과학">과학</option>
                <option value="수학">수학</option>
                <option value="기술가정/정보">기술가정/정보</option>
                <option value="국어">국어</option>
                <option value="영어">영어</option>
                <option value="사회">사회</option>
                <option value="체육/예술">체육/예술</option>
                <option value="기타">기타</option>
              </select>
            </label>
            <label>
              <span>구분</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as HighSchoolCourseCategory)}>
                <option value="공통">공통</option>
                <option value="일반선택">일반선택</option>
                <option value="진로선택">진로선택</option>
                <option value="융합선택">융합선택</option>
              </select>
            </label>
          </div>
          <label className="tt-checkbox-label">
            <input
              type="checkbox"
              checked={isCareerRelated}
              onChange={(e) => setIsCareerRelated(e.target.checked)}
            />
            <span>내 희망 진로(목표 학과)와 관련된 전공 핵심 교과입니다</span>
          </label>
          <div className="tt-dialog-footer">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn btn-primary btn-sm">
              시간표에 추가
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
