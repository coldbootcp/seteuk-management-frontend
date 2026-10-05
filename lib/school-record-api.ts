import { api } from "./api-client";

/**
 * 설정 탭의 생기부 올리기·교체.
 *
 * 온보딩과 같은 분석을 거치지만, 검토 화면 없이 서버가 학생 기록과 대조한다(mode=replace).
 * 이상(이름·입학 연도 불일치, 아직 오지 않은 학기, 지난 학기가 빠진 옛 문서)과 충돌(직접
 * 입력한 기록과 내용이 다름)이 없으면 서버가 바로 반영하고, 있으면 반영하지 않고 멈춘다.
 */

export type RecordAnomaly = { kind: string; message: string };

export type RecordConflict = {
  id: string;
  section: "academic_performance" | "activities";
  grade: number;
  semester: number | null;
  title: string;
  record_summary: string;
  existing_summary: string;
  differences: string[];
};

export type RecordReview = {
  state: "clean_imported" | "needs_review" | "resolved" | "discarded";
  anomalies: RecordAnomaly[];
  conflicts: RecordConflict[];
  skipped_duplicates: Record<string, number>;
  imported: Record<string, number> | null;
};

type UploadStatus = {
  upload_id?: string;
  status: "processing" | "done" | "failed";
  failure_reason: string | null;
  imported_at: string | null;
  mode: "onboarding" | "replace";
  review: RecordReview | null;
};

export type ReplaceOutcome = { review: RecordReview | null; importedAt: string | null };

const POLL_INTERVAL_MS = 2000;
const POLL_LIMIT = 150; // 5분

/** 교체 모드로 올리기만 한다. 분석은 서버가 이어서 한다(waitForReplacement로 기다린다). */
export async function startReplacement(file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", "replace");
  await api<{ upload_id: string }>("/seteuk/uploads", { method: "POST", form });
}

/**
 * 가장 최근 교체 업로드의 분석이 끝날 때까지 기다린다. 업로드는 한 번에 하나만 남으므로
 * id를 들고 다니지 않아도 된다 — 확인 화면을 나갔다 다시 들어와도 같은 업로드를 이어 본다.
 */
export async function waitForReplacement(signal?: AbortSignal): Promise<ReplaceOutcome> {
  for (let attempt = 0; attempt < POLL_LIMIT; attempt += 1) {
    if (signal?.aborted) throw new Error("취소했습니다.");
    const latest = await api<UploadStatus | null>("/seteuk/uploads/latest");
    if (!latest || latest.mode !== "replace") throw new Error("올린 생기부를 찾지 못했습니다.");
    if (latest.status === "failed") throw new Error(latest.failure_reason ?? "생기부를 분석하지 못했습니다.");
    if (latest.status === "done") return { review: latest.review, importedAt: latest.imported_at };
    await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("분석이 5분을 넘었습니다. 잠시 후 다시 확인해 주세요.");
}

/** 설정 탭 버튼이 보여 줄 상태 — 분석 중이거나 확인을 기다리면 확인 화면으로 이어 간다. */
export type ReplacementStatus = "none" | "processing" | "needs_review";

export async function replacementStatus(): Promise<ReplacementStatus> {
  const latest = await api<UploadStatus | null>("/seteuk/uploads/latest");
  if (!latest || latest.mode !== "replace" || latest.imported_at) return "none";
  if (latest.status === "processing") return "processing";
  return latest.status === "done" && latest.review?.state === "needs_review" ? "needs_review" : "none";
}

/** 진단을 새로 만든다. 진단은 로드맵을 바꾸지 않는다. */
export async function rerunDiagnosis(): Promise<void> {
  const created = await api<{ diagnosis_id: string }>("/diagnosis", { method: "POST" });
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
    const result = await api<{ status: string }>(`/diagnosis/${created.diagnosis_id}`);
    if (result.status === "done") return;
    if (result.status === "failed") throw new Error("진단을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  throw new Error("진단이 오래 걸리고 있어요. 잠시 후 확인해 주세요.");
}

const SECTION_LABELS: Record<string, string> = {
  academic_performance: "성적",
  activities: "활동",
  volunteer_records: "봉사",
  attendance: "출결",
};

/** "성적 12 · 활동 30 · 봉사 4"처럼 0이 아닌 영역만. */
export function summarizeCounts(counts: Record<string, number> | null | undefined): string {
  if (!counts) return "";
  return Object.entries(SECTION_LABELS)
    .filter(([key]) => (counts[key] ?? 0) > 0)
    .map(([key, label]) => `${label} ${counts[key]}`)
    .join(" · ");
}

/* ──────────────────────────────────────────────
   생기부 확인 상담(kind=record_review)
   ────────────────────────────────────────────── */

export type ConflictChoice = "keep_mine" | "use_record" | "keep_both";

export const CONFLICT_CHOICE_LABELS: Record<ConflictChoice, string> = {
  keep_mine: "내 기록 유지",
  use_record: "생기부로 바꾸기",
  keep_both: "둘 다 남기기",
};

export type RecordReviewState = {
  available: boolean;
  ready: boolean;
  concluded?: boolean;
  file_name?: string | null;
  anomalies?: RecordAnomaly[];
  conflicts?: (RecordConflict & { choice: ConflictChoice | null })[];
  scope?: { mode: "all" | "until" | "none"; grade: number | null; semester: number | null; reason: string } | null;
  outstanding?: string[];
  result_state?: RecordReview["state"];
  imported?: Record<string, number> | null;
};

export type RecordReviewSession = { id: string; record_review: RecordReviewState | null };

export async function openRecordReview(): Promise<RecordReviewSession> {
  return api<RecordReviewSession>("/consultation/record-review", { method: "POST" });
}

export async function concludeRecordReview(sessionId: string): Promise<RecordReviewSession> {
  return api<RecordReviewSession>(`/consultation/sessions/${sessionId}/conclude`, { method: "POST" });
}

export async function recordReviewMessages(
  sessionId: string,
): Promise<{ id: string; role: string; content: string; applied_actions: unknown[] | null }[]> {
  return api(`/consultation/sessions/${sessionId}/messages`);
}

export function scopeLabel(scope: RecordReviewState["scope"]): string {
  if (!scope) return "아직 정하지 않음";
  if (scope.mode === "none") return "반영하지 않음";
  if (scope.mode === "until") return `${scope.grade}학년 ${scope.semester}학기까지 반영`;
  return "전부 반영";
}
