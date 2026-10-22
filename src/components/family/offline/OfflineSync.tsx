'use client';

import { useEffect } from 'react';
import { claimStore, flushAnswers, keepShell, listPacks, rememberChild } from './store';

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
      if (on && process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
        await navigator.serviceWorker.register('/sw.js', { scope: '/family' }).catch(() => undefined);
        if ((await listPacks()).length) keepShell();
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
