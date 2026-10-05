"use client";

import * as amplitude from "@amplitude/analytics-browser";
import { sessionReplayPlugin } from "@amplitude/plugin-session-replay-browser";

/**
 * 제품 분석(Amplitude) — 이벤트, 사용자 속성, 세션 리플레이.
 *
 * 키(`NEXT_PUBLIC_AMPLITUDE_API_KEY`)가 없으면 아무것도 보내지 않는다 — 로컬·테스트
 * 빌드에서는 그대로 꺼진 채 돌아간다.
 *
 * **학생 데이터는 보내지 않는다.** 이 앱의 화면에는 생기부 내용·성적·이름이 그대로
 * 찍혀 있다. 그래서
 * - 사용자는 이메일이 아니라 백엔드의 사용자 UUID(JWT `sub`)로 식별하고,
 * - 클릭 수집은 짧은 버튼·링크·탭 이름(화면 고정 문구)만 남기며 입력칸과 긴 글자는
 *   건너뛰고(`shouldTrackClick`),
 * - 세션 리플레이는 모든 글자와 입력을 가린 채(`conservative`) 화면 배치와 마우스 움직임만
 *   녹화하고 이미지는 통째로 막는다.
 * 리플레이의 가리기 수준은 Amplitude 대시보드의 Session Replay 설정이 덮어쓸 수 있다 —
 * 대시보드에서 가리기를 낮추지 말 것. 개인정보가 담긴 영역은 `data-amp-private` 속성을
 * 달면 클릭 수집에서 빠지고 리플레이에서 통째로 가려진다.
 */

const API_KEY = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY?.trim() ?? "";
// Amplitude 프로젝트를 만든 지역. EU 데이터센터 프로젝트면 "EU"로 빌드한다.
const SERVER_ZONE = process.env.NEXT_PUBLIC_AMPLITUDE_SERVER_ZONE === "EU" ? "EU" : "US";
// 녹화할 세션 비율(0~1). 요금제의 리플레이 한도에 맞춰 낮출 수 있다.
const REPLAY_SAMPLE_RATE = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_AMPLITUDE_REPLAY_SAMPLE_RATE ?? "1");
  return Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 1) : 1;
})();

const PRIVATE_AREA = "[data-amp-private]";
// 버튼 이름으로 보기엔 긴 글자는 학생이 쓴 내용(활동 제목·대화 등)일 가능성이 높다.
const MAX_CLICK_TEXT = 24;

let started = false;

function shouldTrackClick(_actionType: unknown, element: unknown): boolean {
  if (typeof HTMLElement === "undefined" || !(element instanceof HTMLElement)) return false;
  if (element.closest(`input, textarea, select, [contenteditable="true"], ${PRIVATE_AREA}`)) return false;
  const target = element.closest('button, a, [role="tab"], [role="button"], label');
  if (!target) return false;
  const text = (target.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > 0 && text.length <= MAX_CLICK_TEXT;
}

export function initAnalytics(): void {
  if (started || !API_KEY || typeof window === "undefined") return;
  started = true;
  amplitude.add(
    sessionReplayPlugin({
      sampleRate: REPLAY_SAMPLE_RATE,
      privacyConfig: {
        defaultMaskLevel: "conservative",
        blockSelector: ["img", "canvas", "video", "iframe", PRIVATE_AREA],
      },
    }),
  );
  amplitude.init(API_KEY, {
    serverZone: SERVER_ZONE,
    autocapture: {
      pageViews: true,
      sessions: true,
      attribution: true,
      fileDownloads: true,
      // 폼 시작·제출 여부만 남는다(입력값은 수집하지 않는 기능이다).
      formInteractions: true,
      webVitals: true,
      // 실패한 API 요청의 주소·상태 코드. 요청·응답 본문은 수집하지 않는다.
      networkTracking: true,
      elementInteractions: { shouldTrackEventResolver: shouldTrackClick },
      frustrationInteractions: false,
    },
    // 대시보드에서 자동 수집 범위를 넓히지 못하게 이벤트 SDK의 원격 설정은 끈다.
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

type PropertyValue = string | number | boolean | null;
type EventProperties = Record<string, PropertyValue>;

export function track(event: string, properties?: EventProperties): void {
  if (!started) return;
  amplitude.track(event, properties);
}

/**
 * 사용자 속성. 숫자·예/아니오 같은 상태값만 싣는다 — 이름·진로 희망처럼 학생이 직접 쓴
 * 글은 넣지 않는다.
 */
export function setUserProperties(properties: Record<string, PropertyValue | undefined>): void {
  if (!started) return;
  const identify = new amplitude.Identify();
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined && value !== null) identify.set(key, value);
  }
  amplitude.identify(identify);
}
