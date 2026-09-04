"use client";

/**
 * 화면과 백엔드 사이의 어댑터.
 *
 * 화면은 `{ workspace }` 하나를 받아 통째로 다시 그리는 방식으로 짜여 있고, 백엔드는
 * 자원별로 엔드포인트가 나뉘어 있다. 그 사이를 여기서 메운다 — UI 3,000줄을 다시 쓰는
 * 대신, 화면이 부르던 경로를 백엔드 호출로 옮기고 결과를 workspace 모양으로 조립한다.
 *
 * 도메인 판단은 여기 없다. 무엇을 저장할지·무엇을 제안할지는 전부 백엔드가 정하고,
 * 이 파일은 모양만 바꾼다.
 */

import { api } from "./api-client";
import type {
  ActivityAttachment,
  DnaDiagnosis,
  ProductWorkspace,
  ProfileInput,
  ReconciliationLog,
  Roadmap,
  RoadmapNode,
  SchoolRecordCourseRecord,
  StudentActivity,
  StudentCourseGrade,
  StudentSemesterCourse,
  StudentWorkspaceProfile,
} from "./product-harness";

type Json = Record<string, unknown>;

/** 방금 분석한 생기부의 업로드 id. 검토 → 반영 사이를 잇는다. */
let lastUploadId: string | null = null;

const EMPTY_DNA: DnaDiagnosis = {
  facts: [],
  interpretations: [],
  strengths: [],
  gaps: [],
  narrative: "",
  riskFlags: [],
};

// --- 백엔드 모양 → 화면 모양 -------------------------------------------------

function toProfile(raw: Json, userId: string): StudentWorkspaceProfile {
  const careerGoal = (raw.career_goal ?? {}) as Json;
  const specificity = (raw.career_specificity ?? {}) as Json;
  return {
    id: userId,
    name: (raw.name as string) ?? "",
    grade: (raw.grade as number) ?? 1,
    semester: (raw.semester as number) ?? 1,
    targetCareer: (careerGoal.goal as string) ?? "",
    targetMajors: raw.target_department ? [raw.target_department as string] : [],
    interests: (raw.interest_keywords as string[]) ?? [],
    motivationTrigger: (careerGoal.note as string) ?? "",
    careerResolution: (specificity.level as string) ?? "",
    currentEngagement: (specificity.curious_topics as string[]) ?? [],
    preferredSubjects: (specificity.known_concepts as string[]) ?? [],
    strengths: raw.self_assessed_strengths ? [raw.self_assessed_strengths as string] : [],
    gaps: raw.self_assessed_weaknesses ? [raw.self_assessed_weaknesses as string] : [],
    constraints: raw.roadmap_constraints ? [raw.roadmap_constraints as string] : [],
    outputPreference: ((raw.preferred_output_types as string[]) ?? []).join(", "),
    collaborationStyle: ((raw.activity_channels as string[]) ?? []).join(", "),
  };
}

function toRoadmap(raw: Json | null, studentId: string): Roadmap {
  if (!raw) {
    return {
      id: "",
      studentId,
      version: 0,
      careerTrack: "",
      templateId: "",
      status: "draft",
      nodes: [],
    };
  }
  return {
    id: raw.id as string,
    studentId,
    version: raw.version as number,
    careerTrack: (raw.career_track as string) ?? "",
    templateId: (raw.template_id as string) ?? "",
    status: raw.status as Roadmap["status"],
    nodes: ((raw.nodes as Json[]) ?? []).map(
      (node): RoadmapNode => ({
        id: node.id as string,
        roadmapId: raw.id as string,
        studentId,
        orderIndex: node.order_index as number,
        grade: node.grade as number,
        semester: node.semester as number,
        narrativeStage: node.narrative_stage as string,
        title: node.title as string,
        objective: node.objective as string,
        candidateSubjects: (node.candidate_subjects as string[]) ?? [],
        competencyGoals: (node.competency_goals as string[]) ?? [],
        status: node.status as RoadmapNode["status"],
        isCurrent: (node.is_current as boolean) ?? false,
        instantiatedActivityId: (node.instantiated_activity_id as string) ?? null,
        planEvents: ((node.plan_events as Json[]) ?? []).map((event) => ({
          id: event.id as string,
          monthDay: event.month_day as string,
          category: (event.category as "활동") ?? "활동",
          subject: (event.subject as string) ?? "",
          priority: (event.priority as "core" | "optional") ?? "core",
          title: event.title as string,
          description: (event.description as string) ?? "",
        })),
      }),
    ),
  };
}

