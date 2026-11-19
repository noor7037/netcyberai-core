'use client';

import { useEffect, useRef } from 'react';

// The phone's Back (founder, 19 Nov 2026: "as we press back, the app directly closes"). The Android app (MainActivity, from
// APK 3) first asks the page: window.famBack() closes the topmost open panel (an attach menu, a photo sheet) and answers
// true; when nothing is open it answers false and the app goes back one page in the web view's history (Study → Home, a
// chapter → its subject), and only on the first page does Back leave the app. A browser's own Back is untouched.

type Closer = { close: () => void };
const stack: Closer[] = [];

declare global {
  interface Window {
    famBack?: () => boolean;
  }
}

export function famBack(): boolean {
  const top = stack.pop();
  if (!top) return false;
  top.close();
  return true;
}

if (typeof window !== 'undefined') window.famBack = famBack;

// Registers a panel's close; returns its removal (the hook's cleanup).
export function onBack(close: () => void): () => void {
  const me: Closer = { close };
  stack.push(me);
  return () => {
    const at = stack.indexOf(me);
    if (at >= 0) stack.splice(at, 1);
  };
}

// While `open`, Back closes this panel (the newest open panel first).
export function useBackClose(open: boolean, close: () => void): void {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return;
    return onBack(() => latest.current());
  }, [open]);
}
