"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  AssignmentAnalysis,
  DnaDiagnosis,
  ProductWorkspace,
  ProfileInput,
  ReconciliationLog,
  Roadmap,
  RoadmapNode,
} from "../lib/product-harness";
import {
  SCHOOL_RECORD_MAX_FILE_SIZE,
  SCHOOL_RECORD_MAX_FILE_SIZE_LABEL,
  type SchoolRecordDraft,
  type SchoolRecordParseResult,
} from "../lib/school-record-parser";

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */
type TabId = "overview" | "roadmap" | "assignment" | "activities" | "profile";

type ProfileForm = {
  name: string; grade: string; semester: string;
  targetCareer: string; targetMajors: string; interests: string;
  motivationTrigger: string; careerResolution: string; currentEngagement: string;
  preferredSubjects: string; strengths: string; gaps: string; constraints: string;
  outputPreference: string; collaborationStyle: string;
};

type RoadmapPhase = "past" | "current" | "future";
type RoadmapViewMode = "all" | "records" | "plan";
type RoadmapEventCategory = "상장" | "대회" | "수행평가" | "보고서" | "독서" | "시험";

type RoadmapTimelineEvent = {
  id: string; date: string;
  category: RoadmapEventCategory;
  subject: string; title: string; isPlan: boolean;
};

/* ──────────────────────────────────────────────
   Constants
   ────────────────────────────────────────────── */
const EMPTY_PROFILE: ProfileForm = {
  name: "", grade: "", semester: "", targetCareer: "",
  targetMajors: "", interests: "", motivationTrigger: "", careerResolution: "",
  currentEngagement: "", preferredSubjects: "", strengths: "", gaps: "", constraints: "",
  outputPreference: "", collaborationStyle: "",
};

const APP_VERSION = "0.7.0";

const ROADMAP_CATEGORIES: Array<{ category: RoadmapEventCategory; icon: string }> = [
  { category: "상장", icon: "★" },
  { category: "대회", icon: "◆" },
  { category: "수행평가", icon: "✓" },
  { category: "보고서", icon: "▤" },
  { category: "독서", icon: "📖" },
  { category: "시험", icon: "✎" },
];

const SUBJECT_COLORS = [
  "#6366F1", "#EC4899", "#14B8A6", "#F59E0B",
  "#8B5CF6", "#10B981", "#3B82F6", "#EF4444",
];

/* ──────────────────────────────────────────────
   Utilities
   ────────────────────────────────────────────── */
function splitList(value: string) {
  return value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

function toProfileInput(form: ProfileForm): ProfileInput {
  return {
    name: form.name.trim(), grade: Number(form.grade), semester: Number(form.semester),
    targetCareer: form.targetCareer.trim(), targetMajors: splitList(form.targetMajors),
    interests: splitList(form.interests),
    motivationTrigger: form.motivationTrigger,
    careerResolution: form.careerResolution,
    currentEngagement: splitList(form.currentEngagement),
    preferredSubjects: splitList(form.preferredSubjects),
    strengths: splitList(form.strengths), gaps: splitList(form.gaps), constraints: splitList(form.constraints),
    outputPreference: form.outputPreference,
    collaborationStyle: form.collaborationStyle,
  };
}

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const raw = await response.text();
  let payload: (T & { error?: string }) | null = null;
  try { payload = JSON.parse(raw) as T & { error?: string }; } catch {
    if (response.status === 413) throw new Error(`파일이 너무 큽니다. ${SCHOOL_RECORD_MAX_FILE_SIZE_LABEL} 이하의 PDF를 선택해주세요.`);
    throw new Error("서버가 분석 결과를 정상적으로 반환하지 못했습니다.");
  }
  if (!response.ok) throw new Error(payload!.error ?? "요청을 처리하지 못했습니다.");
  return payload!;
}

function roadmapIndex(grade: number, semester: number) { return (grade - 1) * 2 + semester - 1; }

function roadmapPhase(workspace: ProductWorkspace, node: RoadmapNode): RoadmapPhase {
  const current = roadmapIndex(workspace.profile.grade, workspace.profile.semester);
  const target = roadmapIndex(node.grade, node.semester);
  if (target < current) return "past";
  if (target === current) return "current";
  return "future";
}

function subjectColor(subject: string) {
  const hash = [...subject].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
}

function activityCategory(activityType: string): RoadmapEventCategory {
  if (/상장|수상|우수상/.test(activityType)) return "상장";
  if (/대회|발표/.test(activityType)) return "대회";
  if (/수행/.test(activityType)) return "수행평가";
  if (/독서|도서/.test(activityType)) return "독서";
  if (/시험|중간|기말/.test(activityType)) return "시험";
  return "보고서";
}

function academicTimelinePosition(date: string) {
  const [, monthText = "3", dayText = "1"] = date.split("-");
  const month = Number(monthText); const day = Number(dayText);
  const academicMonth = month >= 3 ? month - 3 : month + 9;
  const daysInMonth = new Date(2024, month, 0).getDate();
  return Math.max(0.5, Math.min(99.5, ((academicMonth + (day - 1) / daysInMonth) / 12) * 100));
}

function timelineClusters(events: RoadmapTimelineEvent[]) {
  const clusters: Array<{ id: string; position: number; events: RoadmapTimelineEvent[] }> = [];
  for (const event of events) {
    const position = academicTimelinePosition(event.date);
    const prev = clusters[clusters.length - 1];
    if (prev && Math.abs(position - prev.position) <= 3) {
      prev.events.push(event);
      prev.position = prev.events.reduce((sum, e) => sum + academicTimelinePosition(e.date), 0) / prev.events.length;
    } else {
      clusters.push({ id: `cluster-${event.id}`, position, events: [event] });
    }
  }
  return clusters;
}

/* ──────────────────────────────────────────────
   Shared Components
   ────────────────────────────────────────────── */
function StatusBadge({ status }: { status: RoadmapNode["status"] }) {
  const config: Record<RoadmapNode["status"], { label: string; cls: string }> = {
    planned:      { label: "예정",     cls: "badge-planned" },
    active:       { label: "진행 중",  cls: "badge-active"  },
    instantiated: { label: "실행 중",  cls: "badge-active"  },
    completed:    { label: "완료",     cls: "badge-done"    },
    skipped:      { label: "건너뜀",   cls: "badge-muted"   },
    revised:      { label: "수정됨",   cls: "badge-muted"   },
  };
  const { label, cls } = config[status];
  return <span className={`status-badge ${cls}`}>{label}</span>;
}

/* ──────────────────────────────────────────────
   Onboarding
   ────────────────────────────────────────────── */