/** 학년-학기로 로드맵 마디를 찾는 함수. 기록이 일어난 학기의 마디에 놓기 위한 것. */
type NodeLocator = (grade: number, semester: number | null) => string | null;

function nodeLocator(nodes: RoadmapNode[]): NodeLocator {
  return (grade, semester) => {
    const exact = nodes.find((n) => n.grade === grade && n.semester === semester);
    if (exact) return exact.id;
    // 학기를 모르는 기록(생기부 수상·봉사 등)은 그 학년의 첫 학기 마디에 둔다.
    return nodes.find((n) => n.grade === grade)?.id ?? null;
  };
}

/**
 * 화면의 흐름 맵은 기록을 학기 마디에 나눠 붙인다. 여기서 마디를 정해 주지 않으면
 * 전부 "현재 마디"로 떨어져, 3년치 기록이 한 학기에 쌓인 것처럼 보인다.
 */
function toActivity(raw: Json, studentId: string, locate: NodeLocator): StudentActivity {
  const grade = raw.grade as number;
  const semester = (raw.semester as number) ?? null;
  return {
    id: raw.id as string,
    studentId,
    activityType: (raw.activity_type as string) === "reading_linked" ? "독서" : "활동",
    subject: (raw.subject as string) ?? "",
    title: raw.activity_name as string,
    summary: (raw.description as string) ?? "",
    reflection: (raw.reflection as string) ?? "",
    concepts: (raw.keywords as string[]) ?? [],
    outputs: [],
    status: "completed",
    roadmapNodeId: locate(grade, semester),
    planEventId: (raw.source_plan_event_id as string) ?? null,
    linkedPlanTitle: null,
    // 활동 시점의 정본은 grade/semester다. performed_on은 학생이 직접 입력했을
    // 때만 있고, 생기부에서 온 행은 비어 있다 — 그 자리에 DB 저장 시각을 넣으면
    // 1학년 활동이 올해 일어난 것처럼 보인다.
    completedAt: (raw.performed_on as string) ?? "",
    periodLabel: `${grade}학년${semester ? ` ${semester}학기` : ""}`,
    createdAt: raw.created_at as string,
  };
}

/**
 * 수상은 학년-학기를 백엔드가 파싱 시점에 채운다(참가대상 + 수상연월일). 예전에는
 * 여기서 날짜로 추정했는데, 오늘 날짜를 기준점으로 삼는 바람에 몇 해 전 생기부의
 * 수상이 전부 학년 범위 밖으로 떨어졌다. 판정은 문서를 읽은 쪽이 해야 한다.
 */

/** 백엔드 진단의 SWOT을 화면의 Student DNA 모양으로 옮긴다. */
function toDna(raw: Json | null): DnaDiagnosis {
  if (!raw || raw.status !== "done") return EMPTY_DNA;
  const threads = (raw.career_thread as Json[]) ?? [];
  return {
    facts: threads.flatMap((thread) =>
      ((thread.entries as Json[]) ?? [])
        .filter((entry) => entry.type === "completed")
        .map((entry) => `${entry.grade}-${entry.semester ?? "·"} ${entry.theme}`),
    ),
    interpretations: threads.map((thread) => ({
      statement: `${thread.title}: ${thread.summary}`,
      evidenceIds: [],
      confidence: 80,
      verified: true,
    })),
    strengths: (raw.strengths as string[]) ?? [],
    gaps: (raw.weaknesses as string[]) ?? [],
    narrative: (raw.headline_comment as string) ?? "",
    riskFlags: (raw.threats as string[]) ?? [],
  };
}

// --- workspace 조립 ----------------------------------------------------------

