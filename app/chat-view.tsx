"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api-client";
import {
  GENERAL_CONVERSATION_PURPOSE,
  streamMessage,
  type ChatMode,
  type Conversation,
  type StoredMessage,
} from "../lib/chat";
import { ChatComposer, ChatThread, type ChatBubble } from "./chat-thread";

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
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
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
      // 상담 대화(initial_consultation/semester_review_consultation)는 진단·상담
      // 관문 화면이 따로 열고 닫는다. 여기 같이 보이면 같은 대화가 두 군데서 도는
      // 것처럼 보여 헷갈린다.
      const general = result.items.filter((conversation) => conversation.purpose === GENERAL_CONVERSATION_PURPOSE);
      setConversations(general);
      return general;
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

  const activeTitle = conversations.find((c) => c.id === activeId)?.title ?? "새 대화";

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[640px]">
      {/* 대화 목록 */}
      <aside className="bg-white p-4 rounded-xl border border-gray-200/80 flex flex-col gap-3 min-h-0">
        <div className="flex items-center justify-between flex-none">
          <span className="text-xs font-semibold text-gray-400">대화 목록</span>
          <button
            className="text-xs text-brand-600 font-bold hover:text-brand-700 transition"
            onClick={async () => {
              const created = await api<Conversation>("/conversations", { method: "POST" });
              await loadConversations();
              setActiveId(created.id);
              setBubbles([]);
            }}
            type="button"
          >
            + 새 대화
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-1 -mx-1 px-1">
          {conversations.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">아직 대화가 없습니다.</p>
          ) : (
            conversations.map((conversation) => (
              <button
                className={`w-full text-left p-2 rounded-lg text-xs transition truncate ${
                  conversation.id === activeId
                    ? "bg-gray-100 text-gray-950 font-bold"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
                key={conversation.id}
                onClick={() => void open(conversation.id)}
                type="button"
              >
                {conversation.title ?? "새 대화"}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* 대화 창 */}
      <section className="md:col-span-3 bg-white rounded-xl border border-gray-200/80 flex flex-col overflow-hidden min-h-0">
        <header className="p-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-none">
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-gray-950 truncate">{activeTitle}</h4>
            <p className="text-[11px] text-gray-400 mt-0.5">기록된 내 자료를 근거로 답합니다</p>
          </div>
          {/* 이 토글이 곧 동의다 — 켜면 확인 단계 없이 도구가 바로 실행된다. */}
          <button
            aria-checked={mode === "edit"}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition flex-none ${
              mode === "edit"
                ? "bg-brand-50 border-brand-200 text-brand-700"
                : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
            }`}
            onClick={() => setMode(mode === "edit" ? "normal" : "edit")}
            role="switch"
            type="button"
          >
            <span
              className={`w-7 h-4 rounded-full flex items-center px-0.5 transition ${
                mode === "edit" ? "bg-brand-500 justify-end" : "bg-gray-300 justify-start"
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-white block" />
            </span>
            수정 모드
          </button>
        </header>

        {mode === "edit" && (
          <p className="px-4 py-2.5 bg-amber-50/70 border-b border-amber-200/70 text-[11px] text-amber-900 leading-relaxed flex-none">
            수정 모드에서는 확인 단계 없이 도구가 바로 실행됩니다(토글이 곧 동의입니다).
            대화로는 어떤 기록도 <strong className="font-bold">삭제되지 않습니다</strong> — 삭제는 각 탭에서만 됩니다.
          </p>
        )}

        <ChatThread
          bottomRef={bottomRef}
          bubbles={bubbles}
          empty={
            <>
              무엇이든 물어보세요. 예를 들어 &ldquo;지금까지 활동 중 뭐가 제일 약해?&rdquo; 또는
              수정 모드에서 &ldquo;어제 이기적 유전자 다 읽었어&rdquo;처럼요.
            </>
          }
        />

        {error && (
          <p className="px-4 py-2 bg-red-50 border-t border-red-200/70 text-[11px] font-semibold text-red-700 flex-none">
            {error}
          </p>
        )}

        <ChatComposer
          disabled={streaming || !input.trim()}
          hint="Enter로 전송, Shift+Enter로 줄바꿈"
          onChange={setInput}
          onSend={() => void send()}
          placeholder={
            mode === "edit"
              ? "예: 어제 이기적 유전자 다 읽었어 (독서 기록에 추가됩니다)"
              : "예: 2학년 활동 중에 진로랑 가장 안 맞는 게 뭐야?"
          }
          streaming={streaming}
          value={input}
        />
      </section>
    </div>
  );
}
