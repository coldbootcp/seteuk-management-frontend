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
  assert.match(gate, /h-\[740px\] md:h-\[820px\]/);

  // 상담 화면은 "큰 화면에서 보기"로 나뉘던 두 모드를 하나로 합쳤다 — viewMode가
  // 되살아나거나 그 버튼이 다시 생기면 안 된다.
  assert.doesNotMatch(gate, /viewMode/);
  assert.doesNotMatch(gate, /큰 화면에서 보기/);

  // 추천 답변은 고정 문구가 아니라 백엔드가 챗봇 답변에 맞춰 매 턴 만들어 보내는
  // suggested_replies를 그대로 띄운다.
  assert.match(gate, /const \[quickReplies, setQuickReplies\] = useState<string\[\]>/);
  assert.match(gate, /setQuickReplies\(payload\.suggested_replies \?\? \[\]\)/);

  // 마무리 버튼은 처음부터 항상 보이되 완료 전에는 눌리지 않고, 안내 문구가 붙는다.
  assert.match(gate, /disabled=\{concluding \|\| !canConclude\}/);
  assert.match(gate, /상담을 마쳐야 다음으로 넘어갈 수 있어요/);
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
  // 대입 연도는 하드코딩이 아니라 학생 입학 연도로 계산한 admissionYear를 쓴다
  // (freshmanAcademicYear + 3). 예전에는 2026/2027 상수를 박아 학생마다 어긋났다.
  assert.match(preparation, /\/programs\?admission_year=\$\{admissionYear\}/);
  assert.match(preparation, /freshmanAcademicYear/);
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
  assert.doesNotMatch(grades, /대입 지원 관련 기준/);
  assert.match(types, /EducationPolicyResolutionRead/);
});

