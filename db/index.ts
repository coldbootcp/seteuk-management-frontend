import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export function getD1() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  return env.DB;
}

export function getActivityFilesBucket() {
  const bucket = (env as unknown as { ACTIVITY_FILES?: R2Bucket }).ACTIVITY_FILES;
  if (!bucket) throw new Error("활동 파일 저장소를 준비하지 못했습니다.");
  return bucket;
}
