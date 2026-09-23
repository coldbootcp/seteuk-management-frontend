"use client";

/**
 * 대시보드 — 로그인 후 처음 보는 요약 화면.
 *
 * 새로 계산하는 값은 없다. 이번 학기 목표·로드맵 진척·기록 수·내신 평균은 각각
 * 다른 화면이 정본을 갖고 있고, 이 화면은 그것들을 한자리에 모아 보여주기만 한다.
 * 내신 평균은 성적 화면과 같은 소스(academic-records)로 같은 방식(단위 가중 평균)
 * 으로 계산한다 — 두 화면이 다른 숫자를 말하면 어느 쪽도 못 믿게 된다.
 */

import { useEffect, useMemo, useState } from "react";
import type { ProductWorkspace } from "../lib/product-harness";
import { backendRecordToGradeItem, fetchAcademicRecords } from "../lib/academic-records-api";
import type { HighSchoolGradeItem } from "./types/academic";
import { Icon } from "./icons";

type TabTarget = "overview" | "grades" | "activities" | "profile" | "chat";

const GOAL_TONES = [
  { border: "border-blue-200/80", bg: "bg-blue-50/50", label: "text-brand-700", chip: "bg-blue-100 text-brand-700" },
  { border: "border-emerald-200/80", bg: "bg-emerald-50/50", label: "text-emerald-700", chip: "bg-emerald-100 text-emerald-700" },
  { border: "border-purple-200/80", bg: "bg-purple-50/50", label: "text-purple-700", chip: "bg-purple-100 text-purple-700" },
];

