"use client";

/**
 * 채팅 스크롤 — Claude 방식.
 *
 * 토큰이 올 때마다 맨 아래로 끌어내리면 학생이 답을 읽는 도중에 화면이 계속 움직인다.
 * 대신 메시지를 보낸 순간에만 그 메시지를 피드 위쪽에 한 번 붙이고, 답변은 그 아래로
 * 자라게 둔다. 짧은 답이어도 보낸 메시지가 위에 머물 수 있도록 피드 끝에 빈 공간
 * (spacer)을 두고, 답이 길어질수록 그 공간이 줄어들어 스크롤 위치는 그대로다.
 * 아래에 읽을 것이 남아 있으면 "맨 아래로" 버튼을 띄운다.
 *
 * 사용법: 피드(스크롤 컨테이너)에 feedRef·onScroll을 달고 `position: relative`를 준다.
 * 학생 말풍선의 가장 바깥 요소에 `data-chat-role="user"`를 붙이고, 피드 맨 끝에
 * spacerRef를 단 빈 div를 둔다. 보내기 직전에 pinNextUserMessage()를 부른다.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// 고정된 메시지 위에 남길 여백(px).
const PIN_TOP_GAP = 16;
// 내용 끝에서 이만큼 넘게 떨어지면 "맨 아래로" 버튼을 보인다.
const JUMP_THRESHOLD = 80;

type ScrollBubble = { id: string; streaming?: boolean };

export function useChatScroll(bubbles: ScrollBubble[]) {
  const feedRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const pinPendingRef = useRef(false);
  // 지금 마지막 학생 메시지를 위에 붙여 두는 중인가(= spacer를 계속 맞춰야 하는가).
  const pinnedRef = useRef(false);
  const prevRef = useRef<{ ids: Set<string>; streaming: boolean }>({ ids: new Set(), streaming: false });
  const [showJump, setShowJump] = useState(false);

  const lastUserElement = useCallback((): HTMLElement | null => {
    const users = feedRef.current?.querySelectorAll<HTMLElement>('[data-chat-role="user"]');
    return users && users.length > 0 ? users[users.length - 1] : null;
  }, []);

  /** 내용이 끝나는 지점(spacer 시작)이 화면 아래로 얼마나 남았는지로 버튼을 정한다. */
  const updateJump = useCallback(() => {
    const feed = feedRef.current;
    const spacer = spacerRef.current;
    if (!feed || !spacer) return;
    const remaining = spacer.offsetTop - (feed.scrollTop + feed.clientHeight);
    setShowJump(remaining > JUMP_THRESHOLD);
  }, []);

  /** 마지막 학생 메시지를 피드 맨 위까지 올릴 수 있을 만큼만 빈 공간을 둔다. */
  const updateSpacer = useCallback(() => {
    const feed = feedRef.current;
    const spacer = spacerRef.current;
    if (!feed || !spacer) return;
    const anchor = pinnedRef.current ? lastUserElement() : null;
    if (!anchor) {
      spacer.style.height = "0px";
      return;
    }
    const paddingBottom = parseFloat(getComputedStyle(feed).paddingBottom) || 0;
    const needed = anchor.offsetTop - PIN_TOP_GAP + feed.clientHeight - spacer.offsetTop - paddingBottom;
    spacer.style.height = `${Math.max(0, Math.ceil(needed))}px`;
  }, [lastUserElement]);

  useLayoutEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    const prev = prevRef.current;
    const ids = new Set(bubbles.map((b) => b.id));
    const streaming = bubbles.some((b) => b.streaming);
    // 다른 대화를 열었거나 지난 대화를 불러온 경우 — 앞의 말풍선이 하나도 남아 있지
    // 않다. 스트리밍이 끝나며 임시 id가 진짜 id로 바뀐 것과는 구분한다.
    const replaced =
      bubbles.length > 0 && !prev.streaming && ![...prev.ids].some((id) => ids.has(id));
    prevRef.current = { ids, streaming };

    if (pinPendingRef.current) {
      const anchor = lastUserElement();
      if (anchor) {
        pinPendingRef.current = false;
        pinnedRef.current = true;
        updateSpacer();
        feed.scrollTo({ top: anchor.offsetTop - PIN_TOP_GAP, behavior: "smooth" });
      }
    } else if (replaced) {
      pinnedRef.current = false;
      updateSpacer();
      feed.scrollTop = feed.scrollHeight;
    } else {
      updateSpacer();
    }
    updateJump();
  }, [bubbles, lastUserElement, updateSpacer, updateJump]);

  // 추천 답변 칩이 생기고 사라지거나 창 크기가 바뀌면 피드 높이가 달라진다.
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      updateSpacer();
      updateJump();
    });
    observer.observe(feed);
    return () => observer.disconnect();
  }, [updateSpacer, updateJump]);

  const pinNextUserMessage = useCallback(() => {
    pinPendingRef.current = true;
  }, []);

  const jumpToBottom = useCallback(() => {
    const feed = feedRef.current;
    const spacer = spacerRef.current;
    if (!feed || !spacer) return;
    const paddingBottom = parseFloat(getComputedStyle(feed).paddingBottom) || 0;
    feed.scrollTo({ top: spacer.offsetTop + paddingBottom - feed.clientHeight, behavior: "smooth" });
  }, []);

  return { feedRef, spacerRef, onScroll: updateJump, showJump, jumpToBottom, pinNextUserMessage };
}
