import { extractText, getDocumentProxy } from "unpdf";
import { parseSchoolRecordText, SCHOOL_RECORD_MAX_FILE_SIZE, SCHOOL_RECORD_MAX_FILE_SIZE_LABEL } from "../../../../lib/school-record-parser";

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

    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const extracted = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text;
    const result = parseSchoolRecordText(text, {
      fileName: file.name,
      totalPages: extracted.totalPages,
      academicStartYear,
    });
    return Response.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF에서 텍스트를 추출하지 못했습니다.";
    return Response.json({ error: `생기부 분석에 실패했습니다. ${message}` }, { status: 500 });
  }
}
