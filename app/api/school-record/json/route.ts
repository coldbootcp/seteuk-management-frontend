import { parseSchoolRecordJson } from "../../../../lib/school-record-parser";

export async function POST(request: Request) {
  try {
    const { data, academicStartYear } = await request.json();

    if (!data || (typeof data !== "object" && !Array.isArray(data))) {
      return Response.json({ error: "올바른 학생부 분석 JSON 형식이 아닙니다." }, { status: 400 });
    }
    if (!Number.isInteger(academicStartYear)) {
      return Response.json({ error: "학사연도 정보가 필요합니다." }, { status: 400 });
    }

    const result = parseSchoolRecordJson(data, academicStartYear);
    return Response.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON 데이터를 분석하지 못했습니다.";
    return Response.json({ error: `생기부 구조화 데이터 분석에 실패했습니다. ${message}` }, { status: 500 });
  }
}
