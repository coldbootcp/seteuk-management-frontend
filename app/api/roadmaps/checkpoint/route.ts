import { recordRoadmapMiss } from "../../../../lib/workspace-store";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { studentId?: string; decision?: "carry" | "skip" };
    if (!payload.studentId || !payload.decision || !["carry", "skip"].includes(payload.decision)) {
      return Response.json({ error: "학생과 학기 점검 결정을 선택해주세요." }, { status: 400 });
    }
    return Response.json({ workspace: await recordRoadmapMiss(payload.studentId, payload.decision) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "학기 점검을 기록하지 못했습니다." },
      { status: 500 },
    );
  }
}
