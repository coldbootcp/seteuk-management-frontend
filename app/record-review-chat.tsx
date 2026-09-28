"use client";

/**
 * 생기부 확인 상담 화면.
 *
 * 설정 탭에서 올린 생기부에 이상(이름·입학 연도 불일치, 아직 오지 않은 학기, 옛 문서)이나
 * 직접 입력한 기록과의 충돌이 있으면 서버가 반영하지 않고 멈춘다. 이 화면에서 챗봇이 해명을
 * 듣고 반영 범위와 충돌별 선택을 정하며, "확인한 내용으로 반영"을 눌러야 실제로 반영된다.
 * 다른 기능을 막지 않는다 — 닫았다가 설정 탭에서 다시 열어 이어 갈 수 있다.
 */

import { useEffect, useRef, useState } from "react";
import type { ChatAction } from "../lib/chat";
import { streamConsultationMessage, streamConsultationOpening } from "../lib/chat";
import {
  CONFLICT_CHOICE_LABELS,
  concludeRecordReview,
  openRecordReview,
  recordReviewMessages,
  scopeLabel,
  summarizeCounts,
  type RecordReviewState,
} from "../lib/school-record-api";
import { useChatScroll } from "../lib/use-chat-scroll";
import { ChatComposer, ChatThread, type ChatBubble } from "./chat-thread";

