import { summarizeNodeWithDeepSeek } from "../../../../lib/deepseek-provider";
import { getWorkspace, updateRoadmapNode } from "../../../../lib/workspace-store";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { studentId?: string; nodeId?: string };
    if (!payload.studentId || !payload.nodeId) {
      return Response.json({ error: "studentId와 nodeId가 필요합니다." }, { status: 400 });
    }

    const workspace = await getWorkspace(payload.studentId);
    if (!workspace) {
      return Response.json({ error: "워크스페이스를 찾을 수 없습니다." }, { status: 404 });
    }

    const node = workspace.roadmap.nodes.find((n) => n.id === payload.nodeId);
    if (!node) {
      return Response.json({ error: "해당 노드를 찾을 수 없습니다." }, { status: 404 });
    }

    // 해당 노드에 연결된 활동들 필터링
    const activities = workspace.activities.filter(
      (a) => a.roadmapNodeId === node.id || (!a.roadmapNodeId && node.status === "active")
    );

    if (activities.length === 0) {
      return Response.json({ error: "해당 학기에 요약할 활동이 없습니다." }, { status: 400 });
    }

    // 활동 내용을 문자열로 조합
    const activityDetails = activities.map((a, index) => 
      `${index + 1}. [${a.category}] ${a.title} (${a.subject}) - 산출물: ${a.outputs.join(", ")}`
    ).join("\n");

    const summary = await summarizeNodeWithDeepSeek(workspace.profile, node.grade, node.semester, activityDetails);
    
    if (!summary) {
      return Response.json({ error: "AI 요약 생성에 실패했습니다." }, { status: 502 });
    }

    // 워크스페이스에 업데이트 저장
    const updatedWorkspace = await updateRoadmapNode(workspace.profile.id, node.id, {
      title: summary.title,
      objective: summary.objective,
    });

    return Response.json({ workspace: updatedWorkspace }, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "노드 요약에 실패했습니다." },
      { status: 500 },
    );
  }
}
