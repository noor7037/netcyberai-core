'use client';

import { useEffect, type RefObject } from 'react';

// Scrolling that passes straight from a preview's own scroll area to the
// page (founder, 2026-09-29, Decision Log C85 wheel, C86 touch).
//
// Browsers "latch" each scroll gesture to the scroll area it started in:
// once that area reaches its top or bottom, the rest of the gesture
// (momentum included) is dropped, and the page only moves after the
// visitor pauses and starts a new gesture. Inside the phone and dashboard
// previews that felt like the page was stuck.
//
// Wheel and trackpad: inside such an area every wheel event is handled
// here. It scrolls the area first and hands whatever is left straight to
// the page, in the same event, instantly (the page's CSS smooth scrolling
// would add lag). Taking over has to start with the first event of a
// gesture: Chrome only lets a gesture be cancelled at its start, so a
// handler that waited for the boundary could no longer stop the latch.
//
// Touch: a swipe cannot be taken over once it moves, so the area keeps
// its native scrolling and the page is moved alongside it: while the
// finger drags past the area's edge the page follows the finger 1:1; a
// flick that ends past the edge glides the page on; and a flick that
// carries the area into its edge hands its remaining speed to the page.
// On touch screens the area does not bounce at its edges (globals.css),
// so the area and the page never move against each other.
//
// Left to the browser: sideways and pinch gestures, nested scroll areas
// that can still move, and gestures that began elsewhere on the page.

