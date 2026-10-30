'use client';

import { useState } from 'react';
import type { PublicItem } from '@/lib/family/items';
import { fill, type Words } from '@/lib/family/fill';
import { familyApi } from '../client';
import { Card, SUBJECT_TONE } from './BlockViews';

// A check or practice (M1-5, C251): the hint is there on asking; the server checks every answer (the phone never holds
// the key). W8-AI: a wrong tap says "Not this one" and that option's own reason at once (what it gets wrong), leaves
// the other options open for another go, and offers a different explanation with new targeted questions (onRetry); a
// right tap says "Correct" and why.
// With no connection (M2-9, C283), an answer is kept on the phone (onOffline) and checked when the internet is back.
export type Checked = { correct: boolean; explanation: string; revisitDay?: string | null };
export type QuestionState = { picked: number | null; tries: number; hint: string | null; result: Checked | null; busy: boolean; kept?: boolean };
type Offline = (token: string, choice: number) => Promise<boolean>;
export const FRESH: QuestionState = { picked: null, tries: 0, hint: null, result: null, busy: false };

// The state after the server checked a tap: its answer is shown at once, right or wrong (W8-AI).
export function answered(s: QuestionState, choice: number, checked: Checked): QuestionState {
  return { picked: choice, tries: s.tries + 1, hint: s.hint, result: checked, busy: false };
}

function Question({ item, w, tone, onRetry, onAnswered, onOffline }: { item: PublicItem; w: Words; tone: string; onRetry: (token: string, choice: number) => void; onAnswered?: (correct: boolean) => void; onOffline?: Offline }) {
  const [s, setS] = useState<QuestionState>(FRESH);
  const askHint = async () => {
    const r = await familyApi<{ hint: string }>('/api/family/check', 'POST', { token: item.token, hint: true });
    if (r.ok) setS((x) => ({ ...x, hint: r.data.hint }));
  };
  const answer = async (choice: number) => {
    setS((x) => ({ ...x, picked: choice, busy: true }));
    const r = await familyApi<{ correct: boolean; explanation: string; revisitDay?: string | null }>('/api/family/check', 'POST', { token: item.token, choice, hintUsed: s.hint !== null });
    if (!r.ok && r.status === 0 && onOffline && (await onOffline(item.token, choice))) return setS((x) => ({ ...x, busy: false, kept: true }));
    if (!r.ok) return setS((x) => ({ ...x, busy: false }));
    onAnswered?.(r.data.correct);
    setS(answered(s, choice, r.data));
  };
  return <QuestionBody item={item} s={s} w={w} tone={tone} onPick={(i) => void answer(i)} onHint={() => void askHint()} onRetry={onRetry} />;
}

// What a question shows for its state (no state of its own).
export function QuestionBody({ item, s, w, tone, onPick, onHint, onRetry }: { item: PublicItem; s: QuestionState; w: Words; tone: string; onPick: (choice: number) => void; onHint: () => void; onRetry: (token: string, choice: number) => void }) {
  // A right answer ends the question; a wrong one shows its reason and leaves the other options open.
  const done = s.result?.correct === true || s.kept === true;
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-off-white p-3">
      <p className="text-base font-semibold text-slate">{item.question}</p>
      <div role="group" aria-label={item.question} className="grid gap-2">
        {item.options.map((o, i) => {
          const chosen = s.picked === i;
          const look = s.result && chosen ? (s.result.correct ? 'ring-2 ring-emerald-text bg-emerald/10' : 'ring-2 ring-coral-deep bg-coral/10') : chosen && s.kept ? 'ring-2 ring-royal' : 'ring-1 ring-slate/15';
          return (
            <button key={i} type="button" disabled={s.busy || done} onClick={() => onPick(i)} className={`min-h-[44px] rounded-xl bg-white px-4 py-2 text-left text-base text-slate ${look}`}>
              {o}
            </button>
          );
        })}
      </div>
      {!done && !s.hint && (
        <button type="button" onClick={onHint} className="min-h-[44px] self-start px-1 text-sm font-semibold text-royal underline-offset-4 hover:underline">
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
      {s.result && (
        <div role="status" data-result={s.result.correct ? 'correct' : 'wrong'} className={`flex flex-col gap-2 rounded-xl border-l-4 px-3 py-2 text-sm text-slate ${s.result.correct ? 'border-emerald bg-emerald/10' : 'border-coral-deep bg-coral/10'}`}>
          <p className="font-bold">{s.result.correct ? (w['fam.check.correct'] ?? w['fam.check.right']) : (w['fam.check.notThis'] ?? w['fam.check.notYet'])}</p>
          <p>{s.result.explanation}</p>
          {!s.result.correct && s.result.revisitDay && <p data-revisit>{fill(w['fam.plan.comesBack'], { day: s.result.revisitDay })}</p>}
          {!s.result.correct && (
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
