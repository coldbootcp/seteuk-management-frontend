import { runAssignmentAnalysis } from "../../../lib/workspace-store";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { studentId?: string; task?: string };
    const task = payload.task?.trim() ?? "";
    if (!payload.studentId || !task) {
      return Response.json({ error: "학생과 수행평가 안내문이 필요합니다." }, { status: 400 });
    }
    return Response.json({ analysis: await runAssignmentAnalysis(payload.studentId, task) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "수행평가를 분석하지 못했습니다." },
      { status: 500 },
    );
  }
}
