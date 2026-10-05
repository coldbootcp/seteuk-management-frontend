"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 처음 들어온 학생에게 주요 화면을 말풍선으로 짚어 주는 투어.
 *
 * 가리키는 요소에 테두리를 두르고 그 옆에 흰 말풍선을 붙인다. 나머지 화면은 옅게만
 * 어둡게 한다. 단계마다 필요하면 탭을 먼저 바꾸고(`tab`), 요소가 그려질 때까지 기다린다.
 * 기다려도 요소가 없으면(예: 제안 주제가 아직 없는 학생) 그 단계는 빼고 이어 간다.
 */
export type TourPlacement = "top" | "right" | "bottom" | "left";

export type TourStep<Tab extends string> = {
  /** 이 단계를 보여주기 전에 열어 둘 탭. */
  tab?: Tab;
  /** 가리킬 요소의 CSS 선택자. */
  target: string;
  title: string;
  body: string;
  placement: TourPlacement;
  /**
   * 있으면 '다음' 대신 사용자가 이 요소를 직접 눌러야 넘어간다(예: 메뉴·버튼 누르기).
   * 테두리는 target 블록에 두고, 누를 곳만 따로 깜빡여 표시한다. 누른 결과(탭 이동 등)는
   * 앱이 평소처럼 처리한다.
   */
  action?: string;
  /** action에 해당하는 요소가 여럿일 때 깜빡여 보여 줄 하나. 없으면 첫 번째. */
  actionHighlight?: string;
  /** 바깥에 자리가 없어 블록 안쪽에 띄울 때 어느 모서리에 둘지. 기본은 오른쪽 아래. */
  insideCorner?: "top-right" | "bottom-right";
};

const BUBBLE_WIDTH = 300;
const GAP = 14;
const MARGIN = 12;
const RING_PAD = 6;
const INSET = 16;
const WAIT_MS = 1500;
/** 화면이 열리며 스스로 스크롤하는 경우(예: 대화창이 맨 아래로 내려감)를 기다렸다가 다시 맞춘다. */
const SETTLE_MS = 700;
/** 스크롤 이벤트가 이만큼 없으면 스크롤이 멈춘 것으로 본다. */
const QUIET_MS = 120;
/** 스크롤이 끝나지 않아도 이 시간이 지나면 확정한다. */
const MAX_SCROLL_MS = 1200;
/** 테두리가 다음 블록으로 옮겨 가는 시간(CSS의 .tour-ring.is-moving과 맞춘다). */
const MOVE_MS = 360;
/** 투어가 직접 스크롤을 시작한 뒤 이만큼은 스크롤을 되돌리지 않는다. */
const OWN_SCROLL_MS = MAX_SCROLL_MS + 400;
/** 투어 중에는 페이지를 움직이는 키를 막는다(말풍선 버튼 조작은 그대로). */
const SCROLL_KEYS = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
/** 상단바에 가려지지 않도록 비워 둘 높이. */
const TOPBAR_CLEARANCE = 72;

type Rect = { top: number; left: number; width: number; height: number };
/** inside: 블록이 커서 바깥에 자리가 없을 때 블록 안쪽 아래 모서리에 띄운다(화살표 없음). */
type BubbleSide = TourPlacement | "inside";
type BubblePos = { top: number; left: number; side: BubbleSide; arrow: number };