/** 진단·로드맵이 아직 없을 수 있다. 없는 것은 404지 오류가 아니므로 비워서 돌려준다. */
async function optional<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch {
    return null;
  }
}

/**
 * 활동의 학년-학기를 정한다. 학생이 고른 제안이 걸린 마디가 1순위 — 지난 학기 제안을
 * 이제 실행하는 일이 흔해서, 저장 시점으로 못박으면 시점이 틀어진다.
 *
 * 제안을 고르지 않았으면 프로필의 현재 학기를 쓴다. 로드맵의 활성 마디를 쓰면 안 된다:
 * 활성 마디는 이번 학기 목표를 달성하는 순간 다음 학기로 넘어가기 때문에, 그 뒤로
 * 저장하는 기록이 아직 오지도 않은 학기에 찍힌다.
 */
async function resolveActivityPeriod(
  nodeId: string | undefined,
): Promise<{ grade: number; semester: number | null }> {
  if (nodeId) {
    const roadmap = await optional(api<Json>("/roadmaps/active"));
    const node = ((roadmap?.nodes as Json[]) ?? []).find((n) => n.id === nodeId);
    if (node) return { grade: node.grade as number, semester: (node.semester as number) ?? null };
  }
  const profile = await api<Json>("/profile/me");
  return { grade: (profile.grade as number) ?? 1, semester: (profile.semester as number) ?? null };
}

/**
 * 온보딩 전에는 프로필이 200을 주되 값이 전부 비어 있다. 그 상태로 작업공간을
 * 조립하면 "○○의 고교 3개년"처럼 조사만 남은 화면이 뜨므로, 여기서 걸러 null을
 * 돌려주고 화면이 온보딩을 보여주게 한다.
 */
