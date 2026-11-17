'use client';

import { useEffect, useState } from 'react';

// W11-A (C416): how much of the page the phone's keyboard covers. C415 asks the browser to shrink the page for the
// keyboard (interactive-widget=resizes-content), but the Android app's edge-to-edge web view, and iOS Safari, keep the
// page its full height and only the visual viewport shrinks. Then the keyboard covers the bottom of the page, and this
// is how much: the layout viewport's height less the visible part and how far that part is scrolled down. Where the page
// does shrink, the two heights agree and this is 0, so nothing moves twice. While the page is pinch-zoomed it is 0 too:
// the visible part is smaller then for a reason that is not the keyboard.
// 17 Nov 2026: the layout height is the larger of innerHeight and the root's clientHeight (an iOS Safari that reports a
// shrunk innerHeight still keeps its layout viewport); a gap smaller than a keyboard (a browser bar settling) is 0; and
// with no text field focused it is 0, so the composer always returns above the tab dock when the keyboard closes.

type Viewport = Pick<VisualViewport, 'height' | 'offsetTop' | 'scale' | 'addEventListener' | 'removeEventListener'>;
type Listener = { addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void };
export type KeyboardWindow = { innerHeight: number; visualViewport?: Viewport | null; document?: { documentElement?: { clientHeight: number } | null } } & Partial<Listener>;

// Smaller than any phone keyboard: a browser's toolbar growing or shrinking, not the keyboard.
export const KEYBOARD_MIN = 120;

export function keyboardInset(innerHeight: number, vv: Pick<Viewport, 'height' | 'offsetTop' | 'scale'>, clientHeight = 0): number {
  if (vv.scale > 1.01) return 0;
  const layout = Math.max(innerHeight, clientHeight);
  const covered = Math.round(layout - vv.height - vv.offsetTop);
  return covered >= KEYBOARD_MIN ? covered : 0;
}

// Calls `on` with the inset now and whenever the visual viewport moves or resizes, or the focus moves; returns the
// unsubscribe. `typing`: whether a text field has the focus (none: 0). Where the browser has no visualViewport it does
// nothing.
export function watchKeyboard(win: KeyboardWindow, on: (px: number) => void, typing: () => boolean = () => true): () => void {
  const vv = win.visualViewport;
  if (!vv) return () => undefined;
  const read = () => on(typing() ? keyboardInset(win.innerHeight, vv, win.document?.documentElement?.clientHeight ?? 0) : 0);
  // iOS reports the closed keyboard late: read again once the focus has settled.
  const later = () => void setTimeout(read, 60);
  vv.addEventListener('resize', read);
  vv.addEventListener('scroll', read);
  win.addEventListener?.('focusin', later);
  win.addEventListener?.('focusout', later);
  read();
  return () => {
    vv.removeEventListener('resize', read);
    vv.removeEventListener('scroll', read);
    win.removeEventListener?.('focusin', later);
    win.removeEventListener?.('focusout', later);
  };
}

export function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return !['button', 'checkbox', 'radio', 'range', 'file', 'submit', 'reset', 'color', 'image'].includes((el as HTMLInputElement).type);
  return (el as HTMLElement).isContentEditable === true;
}

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => watchKeyboard(window as unknown as KeyboardWindow, setInset, () => isTyping(document.activeElement)), []);
  return inset;
}
