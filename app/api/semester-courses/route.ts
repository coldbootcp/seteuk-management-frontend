import { addSemesterCourse, deleteSemesterCourse } from "../../../lib/workspace-store";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { studentId?: string; roadmapNodeId?: string; subject?: string };
    if (!body.studentId || !body.roadmapNodeId || !body.subject) return Response.json({ error: "학생, 학기, 과목 정보가 필요합니다." }, { status: 400 });
    return Response.json({ workspace: await addSemesterCourse(body.studentId, body.roadmapNodeId, body.subject) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "과목을 추가하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { studentId?: string; courseId?: string };
    if (!body.studentId || !body.courseId) return Response.json({ error: "학생과 과목 정보가 필요합니다." }, { status: 400 });
    return Response.json({ workspace: await deleteSemesterCourse(body.studentId, body.courseId) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "과목을 삭제하지 못했습니다." }, { status: 500 });
  }
}
