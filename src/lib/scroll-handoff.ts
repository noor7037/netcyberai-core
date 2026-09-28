'use client';

import { useEffect, type RefObject } from 'react';

// Wheel and trackpad scrolling that passes straight from a preview's own
// scroll area to the page (founder, 2026-09-29, Decision Log C85).
//
// Browsers "latch" each scroll gesture to the scroll area it started in:
// once that area reaches its top or bottom, the rest of the gesture
// (trackpad momentum included) is dropped, and the page only moves after
// the visitor pauses and starts a new gesture. Inside the phone and
// dashboard previews that felt like the page was stuck.
//
// So inside such an area every wheel event is handled here: it scrolls the
// area first and hands whatever is left straight to the page, in the same
// event, instantly (the page's CSS smooth scrolling would add lag).
// Taking over has to start with the first event of a gesture: Chrome only
// lets a gesture be cancelled at its start, so a handler that waited for
// the boundary could no longer stop the latch.
//
// Left to the browser: areas with nothing to scroll (they already chain),
// sideways and pinch-zoom gestures, nested scroll areas that can still
// move, gestures that began elsewhere on the page, and touch screens.

function canScroll(el: Element, dy: number): boolean {
  const style = getComputedStyle(el);
  if (!/(auto|scroll)/.test(style.overflowY)) return false;
  if (dy > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  return el.scrollTop > 0;
}

// How much of a wheel movement the area takes and how much goes on to the
// page: the area moves as far as it can towards its edge, the rest passes on.
export function splitScroll(scrollTop: number, max: number, dy: number): { inside: number; rest: number } {
  const inside = Math.max(-scrollTop, Math.min(max - scrollTop, dy));
  const rest = dy - inside;
  return { inside, rest: Math.abs(rest) < 0.5 ? 0 : rest };
}

export function handOffWheel(area: HTMLElement): () => void {
  const onWheel = (e: WheelEvent) => {
    if (!e.cancelable || e.defaultPrevented || e.ctrlKey) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? area.clientHeight : 1;
    const dy = e.deltaY * unit;
    if (!dy) return;
    const max = area.scrollHeight - area.clientHeight;
    if (max <= 0) return;
    // A scrollable box nested inside the area gets the wheel first.
    for (let n = e.target instanceof Element ? e.target : null; n && n !== area; n = n.parentElement) {
      if (canScroll(n, dy)) return;
    }
    e.preventDefault();
    const { inside, rest } = splitScroll(area.scrollTop, max, dy);
    if (inside) area.scrollBy({ top: inside, behavior: 'instant' });
    if (rest) window.scrollBy({ top: rest, behavior: 'instant' });
  };
  area.addEventListener('wheel', onWheel, { passive: false });
  return () => area.removeEventListener('wheel', onWheel);
}

export function useWheelHandoff(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return handOffWheel(el);
  }, [ref]);
}