test("no server-side or Workers code is left in the frontend", async () => {
  const pkg = JSON.parse(await source("package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  for (const banned of ["drizzle-orm", "drizzle-kit", "wrangler", "vinext", "@cloudflare/vite-plugin", "unpdf", "mammoth"]) {
    assert.equal(deps[banned], undefined, `${banned} should be gone`);
  }
});

test("the consultation narrows from a confirmed 3-year flow to this semester's goal and topics", async () => {
  const [gate, adapter, chat] = await Promise.all([
    source("app/consultation-view.tsx"),
    source("lib/workspace-adapter.ts"),
    source("lib/chat.ts"),
  ]);

  // 진행 단계는 메시지 수로 추측하지 않고 서버가 계산한 stage를 따른다.
  assert.doesNotMatch(gate, /consultationStep/);
  assert.match(gate, /STAGE_ORDER\[stage\]/);
  for (const label of ["3개년 흐름 조율", "이번 학기 목표", "구체 탐구 주제"]) {
    assert.match(gate, new RegExp(label));
  }

  // 3개년 흐름은 카드의 버튼으로만 확정된다 — 대화 텍스트로는 확정되지 않는다.
  assert.match(gate, /이 흐름으로 확정/);
  assert.match(gate, /다시 조율할래요/);
  assert.match(adapter, /\/confirm-flow/);
  assert.match(gate, /confirmConsultationFlow\(session\.id, confirmed\)/);

  // signal 이벤트가 흐름·단계·학기 목표를 함께 싣는다.
  assert.match(chat, /flow_confirmed\?: boolean/);
  assert.match(gate, /onSignal: applySignal/);
});

test("conversation titles come from the topic or the student, not the first message", async () => {
  const [view, chat] = await Promise.all([source("app/chat-view.tsx"), source("lib/chat.ts")]);

  assert.match(chat, /method: "PATCH"/);
  assert.match(chat, /event === "title"/);
  assert.match(view, /renameConversation\(/);
  assert.match(view, /이름 바꾸기/);
  assert.match(view, /onTitle:/);
  // 상담 대화는 목적에 맞는 제목을 쓴다.
  assert.match(view, /3개년 흐름 설계/);
  assert.match(view, /graduate_fit_consultation/);
});

test("timetable courses come from the backend subject catalog for the viewed semester", async () => {
  const [view, types, api, timetableApi] = await Promise.all([
    source("app/timetable-view.tsx"),
    source("app/types/academic.ts"),
    source("lib/subjects-api.ts"),
    source("lib/timetables-api.ts"),
  ]);

  // 예시는 보고 있는 학기의 것 — 학생의 '현재' 학기로 고정하지 않는다.
  assert.match(view, /grade=\{selGrade\}/);
  assert.match(view, /semester=\{selSemester\}/);
  assert.match(view, /commonSubjects\(grade, semester\)/);

  // 과목 목록은 프론트엔드에 하드코딩하지 않고 백엔드 카탈로그에서 가져온다.
  assert.match(view, /listSubjects\(\)/);
  assert.doesNotMatch(view, /presetsForCurriculum|commonCoursesForPeriod|SUBJECT_PRESETS/);
  assert.doesNotMatch(types, /COMMON_COURSES_BY_PERIOD|presetsForCurriculum/);
  assert.match(api, /\/subjects\/search\?/);
  assert.match(api, /\/subjects\/common\?/);

  // 직접 추가도 과목명을 자유롭게 치지 않는다 — 후보에서 고르거나 기타로만.
  assert.match(view, /<SubjectSearchField/);
  assert.doesNotMatch(view, /placeholder="예: 물리학Ⅱ"/);

  // 칸마다 카탈로그 코드를 저장해 과목 데이터와 1:1로 잇는다.
  assert.match(types, /subjectCode\?: string/);
  assert.match(timetableApi, /subject_code: slot\.subjectCode \?\? null/);
  assert.match(timetableApi, /subjectCode: slot\.subject_code \?\? undefined/);
});

test("students pick this semester's courses from the catalog before the consultation", async () => {
  const [app, picker, consultation] = await Promise.all([
    source("app/workspace-app.tsx"),
    source("app/course-picker.tsx"),
    source("app/consultation-view.tsx"),
  ]);

  // 프로필 다음, 상담 전에 수강 과목 단계가 있다(졸업생은 건너뛴다).
  assert.match(app, /setStep\("courses"\)/);
  assert.match(app, /다음: 이번 학기 과목 고르기/);
  assert.match(app, /<CurrentCoursePicker/);

  // 엔터는 후보를 고를 뿐 — 입력한 글자를 그대로 과목으로 만들지 않는다. 목록에 없는
  // 과목만 '기타'로 직접 입력한다.
  assert.match(picker, /const target = selectable\[highlight\];\s*if \(target\) pick\(target\);/);
  assert.match(picker, /기타로 직접 입력/);
  assert.match(picker, /custom_name/);

  // 필수는 아니지만, 건너뛰려면 한 번 더 확인한다.
  assert.match(picker, /아직 시간표를 몰라요/);
  assert.match(picker, /그래도 넘어가기/);

  // 상담 화면에서도 수강 과목을 보고 고칠 수 있다.
  assert.match(consultation, /이번 학기 수강 과목/);
  assert.match(consultation, /getCurrentCourses\(\)/);
});

test("the consultation names the real conclude button and drops the gate banner", async () => {
  const [consultation, chat] = await Promise.all([
    source("app/consultation-view.tsx"),
    source("lib/chat.ts"),
  ]);

  assert.match(consultation, /상담 마치고 메인 화면으로/);
  assert.doesNotMatch(consultation, /이 상담을 마쳐야 성적·시간표·활동 기록 등 메인 화면으로 들어갈 수 있어요/);
  assert.doesNotMatch(consultation, /나가기 버튼/);
  assert.doesNotMatch(chat, /나가기/);
  // 3개년 흐름은 3학년 말 도착점부터 합의한다.
  assert.match(consultation, /3학년 말 도착점/);
});

test("current-semester courses sit beside the timetable as draggable blocks", async () => {
  const view = await source("app/timetable-view.tsx");

  // 블록의 원천은 이번 학기 수강 과목(온보딩에서 등록)과 이 학기 시간표에 든 과목이다.
  assert.match(view, /getCurrentCourses\(\)/);
  assert.match(view, /paletteCourses/);

  // 블록은 끌어서 칸에 놓고, 칸은 블록을 받아 그 과목을 넣는다.
  assert.match(view, /setDraggingPaletteKey\(course\.key\)/);
  assert.match(view, /handlePlaceFromPalette\(draggingPaletteKey, dayIdx, period\)/);

  // 시간표에서 새로 추가한 과목은 수강 과목에도 저장돼 블록으로 남는다.
  assert.match(view, /rememberCourse\(course\)/);
  assert.match(view, /saveCurrentCourses\(/);

  // 빈칸의 "+"는 과목 블록을 고르는 창을 열고, 새 과목은 블록 끝의 "+"에서만 추가한다.
  assert.match(view, /onClick=\{\(\) => setCellChooser\(\{ day: dayIdx, period \}\)\}/);
  assert.match(view, /aria-label="새 과목 추가"/);
  assert.doesNotMatch(view, /과목 직접 등록|과목 검색·불러오기|CourseSearchModal/);
});

test("the settings tab can replace the school record and rerun the diagnosis on demand", async () => {
  const [app, api] = await Promise.all([source("app/workspace-app.tsx"), source("lib/school-record-api.ts")]);

  // 이미 연동돼도 최신 생기부로 바꿀 수 있고, 서버가 대조하는 교체 모드로 올린다.
  assert.match(app, /연동됨 · 최신으로 교체/);
  assert.match(api, /form\.append\("mode", "replace"\)/);

  // 확인을 기다리면 버튼이 "생기부 연동 완료하기"가 되고 연동 화면으로 다시 들어간다.
  assert.match(app, /생기부 연동 완료하기/);
  assert.match(app, /onOpenRecordReview\(null\)/);

  // 진단은 학생이 누를 때만 다시 만든다.
  assert.match(app, /진단 다시 하기/);
  assert.match(api, /"\/diagnosis", \{ method: "POST" \}/);
});

test("picking a school record moves to a full-screen review that waits for the analysis", async () => {
  const [app, screen, frame, api] = await Promise.all([
    source("app/workspace-app.tsx"),
    source("app/record-review-chat.tsx"),
    source("app/gate-frame.tsx"),
    source("lib/school-record-api.ts"),
  ]);

  // 파일을 고르는 즉시 셸 대신 전체 화면(온보딩 상담과 같은 틀)으로 넘어간다.
  assert.match(app, /if \(file\) onOpenRecordReview\(file\)/);
  assert.match(app, /if \(recordReview\) \{\s*return \(\s*<RecordReviewScreen/);
  assert.match(screen, /<GateFrame onClose=\{onExit\}/);
  assert.match(frame, /aria-label="닫기"/);

  // 그 화면에서 분석을 기다리고, 확인이 필요하면 거기서 챗봇과 정한다.
  assert.match(screen, /생기부를 분석하고 있어요/);
  assert.match(screen, /await waitForReplacement\(\)/);
  assert.match(api, /"\/consultation\/record-review"/);

  // 반영은 챗봇이 아니라 학생이 누르는 버튼으로만, 준비 신호가 온 뒤에만.
  assert.match(screen, /disabled=\{!review\?\.ready \|\| concluding \|\| streaming\}/);
  assert.match(screen, /확인한 내용으로 반영/);
  assert.match(api, /\/conclude`/);
});
