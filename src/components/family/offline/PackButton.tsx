'use client';

import { useEffect, useState } from 'react';
import { sizeText } from '@/lib/family/data-saver';
import { fill, type Words } from '@/lib/family/fill';
import type { ChapterPack } from '@/lib/family/pack';
import { familyApi } from '../client';
import { FamIcon } from '../FamIcon';
import { keepShell, listPacks, removePack, savePack } from './store';

// "Save for offline" on a chapter (M2-9, C283): its size is shown before anything is fetched; the pack is kept in this
// phone's IndexedDB, "Saved" with the day it is kept until, and "Remove".
// F2 on D1 (C230-Q): a drawn tick (never a device emoji), buttons that press, and "Save" looks disabled while saving.
type State = 'checking' | 'idle' | 'saving' | 'saved' | 'failed';

export function PackButton({ w, lang, childId, chapterKey, chapterTitle, bytes, missing }: { w: Words; lang: 'en' | 'hi'; childId: string; chapterKey: string; chapterTitle: string; bytes: number; missing: number }) {
  const [state, setState] = useState<State>('checking');
  const [until, setUntil] = useState<string | null>(null);
  const size = sizeText(bytes);
  const day = (iso: string) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

  useEffect(() => {
    let live = true;
    void listPacks(childId).then((packs) => {
      if (!live) return;
      const mine = packs.find((p) => p.chapterKey === chapterKey);
      setUntil(mine ? mine.pack.expiresAt : null);
      setState(mine ? 'saved' : 'idle');
    });
    return () => {
      live = false;
    };
  }, [childId, chapterKey]);

  const save = async () => {
    setState('saving');
    const r = await familyApi<ChapterPack>(`/api/family/pack?chapter=${encodeURIComponent(chapterKey)}`, 'GET');
    if (!r.ok || r.data.childId !== childId || !(await savePack(r.data))) return setState('failed');
    keepShell(true);
    setUntil(r.data.expiresAt);
    setState('saved');
  };
  const remove = async () => {
    await removePack(childId, chapterKey);
    setUntil(null);
    setState('idle');
  };

  if (state === 'checking') return <div className="min-h-[44px]" aria-hidden="true" />;
  if (state === 'saved') {
    return (
      <div data-pack="saved" className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-emerald/10 px-3 py-1">
        <p className="text-sm font-semibold text-slate">
          <span aria-hidden="true" className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-text align-[-0.3em] text-white">
            <FamIcon name="check" className="h-3.5 w-3.5" />
          </span>
          {w['fam.offline.pack.saved']}
          {until && <span className="block text-xs font-normal">{fill(w['fam.offline.pack.until'], { day: day(until) })}</span>}
        </p>
        <button type="button" onClick={() => void remove()} aria-label={fill(w['fam.offline.pack.removeLabel'], { chapter: chapterTitle })} className="fam-press min-h-[44px] rounded-xl px-3 text-sm font-bold text-royal-deep underline-offset-4 hover:underline">
          {w['fam.offline.pack.remove']}
        </button>
      </div>
    );
  }
  return (
    <div data-pack={state} className="mt-1 flex flex-col gap-1">
      <button
        type="button"
        disabled={state === 'saving'}
        onClick={() => void save()}
        className="fam-press flex min-h-[44px] items-center justify-between gap-2 rounded-2xl bg-off-white px-3 text-sm font-bold text-royal-deep ring-1 ring-slate/15 hover:bg-slate/5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex items-center gap-2">
          <FamIcon name="download" className="h-5 w-5" />
          {state === 'saving' ? w['fam.offline.pack.saving'] : w['fam.offline.pack.save']}
          {/* The chapter, for a screen reader: the visible words stay the start of the button's name. */}
          <span className="sr-only" lang={/[ऀ-ॿ]/.test(chapterTitle) ? 'hi' : 'en'}>
            {chapterTitle}
          </span>
        </span>
        <span data-pack-size className="font-semibold text-slate">
          {fill(w['fam.offline.pack.size'], { n: size.n, unit: size.unit })}
        </span>
      </button>
      {missing > 0 && <p className="px-1 text-xs text-slate">{fill(w['fam.offline.pack.partial'], { n: missing })}</p>}
      {state === 'failed' && (
        <p role="status" className="px-1 text-sm text-coral-deep">
          {w['fam.offline.pack.failed']}
        </p>
      )}
    </div>
  );
}
