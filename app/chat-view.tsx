"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api-client";
import {
  streamMessage,
  TOOL_LABELS,
  type ChatAction,
  type ChatMode,
  type Conversation,
  type StoredMessage,
} from "../lib/chat";

type Bubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: ChatAction[];
  streaming?: boolean;
};

/**
 * 챗봇 화면.
 *
 * '수정' 토글이 곧 동의다 — 켜져 있으면 별도 확인 없이 도구가 바로 실행되고, 실행된
 * 것은 말풍선 아래에 남는다. 대화만으로는 어떤 기록도 지워지지 않는다(백엔드에 삭제
 * 도구가 없다).
 */
export function ChatView({ onRecordsChanged }: { onRecordsChanged: () => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("normal");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  // send()의 재진입을 막는 동기 플래그. streaming(state)만으로는 부족하다 — React
  // 상태 갱신은 다음 렌더까지 반영되지 않는데, 한글 입력 중 마지막 글자를 조합
  // 확정하며 누른 Enter가 브라우저에 따라 keydown을 두 번(조합 확정용 + 실제
  // Enter) 연달아 낼 수 있어, 두 번째 호출이 streaming을 아직 false로 읽고
  // 통과해 메시지가 두 번 전송된다.
  const sendingRef = useRef(false);

  const loadConversations = useCallback(async () => {
    try {
      const result = await api<{ items: Conversation[] }>("/conversations?limit=50");
      setConversations(result.items);
      return result.items;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "대화를 불러오지 못했습니다.");
      return [];
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles]);

  const open = useCallback(async (id: string) => {
    setActiveId(id);
    setError("");
    try {
      const messages = await api<StoredMessage[]>(`/conversations/${id}/messages`);
      setBubbles(
        messages.map((message) => ({
          id: message.id,
          role: message.role === "user" ? "user" : "assistant",
          content: message.content,
          actions: message.applied_actions ?? [],
        })),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "대화를 열지 못했습니다.");
    }
  }, []);

  async function send() {
    const content = input.trim();
    if (!content || streaming || sendingRef.current) return;
    sendingRef.current = true;

    try {
      let conversationId = activeId;
      if (!conversationId) {
        try {
          conversationId = (await api<Conversation>("/conversations", { method: "POST" })).id;
          setActiveId(conversationId);
          await loadConversations();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "대화를 만들지 못했습니다.");
          return;
        }
      }

      setInput("");
      setError("");
      setStreaming(true);
      const pendingId = `pending-${Date.now()}`;
      setBubbles((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: "user", content, actions: [] },
        { id: pendingId, role: "assistant", content: "", actions: [], streaming: true },
      ]);

      let changedRecords = false;
      await streamMessage(conversationId, content, mode, {
        onToken: (delta) =>
          setBubbles((prev) =>
            prev.map((b) => (b.id === pendingId ? { ...b, content: b.content + delta } : b)),
          ),
        onAction: (action) => {
          changedRecords = true;
          setBubbles((prev) =>
            prev.map((b) => (b.id === pendingId ? { ...b, actions: [...b.actions, action] } : b)),
          );
        },
        onDone: (payload) =>
          setBubbles((prev) =>
            prev.map((b) =>
              b.id === pendingId
                ? {
                    ...b,
                    id: payload.message_id,
                    streaming: false,
                    actions: payload.applied_actions ?? b.actions,
                  }
                : b,
            ),
          ),
        onError: (payload) => {
          setError(`${payload.message} (${payload.error_code})`);
          setBubbles((prev) =>
            prev.map((b) => (b.id === pendingId ? { ...b, streaming: false } : b)),
          );
        },
      });

      setStreaming(false);
      void loadConversations();
      // 수정 모드에서 기록이 바뀌었으면 다른 화면도 최신으로 맞춘다.
      if (changedRecords) onRecordsChanged();
    } finally {
      // 대화 생성이 실패해 위에서 일찍 return하는 경로도 있으므로, 잠금 해제는
      // finally에 둬야 다음 시도가 "이미 보내는 중"에 영원히 막히지 않는다.
      sendingRef.current = false;
    }
  }

  return (
    <div className="chat-layout">
      <aside className="chat-list">
        <div className="chat-list-head">
          <span>대화</span>
          <button
            type="button"
            onClick={async () => {
              const created = await api<Conversation>("/conversations", { method: "POST" });
              await loadConversations();
              setActiveId(created.id);
              setBubbles([]);
            }}
          >
            + 새 대화
          </button>
        </div>
        {conversations.length === 0 ? (
          <p className="chat-empty-list">아직 대화가 없습니다.</p>
        ) : (
          <ul>
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  className={conversation.id === activeId ? "active" : ""}
                  onClick={() => void open(conversation.id)}
                >
                  {conversation.title ?? "새 대화"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="chat-main">
        <header className="chat-head">
          <div>
            <h2>{conversations.find((c) => c.id === activeId)?.title ?? "새 대화"}</h2>
            <p>기록된 내 자료를 근거로 답합니다.</p>
          </div>
          <label className="chat-toggle">
            <span className={mode === "edit" ? "on" : ""}>수정 모드</span>
            <button
              type="button"
              role="switch"
              aria-checked={mode === "edit"}
              className={mode === "edit" ? "switch on" : "switch"}
              onClick={() => setMode(mode === "edit" ? "normal" : "edit")}
            >
              <span />
            </button>
          </label>
        </header>

        {mode === "edit" && (
          <p className="chat-notice">
            수정 모드에서는 확인 단계 없이 도구가 바로 실행됩니다(토글이 곧 동의입니다).
            대화로는 어떤 기록도 <strong>삭제되지 않습니다</strong> — 삭제는 각 탭에서만 됩니다.
          </p>
        )}

        <div className="chat-scroll">
          {bubbles.length === 0 ? (
            <p className="chat-empty">
              무엇이든 물어보세요. 예를 들어 “지금까지 활동 중 뭐가 제일 약해?” 또는
              수정 모드에서 “어제 이기적 유전자 다 읽었어”처럼요.
            </p>
          ) : (
            bubbles.map((bubble) => (
              <div key={bubble.id} className={`chat-row ${bubble.role}`}>
                <div className="chat-bubble">
                  {bubble.content}
                  {bubble.streaming && !bubble.content && <em>생각하는 중…</em>}
                </div>
                {bubble.actions.length > 0 && (
                  <div className="chat-actions">
                    {bubble.actions.map((action, index) => (
                      <span
                        key={index}
                        className={
                          action.result && "error" in action.result ? "chip failed" : "chip"
                        }
                      >
                        {action.result && "error" in action.result ? "✕" : "✓"}{" "}
                        {TOOL_LABELS[action.tool] ?? action.tool}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="chat-error">{error}</p>}

        <div className="chat-input">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              // 한글(IME) 입력 중 마지막 글자를 조합 확정하는 Enter는 보내기가
              // 아니다 — isComposing을 안 보면 조합 확정용 Enter와 그 직후의
              // 실제 Enter가 keydown 두 번으로 잡혀 메시지가 두 번 나간다.
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder={
              mode === "edit"
                ? "예: 어제 이기적 유전자 다 읽었어 (독서 기록에 추가됩니다)"
                : "예: 2학년 활동 중에 진로랑 가장 안 맞는 게 뭐야?"
            }
          />
          <button type="button" onClick={() => void send()} disabled={streaming || !input.trim()}>
            {streaming ? "…" : "보내기"}
          </button>
        </div>
        <p className="chat-hint">Enter로 전송, Shift+Enter로 줄바꿈</p>
      </section>
    </div>
  );
}
