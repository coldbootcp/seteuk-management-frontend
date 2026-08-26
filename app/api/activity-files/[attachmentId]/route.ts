import { deleteActivityFile, getActivityFile } from "../../../../lib/activity-files";

export async function GET(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  try {
    const studentId = new URL(request.url).searchParams.get("studentId")?.trim();
    const { attachmentId } = await params;
    if (!studentId || !attachmentId) return Response.json({ error: "학생과 파일 정보가 필요합니다." }, { status: 400 });
    const { row, object } = await getActivityFile(studentId, attachmentId);
    return new Response(object.body, { headers: { "Content-Type": row.content_type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}` } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "파일을 내려받지 못했습니다." }, { status: 404 }); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  try {
    const studentId = new URL(request.url).searchParams.get("studentId")?.trim();
    const { attachmentId } = await params;
    if (!studentId || !attachmentId) return Response.json({ error: "학생과 파일 정보가 필요합니다." }, { status: 400 });
    await deleteActivityFile(studentId, attachmentId);
    return Response.json({ deleted: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "파일을 삭제하지 못했습니다." }, { status: 404 }); }
}
