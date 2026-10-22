'use client';

import { useState } from 'react';
import type { PublicItem } from '@/lib/family/items';
import { fill, type Words } from '@/lib/family/fill';
import { familyApi } from '../client';
import { Card, SUBJECT_TONE } from './BlockViews';

// A check or practice (M1-5, C251): the hint comes first, on asking or after a first wrong answer; the server checks
// every answer (the phone never holds the key). A second wrong answer shows the exact misunderstanding that option
// reveals, and offers a different explanation with new targeted questions (onRetry).
// With no connection (M2-9, C283), an answer is kept on the phone (onOffline) and checked when the internet is back.
type State = { picked: number | null; tries: number; hint: string | null; result: { correct: boolean; explanation: string; revisitDay?: string | null } | null; busy: boolean; kept?: boolean };
type Offline = (token: string, choice: number) => Promise<boolean>;

function Question({ item, w, tone, onRetry, onAnswered, onOffline }: { item: PublicItem; w: Words; tone: string; onRetry: (token: string, choice: number) => void; onAnswered?: (correct: boolean) => void; onOffline?: Offline }) {
  const [s, setS] = useState<State>({ picked: null, tries: 0, hint: null, result: null, busy: false });
  const askHint = async () => {
    const r = await familyApi<{ hint: string }>('/api/family/check', 'POST', { token: item.token, hint: true });
    if (r.ok) setS((x) => ({ ...x, hint: r.data.hint }));
  };
  const answer = async (choice: number) => {
    setS((x) => ({ ...x, picked: choice, busy: true }));
    const r = await familyApi<{ correct: boolean; explanation: string; revisitDay?: string | null }>('/api/family/check', 'POST', { token: item.token, choice, hintUsed: s.hint !== null });
    if (!r.ok && r.status === 0 && onOffline && (await onOffline(item.token, choice))) return setS((x) => ({ ...x, busy: false, kept: true }));
    if (!r.ok) return setS((x) => ({ ...x, busy: false }));
    const tries = s.tries + 1;
    onAnswered?.(r.data.correct);
    if (!r.data.correct && tries === 1) {
      // Hint first: a first wrong answer brings the hint and another go, not the answer.
      const h = s.hint ?? (await familyApi<{ hint: string }>('/api/family/check', 'POST', { token: item.token, hint: true }).then((x) => (x.ok ? x.data.hint : null)));
      return setS({ picked: choice, tries, hint: h, result: null, busy: false });
    }
    setS({ picked: choice, tries, hint: s.hint, result: r.data, busy: false });
  };
  const done = s.result !== null || s.kept === true;
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-off-white p-3">
      <p className="text-base font-semibold text-slate">{item.question}</p>
      <div role="group" aria-label={item.question} className="grid gap-2">
        {item.options.map((o, i) => {
          const chosen = s.picked === i;
          const look = s.result && chosen ? (s.result!.correct ? 'ring-2 ring-emerald-text bg-emerald/10' : 'ring-2 ring-coral-deep bg-coral/10') : chosen && s.kept ? 'ring-2 ring-royal' : chosen && s.tries > 0 ? 'ring-2 ring-coral-deep/60' : 'ring-1 ring-slate/15';
          return (
            <button key={i} type="button" disabled={s.busy || done} onClick={() => void answer(i)} className={`min-h-[44px] rounded-xl bg-white px-4 py-2 text-left text-base text-slate ${look}`}>
              {o}
            </button>
          );
        })}
      </div>
      {!done && !s.hint && (
        <button type="button" onClick={() => void askHint()} className="min-h-[44px] self-start px-1 text-sm font-semibold text-royal underline-offset-4 hover:underline">
          {w['fam.check.hint']}
        </button>
      )}
      {!done && s.hint && (
        <p role="status" className="rounded-xl bg-sunshine/30 px-3 py-2 text-sm text-slate">
          <span className="font-bold">{w['fam.check.hintLabel']} </span>
          {s.hint}
        </p>
      )}
      {s.kept && (
        <p role="status" data-kept className="rounded-xl bg-sunshine/30 px-3 py-2 text-sm text-slate">
          {w['fam.offline.pack.answerSaved']}
        </p>
      )}
      {done && s.result && (
        <div role="status" className={`flex flex-col gap-2 rounded-xl px-3 py-2 text-sm text-slate ${s.result!.correct ? 'bg-emerald/10' : 'bg-coral/10'}`}>
          <p className="font-bold">{s.result!.correct ? w['fam.check.right'] : w['fam.check.notYet']}</p>
          <p>{s.result!.explanation}</p>
          {!s.result!.correct && s.result!.revisitDay && <p data-revisit>{fill(w['fam.plan.comesBack'], { day: s.result!.revisitDay })}</p>}
          {!s.result!.correct && (
            <button type="button" onClick={() => onRetry(item.token, s.picked!)} className={`min-h-[44px] self-start rounded-full px-4 text-sm font-bold ${SUBJECT_TONE[tone]?.chip ?? 'bg-royal text-white'}`}>
              {w['fam.check.explainAgain']}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function QuizView({ kind, items, w, tone, onRetry, onAnswered, onOffline }: { kind: 'check' | 'practice'; items: PublicItem[]; w: Words; tone: string; onRetry: (token: string, choice: number) => void; onAnswered?: (correct: boolean) => void; onOffline?: Offline }) {
  return (
    <Card title={kind === 'check' ? w['fam.block.check'] : w['fam.block.practice']} tone={tone} tag={kind}>
      <ol className="flex flex-col gap-3">
        {items.map((item) => (
          <Question key={item.token} item={item} w={w} tone={tone} onRetry={onRetry} onAnswered={onAnswered} onOffline={onOffline} />
        ))}
      </ol>
    </Card>
  );
}
