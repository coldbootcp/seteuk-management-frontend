import { getD1 } from "../db";
import {
  analyzeAssignment,
  diagnoseStudent,
  generateRoadmap,
  makeNextMission,
  reconcileActivity,
  type AssignmentAnalysis,
  type ActivityAttachment,
  type ActivityReview,
  type ProductWorkspace,
  type ProfileInput,
  type ReconciliationLog,
  type Roadmap,
  type RoadmapPlanEvent,
  type RoadmapNode,
  type SchoolRecordCourseRecord,
  type StudentCourseGrade,
  type StudentSemesterCourse,
  type StudentActivity,
  type StudentWorkspaceProfile,
} from "./product-harness";
import type { SchoolRecordCourse, SchoolRecordDraft } from "./school-record-parser";
import { analyzeAssignmentWithDeepSeek, generateRoadmapWithDeepSeek, isDeepSeekConfigured } from "./deepseek-provider";

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS student_workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    grade INTEGER NOT NULL,
    semester INTEGER NOT NULL,
    target_career TEXT NOT NULL,
    target_majors_json TEXT NOT NULL,
    interests_json TEXT NOT NULL,
    motivation_trigger TEXT NOT NULL DEFAULT '',
    career_resolution TEXT NOT NULL DEFAULT '',
    current_engagement_json TEXT NOT NULL DEFAULT '[]',
    preferred_subjects_json TEXT NOT NULL,
    strengths_json TEXT NOT NULL,
    gaps_json TEXT NOT NULL,
    constraints_json TEXT NOT NULL,
    output_preference TEXT NOT NULL DEFAULT '',
    collaboration_style TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS roadmaps (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    career_track TEXT NOT NULL,
    template_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS roadmap_nodes (
    id TEXT PRIMARY KEY,
    roadmap_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    grade INTEGER NOT NULL,
    semester INTEGER NOT NULL,
    narrative_stage TEXT NOT NULL,
    title TEXT NOT NULL,
    objective TEXT NOT NULL,
    candidate_subjects_json TEXT NOT NULL,
    competency_goals_json TEXT NOT NULL,
    status TEXT NOT NULL,
    instantiated_activity_id TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS student_activities_v2 (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    subject TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    reflection TEXT NOT NULL DEFAULT '',
    concepts_json TEXT NOT NULL,
    outputs_json TEXT NOT NULL,
    status TEXT NOT NULL,
    roadmap_node_id TEXT,
    plan_event_id TEXT,
    linked_plan_title TEXT,
    completed_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS activity_attachments (id TEXT PRIMARY KEY, activity_id TEXT NOT NULL, student_id TEXT NOT NULL, file_name TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, storage_key TEXT NOT NULL, extracted_text TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS activity_reviews (activity_id TEXT PRIMARY KEY, student_id TEXT NOT NULL, plan_event_id TEXT, alignment TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS roadmap_plan_events (
    id TEXT PRIMARY KEY,
    roadmap_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    month_day TEXT NOT NULL,
    category TEXT NOT NULL,
    subject TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'core',
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS reconciliation_logs (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    roadmap_id TEXT NOT NULL,
    node_id TEXT,
    match_type TEXT NOT NULL,
    rationale TEXT NOT NULL,
    action TEXT NOT NULL,
    confidence INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS assignment_analyses (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    task TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS recommendation_feedback_v2 (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    analysis_id TEXT NOT NULL,
    recommendation_id TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS school_record_imports (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    total_pages INTEGER NOT NULL,
    course_count INTEGER NOT NULL,
    entry_count INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS school_record_courses (
    id TEXT PRIMARY KEY,
    import_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    grade INTEGER NOT NULL,
    semester INTEGER NOT NULL,
    subject TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS school_record_import_items (
    id TEXT PRIMARY KEY,
    import_id TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    grade INTEGER NOT NULL,
    semester INTEGER NOT NULL,
    date_basis TEXT NOT NULL,
    confidence INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS student_semester_courses (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    roadmap_node_id TEXT NOT NULL,
    grade INTEGER NOT NULL,
    semester INTEGER NOT NULL,
    subject TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS student_course_grades (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    semester_course_id TEXT NOT NULL,
    rank INTEGER,
    score INTEGER,
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS idx_roadmaps_student_status ON roadmaps(student_id, status, version)",
  "CREATE INDEX IF NOT EXISTS idx_roadmap_nodes_roadmap_order ON roadmap_nodes(roadmap_id, order_index)",
  "CREATE INDEX IF NOT EXISTS idx_activities_student_created ON student_activities_v2(student_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_plan_events_roadmap_node ON roadmap_plan_events(roadmap_id, node_id)",
  "CREATE INDEX IF NOT EXISTS idx_reconciliation_student_created ON reconciliation_logs(student_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_school_record_courses_student_period ON school_record_courses(student_id, grade, semester)",
  "CREATE INDEX IF NOT EXISTS idx_school_record_items_import ON school_record_import_items(import_id)",
  "CREATE INDEX IF NOT EXISTS idx_activity_attachments_student_activity ON activity_attachments(student_id, activity_id)",
  "CREATE INDEX IF NOT EXISTS idx_activity_reviews_student_created ON activity_reviews(student_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_semester_courses_student_node ON student_semester_courses(student_id, roadmap_node_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_course_grades_student_course ON student_course_grades(student_id, semester_course_id)",
];

function parseList(value: string | null | undefined) {
  if (!value) return [];
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

export async function ensureWorkspaceSchema() {
  const d1 = getD1();
  await d1.batch(SCHEMA_STATEMENTS.map((statement) => d1.prepare(statement)));
  // 개발 DB에는 이미 생성된 테이블이 있을 수 있으므로 새 연결 필드만 안전하게 보강한다.
  const columns = await d1.prepare("PRAGMA table_info(student_activities_v2)").all<{ name: string }>();
  if (!columns.results.some((column) => column.name === "plan_event_id")) {
    await d1.prepare("ALTER TABLE student_activities_v2 ADD COLUMN plan_event_id TEXT").run();
  }
  if (!columns.results.some((column) => column.name === "linked_plan_title")) {
    await d1.prepare("ALTER TABLE student_activities_v2 ADD COLUMN linked_plan_title TEXT").run();
  }
  if (!columns.results.some((column) => column.name === "reflection")) {
    await d1.prepare("ALTER TABLE student_activities_v2 ADD COLUMN reflection TEXT NOT NULL DEFAULT ''").run();
  }
  const planColumns = await d1.prepare("PRAGMA table_info(roadmap_plan_events)").all<{ name: string }>();
  if (!planColumns.results.some((column) => column.name === "priority")) await d1.prepare("ALTER TABLE roadmap_plan_events ADD COLUMN priority TEXT NOT NULL DEFAULT 'core'").run();
  if (!planColumns.results.some((column) => column.name === "description")) await d1.prepare("ALTER TABLE roadmap_plan_events ADD COLUMN description TEXT NOT NULL DEFAULT ''").run();
}

type ProfileRow = {
  id: string;
  name: string;
  grade: number;
  semester: number;
  target_career: string;
  target_majors_json: string;
  interests_json: string;
  motivation_trigger: string;
  career_resolution: string;
  current_engagement_json: string;
  preferred_subjects_json: string;
  strengths_json: string;
  gaps_json: string;
  constraints_json: string;
  output_preference: string;
  collaboration_style: string;
  created_at: string;
  updated_at: string;
};

type RoadmapRow = {
  id: string;
  student_id: string;
  version: number;
  career_track: string;
  template_id: string;
  status: Roadmap["status"];
};

type NodeRow = {
  id: string;
  roadmap_id: string;
  student_id: string;
  order_index: number;
  grade: number;
  semester: number;
  narrative_stage: string;
  title: string;
  objective: string;
  candidate_subjects_json: string;
  competency_goals_json: string;
  status: RoadmapNode["status"];
  instantiated_activity_id: string | null;
};

type ActivityRow = {
  id: string;
  student_id: string;
  activity_type: string;
  subject: string;
  title: string;
  summary: string;
  reflection: string | null;
  concepts_json: string;
  outputs_json: string;
  status: string;
  roadmap_node_id: string | null;
  plan_event_id: string | null;
  linked_plan_title: string | null;
  completed_at: string;
  created_at: string;
};
type AttachmentRow = { id: string; activity_id: string; file_name: string; content_type: string; size_bytes: number; storage_key: string; extracted_text: string };
type ReviewRow = { result_json: string };

type PlanEventRow = {
  id: string;
  roadmap_id: string;
  node_id: string;
  student_id: string;
  month_day: string;
  category: RoadmapPlanEvent["category"];
  subject: string;
  priority: "core" | "optional";
  title: string;
  description: string;
};

type ReconciliationRow = {
  id: string;
  student_id: string;
  activity_id: string;
  roadmap_id: string;
  node_id: string | null;
  match_type: ReconciliationLog["matchType"];
  rationale: string;
  action: string;
  confidence: number;
  created_at: string;
};

type SchoolRecordCourseRow = {
  id: string;
  import_id: string;
  student_id: string;
  grade: number;
  semester: number;
  subject: string;
};
type SemesterCourseRow = {
  id: string;
  student_id: string;
  roadmap_node_id: string;
  grade: number;
  semester: number;
  subject: string;
};
type CourseGradeRow = { id: string; student_id: string; semester_course_id: string; rank: number | null; score: number | null; note: string };

function toProfile(row: ProfileRow): StudentWorkspaceProfile {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    semester: row.semester,
    targetCareer: row.target_career,
    targetMajors: parseList(row.target_majors_json),
    interests: parseList(row.interests_json),
    motivationTrigger: row.motivation_trigger,
    careerResolution: row.career_resolution,
    currentEngagement: parseList(row.current_engagement_json),
    preferredSubjects: parseList(row.preferred_subjects_json),
    strengths: parseList(row.strengths_json),
    gaps: parseList(row.gaps_json),
    constraints: parseList(row.constraints_json),
    outputPreference: row.output_preference,
    collaborationStyle: row.collaboration_style,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toNode(row: NodeRow, planEvents: RoadmapPlanEvent[] = []): RoadmapNode {
  return {
    id: row.id,
    roadmapId: row.roadmap_id,
    studentId: row.student_id,
    orderIndex: row.order_index,
    grade: row.grade,
    semester: row.semester,
    narrativeStage: row.narrative_stage,
    title: row.title,
    objective: row.objective,
    candidateSubjects: parseList(row.candidate_subjects_json),
    competencyGoals: parseList(row.competency_goals_json),
    status: row.status,
    instantiatedActivityId: row.instantiated_activity_id,
    planEvents,
  };
}

function toPlanEvent(row: PlanEventRow): RoadmapPlanEvent {
  return {
    id: row.id,
    monthDay: row.month_day,
    category: row.category,
    subject: row.subject,
    priority: row.priority === "optional" ? "optional" : "core",
    title: row.title,
    description: row.description || "이 학기의 목표와 연결되는 탐구 주제입니다.",
  };
}

function toActivity(row: ActivityRow): StudentActivity {
  return {
    id: row.id,
    studentId: row.student_id,
    activityType: row.activity_type,
    subject: row.subject,
    title: row.title,
    summary: row.summary,
    reflection: row.reflection ?? "",
    concepts: parseList(row.concepts_json),
    outputs: parseList(row.outputs_json),
    status: row.status,
    roadmapNodeId: row.roadmap_node_id,
    planEventId: row.plan_event_id,
    linkedPlanTitle: row.linked_plan_title,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

function toReconciliation(row: ReconciliationRow): ReconciliationLog {
  return {
    id: row.id,
    studentId: row.student_id,
    activityId: row.activity_id,
    roadmapId: row.roadmap_id,
    nodeId: row.node_id,
    matchType: row.match_type,
    rationale: row.rationale,
    action: row.action,
    confidence: row.confidence,
    createdAt: row.created_at,
  };
}

function toSchoolRecordCourse(row: SchoolRecordCourseRow): SchoolRecordCourseRecord {
  return {
    id: row.id,
    importId: row.import_id,
    studentId: row.student_id,
    grade: row.grade,
    semester: row.semester,
    subject: row.subject,
  };
}

function toSemesterCourse(row: SemesterCourseRow): StudentSemesterCourse {
  return { id: row.id, studentId: row.student_id, roadmapNodeId: row.roadmap_node_id, grade: row.grade, semester: row.semester, subject: row.subject };
}

function toCourseGrade(row: CourseGradeRow): StudentCourseGrade {
  return { id: row.id, studentId: row.student_id, semesterCourseId: row.semester_course_id, rank: row.rank, score: row.score, note: row.note };
}

export async function saveOnboarding(profileInput: ProfileInput, roadmapInput: Roadmap) {
  await ensureWorkspaceSchema();
  const d1 = getD1();
  const studentId = roadmapInput.studentId;
  const roadmap: Roadmap = { ...roadmapInput, status: "active" };

  const statements = [
    d1.prepare(
      `INSERT INTO student_workspaces (
        id, name, grade, semester, target_career, target_majors_json,
        interests_json, motivation_trigger, career_resolution, current_engagement_json, preferred_subjects_json, strengths_json, gaps_json,
        constraints_json, output_preference, collaboration_style
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      studentId,
      profileInput.name,
      profileInput.grade,
      profileInput.semester,
      profileInput.targetCareer,
      JSON.stringify(profileInput.targetMajors),
      JSON.stringify(profileInput.interests),
      profileInput.motivationTrigger,
      profileInput.careerResolution,
      JSON.stringify(profileInput.currentEngagement),
      JSON.stringify(profileInput.preferredSubjects),
      JSON.stringify(profileInput.strengths),
      JSON.stringify(profileInput.gaps),
      JSON.stringify(profileInput.constraints),
      profileInput.outputPreference,
      profileInput.collaborationStyle,
    ),
    d1.prepare(
      "INSERT INTO roadmaps (id, student_id, version, career_track, template_id, status) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      roadmap.id,
      studentId,
      roadmap.version,
      roadmap.careerTrack,
      roadmap.templateId,
      "active",
    ),
    ...roadmap.nodes.map((node) =>
      d1.prepare(
        `INSERT INTO roadmap_nodes (
          id, roadmap_id, student_id, order_index, grade, semester,
          narrative_stage, title, objective, candidate_subjects_json,
          competency_goals_json, status, instantiated_activity_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        node.id,
        roadmap.id,
        studentId,
        node.orderIndex,
        node.grade,
        node.semester,
        node.narrativeStage,
        node.title,
        node.objective,
        JSON.stringify(node.candidateSubjects),
        JSON.stringify(node.competencyGoals),
        node.status,
        node.instantiatedActivityId ?? null,
      ),
    ),
    ...roadmap.nodes.flatMap((node) => (node.planEvents ?? []).map((event) =>
      d1.prepare(
        `INSERT INTO roadmap_plan_events (
          id, roadmap_id, node_id, student_id, month_day, category, subject, priority, title, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        event.id,
        roadmap.id,
        node.id,
        studentId,
        event.monthDay,
        event.category,
        event.subject,
        event.priority,
        event.title,
        event.description,
      ),
    )),
  ];
  await d1.batch(statements);
  return loadWorkspace(studentId);
}

export async function loadWorkspace(studentId: string): Promise<ProductWorkspace> {
  await ensureWorkspaceSchema();
  const d1 = getD1();
  const profileRow = await d1
    .prepare("SELECT * FROM student_workspaces WHERE id = ?")
    .bind(studentId)
    .first<ProfileRow>();
  if (!profileRow) throw new Error("학생 작업공간을 찾지 못했습니다.");

  const roadmapRow = await d1
    .prepare("SELECT * FROM roadmaps WHERE student_id = ? AND status = 'active' ORDER BY version DESC LIMIT 1")
    .bind(studentId)
    .first<RoadmapRow>();
  if (!roadmapRow) throw new Error("활성 로드맵을 찾지 못했습니다.");

  const [nodeResult, planEventResult, activityResult, courseResult, semesterCourseResult, gradeResult, reconciliationResult, analysisRow, attachmentResult, reviewResult] = await Promise.all([
    d1.prepare("SELECT * FROM roadmap_nodes WHERE roadmap_id = ? ORDER BY order_index ASC").bind(roadmapRow.id).all<NodeRow>(),
    d1.prepare("SELECT * FROM roadmap_plan_events WHERE roadmap_id = ? ORDER BY CASE priority WHEN 'core' THEN 0 ELSE 1 END, month_day ASC").bind(roadmapRow.id).all<PlanEventRow>(),
    d1.prepare("SELECT * FROM student_activities_v2 WHERE student_id = ? ORDER BY completed_at DESC, created_at DESC").bind(studentId).all<ActivityRow>(),
    d1.prepare("SELECT * FROM school_record_courses WHERE student_id = ? ORDER BY grade, semester, subject").bind(studentId).all<SchoolRecordCourseRow>(),
    d1.prepare("SELECT * FROM student_semester_courses WHERE student_id = ? ORDER BY grade, semester, subject").bind(studentId).all<SemesterCourseRow>(),
    d1.prepare("SELECT * FROM student_course_grades WHERE student_id = ?").bind(studentId).all<CourseGradeRow>(),
    d1.prepare("SELECT * FROM reconciliation_logs WHERE student_id = ? ORDER BY created_at DESC").bind(studentId).all<ReconciliationRow>(),
    d1.prepare("SELECT result_json FROM assignment_analyses WHERE student_id = ? ORDER BY created_at DESC LIMIT 1").bind(studentId).first<{ result_json: string }>(),
    d1.prepare("SELECT * FROM activity_attachments WHERE student_id = ? ORDER BY created_at DESC").bind(studentId).all<AttachmentRow>(),
    d1.prepare("SELECT result_json FROM activity_reviews WHERE student_id = ? ORDER BY created_at DESC").bind(studentId).all<ReviewRow>(),
  ]);

  const profile = toProfile(profileRow);
  const planEventsByNode = new Map<string, RoadmapPlanEvent[]>();
  for (const row of planEventResult.results) {
    const events = planEventsByNode.get(row.node_id) ?? [];
    events.push(toPlanEvent(row));
    planEventsByNode.set(row.node_id, events);
  }
  const nodes = nodeResult.results.map((row) => toNode(row, planEventsByNode.get(row.id) ?? []));
  const activities = activityResult.results.map(toActivity);
  const schoolRecordCourses = courseResult.results.map(toSchoolRecordCourse);
  const semesterCourses = semesterCourseResult.results.map(toSemesterCourse);
  const courseGrades = gradeResult.results.map(toCourseGrade);
  const reconciliations = reconciliationResult.results.map(toReconciliation);
  const roadmap: Roadmap = {
    id: roadmapRow.id,
    studentId: roadmapRow.student_id,
    version: roadmapRow.version,
    careerTrack: roadmapRow.career_track,
    templateId: roadmapRow.template_id,
    status: roadmapRow.status,
    nodes,
  };
  let latestAnalysis: AssignmentAnalysis | null = null;
  if (analysisRow?.result_json) {
    try {
      latestAnalysis = JSON.parse(analysisRow.result_json) as AssignmentAnalysis;
    } catch {
      latestAnalysis = null;
    }
  }
  return {
    profile,
    roadmap,
    activities,
    attachments: attachmentResult.results.map((row) => ({ id: row.id, activityId: row.activity_id, fileName: row.file_name, contentType: row.content_type, sizeBytes: row.size_bytes, storageKey: row.storage_key, extractedText: row.extracted_text })),
    activityReviews: reviewResult.results.flatMap((row) => { try { return [JSON.parse(row.result_json) as ActivityReview]; } catch { return []; } }),
    semesterCourses,
    courseGrades,
    schoolRecordCourses,
    reconciliations,
    dna: diagnoseStudent(profile, activities),
    nextMission: makeNextMission(roadmap),
    latestAnalysis,
  };
}

export async function importSchoolRecord(input: {
  studentId: string;
  fileName: string;
  totalPages: number;
  courses: SchoolRecordCourse[];
  entries: SchoolRecordDraft[];
  courseGradeChoices?: Record<string, "keep" | "replace">;
}) {
  const workspace = await loadWorkspace(input.studentId);
  const importId = crypto.randomUUID();
  const selectedEntries = input.entries.filter((entry) => entry.selected);
  const d1 = getD1();
  const isPastPeriod = (grade: number, semester: number) =>
    grade < workspace.profile.grade || (grade === workspace.profile.grade && semester < workspace.profile.semester);
  const existingCourses = new Map(workspace.semesterCourses.map((course) => [`${course.grade}-${course.semester}-${course.subject}`, course]));
  const existingGrades = new Map(workspace.courseGrades.map((grade) => [grade.semesterCourseId, grade]));
  const statements = [
    d1.prepare(
      `INSERT INTO school_record_imports (
        id, student_id, file_name, total_pages, course_count, entry_count, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'completed')`,
    ).bind(importId, input.studentId, input.fileName, input.totalPages, input.courses.length, selectedEntries.length),
    ...input.courses.map((course) =>
      d1.prepare(
        `INSERT INTO school_record_courses (id, import_id, student_id, grade, semester, subject)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), importId, input.studentId, course.grade, course.semester, course.subject),
    ),
  ];

  for (const course of input.courses) {
    // 현재·미래 학기는 실제 수강 과목과 성적이 확정된 뒤 학생이 직접 등록한다.
    if (!isPastPeriod(course.grade, course.semester)) continue;
    const node = workspace.roadmap.nodes.find((item) => item.grade === course.grade && item.semester === course.semester);
    if (!node) continue;
    const key = `${course.grade}-${course.semester}-${course.subject}`;
    const existingCourse = existingCourses.get(key);
    const semesterCourseId = existingCourse?.id ?? crypto.randomUUID();
    if (!existingCourse) {
      statements.push(
        d1.prepare("INSERT INTO student_semester_courses (id, student_id, roadmap_node_id, grade, semester, subject) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(semesterCourseId, input.studentId, node.id, course.grade, course.semester, course.subject),
      );
      existingCourses.set(key, { id: semesterCourseId, studentId: input.studentId, roadmapNodeId: node.id, grade: course.grade, semester: course.semester, subject: course.subject });
    }
    if (course.rank === null || course.rank === undefined) continue;
    const existingGrade = existingGrades.get(semesterCourseId);
    const choice = input.courseGradeChoices?.[course.id];
    if (existingGrade?.rank !== null && existingGrade?.rank !== undefined && existingGrade.rank !== course.rank && choice !== "replace") continue;
    if (!existingGrade || existingGrade.rank !== course.rank || choice === "replace") {
      statements.push(
        d1.prepare(`INSERT INTO student_course_grades (id, student_id, semester_course_id, rank, score, note, updated_at)
          VALUES (?, ?, ?, ?, NULL, '', CURRENT_TIMESTAMP)
          ON CONFLICT(student_id, semester_course_id) DO UPDATE SET rank = excluded.rank, updated_at = CURRENT_TIMESTAMP`)
          .bind(crypto.randomUUID(), input.studentId, semesterCourseId, course.rank),
      );
    }
  }

  selectedEntries.forEach((entry) => {
    const activityId = crypto.randomUUID();
    const roadmapNodeId = workspace.roadmap.nodes.find(
      (node) => node.grade === entry.grade && node.semester === entry.semester,
    )?.id ?? null;
    statements.push(
      d1.prepare(
        `INSERT INTO student_activities_v2 (
          id, student_id, activity_type, subject, title, summary, concepts_json,
          outputs_json, status, roadmap_node_id, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, '[]', '["생활기록부"]', 'completed', ?, ?)`,
      ).bind(
        activityId,
        input.studentId,
        entry.category,
        entry.subject,
        entry.title,
        entry.summary,
        roadmapNodeId,
        entry.completedAt,
      ),
      d1.prepare(
        `INSERT INTO school_record_import_items (
          id, import_id, activity_id, grade, semester, date_basis, confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        importId,
        activityId,
        entry.grade,
        entry.semester,
        entry.dateBasis,
        entry.confidence,
      ),
    );
  });

  await d1.batch(statements);
  return { workspace: await loadWorkspace(input.studentId), importedCount: selectedEntries.length, importId };
}

export async function addSemesterCourse(studentId: string, roadmapNodeId: string, subject: string) {
  const normalized = subject.trim();
  if (!normalized) throw new Error("과목명을 입력해주세요.");
  await ensureWorkspaceSchema();
  const d1 = getD1();
  const node = await d1.prepare("SELECT grade, semester FROM roadmap_nodes WHERE id = ? AND student_id = ?").bind(roadmapNodeId, studentId).first<{ grade: number; semester: number }>();
  if (!node) throw new Error("학기 정보를 찾지 못했습니다.");
  const existing = await d1.prepare("SELECT id FROM student_semester_courses WHERE student_id = ? AND roadmap_node_id = ? AND subject = ?").bind(studentId, roadmapNodeId, normalized).first<{ id: string }>();
  if (!existing) {
    await d1.prepare("INSERT INTO student_semester_courses (id, student_id, roadmap_node_id, grade, semester, subject) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), studentId, roadmapNodeId, node.grade, node.semester, normalized).run();
  }
  return loadWorkspace(studentId);
}

export async function deleteSemesterCourse(studentId: string, courseId: string) {
  await ensureWorkspaceSchema();
  await getD1().prepare("DELETE FROM student_semester_courses WHERE id = ? AND student_id = ?").bind(courseId, studentId).run();
  return loadWorkspace(studentId);
}

export async function saveCourseGrade(studentId: string, semesterCourseId: string, input: { rank?: number | null; score?: number | null; note?: string }) {
  await ensureWorkspaceSchema();
  const d1 = getD1();
  const course = await d1.prepare("SELECT id FROM student_semester_courses WHERE id = ? AND student_id = ?").bind(semesterCourseId, studentId).first<{ id: string }>();
  if (!course) throw new Error("수강 과목 정보를 찾지 못했습니다.");
  const rank = input.rank && input.rank >= 1 && input.rank <= 5 ? input.rank : null;
  const score = input.score !== undefined && input.score !== null && input.score >= 0 && input.score <= 100 ? input.score : null;
  const note = (input.note ?? "").trim();
  await d1.prepare(`INSERT INTO student_course_grades (id, student_id, semester_course_id, rank, score, note, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, semester_course_id) DO UPDATE SET rank = excluded.rank, score = excluded.score, note = excluded.note, updated_at = CURRENT_TIMESTAMP`)
    .bind(crypto.randomUUID(), studentId, semesterCourseId, rank, score, note).run();
  return loadWorkspace(studentId);
}

export async function addActivity(
  studentId: string,
  input: Omit<StudentActivity, "id" | "studentId" | "status">,
  attachments: Array<Omit<ActivityAttachment, "id" | "activityId">> = [],
  review?: ActivityReview,
) {
  const workspace = await loadWorkspace(studentId);
  const linkedPlan = input.planEventId
    ? await getD1()
        .prepare("SELECT * FROM roadmap_plan_events WHERE id = ? AND student_id = ?")
        .bind(input.planEventId, studentId)
        .first<PlanEventRow>()
    : null;
  if (input.planEventId && !linkedPlan) {
    throw new Error("전환하려는 계획을 찾을 수 없습니다. 로드맵을 새로고침한 뒤 다시 시도해주세요.");
  }
  const activity: StudentActivity = {
    ...input,
    id: crypto.randomUUID(),
    studentId,
    status: "completed",
  };
  const result = reconcileActivity(activity, workspace.roadmap);
  const log: ReconciliationLog = {
    ...result,
    id: crypto.randomUUID(),
    studentId,
    activityId: activity.id,
    roadmapId: workspace.roadmap.id,
  };
  // 계획에서 전환한 기록은 자동 추측보다 학생이 선택한 원래 계획의 학기에 연결한다.
  activity.roadmapNodeId = linkedPlan?.node_id ?? (result.matchType === "DIVERGE" ? null : result.nodeId);
  activity.planEventId = linkedPlan?.id ?? null;
  activity.linkedPlanTitle = linkedPlan?.title ?? null;

  const d1 = getD1();
  const statements = [
    d1.prepare(
      `INSERT INTO student_activities_v2 (
        id, student_id, activity_type, subject, title, summary, reflection, concepts_json,
        outputs_json, status, roadmap_node_id, plan_event_id, linked_plan_title, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      activity.id,
      studentId,
      activity.activityType,
      activity.subject,
      activity.title,
      activity.summary,
      activity.reflection,
      JSON.stringify(activity.concepts),
      JSON.stringify(activity.outputs),
      activity.status,
      activity.roadmapNodeId ?? null,
      activity.planEventId ?? null,
      activity.linkedPlanTitle ?? null,
      activity.completedAt,
    ),
    d1.prepare(
      `INSERT INTO reconciliation_logs (
        id, student_id, activity_id, roadmap_id, node_id, match_type,
        rationale, action, confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      log.id,
      studentId,
      activity.id,
      workspace.roadmap.id,
      log.nodeId ?? null,
      log.matchType,
      log.rationale,
      log.action,
      log.confidence,
    ),
  ];

  // 하나의 탐구 주제는 여러 실제 활동으로 이어질 수 있으므로, 연결 후에도 주제 제안은 유지한다.
  for (const attachment of attachments) statements.push(d1.prepare("INSERT INTO activity_attachments (id, activity_id, student_id, file_name, content_type, size_bytes, storage_key, extracted_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), activity.id, studentId, attachment.fileName, attachment.contentType, attachment.sizeBytes, attachment.storageKey, attachment.extractedText ?? ""));
  if (review) statements.push(d1.prepare("INSERT INTO activity_reviews (activity_id, student_id, plan_event_id, alignment, result_json) VALUES (?, ?, ?, ?, ?)").bind(activity.id, studentId, linkedPlan?.id ?? null, review.alignment, JSON.stringify({ ...review, activityId: activity.id, planEventId: linkedPlan?.id ?? null })));

  if ((result.matchType === "MATCH" || result.matchType === "PARTIAL_MATCH") && result.nodeId) {
    const current = workspace.roadmap.nodes.find((node) => node.id === result.nodeId);
    const next = current
      ? workspace.roadmap.nodes.find((node) => node.orderIndex === current.orderIndex + 1)
      : undefined;
    statements.push(
      d1.prepare(
        "UPDATE roadmap_nodes SET status = 'completed', instantiated_activity_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(activity.id, result.nodeId),
    );
    if (next) {
      statements.push(
        d1.prepare("UPDATE roadmap_nodes SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(next.id),
      );
    }
  }
  await d1.batch(statements);
  return { workspace: await loadWorkspace(studentId), reconciliation: log };
}

export async function runAssignmentAnalysis(studentId: string, task: string) {
  const workspace = await loadWorkspace(studentId);
  const analysisInput = {
    profile: workspace.profile,
    roadmap: workspace.roadmap,
    activities: workspace.activities,
    reconciliations: workspace.reconciliations,
    dna: workspace.dna,
    nextMission: workspace.nextMission,
  };
  const deepSeekAnalysis = await analyzeAssignmentWithDeepSeek(task, analysisInput);
  if (isDeepSeekConfigured() && !deepSeekAnalysis) {
    throw new Error("DeepSeek 분석에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
  const analysis = deepSeekAnalysis ?? {
    ...analyzeAssignment(task, analysisInput),
    provider: "mock" as const,
  };
  const d1 = getD1();
  await d1
    .prepare("INSERT INTO assignment_analyses (id, student_id, task, result_json) VALUES (?, ?, ?, ?)")
    .bind(analysis.id, studentId, task, JSON.stringify(analysis))
    .run();
  return analysis;
}

export async function updateRoadmapNode(
  studentId: string,
  nodeId: string,
  input: { title: string; objective: string },
) {
  await ensureWorkspaceSchema();
  const d1 = getD1();
  await d1
    .prepare(
      "UPDATE roadmap_nodes SET title = ?, objective = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND student_id = ?",
    )
    .bind(input.title, input.objective, nodeId, studentId)
    .run();
  return loadWorkspace(studentId);
}

export async function regenerateRoadmap(studentId: string) {
  const workspace = await loadWorkspace(studentId);
  const deepSeekRoadmap = await generateRoadmapWithDeepSeek(workspace.profile, { studentId });
  if (isDeepSeekConfigured() && !deepSeekRoadmap) {
    throw new Error("DeepSeek 로드맵 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
  const newRoadmap = deepSeekRoadmap ?? generateRoadmap(workspace.profile, { studentId });
  newRoadmap.version = workspace.roadmap.version + 1;
  newRoadmap.status = "active";
  const d1 = getD1();
  const statements = [
    d1.prepare("UPDATE roadmaps SET status = 'superseded' WHERE id = ?").bind(workspace.roadmap.id),
    d1.prepare(
      "INSERT INTO roadmaps (id, student_id, version, career_track, template_id, status) VALUES (?, ?, ?, ?, ?, 'active')",
    ).bind(newRoadmap.id, studentId, newRoadmap.version, newRoadmap.careerTrack, newRoadmap.templateId),
    ...newRoadmap.nodes.map((node) =>
      d1.prepare(
        `INSERT INTO roadmap_nodes (
          id, roadmap_id, student_id, order_index, grade, semester, narrative_stage,
          title, objective, candidate_subjects_json, competency_goals_json, status,
          instantiated_activity_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        node.id,
        newRoadmap.id,
        studentId,
        node.orderIndex,
        node.grade,
        node.semester,
        node.narrativeStage,
        node.title,
        node.objective,
        JSON.stringify(node.candidateSubjects),
        JSON.stringify(node.competencyGoals),
        node.status,
        null,
      ),
    ),
    ...newRoadmap.nodes.flatMap((node) => (node.planEvents ?? []).map((event) =>
      d1.prepare(
        `INSERT INTO roadmap_plan_events (
          id, roadmap_id, node_id, student_id, month_day, category, subject, priority, title, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        event.id,
        newRoadmap.id,
        node.id,
        studentId,
        event.monthDay,
        event.category,
        event.subject,
        event.priority,
        event.title,
        event.description,
      ),
    )),
  ];
  await d1.batch(statements);
  return loadWorkspace(studentId);
}

export async function updateProfile(studentId: string, profile: ProfileInput) {
  await ensureWorkspaceSchema();
  const d1 = getD1();
  await d1
    .prepare(
      `UPDATE student_workspaces SET
        name = ?, grade = ?, semester = ?, target_career = ?,
        target_majors_json = ?, interests_json = ?, motivation_trigger = ?, career_resolution = ?, current_engagement_json = ?, preferred_subjects_json = ?,
        strengths_json = ?, gaps_json = ?, constraints_json = ?, output_preference = ?, collaboration_style = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    )
    .bind(
      profile.name,
      profile.grade,
      profile.semester,
      profile.targetCareer,
      JSON.stringify(profile.targetMajors),
      JSON.stringify(profile.interests),
      profile.motivationTrigger,
      profile.careerResolution,
      JSON.stringify(profile.currentEngagement),
      JSON.stringify(profile.preferredSubjects),
      JSON.stringify(profile.strengths),
      JSON.stringify(profile.gaps),
      JSON.stringify(profile.constraints),
      profile.outputPreference,
      profile.collaborationStyle,
      studentId,
    )
    .run();
  return loadWorkspace(studentId);
}

export async function saveRecommendationFeedback(input: {
  studentId: string;
  analysisId: string;
  recommendationId: string;
  action: "saved" | "rejected";
  reason?: string;
}) {
  await ensureWorkspaceSchema();
  const d1 = getD1();
  await d1
    .prepare(
      "INSERT INTO recommendation_feedback_v2 (id, student_id, analysis_id, recommendation_id, action, reason) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      input.studentId,
      input.analysisId,
      input.recommendationId,
      input.action,
      input.reason?.trim() || null,
    )
    .run();
  return { ok: true };
}

export async function recordRoadmapMiss(studentId: string, decision: "carry" | "skip") {
  const workspace = await loadWorkspace(studentId);
  const active = workspace.roadmap.nodes.find((node) => node.status === "active");
  if (!active) throw new Error("점검할 활성 로드맵 노드가 없습니다.");
  const checkpointId = `checkpoint-${crypto.randomUUID()}`;
  const logId = crypto.randomUUID();
  const d1 = getD1();
  const rationale = `학기 체크포인트 시점까지 ‘${active.title}’에 해당하는 완료 활동이 확인되지 않았습니다.`;
  const action = decision === "carry" ? "활성 노드를 유지하고 다음 체크포인트로 이월" : "현재 노드를 건너뛰고 다음 노드 활성화";
  const statements = [
    d1.prepare(
      `INSERT INTO reconciliation_logs (
        id, student_id, activity_id, roadmap_id, node_id, match_type,
        rationale, action, confidence
      ) VALUES (?, ?, ?, ?, ?, 'MISS', ?, ?, 100)`,
    ).bind(logId, studentId, checkpointId, workspace.roadmap.id, active.id, rationale, action),
  ];
  if (decision === "skip") {
    const next = workspace.roadmap.nodes.find((node) => node.orderIndex === active.orderIndex + 1);
    statements.push(
      d1.prepare("UPDATE roadmap_nodes SET status = 'skipped', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(active.id),
    );
    if (next) {
      statements.push(
        d1.prepare("UPDATE roadmap_nodes SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(next.id),
      );
    }
  }
  await d1.batch(statements);
  return loadWorkspace(studentId);
}
