import { SCHOOL_RECORD_MAX_FILE_SIZE, SCHOOL_RECORD_MAX_FILE_SIZE_LABEL } from "../../../../lib/school-record-parser";
import { seteukApiUrl, upstreamError } from "../../../../lib/seteuk-api";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const academicStartYear = Number(form.get("academicStartYear"));
    if (!(file instanceof File)) return Response.json({ error: "PDF 파일을 선택해주세요." }, { status: 400 });
    if (!Number.isInteger(academicStartYear)) return Response.json({ error: "학사연도 정보가 필요합니다." }, { status: 400 });
    if (file.size > SCHOOL_RECORD_MAX_FILE_SIZE) return Response.json({ error: `파일은 ${SCHOOL_RECORD_MAX_FILE_SIZE_LABEL} 이하만 분석할 수 있습니다.` }, { status: 413 });
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      return Response.json({ error: "현재 실제 분석은 텍스트형 PDF를 지원합니다." }, { status: 415 });
    }

    const externalForm = new FormData();
    externalForm.append("file", file, file.name);

    const response = await fetch(seteukApiUrl("/analyze", request.url), {
      method: "POST",
      body: externalForm,
    });

    if (!response.ok) {
      const message = await upstreamError(response, "분석 서버가 요청을 처리하지 못했습니다.");
      return Response.json({ error: message }, { status: response.status });
    }

    const data = await response.json() as { task_id?: unknown; status?: unknown; message?: unknown };
    if (typeof data.task_id !== "string" || !data.task_id) {
      return Response.json({ error: "분석 서버가 작업 ID를 반환하지 않았습니다." }, { status: 502 });
    }
    return Response.json(data, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    return Response.json({ error: `생기부 분석 요청에 실패했습니다. ${message}` }, { status: 502 });
  }
}
