import type { StudentActivity } from "../../../lib/product-harness";
import { addActivity } from "../../../lib/workspace-store";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      studentId?: string;
      activity?: Omit<StudentActivity, "id" | "studentId" | "status">;
    };
    if (!payload.studentId || !payload.activity?.title?.trim() || !payload.activity.subject?.trim()) {
      return Response.json({ error: "학생, 과목, 활동 제목이 필요합니다." }, { status: 400 });
    }
    const result = await addActivity(payload.studentId, payload.activity);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "활동을 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}
