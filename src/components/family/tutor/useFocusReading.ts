'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HIDE_AFTER_MS, chromeOnScroll, isPageTap, mayAutoHide, scrollIntent } from '@/lib/family/focus-reading';
import { isTyping } from './useKeyboardInset';

// Focus Reading: hides the Ask pill and the tab dock (CSS keyed on <html data-fam-chrome="hidden">, family.css) while
// the child reads, and brings them back on a tap or a scroll up. With reduced motion nothing hides by itself: the
// Focus button (`toggle`) does it, on purpose. The bars stay while a hand or the keyboard is on them, and while a
// control inside them has the focus. Nothing here moves focus.
const CHROME = '[data-fam-dock],[data-tutor-composer]';
const inChrome = (el: EventTarget | null) => el instanceof Element && !!el.closest(CHROME);

export function useFocusReading({ enabled, reading }: { enabled: boolean; reading: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [said, setSaid] = useState<'on' | 'off' | null>(null);
  const hiddenRef = useRef(false);
  const held = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(0);
  const readingRef = useRef(reading);
  readingRef.current = reading;
  const reducedRef = useRef(false);

  const apply = useCallback((h: boolean) => {
    hiddenRef.current = h;
    setHidden(h);
  }, []);
  const disarm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const arm = useCallback(() => {
    disarm();
    if (reducedRef.current) return;
    timer.current = setTimeout(() => {
      if (mayAutoHide({ held: held.current, y: window.scrollY, reading: readingRef.current, reduced: reducedRef.current })) apply(true);
    }, HIDE_AFTER_MS);
  }, [apply]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      reducedRef.current = mq.matches;
      setReduced(mq.matches);
      if (mq.matches) disarm();
    };
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    last.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const intent = scrollIntent(last.current, y);
      if (intent !== 'none') last.current = y;
      if (reducedRef.current) return;
      const act = chromeOnScroll(intent, y, held.current || isTyping(document.activeElement) || inChrome(document.activeElement));
      if (act === 'hide') apply(true);
      else if (act === 'show') {
        if (hiddenRef.current) apply(false);
        arm();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (inChrome(e.target)) {
        held.current = true;
        disarm();
      }
    };
    const onUp = (e: PointerEvent) => {
      const wasHeld = held.current;
      held.current = false;
      if (reducedRef.current) return;
      if (isPageTap(e.target as Element | null) && hiddenRef.current) apply(false);
      if (wasHeld || isPageTap(e.target as Element | null)) arm();
    };
    const onFocusIn = (e: FocusEvent) => {
      if (inChrome(e.target) || isTyping(e.target as Element)) {
        held.current = true;
        disarm();
        if (hiddenRef.current) apply(false);
      }
    };
    const onFocusOut = () => {
      requestAnimationFrame(() => {
        if (!inChrome(document.activeElement) && !isTyping(document.activeElement)) {
          held.current = false;
          arm();
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      disarm();
    };
  }, [enabled, apply, arm]);

  // Read-aloud playing: the bars rest; it stops: they return.
  useEffect(() => {
    if (!enabled || reducedRef.current) return;
    if (reading) {
      if (!held.current) apply(true);
    } else if (hiddenRef.current) apply(false);
  }, [reading, enabled, apply]);

  // The attribute the stylesheet reads. Gone when the window leaves.
  useEffect(() => {
    const root = document.documentElement;
    if (enabled && hidden) root.setAttribute('data-fam-chrome', 'hidden');
    else root.removeAttribute('data-fam-chrome');
    return () => root.removeAttribute('data-fam-chrome');
  }, [enabled, hidden]);

  const toggle = useCallback(() => {
    const next = !hiddenRef.current;
    apply(next);
    setSaid(next ? 'on' : 'off');
  }, [apply]);

  return { hidden: enabled && hidden, reduced, toggle, said };
}
