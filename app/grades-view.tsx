"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HighSchoolGradeItem, SemesterGradeData, TimetableConfig } from "./types/academic";
import { extractCoursesFromSlots } from "./types/academic";
import {
  fetchAcademicRecords,
  createAcademicRecord,
  updateAcademicRecord,
  deleteAcademicRecord,
  backendRecordToGradeItem,
  gradeItemToCreatePayload,
  gradeItemToUpdatePayload,
} from "../lib/academic-records-api";
import { api } from "../lib/api-client";
import type { components } from "../lib/api-types";

type EducationPolicyResolution = components["schemas"]["EducationPolicyResolutionRead"];

interface GradesViewProps {
  currentGrade: number;
  currentSemester: number;
  defaultTimetable?: TimetableConfig | null;
  timetables?: TimetableConfig[];
  onNavigateToTimetable: () => void;
  onNavigateToActivities?: (subjectName: string) => void;
  onRecordsChanged?: () => void;
}

// 6개 학기 기본 목업 데이터 (석차등급 과목과 성취도 과목 분리: 둘 중 하나만 가짐)
const INITIAL_SEMESTERS_DATA: SemesterGradeData[] = [
  {
    grade: 1,
    semester: 1,
    items: [
      { id: "g-1-1", courseName: "공통국어", category: "공통", group: "국어", units: 4, rank: 2, achievement: null, rawScore: 89, subjectAverage: 71.5, stdDev: 14.2, isCareerRelated: false, seteukCount: 1 },
      { id: "g-1-2", courseName: "공통수학", category: "공통", group: "수학", units: 4, rank: 1, achievement: null, rawScore: 98, subjectAverage: 65.4, stdDev: 18.0, isCareerRelated: true, seteukCount: 2 },
      { id: "g-1-3", courseName: "공통영어", category: "공통", group: "영어", units: 4, rank: 2, achievement: null, rawScore: 91, subjectAverage: 68.2, stdDev: 16.5, isCareerRelated: false, seteukCount: 1 },
      { id: "g-1-4", courseName: "통합사회", category: "공통", group: "사회", units: 4, rank: 2, achievement: null, rawScore: 90, subjectAverage: 74.0, stdDev: 13.1, isCareerRelated: false, seteukCount: 1 },
      { id: "g-1-5", courseName: "통합과학", category: "공통", group: "과학", units: 4, rank: 1, achievement: null, rawScore: 96, subjectAverage: 62.8, stdDev: 19.3, isCareerRelated: true, seteukCount: 3 },
      { id: "g-1-6", courseName: "과학탐구실험", category: "공통", group: "과학", units: 2, rank: null, achievement: "A", rawScore: 99, subjectAverage: 82.0, stdDev: 11.2, isCareerRelated: true, seteukCount: 2 },
      { id: "g-1-7", courseName: "한국사", category: "공통", group: "사회", units: 3, rank: 3, achievement: null, rawScore: 84, subjectAverage: 72.0, stdDev: 15.0, isCareerRelated: false, seteukCount: 0 },
      { id: "g-1-8", courseName: "정보", category: "일반선택", group: "기술가정/정보", units: 4, rank: 1, achievement: null, rawScore: 97, subjectAverage: 69.5, stdDev: 17.1, isCareerRelated: true, seteukCount: 2 },
    ],
  },
  {
    grade: 1,
    semester: 2,
    items: [
      { id: "g-2-1", courseName: "공통국어", category: "공통", group: "국어", units: 4, rank: 2, achievement: null, rawScore: 90, subjectAverage: 70.2, stdDev: 14.8, isCareerRelated: false, seteukCount: 1 },
      { id: "g-2-2", courseName: "공통수학", category: "공통", group: "수학", units: 4, rank: 1, achievement: null, rawScore: 96, subjectAverage: 63.8, stdDev: 19.2, isCareerRelated: true, seteukCount: 2 },
      { id: "g-2-3", courseName: "공통영어", category: "공통", group: "영어", units: 4, rank: 2, achievement: null, rawScore: 88, subjectAverage: 67.5, stdDev: 16.0, isCareerRelated: false, seteukCount: 1 },
      { id: "g-2-4", courseName: "통합사회", category: "공통", group: "사회", units: 4, rank: 2, achievement: null, rawScore: 89, subjectAverage: 73.1, stdDev: 12.8, isCareerRelated: false, seteukCount: 0 },
      { id: "g-2-5", courseName: "통합과학", category: "공통", group: "과학", units: 4, rank: 1, achievement: null, rawScore: 97, subjectAverage: 61.4, stdDev: 20.1, isCareerRelated: true, seteukCount: 3 },
      { id: "g-2-6", courseName: "과학탐구실험", category: "공통", group: "과학", units: 2, rank: null, achievement: "A", rawScore: 100, subjectAverage: 83.5, stdDev: 10.5, isCareerRelated: true, seteukCount: 2 },
      { id: "g-2-7", courseName: "한국사", category: "공통", group: "사회", units: 3, rank: 2, achievement: null, rawScore: 91, subjectAverage: 71.0, stdDev: 14.5, isCareerRelated: false, seteukCount: 1 },
    ],
  },
  {
    grade: 2,
    semester: 1,
    items: [
      { id: "g-3-1", courseName: "문학", category: "일반선택", group: "국어", units: 4, rank: 2, achievement: null, rawScore: 92, subjectAverage: 72.0, stdDev: 13.9, isCareerRelated: false, seteukCount: 1 },
      { id: "g-3-2", courseName: "수학Ⅰ", category: "일반선택", group: "수학", units: 4, rank: 1, achievement: null, rawScore: 97, subjectAverage: 60.2, stdDev: 21.0, isCareerRelated: true, seteukCount: 3 },
      { id: "g-3-3", courseName: "영어Ⅰ", category: "일반선택", group: "영어", units: 4, rank: 2, achievement: null, rawScore: 89, subjectAverage: 66.8, stdDev: 17.5, isCareerRelated: false, seteukCount: 1 },
      { id: "g-3-4", courseName: "물리학Ⅰ", category: "일반선택", group: "과학", units: 4, rank: 1, achievement: null, rawScore: 99, subjectAverage: 58.4, stdDev: 22.3, isCareerRelated: true, seteukCount: 4 },
      { id: "g-3-5", courseName: "화학Ⅰ", category: "일반선택", group: "과학", units: 4, rank: 2, achievement: null, rawScore: 93, subjectAverage: 62.0, stdDev: 19.8, isCareerRelated: true, seteukCount: 2 },
      { id: "g-3-6", courseName: "기하", category: "진로선택", group: "수학", units: 4, rank: null, achievement: "A", rawScore: 95, subjectAverage: 68.0, stdDev: 18.0, isCareerRelated: true, seteukCount: 2 },
      { id: "g-3-7", courseName: "프로그래밍", category: "진로선택", group: "기술가정/정보", units: 4, rank: null, achievement: "A", rawScore: 98, subjectAverage: 71.0, stdDev: 16.2, isCareerRelated: true, seteukCount: 3 },
    ],
  },
  {
    grade: 2,
    semester: 2,
    items: [
      { id: "g-4-1", courseName: "독서", category: "일반선택", group: "국어", units: 4, rank: 2, achievement: null, rawScore: 91, subjectAverage: 71.0, stdDev: 14.0, isCareerRelated: false, seteukCount: 1 },
      { id: "g-4-2", courseName: "수학Ⅱ", category: "일반선택", group: "수학", units: 4, rank: 1, achievement: null, rawScore: 96, subjectAverage: 59.5, stdDev: 21.5, isCareerRelated: true, seteukCount: 2 },
      { id: "g-4-3", courseName: "영어Ⅱ", category: "일반선택", group: "영어", units: 4, rank: 2, achievement: null, rawScore: 90, subjectAverage: 65.0, stdDev: 17.0, isCareerRelated: false, seteukCount: 1 },
      { id: "g-4-4", courseName: "물리학Ⅰ", category: "일반선택", group: "과학", units: 4, rank: 1, achievement: null, rawScore: 98, subjectAverage: 57.2, stdDev: 23.0, isCareerRelated: true, seteukCount: 3 },
      { id: "g-4-5", courseName: "화학Ⅰ", category: "일반선택", group: "과학", units: 4, rank: 1, achievement: null, rawScore: 96, subjectAverage: 61.8, stdDev: 20.0, isCareerRelated: true, seteukCount: 2 },
      { id: "g-4-6", courseName: "기하", category: "진로선택", group: "수학", units: 4, rank: null, achievement: "A", rawScore: 94, subjectAverage: 67.5, stdDev: 18.5, isCareerRelated: true, seteukCount: 2 },
      { id: "g-4-7", courseName: "정보", category: "일반선택", group: "기술가정/정보", units: 4, rank: 1, achievement: null, rawScore: 99, subjectAverage: 68.0, stdDev: 17.8, isCareerRelated: true, seteukCount: 3 },
    ],
  },
  { grade: 3, semester: 1, items: [] },
  { grade: 3, semester: 2, items: [] },
];

