import { seteukApiUrl, upstreamError } from "../../../../../lib/seteuk-api";

export async function GET(request: Request, { params }: { params: Promise<{ taskId: string }> | { taskId: string } }) {
  const resolvedParams = await params;
  const taskId = resolvedParams.taskId;
  if (!taskId) return Response.json({ error: "taskId is required" }, { status: 400 });

  try {
    const response = await fetch(seteukApiUrl(`/status/${encodeURIComponent(taskId)}`, request.url), {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      const message = await upstreamError(response, "분석 상태를 확인하지 못했습니다.");
      return Response.json({ error: message }, { status: response.status });
    }

    const data = await response.json();
    return Response.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    return Response.json({ error: `상태 확인 요청에 실패했습니다. ${message}` }, { status: 502 });
  }
}