export async function loadWorkspace(): Promise<ProductWorkspace | null> {
  const profileRaw = await api<Json>("/profile/me");
  if (!profileRaw.name || profileRaw.grade == null) return null;
  const [roadmapRaw, diagnosisRaw, activityList, reconciliations] = await Promise.all([
    optional(api<Json>("/roadmaps/active")),
    optional(api<Json>("/diagnosis/latest")),
    api<{ items: Json[] }>("/activities?limit=200"),
    optional(api<Json[]>("/roadmaps/reconciliations/history")),
  ]);
  const reviews = await optional(api<Json[]>("/activities/reviews/history"));

  // 사용자 id를 따로 주는 엔드포인트가 없어 로드맵/활동에서 얻는다. 화면은 이 값을
  // 키로만 쓰므로 없으면 빈 문자열이어도 동작한다.
  const studentId = (roadmapRaw?.id as string) ?? "me";
  const roadmap = toRoadmap(roadmapRaw, studentId);

  const semesterCourses: StudentSemesterCourse[] = [];
  const courseGrades: StudentCourseGrade[] = [];
  // 생기부에서 들어온 과목. source_upload_id가 채워진 행이 곧 "업로드에서 온 것"이라,
  // 화면의 '생기부 연결됨' 판정이 이 목록 하나로 정직해진다.
  const schoolRecordCourses: SchoolRecordCourseRecord[] = [];
  const courseLists = await Promise.all(
    roadmap.nodes.map((node) =>
      optional(api<Json[]>(`/roadmaps/nodes/${node.id}/courses`)).then((rows) => ({
        node,
        rows: rows ?? [],
      })),
    ),
  );
  for (const { node, rows } of courseLists) {
    for (const row of rows) {
      semesterCourses.push({
        id: row.id as string,
        studentId,
        roadmapNodeId: node.id,
        grade: row.grade as number,
        semester: row.semester as number,
        subject: row.subject as string,
      });
      if (row.source_upload_id) {
        schoolRecordCourses.push({
          id: row.id as string,
          studentId,
          importId: row.source_upload_id as string,
          grade: row.grade as number,
          semester: row.semester as number,
          subject: row.subject as string,
        });
      }
      // 성적은 같은 행에 들어 있다(D-3) — 과목과 성적을 두 테이블로 나누지 않았다.
      if (row.rank != null || row.raw_score != null || row.note) {
        courseGrades.push({
          id: row.id as string,
          studentId,
          semesterCourseId: row.id as string,
          rank: row.rank != null ? Number.parseInt(String(row.rank), 10) || null : null,
          score: (row.raw_score as number) ?? null,
          note: (row.note as string) ?? "",
        });
      }
    }
  }

  // 화면은 상장·봉사·독서를 활동과 같은 목록에서 갈래로만 구분한다. 백엔드는 이
  // 셋을 각자의 테이블에 두므로 여기서 하나로 합친다 — 합치지 않으면 화면의
  // 상장/봉사/독서 필터가 언제나 0건이 된다.
  const locate = nodeLocator(roadmap.nodes);

  const [awardRows, volunteerRows, readingRows] = await Promise.all([
    optional(api<{ items: Json[] }>("/awards?limit=200")),
    optional(api<{ items: Json[] }>("/volunteer-records?limit=200")),
    optional(api<{ items: Json[] }>("/reading-activities?limit=200")),
  ]);

  function domainActivity(
    raw: Json,
    kind: string,
    title: string,
    summary: string,
    grade: number | null,
    semester: number | null,
    completedAt: string,
  ): StudentActivity {
    return {
      id: raw.id as string,
      studentId,
      activityType: kind,
      subject: (raw.subject as string) ?? "",
      title,
      summary,
      reflection: "",
      concepts: [],
      outputs: [],
      status: "completed",
      roadmapNodeId: grade == null ? null : locate(grade, semester),
      planEventId: null,
      linkedPlanTitle: null,
      completedAt,
      periodLabel: grade == null ? "" : `${grade}학년${semester ? ` ${semester}학기` : ""}`,
      createdAt: raw.created_at as string,
    };
  }

  const awards = (awardRows?.items ?? []).map((raw) => {
    const rank = raw.rank ? ` (${raw.rank as string})` : "";
    return domainActivity(
      raw,
      "상장",
      `${raw.name as string}${rank}`,
      (raw.raw_date as string) ?? "",
      (raw.grade as number) ?? null,
      (raw.semester as number) ?? null,
      (raw.date as string) ?? "",
    );
  });

  const volunteers = (volunteerRows?.items ?? []).map((raw) => {
    const grade = (raw.grade as number) ?? null;
    const hours = raw.hours ? ` · ${raw.hours as number}시간` : "";
    return domainActivity(
      raw,
      "봉사",
      `${(raw.place as string) ?? "봉사활동"}${hours}`,
      (raw.content as string) ?? "",
      grade,
      // 봉사는 생기부가 학년까지만 준다 — 학기를 날짜로 지어내지 않는다.
      null,
      (raw.date as string) ?? "",
    );
  });

  const readings = (readingRows?.items ?? []).map((raw) =>
    domainActivity(
      raw,
      "독서",
      `${raw.title as string}${raw.author ? ` — ${raw.author as string}` : ""}`,
      "",
      (raw.grade as number) ?? null,
      (raw.semester as number) ?? null,
      "",
    ),
  );

  // 생기부에서 온 활동은 날짜가 없어 completedAt 정렬만으로는 순서가 무너진다.
  // 시점의 정본인 학년-학기로 먼저 정렬해서 넘긴다.
  const activities = [
    ...(activityList.items ?? [])
      .slice()
      .sort(
        (a, b) =>
          ((a.grade as number) - (b.grade as number)) ||
          (((a.semester as number) ?? 0) - ((b.semester as number) ?? 0)) ||
          String(a.created_at).localeCompare(String(b.created_at)),
      )
      .map((raw) => toActivity(raw, studentId, locate)),
    ...awards,
    ...volunteers,
    ...readings,
  ];
  const attachmentLists = await Promise.all(
    activities.map((activity) =>
      optional(api<Json[]>(`/activities/${activity.id}/attachments`)).then((rows) =>
        (rows ?? []).map(
          (row): ActivityAttachment => ({
            id: row.id as string,
            activityId: activity.id,
            fileName: row.file_name as string,
            contentType: row.content_type as string,
            sizeBytes: row.size_bytes as number,
            storageKey: row.id as string,
          }),
        ),
      ),
    ),
  );

  const activeNode = roadmap.nodes.find((node) => node.isCurrent) ?? roadmap.nodes.find((node) => node.status === "active");
  return {
    profile: toProfile(profileRaw, studentId),
    roadmap,
    activities,
    attachments: attachmentLists.flat(),
    activityReviews: ((reviews ?? []) as Json[]).map((raw) => ({
      activityId: raw.activity_id as string,
      planEventId: null,
      alignment: raw.alignment as "aligned" | "partial" | "separate",
      summary: raw.summary as string,
      evidence: (raw.evidence as string[]) ?? [],
      gaps: (raw.gaps as string[]) ?? [],
      nextSteps: (raw.next_steps as string[]) ?? [],
      // 백엔드가 어느 모델로 썼는지 행에 기록한다 — 여기서 박아 넣으면 화면이
      // 사실과 다른 것을 말하게 된다.
      provider: ((raw.provider as string) ?? "deepseek") as "deepseek" | "rule",
    })),
    semesterCourses,
    courseGrades,
    schoolRecordCourses,
    reconciliations: ((reconciliations ?? []) as Json[]).map(
      (raw): ReconciliationLog => ({
        id: raw.id as string,
        studentId,
        activityId: (raw.activity_id as string) ?? "",
        roadmapId: raw.roadmap_id as string,
        nodeId: (raw.node_id as string) ?? null,
        matchType: raw.match_type as ReconciliationLog["matchType"],
        rationale: raw.rationale as string,
        action: raw.action as string,
        confidence: raw.confidence as number,
        createdAt: raw.created_at as string,
      }),
    ),
    dna: toDna(diagnosisRaw),
    nextMission: {
      title: activeNode?.title ?? "로드맵을 먼저 만들어주세요",
      whyNow: activeNode?.objective ?? "",
      period: activeNode ? `${activeNode.grade}학년 ${activeNode.semester}학기` : "",
      output: activeNode?.competencyGoals.join(" · ") ?? "",
      roadmapNodeId: activeNode?.id,
    },
    latestAnalysis: null,
  };
}

