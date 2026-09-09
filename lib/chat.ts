"use client";

import { API, tokens } from "./api-client";

export type ChatMode = "normal" | "edit";

export type ChatAction = {
  tool: string;
  arguments?: Record<string, unknown>;
  result?: Record<string, unknown>;
};

export type Conversation = { id: string; title: string | null; updated_at: string };

export type StoredMessage = {
  id: string;
  role: string;
  content: string;
  applied_actions: ChatAction[] | null;
};

/** 수정 모드에서 챗봇이 실제로 무엇을 했는지 학생에게 한국어로 되짚어 준다. */
export const TOOL_LABELS: Record<string, string> = {
  add_reading: "독서 기록 추가",
  add_activity: "활동 추가",
  update_activity: "활동 수정",
  add_award: "수상 추가",
  add_volunteer_record: "봉사 추가",
  add_academic_performance: "성적 추가",
  add_plan: "계획 추가",
  update_plan: "계획 수정",
  complete_plan: "계획 완료",
  remember: "메모리 저장",
  update_profile_basics: "기본 정보 수정",
  run_diagnosis: "진단 실행",
  recommend_follow_up: "후속 탐구 추천",
  propose_draft_plan: "계획 초안 제안",
  propose_full_replan_exception: "전체 재설계 제안",
  signal_ready_to_conclude: "상담 마무리 신호",
};

type Handlers = {
  onToken: (delta: string) => void;
  onAction: (action: ChatAction) => void;
  onDone: (payload: { message_id: string; applied_actions?: ChatAction[] }) => void;
  onError: (payload: { error_code: string; message: string }) => void;
};

/** 상담 챗봇 전용. 매 턴 끝에 나가기 버튼을 켤지 알려주는 signal 이벤트가 하나 더 있다. */
type ConsultationHandlers = Handlers & {
  onSignal: (payload: { ready: boolean; full_replan_confirmed?: boolean }) => void;
};

/**
 * SSE 스트리밍 공용 뼈대.
 *
 * `EventSource`로는 받을 수 없다 — Authorization 헤더를 붙일 수 없고 POST도 안 되기
 * 때문이다. fetch로 직접 열고 `event:`/`data:` 프레임을 손으로 파싱한다.
 */
async function streamSSE(
  url: string,
  body: Record<string, unknown>,
  dispatch: (event: string, payload: Record<string, unknown>) => void,
  onError: Handlers["onError"],
  signal?: AbortSignal,
): Promise<void> {
  const access = tokens.access;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    let message = `대화를 시작하지 못했습니다 (HTTP ${response.status}).`;
    let code = "STREAM_FAILED";
    try {
      const payload = await response.json();
      code = payload.error_code ?? code;
      message = payload.message ?? message;
    } catch {
      /* 비-JSON 응답이면 기본 메시지 */
    }
    onError({ error_code: code, message });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatchFrame = (frame: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(data.join("\n"));
    } catch {
      return;
    }
    dispatch(event, payload);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // 프레임 경계는 빈 줄. 마지막 조각은 아직 안 끝났을 수 있으니 버퍼에 남긴다.
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      dispatchFrame(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim()) dispatchFrame(buffer);
}

export async function streamMessage(
  conversationId: string,
  content: string,
  mode: ChatMode,
  handlers: Handlers,
  signal?: AbortSignal,
): Promise<void> {
  await streamSSE(
    `${API}/conversations/${conversationId}/messages`,
    { content, mode },
    (event, payload) => {
      if (event === "token") handlers.onToken(String(payload.delta ?? ""));
      else if (event === "action") handlers.onAction(payload as ChatAction);
      else if (event === "done") handlers.onDone(payload as Parameters<Handlers["onDone"]>[0]);
      else if (event === "error") handlers.onError(payload as Parameters<Handlers["onError"]>[0]);
    },
    handlers.onError,
    signal,
  );
}

/** 상담 챗봇 대화 한 턴. 일반 대화와 달리 mode 토글이 없고, 매 턴 끝에 signal 이벤트로
 * 나가기 버튼 상태를 알려준다. */
export async function streamConsultationMessage(
  sessionId: string,
  content: string,
  handlers: ConsultationHandlers,
  signal?: AbortSignal,
): Promise<void> {
  await streamSSE(
    `${API}/consultation/sessions/${sessionId}/messages`,
    { content },
    (event, payload) => {
      if (event === "token") handlers.onToken(String(payload.delta ?? ""));
      else if (event === "action") handlers.onAction(payload as ChatAction);
      else if (event === "done") handlers.onDone(payload as Parameters<Handlers["onDone"]>[0]);
      else if (event === "error") handlers.onError(payload as Parameters<Handlers["onError"]>[0]);
      else if (event === "signal")
        handlers.onSignal(payload as Parameters<ConsultationHandlers["onSignal"]>[0]);
    },
    handlers.onError,
    signal,
  );
}
