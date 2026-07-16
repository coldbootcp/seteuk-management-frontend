import type { ProfileInput } from "../../../lib/product-harness";
import { updateProfile } from "../../../lib/workspace-store";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { studentId?: string; profile?: ProfileInput };
    if (!payload.studentId || !payload.profile?.name?.trim() || !payload.profile.targetCareer?.trim()) {
      return Response.json({ error: "수정할 학생 프로필이 필요합니다." }, { status: 400 });
    }
    return Response.json({ workspace: await updateProfile(payload.studentId, payload.profile) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "프로필을 수정하지 못했습니다." },
      { status: 500 },
    );
  }
}
