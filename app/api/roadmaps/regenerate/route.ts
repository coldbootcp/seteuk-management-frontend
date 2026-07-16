import { regenerateRoadmap } from "../../../../lib/workspace-store";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { studentId?: string };
    if (!payload.studentId) {
      return Response.json({ error: "학생 정보가 필요합니다." }, { status: 400 });
    }
    return Response.json({ workspace: await regenerateRoadmap(payload.studentId) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "로드맵을 다시 만들지 못했습니다." },
      { status: 500 },
    );
  }
}
