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

interface TimetableViewProps {
  currentGrade: number;
  currentSemester: number;
  timetables: TimetableConfig[];
  onTimetablesChange: (timetables: TimetableConfig[]) => void;
  onNavigateToGrades?: () => void;
  onNavigateToActivities?: (subjectName: string) => void;
  onUpdateCurrentPeriod?: (grade: number, semester: number) => Promise<void> | void;
}

export function TimetableView({
  currentGrade,
  currentSemester,
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

  const SEMESTER_OPTIONS = [
    { value: "1-1", label: "1학년 1학기" },
    { value: "1-2", label: "1학년 2학기" },
    { value: "2-1", label: "2학년 1학기" },
    { value: "2-2", label: "2학년 2학기" },
    { value: "3-1", label: "3학년 1학기" },
    { value: "3-2", label: "3학년 2학기" },
  ];

  return (
    <div className="timetable-container">
      <aside className="timetable-sidebar">
        <div className="tt-semester-select-box">
          <select
            className="tt-semester-select"
            value={selectedPeriod}
            onChange={(e) => handlePeriodChange(e.target.value)}
          >
            {SEMESTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}{opt.value === currentPeriod ? " (현재)" : ""}
              </option>
            ))}
          </select>
        </div>

        {selectedPeriod !== currentPeriod && onUpdateCurrentPeriod && (
          <div style={{ marginTop: "6px" }}>
            <button
              type="button"
              className="tt-btn-set-current-semester"
              disabled={isUpdatingPeriod}
              onClick={async () => {
                setIsUpdatingPeriod(true);
                try {
                  await onUpdateCurrentPeriod(selGrade, selSemester);
                } finally {
                  setIsUpdatingPeriod(false);
                }
              }}
              style={{
                width: "100%",
                padding: "7px 10px",
                fontSize: "12px",
                fontWeight: "600",
                color: "#3182F6",
                background: "#f0f7ff",
                border: "1px solid #c9e2ff",
                borderRadius: "4px",
                cursor: "pointer",
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
              }}
            >
              {isUpdatingPeriod ? "변경 중..." : `📍 현재 학기를 ${selGrade}학년 ${selSemester}학기로 설정`}
            </button>
          </div>
        )}

        <div className="tt-meta-card">
          <div className="tt-title-row">
            <h2 className="tt-title">{activeTimetable.name}</h2>
          </div>
          <div className="tt-subtitle">
            <span className="tt-units-highlight"><strong>{totalUnits}</strong> 학점</span>
            <span className="tt-bullet">•</span>
            <span>{activeTimetable.updatedAt} 변경</span>
          </div>

          <div className="tt-action-row">
            <button
              type="button"
              className="tt-btn-tool"
              onClick={() => alert("현재 시간표를 이미지(PNG)로 저장합니다.")}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              이미지
            </button>
            <button
              type="button"
              className="tt-btn-tool"
              onClick={() => {
                const name = prompt("시간표 이름을 변경하세요", activeTimetable.name);
                if (name) {
                  onTimetablesChange(
                    timetables.map((t) => (t.id === activeTimetable.id ? { ...t, name } : t))
                  );
                }
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              설정
            </button>
          </div>
        </div>

        {/* 시간표 목록 */}
        <div className="tt-list-section">
          <div className="tt-list">
            {periodTimetables.map((t) => {
              const isActive = t.id === activeTimetable.id;
              return (
                <div
                  key={t.id}
                  className={`tt-list-item-wrapper ${isActive ? "active" : ""}`}
                >
                  <button
                    type="button"
                    className="tt-list-item-btn"
                    onClick={() => {
                      setActiveTimetableId(t.id);
                      setSelectedSlot(null);
                    }}
                  >
                    <span className="tt-list-name">{t.name}</span>
                    {t.isDefault ? (
                      <span className="tt-list-tag">기본시간표</span>
                    ) : isActive ? (
                      <span
                        className="tt-list-set-default"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetAsDefault(t.id);
                        }}
                        title="이 시간표를 기본시간표로 설정"
                      >
                        기본으로 설정
                      </span>
                    ) : null}
                  </button>
                  {periodTimetables.length > 1 && (
                    <button
                      type="button"
                      className="tt-table-del-btn"
                      onClick={(e) => handleDeleteTimetable(t.id, t.name, e)}
                      title="시간표 삭제"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="tt-btn-add-table-link"
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
          >
            + 새 시간표 만들기
          </button>
        </div>
      </aside>

      {/* ──────────────────────────────────────────
          중앙 메인 시간표 그리드 (에브리타임 스타일)
          ────────────────────────────────────────── */}
      <main className="timetable-main">
        <div className="timetable-grid-wrapper">
          <table className="timetable-grid">
            <thead>
              <tr>
                <th className="tt-col-period"></th>
                {DAYS_KR.map((day) => (
                  <th key={day} className="tt-col-day">
                    {day}
                  </th>
                ))}
                <th className="tt-col-time"></th>
              </tr>
            </thead>
            <tbody>
              {PERIOD_TIMES.map(({ period, hourLabel }) => (
                <tr key={period} className="tt-row">
                  {/* 교시 헤더 */}
                  <td className="tt-cell-period">
                    <span className="tt-period-num">{period}교시</span>
                  </td>

                  {/* 요일별 슬롯 (0~4: 월~금) */}
                  {DAYS_KR.map((_, dayIdx) => {
                    // 해당 요일, 해당 교시에 시작하는 수업 찾기
                    const slot = slots.find(
                      (s) => s.day === dayIdx && s.startPeriod === period
                    );

                    // 이미 이전 교시에서 시작해서 현재 교시를 차지하는지 확인
                    const isOccupiedByPrev = slots.some(
                      (s) =>
                        s.day === dayIdx &&
                        s.startPeriod < period &&
                        s.startPeriod + s.periodSpan > period
                    );

                    if (isOccupiedByPrev) return null; // rowspan 처리 시 렌더 스킵

                    const palette = slot ? getGroupColor(slot.group, slot.colorIndex) : null;
                    const isSelected = selectedSlot?.id === slot?.id;

                    return (
                      <td
                        key={`${dayIdx}-${period}`}
                        className={`tt-cell-slot ${slot ? "has-class" : "empty"}`}
                        rowSpan={slot?.periodSpan || 1}
                        onClick={() => {
                          if (slot) setSelectedSlot(slot);
                        }}
                      >
                        {slot && palette ? (
                          <div
                            className={`tt-class-block ${isSelected ? "selected" : ""}`}
                            style={{
                              backgroundColor: palette.bg,
                              borderColor: isSelected ? "#3182F6" : palette.border,
                            }}
                          >
                            <div className="tt-class-header">
                              <span className="tt-class-name">{slot.courseName}</span>
                              <button
                                type="button"
                                className="tt-class-del-btn"
                                onClick={(e) => handleDeleteSlot(slot.id, slot.courseName, e)}
                                title="수업 삭제"
                              >
                                ×
                              </button>
                            </div>
                            <div className="tt-class-details">
                              {slot.teacher && <span>{slot.teacher}</span>}
                              {slot.room && <span>{slot.room}</span>}
                            </div>
                          </div>
                        ) : (
                          <div className="tt-empty-hover-hint">+</div>
                        )}
                      </td>
                    );
                  })}

                  {/* 실제 시각 헤더 (오전 9시, 오전 10시 ...) */}
                  <td className="tt-cell-time">
                    <span className="tt-time-label">{hourLabel}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 에브리타임 스타일 하단 플로팅 액션 바 */}
        <div className="tt-floating-bar">
          <button
            type="button"
            className="tt-btn-floating search"
            onClick={() => setIsSearchModalOpen(true)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>수업 목록에서 검색</span>
          </button>
          <div className="tt-floating-divider" />
          <button
            type="button"
            className="tt-btn-floating direct"
            onClick={() => setIsDirectAddModalOpen(true)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>직접 추가</span>
          </button>
        </div>
      </main>

      {/* ──────────────────────────────────────────
          우측 세특 퀵 서랍 (과목 클릭 시 열림)
          ────────────────────────────────────────── */}
      {selectedSlot && (
        <aside className="tt-subject-drawer">
          <div className="tt-drawer-header">
            <div>
              <span className="tt-drawer-category">{selectedSlot.category} · {selectedSlot.group}</span>
              <h3 className="tt-drawer-title">{selectedSlot.courseName}</h3>
            </div>
            <button
              type="button"
              className="tt-drawer-close"
              onClick={() => setSelectedSlot(null)}
            >
              ✕
            </button>
          </div>

          <div className="tt-drawer-body">
            {/* 과목 상세 태그 */}
            <div className="tt-drawer-info-grid">
              <div className="tt-drawer-info-item">
                <small>이수 단위</small>
                <strong>{selectedSlot.units}학점(단위)</strong>
              </div>
              <div className="tt-drawer-info-item">
                <small>수업 장소</small>
                <strong>{selectedSlot.room || "교실 미지정"}</strong>
              </div>
              <div className="tt-drawer-info-item">
                <small>담당 교사</small>
                <strong>{selectedSlot.teacher || "교사 미지정"}</strong>
              </div>
              <div className="tt-drawer-info-item">
                <small>교과 구분</small>
                <strong style={{ color: "#292929" }}>
                  {selectedSlot.category}
                </strong>
              </div>
            </div>

            {/* 세특연구소 전용: 세특 탐구 및 수행평가 현황 */}
            <section className="tt-drawer-section">
              <div className="tt-section-title-row">
                <h4>🎯 이 과목 세특 & 수행평가 현황</h4>
                <span className="tt-count-badge">2건 진행 중</span>
              </div>

              <div className="tt-activity-card">
                <div className="tt-act-header">
                  <span className="tt-act-badge report">탐구보고서</span>
                  <span className="tt-act-dday">D-12</span>
                </div>
                <strong className="tt-act-title">
                  {selectedSlot.courseName === "물리학Ⅰ"
                    ? "반도체 밴드갭 이론과 광전효과의 상관관계 실험 분석"
                    : `${selectedSlot.courseName} 심화 주제 탐구 보고서`}
                </strong>
                <p className="tt-act-summary">
                  이번 학기 목표와 연계된 후속 탐구 계획
                </p>
              </div>

              <div className="tt-activity-card">
                <div className="tt-act-header">
                  <span className="tt-act-badge presentation">수행평가(발표)</span>
                  <span className="tt-act-dday done">완료</span>
                </div>
                <strong className="tt-act-title">
                  실생활 속 교과 원리 적용 사례 발표
                </strong>
              </div>

              <div className="tt-drawer-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm w-full"
                  onClick={() => onNavigateToActivities?.(selectedSlot.courseName)}
                >
                  📝 이 과목 새 세특 활동 작성하기
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm w-full"
                  onClick={onNavigateToGrades}
                >
                  📊 이 과목 성적 입력 / 조회하기
                </button>
              </div>
            </section>
          </div>
        </aside>
      )}

      {/* ──────────────────────────────────────────
          과목 검색 바텀시트 모달 (에브리타임 스타일)
          ────────────────────────────────────────── */}
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

      {/* ──────────────────────────────────────────
          직접 추가 모달
          ────────────────────────────────────────── */}
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
