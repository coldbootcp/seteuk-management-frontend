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

function toActivity(raw: Json, studentId: string): StudentActivity {
  return {
    id: raw.id as string,
    studentId,
    activityType: (raw.activity_type as string) ?? "other",
    subject: (raw.subject as string) ?? "",
    title: raw.activity_name as string,
    summary: (raw.description as string) ?? "",
    reflection: "",
    concepts: (raw.keywords as string[]) ?? [],
    outputs: [],
    status: "completed",
    roadmapNodeId: null,
    planEventId: null,
    linkedPlanTitle: null,
    // 활동 시점의 정본은 grade/semester다. performed_on은 학생이 직접 입력했을
    // 때만 있고, 생기부에서 온 행은 비어 있다 — 그 자리에 DB 저장 시각을 넣으면
    // 1학년 활동이 올해 일어난 것처럼 보인다.
    completedAt: (raw.performed_on as string) ?? "",
    periodLabel: `${raw.grade}학년${raw.semester ? ` ${raw.semester}학기` : ""}`,
    createdAt: raw.created_at as string,
  };
}

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

export async function loadWorkspace(): Promise<ProductWorkspace> {
  const profileRaw = await api<Json>("/profile/me");
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

  // 생기부에서 온 활동은 날짜가 없어 completedAt 정렬만으로는 순서가 무너진다.
  // 시점의 정본인 학년-학기로 먼저 정렬해서 넘긴다.
  const activities = (activityList.items ?? [])
    .slice()
    .sort(
      (a, b) =>
        ((a.grade as number) - (b.grade as number)) ||
        (((a.semester as number) ?? 0) - ((b.semester as number) ?? 0)) ||
        String(a.created_at).localeCompare(String(b.created_at)),
    )
    .map((raw) => toActivity(raw, studentId));
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

  const activeNode = roadmap.nodes.find((node) => node.status === "active");
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
      provider: "deepseek" as const,
    })),
    semesterCourses,
    courseGrades,
    schoolRecordCourses: [],
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
      return api("/profile/clarify", {
        method: "POST",
        body: {
          name: form.name || null,
          grade: form.grade ? Number(form.grade) : null,
          semester: form.semester ? Number(form.semester) : null,
          career_goal: form.targetCareer || null,
          target_department: (form.targetMajors ?? [])[0] || null,
          interest_keywords: form.interests ?? [],
        },
      });
    }
    case path === "/api/onboarding/preview": {
      // 미리보기는 draft 로드맵이다 — 확정 전이라 화면에서 고칠 수 있다.
      const roadmap = await api<Json>("/roadmaps", { method: "POST", body: {} });
      return { roadmap: toRoadmap(roadmap, roadmap.id as string), dna: EMPTY_DNA };
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
      await api("/activities", {
        method: "POST",
        body: {
          grade: body.grade ?? 1,
          semester: body.semester ?? null,
          activity_category: body.activityCategory ?? "과목세부특기사항",
          subject: body.subject || null,
          activity_name: body.title,
          activity_type: body.activityType ?? "other",
          description: body.summary ?? body.title,
          keywords: body.concepts ?? [],
        },
      });
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
