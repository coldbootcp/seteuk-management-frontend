import { updateRoadmapNode } from "../../../../lib/workspace-store";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      studentId?: string;
      nodeId?: string;
      title?: string;
      objective?: string;
    };
    if (!payload.studentId || !payload.nodeId || !payload.title?.trim() || !payload.objective?.trim()) {
      return Response.json({ error: "수정할 로드맵 노드 정보가 필요합니다." }, { status: 400 });
    }
    const workspace = await updateRoadmapNode(payload.studentId, payload.nodeId, {
      title: payload.title.trim(),
      objective: payload.objective.trim(),
    });
    return Response.json({ workspace });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "로드맵 노드를 수정하지 못했습니다." },
      { status: 500 },
    );
  }
}
