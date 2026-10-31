'use client';

import { useRef, useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import type { LadderView } from '@/lib/family/homework';
import { AiNotice } from './AiNotice';
import { familyApi } from './client';
import { FamIcon, rise } from './FamIcon';

// The homework helper on the phone (M2-6, C280). A photo of one question (the camera or a screenshot) is made smaller
// here, sent once, and not kept on the phone either. Then the ladder: a hint, the child's own answer, the next hint,
// "I'm stuck" for the steps; the child writes the final answer. The server holds the answer; the phone only hears
// whether the child's answer matches.
// F2 on D1 (C230-Q): D1 cards (the question, each hint with its bulb, the steps), the main button in D1's call-to-action
// style, drawn icons instead of device emoji, and buttons that look disabled while they cannot be pressed.

// The main button (D1's call to action): saffron with ink text (W12-E), so the contrast check reads it.
const CTA = 'fam-cta fam-press flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-saffron px-4 text-base font-extrabold text-ink disabled:cursor-not-allowed disabled:opacity-60';
const QUIET = 'fam-press flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-off-white px-4 text-base font-bold text-slate ring-1 ring-slate/15 hover:bg-slate/5 disabled:cursor-not-allowed disabled:opacity-60';

type Ladder = { token: string; view: LadderView };
type Result = { correct: boolean; feedback: string | null } | null;

const MAX_SIDE = 1600;
const titleLang = (text: string) => (/[ऀ-ॿ]/.test(text) ? 'hi' : 'en');

// A JPEG no larger than 1600 px on its longer side, as base64: less data for the family, and under the server's limit.
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('no image');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const ERROR_KEY: Record<string, string> = {
  ai_not_switched_on: 'ai.not_switched_on',
  ai_cap_reached: 'ai.cap_reached',
  ai_not_cleared_for_minors: 'ai.not_cleared_for_minors',
  ai_not_capable: 'ai.not_capable',
  ai_failed: 'ai.failed',
};

export function HomeworkHelper({ w }: { w: Words }) {
  const [busy, setBusy] = useState(false);
  const [ladder, setLadder] = useState<Ladder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<Result>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  const say = (code: string, params: Record<string, string | number> = {}) => fill(w[ERROR_KEY[code] ?? `fam.homework.err.${code}`] ?? w['fam.err.network'], params);

  const send = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    let photo: string;
    try {
      photo = await shrink(file);
    } catch {
      setBusy(false);
      return setError(say('not_a_photo'));
    }
    const r = await familyApi<Ladder>('/api/family/homework', 'POST', { photo });
    setBusy(false);
    if (camera.current) camera.current.value = '';
    if (gallery.current) gallery.current.value = '';
    if (!r.ok) return setError(say(r.error, { limit: Number(r.data.limit ?? 0) }));
    setLadder(r.data);
  };

  const act = async (action: 'hint' | 'attempt' | 'stuck') => {
    if (!ladder) return;
    setBusy(true);
    const r = await familyApi<Ladder & { result: Result }>('/api/family/homework/step', 'POST', { token: ladder.token, action, answer: action === 'attempt' ? answer : undefined });
    setBusy(false);
    if (!r.ok) return setError(r.error === 'not_yet' ? w['fam.homework.hintAfterTry'] : say(r.error));
    setError(null);
    setLadder({ token: r.data.token, view: r.data.view });
    if (action === 'attempt') setResult(r.data.result);
  };

  const reset = () => {
    setLadder(null);
    setAnswer('');
    setResult(null);
    setError(null);
  };

  if (!ladder) {
    return (
      <section data-homework-start className="fam-card fam-rise flex flex-col gap-4 bg-white p-5">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-white shadow-lg">
            <FamIcon name="camera" className="h-6 w-6" />
          </span>
          <p className="min-w-0 text-base text-slate">{w['fam.homework.lead']}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={busy} onClick={() => camera.current?.click()} className={CTA}>
            <FamIcon name="camera" className="h-5 w-5" />
            {w['fam.homework.takePhoto']}
          </button>
          <button type="button" disabled={busy} onClick={() => gallery.current?.click()} className={QUIET}>
            <FamIcon name="image" className="h-5 w-5" />
            {w['fam.homework.choosePhoto']}
          </button>
        </div>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => send(e.target.files?.[0])} />
        <input ref={gallery} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => send(e.target.files?.[0])} />
        <p className="flex items-start gap-2 text-sm text-slate/80">
          <span className="mt-0.5 shrink-0 bg-white text-emerald-text">
            <FamIcon name="shield" className="h-4 w-4" />
          </span>
          {w['fam.homework.privacy']}
        </p>
        {busy && (
          <p role="status" className="animate-pulse text-base font-semibold text-ink motion-reduce:animate-none">
            {w['fam.homework.reading']}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-2xl bg-coral/10 px-3 py-2 text-sm font-semibold text-slate">
            {error}
          </p>
        )}
      </section>
    );
  }

  const v = ladder.view;
  return (
    <section data-homework-ladder className="flex flex-col gap-3">
      <div className="fam-card fam-rise flex items-start gap-4 bg-white p-5">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink text-white shadow-md">
          <FamIcon name="question" className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate/80">{w['fam.homework.question']}</h2>
          <p lang={titleLang(v.question)} className="mt-1 break-words text-lg font-semibold text-slate">
            {v.question}
          </p>
          <AiNotice w={w} made="ai_made" />
        </div>
      </div>

      {v.hints.length > 0 && (
        <ol className="flex flex-col gap-2">
          {v.hints.map((h, i) => (
            <li key={i} className="fam-card fam-rise flex items-start gap-3 bg-white p-4" style={rise(60)}>
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sunshine text-slate">
                <FamIcon name="bulb" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-slate/80">{fill(w['fam.homework.hint'], { n: i + 1, total: v.hintsTotal })}</p>
                <p lang={titleLang(h)} className="mt-1 break-words text-base text-slate">
                  {h}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {v.steps && (
        <div className="fam-card fam-rise bg-white p-5" style={rise(60)}>
          <h2 className="flex items-center gap-2 text-base font-extrabold text-slate">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lesson-sky text-ink">
              <FamIcon name="steps" className="h-5 w-5" />
            </span>
            {w['fam.homework.steps']}
          </h2>
          <ol className="mt-3 flex flex-col gap-2">
            {v.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-base text-slate">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
                  {i + 1}
                </span>
                <span lang={titleLang(s)} className="min-w-0 break-words pt-0.5">
                  {s}
                </span>
              </li>
            ))}
          </ol>
          {!v.solved && <p className="mt-3 text-sm text-slate/80">{w['fam.homework.stepsNote']}</p>}
        </div>
      )}

      {v.solved ? (
        <p role="status" data-homework-solved className="fam-pop flex items-center gap-2 rounded-2xl bg-emerald/10 px-4 py-3 text-base font-bold text-emerald-text">
          <FamIcon name="sparkle" className="h-5 w-5 shrink-0" />
          {w['fam.homework.right']}
        </p>
      ) : (
        <form
          className="fam-card fam-rise flex flex-col gap-3 bg-white p-5"
          style={rise(90)}
          onSubmit={(e) => {
            e.preventDefault();
            void act('attempt');
          }}
        >
          <label htmlFor="hw-answer" className="text-base font-bold text-slate">
            {w['fam.homework.yourAnswer']}
          </label>
          <input
            id="hw-answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            maxLength={200}
            autoComplete="off"
            className="min-h-[48px] rounded-2xl bg-white px-3 text-base text-slate ring-1 ring-slate/20 focus:outline-none focus:ring-2 focus:ring-ink"
          />
          <button type="submit" disabled={busy || !answer.trim()} className={CTA}>
            {w['fam.homework.check']}
          </button>
          {result && !result.correct && (
            <p role="status" className="rounded-2xl bg-coral/10 px-3 py-2 text-sm text-slate">
              <span className="font-bold">{w['fam.homework.notYet']}</span> {result.feedback ?? ''}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {v.canHint && (
              <button type="button" disabled={busy} onClick={() => act('hint')} className="fam-press flex min-h-[44px] items-center gap-2 rounded-2xl bg-sunshine px-4 text-sm font-bold text-slate hover:bg-gold disabled:cursor-not-allowed disabled:opacity-60">
                <FamIcon name="bulb" className="h-4 w-4" />
                {fill(w['fam.homework.showHint'], { n: v.hints.length + 1 })}
              </button>
            )}
            {v.canStuck && (
              <button type="button" disabled={busy} onClick={() => act('stuck')} className="fam-press flex min-h-[44px] items-center gap-2 rounded-2xl bg-off-white px-4 text-sm font-bold text-slate ring-1 ring-slate/15 hover:bg-slate/5 disabled:cursor-not-allowed disabled:opacity-60">
                <FamIcon name="steps" className="h-4 w-4" />
                {w['fam.homework.stuck']}
              </button>
            )}
          </div>
          {!v.canHint && !v.canStuck && v.hints.length < v.hintsTotal && <p className="text-sm text-slate/80">{w['fam.homework.hintAfterTry']}</p>}
        </form>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-coral/10 px-3 py-2 text-sm font-semibold text-slate">
          {error}
        </p>
      )}
      <button type="button" onClick={reset} className="fam-press flex min-h-[44px] items-center gap-2 self-start rounded-2xl px-2 text-sm font-bold text-ink underline-offset-2 hover:underline">
        <FamIcon name="again" className="h-4 w-4" />
        {w['fam.homework.another']}
      </button>
    </section>
  );
}
