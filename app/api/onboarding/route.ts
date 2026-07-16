import type { ProfileInput, Roadmap } from "../../../lib/product-harness";
import { saveOnboarding } from "../../../lib/workspace-store";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { profile?: ProfileInput; roadmap?: Roadmap };
    if (!payload.profile?.name?.trim() || !payload.profile.targetCareer?.trim() || ![1, 2, 3].includes(payload.profile.grade) || ![1, 2].includes(payload.profile.semester) || !payload.roadmap?.studentId || payload.roadmap.nodes.length !== 6) {
      return Response.json({ error: "확정할 학생 정보와 6개 로드맵 노드가 필요합니다." }, { status: 400 });
    }
    const workspace = await saveOnboarding(payload.profile, payload.roadmap);
    return Response.json({ workspace }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "온보딩을 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}
