import { env } from "cloudflare:workers";

const DEFAULT_SETEUK_API_URL = "https://seteuk-ai-x2rs.onrender.com";
const LOCAL_SETEUK_API_URL = "http://localhost:8000";

type RuntimeEnv = {
  SETEUK_AI_API_URL?: string;
};

export function seteukApiUrl(path: string, requestUrl?: string) {
  const workerEnv = env as unknown as RuntimeEnv;
  const processEnv = typeof process === "undefined" ? undefined : process.env;
  const requestHost = requestUrl ? new URL(requestUrl).hostname : "";
  const isLocalRequest = requestHost === "localhost" || requestHost === "127.0.0.1";
  const defaultUrl = isLocalRequest || processEnv?.NODE_ENV === "development"
    ? LOCAL_SETEUK_API_URL
    : DEFAULT_SETEUK_API_URL;
  const configured =
    workerEnv.SETEUK_AI_API_URL?.trim() ||
    processEnv?.SETEUK_AI_API_URL?.trim() ||
    defaultUrl;
  const baseUrl = configured.replace(/\/+$/, "");
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${safePath}`;
}

export async function upstreamError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { detail?: unknown; error?: unknown } | null;
  const detail = typeof body?.detail === "string"
    ? body.detail
    : typeof body?.error === "string"
      ? body.error
      : "";
  return detail.trim() || fallback;
}
