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
  assert.match(layout, /세특연구소 Personal Coach/);
  assert.match(app, /New Student Onboarding/);
  assert.match(app, /3개년 로드맵 미리보기/);
  assert.match(app, /3-YEAR SCHOOL RECORD/);
  assert.match(app, /생기부 PDF 분석/);
  assert.match(app, /SCHOOL RECORD REVIEW/);
  assert.match(app, /원본 파일은 저장하지 않습니다/);
  assert.match(app, /3개년 연속 타임라인/);
  assert.match(app, /SEMESTER FOCUS/);
  assert.match(app, /상장/);
  assert.match(app, /대회/);
  assert.match(app, /수행평가/);
  assert.match(app, /보고서/);
  assert.match(app, /독서/);
  assert.match(app, /시험/);
  assert.match(app, /과목별 색상/);
  assert.match(app, /useState<TabId>\("roadmap"\)/);
  assert.match(app, /앱 v\{APP_VERSION\} · 학생 로드맵 v/);
  assert.match(app, /STUDENT DNA/);
  assert.match(app, /수행평가 분석과 후속 탐구/);
  assert.match(app, /활동 기록과 로드맵 정합/);
  assert.match(app, /학생 프로필과 진로 변화/);
  assert.doesNotMatch(app, /Codex is working|react-loading-skeleton|codex-preview/);
});

test("planning, execution, memory, feedback, and reconciliation persist explicitly", async () => {
  const [harness, store, schema] = await Promise.all([
    source("lib/product-harness.ts"),
    source("lib/workspace-store.ts"),
    source("db/schema.ts"),
  ]);

  assert.match(harness, /generateRoadmap/);
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
  assert.match(schema, /roadmap_plan_events/);
  assert.match(store, /saveRecommendationFeedback/);
  assert.match(schema, /student_workspaces/);
  assert.match(schema, /roadmap_nodes/);
  assert.match(schema, /reconciliation_logs/);
  assert.match(schema, /recommendation_feedback_v2/);
  assert.match(schema, /school_record_imports/);
  assert.match(schema, /school_record_courses/);
  assert.match(schema, /school_record_import_items/);
});

test("school record PDFs are parsed, reviewed, and imported through explicit boundaries", async () => {
  const [parser, parseRoute, importRoute, store] = await Promise.all([
    source("lib/school-record-parser.ts"),
    source("app/api/school-record/parse/route.ts"),
    source("app/api/school-record/import/route.ts"),
    source("lib/workspace-store.ts"),
  ]);

  assert.match(parseRoute, /getDocumentProxy/);
  assert.match(parseRoute, /extractText/);
  assert.match(parser, /50MB/);
  assert.match(parser, /parseSchoolRecordText/);
  assert.match(parser, /dateBasis/);
  assert.match(parser, /인식 신뢰도|confidence/);
  assert.doesNotMatch(parser, /\.slice\(0,\s*(60|120)\)/);
  assert.match(importRoute, /importSchoolRecord/);
  assert.match(store, /school_record_imports/);
  assert.match(store, /school_record_import_items/);
});
