'use client';

import { useEffect, useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import type { PackTopic } from '@/lib/family/pack';
import { EnglishMomentView, ExplanationView, KeyPointsView, WorkedExampleView } from '../blocks/BlockViews';
import { QuizView } from '../blocks/QuizView';
import { subjectColour } from '@/lib/family/subject-colours';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { flushAnswers, listPacks, queueAnswer, queuedAnswers, rememberedChild, type SavedPack } from './store';

// The chapters saved on this phone (M2-9, C283), on the Family app's offline shell. With no network the service worker
// answers every /family page with this shell, so the address may still be the page the child asked for: a saved topic's
// Understand page opens from its pack; anything else says "Needs internet". Answers are kept on the phone and sent,
// once, when the connection is back. Nothing here asks the server while offline.
type Open = { pack: SavedPack; topic: PackTopic };

export function OfflineShelf({ w, lang }: { w: Words; lang: 'en' | 'hi' }) {
  const [packs, setPacks] = useState<SavedPack[] | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(0);
  const day = (iso: string) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

  useEffect(() => {
    let live = true;
    const count = () => void queuedAnswers().then((q) => live && setWaiting(q.length));
    void (async () => {
      const child = rememberedChild();
      const mine = await listPacks(child);
      if (!live) return;
      setPacks(mine);
      // The page the child asked for, when the service worker answered it with this shell.
      if (location.pathname.startsWith('/family/understand')) {
        const key = new URLSearchParams(location.search).get('key');
        const hit = key ? mine.flatMap((p) => p.pack.topics.map((topic) => ({ pack: p, topic }))).find((x) => x.topic.key === key) : undefined;
        if (hit) setOpen(hit);
        else setAsked(key ?? '');
      } else if (location.pathname !== '/family/offline') setAsked('');
      count();
    })();
    const send = () => void flushAnswers().then((n) => live && setWaiting(n));
    window.addEventListener('online', send);
    if (navigator.onLine !== false) send();
    return () => {
      live = false;
      window.removeEventListener('online', send);
    };
  }, []);

  const keep = async (token: string, choice: number) => {
    const ok = await queueAnswer(token, choice);
    setWaiting((n) => n + (ok ? 1 : 0));
    return ok;
  };

  if (packs === null) return <Skeleton label={w['fam.offline.pack.shelf']} lines={2} className="w-full" />;
  const tone = open?.pack.pack.subject ?? 'mathematics';

  if (open) {
    const t = open.topic;
    return (
      <section data-offline-topic aria-labelledby="fam-offline-topic" className="flex w-full flex-col gap-3 text-left">
        <button type="button" onClick={() => setOpen(null)} className="inline-flex min-h-[44px] items-center gap-1 self-start rounded-2xl px-1 text-base font-bold text-royal-deep underline-offset-4 hover:underline">
          <span aria-hidden="true">←</span> {w['fam.offline.pack.allChapters']}
        </button>
        <h2 id="fam-offline-topic" className="text-xl font-extrabold text-slate">
          {t.title}
        </h2>
        <span className={`self-start rounded-full px-3 py-1 text-xs font-bold ${t.label === 'checked' ? 'bg-white text-emerald-text ring-1 ring-emerald-text/40' : 'bg-white text-slate ring-1 ring-slate/20'}`}>
          {t.label === 'checked' ? w['fam.label.checked'] : w['fam.label.aiMade']}
        </span>
        {t.blocks.map((b, i) => {
          if (b.type === 'explanation') return <ExplanationView key={i} b={b} w={w} tone={tone} />;
          if (b.type === 'worked_example') return <WorkedExampleView key={i} b={b} w={w} tone={tone} />;
          if (b.type === 'key_points') return <KeyPointsView key={i} b={b} w={w} tone={tone} />;
          return <EnglishMomentView key={i} b={b} w={w} tone={tone} />;
        })}
        {t.check.length > 0 && <QuizView kind="check" items={t.check} w={w} tone={tone} onRetry={() => location.assign(`/family/understand?kind=${t.kind}&key=${encodeURIComponent(t.key)}`)} onOffline={keep} />}
        {t.practice.length > 0 && <QuizView kind="practice" items={t.practice} w={w} tone={tone} onRetry={() => location.assign(`/family/understand?kind=${t.kind}&key=${encodeURIComponent(t.key)}`)} onOffline={keep} />}
        {waiting > 0 && <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate ring-1 ring-slate/10">{fill(w['fam.offline.pack.waiting'], { n: waiting })}</p>}
      </section>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      {asked !== null && (
        <section role="status" data-needs-internet className="flex flex-col gap-1 rounded-3xl bg-white p-4 text-base text-slate shadow-sm ring-1 ring-slate/10">
          <p className="font-bold">{w['fam.offline.pack.needsInternet']}</p>
          <p>{asked ? w['fam.offline.pack.notInPack'] : w['fam.offline.pack.needsInternetLead']}</p>
        </section>
      )}
      <section aria-labelledby="fam-offline-shelf" className="flex flex-col gap-2">
        <h2 id="fam-offline-shelf" className="px-1 text-lg font-extrabold text-slate">
          {w['fam.offline.pack.shelf']}
        </h2>
        {packs.length === 0 && (
          <div data-offline-empty>
            <EmptyState e="📦" title={w['fam.d13.offline.noneTitle']} body={w['fam.offline.pack.none']} action={{ href: '/family/study', label: w['fam.tab.study'] }} />
          </div>
        )}
        <ol className="flex flex-col gap-2">
          {packs.map((p) => (
            <li key={p.id} data-chapter-edge={p.pack.subject} className="relative overflow-hidden rounded-3xl bg-white p-3 pl-5 shadow-sm ring-1 ring-slate/10">
              <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${subjectColour(p.pack.subject).bar}`} />
              <p className="px-1 text-base font-bold text-slate">{p.pack.chapter.title}</p>
              <p className="px-1 text-xs text-slate">{fill(w['fam.offline.pack.until'], { day: day(p.pack.expiresAt) })}</p>
              <ul className="mt-1 flex flex-col">
                {p.pack.topics.map((topic) => (
                  <li key={topic.key}>
                    <button type="button" onClick={() => setOpen({ pack: p, topic })} className="flex min-h-[44px] w-full items-center rounded-xl px-2 text-left text-sm text-slate hover:bg-slate/5">
                      {topic.title}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
      {waiting > 0 && <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate ring-1 ring-slate/10">{fill(w['fam.offline.pack.waiting'], { n: waiting })}</p>}
    </div>
  );
}
