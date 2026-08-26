import JSZip from "jszip";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { getActivityFilesBucket } from "../db";
import { getD1 } from "../db";

export const ACTIVITY_FILE_MAX_SIZE = 10 * 1024 * 1024;
export const ACTIVITY_FILE_ACCEPT = ".pdf,.ppt,.pptx,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type PendingAttachment = { fileName: string; contentType: string; sizeBytes: number; storageKey: string; extractedText: string };

function textFromXml(xml: string) { return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }

export async function extractAttachmentText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(bytes);
    const extracted = await extractText(pdf, { mergePages: true });
    return (Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text).slice(0, 24_000);
  }
  if (name.endsWith(".docx")) return (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value.slice(0, 24_000);
  if (name.endsWith(".pptx")) {
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter((key) => /^ppt\/slides\/slide\d+\.xml$/.test(key));
    const text = await Promise.all(slides.map(async (key) => textFromXml(await zip.files[key].async("string"))));
    return text.join("\n").slice(0, 24_000);
  }
  return "";
}

export async function uploadActivityFiles(studentId: string, files: File[]) {
  const bucket = getActivityFilesBucket();
  const uploaded: PendingAttachment[] = [];
  try {
    for (const file of files) {
      if (file.size > ACTIVITY_FILE_MAX_SIZE) throw new Error(`${file.name}은 10MB 이하만 첨부할 수 있습니다.`);
      if (!/\.(pdf|pptx|docx)$/i.test(file.name)) throw new Error("PDF, PPTX, DOCX 파일만 첨부할 수 있습니다.");
      const storageKey = `students/${studentId}/activities/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const extractedText = await extractAttachmentText(file);
      await bucket.put(storageKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
      uploaded.push({ fileName: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size, storageKey, extractedText });
    }
    return uploaded;
  } catch (error) {
    await Promise.all(uploaded.map((item) => bucket.delete(item.storageKey)));
    throw error;
  }
}

export async function getActivityFile(studentId: string, attachmentId: string) {
  const row = await getD1().prepare("SELECT file_name, content_type, storage_key FROM activity_attachments WHERE id = ? AND student_id = ?").bind(attachmentId, studentId).first<{ file_name: string; content_type: string; storage_key: string }>();
  if (!row) throw new Error("첨부 파일을 찾을 수 없습니다.");
  const object = await getActivityFilesBucket().get(row.storage_key);
  if (!object) throw new Error("저장된 파일을 찾을 수 없습니다.");
  return { row, object };
}

export async function deleteActivityFile(studentId: string, attachmentId: string) {
  const d1 = getD1();
  const row = await d1.prepare("SELECT storage_key FROM activity_attachments WHERE id = ? AND student_id = ?").bind(attachmentId, studentId).first<{ storage_key: string }>();
  if (!row) throw new Error("첨부 파일을 찾을 수 없습니다.");
  await getActivityFilesBucket().delete(row.storage_key);
  await d1.prepare("DELETE FROM activity_attachments WHERE id = ? AND student_id = ?").bind(attachmentId, studentId).run();
}
