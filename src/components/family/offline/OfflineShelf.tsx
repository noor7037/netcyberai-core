'use client';

import { useEffect, useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import type { PackTopic } from '@/lib/family/pack';
import { subjectTheme } from '@/lib/family/subject-theme';
import { EnglishMomentView, ExplanationView, KeyPointsView, WorkedExampleView } from '../blocks/BlockViews';
import { QuizView } from '../blocks/QuizView';
import { FamIcon, rise } from '../FamIcon';
import { SubjectGlyph } from '../ui/SubjectGlyph';
import { flushAnswers, listPacks, queueAnswer, queuedAnswers, rememberedChild, type SavedPack } from './store';
import { sameInkOnBothSides } from '@/lib/family/day-text';

// The chapters saved on this phone (M2-9, C283), on the Family app's offline shell. With no network the service worker
// answers every /family page with this shell, so the address may still be the page the child asked for: a saved topic's
// Understand page opens from its pack; anything else says "Needs internet". Answers are kept on the phone and sent,
// once, when the connection is back. Nothing here asks the server while offline.
// F2 on D1 (C230-Q): D1 cards that come in one after another, drawn icons (never a device emoji or an arrow
// character), and every tappable thing presses.
type Open = { pack: SavedPack; topic: PackTopic };

export function OfflineShelf({ w, lang }: { w: Words; lang: 'en' | 'hi' }) {
  const [packs, setPacks] = useState<SavedPack[] | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(0);
  const day = (iso: string) => sameInkOnBothSides(new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(iso)));

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

  if (packs === null) return null;
  const tone = open?.pack.pack.subject ?? 'mathematics';

  if (open) {
    const t = open.topic;
    return (
      <section data-offline-topic aria-labelledby="fam-offline-topic" className="flex w-full flex-col gap-3 text-left">
        <button type="button" onClick={() => setOpen(null)} className="fam-press inline-flex min-h-[44px] items-center gap-1 self-start rounded-2xl px-1 text-base font-bold text-ink underline-offset-4 hover:underline">
          <FamIcon name="back" className="h-5 w-5" /> {w['fam.offline.pack.allChapters']}
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
        {waiting > 0 && <Waiting text={fill(w['fam.offline.pack.waiting'], { n: waiting })} />}
      </section>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      {asked !== null && (
        <section role="status" data-needs-internet className="fam-card fam-rise flex items-start gap-3 bg-white p-4 text-base text-slate">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-coral/15 text-coral-deep">
            <FamIcon name="offline" className="h-5 w-5" />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="font-bold">{w['fam.offline.pack.needsInternet']}</span>
            <span>{asked ? w['fam.offline.pack.notInPack'] : w['fam.offline.pack.needsInternetLead']}</span>
          </span>
        </section>
      )}
      <section aria-labelledby="fam-offline-shelf" className="flex flex-col gap-2">
        <h2 id="fam-offline-shelf" className="px-1 text-lg font-extrabold text-slate">
          {w['fam.offline.pack.shelf']}
        </h2>
        {packs.length === 0 && <p className="fam-card fam-rise bg-white p-4 text-base text-slate">{w['fam.offline.pack.none']}</p>}
        <ol className="flex flex-col gap-2">
          {packs.map((p, i) => (
            <li key={p.id} className="fam-card fam-rise bg-white p-3" style={rise(Math.min(i, 8) * 50)}>
              <div className="flex items-center gap-3 px-1">
                <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-md ${subjectTheme(p.pack.subject).chip}`}>
                  <SubjectGlyph subject={p.pack.subject} className="h-5 w-5" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="bg-white text-base font-bold text-slate">{p.pack.chapter.title}</span>
                  <span className="bg-white text-xs text-slate">{fill(w['fam.offline.pack.until'], { day: day(p.pack.expiresAt) })}</span>
                </span>
              </div>
              <ul className="mt-1 flex flex-col">
                {p.pack.topics.map((topic) => (
                  <li key={topic.key}>
                    <button type="button" onClick={() => setOpen({ pack: p, topic })} className="fam-press flex min-h-[44px] w-full items-center gap-3 rounded-xl bg-white px-2 text-left text-sm text-slate hover:bg-slate/5">
                      <span aria-hidden="true" className={`ml-1 h-2 w-2 shrink-0 rounded-full ${subjectTheme(p.pack.subject).chip}`} />
                      <span className="min-w-0 flex-1">{topic.title}</span>
                      <FamIcon name="next" className="h-4 w-4 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
      {waiting > 0 && <Waiting text={fill(w['fam.offline.pack.waiting'], { n: waiting })} />}
    </div>
  );
}

// The answers kept on this phone, waiting for the connection.
function Waiting({ text }: { text: string }) {
  return (
    <p className="fam-card flex items-center gap-3 bg-white px-4 py-3 text-sm text-slate">
      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lesson-sky text-ink">
        <FamIcon name="upload" className="h-4 w-4" />
      </span>
      {text}
    </p>
  );
}
