import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the product starts with onboarding and exposes every primary surface", async () => {
  const [app, page, layout] = await Promise.all([
    source("app/workspace-app.tsx"),
    source("app/page.tsx"),
    source("app/layout.tsx"),
  ]);

  assert.match(page, /WorkspaceApp/);
  assert.match(layout, /세특연구소/);
  assert.match(app, /NEW STUDENT ONBOARDING/);
  assert.match(app, /고교 3개년 로드맵/);
  assert.match(app, /3-YEAR SCHOOL RECORD/);
  assert.match(app, /생기부 PDF 분석/);
  assert.match(app, /SCHOOL RECORD REVIEW/);
  assert.match(app, /원본 파일은 저장하지 않습니다/);
  assert.match(app, /활동 타임라인/);
  assert.match(app, /SEMESTER FOCUS/);
  assert.match(app, /상장/);
  assert.match(app, /활동/);
  assert.match(app, /봉사/);
  assert.match(app, /독서/);
  assert.match(app, /시험/);
  assert.match(app, /subjectColor/);
  assert.match(app, /useState<TabId>\("roadmap"\)/);
  assert.match(app, /v\{APP_VERSION\} · 로드맵 v/);
  assert.match(app, /MAJOR NARRATIVE DNA/);
  assert.match(app, /활동 주제 제안/);
  assert.match(app, /학교 기회에 맞춰 선택/);
  assert.match(app, /이 주제를 실제 활동에 연결/);
  assert.match(app, /연결할 로드맵 활동 주제 \(선택 · 변경 가능\)/);
  assert.match(app, /모든 활동 기록과 정합/);
  assert.match(app, /현재 상태와 로드맵 기준/);
  assert.doesNotMatch(app, /Codex is working|react-loading-skeleton|codex-preview/);
});

test("planning, execution, memory, feedback, and reconciliation persist explicitly", async () => {
  const [harness, store, schema] = await Promise.all([
    source("lib/product-harness.ts"),
    source("lib/workspace-store.ts"),
    source("db/schema.ts"),
  ]);

  assert.match(harness, /generateRoadmap/);
  assert.match(harness, /suggestedTopicsForSemester/);
  assert.match(harness, /priority: "core" \| "optional"/);
  assert.match(harness, /description: string/);
  assert.match(harness, /diagnoseStudent/);
  assert.match(harness, /analyzeAssignment/);
  assert.match(harness, /reconcileActivity/);
  assert.match(harness, /MATCH/);
  assert.match(harness, /PARTIAL_MATCH/);
  assert.match(harness, /DIVERGE/);
  assert.match(harness, /MISS/);
  assert.match(store, /saveOnboarding/);
  assert.match(store, /regenerateRoadmap/);
  assert.match(store, /roadmap_plan_events/);
  assert.match(store, /plan_event_id/);
  assert.match(store, /linked_plan_title/);
  assert.match(store, /DELETE FROM roadmap_plan_events/);
  assert.match(schema, /roadmap_plan_events/);
  assert.match(schema, /planEventId/);
  assert.match(store, /saveRecommendationFeedback/);
  assert.match(schema, /student_workspaces/);
  assert.match(schema, /roadmap_nodes/);
  assert.match(schema, /reconciliation_logs/);
  assert.match(schema, /recommendation_feedback_v2/);
  assert.match(schema, /school_record_imports/);
  assert.match(schema, /school_record_courses/);
  assert.match(schema, /school_record_import_items/);
});

test("school record PDFs use the async parser API, review, and explicit import boundaries", async () => {
  const [app, parser, parseRoute, statusRoute, importRoute, store] = await Promise.all([
    source("app/workspace-app.tsx"),
    source("lib/school-record-parser.ts"),
    source("app/api/school-record/parse/route.ts"),
    source("app/api/school-record/status/[taskId]/route.ts"),
    source("app/api/school-record/import/route.ts"),
    source("lib/workspace-store.ts"),
  ]);

  assert.match(parseRoute, /seteukApiUrl\("\/analyze", request\.url\)/);
  assert.match(statusRoute, /seteukApiUrl\(`\/status\//);
  assert.match(app, /analyzeSchoolRecordPdf/);
  assert.match(app, /task\.status === "completed"/);
  assert.match(parser, /50MB/);
  assert.match(parser, /academic_performance/);
  assert.match(parser, /reading_activities/);
  assert.match(parser, /result\.activities/);
  assert.match(parser, /dateBasis/);
  assert.match(parser, /인식 신뢰도|confidence/);
  assert.doesNotMatch(parser, /\.slice\(0,\s*(60|120)\)/);
  assert.match(importRoute, /importSchoolRecord/);
  assert.match(store, /school_record_imports/);
  assert.match(store, /school_record_import_items/);
});
