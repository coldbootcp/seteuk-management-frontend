"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../lib/api-client";
import type { components } from "../lib/api-types";
import type { ProductWorkspace } from "../lib/product-harness";

type ApplicationTarget = {
  id: string;
  preparationId: string;
  universityId: string;
  programId: string;
  trackId?: string;
  university: string;
  department: string;
  track: string;
  trackDetails?: Pick<CatalogTrack, "recruitment_period" | "has_document_review" | "has_interview" | "has_minimum_requirement" | "source_url" | "source_status">;
  programSourceUrl: string;
  activityIds: string[];
  centralQuestion: string;
};

type CatalogUniversity = components["schemas"]["UniversitySearchRead"];
type CatalogProgram = components["schemas"]["AdmissionProgramRead"];
type CatalogTrack = components["schemas"]["AdmissionTrackRead"];
type TrackReference = components["schemas"]["AdmissionTrackReferenceRead"];
type TrackDetail = components["schemas"]["AdmissionTrackDetailRead"];
type AdmissionTrackResearch = components["schemas"]["AdmissionTrackResearchRead"];
type UniversityAdmissionStatistics = components["schemas"]["UniversityAdmissionStatisticsRead"];
type UniversityAdmissionGuide = components["schemas"]["AdmissionUniversityGuideRead"];
type ProgramPastResults = components["schemas"]["AdmissionProgramPastResultsRead"];
type ProgramProfile = components["schemas"]["AdmissionProgramProfileRead"];
type ActivityRecommendation = components["schemas"]["PreparationActivityRecommendationRead"];
type ApplicationPreparation = components["schemas"]["ApplicationPreparationRead"];
type ActivityFlow = components["schemas"]["ActivityFlowRead"];

