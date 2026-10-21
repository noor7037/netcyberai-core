'use client';

import { useEffect } from 'react';

// "Keep me signed in" (F1-1, C257): while the app is open, ask the server to renew the session, at most hourly from
// this phone (the server renews a session older than a day, or an hour when not kept; tokens and checks stay there). Draws
// nothing. Storage may be blocked; then it asks once per page, which is harmless.
const KEY = 'ncf.session.renewCheck';
const EVERY_MS = 60 * 60 * 1000;

function due(): boolean {
  try {
    return Date.now() - Number(window.localStorage.getItem(KEY) ?? 0) > EVERY_MS;
  } catch {
    return true;
  }
}

function checked() {
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Storage unavailable: the next page asks again.
  }
}

export function FamilySessionKeeper() {
  useEffect(() => {
    const renew = () => {
      if (document.visibilityState !== 'visible' || !due()) return;
      checked();
      void fetch('/api/family/auth/renew', { method: 'POST' }).catch(() => undefined);
    };
    renew();
    document.addEventListener('visibilitychange', renew);
    return () => document.removeEventListener('visibilitychange', renew);
  }, []);
  return null;
}