export function RecordReviewChat({ onClose, onResolved }: { onClose: () => void; onResolved: () => void }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [review, setReview] = useState<RecordReviewState | null>(null);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [concluding, setConcluding] = useState(false);
  const [error, setError] = useState("");
  const startedRef = useRef(false);
  const sendingRef = useRef(false);
  const { feedRef, spacerRef, onScroll, showJump, jumpToBottom, pinNextUserMessage } = useChatScroll(bubbles);

  useEffect(() => {
    // StrictMode에서 이펙트가 두 번 돌아도 첫 인사를 두 번 부르지 않는다.
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const session = await openRecordReview();
        setSessionId(session.id);
        setReview(session.record_review);
        const history = await recordReviewMessages(session.id);
        if (history.length > 0) {
          setBubbles(
            history.map((m) => ({
              id: m.id,
              role: m.role === "user" ? "user" : "assistant",
              content: m.content,
              actions: (m.applied_actions ?? []) as ChatAction[],
            })),
          );
          return;
        }
        const pendingId = `opening-${Date.now()}`;
        setStreaming(true);
        setBubbles([{ id: pendingId, role: "assistant", content: "", actions: [], streaming: true }]);
        await streamConsultationOpening(session.id, {
          onToken: (delta) =>
            setBubbles((prev) => prev.map((b) => (b.id === pendingId ? { ...b, content: b.content + delta } : b))),
          onDone: (payload) =>
            setBubbles((prev) =>
              prev.map((b) => (b.id === pendingId ? { ...b, id: payload.message_id ?? b.id, streaming: false } : b)),
            ),
          onError: (payload) => {
            setError(payload.message);
            setBubbles((prev) => prev.filter((b) => b.id !== pendingId));
          },
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "생기부 확인을 시작하지 못했습니다.");
      } finally {
        setStreaming(false);
      }
    })();
  }, []);

  async function send() {
    const content = input.trim();
    if (!content || streaming || sendingRef.current || !sessionId) return;
    sendingRef.current = true;
    try {
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
      await streamConsultationMessage(sessionId, content, {
        onToken: (delta) =>
          setBubbles((prev) => prev.map((b) => (b.id === pendingId ? { ...b, content: b.content + delta } : b))),
        onAction: (action) =>
          setBubbles((prev) => prev.map((b) => (b.id === pendingId ? { ...b, actions: [...b.actions, action] } : b))),
        onDone: (payload) =>
          setBubbles((prev) =>
            prev.map((b) => (b.id === pendingId ? { ...b, id: payload.message_id ?? b.id, streaming: false } : b)),
          ),
        onError: (payload) => {
          setError(payload.message);
          setBubbles((prev) => prev.filter((b) => b.id !== pendingId));
        },
        onSignal: (payload) => {
          if (payload.record_review) setReview(payload.record_review as RecordReviewState);
        },
      });
    } finally {
      setStreaming(false);
      sendingRef.current = false;
    }
  }

  async function conclude() {
    if (!sessionId || concluding) return;
    setConcluding(true);
    setError("");
    try {
      const session = await concludeRecordReview(sessionId);
      setReview(session.record_review);
      onResolved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "반영하지 못했습니다.");
    } finally {
      setConcluding(false);
    }
  }

  const done = Boolean(review?.concluded);
  const conflicts = review?.conflicts ?? [];
  const anomalies = review?.anomalies ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" role="presentation">
      <div className="w-full max-w-5xl h-[88vh] rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <header className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-none">
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-gray-950">생기부 확인</h3>
            <p className="text-[11px] text-gray-500 truncate">
              {review?.file_name ? `${review.file_name} · ` : ""}확인한 내용으로 반영하기 전까지 기록은 바뀌지 않아요.
            </p>
          </div>
          <button className="text-gray-400 hover:text-gray-700 text-sm" onClick={onClose} type="button">
            ✕
          </button>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12">
          {/* 확인 현황 — 서버가 찾은 문제와 학생이 정한 것 */}
          <aside className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-gray-100 p-4 space-y-4 overflow-y-auto max-h-[30vh] lg:max-h-none">
            {anomalies.length > 0 && (
              <section className="space-y-1.5">
                <h4 className="text-[11px] font-extrabold text-gray-900">확인이 필요한 점</h4>
                <ul className="space-y-1">
                  {anomalies.map((anomaly) => (
                    <li className="text-[11px] text-amber-900 bg-amber-50/70 border border-amber-100 rounded-lg p-2 leading-relaxed break-keep" key={anomaly.kind}>
                      {anomaly.message}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-gray-600">
                  반영 범위: <strong className="font-bold text-gray-900">{scopeLabel(review?.scope ?? null)}</strong>
                </p>
              </section>
            )}

            {conflicts.length > 0 && (
              <section className="space-y-1.5">
                <h4 className="text-[11px] font-extrabold text-gray-900">직접 입력한 기록과 다른 항목</h4>
                <ul className="space-y-1.5">
                  {conflicts.map((conflict) => (
                    <li className="rounded-lg border border-gray-100 bg-gray-50/70 p-2 space-y-0.5" key={conflict.id}>
                      <span className="flex items-center justify-between gap-2">
                        <strong className="text-[11px] font-bold text-gray-900 truncate">
                          {conflict.grade}학년{conflict.semester ? ` ${conflict.semester}학기` : ""} {conflict.title}
                        </strong>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-none ${
                            conflict.choice ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {conflict.choice ? CONFLICT_CHOICE_LABELS[conflict.choice] : "미정"}
                        </span>
                      </span>
                      {conflict.differences.length > 0 && (
                        <span className="block text-[10px] text-gray-500 break-keep">{conflict.differences.join(", ")}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {done ? (
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-1">
                <strong className="block text-[11px] font-bold text-emerald-800">
                  {review?.result_state === "discarded" ? "이 생기부는 반영하지 않았어요" : "확인한 내용으로 반영했어요"}
                </strong>
                {review?.result_state === "resolved" && (
                  <p className="text-[11px] text-emerald-900 break-keep">{summarizeCounts(review.imported) || "새로 들어간 기록은 없어요"}</p>
                )}
                <button className="mt-1 text-[11px] font-bold text-emerald-700 hover:underline" onClick={onClose} type="button">
                  닫기
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <button
                  className="w-full px-3 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold transition"
                  disabled={!review?.ready || concluding || streaming}
                  onClick={() => void conclude()}
                  type="button"
                >
                  {concluding ? "반영하는 중…" : "확인한 내용으로 반영"}
                </button>
                <p className="text-[10px] text-gray-400 break-keep">
                  {review?.ready
                    ? "눌러야 실제로 반영돼요. 로드맵은 바뀌지 않아요."
                    : `챗봇과 ${review?.outstanding?.length ?? 0}가지를 더 정하면 버튼이 켜져요.`}
                </p>
              </div>
            )}
          </aside>

          {/* 대화 */}
          <section className="lg:col-span-8 flex flex-col min-h-0">
            <ChatThread
              bubbles={bubbles}
              empty={<>생기부를 확인하는 중이에요…</>}
              feedRef={feedRef}
              onJump={jumpToBottom}
              onScroll={onScroll}
              showJump={showJump}
              spacerRef={spacerRef}
            />
            {error && (
              <p className="px-4 py-2 bg-red-50 border-t border-red-200/70 text-[11px] font-semibold text-red-700 flex-none">
                {error}
              </p>
            )}
            {!done && (
              <ChatComposer
                disabled={streaming || !input.trim() || !sessionId}
                hint="Enter로 전송, Shift+Enter로 줄바꿈"
                onChange={setInput}
                onSend={() => void send()}
                placeholder="예: 네, 제 생기부 맞아요"
                streaming={streaming}
                value={input}
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
