"use client";

import * as amplitude from "@amplitude/analytics-browser";

/**
 * 제품 분석(Amplitude).
 *
 * 키(`NEXT_PUBLIC_AMPLITUDE_API_KEY`)가 없으면 아무것도 보내지 않는다 — 로컬·테스트
 * 빌드에서는 그대로 꺼진 채 돌아간다.
 *
 * **학생 데이터는 보내지 않는다.** 이 앱의 화면에는 생기부 내용·성적·이름이 그대로
 * 찍혀 있어서, 클릭한 요소의 글자를 모으는 자동 수집(elementInteractions)이나 폼 수집을
 * 켜면 그 내용이 Amplitude로 나간다. 그래서 둘 다 끄고, 대시보드에서 원격으로 다시
 * 켜지 못하게 원격 설정도 끈다(`fetchRemoteConfig: false`). 사용자는 이메일이 아니라
 * 백엔드의 사용자 UUID(JWT `sub`)로 식별하고, 이벤트 속성에는 탭 이름 같은 화면 정보만
 * 싣는다.
 */

const API_KEY = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY?.trim() ?? "";
// Amplitude 프로젝트를 만든 지역. EU 데이터센터 프로젝트면 "EU"로 빌드한다.
const SERVER_ZONE = process.env.NEXT_PUBLIC_AMPLITUDE_SERVER_ZONE === "EU" ? "EU" : "US";

let started = false;

export function initAnalytics(): void {
  if (started || !API_KEY || typeof window === "undefined") return;
  started = true;
  amplitude.init(API_KEY, {
    serverZone: SERVER_ZONE,
    autocapture: {
      // 페이지 진입·세션·유입 경로만. 화면 글자를 읽는 수집은 끈다(위 설명).
      pageViews: true,
      sessions: true,
      attribution: true,
      elementInteractions: false,
      formInteractions: false,
      frustrationInteractions: false,
      fileDownloads: false,
      networkTracking: false,
      webVitals: false,
    },
    remoteConfig: { fetchRemoteConfig: false },
    enableDiagnostics: false,
  });
  identifyFromToken(localStorage.getItem("seteuk.access"));
}

/** 접근 토큰의 `sub`(사용자 UUID)를 읽는다. 검증이 아니라 식별용이다 — 서명 검증은 백엔드가 한다. */
function userIdFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === "string" && sub.length >= 5 ? sub : null;
  } catch {
    return null;
  }
}

export function identifyFromToken(token: string | null): void {
  if (!started) return;
  const userId = userIdFromToken(token);
  if (userId && amplitude.getUserId() !== userId) amplitude.setUserId(userId);
}

/** 로그아웃 — 다음 사람이 같은 기기를 쓰면 다른 사용자로 잡히게 식별을 끊는다. */
export function resetAnalytics(): void {
  if (!started) return;
  amplitude.reset();
}

type EventProperties = Record<string, string | number | boolean | null>;

export function track(event: string, properties?: EventProperties): void {
  if (!started) return;
  amplitude.track(event, properties);
}
