'use client';

import { useEffect, useState } from 'react';
import { isTyping, keyboardInset } from './useKeyboardInset';

// The Ask pill above the keyboard (founder, 18 Nov 2026, third report). Root cause, confirmed: on an Android phone (Gboard) the
// keyboard lies OVER the page. The layout viewport keeps its height, so a bar fixed or sticky to the page's foot stays under the
// keys; and where the page tells us nothing (an edge-to-edge web view reports no visual-viewport change at all) the old
// `useKeyboardInset` read 0 and moved nothing. `interactive-widget=resizes-content` is only a request.
//
// Now the whole bottom cluster is driven from what can be measured, in this order:
//   visual   the visual viewport is smaller than the layout viewport: lift by exactly the part it covers (iOS Safari, Chrome's
//            default). A bar fixed to the layout viewport is raised by that many pixels.
//   resized  the layout viewport itself shrank below the height it had before a field was focused (resizes-content working):
//            a fixed bar is already on the keys, so it is not lifted again.
//   estimate a touch phone, a text field focused for a moment, and neither of the above: the keyboard height last measured on
//            this phone, else a typical 42 % of the screen, so the pill is never under the keys.
// With no text field focused, the pill returns to the tab bar's place and the tab bar returns. The rules are pure (below), the
// hook only feeds them the browser's numbers and writes `data-fam-kb` and `--fam-kb-lift` on <html>.

export const LIFT_SETTLE_MS = 180;
export const TYPICAL_KEYBOARD = 0.42;
export const MIN_ESTIMATE = 200;
const STORE = 'fam.kb.h';

export type LiftInput = {
  typing: boolean;
  innerHeight: number;
  // The tallest layout height seen while no field had the focus (the page's unobstructed height); 0 when not known yet.
  baseline: number;
  vvHeight: number | null;
  vvOffsetTop: number;
  scale: number;
  // A touch phone (coarse pointer, under 1024 px wide).
  phone: boolean;
  // The focus has stayed long enough for a real keyboard signal to have come (LIFT_SETTLE_MS).
  settled: boolean;
  // The keyboard height last measured on this phone, 0 when none.
  lastKnown: number;
};
export type Lift = { open: boolean; lift: number; source: 'none' | 'visual' | 'resized' | 'estimate' };
const CLOSED: Lift = { open: false, lift: 0, source: 'none' };

export function keyboardLift(i: LiftInput): Lift {
  if (!i.typing || i.scale > 1.01) return CLOSED;
  if (i.vvHeight !== null) {
    const covered = keyboardInset(i.innerHeight, { height: i.vvHeight, offsetTop: i.vvOffsetTop, scale: i.scale });
    if (covered > 0) return { open: true, lift: covered, source: 'visual' };
  }
  if (i.baseline > 0 && i.baseline - i.innerHeight >= 120) return { open: true, lift: 0, source: 'resized' };
  if (i.phone && i.settled) {
    const guess = i.lastKnown >= MIN_ESTIMATE ? i.lastKnown : Math.round(i.innerHeight * TYPICAL_KEYBOARD);
    return { open: true, lift: Math.min(Math.max(guess, MIN_ESTIMATE), Math.round(i.innerHeight * 0.55)), source: 'estimate' };
  }
  return CLOSED;
}

const readKnown = (): number => {
  try {
    const n = Number(window.localStorage.getItem(STORE));
    return Number.isFinite(n) && n >= MIN_ESTIMATE ? n : 0;
  } catch {
    return 0;
  }
};
const remember = (px: number) => {
  try {
    window.localStorage.setItem(STORE, String(Math.round(px)));
  } catch {
    /* a private window: the typical height is used */
  }
};

export function useKeyboardLift(): Lift {
  const [state, setState] = useState<Lift>(CLOSED);
  useEffect(() => {
    let baseline = 0;
    let focusedAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const vv = window.visualViewport ?? null;
    const phone = () => window.matchMedia?.('(pointer: coarse) and (max-width: 1023px)').matches === true;
    const layoutHeight = () => Math.max(window.innerHeight, document.documentElement.clientHeight || 0);
    const read = () => {
      const typing = isTyping(document.activeElement);
      // With no field focused the page is unobstructed: its height now is the one a shrunk page is compared with.
      if (!typing) baseline = layoutHeight();
      const next = keyboardLift({
        typing,
        innerHeight: layoutHeight(),
        baseline,
        vvHeight: vv ? vv.height : null,
        vvOffsetTop: vv ? vv.offsetTop : 0,
        scale: vv ? vv.scale : 1,
        phone: phone(),
        settled: typing && Date.now() - focusedAt >= LIFT_SETTLE_MS,
        lastKnown: readKnown(),
      });
      if (next.source === 'visual' && next.lift >= MIN_ESTIMATE) remember(next.lift);
      setState((prev) => (prev.open === next.open && prev.lift === next.lift && prev.source === next.source ? prev : next));
      // A moment later the estimate may apply: read again once the field has had its settling time.
      clearTimeout(timer);
      if (typing && Date.now() - focusedAt < LIFT_SETTLE_MS) timer = setTimeout(read, LIFT_SETTLE_MS - (Date.now() - focusedAt) + 20);
    };
    const onFocusIn = () => {
      if (isTyping(document.activeElement)) focusedAt = Date.now();
      read();
    };
    const onFocusOut = () => void setTimeout(read, 60);
    baseline = layoutHeight();
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('focusout', onFocusOut);
    window.addEventListener('resize', read);
    window.addEventListener('orientationchange', read);
    vv?.addEventListener('resize', read);
    vv?.addEventListener('scroll', read);
    read();
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('resize', read);
      window.removeEventListener('orientationchange', read);
      vv?.removeEventListener('resize', read);
      vv?.removeEventListener('scroll', read);
    };
  }, []);
  // The page's own stylesheet reads these two: the tab bar steps aside while the keyboard is up, and the Ask pill rises.
  useEffect(() => {
    const root = document.documentElement;
    if (state.open) {
      root.setAttribute('data-fam-kb', 'open');
      root.style.setProperty('--fam-kb-lift', `${state.lift}px`);
    } else {
      root.removeAttribute('data-fam-kb');
      root.style.removeProperty('--fam-kb-lift');
    }
    return () => {
      root.removeAttribute('data-fam-kb');
      root.style.removeProperty('--fam-kb-lift');
    };
  }, [state.open, state.lift]);
  return state;
}
