import { diagnoseStudent, generateRoadmap, type ProfileInput } from "../../../../lib/product-harness";
import { diagnoseStudentWithDeepSeek, generateRoadmapWithDeepSeek, isDeepSeekConfigured } from "../../../../lib/deepseek-provider";

export async function POST(request: Request) {
  try {
    const profile = (await request.json()) as ProfileInput;
    if (!profile.name?.trim() || !profile.targetCareer?.trim() || ![1, 2, 3].includes(profile.grade) || ![1, 2].includes(profile.semester)) {
      return Response.json({ error: "이름, 학년, 학기, 희망 진로를 입력해주세요." }, { status: 400 });
    }
    const deepSeekRoadmap = await generateRoadmapWithDeepSeek(profile);
    if (isDeepSeekConfigured() && !deepSeekRoadmap) {
      return Response.json({ error: "DeepSeek 로드맵 생성에 실패했습니다. 잠시 후 다시 시도해주세요." }, { status: 502 });
    }
    const roadmap = deepSeekRoadmap ?? generateRoadmap(profile);
    const workspaceProfile = { ...profile, id: roadmap.studentId };
    const deepSeekDna = await diagnoseStudentWithDeepSeek(workspaceProfile, []);
    if (isDeepSeekConfigured() && !deepSeekDna) {
      return Response.json({ error: "DeepSeek Student DNA 분석에 실패했습니다. 잠시 후 다시 시도해주세요." }, { status: 502 });
    }
    const dna = deepSeekDna ?? diagnoseStudent(workspaceProfile, []);
    return Response.json({
      profile: workspaceProfile,
      roadmap,
      dna,
    });
  } catch {
    return Response.json({ error: "온보딩 응답을 해석하지 못했습니다." }, { status: 400 });
  }
}
