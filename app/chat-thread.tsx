"use client";

/**
 * 말풍선과 입력창. 챗봇 탭과 진단·상담 관문이 함께 쓴다.
 *
 * 두 화면이 같은 대화를 서로 다른 모양으로 그리고 있어서 하나로 합쳤다. 옛 CSS
 * (`.chat-row`, `.chat-bubble`, `.chat-input`)를 두 곳에서 각각 부르던 것을 여기로
 * 모으면, 말풍선 모양을 고칠 자리가 한 군데가 된다.
 */

import type { ReactNode, RefObject } from "react";
import { TOOL_LABELS, type ChatAction } from "../lib/chat";
import { MarkdownText } from "./markdown-text";

export type ChatBubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: ChatAction[];
  streaming?: boolean;
};

export function ChatThread({
  bubbles,
  bottomRef,
  empty,
  intro,
}: {
  bubbles: ChatBubble[];
  bottomRef: RefObject<HTMLDivElement | null>;
  empty: ReactNode;
  /**
   * 대화 맨 앞에 고정으로 놓이는 여는 말. 화면이 그리는 것이지 모델이 생성한 말이
   * 아니므로, 사실 관계(무엇을 근거로 보는지·언제 확정되는지)만 적고 학생 상태를
   * 해석하는 문장은 넣지 않는다.
   */
  intro?: ReactNode;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3 bg-gray-50/40">
      {intro && (
        <div className="flex flex-col gap-1 items-start">
          <div className="bg-white border border-brand-200/70 text-gray-900 text-xs p-3.5 rounded-xl max-w-lg leading-relaxed break-keep space-y-2">
            {intro}
          </div>
        </div>
      )}

      {bubbles.length === 0 ? (
        intro ? null : (
          <div className="h-full flex items-center justify-center">
            <p className="max-w-sm text-center text-xs text-gray-500 leading-relaxed break-keep">{empty}</p>
          </div>
        )
      ) : (
        bubbles.map((bubble) => (
          <div
            className={`flex flex-col gap-1 ${bubble.role === "user" ? "items-end" : "items-start"}`}
            key={bubble.id}
          >
            <div
              className={
                bubble.role === "user"
                  ? "bg-brand-500 text-white text-xs p-3 rounded-xl max-w-md leading-relaxed whitespace-pre-wrap break-keep"
                  : "bg-white border border-gray-200/80 text-gray-900 text-xs p-3.5 rounded-xl max-w-lg leading-relaxed break-keep"
              }
            >
              {bubble.role === "assistant" ? <MarkdownText text={bubble.content} /> : bubble.content}
              {bubble.streaming && !bubble.content && <em className="text-gray-400 not-italic">생각하는 중…</em>}
            </div>

            {bubble.actions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {bubble.actions.map((action, index) => {
                  const failed = Boolean(action.result && "error" in action.result);
                  return (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        failed
                          ? "bg-red-50 text-red-700 border-red-200/80"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                      }`}
                      key={index}
                    >
                      {failed ? "✕" : "✓"} {TOOL_LABELS[action.tool] ?? action.tool}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}

export function ChatComposer({
  disabled,
  hint,
  onChange,
  onSend,
  placeholder,
  streaming,
  value,
}: {
  disabled: boolean;
  hint?: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  streaming: boolean;
  value: string;
}) {
  return (
    <div className="p-3 border-t border-gray-100 bg-white flex-none">
      <div className="flex items-end gap-2">
        <textarea
          className="flex-1 px-3 py-2 text-xs rounded-lg border border-gray-200 focus:border-brand-500 focus:outline-none transition resize-none leading-relaxed"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // 한글(IME) 입력 중 마지막 글자를 조합 확정하는 Enter는 보내기가 아니다 —
            // isComposing을 안 보면 조합 확정용 Enter와 그 직후의 실제 Enter가
            // keydown 두 번으로 잡혀 메시지가 두 번 나간다.
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder={placeholder}
          rows={2}
          value={value}
        />
        <button
          className="px-4 py-2.5 bg-gray-900 text-white font-bold text-xs rounded-lg hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition flex-none"
          disabled={disabled}
          onClick={onSend}
          type="button"
        >
          {streaming ? "…" : "보내기"}
        </button>
      </div>
      {hint && <p className="text-[10px] text-gray-400 mt-1.5 px-1">{hint}</p>}
    </div>
  );
}