// 성적이 없는 학생에게 목업 점수·등급을 본인 성적처럼 보이면 안 된다. 모든 학기는
// 빈 상태에서 시작하고, 학생부·직접 입력·시간표에서 확인된 과목만 채운다.
const EMPTY_SEMESTERS_DATA: SemesterGradeData[] = Array.from(
  { length: 6 },
  (_, index) => ({
    grade: Math.floor(index / 2) + 1,
    semester: (index % 2) + 1,
    items: [],
  }),
);

// 시간표 과목을 성적표 데이터에 병합하는 순수 헬퍼 (기존 입력 성적 보존)
function syncTimetableWithSemesters(
  data: SemesterGradeData[],
  timetable: TimetableConfig | null | undefined,
  targetGrade?: number,
  targetSem?: number
): { updatedData: SemesterGradeData[]; importedCount: number } {
  if (!timetable || !timetable.slots) return { updatedData: data, importedCount: 0 };

  const gradeToSync = targetGrade ?? timetable.grade;
  const semToSync = targetSem ?? timetable.semester;
  const timetableCourses = extractCoursesFromSlots(
    timetable.slots.filter((s) => s.category !== "교양/기타")
  );

  if (timetableCourses.length === 0) return { updatedData: data, importedCount: 0 };

  const updatedData = data.map((sem) => {
    if (sem.grade !== gradeToSync || sem.semester !== semToSync) {
      return sem;
    }

    const existingMap = new Map<string, HighSchoolGradeItem>();
    sem.items.forEach((it) => existingMap.set(it.courseName, it));

    const mergedItems: HighSchoolGradeItem[] = [];
    const processedNames = new Set<string>();

    // 1. 시간표의 과목들 우선 반영 (기존 성적, 등급, 세특 보존)
    timetableCourses.forEach((tc, idx) => {
      processedNames.add(tc.courseName);
      const existing = existingMap.get(tc.courseName);
      if (existing) {
        mergedItems.push({
          ...existing,
          category: tc.category,
          group: tc.group,
          units: tc.units,
          isCareerRelated: tc.isCareerRelated,
        });
      } else {
        mergedItems.push({
          id: `tt-sync-${Date.now()}-${idx}`,
          courseName: tc.courseName,
          category: tc.category,
          group: tc.group,
          units: tc.units,
          // 시간표는 '수강 예정/중' 과목만 알려준다. 성적·성취도를 임의로 채우지
          // 않고 학생이 실제 결과를 입력할 때까지 빈 값으로 둔다.
          rank: null,
          achievement: null,
          rawScore: null,
          subjectAverage: null,
          stdDev: null,
          isCareerRelated: tc.isCareerRelated,
          seteukCount: 0,
        });
      }
    });

    // 2. 사용자가 직접 수기 입력했던 추가 과목 유지
    sem.items.forEach((it) => {
      if (!processedNames.has(it.courseName)) {
        mergedItems.push(it);
      }
    });

    return { ...sem, items: mergedItems };
  });

  return { updatedData, importedCount: timetableCourses.length };
}