export function ApplicationPreparationView({ workspace }: { workspace: ProductWorkspace }) {
  const records = useMemo(
    () => [...workspace.activities].sort((a, b) => a.grade - b.grade || (a.semester ?? 0) - (b.semester ?? 0)),
    [workspace.activities],
  );
  // 학생의 대입 연도. 예전에는 statistics=2026, 모집요강·프로그램·지원카드=2027로
  // 상수를 박아 두어 모든 학생이 자기 대입 연도와 무관한 자료를 봤다. 입학 연도로
  // 계산한다 — 3년제 고교 정규 진학이면 입학연도+3이 지원(대입) 연도다(2025입학→
  // 2028대입). 입학 연도를 모르면(온보딩 전 등) 백엔드 자료가 있는 최신 연도로
  // 넘어가도록 undefined를 쓰지 않고, 현재 달력연도+1을 보수적 기본값으로 둔다.
  const admissionYear = useMemo(() => {
    const freshman = workspace.profile.freshmanAcademicYear;
    if (freshman && freshman >= 1990 && freshman <= 2100) return freshman + 3;
    const now = new Date();
    // 3월 이후면 이미 새 학년도가 시작됐으므로 올해+1, 아니면 올해를 대입 연도 후보로.
    return now.getMonth() >= 2 ? now.getFullYear() + 1 : now.getFullYear();
  }, [workspace.profile.freshmanAcademicYear]);
  const [targets, setTargets] = useState<ApplicationTarget[]>([]);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const [universityQuery, setUniversityQuery] = useState("");
  const [programQuery, setProgramQuery] = useState("");
  const [trackQuery, setTrackQuery] = useState("");
  const [universityResults, setUniversityResults] = useState<CatalogUniversity[]>([]);
  const [programs, setPrograms] = useState<CatalogProgram[]>([]);
  const [tracks, setTracks] = useState<CatalogTrack[]>([]);
  const [selectedUniversity, setSelectedUniversity] = useState<CatalogUniversity | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<CatalogProgram | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<CatalogTrack | null>(null);
  const [catalogLoading, setCatalogLoading] = useState<"university" | "program" | "track" | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [activityFlows, setActivityFlows] = useState<ActivityFlow[]>([]);
  const [centralQuestion, setCentralQuestion] = useState("");
  const [designSaving, setDesignSaving] = useState(false);
  const [activityRecommendation, setActivityRecommendation] = useState<ActivityRecommendation | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<ApplicationTarget | null>(null);
  const [deletingTarget, setDeletingTarget] = useState(false);
  const [trackReference, setTrackReference] = useState<TrackReference | null>(null);
  const [trackDetail, setTrackDetail] = useState<TrackDetail | null>(null);
  const [trackReferenceLoading, setTrackReferenceLoading] = useState(false);
  const [admissionResearch, setAdmissionResearch] = useState<AdmissionTrackResearch | null>(null);
  const [universityStatistics, setUniversityStatistics] = useState<UniversityAdmissionStatistics | null>(null);
  const [universityGuide, setUniversityGuide] = useState<UniversityAdmissionGuide | null>(null);
  const [pastResults, setPastResults] = useState<ProgramPastResults | null>(null);
  const [programProfile, setProgramProfile] = useState<ProgramProfile | null>(null);
  const [admissionInfoLoading, setAdmissionInfoLoading] = useState(false);
  const activeTarget = targets.find((target) => target.id === activeTargetId) ?? null;
  const evidence = activeTarget ? records.filter((record) => activeTarget.activityIds.includes(record.id)) : [];
  const pastResultMetricKeys = useMemo(() => [
    ...new Set(pastResults?.outcomes.flatMap((outcome) => Object.keys(outcome.metrics)) ?? []),
  ], [pastResults]);

  useEffect(() => {
    const trackId = activeTarget?.trackId;
    if (!trackId) {
      const resetTimer = window.setTimeout(() => setTrackReference(null), 0);
      return () => window.clearTimeout(resetTimer);
    }
    let cancelled = false;
    async function loadTrackReference() {
      setTrackReferenceLoading(true);
      try {
        const reference = await api<TrackReference>(`/admission-catalog/tracks/${trackId}/reference`);
        if (!cancelled) setTrackReference(reference);
      } catch {
        if (!cancelled) setTrackReference(null);
      } finally {
        if (!cancelled) setTrackReferenceLoading(false);
      }
    }
    void loadTrackReference();
    return () => { cancelled = true; };
  }, [activeTarget?.trackId]);

  useEffect(() => {
    const trackId = activeTarget?.trackId;
    if (!trackId) {
      const resetTimer = window.setTimeout(() => setAdmissionResearch(null), 0);
      return () => window.clearTimeout(resetTimer);
    }
    let cancelled = false;
    async function loadAdmissionResearch() {
      try {
        const research = await api<AdmissionTrackResearch>(`/admission-catalog/tracks/${trackId}/research`);
        if (!cancelled) setAdmissionResearch(research);
      } catch {
        if (!cancelled) setAdmissionResearch(null);
      }
    }
    void loadAdmissionResearch();
    return () => { cancelled = true; };
  }, [activeTarget?.trackId]);

  useEffect(() => {
    const trackId = activeTarget?.trackId;
    const universityId = activeTarget?.universityId;
    if (!trackId || !universityId) {
      const resetTimer = window.setTimeout(() => {
        setUniversityStatistics(null);
        setUniversityGuide(null);
        setPastResults(null);
        setProgramProfile(null);
        setTrackDetail(null);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }
    let cancelled = false;
    async function loadAdmissionInformation() {
      setAdmissionInfoLoading(true);
      const [statistics, guide, results, profile, detail] = await Promise.allSettled([
        api<UniversityAdmissionStatistics>(`/admission-catalog/universities/${universityId}/statistics?source_admission_year=${admissionYear}`),
        api<UniversityAdmissionGuide>(`/admission-catalog/universities/${universityId}/admission-guide?source_admission_year=${admissionYear}`),
        api<ProgramPastResults>(`/admission-catalog/tracks/${trackId}/past-results`),
        api<ProgramProfile>(`/admission-catalog/tracks/${trackId}/program-profile`),
        api<TrackDetail>(`/admission-catalog/tracks/${trackId}/detail`),
      ]);
      if (cancelled) return;
      setUniversityStatistics(statistics.status === "fulfilled" ? statistics.value : null);
      setUniversityGuide(guide.status === "fulfilled" ? guide.value : null);
      setPastResults(results.status === "fulfilled" ? results.value : null);
      setProgramProfile(profile.status === "fulfilled" ? profile.value : null);
      setTrackDetail(detail.status === "fulfilled" ? detail.value : null);
      setAdmissionInfoLoading(false);
    }
    void loadAdmissionInformation();
    return () => { cancelled = true; };
  }, [activeTarget?.trackId, activeTarget?.universityId, admissionYear]);

  useEffect(() => {
    let cancelled = false;
    async function restorePreparations() {
      try {
        const [preparations, flows] = await Promise.all([
          api<ApplicationPreparation[]>("/application-preparations"),
          api<ActivityFlow[]>("/application-preparations/activity-flows"),
        ]);
        if (cancelled) return;
        const restored = preparations.map((preparation): ApplicationTarget => ({
          id: preparation.id,
          preparationId: preparation.id,
          universityId: preparation.university_id,
          programId: preparation.program_id,
          trackId: preparation.track_id ?? undefined,
          university: preparation.university_name,
          department: preparation.program_name,
          track: preparation.track_name ?? "",
          programSourceUrl: "",
          activityIds: preparation.evidence.map((item) => item.activity_id),
          centralQuestion: preparation.central_question ?? "",
        }));
        setTargets(restored);
        setActivityFlows(flows);
        if (restored[0]) {
          setActiveTargetId(restored[0].id);
          setCentralQuestion(restored[0].centralQuestion);
        }
      } catch {
        if (!cancelled) setCatalogError("저장한 지원 카드를 불러오지 못했습니다.");
      }
    }
    void restorePreparations();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const query = universityQuery.trim();
    if (!query || selectedUniversity) {
      const resetTimer = window.setTimeout(() => setUniversityResults([]), 0);
      return () => window.clearTimeout(resetTimer);
    }
    const timeout = window.setTimeout(async () => {
      setCatalogLoading("university");
      setCatalogError("");
      try {
        const rows = await api<CatalogUniversity[]>(`/admission-catalog/universities?q=${encodeURIComponent(query)}`);
        setUniversityResults(rows);
      } catch {
        setCatalogError("대학 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setCatalogLoading((current) => current === "university" ? null : current);
      }
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [selectedUniversity, universityQuery]);

  useEffect(() => {
    if (!selectedUniversity) return;
    const universityId = selectedUniversity.id;
    let cancelled = false;
    async function loadPrograms() {
      setCatalogLoading("program");
      setCatalogError("");
      try {
        const rows = await api<CatalogProgram[]>(
          `/admission-catalog/universities/${universityId}/programs?admission_year=${admissionYear}&limit=100`,
        );
        if (!cancelled) setPrograms(rows);
      } catch {
        if (!cancelled) setCatalogError("이 대학의 모집단위를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (!cancelled) setCatalogLoading((current) => current === "program" ? null : current);
      }
    }
    void loadPrograms();
    return () => { cancelled = true; };
  }, [selectedUniversity, admissionYear]);

  useEffect(() => {
    if (!selectedProgram) return;
    const programId = selectedProgram.id;
    let cancelled = false;
    async function loadTracks() {
      setCatalogLoading("track");
      setCatalogError("");
      try {
        const rows = await api<CatalogTrack[]>(`/admission-catalog/programs/${programId}/tracks`);
        if (!cancelled) setTracks(rows);
      } catch {
        if (!cancelled) setCatalogError("이 모집단위의 전형을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (!cancelled) setCatalogLoading((current) => current === "track" ? null : current);
      }
    }
    void loadTracks();
    return () => { cancelled = true; };
  }, [selectedProgram]);

  useEffect(() => {
    const resetTimer = window.setTimeout(() => setActivityRecommendation(null), 0);
    return () => window.clearTimeout(resetTimer);
  }, [activeTarget?.preparationId]);

  async function addTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUniversity || !selectedProgram || !selectedTrack) return;
    setCatalogError("");
    let preparation: ApplicationPreparation;
    try {
      preparation = await api<ApplicationPreparation>("/application-preparations", {
        method: "POST",
        body: {
          university_id: selectedUniversity.id,
          program_id: selectedProgram.id,
          track_id: selectedTrack.id,
          admission_year: admissionYear,
        },
      });
      setActivityFlows(await api<ActivityFlow[]>("/application-preparations/activity-flows"));
    } catch {
      setCatalogError("지원 설계를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const target: ApplicationTarget = {
      id: `target-${Date.now()}`,
      preparationId: preparation.id,
      universityId: selectedUniversity.id,
      programId: selectedProgram.id,
      trackId: selectedTrack.id,
      university: selectedUniversity.name,
      department: selectedProgram.name,
      track: selectedTrack.name,
      trackDetails: selectedTrack,
      programSourceUrl: selectedProgram.source_url,
      activityIds: [],
      centralQuestion: "",
    };
    setTargets((current) => [...current, target]);
    setActiveTargetId(target.id);
    setUniversityQuery("");
    setProgramQuery("");
    setTrackQuery("");
    setPrograms([]);
    setTracks([]);
    setSelectedUniversity(null);
    setSelectedProgram(null);
    setSelectedTrack(null);
  }

  async function saveDesign() {
    if (!activeTarget) return;
    setDesignSaving(true);
    try {
      await api<ApplicationPreparation>(`/application-preparations/${activeTarget.preparationId}`, {
        method: "PUT",
        body: {
          central_question: centralQuestion.trim() || null,
          narrative_outline: [
            { label: "관심의 출발", note: "처음 품었던 질문" },
            { label: "탐구의 확장", note: "자료·방법·판단" },
            { label: "현재의 질문", note: "지원 학과에서 더 탐구할 방향" },
          ],
          evidence: activeTarget.activityIds.map((activityId, index) => ({
            activity_id: activityId,
            narrative_role: index === 0 ? "origin" : index === 1 ? "exploration" : "judgment",
            order_index: index + 1,
          })),
        },
      });
      setTargets((current) => current.map((target) => target.id === activeTarget.id ? { ...target, centralQuestion } : target));
    } finally {
      setDesignSaving(false);
    }
  }

  async function recommendKeyActivities() {
    if (!activeTarget) return;
    setRecommendationLoading(true);
    try {
      const result = await api<ActivityRecommendation>(
        `/application-preparations/${activeTarget.preparationId}/activity-recommendations`,
        { method: "POST" },
      );
      setActivityRecommendation(result);
      const ids = result.activities.map((item) => item.activity_id);
      setTargets((current) => current.map((target) => target.id === activeTarget.id ? { ...target, activityIds: ids } : target));
      await api<ApplicationPreparation>(`/application-preparations/${activeTarget.preparationId}`, {
        method: "PUT",
        body: {
          central_question: centralQuestion.trim() || null,
          narrative_outline: [],
          evidence: ids.map((activityId, index) => ({ activity_id: activityId, narrative_role: "recommendation", order_index: index + 1 })),
        },
      });
    } finally {
      setRecommendationLoading(false);
    }
  }

  function toggleEvidence(activityId: string) {
    if (!activeTarget) return;
    setTargets((current) => current.map((target) => {
      if (target.id !== activeTarget.id) return target;
      const activityIds = target.activityIds.includes(activityId)
        ? target.activityIds.filter((id) => id !== activityId)
        : [...target.activityIds, activityId];
      return { ...target, activityIds };
    }));
  }

  async function deleteTarget() {
    if (!deleteCandidate) return;
    setDeletingTarget(true);
    try {
      await api<void>(`/application-preparations/${deleteCandidate.preparationId}`, { method: "DELETE" });
      setTargets((current) => current.filter((target) => target.id !== deleteCandidate.id));
      if (activeTargetId === deleteCandidate.id) {
        const next = targets.find((target) => target.id !== deleteCandidate.id) ?? null;
        setActiveTargetId(next?.id ?? null);
        setCentralQuestion(next?.centralQuestion ?? "");
      }
      setDeleteCandidate(null);
    } finally {
      setDeletingTarget(false);
    }
  }

  return <div className="portfolio-page">
    <header className="portfolio-header">
      <div>
        <span className="kicker">APPLICATION WORKSPACE</span>
        <h1>수시 준비</h1>
        <p>지원처마다 실제 활동을 골라, 과장 없이 설득력 있는 지원 서사를 준비하세요.</p>
      </div>
      <div className="portfolio-record-status">
        <strong>{records.length}</strong>
        <span>활동 기록 준비됨</span>
      </div>
    </header>

    <div className="portfolio-notice">
      <span aria-hidden="true">◎</span>
      <p>이 작업실은 학생이 저장한 활동과 느낀 점만 근거로 씁니다. 기록에 없는 역할·성과·수치를 새로 만들지 않습니다.</p>
    </div>

    {targets.length === 0 && <section className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-xs" aria-label="수시 준비 시작 방법">
      <span className="text-[10px] font-extrabold tracking-wider text-brand-600">START HERE</span>
      <h2 className="mt-1 text-base font-extrabold text-gray-950">첫 지원처를 정하면 준비 작업실이 열립니다</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        <li className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600"><b className="block text-brand-700">1. 대학 찾기</b><span className="mt-1 block">예: 서울대학교처럼 공식 대학명을 입력합니다.</span></li>
        <li className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600"><b className="block text-brand-700">2. 학과·전형 고르기</b><span className="mt-1 block">선택한 대학의 실제 모집단위와 전형만 표시됩니다.</span></li>
        <li className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600"><b className="block text-brand-700">3. 활동 근거 정리</b><span className="mt-1 block">카드가 만들어지면 내 기록 중 설명할 활동을 고릅니다.</span></li>
      </ol>
    </section>}

    <section className="portfolio-targets" aria-label="지원 대학과 학과">
      <div className="portfolio-section-head">
        <div><span className="portfolio-step">01</span><h2>지원 카드</h2><p>공식 모집 정보에서 대학·모집단위·전형을 고르면, 해당 지원처만을 위한 준비 작업실이 만들어집니다.</p></div>
      </div>
      <form className="target-create" onSubmit={addTarget}>
        <label className="catalog-picker">
          <span>지원 대학</span>
          <input
            value={selectedUniversity ? `${selectedUniversity.name}${selectedUniversity.campus_name ? ` · ${selectedUniversity.campus_name}` : ""}` : universityQuery}
            onChange={(event) => {
              setUniversityQuery(event.target.value);
              setSelectedUniversity(null);
              setSelectedProgram(null);
              setSelectedTrack(null);
              setPrograms([]);
              setTracks([]);
            }}
            placeholder="예: 서울대학교"
            autoComplete="off"
          />
          {catalogLoading === "university" && <small className="catalog-status">찾는 중</small>}
          {universityResults.length > 0 && <div className="catalog-options" role="listbox" aria-label="대학 검색 결과">
            {universityResults.map((university) => <button key={university.id} type="button" onClick={() => {
              setSelectedUniversity(university);
              setUniversityQuery("");
              setSelectedProgram(null);
              setSelectedTrack(null);
              setPrograms([]);
              setTracks([]);
            }}>
              <strong>{university.name}</strong><span>{[university.campus_name, university.region].filter(Boolean).join(" · ")}</span>
            </button>)}
          </div>}
        </label>
        <label className="catalog-picker">
          <span>지원 학과</span>
          <input
            value={selectedProgram ? selectedProgram.name : programQuery}
            onChange={(event) => {
              setProgramQuery(event.target.value);
              setSelectedProgram(null);
              setSelectedTrack(null);
              setTracks([]);
            }}
            placeholder={selectedUniversity ? "학과명을 입력해 찾아보세요" : "대학을 먼저 선택하세요"}
            disabled={!selectedUniversity || catalogLoading === "program"}
            autoComplete="off"
          />
          {catalogLoading === "program" && <small className="catalog-status">공식 목록을 확인하는 중</small>}
          {!selectedProgram && selectedUniversity && programQuery.trim() && <div className="catalog-options" role="listbox" aria-label="학과 검색 결과">
            {programs.filter((program) => program.name.includes(programQuery.trim())).slice(0, 12).map((program) => <button key={program.id} type="button" onClick={() => {
              setSelectedProgram(program);
              setProgramQuery("");
              setSelectedTrack(null);
              setTracks([]);
            }}><strong>{program.name}</strong><span>{program.source_status === "final" ? "최종 모집요강" : "모집계획"}</span></button>)}
            {programs.filter((program) => program.name.includes(programQuery.trim())).length === 0 && <p className="catalog-no-result">일치하는 모집단위가 없습니다.</p>}
          </div>}
        </label>
        <label className="catalog-picker">
          <span>지원 전형</span>
          <input
            value={selectedTrack ? selectedTrack.name : trackQuery}
            onChange={(event) => {
              setTrackQuery(event.target.value);
              setSelectedTrack(null);
            }}
            placeholder={selectedProgram ? "전형명을 입력해 찾아보세요" : "학과를 먼저 선택하세요"}
            disabled={!selectedProgram || catalogLoading === "track"}
            autoComplete="off"
          />
          {catalogLoading === "track" && <small className="catalog-status">전형을 확인하는 중</small>}
          {!selectedTrack && selectedProgram && trackQuery.trim() && <div className="catalog-options" role="listbox" aria-label="전형 검색 결과">
            {tracks.filter((track) => track.name.includes(trackQuery.trim())).slice(0, 12).map((track) => <button key={track.id} type="button" onClick={() => {
              setSelectedTrack(track);
              setTrackQuery("");
            }}><strong>{track.name}</strong><span>{track.recruitment_period ?? "전형"} · {track.source_status === "final" ? "최종 모집요강" : "모집계획"}</span></button>)}
            {tracks.filter((track) => track.name.includes(trackQuery.trim())).length === 0 && <p className="catalog-no-result">일치하는 전형이 없습니다.</p>}
          </div>}
        </label>
        <button className="btn btn-primary" type="submit" disabled={!selectedUniversity || !selectedProgram || !selectedTrack}>지원 카드 만들기</button>
      </form>
      {catalogError && <p className="catalog-error" role="alert">{catalogError}</p>}
      {targets.length > 0 && <div className="target-card-grid">
        {targets.map((target) => <article className={`target-card${target.id === activeTargetId ? " selected" : ""}`} key={target.id}>
          <button className="target-card-select" onClick={() => { setActiveTargetId(target.id); setCentralQuestion(target.centralQuestion); }} type="button">
            <span className="target-card-top"><span>{target.track || "지원 준비"}</span><span aria-hidden="true">→</span></span>
            <strong>{target.university}</strong><b>{target.department}</b>
            <small>근거 활동 {target.activityIds.length}개 선택</small>
          </button>
          <button className="target-card-delete" onClick={() => setDeleteCandidate(target)} aria-label={`${target.university} ${target.department} 지원 카드 삭제`} type="button">×</button>
        </article>)}
      </div>}
    </section>

    {!activeTarget ? <section className="portfolio-empty">
      <div className="portfolio-empty-mark" aria-hidden="true">↗</div>
      <h2>첫 지원 카드를 만들어보세요</h2>
      <p>지원하려는 대학과 학과를 고르면, 그곳에 맞춰 활동 근거와 지원 스토리를 정리할 수 있습니다.</p>
    </section> : <section className="portfolio-workspace" aria-label={`${activeTarget.university} ${activeTarget.department} 준비 작업실`}>
      <div className="portfolio-workspace-head">
        <div><span className="portfolio-step">02</span><h2>{activeTarget.university} · {activeTarget.department}</h2><p>{activeTarget.track} · 이 지원처를 위한 학생부·면접 준비 작업실</p></div>
        <span className={`portfolio-readiness ${evidence.length >= 3 ? "ready" : "building"}`}>{evidence.length >= 3 ? "근거 구성 중" : "근거 더 고르기"}</span>
      </div>

      <section className="portfolio-strategy" aria-label="지원처 준비 개요">
        <article>
          <span>전형 방식</span>
          <strong>{activeTarget.trackDetails?.recruitment_period ?? "수시"}</strong>
          <p>{(activeTarget.trackDetails?.has_document_review ?? trackReference?.has_document_review) === true ? "학생부 서류평가 포함" : (activeTarget.trackDetails?.has_document_review ?? trackReference?.has_document_review) === false ? "서류평가 미반영" : "세부 반영 방식은 원문 확인 필요"}</p>
          {trackReference && <small>{trackReference.source_admission_year}학년도 공식 자료 참고</small>}
        </article>
        <article>
          <span>면접 준비</span>
          <strong>{(activeTarget.trackDetails?.has_interview ?? trackReference?.has_interview) === true ? "면접 반영" : (activeTarget.trackDetails?.has_interview ?? trackReference?.has_interview) === false ? "면접 미반영" : "세부 기준은 안내서 확인"}</strong>
          <p>{(activeTarget.trackDetails?.has_interview ?? trackReference?.has_interview) === true ? "선택 활동을 본인의 언어로 설명하는 연습을 시작하세요." : "대학 안내서의 모집단위별 적용 여부를 함께 확인하세요."}</p>
          {trackReference && <small>{trackReference.source_admission_year}학년도 공식 자료 참고</small>}
        </article>
        <article>
          <span>수능최저</span>
          <strong>{(activeTarget.trackDetails?.has_minimum_requirement ?? trackReference?.has_minimum_requirement) === true ? "적용" : (activeTarget.trackDetails?.has_minimum_requirement ?? trackReference?.has_minimum_requirement) === false ? "미적용" : "세부 기준은 안내서 확인"}</strong>
          <p>수능최저는 모집단위별 기준과 변경 공지를 함께 확인하세요.</p>
          {trackReference && <small>{trackReference.source_admission_year}학년도 공식 자료 참고</small>}
        </article>
        <article>
          <span>학과·전형 정보</span>
          <strong>{universityGuide ? `${universityGuide.source_admission_year}학년도 공식 기준` : "공식 원문"}</strong>
          <p>{admissionInfoLoading || trackReferenceLoading ? "최근 공식 자료를 확인하는 중입니다." : universityGuide ? "대학 안내·학과 소개·과거 결과를 아래에서 확인하세요." : trackReference?.summary ?? "대학이 공개한 최신 모집 정보를 확인하세요."}</p>
          <a href={universityGuide?.source_url || trackReference?.source_url || activeTarget.programSourceUrl} target="_blank" rel="noreferrer">모집 정보 보기</a>
        </article>
      </section>

      {admissionInfoLoading && <section className="admission-detail admission-detail-loading" aria-live="polite">
        <p>대학 안내, 학과 소개, 전년도 공개 결과를 불러오는 중입니다.</p>
      </section>}

      {!admissionInfoLoading && (trackDetail || universityGuide || programProfile || pastResults || universityStatistics) && <section className="admission-detail" aria-label="지원처 상세 정보">
        <div className="admission-detail-head">
          <div><span>공개 자료 기반 상세 정보</span><h3>{activeTarget.university} · {activeTarget.department} · {activeTarget.track}</h3><p>대학·학과·전형별로 공개된 원문을 기준 연도와 함께 정리했습니다. 과거 결과는 합격선이나 지원 가능 여부를 확정하지 않습니다.</p></div>
          {universityGuide && <a href={universityGuide.source_url} target="_blank" rel="noreferrer">{universityGuide.source_admission_year}학년도 모집안내 원문 ↗</a>}
        </div>

        {trackDetail && <section className="admission-data-section" aria-label="전형별 공식 상세 정보">
          <div className="admission-data-head"><div><span>전형별 공식 상세</span><h4>지원 자격·평가 방법·일정</h4><p>{trackDetail.source_admission_year}학년도 공개 모집안내 기준입니다. 이후 학년도 자료가 나오면 해당 전형의 새 안내로 다시 대조합니다.</p></div><a href={trackDetail.source_url} target="_blank" rel="noreferrer">모집안내 원문 ↗</a></div>
          <div className="admission-profile-sections">
            <article><h5>지원 자격</h5><p>{trackDetail.eligibility}</p></article>
            <article><h5>전형 방법</h5><p>{trackDetail.selection_method}</p></article>
            <article><h5>서류 평가</h5><p>{trackDetail.document_evaluation}</p></article>
            <article><h5>면접</h5><p>{trackDetail.interview}</p></article>
            <article><h5>수능최저</h5><p>{trackDetail.csat_minimum}</p></article>
          </div>
          {trackDetail.schedule.length > 0 && <div className="admission-profile-sections mt-3"><article><h5>주요 일정</h5><ul>{trackDetail.schedule.map((item, index) => <li key={`schedule-${index}`}>{item}</li>)}</ul></article></div>}
          {trackDetail.sections.length > 0 && <div className="admission-profile-sections mt-3">{trackDetail.sections.map((section) => <article key={section.title}><h5>{section.title}</h5><p>{section.description}</p><ul>{section.items.map((item, index) => <li key={`${section.title}-${index}`}>{item}</li>)}</ul></article>)}</div>}
        </section>}

        {programProfile && <section className="admission-data-section" aria-label="학과 소개">
          <div className="admission-data-head"><div><span>학과 소개</span><h4>{programProfile.reference_program_name}</h4><p>{programProfile.source_admission_year}학년도 공개 학과 정보를 기준으로, 교육과정과 진로 방향을 살펴보세요.</p></div><a href={programProfile.source_url} target="_blank" rel="noreferrer">원문 보기 ↗</a></div>
          <div className="admission-profile-summary">
            {programProfile.academic_field && <span>계열 <b>{programProfile.academic_field}</b></span>}
            {programProfile.recruitment_count != null && <span>모집인원 <b>{programProfile.recruitment_count}명</b></span>}
            {programProfile.early_competition_rate != null && <span>수시 경쟁률 <b>{programProfile.early_competition_rate}:1</b></span>}
            {programProfile.regular_competition_rate != null && <span>정시 경쟁률 <b>{programProfile.regular_competition_rate}:1</b></span>}
          </div>
          <div className="admission-profile-sections">{programProfile.sections.map((section) => <article key={section.title}>
            <h5>{section.title}</h5><ul>{section.items.map((item, index) => <li key={`${section.title}-${index}`}>{item}</li>)}</ul>
          </article>)}</div>
        </section>}

        {universityGuide && <section className="admission-data-section" aria-label="대학 모집 안내">
          <div className="admission-data-head"><div><span>대학 모집 안내</span><h4>수시·정시 전형 특징과 입시가이드</h4><p>각 자료는 실제로 공개된 기준 연도를 그대로 표시합니다.</p></div><a href={universityGuide.source_url} target="_blank" rel="noreferrer">모집안내 원문 ↗</a></div>
          <div className="admission-guide-sections">{universityGuide.sections.map((section) => <article key={section.title}>
            <div className="admission-guide-title"><h5>{section.title}</h5><small>{section.source_admission_year}학년도 자료</small></div>
            {section.paragraphs.map((paragraph, index) => <p key={`${section.title}-paragraph-${index}`}>{paragraph}</p>)}
            {section.tables.map((table, tableIndex) => <div className="admission-table-wrap" key={`${section.title}-table-${tableIndex}`}><table><tbody>{table.rows.map((row, rowIndex) => <tr key={`${section.title}-${tableIndex}-${rowIndex}`}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex} scope="col">{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>)}
          </article>)}</div>
        </section>}

        {pastResults && <section className="admission-data-section" aria-label="전년도 공개 입시결과">
          <div className="admission-data-head"><div><span>전년도 공개 입시결과</span><h4>{pastResults.reference_program_name}</h4><p>{pastResults.source_admission_year}학년도 공개 결과입니다. 같은 이름의 모집단위와 정확히 대응하는 자료만 표시하며, 합격선으로 해석하면 안 됩니다.</p></div><a href={pastResults.source_url} target="_blank" rel="noreferrer">원문 보기 ↗</a></div>
          <div className="admission-table-wrap admission-results-table"><table><thead><tr><th>모집시기</th><th>전형유형</th><th>전형명</th><th>최종 모집</th><th>경쟁률</th><th>추가합격</th>{pastResultMetricKeys.map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{pastResults.outcomes.map((outcome, index) => <tr key={`${outcome.selection_name ?? "result"}-${index}`}><td>{outcome.recruitment_period ?? "–"}</td><td>{outcome.selection_type ?? "–"}</td><td>{outcome.selection_name ?? "–"}</td><td>{outcome.final_recruitment_count ?? "–"}</td><td>{outcome.competition_rate != null ? `${outcome.competition_rate}:1` : "–"}</td><td>{outcome.additional_admission_count ?? "–"}</td>{pastResultMetricKeys.map((key) => <td key={key}>{outcome.metrics[key] ?? "–"}</td>)}</tr>)}</tbody></table></div>
        </section>}

        {universityStatistics && <section className="admission-data-section" aria-label="대학 공개 통계">
          <div className="admission-data-head"><div><span>대학 공개 통계</span><h4>{universityStatistics.source_admission_year}학년도 기준 대학 단위 정보</h4><p>대학 전체 수치이므로 선택한 모집단위의 결과와 혼동하지 마세요.</p></div><a href={universityStatistics.source_url} target="_blank" rel="noreferrer">통계 원문 ↗</a></div>
          <div className="admission-stat-grid">
            {universityStatistics.recruitment_and_applicants.length > 0 && <article><h5>모집·지원 인원</h5><ul>{universityStatistics.recruitment_and_applicants.map((item, index) => <li key={`${item.admission_year}-${item.admission_period}-${index}`}><span>{item.admission_year ?? "기준 연도"} · {item.admission_period ?? "전체"}</span><b>모집 {item.recruitment_count ?? "–"}명 · 지원 {item.applicant_count ?? "–"}명</b></li>)}</ul></article>}
            {universityStatistics.competition_rate.length > 0 && <article><h5>대학 전체 경쟁률</h5><ul>{universityStatistics.competition_rate.map((item, index) => <li key={`${item.admission_year}-${index}`}><span>{item.admission_year ?? "기준 연도"}</span><b>수시 {item.early_ratio ?? "–"}:1 · 정시 {item.regular_ratio ?? "–"}:1</b></li>)}</ul></article>}
            {universityStatistics.selection_distribution.length > 0 && <article><h5>전형별 모집 분포</h5><ul>{universityStatistics.selection_distribution.map((item, index) => <li key={`${item.admission_year}-${item.selection_type}-${index}`}><span>{item.admission_year ?? "기준 연도"} · {item.selection_type ?? "전형"}</span><b>{item.recruitment_count ?? "–"}명</b></li>)}</ul></article>}
            {universityStatistics.employment_rate.length > 0 && <article><h5>취업률</h5><ul>{universityStatistics.employment_rate.map((item, index) => <li key={`${item.year}-${index}`}><span>{item.year ?? "기준 연도"}</span><b>{item.rate != null ? `${item.rate}%` : "–"}</b></li>)}</ul></article>}
          </div>
        </section>}
      </section>}

      {admissionResearch && admissionResearch.cards.length > 0 && <section className="admission-research" aria-label="지원처 추가 정보">
        <div className="admission-research-head"><div><span>지원 판단에 도움 되는 정보</span><h3>{activeTarget.university} · {activeTarget.department} 추가 리서치</h3><p>전형 조건뿐 아니라 과거 결과, 단과대학이 내세우는 방향, 학생부를 읽는 관점까지 함께 확인하세요. 과거 지표는 합격선을 뜻하지 않습니다.</p></div></div>
        <div className="admission-research-grid">{admissionResearch.cards.map((card) => <article key={card.title}>
          <div className="admission-research-title"><h4>{card.title}</h4>{card.is_service_interpretation && <span>서비스 해석</span>}</div>
          <p>{card.description}</p><ul>{card.items.map((item) => <li key={item}>{item}</li>)}</ul>
          <a href={card.source_url} target="_blank" rel="noreferrer">{card.source_label}{card.source_admission_year ? ` · ${card.source_admission_year}학년도` : ""} ↗</a>
        </article>)}</div>
      </section>}

      <section className="portfolio-design" aria-label="지원 스토리 설계">
        <div className="panel-title"><div><h3>핵심 활동과 지원 흐름</h3><p>지원 학과와 연결해 설명할 수 있는 활동을 골라, 관심이 어떻게 깊어졌는지 정리하세요.</p></div><span>학생부 기반</span></div>
        {activityFlows.length > 0 && <div className="flow-options">{activityFlows.map((flow) => <article key={flow.id ?? flow.title}>
          <strong>{flow.title}</strong>{flow.description && <p>{flow.description}</p>}
          <div>{flow.activities.map((item) => <button type="button" key={item.activity_id} className={activeTarget.activityIds.includes(item.activity_id) ? "picked" : ""} onClick={() => toggleEvidence(item.activity_id)}>
            <span>{item.grade}학년{item.semester ? ` ${item.semester}학기` : ""}</span><b>{item.title}</b><em className={item.readiness}>{item.readiness === "ready" ? "근거 충분" : "기록 보완"}</em>
          </button>)}</div>
        </article>)}</div>}
        <label className="central-question"><span>이 지원처에서 끝까지 답할 중심 질문</span><textarea value={centralQuestion} onChange={(event) => setCentralQuestion(event.target.value)} placeholder={`예: ${activeTarget.department}에서 더 탐구하고 싶은 문제는 무엇인가?`} /></label>
        <div className="design-save-row"><p>선택한 활동의 과정·성찰·첨부자료가 부족하면 면접 준비 전에 보완 항목으로 남습니다.</p><button className="btn btn-secondary" type="button" onClick={() => void saveDesign()} disabled={designSaving}>{designSaving ? "저장 중" : "설계 저장"}</button></div>
      </section>

      <div className="portfolio-work-grid">
        <section className="portfolio-panel evidence-panel">
          <div className="panel-title"><div><h3>핵심 활동 후보</h3><p>선택한 지원처 기준으로 우선순위를 정하고, 직접 설명할 수 있는 활동만 남기세요.</p></div><span>{evidence.length} / {records.length}</span></div>
          <div className="key-activity-action"><button className="btn btn-secondary" type="button" onClick={() => void recommendKeyActivities()} disabled={recommendationLoading || records.length === 0}>{recommendationLoading ? "활동을 살피는 중" : "AI가 핵심 활동 추리기"}</button><p>추천은 학생부 기록만 바탕으로 하며, 최종 선택은 학생이 직접 바꿀 수 있습니다.</p></div>
          {activityRecommendation && <div className="key-activity-result">{activityRecommendation.activities.length ? <>{activityRecommendation.activities.map((item) => <p key={item.activity_id}><b>{item.rank}순위</b> {item.reason}{item.missing_fields.length > 0 && <small>기록 보완: {item.missing_fields.join(" · ")}</small>}</p>)}</> : <p>현재 기록만으로는 핵심 활동을 고르기 어렵습니다.</p>}{activityRecommendation.gap_notice && <aside>{activityRecommendation.gap_notice}</aside>}</div>}
          {records.length ? <div className="evidence-list">{records.map((record) => {
            const selected = activeTarget.activityIds.includes(record.id);
            return <button className={`evidence-item${selected ? " selected" : ""}`} key={record.id} onClick={() => toggleEvidence(record.id)} type="button">
              <span className="evidence-check" aria-hidden="true">{selected ? "✓" : ""}</span>
              <span className="evidence-copy"><small>{record.periodLabel || `${record.grade}학년`} {record.subject && `· ${record.subject}`}</small><strong>{record.title}</strong><em>{record.summary || "활동 내용이 아직 비어 있습니다"}</em></span>
            </button>;
          })}</div> : <p className="panel-empty">먼저 활동 기록 탭에서 실제 활동을 저장해주세요.</p>}
        </section>

        <section className="portfolio-panel narrative-panel">
          <div className="panel-title"><div><h3>지원 스토리 설계도</h3><p>완성 문장보다 먼저, 어떤 사실로 무엇을 보여주고 면접에서 설명할지 정합니다.</p></div><span>기록 기반</span></div>
          <ol className="narrative-map">
            <li><span>1</span><div><strong>관심의 출발</strong><p>{workspace.profile.targetCareer || "희망 진로"}에 관심을 갖게 된 계기와, {activeTarget.department}에 지원하려는 이유를 학생의 언어로 적어보세요.</p></div></li>
            <li><span>2</span><div><strong>탐구의 확장</strong><p>{evidence[0] ? `‘${evidence[0].title}’에서 무엇을 궁금해했고 어떤 자료·방법으로 확인했는지 보여주세요.` : "이 흐름을 뒷받침할 활동을 하나 이상 선택해주세요."}</p></div></li>
            <li><span>3</span><div><strong>나의 판단과 변화</strong><p>{evidence[1] ? `‘${evidence[1].title}’에서 스스로 내린 판단, 한계, 다음 질문을 구체적으로 남겨보세요.` : "서로 다른 활동을 하나 더 골라 사고의 변화가 드러나게 해보세요."}</p></div></li>
            <li><span>4</span><div><strong>지원 학과와의 연결</strong><p>{activeTarget.department}에서 더 깊게 배우고 싶은 질문을 적습니다. 대학의 프로그램을 사실처럼 단정하지 말고, 확인한 정보만 사용하세요.</p></div></li>
          </ol>
          <div className="narrative-foot"><span>다음 단계</span><p>선택한 근거를 바탕으로 면접에서 설명할 핵심 답변을 정리하고, 사실 여부를 검토합니다.</p></div>
        </section>
      </div>

      <section className="portfolio-panel interview-panel">
        <div className="panel-title"><div><h3>면접으로 이어질 질문</h3><p>글에 넣을 사실은 직접 설명할 수 있어야 합니다.</p></div></div>
        {evidence.length ? <div className="interview-questions">{evidence.slice(0, 3).map((record) => <article key={record.id}><span>{record.periodLabel || `${record.grade}학년`}</span><p>“{record.title}에서 본인이 직접 판단한 부분은 무엇이며, 그 경험이 {activeTarget.department} 관심으로 어떻게 이어졌나요?”</p></article>)}</div> : <p className="panel-empty">근거 활동을 선택하면 활동별 면접 질문을 정리합니다.</p>}
      </section>
    </section>}
    {deleteCandidate && <div className="target-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-target-title">
      <div className="target-delete-backdrop" onClick={() => !deletingTarget && setDeleteCandidate(null)} />
      <section className="target-delete-card"><h2 id="delete-target-title">지원 카드를 삭제할까요?</h2><p><strong>{deleteCandidate.university} · {deleteCandidate.department}</strong> 카드와 이 카드에서 고른 활동 연결만 삭제됩니다. 활동 기록 자체는 유지됩니다.</p><div><button className="btn btn-secondary" type="button" disabled={deletingTarget} onClick={() => setDeleteCandidate(null)}>취소</button><button className="btn btn-danger" type="button" disabled={deletingTarget} onClick={() => void deleteTarget()}>{deletingTarget ? "삭제 중" : "삭제"}</button></div></section>
    </div>}
  </div>;
}
