import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

// 이 리포는 화면만 담당한다. 예전에 여기 있던 영속화·정합·파서 검사는 서버 로직과
// 함께 백엔드로 옮겨갔고, 그쪽 pytest 스위트가 이어받는다.

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

test("the school record review stays client-side and states the real storage policy", async () => {
  const [app, parser] = await Promise.all([
    source("app/workspace-app.tsx"),
    source("lib/school-record-parser.ts"),
  ]);

  // 업로드 → 폴링 → 검토 흐름은 화면이 계속 소유한다.
  assert.match(app, /analyzeSchoolRecordPdf/);
  assert.match(app, /task\.status === "completed"/);

  // 원본을 보관하기로 정했으므로(P-1), 저장하지 않는다는 옛 약속이 남아 있으면 안 된다.
  assert.doesNotMatch(app, /원본 파일은 저장하지 않습니다/);

  // 응답 JSON을 화면용 초안으로 빚는 헬퍼는 프론트에 남았다.
  assert.match(parser, /50MB/);
  assert.match(parser, /academic_performance/);
  assert.match(parser, /reading_activities/);
  assert.match(parser, /result\.activities/);
  assert.match(parser, /dateBasis/);
  assert.match(parser, /인식 신뢰도|confidence/);

  // 파싱 자체는 백엔드가 한다 — TypeScript 파서가 되살아나면 안 된다.
  assert.doesNotMatch(parser, /export function parseSchoolRecordText/);
});

test("no server-side or Workers code is left in the frontend", async () => {
  const pkg = JSON.parse(await source("package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  for (const banned of ["drizzle-orm", "drizzle-kit", "wrangler", "vinext", "@cloudflare/vite-plugin", "unpdf", "mammoth"]) {
    assert.equal(deps[banned], undefined, `${banned} should be gone`);
  }
});