/**
 * 검토 화면에서 고른 항목을 백엔드의 index 선택으로 되돌린다.
 *
 * 파싱 결과를 화면용 초안으로 빚을 때 id에 `json-{섹션}-{index}`가 박히므로, 그
 * index가 곧 백엔드 결과 배열의 위치다. 학생이 체크를 푼 것은 빠진다.
 */
function toImportSelection(entries: { id: string; selected: boolean }[]): Json {
  const sections: Record<string, string> = {
    read: "reading_activities",
    grade: "academic_performance",
    award: "awards",
    volunteer: "volunteer_records",
    activity: "activities",
  };
  const picked: Record<string, number[]> = {};
  for (const section of Object.values(sections)) picked[section] = [];

  for (const entry of entries) {
    if (!entry.selected) continue;
    const match = /^json-(read|grade|award|volunteer|activity)-(\d+)-/.exec(entry.id);
    if (!match) continue;
    picked[sections[match[1]]].push(Number(match[2]));
  }
  // 출결은 검토 화면에 나오지 않으므로 지정하지 않는다 — 생략하면 전체가 들어간다.
  return picked;
}

// --- 화면이 부르던 경로 → 백엔드 -------------------------------------------

function profileToBackend(profile: ProfileInput): Json {
  return {
    name: profile.name,
    grade: profile.grade,
    semester: profile.semester,
    career_goal: { goal: profile.targetCareer, note: profile.motivationTrigger || null },
    target_department: profile.targetMajors[0] ?? "",
    interest_keywords: profile.interests,
    career_specificity: {
      level: profile.careerResolution === "확실하다" ? "specific" : "broad",
      known_concepts: profile.preferredSubjects,
      curious_topics: profile.currentEngagement,
    },
    preferred_output_types: profile.outputPreference ? [profile.outputPreference] : [],
    activity_channels: profile.collaborationStyle ? [profile.collaborationStyle] : [],
    roadmap_constraints: profile.constraints.join(", ") || null,
    self_assessed_strengths: profile.strengths.join(", "),
    self_assessed_weaknesses: profile.gaps.join(", "),
  };
}

