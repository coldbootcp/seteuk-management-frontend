import type { SchoolRecordCourse, SchoolRecordDraft } from "../../../../lib/school-record-parser";
import { importSchoolRecord } from "../../../../lib/workspace-store";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      studentId?: string;
      fileName?: string;
      totalPages?: number;
      courses?: SchoolRecordCourse[];
      entries?: SchoolRecordDraft[];
    };
    if (!payload.studentId || !payload.fileName || !Array.isArray(payload.entries) || !Array.isArray(payload.courses)) {
      return Response.json({ error: "확정할 생기부 분석 결과가 필요합니다." }, { status: 400 });
    }
    const selectedEntries = payload.entries.filter((entry) => entry.selected);
    if (!selectedEntries.length && !payload.courses.length) {
      return Response.json({ error: "반영할 과목 또는 활동을 하나 이상 선택해주세요." }, { status: 400 });
    }
    if (selectedEntries.some((entry) => !entry.title.trim() || !entry.subject.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.completedAt))) {
      return Response.json({ error: "활동 제목, 과목, 날짜를 확인해주세요." }, { status: 400 });
    }
    const result = await importSchoolRecord({
      studentId: payload.studentId,
      fileName: payload.fileName,
      totalPages: payload.totalPages ?? 0,
      courses: payload.courses,
      entries: payload.entries,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "생기부 기록을 반영하지 못했습니다." },
      { status: 500 },
    );
  }
}