function canScroll(el: Element, dy: number): boolean {
  const style = getComputedStyle(el);
  if (!/(auto|scroll)/.test(style.overflowY)) return false;
  if (dy > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  return el.scrollTop > 0;
}

function nestedCanScroll(target: EventTarget | null, area: HTMLElement, dy: number): boolean {
  for (let n = target instanceof Element ? target : null; n && n !== area; n = n.parentElement) {
    if (canScroll(n, dy)) return true;
  }
  return false;
}

// How much of a movement the area takes and how much goes on to the page:
// the area moves as far as it can towards its edge, the rest passes on.
export function splitScroll(scrollTop: number, max: number, dy: number): { inside: number; rest: number } {
  const inside = Math.max(-scrollTop, Math.min(max - scrollTop, dy));
  const rest = dy - inside;
  return { inside, rest: Math.abs(rest) < 0.5 ? 0 : rest };
}

// Momentum for the page after a flick: speed in px per ms, decaying the
// way phone scrolling does (time constant ~325 ms).
export const GLIDE_TIME_CONSTANT = 325;
export const GLIDE_MIN_SPEED = 0.02;

export function glideDistance(v0: number): number {
  return Math.abs(v0) < GLIDE_MIN_SPEED ? 0 : v0 * GLIDE_TIME_CONSTANT;
}

let glideFrame = 0;
let glideStopperReady = false;

function stopGlide() {
  if (glideFrame) cancelAnimationFrame(glideFrame);
  glideFrame = 0;
}

function glide(v0: number) {
  stopGlide();
  if (!glideStopperReady) {
    // A new touch or wheel anywhere stops the page gliding, like a phone.
    glideStopperReady = true;
    document.addEventListener('touchstart', stopGlide, { passive: true, capture: true });
    document.addEventListener('wheel', stopGlide, { passive: true, capture: true });
  }
  let v = v0;
  let last = performance.now();
  const step = (now: number) => {
    const dt = Math.min(now - last, 50);
    last = now;
    window.scrollBy({ top: v * dt, behavior: 'instant' });
    v *= Math.exp(-dt / GLIDE_TIME_CONSTANT);
    const end = document.documentElement.scrollHeight - window.innerHeight - 1;
    if (Math.abs(v) < GLIDE_MIN_SPEED || (v < 0 && window.scrollY <= 0) || (v > 0 && window.scrollY >= end)) {
      glideFrame = 0;
      return;
    }
    glideFrame = requestAnimationFrame(step);
  };
  glideFrame = requestAnimationFrame(step);
}

export function handOffWheel(area: HTMLElement): () => void {
  const onWheel = (e: WheelEvent) => {
    if (!e.cancelable || e.defaultPrevented || e.ctrlKey) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? area.clientHeight : 1;
    const dy = e.deltaY * unit;
    if (!dy) return;
    const max = area.scrollHeight - area.clientHeight;
    // Nothing to scroll inside: the browser passes the wheel on by itself,
    // unless edge bouncing is switched off (touch screens), which also
    // stops that.
    if (max <= 0 && getComputedStyle(area).overscrollBehaviorY !== 'none') return;
    // A scrollable box nested inside the area gets the wheel first.
    if (nestedCanScroll(e.target, area, dy)) return;
    e.preventDefault();
    const { inside, rest } = splitScroll(area.scrollTop, Math.max(0, max), dy);
    if (inside) area.scrollBy({ top: inside, behavior: 'instant' });
    if (rest) window.scrollBy({ top: rest, behavior: 'instant' });
  };
  area.addEventListener('wheel', onWheel, { passive: false });
  return () => area.removeEventListener('wheel', onWheel);
}

export function handOffTouch(area: HTMLElement): () => void {
  let startX = 0;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let speed = 0; // screen px per ms, positive = content moving up (scrolling down)
  let axis: 'x' | 'y' | 'skip' | null = null;
  let handing = false;
  // After a flick inside the area: watch its native momentum reach an edge.
  let watchUntil = 0;
  let prevTop = 0;
  let prevT = 0;
  let areaSpeed = 0;

  const scale = () => (area.offsetHeight ? area.getBoundingClientRect().height / area.offsetHeight : 1);
  const atEdge = (dy: number) => {
    const max = area.scrollHeight - area.clientHeight;
    return max <= 0 || (dy > 0 ? area.scrollTop >= max - 1 : area.scrollTop <= 0);
  };

  const onStart = (e: TouchEvent) => {
    watchUntil = 0;
    if (e.touches.length !== 1) {
      axis = 'skip';
      return;
    }
    const t = e.touches[0];
    startX = t.clientX;
    startY = lastY = t.clientY;
    lastT = performance.now();
    speed = 0;
    axis = null;
    handing = false;
  };

  const onMove = (e: TouchEvent) => {
    if (axis === 'skip' || axis === 'x' || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (axis === null) {
      const ax = Math.abs(t.clientX - startX);
      const ay = Math.abs(t.clientY - startY);
      if (ax < 4 && ay < 4) return;
      axis = ax > ay ? 'x' : 'y';
      if (axis === 'x') return;
      if (nestedCanScroll(e.target, area, startY - t.clientY)) {
        axis = 'skip';
        return;
      }
    }
    const now = performance.now();
    const dy = lastY - t.clientY;
    const dt = Math.max(1, now - lastT);
    lastY = t.clientY;
    lastT = now;
    if (!dy) return;
    speed = 0.8 * (dy / dt) + 0.2 * speed;
    if (atEdge(dy)) {
      window.scrollBy({ top: dy, behavior: 'instant' });
      handing = true;
    } else {
      handing = false;
    }
  };

  const onEnd = () => {
    if (axis !== 'y') return;
    const now = performance.now();
    // A finger that rested before lifting does not flick.
    if (now - lastT > 80) speed = 0;
    if (Math.abs(speed) < 0.1) return;
    if (handing || atEdge(speed)) {
      glide(speed);
    } else {
      watchUntil = now + 2000;
      prevTop = area.scrollTop;
      prevT = now;
      areaSpeed = speed;
    }
  };

  const onScroll = () => {
    if (!watchUntil) return;
    const now = performance.now();
    if (now > watchUntil) {
      watchUntil = 0;
      return;
    }
    const dt = now - prevT;
    if (dt > 0) {
      const v = ((area.scrollTop - prevTop) / dt) * scale();
      if (v) areaSpeed = 0.7 * v + 0.3 * areaSpeed;
    }
    prevTop = area.scrollTop;
    prevT = now;
    if (atEdge(areaSpeed) && Math.abs(areaSpeed) >= 0.1) {
      watchUntil = 0;
      glide(areaSpeed);
    }
  };

  area.addEventListener('touchstart', onStart, { passive: true });
  area.addEventListener('touchmove', onMove, { passive: true });
  area.addEventListener('touchend', onEnd, { passive: true });
  area.addEventListener('touchcancel', onEnd, { passive: true });
  area.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    area.removeEventListener('touchstart', onStart);
    area.removeEventListener('touchmove', onMove);
    area.removeEventListener('touchend', onEnd);
    area.removeEventListener('touchcancel', onEnd);
    area.removeEventListener('scroll', onScroll);
  };
}

export function useScrollHandoff(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add('nca-handoff');
    const offWheel = handOffWheel(el);
    const offTouch = handOffTouch(el);
    return () => {
      offWheel();
      offTouch();
      el.classList.remove('nca-handoff');
    };
  }, [ref]);
}