/**
 * 화면이 쓰던 경로를 백엔드 호출로 옮긴다. 대부분은 "바꾸고 나서 workspace를 다시
 * 조립해 돌려준다" — 화면이 그 모양을 기대하도록 짜여 있기 때문이다.
 */
export async function handleLegacyRoute(url: string, init?: RequestInit): Promise<unknown> {
  const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {};
  const path = url.split("?")[0];

  switch (true) {
    case path === "/api/onboarding": {
      await api("/profile", { method: "POST", body: profileToBackend(body.profile ?? body) });
      return { workspace: await loadWorkspace() };
    }
    case path === "/api/onboarding/suggest": {
      const result = await api<{ majors: string[]; keywords: string[] }>("/profile/suggest", {
        method: "POST",
        body: { career_goal: body.targetCareer ?? body.career_goal ?? "" },
      });
      return { ...result, provider: "deepseek" };
    }
    case path === "/api/onboarding/clarify": {
      const form = body.form ?? {};
      // answers를 빼면 학생이 방금 답한 것을 백엔드가 모른 채 같은 질문을 다시 내서
      // 온보딩이 끝나지 않는다.
      const answers = (body.answers ?? []) as { id?: string; key?: string; question?: string; answer?: unknown }[];
      const result = await api<{ questions: Json[]; complete: boolean }>("/profile/clarify", {
        method: "POST",
        body: {
          name: form.name || null,
          grade: form.grade ? Number(form.grade) : null,
          semester: form.semester ? Number(form.semester) : null,
          career_goal: form.targetCareer || null,
          target_department: (form.targetMajors ?? [])[0] || null,
          interest_keywords: form.interests ?? [],
          answers: answers
            .filter((entry) => entry.answer)
            .map((entry) => ({
              key: entry.key ?? entry.id ?? "",
              question: entry.question ?? "",
              answer: Array.isArray(entry.answer) ? entry.answer.join(", ") : String(entry.answer),
            })),
        },
      });
      // 화면은 질문을 `id`로 구분해 답을 쌓는데 백엔드는 `key`를 준다. 옮겨 주지
      // 않으면 모든 답의 id가 undefined가 되어 서로를 덮어써 한 개만 남고, 그러면
      // 확인 질문이 영영 끝나지 않는다.
      return {
        ...result,
        questions: (result.questions ?? []).map((question) => ({
          ...question,
          id: question.key,
          selectionMode: question.selection_mode,
        })),
      };
    }
    case path === "/api/onboarding/preview": {
      // 미리보기는 draft 로드맵이다 — 확정 전이라 화면에서 고칠 수 있고, 다시 눌러도
      // 버전이 오르지 않는다.
      // 프로필은 아직 저장 전이라 백엔드가 학년을 모른다. 그대로 두면 기본값(1학년
      // 1학기)으로 현재 마디가 잡혀 2학년 학생이 1학년 로드맵을 미리보게 되므로,
      // 방금 입력받은 값을 함께 실어 보낸다.
      const input = body as ProfileInput;
      const roadmap = await api<Json>("/roadmaps", {
        method: "POST",
        body: {
          grade: input.grade,
          semester: input.semester,
          career_track: input.targetCareer || null,
          focus: input.interests?.join(", ") || null,
        },
      });
      // 화면이 preview.profile.name을 그대로 읽으므로 프로필도 함께 돌려줘야 한다.
      // 아직 저장 전이라 백엔드에는 없고, 요청에 실려 온 값이 곧 그 프로필이다.
      return {
        profile: { ...input, id: roadmap.id as string },
        roadmap: toRoadmap(roadmap, roadmap.id as string),
        dna: EMPTY_DNA,
      };
    }
    case path === "/api/profile": {
      if ((init?.method ?? "GET") === "GET") return { workspace: await loadWorkspace() };
      await api("/profile", { method: "POST", body: profileToBackend(body.profile ?? body) });
      return { workspace: await loadWorkspace() };
    }
    case path === "/api/workspace":
      return { workspace: await loadWorkspace() };

    case path === "/api/roadmaps/regenerate": {
      const created = await api<Json>("/roadmaps", { method: "POST", body: {} });
      await api(`/roadmaps/${created.id}/confirm`, { method: "POST" });
      return { workspace: await loadWorkspace() };
    }
    case path === "/api/roadmaps/nodes": {
      await api(`/roadmaps/nodes/${body.nodeId}`, {
        method: "PATCH",
        body: { title: body.title, objective: body.objective, status: body.status },
      });
      return { workspace: await loadWorkspace() };
    }
    case path === "/api/roadmaps/summarize-node": {
      await api(`/roadmaps/nodes/${body.nodeId}/summarize`, { method: "POST" });
      return { workspace: await loadWorkspace() };
    }
    case path === "/api/roadmaps/checkpoint": {
      await api("/roadmaps/checkpoint", { method: "POST" });
      return { workspace: await loadWorkspace() };
    }

    case path === "/api/activities": {
      // 활동 저장 화면은 multipart로 온다 — 활동 본문 JSON과 첨부파일이 함께 실린다.
      const form = init?.body as FormData;
      const activity = JSON.parse(String(form.get("activity") ?? "{}"));

      // 학년·학기는 폼에 없다. 학생이 고른 제안이 걸린 마디에서 가져오고, 고르지
      // 않았으면 현재 학기로 둔다 — 여기서 1을 기본값으로 쓰면 2학년 학생이 저장한
      // 활동이 전부 1학년으로 남아 진단의 학기 리뷰가 통째로 어긋난다.
      const period = await resolveActivityPeriod(activity.roadmapNodeId as string | undefined);
      const kindLabel = String(activity.activityType ?? "");

      // 화면의 "유형"은 백엔드의 activity_type(보고서/발표/실험…)이 아니라 기록의
      // 갈래다. 상장·봉사·독서는 각자의 테이블이 정본이라 그쪽으로 보낸다 —
      // activities에만 넣으면 진단의 수상·봉사·독서 섹션이 이 기록을 영영 못 본다.
      if (kindLabel === "상장" || kindLabel === "봉사" || kindLabel === "독서") {
        const ENDPOINTS = { 상장: "/awards", 봉사: "/volunteer-records", 독서: "/reading-activities" };
        const bodies: Record<string, Json> = {
          상장: {
            name: activity.title,
            date: activity.completedAt || null,
            grade: period.grade,
            semester: period.semester,
          },
          봉사: {
            grade: period.grade,
            date: activity.completedAt || null,
            place: activity.title,
            content: activity.summary || null,
          },
          독서: {
            grade: period.grade,
            semester: period.semester,
            subject: activity.subject || null,
            title: activity.title,
          },
        };
        await api(ENDPOINTS[kindLabel], { method: "POST", body: bodies[kindLabel] });
        // 이 갈래들은 로드맵 마디와 대조하지 않는다 — 정합은 탐구 활동의 축이다.
        return { workspace: await loadWorkspace() };
      }

      const created = await api<Json>("/activities", {
        method: "POST",
        body: {
          grade: period.grade,
          semester: period.semester,
          activity_category: activity.activityCategory ?? "과목세부특기사항",
          subject: activity.subject || null,
          activity_name: activity.title,
          activity_type: "report",
          description: activity.summary || activity.title,
          reflection: activity.reflection || null,
          source_plan_event_id: activity.planEventId ?? null,
          keywords: activity.concepts ?? [],
          performed_on: activity.completedAt || null,
        },
      });
      const activityId = created.id as string;

      // 첨부파일은 활동이 생긴 뒤에 하나씩 붙인다.
      for (const file of form.getAll("files")) {
        if (!(file instanceof File) || file.size === 0) continue;
        const payload = new FormData();
        payload.append("file", file);
        await api(`/activities/${activityId}/attachments`, { method: "POST", form: payload });
      }

      // 저장 직후 이 활동이 로드맵의 어디에 해당하는지와, 무엇이 근거로 남았는지를
      // 함께 보여준다. 정합은 저장할 때 백엔드가 이미 판정했으므로 읽어 오기만 하고,
      // 검토는 여기서 한 번 돌린다.
      const logs = (await optional(api<Json[]>("/roadmaps/reconciliations/history"))) ?? [];
      const reconciliation = logs.find((log) => log.activity_id === activityId);
      await optional(api(`/activities/${activityId}/review`, { method: "POST" }));

      return {
        workspace: await loadWorkspace(),
        reconciliation: reconciliation
          ? {
              id: reconciliation.id,
              studentId: "",
              activityId,
              roadmapId: reconciliation.roadmap_id,
              nodeId: reconciliation.node_id ?? null,
              matchType: reconciliation.match_type,
              rationale: reconciliation.rationale,
              action: reconciliation.action,
              confidence: reconciliation.confidence,
            }
          : // 로드맵이 아직 없으면 판정이 없다. 화면이 이 값을 요구하므로 그때는
            // 분류 불가로 채워 보낸다.
            {
              id: "",
              studentId: "",
              activityId,
              roadmapId: "",
              nodeId: null,
              matchType: "UNCLASSIFIABLE",
              rationale: "아직 로드맵이 없어 활동을 독립 기록으로 저장했습니다.",
              action: "로드맵을 만들면 이 활동이 어디에 해당하는지 알려드립니다",
              confidence: 0,
            },
      };
    }
    case path.startsWith("/api/activity-files/"): {
      const attachmentId = path.split("/").pop()!;
      await api(`/activities/attachments/${attachmentId}`, { method: "DELETE" });
      return { workspace: await loadWorkspace() };
    }

    case path === "/api/semester-courses": {
      if ((init?.method ?? "POST") === "DELETE") {
        await api(`/academic-performance/${body.courseId}`, { method: "DELETE" });
      } else {
        await api("/academic-performance", {
          method: "POST",
          body: {
            grade: body.grade,
            semester: body.semester,
            category: body.category ?? body.subject,
            subject: body.subject,
            roadmap_node_id: body.roadmapNodeId,
          },
        });
      }
      return { workspace: await loadWorkspace() };
    }
    case path === "/api/course-grades": {
      await api(`/academic-performance/${body.semesterCourseId}`, {
        method: "PATCH",
        body: {
          rank: body.rank != null ? String(body.rank) : null,
          raw_score: body.score ?? null,
          note: body.note ?? null,
        },
      });
      return { workspace: await loadWorkspace() };
    }

    case path === "/api/school-record/parse": {
      const created = await api<{ upload_id: string }>("/seteuk/uploads", {
        method: "POST",
        form: init?.body as FormData,
      });
      // 검토를 마치고 반영할 때 이 id가 필요한데, 화면이 들고 다니는 파싱 결과에는
      // 담을 자리가 없다. 업로드는 한 번에 하나뿐이라 여기서 기억한다.
      lastUploadId = created.upload_id;
      return { task_id: created.upload_id };
    }
    case path.startsWith("/api/school-record/status/"): {
      const uploadId = path.split("/").pop()!;
      const status = await api<{ status: string }>(`/seteuk/uploads/${uploadId}`);
      if (status.status === "failed") return { status: "failed", error: "생기부 분석에 실패했습니다." };
      if (status.status !== "done") return { status: "processing" };
      return { status: "completed", result: await api(`/seteuk/uploads/${uploadId}/result`) };
    }
    case path === "/api/school-record/import": {
      const uploadId = body.uploadId ?? lastUploadId;
      if (!uploadId) throw new Error("먼저 생기부를 분석해주세요.");
      await api(`/seteuk/uploads/${uploadId}/import`, {
        method: "POST",
        body: toImportSelection(body.entries ?? []),
      });
      return { workspace: await loadWorkspace(), importedCount: (body.entries ?? []).filter((e: { selected: boolean }) => e.selected).length };
    }

    case path === "/api/recommendation-feedback": {
      await api(`/recommendations/${body.analysisId ?? body.recommendationId}/feedback`, {
        method: "POST",
        body: {
          option_index: body.optionIndex ?? 0,
          action: body.action,
          reason: body.reason ?? null,
        },
      });
      return { workspace: await loadWorkspace() };
    }

    default:
      throw new Error(`아직 백엔드에 연결되지 않은 경로입니다: ${path}`);
  }
}
