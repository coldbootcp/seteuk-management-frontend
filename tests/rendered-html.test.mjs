import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

// 이 리포는 화면만 담당한다. 예전에 여기 있던 영속화·정합·파서 검사는 서버 로직과
// 함께 백엔드로 옮겨갔고, 그쪽 pytest 스위트가 이어받는다.

test("the product exposes every primary surface", async () => {
  const [app, page, layout] = await Promise.all([
    source("app/workspace-app.tsx"),
    source("app/page.tsx"),
    source("app/layout.tsx"),
  ]);

  assert.match(page, /WorkspaceApp/);
  assert.match(layout, /세특연구소/);

  // 탭 구성. 기본 탭은 이번 학기다.
  assert.match(app, /useState<TabId>\("overview"\)/);
  for (const tab of ["overview", "journey", "dashboard", "timetable", "activities", "grades", "portfolio", "chat", "profile"]) {
    assert.match(app, new RegExp(`id: "${tab}"`), `${tab} 탭이 사라졌다`);
  }

  assert.match(app, /활동 & 세특|활동 기록/);
  assert.match(app, /상장/);
  assert.match(app, /봉사/);
  assert.match(app, /독서/);
  assert.match(app, /활동 주제 제안/);
  assert.doesNotMatch(app, /Codex is working|react-loading-skeleton|codex-preview/);
});

test("the onboarding moves from profile directly into the AI consultation and always offers a way out", async () => {
  const [app, gate] = await Promise.all([
    source("app/workspace-app.tsx"),
    source("app/gate-frame.tsx"),
  ]);

  // 방향 맞추기 질문을 별도 관문으로 만들지 않는다. 프로필 저장 뒤 상담에서
  // 학생이 필요한 만큼 대화하며 구체화한다.
  assert.match(app, /학생부 올리고 시작하기/);
  assert.match(app, /기본 정보로 시작하기/);
  assert.match(app, /AI 상담 시작하기/);
  assert.match(app, /onClick=\{\(\) => void confirmOnboarding\(\)\}/);

  // 온보딩과 관문은 사이드바가 없는 화면이다 — 나가는 길이 없으면 계정이 갇힌다.
  assert.match(gate, /로그아웃/);
  assert.match(app, /<Onboarding onComplete=\{checkGate\} onSignOut=\{signOut\} \/>/);
  assert.match(app, /onSignOut=\{signOut\}/);
});

test("the consultation gate starts with record-based diagnosis, not a generated questionnaire", async () => {
  const gate = await source("app/consultation-view.tsx");

  assert.match(gate, /const created = await api<\{ diagnosis_id: string \}>\("\/diagnosis"/);
  assert.doesNotMatch(gate, /\/diagnosis\/pre-questions/);
  assert.doesNotMatch(gate, /진단 전 확인/);
});

test("the onboarding clarification adapter preserves answer keys", async () => {
  const adapter = await source("lib/workspace-adapter.ts");

  assert.match(adapter, /case path === "\/api\/onboarding\/clarify"/);
  assert.match(adapter, /"\/profile\/clarify"/);
  assert.match(adapter, /key: entry\.key \?\? entry\.id/);
  assert.match(adapter, /id: question\.key/);
});

test("the school record review stays client-side and states the real storage policy", async () => {
  const [app, parser] = await Promise.all([
    source("app/workspace-app.tsx"),
    source("lib/school-record-parser.ts"),
  ]);

  // 업로드 → 폴링 → 검토 흐름은 화면이 계속 소유한다.
  assert.match(app, /analyzeSchoolRecordPdf/);
  assert.match(app, /task\.status === "completed"/);

  // 원본을 보관하기로 정했으므로(P-1), "저장하지 않는다"는 옛 약속이 어디에도
  // 남아 있으면 안 된다. 처음엔 문자열 하나만 검사했는데 다른 문구로 두 군데가 더
  // 살아 있었다 — 학생에게 하는 약속이라 표현이 아니라 주장 자체를 막는다.
  assert.doesNotMatch(app, /원본[^.\n]{0,12}저장하지 않/);

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

test("the 3-year journey distinguishes records, current execution, and future direction", async () => {
  const app = await source("app/workspace-app.tsx");

  // 과거·현재·미래를 같은 밀도의 확정 계획으로 다루지 않는다. 장기 흐름은
  // 보여주되, 미래는 방향만 제시하고 현재 학기에서만 실행 주제를 보여 준다.
  assert.match(app, /function ThreeYearJourney/);
  assert.match(app, /id: "journey"/);
  assert.match(app, /고교 3개년 흐름/);
  assert.match(app, /과거 · 실제 기록/);
  assert.match(app, /현재 · 실행 주제/);
  assert.match(app, /미래 · 방향/);
  assert.match(app, /후보 주제/);
  assert.match(app, /★ 우선 추천/);
  assert.match(app, /여유가 있으면/);
  assert.match(app, /상세 가이드 보기/);
  assert.match(app, /이번 학기 주제 전체 보기/);

  // 옛 화면처럼 전 학기 계획을 한꺼번에 실제 활동으로 전환하는 UI는 되살리지
  // 않는다. 실행으로 넘어가는 버튼은 이번 학기 화면이 소유한다.
  assert.doesNotMatch(app, /function RoadmapView/);
  assert.doesNotMatch(app, /id: "roadmap"/);
});

test("the admissions workspace uses the catalog instead of free-text target data", async () => {
  const [app, preparation] = await Promise.all([
    source("app/workspace-app.tsx"),
    source("app/application-preparation-view.tsx"),
  ]);

  assert.match(app, /ApplicationPreparationView/);
  assert.match(preparation, /admission-catalog\/universities/);
  assert.match(preparation, /\/programs\?admission_year=2027/);
  assert.match(preparation, /admission-catalog\/programs\/\$\{programId\}\/tracks/);
  assert.match(preparation, /admission-catalog\/tracks\/\$\{trackId\}\/detail/);
  assert.match(preparation, /지원 자격·평가 방법·일정/);
  assert.match(preparation, /application-preparations/);
  assert.match(preparation, /AI가 핵심 활동 추리기/);
});

test("grades follow the student's verified education policy", async () => {
  const [grades, types] = await Promise.all([
    source("app/grades-view.tsx"),
    source("lib/api-types.ts"),
  ]);

  // 입학 연도 기준을 서버에서 받아야 하며, 화면에 5등급제를 하드코딩하지 않는다.
  assert.match(grades, /"\/education-policies\/me"/);
  assert.match(grades, /EducationPolicyResolutionRead/);
  assert.match(grades, /rankGradeScale/);
  assert.match(grades, /rankOptions\.map/);
  assert.match(grades, /입학 연도 확인 필요/);
  assert.match(grades, /대입 지원 관련 기준/);
  assert.match(grades, /decision_scope === "track_specific"/);
  assert.match(types, /EducationPolicyResolutionRead/);
});

test("no server-side or Workers code is left in the frontend", async () => {
  const pkg = JSON.parse(await source("package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  for (const banned of ["drizzle-orm", "drizzle-kit", "wrangler", "vinext", "@cloudflare/vite-plugin", "unpdf", "mammoth"]) {
    assert.equal(deps[banned], undefined, `${banned} should be gone`);
  }
});
