'use client';

import { useEffect, useState } from 'react';

// W11-A (C416): how much of the page the phone's keyboard covers. C415 asks the browser to shrink the page for the
// keyboard (interactive-widget=resizes-content), but the Android app's edge-to-edge web view, and iOS Safari, keep the
// page its full height and only the visual viewport shrinks. Then the keyboard covers the bottom of the page, and this
// is how much: the layout viewport's height less the visible part and how far that part is scrolled down. Where the page
// does shrink, the two heights agree and this is 0, so nothing moves twice. While the page is pinch-zoomed it is 0 too:
// the visible part is smaller then for a reason that is not the keyboard.

type Viewport = Pick<VisualViewport, 'height' | 'offsetTop' | 'scale' | 'addEventListener' | 'removeEventListener'>;
export type KeyboardWindow = { innerHeight: number; visualViewport?: Viewport | null };

export function keyboardInset(innerHeight: number, vv: Pick<Viewport, 'height' | 'offsetTop' | 'scale'>): number {
  if (vv.scale > 1.01) return 0;
  return Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
}

// Calls `on` with the inset now and whenever the visual viewport moves or resizes; returns the unsubscribe. Where the
// browser has no visualViewport it does nothing.
export function watchKeyboard(win: KeyboardWindow, on: (px: number) => void): () => void {
  const vv = win.visualViewport;
  if (!vv) return () => undefined;
  const read = () => on(keyboardInset(win.innerHeight, vv));
  vv.addEventListener('resize', read);
  vv.addEventListener('scroll', read);
  read();
  return () => {
    vv.removeEventListener('resize', read);
    vv.removeEventListener('scroll', read);
  };
}

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => watchKeyboard(window, setInset), []);
  return inset;
}
