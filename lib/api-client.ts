"use client";

/**
 * 백엔드(FastAPI) 호출과 인증.
 *
 * 이 리포는 화면만 담당하므로 여기에는 도메인 로직을 두지 않는다 — 요청을 보내고
 * 토큰을 관리하는 것까지가 전부다.
 */

const BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";
export const API = `${BASE}/api/v1`;

const ACCESS_KEY = "seteuk.access";
const REFRESH_KEY = "seteuk.refresh";

export const tokens = {
  get access() {
    return typeof window === "undefined" ? null : localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh?: string | null) {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  constructor(readonly status: number, readonly errorCode: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** 동시에 여러 요청이 401을 받아도 refresh는 한 번만 나가도록 진행 중인 것을 공유한다. */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!response.ok) return false;
      tokens.set((await response.json()).access_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

type Options = {
  method?: string;
  body?: unknown;
  form?: FormData;
  retry?: boolean;
};

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { method = "GET", body, form, retry = true } = options;
  const headers: Record<string, string> = {};
  const access = tokens.access;
  if (access) headers.Authorization = `Bearer ${access}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  if (response.status === 401 && retry && (await refreshAccessToken())) {
    return api<T>(path, { ...options, retry: false });
  }

  if (!response.ok) {
    let code = "UNKNOWN";
    let message = `요청을 처리하지 못했습니다 (HTTP ${response.status}).`;
    try {
      const payload = await response.json();
      code = payload.error_code ?? code;
      message = payload.message ?? message;
    } catch {
      /* 비-JSON 응답이면 기본 메시지 */
    }
    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function login(email: string, password: string): Promise<void> {
  const body = await api<{ access_token: string; refresh_token: string }>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  tokens.set(body.access_token, body.refresh_token);
}

export async function signup(email: string, password: string): Promise<void> {
  const body = await api<{ access_token: string; refresh_token: string }>("/auth/signup", {
    method: "POST",
    body: { email, password },
  });
  tokens.set(body.access_token, body.refresh_token);
}

export async function logout(): Promise<void> {
  const refresh = tokens.refresh;
  if (refresh) {
    // 서버 호출이 실패해도 로컬 토큰은 반드시 지운다 — 안 그러면 사용자가
    // 로그아웃했다고 믿는데 화면은 로그인 상태로 남는다.
    try {
      await api("/auth/logout", { method: "POST", body: { refresh_token: refresh } });
    } catch {
      /* 무시 */
    }
  }
  tokens.clear();
}
