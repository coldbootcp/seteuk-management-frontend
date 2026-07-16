import { saveRecommendationFeedback } from "../../../lib/workspace-store";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      studentId?: string;
      analysisId?: string;
      recommendationId?: string;
      action?: "saved" | "rejected";
      reason?: string;
    };
    if (
      !payload.studentId ||
      !payload.analysisId ||
      !payload.recommendationId ||
      !payload.action ||
      !["saved", "rejected"].includes(payload.action)
    ) {
      return Response.json({ error: "유효한 추천 피드백이 필요합니다." }, { status: 400 });
    }
    return Response.json(
      await saveRecommendationFeedback({
        studentId: payload.studentId,
        analysisId: payload.analysisId,
        recommendationId: payload.recommendationId,
        action: payload.action,
        reason: payload.reason,
      }),
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "추천 피드백을 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}
