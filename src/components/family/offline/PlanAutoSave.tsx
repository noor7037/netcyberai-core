'use client';

import { useEffect } from 'react';
import { AUTO_IDLE_MS, AUTO_TRIED_KEY, autoSaveWhen, chaptersToSave, storageRoom, triedToday } from '@/lib/family/auto-pack';
import { DATA_SAVER_KEY, dataSaverState } from '@/lib/family/data-saver';
import { indiaDate } from '@/lib/time/india';
import { downloadPack, listPacks } from './store';

// Today's plan saved for offline by itself (C539), on the home screen, when Control has the offline module on. Draws
// nothing. The rules (Wi-Fi or idle, the data-saver, the day's limit and the phone's budget) are src/lib/family/auto-pack.ts;
// the download is the one "Save for offline" uses. One chapter at a time; leaving the home screen stops it.
type Conn = { saveData?: boolean; type?: string; effectiveType?: string };
const INPUT = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
const offline = () => navigator.onLine === false;

function stored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function PlanAutoSave({ childId, items }: { childId: string; items: { topicKey: string; done: boolean }[] }) {
  const plan = items.map((i) => `${i.topicKey}:${i.done ? 1 : 0}`).join(',');
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: Conn }).connection;
    const when = autoSaveWhen({ online: !offline(), saveData: conn?.saveData, type: conn?.type, effectiveType: conn?.effectiveType }, dataSaverState(stored(DATA_SAVER_KEY), conn?.saveData).on);
    if (when === 'never') return;
    let live = true;
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (started || !live || offline() || document.visibilityState === 'hidden') return;
      started = true;
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      if (!storageRoom(est?.usage, est?.quota)) return;
      const day = indiaDate();
      const tried = triedToday(stored(AUTO_TRIED_KEY), day, childId);
      const all = await listPacks();
      const mine = all.filter((p) => p.childId === childId).map((p) => ({ chapterKey: p.chapterKey, expiresAt: p.pack.expiresAt }));
      const bytes = all.reduce((n, p) => n + (p.pack.bytes || 0), 0);
      const parsed = plan ? plan.split(',').map((x) => ({ topicKey: x.slice(0, x.lastIndexOf(':')), done: x.endsWith(':1') })) : [];
      for (const key of chaptersToSave(parsed, mine, bytes, tried, Date.now())) {
        if (!live || offline()) break;
        tried.push(key);
        try {
          window.localStorage.setItem(AUTO_TRIED_KEY, JSON.stringify({ day, child: childId, tried }));
        } catch {
          // Storage blocked: nothing is saved either.
        }
        await downloadPack(childId, key);
      }
    };
    // After the page has settled: at once on Wi-Fi, else once nothing has been touched for a while.
    const later = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
        if (idle) idle(() => void run());
        else void run();
      }, ms);
    };
    const touched = () => later(AUTO_IDLE_MS);
    if (when === 'now') later(3000);
    else {
      touched();
      for (const e of INPUT) window.addEventListener(e, touched, { passive: true, capture: true });
    }
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      for (const e of INPUT) window.removeEventListener(e, touched, { capture: true });
    };
  }, [childId, plan]);
  return null;
}
