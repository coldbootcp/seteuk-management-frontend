import { saveCourseGrade } from "../../../lib/workspace-store";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { studentId?: string; semesterCourseId?: string; rank?: number | null; score?: number | null; note?: string };
    if (!body.studentId || !body.semesterCourseId) return Response.json({ error: "학생과 수강 과목 정보가 필요합니다." }, { status: 400 });
    return Response.json({ workspace: await saveCourseGrade(body.studentId, body.semesterCourseId, body) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "성적을 저장하지 못했습니다." }, { status: 500 });
  }
}