export function GradesView({
  currentGrade,
  currentSemester,
  defaultTimetable,
  timetables,
  onNavigateToTimetable,
  onNavigateToActivities,
  onRecordsChanged,
}: GradesViewProps) {
  const [semestersData, setSemestersData] = useState<SemesterGradeData[]>(() =>
    syncTimetableWithSemesters(EMPTY_SEMESTERS_DATA, defaultTimetable).updatedData
  );
  const [educationPolicy, setEducationPolicy] = useState<EducationPolicyResolution | null>(null);
  const [educationPolicyLoaded, setEducationPolicyLoaded] = useState(false);
  const [prevDefaultTimetable, setPrevDefaultTimetable] = useState(defaultTimetable);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"synced" | "saving" | "error" | null>(null);

  const isUUID = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  // 백엔드 academic-performance 조회 및 초기 연동
  useEffect(() => {
    let isMounted = true;
    async function loadRecordsFromBackend() {
      try {
        const records = await fetchAcademicRecords({ limit: 200 });
        if (!isMounted) return;

        if (records && records.length > 0) {
          const semMap = new Map<string, HighSchoolGradeItem[]>();
          for (let g = 1; g <= 3; g++) {
            for (let s = 1; s <= 2; s++) {
              semMap.set(`${g}-${s}`, []);
            }
          }

          records.forEach((rec) => {
            const key = `${rec.grade}-${rec.semester}`;
            const targetList = semMap.get(key);
            if (targetList) {
              targetList.push(backendRecordToGradeItem(rec));
            }
          });

          const loadedData: SemesterGradeData[] = [];
          for (let g = 1; g <= 3; g++) {
            for (let s = 1; s <= 2; s++) {
              loadedData.push({
                grade: g,
                semester: s,
                items: semMap.get(`${g}-${s}`) || [],
              });
            }
          }

          setSemestersData(loadedData);
          setSyncStatus("synced");
        }
      } catch (err) {
        console.warn("백엔드 성적 로드 실패 (로컬 상태 유지):", err);
      }
    }

    loadRecordsFromBackend();
    return () => {
      isMounted = false;
    };
  }, []);

  // 성적 체계는 화면의 기본값이 아니라 입학 연도와 공식 기준 데이터에서 결정한다.
  // 생기부 학적사항이 아직 없으면 범위를 억지로 추정하지 않고 안내만 표시한다.
  useEffect(() => {
    let isMounted = true;
    api<EducationPolicyResolution>("/education-policies/me")
      .then((result) => {
        if (isMounted) setEducationPolicy(result);
      })
      .catch(() => {
        // 성적 기록 자체를 막지는 않는다. 정책을 불러오지 못한 상태는 별도 안내로
        // 남기고, 서버가 저장 시점에 최종 검증한다.
      })
      .finally(() => {
        if (isMounted) setEducationPolicyLoaded(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const updateTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    return () => {
      updateTimersRef.current.forEach((t) => clearTimeout(t));
      updateTimersRef.current.clear();
    };
  }, []);

  // 기본 시간표 prop 변경 시 렌더링 단계에서 상태 동기화 (React 권장 패턴: adjusting state during render)
  if (prevDefaultTimetable !== defaultTimetable) {
    setPrevDefaultTimetable(defaultTimetable);
    setSemestersData((prev) => syncTimetableWithSemesters(prev, defaultTimetable).updatedData);
  }

  const [activePeriod, setActivePeriod] = useState<string>(`${currentGrade}-${currentSemester}`);

  const [activeGrade, activeSem] = activePeriod.split("-").map(Number);
  const currentSemesterRecord = useMemo(
    () =>
      semestersData.find((s) => s.grade === activeGrade && s.semester === activeSem) || {
        grade: activeGrade,
        semester: activeSem,
        items: [],
      },
    [semestersData, activeGrade, activeSem]
  );

  const rankGradeScale = educationPolicy?.policy?.rank_grade_scale ?? null;
  const displayedRankScale = rankGradeScale ?? 9;
  const rankOptions = useMemo(
    () => Array.from({ length: displayedRankScale }, (_, index) => index + 1),
    [displayedRankScale]
  );
  const chartRanks = Array.from(
    new Set([1, Math.ceil((displayedRankScale + 1) / 2), displayedRankScale])
  );
  const chartY = (rank: number) =>
    20 + ((rank - 1) / Math.max(1, displayedRankScale - 1)) * 80;

  // 통계 계산 (전체 평균 등급, 국수영 평균 등급, 입학 연도 기준 석차등급 분포)
  const stats = useMemo(() => {
    let totalRankWeightedSum = 0;
    let totalUnitsForRank = 0;

    let coreRankWeightedSum = 0;
    let coreUnitsForRank = 0;

    const rankCounts: Record<number, number> = {};
    let totalRankEvaluated = 0;

    // 학기별 평균 추이 데이터
    const trendData: Array<{ period: string; overall: number; core: number }> = [];

    const isCoreGroup = (group: string) => group === "국어" || group === "수학" || group === "영어";

    semestersData.forEach((sem) => {
      let semRankSum = 0;
      let semUnits = 0;
      let semCoreRankSum = 0;
      let semCoreUnits = 0;

      sem.items.forEach((item) => {
        if (item.rank !== null) {
          totalRankWeightedSum += item.rank * item.units;
          totalUnitsForRank += item.units;

          semRankSum += item.rank * item.units;
          semUnits += item.units;

          rankCounts[item.rank] = (rankCounts[item.rank] || 0) + 1;
          totalRankEvaluated += 1;

          if (isCoreGroup(item.group)) {
            coreRankWeightedSum += item.rank * item.units;
            coreUnitsForRank += item.units;

            semCoreRankSum += item.rank * item.units;
            semCoreUnits += item.units;
          }
        }
      });

      if (semUnits > 0) {
        trendData.push({
          period: `${sem.grade}-${sem.semester}`,
          overall: Number((semRankSum / semUnits).toFixed(2)),
          core: semCoreUnits > 0 ? Number((semCoreRankSum / semCoreUnits).toFixed(2)) : Number((semRankSum / semUnits).toFixed(2)),
        });
      }
    });

    const overallAvg = totalUnitsForRank > 0 ? (totalRankWeightedSum / totalUnitsForRank).toFixed(2) : "-";
    const coreAvg = coreUnitsForRank > 0 ? (coreRankWeightedSum / coreUnitsForRank).toFixed(2) : "-";

    // 1등급 ~ 5등급 석차등급 비율만 정돈 (ABC 성취도는 제외)
    const distribution: Array<{ label: string; count: number; pct: number; color: string }> = [];
    const RANK_COLORS: Record<number, string> = {
      1: "#3182F6", // 퍼스널 브랜드 액션 블루
      2: "#10B981", // 에메랄드 그린
      3: "#F59E0B", // 앰버 오렌지
      4: "#8B5CF6", // 퍼플
      5: "#6B7280", // 슬레이트 그레이
      6: "#0F766E",
      7: "#B45309",
      8: "#7E22CE",
      9: "#475569",
    };
    rankOptions.forEach((rank) => {
      const c = rankCounts[rank] || 0;
      if (c > 0 || totalRankEvaluated > 0) {
        const pct = totalRankEvaluated > 0 ? Math.round((c / totalRankEvaluated) * 100) : 0;
        distribution.push({ label: `${rank}등급`, count: c, pct, color: RANK_COLORS[rank] || "#6B7280" });
      }
    });

    // 세특 연계 지표 — 목업의 "교과 세특 연계율 / 이번 학기 세특 작성"에 대응한다.
    // 지어낸 값이 아니라 각 과목 행의 seteukCount를 실제로 센 것이다.
    let linkedCourses = 0;
    let totalCourses = 0;
    let currentSemesterSeteuk = 0;
    semestersData.forEach((sem) => {
      sem.items.forEach((item) => {
        totalCourses += 1;
        if (item.seteukCount > 0) linkedCourses += 1;
        if (sem.grade === currentGrade && sem.semester === currentSemester) {
          currentSemesterSeteuk += item.seteukCount;
        }
      });
    });

    return {
      overallAvg,
      coreAvg,
      distribution,
      trendData,
      linkedCourses,
      totalCourses,
      linkRate: totalCourses ? Math.round((linkedCourses / totalCourses) * 100) : 0,
      currentSemesterSeteuk,
    };
  }, [semestersData, currentGrade, currentSemester, rankOptions]);

  // 현재 선택된 학기의 요약 통계 (전체 평점, 국수영 평점)
  const currentSemStats = useMemo(() => {
    let rankSum = 0;
    let unitsForRank = 0;
    let coreRankSum = 0;
    let coreUnits = 0;

    const isCoreGroup = (group: string) => group === "국어" || group === "수학" || group === "영어";

    currentSemesterRecord.items.forEach((it) => {
      if (it.rank !== null) {
        rankSum += it.rank * it.units;
        unitsForRank += it.units;
        if (isCoreGroup(it.group)) {
          coreRankSum += it.rank * it.units;
          coreUnits += it.units;
        }
      }
    });

    const semOverall = unitsForRank > 0 ? (rankSum / unitsForRank).toFixed(2) : "-";
    const semCore = coreUnits > 0 ? (coreRankSum / coreUnits).toFixed(2) : "-";

    return { semOverall, semCore };
  }, [currentSemesterRecord]);

  // 항목 업데이트 핸들러 (낙관적 UI + 디바운스 백엔드 연동)
  const handleUpdateItem = (itemId: string, updates: Partial<HighSchoolGradeItem>) => {
    setSemestersData((prev) =>
      prev.map((sem) => {
        if (sem.grade === activeGrade && sem.semester === activeSem) {
          return {
            ...sem,
            items: sem.items.map((it) => (it.id === itemId ? { ...it, ...updates } : it)),
          };
        }
        return sem;
      })
    );

    const existingTimer = updateTimersRef.current.get(itemId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    setSyncStatus("saving");
    const timer = setTimeout(async () => {
      updateTimersRef.current.delete(itemId);
      try {
        if (isUUID(itemId)) {
          await updateAcademicRecord(itemId, gradeItemToUpdatePayload(updates));
        } else {
          // DB에 아직 저장되지 않은 과목(목업/임시)의 경우 최초 생성(POST)
          const currentSem = semestersData.find((s) => s.grade === activeGrade && s.semester === activeSem);
          const itemToSave = currentSem?.items.find((it) => it.id === itemId);
          if (itemToSave) {
            const merged = { ...itemToSave, ...updates };
            const created = await createAcademicRecord(
              gradeItemToCreatePayload(merged, activeGrade, activeSem)
            );
            setSemestersData((prev) =>
              prev.map((sem) => {
                if (sem.grade === activeGrade && sem.semester === activeSem) {
                  return {
                    ...sem,
                    items: sem.items.map((it) => (it.id === itemId ? { ...it, id: created.id } : it)),
                  };
                }
                return sem;
              })
            );
          }
        }
        setSyncStatus("synced");
        onRecordsChanged?.();
      } catch (err) {
        console.warn("성적 수정 백엔드 반영 실패:", err);
        setSyncStatus("error");
      }
    }, 350);

    updateTimersRef.current.set(itemId, timer);
  };

  // 과목 행 삭제 (낙관적 UI + 백엔드 DELETE 연동)
  const handleDeleteItem = async (itemId: string) => {
    setSemestersData((prev) =>
      prev.map((sem) => {
        if (sem.grade === activeGrade && sem.semester === activeSem) {
          return { ...sem, items: sem.items.filter((it) => it.id !== itemId) };
        }
        return sem;
      })
    );

    if (isUUID(itemId)) {
      try {
        setSyncStatus("saving");
        await deleteAcademicRecord(itemId);
        setSyncStatus("synced");
        onRecordsChanged?.();
      } catch (err) {
        console.warn("성적 삭제 백엔드 반영 실패:", err);
        setSyncStatus("error");
      }
    }
  };

  // 새 과목 행 추가 (낙관적 UI + 백엔드 POST 연동)
  const handleAddItem = async () => {
    const tempId = `temp-${Date.now()}`;
    const newItem: HighSchoolGradeItem = {
      id: tempId,
      courseName: "새 과목",
      category: "일반선택",
      group: "기타",
      units: 4,
      rank: 2,
      achievement: null,
      rawScore: 90,
      subjectAverage: 70,
      stdDev: 15,
      isCareerRelated: false,
      seteukCount: 0,
    };

    setSemestersData((prev) =>
      prev.map((sem) => {
        if (sem.grade === activeGrade && sem.semester === activeSem) {
          return { ...sem, items: [...sem.items, newItem] };
        }
        return sem;
      })
    );

    try {
      setSyncStatus("saving");
      const created = await createAcademicRecord(
        gradeItemToCreatePayload(newItem, activeGrade, activeSem)
      );
      setSemestersData((prev) =>
        prev.map((sem) => {
          if (sem.grade === activeGrade && sem.semester === activeSem) {
            return {
              ...sem,
              items: sem.items.map((it) => (it.id === tempId ? { ...it, id: created.id } : it)),
            };
          }
          return sem;
        })
      );
      setSyncStatus("synced");
      onRecordsChanged?.();
    } catch (err) {
      console.warn("새 과목 백엔드 저장 실패 (로컬 유지):", err);
      setSyncStatus("error");
    }
  };

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // 에브리타임 스타일: 시간표 불러오기 클릭 시 선택 모달 오픈
  const handleImportFromTimetable = () => {
    setIsImportModalOpen(true);
  };

  // 모달에서 특정 시간표 선택 시 현재 학기로 불러오기 및 백엔드 저장
  const handleSelectTimetable = async (selectedTimetable: TimetableConfig) => {
    const { updatedData, importedCount } = syncTimetableWithSemesters(
      semestersData,
      selectedTimetable,
      activeGrade,
      activeSem
    );

    setSemestersData(updatedData);
    setIsImportModalOpen(false);
    setImportNotice(`'${selectedTimetable.name}' 시간표에서 ${importedCount}개 과목 동기화 중...`);

    // 새로 추가된 시간표 과목들을 백엔드 DB에 저장
    const targetSem = updatedData.find((s) => s.grade === activeGrade && s.semester === activeSem);
    if (targetSem) {
      const newlyAdded = targetSem.items.filter((it) => it.id.startsWith("tt-sync-"));
      if (newlyAdded.length > 0) {
        try {
          setSyncStatus("saving");
          const idMap = new Map<string, string>();
          for (const it of newlyAdded) {
            const created = await createAcademicRecord(
              gradeItemToCreatePayload(it, activeGrade, activeSem)
            );
            idMap.set(it.id, created.id);
          }

          setSemestersData((prev) =>
            prev.map((sem) => {
              if (sem.grade === activeGrade && sem.semester === activeSem) {
                return {
                  ...sem,
                  items: sem.items.map((it) => {
                    const realId = idMap.get(it.id);
                    return realId ? { ...it, id: realId } : it;
                  }),
                };
              }
              return sem;
            })
          );
          setSyncStatus("synced");
          onRecordsChanged?.();
        } catch (err) {
          console.warn("시간표 과목 백엔드 저장 실패 (로컬 유지):", err);
          setSyncStatus("error");
        }
      }
    }

    setImportNotice(`'${selectedTimetable.name}' 시간표에서 ${importedCount}개 과목을 불러와 저장했습니다.`);
    setTimeout(() => setImportNotice(null), 3500);
  };

  return (
    <div className="space-y-6">
      <section className="bg-white px-5 py-4 rounded-2xl border border-gray-200/80 shadow-xs flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-brand-600">적용 중인 교육 제도 기준</p>
          {educationPolicy?.policy ? (
            <>
              <h2 className="mt-1 text-sm font-extrabold text-gray-950">
                {educationPolicy.policy.curriculum_name} · 석차 {educationPolicy.policy.rank_grade_scale}등급제
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{educationPolicy.policy.summary}</p>
            </>
          ) : (
            <>
              <h2 className="mt-1 text-sm font-extrabold text-gray-950">
                {educationPolicyLoaded ? "입학 연도 확인 필요" : "교육 제도 기준 확인 중"}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                {educationPolicy?.message ?? "입학 연도를 확인하면 5등급제·9등급제와 학생부 기준을 정확히 적용합니다."}
              </p>
            </>
          )}
        </div>
        {educationPolicy?.policy && (
          <a
            className="shrink-0 text-xs font-bold text-brand-600 hover:underline"
            href={educationPolicy.policy.source_url}
            target="_blank"
            rel="noreferrer"
          >
            {educationPolicy.policy.source_label} ↗
          </a>
        )}
      </section>

      {educationPolicy && educationPolicy.admission_rules.length > 0 && (
        <section className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-[11px] font-extrabold tracking-wide text-brand-600">대입 지원 관련 기준</p>
              <h2 className="mt-1 text-sm font-extrabold text-gray-950">등급제와 별도로 확인할 사항</h2>
            </div>
            <p className="text-[11px] text-gray-400">공식 원문 기준 · 전형별 조건은 지원 카드에서 다시 대조합니다</p>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {educationPolicy.admission_rules.map((rule) => {
              const admissionYear = rule.admission_year_start
                ? `${rule.admission_year_start}학년도${rule.admission_year_end && rule.admission_year_end !== rule.admission_year_start ? `~${rule.admission_year_end}학년도` : ""}`
                : "대입 연도별 확인";
              const requiresTrackCheck = rule.decision_scope === "track_specific";
              return (
                <article key={rule.id} className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-bold text-gray-900">{rule.title}</h3>
                    <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-gray-500 ring-1 ring-gray-200">
                      {requiresTrackCheck ? "지원 전형별 확인" : admissionYear}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-gray-600">{rule.summary}</p>
                  {rule.action_required && <p className="mt-2 text-xs font-semibold leading-relaxed text-brand-700">확인 방법 · {rule.action_required}</p>}
                  <a
                    className="mt-3 inline-flex text-xs font-bold text-brand-600 hover:underline"
                    href={rule.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {rule.source_label} ↗
                  </a>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* ──────────────────────────────────────────
          상단 학점계산기 대시보드 카드 (에타 스타일)
          ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold mb-2">
            <span>전체 누적 평점</span>
            <span className="text-brand-500 bg-brand-50 px-2 py-0.5 rounded-full text-[10px] font-bold">전체 학기</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold text-brand-500 tabular-nums tracking-tight">{stats.overallAvg}</span>
            <span className="text-sm text-gray-400 font-medium">/ {rankGradeScale ?? "?"}.00</span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px]">
            <span className="text-gray-500">등급이 있는 과목</span>
            <span className="font-bold text-gray-800">{stats.totalCourses}과목</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold mb-2">
            <span>국·수·영 평점</span>
            <span className="text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full text-[10px] font-bold">핵심 교과</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold text-gray-900 tabular-nums tracking-tight">{stats.coreAvg}</span>
            <span className="text-sm text-gray-400 font-medium">/ {rankGradeScale ?? "?"}.00</span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px]">
            <span className="text-gray-500">전체 평점 대비</span>
            <span className="font-bold text-gray-800">
              {stats.coreAvg !== "-" && stats.overallAvg !== "-"
                ? `${(Number(stats.coreAvg) - Number(stats.overallAvg)).toFixed(2)}p`
                : "-"}
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold mb-2">
            <span>교과 세특 연계율</span>
            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] font-bold">연계 분석</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold text-emerald-600 tabular-nums tracking-tight">{stats.linkRate}%</span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px]">
            <span className="text-gray-500">세특이 연결된 과목</span>
            <span className="font-bold text-gray-800">{stats.linkedCourses} / {stats.totalCourses}과목</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold mb-2">
            <span>이번 학기 세특</span>
            <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-[10px] font-bold">{currentGrade}-{currentSemester}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold text-gray-900 tabular-nums tracking-tight">{stats.currentSemesterSeteuk}</span>
            <span className="text-sm text-gray-400 font-medium">건</span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px]">
            <button className="text-brand-600 font-bold hover:underline" onClick={onNavigateToTimetable} type="button">
              시간표 이동 ›
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 학기별 추이 */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900">학기별 성적 추이</h3>
            <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-500" /> 전체 평점
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-300" /> 국수영 평점
              </span>
            </div>
          </div>

          <div className="h-44 w-full">
            {stats.trendData.length > 1 ? (
              <svg viewBox="0 0 400 120" className="w-full h-full overflow-visible">
                {/* 입학 연도에 맞춰 5등급/9등급 축을 함께 바꾼다. */}
                {chartRanks.map((rank) => {
                  const y = chartY(rank);
                  return (
                    <g key={rank}>
                      <line x1="30" y1={y} x2="380" y2={y} stroke="#f0f0f0" />
                      <text x="8" y={y + 4} fontSize="10" fill="#a6a6a6">{rank}.0</text>
                    </g>
                  );
                })}

                {/* 전체 등급 라인 */}
                {stats.trendData.length > 1 && (
                  <>
                    <polyline
                      fill="none"
                      stroke="#3182F6"
                      strokeWidth="2"
                      points={stats.trendData
                        .map((d, i) => {
                          const x = 60 + i * 80;
                          const y = Math.min(100, Math.max(20, chartY(d.overall)));
                          return `${x},${y}`;
                        })
                        .join(" ")}
                    />
                    {stats.trendData.map((d, i) => {
                      const x = 60 + i * 80;
                      const y = Math.min(100, Math.max(20, chartY(d.overall)));
                      return (
                        <g key={d.period}>
                          <circle cx={x} cy={y} r="3.5" fill="#ffffff" stroke="#3182F6" strokeWidth="2" />
                          <text x={x} y="116" fontSize="10" textAnchor="middle" fill="#a6a6a6">
                            {d.period}
                          </text>
                        </g>
                      );
                    })}

                    {/* 국수영 등급 점선 */}
                    <polyline
                      fill="none"
                      stroke="#a6a6a6"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                      points={stats.trendData
                        .map((d, i) => {
                          const x = 60 + i * 80;
                          const y = Math.min(100, Math.max(20, chartY(d.core)));
                          return `${x},${y}`;
                        })
                        .join(" ")}
                    />
                    {stats.trendData.map((d, i) => {
                      const x = 60 + i * 80;
                      const y = Math.min(100, Math.max(20, chartY(d.core)));
                      return (
                        <circle key={`c-${d.period}`} cx={x} cy={y} r="2.5" fill="#a6a6a6" />
                      );
                    })}
                  </>
                )}
              </svg>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-gray-400 text-center break-keep">
                  학기가 두 개 이상 기록되면 추이가 그려집니다.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 석차등급 분포 */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs flex flex-col">
          <h3 className="text-base font-bold text-gray-900 mb-4">
            석차등급 분포{rankGradeScale ? ` · ${rankGradeScale}등급제` : ""}
          </h3>
          <div className="space-y-3.5 my-auto">
            {stats.distribution.map((item) => (
              <div className="flex items-center gap-3 text-xs" key={item.label}>
                <span className="w-10 font-medium text-gray-600 flex-none">{item.label}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ backgroundColor: item.color, width: `${item.pct}%` }}
                  />
                </div>
                <span className="w-10 text-right font-bold tabular-nums" style={{ color: item.color }}>
                  {item.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────
          6개 학기 탭 네비게이션 (에타 스타일: 플랫 텍스트 + 블랙 언더라인)
          ────────────────────────────────────────── */}


      {/* ──────────────────────────────────────────
          선택 학기 상세 & 과목 성적 테이블 (에타 스타일)
          ────────────────────────────────────────── */}
      {/* 학기별 성적표 */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="px-5 md:px-6 py-4 border-b border-gray-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl self-start">
            {["1-1", "1-2", "2-1", "2-2", "3-1", "3-2"].map((key) => (
              <button
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                  activePeriod === key ? "bg-brand-500 text-white" : "text-gray-500 hover:text-gray-900"
                }`}
                key={key}
                onClick={() => setActivePeriod(key)}
                type="button"
              >
                {key}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {syncStatus === "saving" && <span className="text-[11px] text-gray-400 font-semibold">☁️ 저장 중…</span>}
            {syncStatus === "synced" && <span className="text-[11px] text-emerald-600 font-semibold">✓ 동기화 완료</span>}
            {importNotice && <span className="text-[11px] text-brand-600 font-semibold">{importNotice}</span>}
            <button
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-50 text-brand-600 hover:bg-brand-100 border border-brand-200/80 rounded-lg text-xs font-bold transition"
              onClick={handleImportFromTimetable}
              type="button"
            >
              <span>📅</span> 시간표에서 불러오기
            </button>
            <button
              className="inline-flex items-center gap-1 px-3.5 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold transition"
              onClick={handleAddItem}
              type="button"
            >
              <span>+</span> 과목 추가
            </button>
          </div>
        </div>

        <div className="px-5 md:px-6 py-3 border-b border-gray-100 flex items-center gap-4 flex-wrap">
          <h3 className="text-sm font-extrabold text-gray-950">{activeGrade}학년 {activeSem}학기</h3>
          <span className="text-xs text-gray-500">
            평점 <strong className="text-gray-900 font-bold tabular-nums">{currentSemStats.semOverall}</strong>
          </span>
          <span className="text-gray-200">·</span>
          <span className="text-xs text-gray-500">
            국수영 <strong className="text-gray-900 font-bold tabular-nums">{currentSemStats.semCore}</strong>
          </span>
        </div>

        {/* 과목 테이블 */}
        <div className="grade-table-wrapper">
          <table className="grade-table">
            <thead>
              <tr>
                <th style={{ width: "26%" }}>과목명</th>
                <th style={{ width: "12%" }}>구분</th>
                <th style={{ width: "8%" }}>단위</th>
                <th style={{ width: "18%" }}>성적</th>
                <th style={{ width: "16%" }}>원점수 / 평균</th>
                <th style={{ width: "6%" }} title="진로(전공) 연계 핵심 과목 체크">진로</th>
                <th style={{ width: "8%" }}>세특</th>
                <th>삭제</th>
              </tr>
            </thead>
            <tbody>
              {currentSemesterRecord.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-table-cell">
                    <div className="empty-box">
                      <p>등록된 과목 성적이 없습니다.</p>
                      <div className="empty-actions">
                        <button
                          type="button"
                          className="btn-import-timetable"
                          onClick={handleImportFromTimetable}
                        >
                          시간표 불러오기
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={handleAddItem}
                        >
                          + 직접 과목 추가
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                currentSemesterRecord.items.map((item) => (
                  <tr key={item.id} className={item.isCareerRelated ? "row-career" : ""}>
                    {/* 과목명 */}
                    <td>
                      <input
                        type="text"
                        className="table-input course-name"
                        value={item.courseName}
                        onChange={(e) => handleUpdateItem(item.id, { courseName: e.target.value })}
                      />
                    </td>

                    {/* 교과구분 */}
                    <td>
                      <select
                        className="table-select"
                        value={item.category}
                        onChange={(e) => {
                          const newCat = e.target.value as HighSchoolGradeItem["category"];
                          // 진로선택이면 성취도 A로, 공통/일반선택이면 해당 학생의
                          // 등급제 범위를 넘지 않는 기본 석차로 자동 전환한다.
                          if (newCat === "진로선택") {
                            handleUpdateItem(item.id, { category: newCat, rank: null, achievement: item.achievement || "A" });
                          } else if (newCat === "공통" || newCat === "일반선택") {
                            handleUpdateItem(item.id, {
                              category: newCat,
                              rank: Math.min(item.rank || 2, displayedRankScale),
                              achievement: null,
                            });
                          } else {
                            handleUpdateItem(item.id, { category: newCat });
                          }
                        }}
                      >
                        <option value="공통">공통</option>
                        <option value="일반선택">일반선택</option>
                        <option value="진로선택">진로선택</option>
                        <option value="융합선택">융합선택</option>
                      </select>
                    </td>

                    {/* 단위수 */}
                    <td>
                      <input
                        type="number"
                        min="1"
                        max="8"
                        className="table-input units"
                        value={item.units}
                        onChange={(e) => handleUpdateItem(item.id, { units: Number(e.target.value) || 1 })}
                      />
                    </td>

                    {/* 성적: 석차등급 또는 성취도 중 단 하나만 선택 (상호 배타적) */}
                    <td>
                      <select
                        className="table-select rank"
                        value={
                          item.rank !== null
                            ? `rank-${item.rank}`
                            : item.achievement !== null
                            ? `achieve-${item.achievement}`
                            : ""
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) {
                            handleUpdateItem(item.id, { rank: null, achievement: null });
                          } else if (val.startsWith("rank-")) {
                            const r = Number(val.replace("rank-", ""));
                            handleUpdateItem(item.id, { rank: r, achievement: null });
                          } else if (val.startsWith("achieve-")) {
                            const a = val.replace("achieve-", "") as HighSchoolGradeItem["achievement"];
                            handleUpdateItem(item.id, { rank: null, achievement: a });
                          }
                        }}
                      >
                        <option value="">미입력</option>
                        <optgroup
                          label={`석차등급 (공통/일반선택 · ${rankGradeScale ? `${rankGradeScale}등급제` : "입학 연도 확인 필요"})`}
                        >
                          {rankOptions.map((rank) => (
                            <option key={rank} value={`rank-${rank}`}>{rank}등급</option>
                          ))}
                        </optgroup>
                        <optgroup label="성취도 (진로선택/예체능)">
                          <option value="achieve-A">A (성취도)</option>
                          <option value="achieve-B">B (성취도)</option>
                          <option value="achieve-C">C (성취도)</option>
                          <option value="achieve-D">D (성취도)</option>
                          <option value="achieve-E">E (성취도)</option>
                          <option value="achieve-P">P (이수)</option>
                        </optgroup>
                      </select>
                    </td>

                    {/* 원점수 / 평균 */}
                    <td>
                      <div className="score-duo-input">
                        <input
                          type="number"
                          placeholder="점수"
                          className="table-input score"
                          value={item.rawScore ?? ""}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              rawScore: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        />
                        <span className="slash">/</span>
                        <input
                          type="number"
                          placeholder="평균"
                          className="table-input avg"
                          value={item.subjectAverage ?? ""}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              subjectAverage: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        />
                      </div>
                    </td>

                    {/* 전공(진로교과) 체크박스 - 에타의 빨간 전공 체크박스 */}
                    <td className="text-center">
                      <label className="career-checkbox-label">
                        <input
                          type="checkbox"
                          className="career-checkbox"
                          checked={item.isCareerRelated}
                          onChange={(e) => handleUpdateItem(item.id, { isCareerRelated: e.target.checked })}
                        />
                      </label>
                    </td>

                    {/* 세특 연계 상태 배지 (클릭 시 활동 기록 탭으로 이동) */}
                    <td className="text-center">
                      <button
                        type="button"
                        className={`seteuk-link-badge ${item.seteukCount > 0 ? "linked" : "empty"}`}
                        onClick={() => onNavigateToActivities?.(item.courseName)}
                        title="이 과목 세특 기록 보러가기"
                      >
                        {item.seteukCount > 0 ? `세특 ${item.seteukCount}건` : "세특 0건"}
                      </button>
                    </td>

                    {/* 삭제 버튼 */}
                    <td className="text-center">
                      <button
                        type="button"
                        className="table-del-btn"
                        onClick={() => handleDeleteItem(item.id)}
                        title="삭제"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 md:px-6 py-3.5 bg-gray-50/70 border-t border-gray-200/80 flex items-center gap-2.5">
          <button
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-xs font-semibold transition"
            onClick={handleAddItem}
            type="button"
          >
            + 과목 추가
          </button>
          <button
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-xs font-semibold transition"
            onClick={onNavigateToTimetable}
            type="button"
          >
            시간표로 돌아가기
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────────
          시간표 선택 모달 (에브리타임 스타일)
          ────────────────────────────────────────── */}
      {isImportModalOpen && (
        <div className="modal-overlay" onClick={() => setIsImportModalOpen(false)}>
          <div className="timetable-picker-panel" onClick={(e) => e.stopPropagation()}>
            <div className="timetable-picker-head">
              <h3>시간표 불러오기</h3>
              <button
                type="button"
                className="timetable-picker-close"
                onClick={() => setIsImportModalOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="timetable-picker-body">
              <p className="timetable-picker-note">
                현재 <strong>{activeGrade}학년 {activeSem}학기</strong> 성적표로 불러올 시간표를 선택해 주세요.
              </p>
              <div className="timetable-picker-list">
                {((timetables && timetables.length > 0) ? timetables : (defaultTimetable ? [defaultTimetable] : [])).map((t) => {
                  const courses = extractCoursesFromSlots(t.slots ? t.slots.filter((s) => s.category !== "교양/기타") : []);
                  const isMatchSem = t.grade === activeGrade && t.semester === activeSem;
                  return (
                    <div
                      key={t.id}
                      className={`timetable-picker-item ${isMatchSem ? "is-match" : ""}`}
                      onClick={() => handleSelectTimetable(t)}
                    >
                      <div className="tp-item-left">
                        <div className="tp-item-title-row">
                          <span className="tp-item-title">
                            2026 {t.grade}학년 {t.semester}학기 ({t.name})
                          </span>
                          {t.isDefault && <span className="tp-badge-default">기본</span>}
                          {isMatchSem && <span className="tp-badge-match">현재 학기</span>}
                        </div>
                        <div className="tp-item-meta">
                          과목 {courses.length}개 · 최종 수정 {t.updatedAt || "최근"}
                        </div>
                        <div className="tp-item-courses">
                          {courses.slice(0, 5).map((c) => c.courseName).join(", ")}
                          {courses.length > 5 ? ` 외 ${courses.length - 5}과목` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="tp-btn-select"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectTimetable(t);
                        }}
                      >
                        선택
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="timetable-picker-foot">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsImportModalOpen(false)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
