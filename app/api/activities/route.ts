import type { StudentActivity } from "../../../lib/product-harness";
import { addActivity, loadWorkspace } from "../../../lib/workspace-store";
import { uploadActivityFiles } from "../../../lib/activity-files";
import { reviewActivityWithDeepSeek } from "../../../lib/deepseek-provider";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const studentId = form.get("studentId");
    const rawActivity = form.get("activity");
    const payload = { studentId: typeof studentId === "string" ? studentId : undefined, activity: typeof rawActivity === "string" ? JSON.parse(rawActivity) as Omit<StudentActivity, "id" | "studentId" | "status"> : undefined };
    if (!payload.studentId || !payload.activity?.title?.trim() || !payload.activity.subject?.trim()) {
      return Response.json({ error: "학생, 과목, 활동 제목이 필요합니다." }, { status: 400 });
    }
    const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    const attachments = await uploadActivityFiles(payload.studentId, files);
    const workspace = await loadWorkspace(payload.studentId);
    const plan = payload.activity.planEventId ? workspace.roadmap.nodes.flatMap((node) => (node.planEvents ?? []).map((event) => ({ ...event, objective: node.objective }))).find((event) => event.id === payload.activity!.planEventId) : null;
    const attachmentText = attachments.map((item) => item.extractedText).filter(Boolean);
    const review = (await reviewActivityWithDeepSeek({ activity: payload.activity, plan, attachmentText }))
      ?? { activityId: "", alignment: plan ? "partial" as const : "separate" as const, summary: plan ? "선택한 계획과의 정합성은 저장된 활동 내용을 바탕으로 계속 검토할 수 있습니다." : "로드맵과 별개로 보관한 활동입니다.", evidence: attachmentText.length ? ["첨부 자료 텍스트를 함께 보관했습니다."] : ["학생이 직접 입력한 활동 기록"], gaps: attachmentText.length ? [] : ["발표자료나 탐구보고서를 첨부하면 활동 근거를 더 구체적으로 정리할 수 있습니다."], nextSteps: plan ? ["계획의 목표와 실제 결과가 어떻게 이어졌는지 활동 요약에 한 문장으로 보완하세요."] : [], provider: "rule" as const };
    const result = await addActivity(payload.studentId, payload.activity, attachments, review);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "활동을 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}