export function DashboardView({
  workspace,
  onNavigate,
}: {
  workspace: ProductWorkspace;
  onNavigate: (tab: TabTarget) => void;
}) {
  const { profile, roadmap, activities, dna } = workspace;

  const [gradeItems, setGradeItems] = useState<HighSchoolGradeItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAcademicRecords()
      .then((records) => {
        if (!cancelled) setGradeItems(records.map(backendRecordToGradeItem));
      })
      .catch(() => {
        // 성적이 아직 없거나 불러오지 못하면 그 칸만 비운다 — 화면 전체를 막지 않는다.
        if (!cancelled) setGradeItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeNode = useMemo(
    () => roadmap.nodes.find((node) => node.isCurrent) ?? roadmap.nodes.find((node) => node.status === "active"),
    [roadmap.nodes],
  );

  const completedPlanIds = useMemo(
    () => new Set(activities.map((activity) => activity.planEventId).filter(Boolean)),
    [activities],
  );

  /** 이번 학기 핵심 목표 — 로드맵이 "먼저 하라"고 표시한 주제만 앞세운다. */
  const coreGoals = useMemo(() => {
    const events = activeNode?.planEvents ?? [];
    const core = events.filter((event) => event.priority === "core");
    return (core.length ? core : events).slice(0, 3);
  }, [activeNode]);

  const plannedTopicCount = activeNode?.planEvents?.length ?? 0;

  // 진행률의 분자·분모 기준을 하나로 맞춘다. 예전에는 분자가 "이번 학기 활동 전체
  // 수"(로드맵과 무관한 활동까지)이고 분모가 "제안 주제 수"라, 같은 활동 1건이
  // 이 지표에는 세어지지만 아래 '핵심 목표 작성 완료'(planEventId 연결 기준)에는
  // 안 세어져 두 숫자가 어긋났다. 이제 둘 다 "제안 주제 중 활동으로 연결된 수"로
  // 계산한다 — 로드맵 제안을 얼마나 실행했는지가 진행률의 정의다.
  const linkedTopicCount = useMemo(() => {
    const events = activeNode?.planEvents ?? [];
    return events.filter((event) => completedPlanIds.has(event.id)).length;
  }, [activeNode, completedPlanIds]);

  // 로드맵과 무관하게 이번 학기에 남긴 활동 수 — 진행률 분자가 아니라 별도 맥락으로만
  // 쓴다(제안에 없던 활동도 기록 자체는 의미가 있으므로 캡션에 함께 보여준다).
  const semesterActivityCount = useMemo(
    () =>
      activities.filter(
        (activity) => activity.grade === profile.grade && activity.semester === profile.semester,
      ).length,
    [activities, profile.grade, profile.semester],
  );

  /** 단위 가중 평균 — 성적 화면과 같은 식이다(석차등급이 있는 과목만). */
  const gradeSummary = useMemo(() => {
    if (!gradeItems?.length) return null;
    const isCore = (group: string) => group === "국어" || group === "수학" || group === "영어";
    let rankSum = 0;
    let unitSum = 0;
    let coreRankSum = 0;
    let coreUnitSum = 0;
    let evaluated = 0;
    let excluded = 0;
    for (const item of gradeItems) {
      if (item.rank == null) {
        excluded += 1;
        continue;
      }
      rankSum += item.rank * item.units;
      unitSum += item.units;
      evaluated += 1;
      if (isCore(item.group)) {
        coreRankSum += item.rank * item.units;
        coreUnitSum += item.units;
      }
    }
    if (!unitSum) return null;
    return {
      overall: (rankSum / unitSum).toFixed(2),
      core: coreUnitSum ? (coreRankSum / coreUnitSum).toFixed(2) : null,
      evaluated,
      excluded,
      totalUnits: unitSum,
    };
  }, [gradeItems]);

  return (
    <div className="space-y-6">
      {/* 이번 학기 핵심 목표 */}
      <section className="bg-white p-6 md:p-7 rounded-2xl border border-gray-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Icon className="text-brand-600" name="target" size={18} />
            <h2 className="text-base font-extrabold text-gray-950">
              이번 학기({profile.grade}-{profile.semester}) 핵심 목표
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {coreGoals.length > 0 && (
              <span className="text-[11px] font-bold text-brand-700 bg-blue-50 border border-blue-200/80 px-2.5 py-1 rounded-full whitespace-nowrap">
                {coreGoals.filter((goal) => completedPlanIds.has(goal.id)).length}건 작성 완료 · 총 {coreGoals.length}건
              </span>
            )}
            <button
              className="text-xs font-bold text-brand-600 hover:text-brand-700 transition whitespace-nowrap"
              onClick={() => onNavigate("overview")}
              type="button"
            >
              이번 학기 전체 보기 →
            </button>
          </div>
        </div>

        {activeNode ? (
          <>
            <p className="text-sm font-semibold text-gray-800 leading-relaxed">{activeNode.objective}</p>
            {coreGoals.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {coreGoals.map((goal, index) => {
                  const tone = GOAL_TONES[index % GOAL_TONES.length];
                  const done = completedPlanIds.has(goal.id);
                  return (
                    <div className={`p-4 rounded-xl border ${tone.border} ${tone.bg} space-y-2`} key={goal.id}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[11px] font-extrabold ${tone.label}`}>목표 {index + 1}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${done ? "bg-emerald-100 text-emerald-700" : tone.chip}`}>
                          {done ? "작성 완료" : goal.subject || "연계 과목 미정"}
                        </span>
                      </div>
                      <strong className="block text-xs font-bold text-gray-950 leading-snug">{goal.title}</strong>
                      <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-3">{goal.description}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400">이번 학기에 제안된 주제가 아직 없습니다.</p>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400">
            아직 확정된 계획이 없습니다. 상담을 마치면 이번 학기 목표가 여기에 표시됩니다.
          </p>
        )}
      </section>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-extrabold text-gray-950 tracking-tight">대시보드</h2>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700 transition"
            onClick={() => onNavigate("activities")}
            type="button"
          >
            활동 기록 보기
          </button>
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition"
            onClick={() => onNavigate("chat")}
            type="button"
          >
            <Icon name="sparkles" size={14} />
            <span>AI 컨설턴트에게 묻기</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 프로필 + 진행 */}
        <section className="lg:col-span-2 bg-white p-6 md:p-7 rounded-2xl border border-gray-200/80 shadow-xs space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <span className="w-14 h-14 rounded-2xl bg-brand-500 text-white font-extrabold text-base flex items-center justify-center flex-none">
                {profile.name.slice(-2)}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <strong className="text-lg font-extrabold text-gray-950 truncate">{profile.name}</strong>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-brand-600 border border-blue-100">재학생</span>
                </div>
                <span className="block text-xs text-gray-500 mt-0.5 truncate">
                  {profile.targetCareer || "진로 미정"}
                  {profile.targetMajors.length > 0 && ` 지망 · ${profile.targetMajors.join(", ")}`}
                </span>
                <span className="block text-[11px] text-gray-400 mt-0.5">
                  현재 {profile.grade}학년 {profile.semester}학기
                </span>
              </div>
            </div>
            <button
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700 transition whitespace-nowrap"
              onClick={() => onNavigate("profile")}
              type="button"
            >
              프로필 수정
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-gray-100">
            <ProgressBlock
              caption={
                plannedTopicCount
                  ? `이번 학기 제안 ${plannedTopicCount}개 중 활동으로 연결한 수${semesterActivityCount > linkedTopicCount ? ` · 그 외 기록 ${semesterActivityCount - linkedTopicCount}건` : ""}`
                  : "이번 학기에 남긴 기록"
              }
              label="이번 학기 세특 탐구 진행"
              onClick={() => onNavigate("activities")}
              total={plannedTopicCount}
              value={linkedTopicCount}
              valueLabel={`${linkedTopicCount} / ${plannedTopicCount || "-"} 건`}
            />
            <ProgressBlock
              caption="지금까지 남긴 활동·수상·봉사·독서 기록 전체"
              label="누적 기록"
              onClick={() => onNavigate("activities")}
              total={Math.max(activities.length, 1)}
              value={activities.length}
              valueLabel={`${activities.length} 건`}
            />
          </div>

          {dna.narrative && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-brand-50/70 to-blue-50/40 border border-brand-100/80">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600">AI 진단 요약</span>
              <p className="text-xs text-gray-800 leading-relaxed mt-1">{dna.narrative}</p>
            </div>
          )}
        </section>

        {/* 내신 성적 요약 */}
        <section className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-gray-100">
            <h3 className="text-base font-extrabold text-gray-950">내신 성적 요약</h3>
            <Icon className="text-gray-400" name="trending-up" size={18} />
          </div>

          {gradeItems === null ? (
            <p className="text-xs text-gray-400">성적을 불러오는 중…</p>
          ) : gradeSummary ? (
            <>
              <div>
                <div className="flex items-end gap-1.5">
                  <strong className="text-4xl font-extrabold text-brand-600 tracking-tight tabular-nums">
                    {gradeSummary.overall}
                  </strong>
                  <span className="text-xs font-semibold text-gray-400 pb-1.5">등급</span>
                </div>
                <span className="text-[11px] text-gray-400 block mt-1">
                  전 과목 단위 가중 평균 (석차등급이 있는 {gradeSummary.evaluated}과목)
                </span>
              </div>

              <div className="space-y-2 text-xs">
                {gradeSummary.core && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">주요 교과 (국·수·영)</span>
                    <strong className="text-gray-900 font-bold tabular-nums">{gradeSummary.core} 등급</strong>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-medium">총 이수 단위</span>
                  <strong className="text-gray-900 font-bold tabular-nums">{gradeSummary.totalUnits} 단위</strong>
                </div>
                {gradeSummary.excluded > 0 && (
                  <p className="text-[11px] text-gray-400 pt-1">
                    석차등급이 없는 {gradeSummary.excluded}과목(진로선택·전문교과 등)은 평균에서 뺐습니다.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400 flex-1">
              아직 등록된 성적이 없습니다. 성적 화면에서 수강 과목과 등급을 입력하면 평균이 계산됩니다.
            </p>
          )}

          <button
            className="w-full py-2 rounded-lg border border-gray-200 hover:border-brand-300 hover:bg-brand-50/40 text-xs font-bold text-gray-700 hover:text-brand-600 transition mt-auto"
            onClick={() => onNavigate("grades")}
            type="button"
          >
            상세 성적표 보기 →
          </button>
        </section>
      </div>
    </div>
  );
}

function ProgressBlock({
  label,
  value,
  total,
  valueLabel,
  caption,
  onClick,
}: {
  label: string;
  value: number;
  total: number;
  valueLabel: string;
  caption: string;
  onClick: () => void;
}) {
  const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <button className="text-left group" onClick={onClick} type="button">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-700 group-hover:text-brand-600 transition">{label}</span>
        <strong className="text-xs font-bold text-gray-950 tabular-nums whitespace-nowrap">{valueLabel}</strong>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 mt-2 overflow-hidden">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <span className="block text-[11px] text-gray-400 mt-1.5">{caption}</span>
    </button>
  );
}
