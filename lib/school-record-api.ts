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
  state: "clean_imported" | "needs_review";
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

export async function replaceSchoolRecord(file: File): Promise<ReplaceOutcome> {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", "replace");
  const created = await api<{ upload_id: string }>("/seteuk/uploads", { method: "POST", form });

  for (let attempt = 0; attempt < POLL_LIMIT; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
    const status = await api<UploadStatus>(`/seteuk/uploads/${created.upload_id}`);
    if (status.status === "failed") throw new Error(status.failure_reason ?? "생기부를 분석하지 못했습니다.");
    if (status.status === "done") return { review: status.review, importedAt: status.imported_at };
  }
  throw new Error("분석이 5분을 넘었습니다. 잠시 후 설정 탭을 다시 열어 확인해 주세요.");
}

/** 새로고침해도 확인을 기다리는 교체 업로드를 되찾는다. */
export async function pendingRecordReview(): Promise<RecordReview | null> {
  const latest = await api<UploadStatus | null>("/seteuk/uploads/latest");
  if (!latest || latest.mode !== "replace" || latest.imported_at) return null;
  return latest.review?.state === "needs_review" ? latest.review : null;
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
  reading_activities: "독서",
  awards: "수상",
  volunteer_records: "봉사",
  attendance: "출결",
};

/** "성적 12 · 활동 30 · 독서 4"처럼 0이 아닌 영역만. */
export function summarizeCounts(counts: Record<string, number> | null | undefined): string {
  if (!counts) return "";
  return Object.entries(SECTION_LABELS)
    .filter(([key]) => (counts[key] ?? 0) > 0)
    .map(([key, label]) => `${label} ${counts[key]}`)
    .join(" · ");
}
