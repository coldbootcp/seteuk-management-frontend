"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api-client";
import { useChatScroll } from "../lib/use-chat-scroll";
import {
  renameConversation,
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
const CONSULTATION_PURPOSES = new Set([
  "initial_consultation",
  "semester_review_consultation",
  "graduate_fit_consultation",
]);

/** 서버가 제목을 아직 붙이지 않았을 때(첫 답변 직후 등) 목록에 보일 이름. */
function fallbackTitle(purpose: string | undefined): string {
  if (purpose === "initial_consultation") return "3개년 흐름 설계";
  if (purpose === "semester_review_consultation") return "학기 점검 상담";
  if (purpose === "graduate_fit_consultation") return "목표 학과 지원 전략";
  return "새 대화";
}

function purposeBadge(purpose: string | undefined): string {
  if (purpose === "initial_consultation") return "입시 컨설팅";
  if (purpose === "graduate_fit_consultation") return "지원 전략";
  return "학기 컨설팅";
}

export function ChatView({ onRecordsChanged }: { onRecordsChanged: () => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("normal");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  // 제목 이름 바꾸기 — 한 번에 한 대화만 편집한다.
  const [editingId, setEditingId] = useState<string | null>(null);
  // 같은 대화를 목록과 머리글 두 곳에서 동시에 편집하지 않도록 어디서 시작했는지 기억한다.
  const [editingWhere, setEditingWhere] = useState<"list" | "header">("list");
  const [editingTitle, setEditingTitle] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  // send()의 재진입을 막는 동기 플래그. streaming(state)만으로는 부족하다 — React
  // 상태 갱신은 다음 렌더까지 반영되지 않는데, 한글 입력 중 마지막 글자를 조합
  // 확정하며 누른 Enter가 브라우저에 따라 keydown을 두 번(조합 확정용 + 실제
  // Enter) 연달아 낼 수 있어, 두 번째 호출이 streaming을 아직 false로 읽고
  // 통과해 메시지가 두 번 전송된다.
  const sendingRef = useRef(false);

  const open = useCallback(async (id: string) => {
    setActiveId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("seteuk.active_chat_id", id);
    }
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
    let cancelled = false;
    (async () => {
      const items = await loadConversations();
      if (cancelled || items.length === 0) return;
      const savedId = typeof window !== "undefined" ? localStorage.getItem("seteuk.active_chat_id") : null;
      const target = items.find((c) => c.id === savedId) ?? items[0];
      if (target) {
        void open(target.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadConversations, open]);

  const { feedRef, spacerRef, onScroll, showJump, jumpToBottom, pinNextUserMessage } = useChatScroll(bubbles);

  function startRename(conversation: Conversation, where: "list" | "header") {
    setEditingWhere(where);
    setEditingId(conversation.id);
    setEditingTitle(conversation.title?.trim() || fallbackTitle(conversation.purpose));
  }

  function cancelRename() {
    setEditingId(null);
    setEditingTitle("");
  }

  async function commitRename() {
    const id = editingId;
    const title = editingTitle.trim();
    if (!id || savingTitle) return;
    const current = conversations.find((c) => c.id === id);
    if (!title || title === (current?.title ?? "").trim()) {
      cancelRename();
      return;
    }
    setSavingTitle(true);
    try {
      const updated = await renameConversation(id, title.slice(0, 60));
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
      cancelRename();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "대화 이름을 바꾸지 못했습니다.");
    } finally {
      setSavingTitle(false);
    }
  }

  async function send() {
    const content = input.trim();
    if (!content || streaming || sendingRef.current) return;
    sendingRef.current = true;

    try {
      let conversationId = activeId;
      if (!conversationId) {
        try {
          const created = await api<Conversation>("/conversations", { method: "POST" });
          conversationId = created.id;
          setActiveId(conversationId);
          if (typeof window !== "undefined") {
            localStorage.setItem("seteuk.active_chat_id", conversationId);
          }
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
      pinNextUserMessage();
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
        onDone: (payload) => {
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
          );
          // 답변은 끝났다 — 서버가 이어서 제목을 짓는 동안에도 다음 입력을 받는다.
          setStreaming(false);
        },
        onTitle: ({ conversation_id, title }) =>
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversation_id ? { ...c, title, title_source: "auto" } : c,
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

  const currentConv = conversations.find((c) => c.id === activeId);
  const activeTitle = currentConv?.title?.trim() || fallbackTitle(currentConv?.purpose);
  const activeSubtitle =
    currentConv?.purpose === "initial_consultation"
      ? "3개년 흐름부터 이번 학기 목표·주제까지 정한 상담 대화"
      : currentConv?.purpose === "semester_review_consultation"
      ? "학기말 점검 및 이번 학기 목표 조율 대화"
      : currentConv?.purpose === "graduate_fit_consultation"
      ? "확정된 생기부로 목표 학과 지원 전략을 다룬 대화"
      : "기록된 내 자료를 근거로 답합니다";

  const renameInput = (
    <input
      aria-label="대화 이름"
      autoFocus
      className="w-full min-w-0 px-2 py-1 rounded-md border border-brand-300 bg-white text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      disabled={savingTitle}
      maxLength={60}
      onBlur={() => void commitRename()}
      onChange={(e) => setEditingTitle(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") {
          e.preventDefault();
          void commitRename();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelRename();
        }
      }}
      value={editingTitle}
    />
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[640px]">
      {/* 대화 목록 */}
      <aside className="bg-white p-4 rounded-xl border border-gray-200/80 flex flex-col gap-3 min-h-0">
        <div className="flex items-center justify-between flex-none">
          <span className="text-xs font-semibold text-gray-400">대화 목록</span>
          <button
            className="text-xs text-brand-600 font-bold hover:text-brand-700 transition cursor-pointer"
            onClick={async () => {
              try {
                const created = await api<Conversation>("/conversations", { method: "POST" });
                await loadConversations();
                setActiveId(created.id);
                if (typeof window !== "undefined") {
                  localStorage.setItem("seteuk.active_chat_id", created.id);
                }
                setBubbles([]);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "새 대화를 생성하지 못했습니다.");
              }
            }}
            type="button"
          >
            + 새 대화
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 -mx-1 px-1">
          {conversations.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">아직 대화가 없습니다.</p>
          ) : (
            conversations.map((conversation) => {
              const isConsultation = CONSULTATION_PURPOSES.has(conversation.purpose);
              const displayTitle = conversation.title?.trim() || fallbackTitle(conversation.purpose);
              const isSelected = conversation.id === activeId;
              const isEditing = editingId === conversation.id && editingWhere === "list";

              return (
                <div className="relative group" key={conversation.id}>
                  {isEditing ? (
                    <div className="w-full p-2.5 rounded-xl border border-blue-200/80 bg-blue-50/80">
                      {renameInput}
                    </div>
                  ) : (
                    <button
                      className={`w-full text-left p-2.5 pr-8 rounded-xl text-xs transition flex flex-col gap-1 border cursor-pointer ${
                        isSelected
                          ? "bg-blue-50/80 text-brand-950 font-bold border-blue-200/80 shadow-xs"
                          : "text-gray-600 hover:bg-gray-50/80 border-gray-100 hover:border-gray-200/70"
                      }`}
                      onClick={() => void open(conversation.id)}
                      onDoubleClick={() => startRename(conversation, "list")}
                      title="두 번 누르면 이름을 바꿀 수 있어요"
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-1.5 w-full">
                        <span className="truncate flex-1 font-semibold">{displayTitle}</span>
                        {isConsultation && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100/70 text-brand-700 flex-none">
                            {purposeBadge(conversation.purpose)}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 font-normal">
                        {new Date(conversation.updated_at).toLocaleDateString("ko-KR", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </button>
                  )}
                  {!isEditing && (
                    <button
                      aria-label={`${displayTitle} 이름 바꾸기`}
                      className={`absolute right-2 bottom-2 w-5 h-5 rounded-md flex items-center justify-center text-[11px] text-gray-400 hover:text-brand-600 hover:bg-white transition cursor-pointer ${
                        isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                      }`}
                      onClick={() => startRename(conversation, "list")}
                      title="이름 바꾸기"
                      type="button"
                    >
                      ✎
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* 대화 창 */}
      <section className="md:col-span-3 bg-white rounded-xl border border-gray-200/80 flex flex-col overflow-hidden min-h-0" data-tour="chat-window">
        <header className="p-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-none">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {currentConv && editingId === currentConv.id && editingWhere === "header" ? (
                <div className="w-56 max-w-full">{renameInput}</div>
              ) : (
                <>
                  <h4 className="text-xs font-bold text-gray-950 truncate">{activeTitle}</h4>
                  {currentConv && (
                    <button
                      aria-label="대화 이름 바꾸기"
                      className="text-[11px] text-gray-400 hover:text-brand-600 transition cursor-pointer flex-none"
                      onClick={() => startRename(currentConv, "header")}
                      title="이름 바꾸기"
                      type="button"
                    >
                      ✎
                    </button>
                  )}
                </>
              )}
              {currentConv?.purpose && currentConv.purpose !== "general" && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100/70 text-brand-700 flex-none">
                  {purposeBadge(currentConv.purpose)}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">{activeSubtitle}</p>
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
          bubbles={bubbles}
          feedRef={feedRef}
          onJump={jumpToBottom}
          onScroll={onScroll}
          showJump={showJump}
          spacerRef={spacerRef}
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