function place(
  target: Rect,
  bubble: { width: number; height: number },
  preferred: TourPlacement,
  insideCorner: "top-right" | "bottom-right" = "bottom-right",
): BubblePos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const order: TourPlacement[] = [preferred, ...(["right", "bottom", "left", "top"] as const).filter((p) => p !== preferred)];

  const fits = (side: TourPlacement) => {
    if (side === "right") return target.left + target.width + GAP + bubble.width + MARGIN <= vw;
    if (side === "left") return target.left - GAP - bubble.width - MARGIN >= 0;
    if (side === "bottom") return target.top + target.height + GAP + bubble.height + MARGIN <= vh;
    return target.top - GAP - bubble.height - MARGIN >= 0;
  };
  const side = order.find(fits);
  if (!side) {
    // 화면에 보이는 블록 부분의 오른쪽 아래 모서리. 테두리는 블록 전체에 그대로 둔다.
    const visibleBottom = Math.min(target.top + target.height, vh) - INSET;
    const visibleRight = Math.min(target.left + target.width, vw) - INSET;
    const visibleTop = Math.max(target.top, TOPBAR_CLEARANCE) + INSET;
    const top = insideCorner === "top-right" ? visibleTop : Math.max(visibleBottom - bubble.height, visibleTop);
    const left = Math.max(visibleRight - bubble.width, target.left + INSET);
    return {
      top: Math.min(Math.max(top, MARGIN), vh - bubble.height - MARGIN),
      left: Math.min(Math.max(left, MARGIN), vw - bubble.width - MARGIN),
      side: "inside",
      arrow: 0,
    };
  }

  let top: number;
  let left: number;
  if (side === "right" || side === "left") {
    left = side === "right" ? target.left + target.width + GAP : target.left - GAP - bubble.width;
    // 긴 요소(섹션 전체)는 가운데 대신 윗부분에 맞춘다 — 말풍선이 화면 밖으로 밀리지 않게.
    const anchorY = target.height > bubble.height * 2 ? target.top + 24 + bubble.height / 2 : target.top + target.height / 2;
    top = anchorY - bubble.height / 2;
  } else {
    top = side === "bottom" ? target.top + target.height + GAP : target.top - GAP - bubble.height;
    left = target.left + target.width / 2 - bubble.width / 2;
  }
  top = Math.min(Math.max(top, MARGIN), vh - bubble.height - MARGIN);
  left = Math.min(Math.max(left, MARGIN), vw - bubble.width - MARGIN);

  // 화살표는 말풍선 안에서 대상 쪽을 가리키도록 위치를 다시 잡는다.
  const arrow =
    side === "right" || side === "left"
      ? Math.min(Math.max(Math.min(target.top + target.height / 2, target.top + 40) - top, 18), bubble.height - 18)
      : Math.min(Math.max(target.left + target.width / 2 - left, 18), bubble.width - 18);
  return { top, left, side, arrow };
}

/** 대상을 화면 안으로 가져온다. 화면에 다 들어가면 가운데로, 너무 크면 윗부분이
 * 상단바 아래에 오도록 — 말풍선이 위에 붙는 단계면 그 자리까지 비워 둔다. */
function scrollIntoReach(el: Element, placement: TourPlacement) {
  const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  const rect = el.getBoundingClientRect();
  // 이미 화면에 다 보이면 움직이지 않는다(고정된 사이드바 메뉴 등).
  if (rect.top >= TOPBAR_CLEARANCE && rect.bottom <= window.innerHeight) return;
  if (rect.height <= window.innerHeight * 0.6) {
    el.scrollIntoView({ block: "center", behavior });
    return;
  }
  const topOffset = placement === "top" ? 220 : 96;
  window.scrollBy({ top: rect.top - topOffset, behavior });
}

