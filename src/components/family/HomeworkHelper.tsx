'use client';
import { Picture } from './Picture';

import { useRef, useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import type { LadderView } from '@/lib/family/homework';
import { familyApi } from './client';
import { subjectColour } from '@/lib/family/subject-colours';
import { Skeleton } from './ui/Skeleton';
import { ENTER, PRESS } from './ui/motion';

// The homework helper on the phone (M2-6, C280). A photo of one question (the camera or a screenshot) is made smaller
// here, sent once, and not kept on the phone either. Then the ladder: a hint, the child's own answer, the next hint,
// "I'm stuck" for the steps; the child writes the final answer. The server holds the answer; the phone only hears
// whether the child's answer matches.

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
      <section data-homework-start className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate/10">
        <p className="text-base text-slate">{w['fam.homework.lead']}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={busy} onClick={() => camera.current?.click()} className={`flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-royal px-4 text-base font-bold text-white hover:bg-royal-deep disabled:opacity-60 ${PRESS}`}>
            <span aria-hidden><Picture e="📷" /></span>
            {w['fam.homework.takePhoto']}
          </button>
          <button type="button" disabled={busy} onClick={() => gallery.current?.click()} className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-off-white px-4 text-base font-bold text-slate ring-1 ring-slate/15 hover:bg-slate/5 disabled:opacity-60">
            <span aria-hidden><Picture e="🖼️" /></span>
            {w['fam.homework.choosePhoto']}
          </button>
        </div>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => send(e.target.files?.[0])} />
        <input ref={gallery} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => send(e.target.files?.[0])} />
        <p className="text-sm text-slate/80">{w['fam.homework.privacy']}</p>
        {busy && (
          <div data-homework-reading className="flex flex-col gap-2">
            <p className="text-base font-semibold text-royal-deep">{w['fam.homework.reading']}</p>
            <Skeleton label={w['fam.d13.loading.photo']} lines={3} className="bg-off-white shadow-none ring-0" />
          </div>
        )}
        {error && (
          <div role="alert" data-homework-refused className={`flex items-center gap-3 rounded-2xl bg-coral/10 px-3 py-3 text-slate ${ENTER}`}>
            <Picture e="🤔" size={40} />
            <div className="flex flex-col">
              <p className="text-base font-bold">{w['fam.d13.homework.refusedTitle']}</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}
      </section>
    );
  }

  const v = ladder.view;
  return (
    <section data-homework-ladder className="flex flex-col gap-3">
      <div data-homework-question={v.subject} className={`relative overflow-hidden rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate/10 ${ENTER}`}>
        {v.subject !== 'other' && <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1.5 ${subjectColour(v.subject).bar}`} />}
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate/80">{w['fam.homework.question']}</h2>
        <p lang={titleLang(v.question)} className="mt-1 text-lg font-semibold text-slate">
          {v.question}
        </p>
      </div>

      {v.hints.length > 0 && (
        <ol className="flex flex-col gap-2">
          {v.hints.map((h, i) => (
            <li key={i} className="animate-rise-in rounded-2xl bg-sunshine/20 p-4 motion-reduce:animate-none">
              <p className="text-xs font-bold uppercase tracking-wide text-slate/80">{fill(w['fam.homework.hint'], { n: i + 1, total: v.hintsTotal })}</p>
              <p lang={titleLang(h)} className="mt-1 text-base text-slate">
                {h}
              </p>
            </li>
          ))}
        </ol>
      )}

      {v.steps && (
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate/10">
          <h2 className="text-base font-extrabold text-slate">{w['fam.homework.steps']}</h2>
          <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-base text-slate">
            {v.steps.map((s, i) => (
              <li key={i} lang={titleLang(s)}>
                {s}
              </li>
            ))}
          </ol>
          {!v.solved && <p className="mt-2 text-sm text-slate/80">{w['fam.homework.stepsNote']}</p>}
        </div>
      )}

      {v.solved ? (
        <p role="status" data-homework-solved className="animate-pop-in rounded-2xl bg-emerald/10 px-4 py-3 text-base font-bold text-emerald-text motion-reduce:animate-none">
          {w['fam.homework.right']}
        </p>
      ) : (
        <form
          className="flex flex-col gap-2 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate/10"
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
            className="min-h-[48px] rounded-2xl px-3 text-base text-slate ring-1 ring-slate/20 focus:outline-none focus:ring-2 focus:ring-royal"
          />
          <button type="submit" disabled={busy || !answer.trim()} className={`min-h-[48px] rounded-2xl bg-royal px-4 text-base font-bold text-white hover:bg-royal-deep disabled:opacity-60 ${PRESS}`}>
            {w['fam.homework.check']}
          </button>
          {result && !result.correct && (
            <p role="status" className="rounded-2xl bg-coral/10 px-3 py-2 text-sm text-slate">
              <span className="font-bold">{w['fam.homework.notYet']}</span> {result.feedback ?? ''}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {v.canHint && (
              <button type="button" disabled={busy} onClick={() => act('hint')} className="min-h-[44px] rounded-2xl bg-sunshine px-4 text-sm font-bold text-slate hover:bg-gold disabled:opacity-60">
                {fill(w['fam.homework.showHint'], { n: v.hints.length + 1 })}
              </button>
            )}
            {v.canStuck && (
              <button type="button" disabled={busy} onClick={() => act('stuck')} className="min-h-[44px] rounded-2xl bg-off-white px-4 text-sm font-bold text-slate ring-1 ring-slate/15 hover:bg-slate/5 disabled:opacity-60">
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
      <button type="button" onClick={reset} className="min-h-[44px] self-start rounded-2xl px-2 text-sm font-bold text-royal underline-offset-2 hover:underline">
        {w['fam.homework.another']}
      </button>
    </section>
  );
}
