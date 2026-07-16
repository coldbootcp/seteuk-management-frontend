import { loadWorkspace } from "../../../lib/workspace-store";

export async function GET(request: Request) {
  try {
    const studentId = new URL(request.url).searchParams.get("studentId")?.trim();
    if (!studentId) {
      return Response.json({ error: "studentId가 필요합니다." }, { status: 400 });
    }
    return Response.json({ workspace: await loadWorkspace(studentId) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "학생 작업공간을 불러오지 못했습니다." },
      { status: 404 },
    );
  }
}
