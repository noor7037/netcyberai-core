'use client';

import { useEffect } from 'react';
import { claimStore, clearOffline, flushAnswers, keepShell, listPacks, rememberChild } from './store';

// Offline packs on every signed-in Family page (M2-9, C283). Draws nothing. It registers the service worker for /family
// (production builds, when Control has the offline module on), hands the phone's store to this account (another
// account's packs and answers are deleted first), remembers the active child for the offline shell, keeps the shell
// fresh while packs are saved, and sends the answers made offline when the connection is there.
export function OfflineSync({ owner, childId, on }: { owner: string; childId: string | null; on: boolean }) {
  useEffect(() => {
    let live = true;
    const send = () => {
      if (navigator.onLine !== false) void flushAnswers();
    };
    void (async () => {
      await claimStore(owner);
      if (!live) return;
      if (childId) rememberChild(childId);
      if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
        if (on) {
          await navigator.serviceWorker.register('/sw.js', { scope: '/family' }).catch(() => undefined);
          if ((await listPacks()).length) keepShell();
        } else {
          // Control switched offline packs off: the saved packs go, and so does the worker for /family, unless the parent
          // turned notifications on, which it carries (M3-8b, C339).
          const reg = await navigator.serviceWorker.getRegistration('/family/').catch(() => undefined);
          if (reg && new URL(reg.scope).pathname.startsWith('/family')) {
            await clearOffline();
            if (!(await reg.pushManager?.getSubscription().catch(() => null))) await reg.unregister();
          }
        }
      }
      send();
    })();
    window.addEventListener('online', send);
    return () => {
      live = false;
      window.removeEventListener('online', send);
    };
  }, [owner, childId, on]);
  return null;
}