export function GuidedTour<Tab extends string>({ steps: initialSteps, lockSelector, onNavigate, onClose }: {
  steps: TourStep<Tab>[];
  /** 투어 중 잠글 앱 화면. 직접 눌러 보는 단계에서는 누를 곳만 열어 둔다. */
  lockSelector: string;
  onNavigate: (tab: Tab) => void;
  /** 끝까지 봤으면 true, 건너뛰었으면 false. */
  onClose: (completed: boolean) => void;
}) {
  const [steps, setSteps] = useState(initialSteps);
  const [rawIndex, setIndex] = useState(0);
  // 스크롤이 멈춘 뒤 확정한 단계와 그 위치. 다음 단계가 확정될 때까지 테두리·어두운 막은
  // 이 자리에 그대로 두고, 말풍선도 이 단계의 내용을 띄운 채 사라진다 — 깜빡임이 없도록.
  const [settled, setSettled] = useState<{ step: TourStep<Tab>; rect: Rect } | null>(null);
  const [placed, setPlaced] = useState<{ step: TourStep<Tab>; pos: BubblePos } | null>(null);
  /** 테두리가 다음 블록으로 옮겨 가는 동안만 켠다. 스크롤을 따라갈 때는 지연 없이 붙는다. */
  const [moving, setMoving] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const elementRef = useRef<{ step: TourStep<Tab>; el: Element } | null>(null);
  /** 키보드 처리에서 쓰는 지금의 누를 곳(렌더마다 바뀌어 effect를 다시 걸지 않도록 ref로). */
  const actionSelectorRef = useRef<string | null>(null);
  /** 이 시각까지의 스크롤은 투어가 일으킨 것이다. 그 밖의 스크롤은 사용자 조작이라 되돌린다. */
  const ownScrollUntil = useRef(0);

  // 대상이 없어 단계가 빠지면 목록이 줄어든다 — 번호는 남은 목록 안에서 센다.
  const index = Math.min(rawIndex, steps.length - 1);
  const step = steps[index];
  const isLast = index === steps.length - 1;
  const shown = settled?.step ?? step;
  const shownIndex = Math.max(steps.indexOf(shown), 0);
  const visible = !!settled && settled.step === step && placed?.step === step;
  /** 지금 사용자가 직접 눌러야 하는 요소의 선택자. 말풍선이 떠 있을 때만 받는다. */
  const action = visible ? step?.action ?? null : null;
  const actionHighlight = action ? step?.actionHighlight ?? action : null;

  // 확정한 단계의 요소가 스크롤·리사이즈로 움직이면 그대로 따라간다.
  const follow = useCallback(() => {
    const current = elementRef.current;
    if (!current || !current.el.isConnected) return;
    const r = current.el.getBoundingClientRect();
    // 스크롤을 따라갈 때는 다음 렌더를 기다리지 않고 바로 옮긴다 — 한 프레임 늦으면
    // 빠르게 스크롤될 때 테두리가 블록보다 뒤처져 보인다. 이동 중에는 전환이 맡는다.
    const ring = ringRef.current;
    if (ring && !ring.classList.contains("is-moving")) {
      ring.style.top = `${r.top - RING_PAD}px`;
      ring.style.left = `${r.left - RING_PAD}px`;
      ring.style.width = `${r.width + RING_PAD * 2}px`;
      ring.style.height = `${r.height + RING_PAD * 2}px`;
    }
    setSettled((prev) =>
      prev && prev.step === current.step
        ? { step: prev.step, rect: { top: r.top, left: r.left, width: r.width, height: r.height } }
        : prev,
    );
  }, []);

  // 단계가 바뀌면: 탭을 열고, 요소가 나타날 때까지 기다린 뒤 스크롤하고, 스크롤이 멈추면 확정한다.
  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    let frame = 0;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    let stopQuiet: (() => void) | null = null;
    // 이전 단계의 요소는 새 단계가 확정될 때까지 계속 따라간다. 다음 블록으로 스크롤하는
    // 동안 테두리가 내용과 함께 밀려 올라가야 자연스럽다(탭이 바뀌어 요소가 사라지면
    // 그 자리에 머문다). 확정되면 거기서 새 블록으로 미끄러져 간다.
    const ownScroll = (el: Element) => {
      ownScrollUntil.current = performance.now() + OWN_SCROLL_MS;
      scrollIntoReach(el, step.placement);
    };
    // 탭이 바뀌며 페이지 길이가 줄어 생기는 스크롤도 투어가 일으킨 것으로 본다.
    ownScrollUntil.current = performance.now() + OWN_SCROLL_MS;
    if (step.tab) onNavigate(step.tab);

    // 스크롤 이벤트가 잠시 멈출 때까지 기다린다(스크롤할 게 없으면 곧바로 끝난다).
    const whenQuiet = (done: () => void) => {
      let quiet = 0;
      // 페이지 스크롤만 본다 — 대화창 같은 안쪽 목록의 스크롤까지 기다리면 괜히 늦어진다.
      const finish = () => {
        window.removeEventListener("scroll", bump);
        window.clearTimeout(quiet);
        window.clearTimeout(cap);
        stopQuiet = null;
        if (!cancelled) done();
      };
      const bump = () => {
        window.clearTimeout(quiet);
        quiet = window.setTimeout(finish, QUIET_MS);
      };
      const cap = window.setTimeout(finish, MAX_SCROLL_MS);
      window.addEventListener("scroll", bump);
      bump();
      stopQuiet = () => {
        window.removeEventListener("scroll", bump);
        window.clearTimeout(quiet);
        window.clearTimeout(cap);
      };
    };

    const commit = (el: Element) => {
      const r = el.getBoundingClientRect();
      elementRef.current = { step, el };
      setMoving(true);
      setSettled({ step, rect: { top: r.top, left: r.left, width: r.width, height: r.height } });
      later(() => setMoving(false), MOVE_MS);
      // 화면이 열리며 스스로 스크롤하는 경우(대화창이 맨 아래로 내려가는 등) 한 번 더 맞춘다.
      later(() => {
        const now = el.getBoundingClientRect();
        if (now.top < TOPBAR_CLEARANCE || now.top > window.innerHeight - 48) ownScroll(el);
      }, SETTLE_MS);
    };

    const started = performance.now();
    const find = () => {
      if (cancelled) return;
      const el = document.querySelector(step.target);
      if (el) {
        ownScroll(el);
        whenQuiet(() => commit(el));
        return;
      }
      if (performance.now() - started > WAIT_MS) {
        setSteps((current) => current.filter((s) => s !== step));
        return;
      }
      frame = requestAnimationFrame(find);
    };
    frame = requestAnimationFrame(find);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      timers.forEach((t) => window.clearTimeout(t));
      stopQuiet?.();
    };
    // onNavigate는 부모가 매 렌더 새로 만들 수 있어 의존성에서 뺀다 — 단계가 바뀔 때만 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [follow]);

  // 말풍선은 확정한 단계의 내용으로 크기를 잰 뒤 자리를 잡는다.
  useLayoutEffect(() => {
    if (!settled || !bubbleRef.current) return;
    const { offsetWidth, offsetHeight } = bubbleRef.current;
    const s = settled.step;
    setPlaced({ step: s, pos: place(settled.rect, { width: offsetWidth, height: offsetHeight }, s.placement, s.insideCorner) });
  }, [settled]);

  useEffect(() => {
    actionSelectorRef.current = actionHighlight;
  }, [actionHighlight]);

  useEffect(() => {
    if (!visible) return;
    // 직접 눌러 보는 단계면 누를 곳에, 아니면 '다음'에 포커스를 둔다.
    const actionEl = actionHighlight ? document.querySelector<HTMLElement>(actionHighlight) : null;
    (actionEl ?? nextRef.current)?.focus({ preventScroll: true });
  }, [visible, actionHighlight]);

  // 남은 단계가 없으면(모든 대상이 비어 있던 경우) 조용히 끝낸다.
  useEffect(() => {
    if (steps.length === 0) onClose(true);
  }, [steps.length, onClose]);

  // 앱 화면 잠금. 보통은 통째로 inert로 막고, 직접 눌러 보는 단계에서는 inert를 풀되
  // 누를 곳 밖의 클릭을 가로채 막는다. 누를 곳을 누르면 앱이 먼저 처리하게 두고 넘어간다.
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(lockSelector);
    if (!root) return;
    root.inert = !action;
    if (!action) return;

    const targets = [...document.querySelectorAll<HTMLElement>(action)];
    // 누를 수 있는 곳이 여럿이어도 표시는 하나만 한다 — 전부 깜빡이면 어수선하다.
    const marked = actionHighlight ? document.querySelector<HTMLElement>(actionHighlight) : null;
    marked?.setAttribute("data-tour-action", "");
    let advanced = false;
    const guard = (event: Event) => {
      const node = event.target;
      if (!(node instanceof Node)) return;
      // 말풍선 안(건너뛰기·이전)은 그냥 통과시킨다 — 누를 곳을 누른 것으로 치면 안 된다.
      if (bubbleRef.current?.contains(node)) return;
      if (targets.some((el) => el.contains(node))) {
        if (event.type === "click" && !advanced) {
          advanced = true;
          // 앱의 클릭 처리(탭 이동 등)가 끝난 뒤 넘어간다.
          window.setTimeout(() => setIndex((i) => i + 1), 0);
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    const types = ["pointerdown", "mousedown", "mouseup", "click", "dblclick", "auxclick", "contextmenu", "touchstart"];
    types.forEach((type) => window.addEventListener(type, guard, { capture: true }));
    return () => {
      types.forEach((type) => window.removeEventListener(type, guard, { capture: true }));
      marked?.removeAttribute("data-tour-action");
    };
  }, [action, actionHighlight, lockSelector]);

  // 투어가 끝나면 앱 화면 잠금을 푼다.
  useEffect(() => {
    return () => {
      const root = document.querySelector<HTMLElement>(lockSelector);
      if (root) root.inert = false;
    };
  }, [lockSelector]);

  // 투어 중에는 사용자가 페이지를 움직이지 못하게 한다. 클릭·포커스는 부모가 앱 화면을
  // inert로 막고, 여기서는 스크롤(휠·터치·키·스크롤바)과 키보드 포커스를 막는다.
  useEffect(() => {
    let lockedY = window.scrollY;
    const onScroll = () => {
      if (performance.now() < ownScrollUntil.current) {
        lockedY = window.scrollY;
        return;
      }
      // 스크롤바를 끌어 움직인 경우 — 막을 수 없으니 원래 자리로 되돌린다.
      if (Math.abs(window.scrollY - lockedY) > 1) window.scrollTo({ top: lockedY, behavior: "instant" });
    };
    const block = (event: Event) => event.preventDefault();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose(false);
        return;
      }
      const bubble = bubbleRef.current;
      const actionEl = actionSelectorRef.current ? document.querySelector<HTMLElement>(actionSelectorRef.current) : null;
      const inBubble = !!bubble && bubble.contains(event.target as Node);
      const onAction = !!actionEl && actionEl.contains(event.target as Node);
      if (event.key === "Tab" && bubble) {
        // 포커스를 말풍선 버튼(직접 눌러 보는 단계면 누를 곳까지) 안에서만 돌린다.
        event.preventDefault();
        const buttons: HTMLElement[] = [
          ...(actionEl ? [actionEl] : []),
          ...bubble.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
        ];
        if (buttons.length === 0) return;
        const at = buttons.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey
          ? at <= 0 ? buttons.length - 1 : at - 1
          : at < 0 || at === buttons.length - 1 ? 0 : at + 1;
        buttons[next].focus({ preventScroll: true });
        return;
      }
      // 스페이스는 말풍선 버튼 위에서는 버튼을 누르는 키라 그대로 둔다.
      if (SCROLL_KEYS.has(event.key) || (event.key === " " && !inBubble && !onAction)) event.preventDefault();
    };
    // 창을 모바일 폭으로 줄이면 투어가 가려진 채 화면만 잠기므로 닫는다.
    const desktop = window.matchMedia("(min-width: 769px)");
    const onViewport = () => {
      if (!desktop.matches) onClose(false);
    };
    window.addEventListener("scroll", onScroll);
    window.addEventListener("wheel", block, { passive: false });
    window.addEventListener("touchmove", block, { passive: false });
    window.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onViewport);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", block);
      window.removeEventListener("touchmove", block);
      window.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onViewport);
    };
  }, [onClose]);

  if (!step) return null;
  const ring = settled?.rect;
  const pos = placed?.pos;

  // 앱 화면 밖(body)에 그린다 — 부모가 앱 화면을 inert로 막아도 투어는 눌려야 한다.
  return createPortal(
    <>
      {ring && (
        <div
          aria-hidden="true"
          className={`tour-ring${moving ? " is-moving" : ""}`}
          ref={ringRef}
          style={{
            top: ring.top - RING_PAD,
            left: ring.left - RING_PAD,
            width: ring.width + RING_PAD * 2,
            height: ring.height + RING_PAD * 2,
          }}
        />
      )}
      <div
        aria-describedby="tour-body"
        aria-labelledby="tour-title"
        className={`tour-bubble tour-bubble-${pos?.side ?? shown.placement}${visible ? " is-visible" : ""}`}
        ref={bubbleRef}
        role="dialog"
        style={{ width: BUBBLE_WIDTH, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      >
        {pos && pos.side !== "inside" && (
          <span
            aria-hidden="true"
            className="tour-arrow"
            style={pos.side === "left" || pos.side === "right" ? { top: pos.arrow } : { left: pos.arrow }}
          />
        )}
        <p className="tour-title" id="tour-title">{shown.title}</p>
        <p className="tour-body" id="tour-body">{shown.body}</p>
        <div className="tour-footer">
          <span className="tour-count">{shownIndex + 1} / {steps.length}</span>
          <div className="tour-actions">
            {!isLast && (
              <button className="tour-skip" onClick={() => onClose(false)} type="button">
                건너뛰기
              </button>
            )}
            {index > 0 && (
              <button className="tour-prev" disabled={!visible} onClick={() => setIndex(index - 1)} type="button">
                이전
              </button>
            )}
            {shown.action ? (
              <span className="tour-hint">직접 눌러 보세요</span>
            ) : (
              <button
                className="tour-next"
                disabled={!visible}
                onClick={() => (isLast ? onClose(true) : setIndex(index + 1))}
                ref={nextRef}
                type="button"
              >
                {isLast ? "시작하기" : "다음"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