function Onboarding({ onComplete }: { onComplete: (workspace: ProductWorkspace) => void }) {
  const [form, setForm] = useState<ProfileForm>(EMPTY_PROFILE);
  const [step, setStep] = useState<1 | 2>(1);
  const [preview, setPreview] = useState<{
    profile: ProfileInput & { id: string };
    roadmap: Roadmap; dna: DnaDiagnosis;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((cur) => ({ ...cur, [key]: value }));
  }

  async function createPreview() {
    setBusy(true); setError("");
    try {
      const result = await jsonRequest<typeof preview>("/api/onboarding/preview", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(toProfileInput(form)),
      });
      setPreview(result);
    } catch (e) { setError(e instanceof Error ? e.message : "로드맵을 만들지 못했습니다."); }
    finally { setBusy(false); }
  }

  function editPreviewNode(nodeId: string, field: "title" | "objective", value: string) {
    setPreview((cur) => cur ? {
      ...cur, roadmap: {
        ...cur.roadmap,
        nodes: cur.roadmap.nodes.map((n) => n.id === nodeId ? { ...n, [field]: value } : n),
      },
    } : cur);
  }

  async function confirmOnboarding() {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace }>("/api/onboarding", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: toProfileInput(form), roadmap: preview.roadmap }),
      });
      window.localStorage.setItem("seteuk-current-student", result.workspace.profile.id);
      onComplete(result.workspace);
    } catch (e) { setError(e instanceof Error ? e.message : "가입 정보를 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  const canPreview = !!form.name.trim() && !!form.grade && !!form.semester && !!form.targetCareer.trim() && !!form.motivationTrigger && !!form.outputPreference;

  /* ── Preview Screen ── */
  if (preview) {
    return (
      <div className="onboarding-page">
        <div className="onboarding-layout">
          {/* Left panel */}
          <aside className="onboarding-panel">
            <div className="ob-brand">
              <span className="ob-brand-mark">세특</span>
              <div>
                <strong>세특연구소</strong>
                <small>Personalized School Coach</small>
              </div>
            </div>
            <div className="ob-tagline">
              <h1>{preview.profile.name} 학생의<br />첫 3개년</h1>
              <p>이 로드맵은 제안입니다. 내용을 직접 수정한 뒤 저장할 수 있어요.</p>
            </div>
            <div className="ob-progress">
              <span className="ob-step-dot is-done">✓</span>
              <span className="ob-step-connector is-done" />
              <span className="ob-step-dot is-done">✓</span>
              <span className="ob-step-connector is-done" />
              <span className="ob-step-dot is-active">3</span>
            </div>
          </aside>

          {/* Right — preview */}
          <main className="ob-preview-panel">
            <div className="ob-preview-header">
              <span className="kicker">ROADMAP PREVIEW · Version 1</span>
              <h2>{preview.profile.name}의 고교 3개년 로드맵</h2>
              <p>학기별 제목과 목표를 지금 바로 수정할 수 있어요. 저장 후에도 언제든지 편집 가능합니다.</p>
            </div>

            <div className="preview-dna-card">
              <small>잠정 STUDENT DNA</small>
              <h3>{preview.dna.narrative}</h3>
              <div className="preview-dna-facts">
                {preview.dna.facts.map((fact) => <span key={fact}>{fact}</span>)}
              </div>
            </div>

            <div className="preview-notice">
              ⚠ 실제 활동이 아직 없으므로 AI 해석의 신뢰도는 낮습니다. 활동을 추가하면 DNA가 다시 계산됩니다.
            </div>

            <div className="preview-nodes">
              {preview.roadmap.nodes.map((node) => (
                <article className={`preview-node ${node.status}`} key={node.id}>
                  <div className="preview-node-head">
                    <span className="preview-node-period">{node.grade}학년 {node.semester}학기 · {node.narrativeStage}</span>
                    <StatusBadge status={node.status} />
                  </div>
                  <input
                    aria-label={`${node.grade}학년 ${node.semester}학기 제목`}
                    value={node.title}
                    onChange={(e) => editPreviewNode(node.id, "title", e.target.value)}
                  />
                  <textarea
                    aria-label={`${node.grade}학년 ${node.semester}학기 목표`}
                    value={node.objective}
                    onChange={(e) => editPreviewNode(node.id, "objective", e.target.value)}
                  />
                  <div className="preview-node-tags">
                    {node.candidateSubjects.map((s) => <span key={s}>{s}</span>)}
                  </div>
                </article>
              ))}
            </div>

            {error && <div className="banner banner-error">{error}</div>}

            <div className="preview-actions">
              <button className="btn btn-secondary" onClick={() => setPreview(null)} type="button">
                ← 응답 수정
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={confirmOnboarding} type="button">
                {busy ? "작업공간 만드는 중…" : "이 로드맵으로 시작 →"}
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  /* ── Form Screen ── */
  return (
    <div className="onboarding-page">
      <div className="onboarding-layout">
        {/* Left panel */}
        <aside className="onboarding-panel">
          <div className="ob-brand">
            <span className="ob-brand-mark">세특</span>
            <div>
              <strong>세특연구소</strong>
              <small>Personalized School Coach</small>
            </div>
          </div>
          <div className="ob-tagline">
            <h1>지금의 나에서<br />시작하는<br />3개년</h1>
            <p>질문에 답하면 학기별 서사 로드맵과 DNA를 분석해 드립니다.</p>
          </div>
          <div className="ob-features">
            <strong>세 가지 원칙</strong>
            <div className="ob-feature">
              <span className="ob-feature-icon">📌</span>
              <div className="ob-feature-text">
                <strong>제안이며 언제든 수정해요</strong>
                <small>확정된 미래가 아닌 시작점입니다</small>
              </div>
            </div>
            <div className="ob-feature">
              <span className="ob-feature-icon">✅</span>
              <div className="ob-feature-text">
                <strong>실제 활동이 계획보다 우선합니다</strong>
                <small>기록이 쌓일수록 더 정확해집니다</small>
              </div>
            </div>
            <div className="ob-feature">
              <span className="ob-feature-icon">🔄</span>
              <div className="ob-feature-text">
                <strong>달라진 진로는 버전으로 남깁니다</strong>
                <small>기존 로드맵을 덮어쓰지 않아요</small>
              </div>
            </div>
          </div>
          <div className="ob-progress">
            <span className={`ob-step-dot ${step >= 1 ? "is-active" : ""}`}>1</span>
            <span className={`ob-step-connector ${step >= 2 ? "is-done" : ""}`} />
            <span className={`ob-step-dot ${step >= 2 ? "is-active" : ""}`}>2</span>
            <span className="ob-step-connector" />
            <span className="ob-step-dot">3</span>
          </div>
        </aside>

        {/* Right — form */}
        <main className="ob-form-panel">
          <div className="ob-form-header">
            <span className="kicker">NEW STUDENT ONBOARDING · Step {step} / 2</span>
            <h2>{step === 1 ? "기본 정보와 진로 방향" : "작업 방식과 성향 파악"}</h2>
            <p>
              {step === 1
                ? "학생의 현재 학년과 관심 분야를 알려주세요. 막연해도 괜찮습니다."
                : "어떤 방식으로 학습하고 결과물을 만드는지 선호도를 알려주세요."}
            </p>
          </div>

          {step === 1 && (
            <div className="form-steps">
              {/* Section 1 */}
              <div className="ob-section">
                <div className="ob-section-title">
                  <small>기본 정보</small>
                  <strong>학생과 현재 시점</strong>
                </div>
                <div className="form-grid-3">
                  <div className="form-field">
                    <label htmlFor="ob-name">이름</label>
                    <input id="ob-name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="예: 김세특" />
                  </div>
                  <div className="form-field">
                    <label htmlFor="ob-grade">학년</label>
                    <select id="ob-grade" value={form.grade} onChange={(e) => update("grade", e.target.value)}>
                      <option value="">선택</option>
                      <option value="1">1학년</option>
                      <option value="2">2학년</option>
                      <option value="3">3학년</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label htmlFor="ob-semester">학기</label>
                    <select id="ob-semester" value={form.semester} onChange={(e) => update("semester", e.target.value)}>
                      <option value="">선택</option>
                      <option value="1">1학기</option>
                      <option value="2">2학기</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2 */}
              <div className="ob-section">
                <div className="ob-section-title">
                  <small>진로와 관심</small>
                  <strong>지금 생각하는 방향</strong>
                </div>
                <div className="form-grid-2">
                  <div className="form-field form-span-2">
                    <label htmlFor="ob-career">목표 진로 (직업 또는 분야)</label>
                    <input id="ob-career" value={form.targetCareer} onChange={(e) => update("targetCareer", e.target.value)} placeholder="예: AI 연구원, 의사, 로봇공학자" />
                  </div>
                  <div className="form-field">
                    <label htmlFor="ob-majors">관심 학과 (쉼표로 구분)</label>
                    <input id="ob-majors" value={form.targetMajors} onChange={(e) => update("targetMajors", e.target.value)} placeholder="예: 컴퓨터공학, 기계공학과" />
                  </div>
                  <div className="form-field">
                    <label htmlFor="ob-interests">관심 키워드 (쉼표로 구분)</label>
                    <textarea id="ob-interests" value={form.interests} onChange={(e) => update("interests", e.target.value)} placeholder="예: 머신러닝, 동역학, 기후변화" />
                  </div>
                </div>
              </div>

              {/* Section 3: Motivation & Resolution */}
              <div className="ob-section">
                <div className="ob-section-title">
                  <small>진로 심층 분석</small>
                  <strong>조금 더 구체적으로 알려주세요</strong>
                </div>
                <div className="form-grid-1">
                  <div className="form-field">
                    <label>이 분야에 관심을 가지게 된 계기는 무엇인가요?</label>
                    <select value={form.motivationTrigger} onChange={(e) => update("motivationTrigger", e.target.value)}>
                      <option value="">선택해주세요</option>
                      <option value="순수 학문적 호기심과 탐구욕">순수 학문적 호기심과 탐구욕</option>
                      <option value="특정 사회 문제나 불편함을 해결하고 싶어서">사회적 문제나 불편함을 해결하고 싶어서</option>
                      <option value="유망한 산업군이며 직업적 안정성이 높아서">유망한 분야이고 직업적 안정성이 좋아서</option>
                      <option value="실생활에서의 직접적인 경험을 통해">실생활에서 겪은 개인적 경험 때문에</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>현재 이 분야에 대해 어느 정도 알고 있나요?</label>
                    <select value={form.careerResolution} onChange={(e) => update("careerResolution", e.target.value)}>
                      <option value="">선택해주세요</option>
                      <option value="막연히 관심만 가지고 있는 단계">이제 막 관심을 가지기 시작한 단계</option>
                      <option value="관련 도서나 다큐멘터리 등을 찾아보며 알아가는 단계">관련 책이나 영상 등을 찾아보며 알아가는 단계</option>
                      <option value="구체적인 세부 전공과 희망 직업군을 확정한 상태">구체적인 세부 전공이나 직무까지 구상한 상태</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>현재 진행 중이거나 경험해 본 관련 활동이 있다면 적어주세요</label>
                    <textarea value={form.currentEngagement} onChange={(e) => update("currentEngagement", e.target.value)} placeholder="예: 관련 동아리 활동 중, 아두이노로 만들어 본 경험 있음, 딱히 없음 등" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="form-steps">
              {/* Section 4: Output & Collaboration */}
              <div className="ob-section">
                <div className="ob-section-title">
                  <small>작업 방식</small>
                  <strong>어떤 방식으로 결과물을 만드나요?</strong>
                </div>
                <div className="form-grid-2">
                  <div className="form-field">
                    <label>가장 선호하는 산출물 형태는?</label>
                    <select value={form.outputPreference} onChange={(e) => update("outputPreference", e.target.value)}>
                      <option value="">선택해주세요</option>
                      <option value="논문, 보고서, 에세이 등 텍스트 중심">논문 / 보고서 등 글쓰기</option>
                      <option value="코드, 프로토타입, 모형 등 실물 제작">코드 / 프로토타입 등 실물 제작</option>
                      <option value="발표자료, 인포그래픽 등 시각 자료">PPT / 인포그래픽 등 시각 자료</option>
                      <option value="발표, 토론, 발표회 등 구두 전달">발표 / 토론 등 구두 전달</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>팀 프로젝트 시 선호하는 역할은?</label>
                    <select value={form.collaborationStyle} onChange={(e) => update("collaborationStyle", e.target.value)}>
                      <option value="">선택해주세요</option>
                      <option value="팀을 이끌고 계획을 주도하는 리더">팀을 이끌고 계획을 주도하는 리더</option>
                      <option value="새로운 아이디어와 관점을 제시하는 기획자">새로운 아이디어를 제시하는 기획자</option>
                      <option value="주어진 역할을 확실하게 완수하는 팔로워">주어진 역할을 완수하는 실행자</option>
                      <option value="혼자 깊게 몰입하는 개인 연구 선호">혼자 깊게 몰입하는 개인 연구 선호</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 5: Strengths & Constraints */}
              <div className="ob-section">
                <div className="ob-section-title">
                  <small>강점과 환경</small>
                  <strong>본인의 역량과 현재 제약사항</strong>
                </div>
                <div className="form-grid-2">
                  <div className="form-field form-span-2">
                    <label htmlFor="ob-subjects">선호 과목 (쉼표로 구분)</label>
                    <input id="ob-subjects" value={form.preferredSubjects} onChange={(e) => update("preferredSubjects", e.target.value)} placeholder="예: 수학, 물리, 정보" />
                  </div>
                  <div className="form-field">
                    <label htmlFor="ob-strengths">강점 (쉼표로 구분)</label>
                    <textarea id="ob-strengths" value={form.strengths} onChange={(e) => update("strengths", e.target.value)} placeholder="예: 논리적 사고, 문제 해결력" />
                  </div>
                  <div className="form-field">
                    <label htmlFor="ob-gaps">보완하고 싶은 점 (쉼표로 구분)</label>
                    <textarea id="ob-gaps" value={form.gaps} onChange={(e) => update("gaps", e.target.value)} placeholder="예: 실험 설계, 리더십 부족" />
                  </div>
                  <div className="form-field form-span-2">
                    <label htmlFor="ob-constraints">시간·환경 등 특별한 제약조건</label>
                    <input id="ob-constraints" value={form.constraints} onChange={(e) => update("constraints", e.target.value)} placeholder="예: 동아리 시간 부족, 코딩 경험 없음" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && <div className="banner banner-error">{error}</div>}

          <div className="ob-submit-row">
            {step === 1 ? (
              <button
                className="btn btn-primary"
                disabled={!form.name || !form.grade || !form.semester || !form.targetCareer || !form.motivationTrigger || !form.careerResolution}
                onClick={() => setStep(2)}
                type="button"
              >
                다음: 성향 파악하기 →
              </button>
            ) : (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={() => setStep(1)}
                  type="button"
                >
                  ← 이전으로
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy || !canPreview}
                  onClick={createPreview}
                  type="button"
                >
                  {busy ? "로드맵 및 DNA 분석 중…" : "분석 시작하기 →"}
                </button>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Overview
   ────────────────────────────────────────────── */
function Overview({ workspace, onNavigate }: { workspace: ProductWorkspace; onNavigate: (tab: TabId) => void }) {
  const active = workspace.roadmap.nodes.find((n) => n.status === "active");
  const completed = workspace.roadmap.nodes.filter((n) => n.status === "completed").length;

  return (
    <div className="overview-page">
      {/* Mission Hero */}
      <section className="mission-hero">
        <div className="mission-content">
          <span className="kicker">NEXT MISSION</span>
          <h2>{workspace.nextMission.title}</h2>
          <p>{workspace.nextMission.whyNow}</p>
          <div className="mission-meta">
            <span className="mission-meta-chip">⏱ {workspace.nextMission.period}</span>
            <span className="mission-meta-chip">📄 {workspace.nextMission.output}</span>
          </div>
        </div>
        <button className="mission-cta" onClick={() => onNavigate("assignment")} type="button">
          수행평가와 연결하기 →
        </button>
      </section>

      {/* Metrics */}
      <div className="metrics-row">
        <div className="metric-card">
          <small>로드맵 진행</small>
          <strong>{completed} / 6</strong>
          <span>완료 노드</span>
        </div>
        <div className="metric-card">
          <small>활동 메모리</small>
          <strong>{workspace.activities.length}</strong>
          <span>구조화 기록</span>
        </div>
        <div className="metric-card">
          <small>현재 단계</small>
          <strong>{active?.narrativeStage ?? "회고"}</strong>
          <span>{active ? `${active.grade}학년 ${active.semester}학기` : "전체 완료"}</span>
        </div>
        <div className="metric-card">
          <small>정합 기록</small>
          <strong>{workspace.reconciliations.length}</strong>
          <span>계획-실행 비교</span>
        </div>
      </div>

      {/* Grid: DNA + Active Node */}
      <div className="overview-grid">
        {/* DNA Card */}
        <section className="dna-card">
          <div className="dna-card-header">
            <div>
              <span className="kicker">STUDENT DNA</span>
              <h2>사실과 AI 해석을 분리해 보여줘요</h2>
            </div>
            <span className="live-badge">LIVE</span>
          </div>
          <div className="dna-card-body">
            <p className="dna-narrative">{workspace.dna.narrative}</p>
            <div className="dna-cols">
              <div className="dna-col">
                <strong>확인된 사실</strong>
                {workspace.dna.facts.map((fact) => (
                  <div className="dna-fact" key={fact}>{fact}</div>
                ))}
              </div>
              <div className="dna-col">
                <strong>AI 해석</strong>
                {workspace.dna.interpretations.map((item) => (
                  <div className="dna-interp" key={item.statement}>
                    {item.statement}
                    <small>{item.confidence}% · 미확인</small>
                  </div>
                ))}
              </div>
            </div>
            {workspace.dna.riskFlags.length > 0 && (
              <div className="dna-risks">
                {workspace.dna.riskFlags.map((flag) => <span key={flag}>⚠ {flag}</span>)}
              </div>
            )}
          </div>
        </section>

        {/* Active Node Card */}
        <section className="active-node-card">
          <div className="active-node-header">
            <div>
              <span className="kicker">ACTIVE ROADMAP NODE</span>
              <h2>{active?.title ?? "로드맵 회고"}</h2>
            </div>
            {active && <StatusBadge status={active.status} />}
          </div>
          <div className="active-node-body">
            <p className="active-node-objective">
              {active?.objective ?? "모든 노드를 검토했습니다. 새로운 진로 방향이 있다면 로드맵을 다시 설계해보세요."}
            </p>
            {active && (
              <div className="subject-chips">
                {active.candidateSubjects.map((s) => (
                  <span className="subject-chip-pill" key={s}>{s}</span>
                ))}
              </div>
            )}
            <button className="btn btn-ghost" onClick={() => onNavigate("roadmap")} type="button">
              전체 로드맵 보기 →
            </button>
          </div>
        </section>
      </div>

      {/* Recent Activities */}
      <section className="recent-card">
        <div className="recent-card-header">
          <div>
            <span className="kicker">RECENT ACTIVITY</span>
            <h2>최근 활동과 정합 결과</h2>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate("activities")} type="button">
            활동 추가
          </button>
        </div>
        {workspace.activities.length ? (
          workspace.activities.slice(0, 3).map((activity) => (
            <div className="activity-compact" key={activity.id}>
              <span className="activity-subj-pill">{activity.subject}</span>
              <div className="activity-compact-info">
                <strong>{activity.title}</strong>
                <small>{activity.completedAt}</small>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <strong>아직 활동이 없습니다</strong>
            <p>첫 활동을 추가하면 DNA와 로드맵 정합이 갱신됩니다.</p>
          </div>
        )}
      </section>
    </div>
  );
}

/* ──────────────────────────────────────────────
   RoadmapView
   ────────────────────────────────────────────── */
function RoadmapView({ workspace, onWorkspace }: { workspace: ProductWorkspace; onWorkspace: (workspace: ProductWorkspace) => void }) {
  const [editing, setEditing] = useState<RoadmapNode | null>(null);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<RoadmapViewMode>("all");
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [recordFile, setRecordFile] = useState("");
  const [recordParse, setRecordParse] = useState<SchoolRecordParseResult | null>(null);
  const [recordBusy, setRecordBusy] = useState(false);
  const [recordMessage, setRecordMessage] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  const focusedNode = workspace.roadmap.nodes.find((n) => n.id === focusedNodeId) ?? null;
  const currentNode = workspace.roadmap.nodes.find(
    (n) => n.grade === workspace.profile.grade && n.semester === workspace.profile.semester,
  );
  const academicStartYear = new Date().getFullYear() - (workspace.profile.grade - 1);
  const academicMonths = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
  const allSubjects = [...new Set([
    ...workspace.roadmap.nodes.flatMap((n) => n.candidateSubjects),
    ...workspace.activities.map((a) => a.subject),
    ...workspace.schoolRecordCourses.map((c) => c.subject),
  ])];

  function activitiesForNode(node: RoadmapNode) {
    return workspace.activities.filter(
      (a) => a.roadmapNodeId === node.id || (!a.roadmapNodeId && node.id === currentNode?.id),
    );
  }

  function eventsForNode(node: RoadmapNode): RoadmapTimelineEvent[] {
    const actualEvents = activitiesForNode(node).map((a) => ({
      id: a.id, date: a.completedAt,
      category: activityCategory(a.activityType),
      subject: a.subject, title: a.title, isPlan: false,
    }));
    const planYear = academicStartYear + node.grade - 1;
    const plannedEvents = roadmapPhase(workspace, node) === "past" ? [] :
      (node.planEvents ?? []).map((ev) => ({
        id: ev.id, date: `${planYear}-${ev.monthDay}`,
        category: ev.category, subject: ev.subject, title: ev.title, isPlan: true,
      }));
    const remaining = plannedEvents.filter((plan) => !actualEvents.some((actual) => {
      const dist = Math.abs(new Date(actual.date).getTime() - new Date(plan.date).getTime()) / 86_400_000;
      return actual.category === plan.category && dist <= 21;
    }));
    return [...actualEvents, ...remaining].sort((a, b) => a.date.localeCompare(b.date));
  }

  function visibleEvents(node: RoadmapNode) {
    return eventsForNode(node).filter((ev) =>
      viewMode === "all" || (viewMode === "records" ? !ev.isPlan : ev.isPlan),
    );
  }

  const focusedEvents = focusedNode ? eventsForNode(focusedNode) : [];
  const focusedMonths = focusedNode?.semester === 1 ? academicMonths.slice(0, 6) : academicMonths.slice(6);
  const focusedImportedSubjects = focusedNode
    ? [...new Set(workspace.schoolRecordCourses
        .filter((c) => c.grade === focusedNode.grade && c.semester === focusedNode.semester)
        .map((c) => c.subject))]
    : [];

  async function analyzeRecordFile(file: File | undefined) {
    if (!file) return;
    if (file.size > SCHOOL_RECORD_MAX_FILE_SIZE) {
      setError(`파일이 너무 큽니다. ${SCHOOL_RECORD_MAX_FILE_SIZE_LABEL} 이하의 PDF를 선택해주세요.`);
      if (uploadRef.current) uploadRef.current.value = "";
      return;
    }
    setRecordBusy(true); setRecordFile(file.name); setRecordMessage(""); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("academicStartYear", String(academicStartYear));
      const result = await jsonRequest<{ result: SchoolRecordParseResult }>("/api/school-record/parse", { method: "POST", body: form });
      setRecordParse(result.result);
    } catch (e) { setError(e instanceof Error ? e.message : "생기부를 분석하지 못했습니다."); setRecordFile(""); }
    finally { setRecordBusy(false); if (uploadRef.current) uploadRef.current.value = ""; }
  }

  function updateRecordEntry(id: string, patch: Partial<SchoolRecordDraft>) {
    setRecordParse((cur) => cur ? {
      ...cur, entries: cur.entries.map((e) => e.id === id ? { ...e, ...patch } : e),
    } : cur);
  }

  async function confirmRecordImport() {
    if (!recordParse) return;
    setRecordBusy(true); setError("");
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace; importedCount: number }>("/api/school-record/import", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId: workspace.profile.id, fileName: recordParse.fileName, totalPages: recordParse.totalPages, courses: recordParse.courses, entries: recordParse.entries }),
      });
      onWorkspace(result.workspace);
      setRecordMessage(`${recordParse.courses.length}개 과목과 ${result.importedCount}개 활동을 로드맵에 반영했습니다.`);
      setRecordParse(null);
    } catch (e) { setError(e instanceof Error ? e.message : "생기부 기록을 반영하지 못했습니다."); }
    finally { setRecordBusy(false); }
  }

  async function saveNode() {
    if (!editing) return;
    setBusy(true);
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace }>("/api/roadmaps/nodes", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId: workspace.profile.id, nodeId: editing.id, title: editing.title, objective: editing.objective }),
      });
      onWorkspace(result.workspace); setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : "노드를 수정하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function regenerate() {
    setBusy(true); setError("");
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace }>("/api/roadmaps/regenerate", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ studentId: workspace.profile.id }),
      });
      onWorkspace(result.workspace);
    } catch (e) { setError(e instanceof Error ? e.message : "로드맵을 다시 만들지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function recordMiss(decision: "carry" | "skip") {
    setBusy(true); setError("");
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace }>("/api/roadmaps/checkpoint", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ studentId: workspace.profile.id, decision }),
      });
      onWorkspace(result.workspace); setCheckpointOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "학기 점검을 기록하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return (
    <div className="roadmap-page">
      {/* Header */}
      <div className="roadmap-header">
        <div>
          <span className="kicker">3-YEAR SCHOOL RECORD</span>
          <h1>{workspace.profile.name}의 고교 3개년</h1>
          <p>지나온 학기는 생활기록부의 사실로, 앞으로의 학기는 로드맵 제안으로 이어서 봅니다.</p>
        </div>
        <div className={`record-import-card${recordFile ? " is-connected" : ""}`}>
          <input
            accept=".pdf,application/pdf"
            aria-label="생활기록부 파일 선택"
            hidden
            onChange={(e) => analyzeRecordFile(e.target.files?.[0])}
            ref={uploadRef}
            type="file"
          />
          <span className={`record-dot ${recordBusy ? "record-dot-busy" : recordFile ? "record-dot-connected" : "record-dot-idle"}`} />
          <div className="record-import-info">
            <strong>{recordBusy ? "생기부 분석 중" : recordFile ? "생기부 연결됨" : "생기부 미연결"}</strong>
            <small>{recordFile || "텍스트형 PDF에서 과목과 활동을 추출해요"}</small>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            disabled={recordBusy}
            onClick={() => uploadRef.current?.click()}
            type="button"
          >
            {recordBusy ? "분석 중…" : recordFile ? "다른 PDF" : "생기부 PDF 분석"}
          </button>
        </div>
      </div>

      {recordMessage && <div className="banner banner-success">✓ {recordMessage} 원본 PDF는 저장하지 않았습니다.</div>}
      {error && !editing && !checkpointOpen && <div className="banner banner-error">{error}</div>}

      {/* Toolbar */}
      <div className="timeline-toolbar">
        <div className="category-legend">
          {ROADMAP_CATEGORIES.map((item) => (
            <span className="legend-item" key={item.category}>
              <i>{item.icon}</i>{item.category}
            </span>
          ))}
        </div>
        <div className="view-toggle">
          {(["all", "records", "plan"] as RoadmapViewMode[]).map((mode) => (
            <button
              className={`toggle-btn${viewMode === mode ? " active" : ""}`}
              key={mode}
              onClick={() => setViewMode(mode)}
              type="button"
            >
              {mode === "all" ? "전체" : mode === "records" ? "기록만" : "계획만"}
            </button>
          ))}
        </div>
      </div>

      {/* Subject legend */}
      <div className="subject-legend">
        <small>SUBJECT COLOR</small>
        {allSubjects.map((s) => (
          <span className="subj-chip" key={s}>
            <i style={{ background: subjectColor(s) }} />{s}
          </span>
        ))}
      </div>

      {/* Timeline */}
      <div className="timeline-section">
        {[1, 2, 3].map((grade) => {
          const gradeNodes = workspace.roadmap.nodes.filter((n) => n.grade === grade);
          const year = academicStartYear + grade - 1;
          const yearEvents = gradeNodes.flatMap((n) => visibleEvents(n));
          return (
            <div className={`year-row${grade === workspace.profile.grade ? " is-current" : ""}`} key={grade}>
              <div className="year-label">
                <span className="year-num">{grade}</span>
                <span className="year-txt">학년</span>
                <span className="year-range">{year}.03—{year + 1}.02</span>
              </div>
              <div className="year-track">
                <div className="track-bg-grid" />
                <div className="sem-label-bar">
                  <span>1학기</span>
                  <span>2학기</span>
                </div>
                <div className="track-center-line" />
                <div className="sem-divider" />
                {grade === workspace.profile.grade && (
                  <div className="today-marker" style={{ left: `${academicTimelinePosition(new Date().toISOString().slice(0, 10))}%` }}>
                    <span className="today-label">오늘</span>
                    <span className="today-dot" />
                  </div>
                )}
                {gradeNodes.map((node) => (
                  <button
                    aria-label={`${grade}학년 ${node.semester}학기 확대`}
                    className={`semester-hitbox s${node.semester} phase-${roadmapPhase(workspace, node)}`}
                    key={node.id}
                    onClick={() => setFocusedNodeId(node.id)}
                    type="button"
                  >
                    <span className="sem-label-pill">{node.narrativeStage} · 자세히 보기</span>
                  </button>
                ))}
                {timelineClusters(yearEvents).map((cluster) => {
                  const firstEvent = cluster.events[0];
                  const cat = ROADMAP_CATEGORIES.find((c) => c.category === firstEvent.category);
                  return (
                    <div
                      aria-label={`${cluster.events.length}개 활동`}
                      className={`event-cluster ${cluster.events.length > 1 ? "is-multi" : "is-solo"} ${firstEvent.isPlan ? "is-plan" : "is-record"}`}
                      key={cluster.id}
                      style={{ left: `${cluster.position}%`, "--subj": subjectColor(firstEvent.subject) } as CSSProperties}
                      tabIndex={0}
                    >
                      <div className="event-popup">
                        {cluster.events.map((ev) => {
                          const evCat = ROADMAP_CATEGORIES.find((c) => c.category === ev.category);
                          return (
                            <div
                              className={`popup-event${ev.isPlan ? " is-plan" : ""}`}
                              key={ev.id}
                            >
                              <span className="popup-icon" style={{ color: subjectColor(ev.subject) }}>{evCat?.icon}</span>
                              <div>
                                <strong>{ev.title}</strong>
                                <small>{ev.subject} · {ev.date.slice(5).replace("-", ".")}</small>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="event-stem" style={firstEvent.isPlan ? {} : { background: subjectColor(firstEvent.subject) }} />
                      <div className="event-marker" style={{ "--subj": subjectColor(firstEvent.subject) } as CSSProperties}>
                        {cluster.events.length > 1 ? <b>{cluster.events.length}</b> : cat?.icon}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="timeline-footer">
          <span><i className="dot-record" /> 생활기록부 기록</span>
          <span><i className="dot-plan" /> 앞으로의 계획</span>
          <span>학기를 클릭하면 상세 보기가 열립니다</span>
        </div>
      </div>

      {/* Semester focus modal */}
      {focusedNode && (
        <div className="focus-backdrop" onClick={() => setFocusedNodeId(null)} role="presentation">
          <section
            aria-label={`${focusedNode.grade}학년 ${focusedNode.semester}학기 상세`}
            aria-modal="true"
            className="focus-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="focus-header">
              <div>
                <span className="kicker">SEMESTER FOCUS</span>
                <h2>{focusedNode.grade}학년 {focusedNode.semester}학기</h2>
                <p>{focusedNode.narrativeStage} · {focusedNode.title}</p>
              </div>
              <button aria-label="닫기" className="focus-close" onClick={() => setFocusedNodeId(null)} type="button">×</button>
            </div>

            <div className="focus-subjects">
              <small>이 학기의 과목</small>
              {(focusedImportedSubjects.length ? focusedImportedSubjects : focusedNode.candidateSubjects).map((s) => (
                <span className="focus-subj-pill" key={s}>
                  <i style={{ background: subjectColor(s) }} />{s}
                </span>
              ))}
            </div>

            <div className="focus-months">
              {focusedMonths.map((month) => {
                const monthEvents = focusedEvents.filter((ev) => Number(ev.date.split("-")[1]) === month);
                return (
                  <div className="focus-month" key={month}>
                    <div className="focus-month-head"><strong>{month}월</strong></div>
                    <div className="focus-month-body">
                      {monthEvents.map((ev) => {
                        const cat = ROADMAP_CATEGORIES.find((c) => c.category === ev.category);
                        return (
                          <div className="focus-event" key={ev.id} style={{ "--subj": subjectColor(ev.subject) } as CSSProperties}>
                            <span className="focus-ev-icon">{cat?.icon}</span>
                            <small>{ev.date.slice(8)}일 · {ev.category}</small>
                            <strong>{ev.title}</strong>
                            <em>{ev.subject} · {ev.isPlan ? "계획" : "기록"}</em>
                          </div>
                        );
                      })}
                      {!monthEvents.length && <span className="focus-month-empty">활동 없음</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="focus-footer">
              <div className="focus-footer-info">
                <span className="kicker">학기 목표</span>
                <p>{focusedNode.objective}</p>
                <div className="focus-goal-chips">
                  {focusedNode.competencyGoals.map((goal) => <span key={goal}>{goal}</span>)}
                </div>
              </div>
              <div className="focus-footer-actions">
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setEditing({ ...focusedNode })} type="button">학기 내용 수정</button>
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setCheckpointOpen(true)} type="button">학기 점검</button>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={regenerate} type="button">새 버전 생성</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* School record review modal */}
      {recordParse && (
        <div className="record-review-overlay" role="presentation">
          <section aria-label="생활기록부 분석 결과" aria-modal="true" className="record-review-panel" role="dialog">
            <div className="record-review-head">
              <div>
                <span className="kicker">SCHOOL RECORD REVIEW</span>
                <h2>분석 결과를 확인해주세요</h2>
                <p>{recordParse.fileName} · {recordParse.totalPages}쪽 · 텍스트 {recordParse.extractedCharacters.toLocaleString()}자</p>
              </div>
              <button aria-label="닫기" className="focus-close" onClick={() => setRecordParse(null)} type="button">×</button>
            </div>
            <div className="record-review-body">
              <div className="rr-privacy-note">
                <strong>원본 파일은 저장하지 않습니다.</strong>
                <span>아래에서 선택한 과목과 활동만 학생 기록에 반영됩니다.</span>
              </div>
              {recordParse.warnings.map((w) => <div className="rr-warning" key={w}>! {w}</div>)}
              <div className="parsed-section">
                <div className="parsed-section-title">
                  <strong>인식한 과목</strong>
                  <span>{recordParse.courses.length}개</span>
                </div>
                <div className="parsed-courses">
                  {recordParse.courses.map((course) => (
                    <span className="parsed-course-pill" key={course.id}>
                      <i style={{ background: subjectColor(course.subject), borderRadius: "3px", height: "8px", width: "14px", display: "inline-block", marginRight: "5px" }} />
                      {course.grade}학년 {course.semester}학기 · {course.subject}
                    </span>
                  ))}
                </div>
              </div>
              <div className="parsed-section">
                <div className="parsed-section-title">
                  <strong>로드맵에 표시할 활동</strong>
                  <span>{recordParse.entries.filter((e) => e.selected).length}개 선택</span>
                </div>
                <div className="parsed-entries">
                  {recordParse.entries.map((entry) => (
                    <div className={`entry-card${entry.selected ? " is-selected" : ""}`} key={entry.id}>
                      <div className="entry-card-top">
                        <div className="entry-toggle">
                          <input
                            checked={entry.selected}
                            onChange={(e) => updateRecordEntry(entry.id, { selected: e.target.checked })}
                            type="checkbox"
                          />
                          <span>{entry.selected ? "반영" : "제외"}</span>
                        </div>
                        <div className="entry-period">
                          <select aria-label="학년" value={entry.grade} onChange={(e) => updateRecordEntry(entry.id, { grade: Number(e.target.value) })}>
                            <option value={1}>1학년</option><option value={2}>2학년</option><option value={3}>3학년</option>
                          </select>
                          <select aria-label="학기" value={entry.semester} onChange={(e) => updateRecordEntry(entry.id, { semester: Number(e.target.value) })}>
                            <option value={1}>1학기</option><option value={2}>2학기</option>
                          </select>
                          <select aria-label="카테고리" value={entry.category} onChange={(e) => updateRecordEntry(entry.id, { category: e.target.value as SchoolRecordDraft["category"] })}>
                            {ROADMAP_CATEGORIES.map((c) => <option key={c.category}>{c.category}</option>)}
                          </select>
                          <input aria-label="날짜" type="date" value={entry.completedAt} onChange={(e) => updateRecordEntry(entry.id, { completedAt: e.target.value, dateBasis: "document" })} />
                        </div>
                      </div>
                      <div className="entry-fields">
                        <input aria-label="연계 과목" value={entry.subject} onChange={(e) => updateRecordEntry(entry.id, { subject: e.target.value })} />
                        <input aria-label="활동 제목" value={entry.title} onChange={(e) => updateRecordEntry(entry.id, { title: e.target.value })} />
                      </div>
                      <div className="entry-card-foot">
                        <span className={entry.dateBasis === "document" ? "" : "date-inferred"}>
                          {entry.dateBasis === "document" ? "문서 날짜" : "임시 날짜 · 수정 권장"}
                        </span>
                        <span>신뢰도 {entry.confidence}%</span>
                      </div>
                    </div>
                  ))}
                  {!recordParse.entries.length && (
                    <div className="empty-state">
                      <strong>자동으로 찾은 활동이 없습니다</strong>
                      <p>스캔 이미지형 PDF는 다음 단계에서 OCR 지원이 필요합니다.</p>
                    </div>
                  )}
                </div>
              </div>
              {error && <div className="banner banner-error">{error}</div>}
            </div>
            <div className="record-review-foot">
              <button className="btn btn-secondary" disabled={recordBusy} onClick={() => setRecordParse(null)} type="button">취소</button>
              <button
                className="btn btn-primary"
                disabled={recordBusy || (!recordParse.courses.length && !recordParse.entries.some((e) => e.selected))}
                onClick={confirmRecordImport}
                type="button"
              >
                {recordBusy ? "반영 중…" : "확인한 내용 로드맵에 반영"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Edit node modal */}
      {editing && (
        <div className="modal-overlay">
          <div className="modal-panel">
            <div className="modal-head">
              <div>
                <span className="kicker">ROADMAP NODE</span>
                <h2>{editing.grade}학년 {editing.semester}학기 수정</h2>
              </div>
              <button className="focus-close" onClick={() => setEditing(null)} type="button">×</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label htmlFor="edit-title">노드 제목</label>
                <input id="edit-title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="edit-objective">목표</label>
                <textarea id="edit-objective" value={editing.objective} onChange={(e) => setEditing({ ...editing, objective: e.target.value })} />
              </div>
              {error && <div className="banner banner-error">{error}</div>}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setEditing(null)} type="button">취소</button>
              <button className="btn btn-primary" disabled={busy} onClick={saveNode} type="button">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* Checkpoint modal */}
      {checkpointOpen && (
        <div className="modal-overlay">
          <div className="modal-panel">
            <div className="modal-head">
              <div>
                <span className="kicker">SEMESTER CHECKPOINT</span>
                <h2>현재 노드를 완료하지 못했나요?</h2>
              </div>
              <button className="focus-close" onClick={() => setCheckpointOpen(false)} type="button">×</button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--muted)", fontSize: "13px", lineHeight: "1.65" }}>
                MISS는 새 활동의 성격이 아니라 예정 시점까지 완료 활동이 없는 상태입니다. 자동으로 실패 처리하지 않고 학생이 이월 또는 건너뛰기를 결정합니다.
              </p>
              {error && <div className="banner banner-error">{error}</div>}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" disabled={busy} onClick={() => recordMiss("carry")} type="button">다음 학기로 이월</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => recordMiss("skip")} type="button">건너뛰고 다음 노드</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   AssignmentView
   ────────────────────────────────────────────── */
function AssignmentView({ workspace, onWorkspace, onStartActivity }: {
  workspace: ProductWorkspace;
  onWorkspace: (workspace: ProductWorkspace) => void;
  onStartActivity: (title: string, summary: string) => void;
}) {
  const [task, setTask] = useState(workspace.latestAnalysis?.task ?? "");
  const [analysis, setAnalysis] = useState<AssignmentAnalysis | null>(workspace.latestAnalysis ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<Record<string, "saved" | "rejected">>({});

  async function runAnalysis() {
    setBusy(true); setError("");
    try {
      const result = await jsonRequest<{ analysis: AssignmentAnalysis }>("/api/assignment-analysis", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId: workspace.profile.id, task }),
      });
      setAnalysis(result.analysis);
      onWorkspace({ ...workspace, latestAnalysis: result.analysis });
    } catch (e) { setError(e instanceof Error ? e.message : "분석하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function recordFeedback(recommendationId: string, action: "saved" | "rejected") {
    if (!analysis) return;
    setFeedback((cur) => ({ ...cur, [recommendationId]: action }));
    try {
      await jsonRequest<{ ok: true }>("/api/recommendation-feedback", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId: workspace.profile.id, analysisId: analysis.id, recommendationId, action }),
      });
    } catch (e) { setError(e instanceof Error ? e.message : "피드백을 저장하지 못했습니다."); }
  }

  const isLive = analysis?.provider === "deepseek";

  return (
    <div className="assignment-page">
      {/* Header */}
      <div className="assignment-header">
        <div>
          <span className="kicker">EXECUTION LOOP</span>
          <h1>수행평가 분석과 후속 탐구</h1>
          <p>안내문의 조건을 분리하고 학생 기억, 활성 로드맵 노드, 보완 역량을 함께 사용합니다.</p>
        </div>
        <span className={`provider-badge${isLive ? " is-live" : ""}`}>
          {isLive ? "● DEEPSEEK LIVE" : "DEEPSEEK FALLBACK"}
        </span>
      </div>

      {/* Input */}
      <div className="assignment-input-card">
        <span className="input-label">수행평가 안내문</span>
        <textarea
          className="assignment-textarea"
          id="assignment-task"
          placeholder="수행평가 안내문 전체 또는 핵심 조건을 붙여넣어 주세요."
          value={task}
          onChange={(e) => setTask(e.target.value)}
        />
        <div className="assignment-actions">
          <p>원문 전체 대신 조건과 현재 맥락으로 구조화합니다.</p>
          <button className="btn btn-primary" disabled={busy || !task.trim()} onClick={runAnalysis} type="button">
            {busy ? "분석 중…" : "조건 분석 · 추천 생성"}
          </button>
        </div>
        {error && <div className="banner banner-error" style={{ marginTop: "10px" }}>{error}</div>}
      </div>

      {analysis ? (
        <>
          {/* Parsed conditions */}
          <div className="conditions-card">
            <div className="cond-col detected">
              <small>PARSED CONDITIONS</small>
              <div className="cond-list">
                {analysis.parsedConditions.map((item) => (
                  <div className="cond-chip is-detected" key={item}>✓ {item}</div>
                ))}
              </div>
            </div>
            <div className="cond-col missing">
              <small>MISSING INFORMATION</small>
              <div className="cond-list">
                {analysis.missingInformation.length
                  ? analysis.missingInformation.map((item) => <div className="cond-chip is-missing" key={item}>? {item}</div>)
                  : <div className="cond-chip is-detected">누락 조건 없음</div>
                }
              </div>
            </div>
            {analysis.activeRoadmapConnection && (
              <p className="analysis-note">{analysis.activeRoadmapConnection}</p>
            )}
          </div>

          {/* Recommendations */}
          <div className="recs-grid">
            {analysis.recommendations.map((rec, i) => (
              <div className="rec-card" key={rec.id}>
                <div className="rec-body">
                  <span className="rec-num">0{i + 1}</span>
                  {rec.roadmapConnection && <span className="rec-conn">{rec.roadmapConnection}</span>}
                  <h3 className="rec-title">{rec.title}</h3>
                  <div className="rec-reason">{rec.reason}</div>
                  <dl className="rec-meta">
                    <div className="rec-meta-row"><dt>방법</dt><dd>{rec.method}</dd></div>
                    <div className="rec-meta-row"><dt>산출물</dt><dd>{rec.expectedOutput}</dd></div>
                  </dl>
                </div>
                <div className="rec-footer">
                  <span className="rec-diff">{rec.difficulty}</span>
                  <div className="rec-actions">
                    <button
                      className={`rec-btn rec-btn-save${feedback[rec.id] === "saved" ? " is-saved" : ""}`}
                      onClick={() => recordFeedback(rec.id, "saved")}
                      type="button"
                    >
                      {feedback[rec.id] === "saved" ? "저장됨 ✓" : "저장"}
                    </button>
                    <button
                      className={`rec-btn rec-btn-reject${feedback[rec.id] === "rejected" ? " is-rejected" : ""}`}
                      onClick={() => recordFeedback(rec.id, "rejected")}
                      type="button"
                    >
                      {feedback[rec.id] === "rejected" ? "반영됨" : "관심 없음"}
                    </button>
                    <button className="rec-btn rec-btn-start" onClick={() => onStartActivity(rec.title, rec.method)} type="button">
                      시작 →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Reviewer checklist */}
          <div className="reviewer-card">
            <small>REVIEWER CHECKLIST</small>
            <div className="reviewer-items">
              {analysis.checklist.map((item) => (
                <span className="reviewer-item" key={item}>✓ {item}</span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <strong>안내문을 분석하면 조건·로드맵 연결·추천이 여기에 표시됩니다</strong>
          <p>추천은 최종 결과가 아니라 학생이 선택하고 수정할 후보입니다.</p>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   ActivitiesView
   ────────────────────────────────────────────── */
function ActivitiesView({ workspace, onWorkspace, draft, clearDraft }: {
  workspace: ProductWorkspace;
  onWorkspace: (workspace: ProductWorkspace) => void;
  draft: { title: string; summary: string } | null;
  clearDraft: () => void;
}) {
  const [form, setForm] = useState({
    activityType: "보고서(세특용)",
    subject: workspace.profile.preferredSubjects[0] ?? "통합과학",
    title: draft?.title ?? "",
    summary: draft?.summary ?? "",
    concepts: workspace.profile.interests.join(", "),
    outputs: "탐구 보고서",
    completedAt: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastLog, setLastLog] = useState<ReconciliationLog | null>(null);

  async function submit() {
    setBusy(true); setError("");
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace; reconciliation: ReconciliationLog }>("/api/activities", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId: workspace.profile.id,
          activity: { ...form, concepts: splitList(form.concepts), outputs: splitList(form.outputs) },
        }),
      });
      onWorkspace(result.workspace);
      setLastLog(result.reconciliation);
      clearDraft();
      setForm((cur) => ({ ...cur, title: "", summary: "" }));
    } catch (e) { setError(e instanceof Error ? e.message : "활동을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return (
    <div className="activities-page">
      {/* Header */}
      <div className="activities-header">
        <span className="kicker">EXECUTION → RECONCILIATION</span>
        <h1>활동 기록과 로드맵 정합</h1>
        <p>완료한 활동을 사건 메모리로 저장하고 현재 로드맵 노드와의 관계를 판정합니다.</p>
      </div>

      {/* Form */}
      <div className="activity-form-card">
        <h2>활동 추가</h2>
        <div className="form-grid-3" style={{ marginBottom: "14px" }}>
          <div className="form-field">
            <label htmlFor="act-type">활동 유형</label>
            <select id="act-type" value={form.activityType} onChange={(e) => setForm({ ...form, activityType: e.target.value })}>
              <option>상장</option>
              <option>대회</option>
              <option>수행평가</option>
              <option>보고서(세특용)</option>
              <option>독서</option>
              <option>시험</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="act-subject">과목</label>
            <input id="act-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <div className="form-field">
            <label htmlFor="act-date">완료일</label>
            <input id="act-date" type="date" value={form.completedAt} onChange={(e) => setForm({ ...form, completedAt: e.target.value })} />
          </div>
        </div>
        <div className="form-field" style={{ marginBottom: "14px" }}>
          <label htmlFor="act-title">활동 제목</label>
          <input id="act-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="활동의 핵심을 한 문장으로" />
        </div>
        <div className="form-field" style={{ marginBottom: "14px" }}>
          <label htmlFor="act-summary">무엇을 어떻게 했나요?</label>
          <textarea id="act-summary" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="탐구 과정, 발견한 내용, 적용한 방법을 간략히 적어주세요" />
        </div>
        <div className="form-grid-2" style={{ marginBottom: "18px" }}>
          <div className="form-field">
            <label htmlFor="act-concepts">핵심 개념 (쉼표로 구분)</label>
            <input id="act-concepts" value={form.concepts} onChange={(e) => setForm({ ...form, concepts: e.target.value })} />
          </div>
          <div className="form-field">
            <label htmlFor="act-outputs">산출물 (쉼표로 구분)</label>
            <input id="act-outputs" value={form.outputs} onChange={(e) => setForm({ ...form, outputs: e.target.value })} />
          </div>
        </div>
        {error && <div className="banner banner-error" style={{ marginBottom: "14px" }}>{error}</div>}
        <button
          className="btn btn-primary"
          disabled={busy || !form.title.trim() || !form.summary.trim()}
          onClick={submit}
          type="button"
        >
          {busy ? "저장·정합 중…" : "활동 저장하고 로드맵과 비교"}
        </button>
      </div>

      {/* Reconciliation result */}
      {lastLog && (
        <div className={`recon-banner ${lastLog.matchType.toLowerCase()}`}>
          <div className="recon-banner-head">
            <span className="recon-type">{lastLog.matchType}</span>
            <span className="recon-conf">신뢰도 {lastLog.confidence}%</span>
          </div>
          <div className="recon-body">
            <p className="recon-rationale">{lastLog.rationale}</p>
            <p className="recon-action">{lastLog.action}</p>
          </div>
        </div>
      )}

      {/* History */}
      <div className="history-cols">
        <div className="history-card">
          <div className="history-card-head">
            <span className="kicker">ACTIVITY MEMORY</span>
            <h2>활동 타임라인</h2>
          </div>
          {workspace.activities.length ? (
            <div className="history-list">
              {workspace.activities.map((activity) => (
                <div className="history-item" key={activity.id}>
                  <time className="history-time">{activity.completedAt}</time>
                  <div className="history-info">
                    <span className="type-pill">{activity.activityType} · {activity.subject}</span>
                    <h3>{activity.title}</h3>
                    <p>{activity.summary}</p>
                    <div className="concept-tags">
                      {activity.concepts.map((c) => <span className="concept-tag" key={c}>{c}</span>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>등록된 활동이 없습니다</strong>
            </div>
          )}
        </div>

        <div className="history-card">
          <div className="history-card-head">
            <span className="kicker">RECONCILIATION LOG</span>
            <h2>정합 판정 이력</h2>
          </div>
          {workspace.reconciliations.length ? (
            <div className="history-list">
              {workspace.reconciliations.map((log) => (
                <div className="recon-log-item" key={log.id}>
                  <div className="recon-log-top">
                    <span className={`recon-log-type ${log.matchType.toLowerCase()}`}>{log.matchType}</span>
                    <span className="recon-log-conf">{log.confidence}%</span>
                  </div>
                  <p className="recon-log-rationale">{log.rationale}</p>
                  <p className="recon-log-action">{log.action}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>첫 활동을 저장하면 판정 근거와 조치가 기록됩니다</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   ProfileView
   ────────────────────────────────────────────── */
function ProfileView({ workspace, onWorkspace }: { workspace: ProductWorkspace; onWorkspace: (workspace: ProductWorkspace) => void }) {
  const [form, setForm] = useState<ProfileForm>({
    name: workspace.profile.name,
    grade: String(workspace.profile.grade),
    semester: String(workspace.profile.semester),
    targetCareer: workspace.profile.targetCareer,
    targetMajors: workspace.profile.targetMajors.join(", "),
    interests: workspace.profile.interests.join(", "),
    motivationTrigger: workspace.profile.motivationTrigger,
    careerResolution: workspace.profile.careerResolution,
    currentEngagement: workspace.profile.currentEngagement.join(", "),
    preferredSubjects: workspace.profile.preferredSubjects.join(", "),
    strengths: workspace.profile.strengths.join(", "),
    gaps: workspace.profile.gaps.join(", "),
    constraints: workspace.profile.constraints.join(", "),
    outputPreference: workspace.profile.outputPreference,
    collaborationStyle: workspace.profile.collaborationStyle,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((cur) => ({ ...cur, [key]: value }));
  }

  async function save(regenerate: boolean) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await jsonRequest<{ workspace: ProductWorkspace }>("/api/profile", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId: workspace.profile.id, profile: toProfileInput(form) }),
      });
      let nextWorkspace = result.workspace;
      if (regenerate) {
        const regen = await jsonRequest<{ workspace: ProductWorkspace }>("/api/roadmaps/regenerate", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ studentId: workspace.profile.id }),
        });
        nextWorkspace = regen.workspace;
      }
      onWorkspace(nextWorkspace);
      setMessage(regenerate ? "프로필을 저장하고 로드맵 새 버전을 만들었습니다." : "프로필과 Student DNA를 갱신했습니다.");
    } catch (e) { setError(e instanceof Error ? e.message : "프로필을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return (
    <div className="profile-page">
      <div className="profile-header">
        <span className="kicker">MEMORY UPDATE</span>
        <h1>학생 프로필과 진로 변화</h1>
        <p>학생이 직접 입력한 정보가 AI 추론보다 우선합니다. 진로가 바뀌면 기존 로드맵을 덮어쓰지 않고 새 버전으로 만들 수 있어요.</p>
      </div>

      <div className="profile-form-card">
        <div className="form-grid-3" style={{ marginBottom: "20px" }}>
          <div className="form-field">
            <label htmlFor="pf-name">이름</label>
            <input id="pf-name" value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-grade">학년</label>
            <select id="pf-grade" value={form.grade} onChange={(e) => update("grade", e.target.value)}>
              <option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="pf-semester">학기</label>
            <select id="pf-semester" value={form.semester} onChange={(e) => update("semester", e.target.value)}>
              <option value="1">1학기</option><option value="2">2학기</option>
            </select>
          </div>
        </div>
        <div className="form-grid-2">
          <div className="form-field form-span-2">
            <label htmlFor="pf-career">희망 진로</label>
            <input id="pf-career" value={form.targetCareer} onChange={(e) => update("targetCareer", e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-majors">관심 학과</label>
            <input id="pf-majors" value={form.targetMajors} onChange={(e) => update("targetMajors", e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-interests">관심 키워드</label>
            <textarea id="pf-interests" value={form.interests} onChange={(e) => update("interests", e.target.value)} />
          </div>

          <div className="form-field">
            <label htmlFor="pf-motivation">진로 관심 계기</label>
            <select id="pf-motivation" value={form.motivationTrigger} onChange={(e) => update("motivationTrigger", e.target.value)}>
              <option value="">선택해주세요</option>
              <option value="순수 학문적 호기심과 탐구욕">순수 학문적 호기심과 탐구욕</option>
              <option value="특정 사회 문제나 불편함을 해결하고 싶어서">사회적 문제 해결</option>
              <option value="유망한 산업군이며 직업적 안정성이 높아서">직업적 안정성 / 유망함</option>
              <option value="실생활에서의 직접적인 경험을 통해">실생활에서의 경험</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="pf-resolution">진로 해상도</label>
            <select id="pf-resolution" value={form.careerResolution} onChange={(e) => update("careerResolution", e.target.value)}>
              <option value="">선택해주세요</option>
              <option value="막연히 관심만 가지고 있는 단계">이제 막 관심 생긴 단계</option>
              <option value="관련 도서나 다큐멘터리 등을 찾아보며 알아가는 단계">조금씩 알아가는 단계</option>
              <option value="구체적인 세부 전공과 희망 직업군을 확정한 상태">구체적 목표 확정 단계</option>
            </select>
          </div>
          <div className="form-field form-span-2">
            <label htmlFor="pf-engagement">현재 진행 중인 관련 활동</label>
            <textarea id="pf-engagement" value={form.currentEngagement} onChange={(e) => update("currentEngagement", e.target.value)} />
          </div>

          <div className="form-field">
            <label htmlFor="pf-output">선호 산출물 형태</label>
            <select id="pf-output" value={form.outputPreference} onChange={(e) => update("outputPreference", e.target.value)}>
              <option value="">선택해주세요</option>
              <option value="논문, 보고서, 에세이 등 텍스트 중심">보고서 등 글쓰기</option>
              <option value="코드, 프로토타입, 모형 등 실물 제작">코드/실물 제작</option>
              <option value="발표자료, 인포그래픽 등 시각 자료">PPT 등 시각 자료</option>
              <option value="발표, 토론, 발표회 등 구두 전달">발표/토론 구두 전달</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="pf-collab">팀플 선호 역할</label>
            <select id="pf-collab" value={form.collaborationStyle} onChange={(e) => update("collaborationStyle", e.target.value)}>
              <option value="">선택해주세요</option>
              <option value="팀을 이끌고 계획을 주도하는 리더">리더 (계획 및 주도)</option>
              <option value="새로운 아이디어와 관점을 제시하는 기획자">기획자 (아이디어 제시)</option>
              <option value="주어진 역할을 확실하게 완수하는 팔로워">실행자 (역할 수행)</option>
              <option value="혼자 깊게 몰입하는 개인 연구 선호">개인 연구 선호</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="pf-subjects">선호 과목</label>
            <textarea id="pf-subjects" value={form.preferredSubjects} onChange={(e) => update("preferredSubjects", e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-strengths">강점</label>
            <textarea id="pf-strengths" value={form.strengths} onChange={(e) => update("strengths", e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-gaps">보완 역량</label>
            <textarea id="pf-gaps" value={form.gaps} onChange={(e) => update("gaps", e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-constraints">제약 조건</label>
            <textarea id="pf-constraints" value={form.constraints} onChange={(e) => update("constraints", e.target.value)} />
          </div>
        </div>

        {message && <div className="banner banner-success" style={{ marginTop: "20px" }}>{message}</div>}
        {error   && <div className="banner banner-error"   style={{ marginTop: "20px" }}>{error}</div>}

        <div className="profile-actions">
          <button className="btn btn-secondary" disabled={busy} onClick={() => save(false)} type="button">프로필만 저장</button>
          <button className="btn btn-primary"   disabled={busy} onClick={() => save(true)}  type="button">저장하고 로드맵 새 버전</button>
        </div>
      </div>

      <div className="data-priority-card">
        <span className="kicker">DATA PRIORITY</span>
        <h2>현재 저장 원칙</h2>
        <div className="priority-list">
          {[
            "학생이 직접 입력한 사실",
            "활동 원문에서 추출한 Evidence",
            "학생이 확인한 AI 해석",
            "아직 확인되지 않은 잠정 추론",
          ].map((text, i) => (
            <div className="priority-item" key={text}>
              <span className="priority-num">{i + 1}</span>
              {text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   ProductShell
   ────────────────────────────────────────────── */
function ProductShell({ workspace, onWorkspace, onNewStudent }: {
  workspace: ProductWorkspace;
  onWorkspace: (workspace: ProductWorkspace) => void;
  onNewStudent: () => void;
}) {
  const [tab, setTab] = useState<TabId>("roadmap");
  const [activityDraft, setActivityDraft] = useState<{ title: string; summary: string } | null>(null);
  const initials = workspace.profile.name.slice(-2);

  const tabs: Array<{ id: TabId; label: string; icon: string }> = [
    { id: "roadmap",    label: "3개년 기록",    icon: "📅" },
    { id: "overview",   label: "오늘",          icon: "🏠" },
    { id: "assignment", label: "수행평가 분석",  icon: "✦"  },
    { id: "activities", label: "활동·정합",      icon: "◎"  },
    { id: "profile",    label: "프로필",         icon: "◉"  },
  ];

  function startActivity(title: string, summary: string) {
    setActivityDraft({ title, summary });
    setTab("activities");
  }

  const currentTabLabel = tabs.find((t) => t.id === tab)?.label ?? "";

  return (
    <div className="product-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">세특</span>
          <div className="brand-text">
            <strong>세특연구소</strong>
            <small>Personal Coach</small>
          </div>
        </div>

        <div className="sidebar-student">
          <div className="student-avatar">{initials}</div>
          <div className="student-info">
            <strong>{workspace.profile.name}</strong>
            <small>{workspace.profile.grade}학년 {workspace.profile.semester}학기 · {workspace.profile.targetCareer}</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          {tabs.map((item) => (
            <button
              className={`nav-btn${tab === item.id ? " active" : ""}`}
              id={`nav-${item.id}`}
              key={item.id}
              onClick={() => setTab(item.id)}
              type="button"
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="new-student-btn" id="btn-new-student" onClick={onNewStudent} type="button">
            ＋ 신규 학생 시작
          </button>
        </div>
      </aside>

      {/* Main */}
      <section className="product-main">
        <header className="product-topbar">
          <div>
            <strong>{currentTabLabel}</strong>
            <small>v{APP_VERSION} · 로드맵 v{workspace.roadmap.version}</small>
          </div>
          <span className="privacy-chip">학생별 데이터 격리</span>
        </header>

        <div className="product-content">
          {tab === "overview"   && <Overview    workspace={workspace} onNavigate={setTab} />}
          {tab === "roadmap"    && <RoadmapView workspace={workspace} onWorkspace={onWorkspace} />}
          {tab === "assignment" && <AssignmentView workspace={workspace} onWorkspace={onWorkspace} onStartActivity={startActivity} />}
          {tab === "activities" && (
            <ActivitiesView
              key={activityDraft?.title ?? "activity-entry"}
              workspace={workspace}
              onWorkspace={onWorkspace}
              draft={activityDraft}
              clearDraft={() => setActivityDraft(null)}
            />
          )}
          {tab === "profile"    && <ProfileView workspace={workspace} onWorkspace={onWorkspace} />}
        </div>
      </section>
    </div>
  );
}

/* ──────────────────────────────────────────────
   WorkspaceApp (Entry Point)
   ────────────────────────────────────────────── */
export function WorkspaceApp() {
  const [workspace, setWorkspace] = useState<ProductWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const studentId = window.localStorage.getItem("seteuk-current-student");
    if (!studentId) { queueMicrotask(() => setLoading(false)); return; }
    jsonRequest<{ workspace: ProductWorkspace }>(`/api/workspace?studentId=${encodeURIComponent(studentId)}`)
      .then((result) => setWorkspace(result.workspace))
      .catch(() => {
        window.localStorage.removeItem("seteuk-current-student");
        setError("이전 작업공간을 찾지 못해 신규 가입 화면으로 돌아왔습니다.");
      })
      .finally(() => setLoading(false));
  }, []);

  const loadingCopy = useMemo(() => (loading ? "학생 작업공간을 불러오는 중…" : ""), [loading]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-brand">
          <span className="brand-mark">세특</span>
          <p>{loadingCopy}</p>
          <div className="loading-dots">
            <span /><span /><span />
          </div>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <>
        <Onboarding onComplete={setWorkspace} />
        {error && <div className="floating-error">{error}</div>}
      </>
    );
  }

  return (
    <ProductShell
      workspace={workspace}
      onWorkspace={setWorkspace}
      onNewStudent={() => {
        window.localStorage.removeItem("seteuk-current-student");
        setWorkspace(null);
      }}
    />
  );
}
