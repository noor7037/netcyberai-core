'use client';

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { PRIMARY, SECTION, TAP } from '@/components/exams/SchemeParts';
import type { BubbleQuestionView, BubbleSheetDetail } from '@/lib/contracts/marking';
import type { MessageKey } from '@/lib/i18n';

// A script's bubble sheet on its review screen (C364): the sheet as it was read (straightened, so the layout's places
// are the picture's), with each question's row ringed when a person should look (amber: an unclear bubble or two marks)
// and the shaded answer ringed green when it is right and red when it is wrong; what was read, beside the key, is on each
// question's card (BubbleReadLine). Colour is never the only word: the card says it. The picture comes from the app's
// own route, which checks who is asking every time.

export type BubbleSheetPaneHandle = { show: (questionId: string) => void };

const BY_KEYS: Record<string, MessageKey> = { bubble: 'bub.review.by.bubble', roll: 'bub.review.by.roll', teacher: 'bub.review.by.teacher', none: 'bub.review.by.none' };
const pad4 = (n: number) => String(n).padStart(4, '0');

export const BubbleSheetPane = forwardRef<
  BubbleSheetPaneHandle,
  { detail: BubbleSheetDetail; active: string | null; busy: boolean; onPutOn: () => void; onNotThis: () => void }
>(function BubbleSheetPane({ detail, active, busy, onPutOn, onNotThis }, ref) {
  const { t } = useT();
  const [broken, setBroken] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const view = detail.view;
  useImperativeHandle(ref, () => ({
    show(questionId) {
      const q = view?.questions.find((x) => x.questionId === questionId);
      const el = box.current;
      if (!q?.row || !el) return;
      const smooth = typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
    },
  }));
  if (!view) return null;
  const ringFor = (q: BubbleQuestionView) => (q.state === 'unclear' || q.state === 'multiple' ? 'border-amber' : null);
  return (
    <section data-bubble-sheet={view.readId} className={SECTION} aria-labelledby={`bub-sheet-${view.readId}`}>
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 id={`bub-sheet-${view.readId}`} className="text-base font-bold">{t('bub.review.title')}</h2>
        <InfoTip>{t('bub.review.how')}</InfoTip>
      </div>
      <p className="text-slate/80">
        {view.sheetNo !== null ? t('bub.review.sheetNo', { n: pad4(view.sheetNo) }) : t('bub.waiting.noNo')} · {t(BY_KEYS[view.matchedBy] ?? 'bub.review.by.none')}
        {view.rollNo ? ` · ${t('bub.waiting.roll', { roll: view.rollNo })}` : ''}
      </p>
      {detail.pending && (
        <div data-bubble-pending className="flex flex-col gap-2 rounded-md border border-amber p-3">
          <p className="font-semibold">{t('bub.review.pending')}</p>
          {view.mayChange && (
            <button type="button" data-bubble-put-on className={`${PRIMARY} self-start`} disabled={busy} onClick={onPutOn}>{t('bub.review.putOn')}</button>
          )}
        </div>
      )}
      {!view.sameQuestions && <p className="text-amber-text">{t('bub.review.changedQs')}</p>}
      {view.url && !broken ? (
        <div ref={box} className="relative w-full overflow-hidden rounded border border-slate/15 bg-white" style={{ aspectRatio: `${view.width || 210} / ${view.height || 297}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view.url} alt={t('bub.review.alt')} className="block h-full w-full select-none" draggable={false} onError={() => setBroken(true)} />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {view.questions.map((q) => {
              const ring = ringFor(q);
              const marked = q.state === 'answer' && q.right !== null ? q.bubbles.filter((b) => q.read.includes(b.key)) : [];
              return (
                <div key={q.questionId}>
                  {q.row && (ring || active === q.questionId) && (
                    <div
                      data-bubble-ring={q.label}
                      className={`absolute rounded border-2 ${active === q.questionId ? 'border-royal bg-royal/10' : ring}`}
                      style={{ left: `${q.row.left}%`, top: `${q.row.top}%`, width: `${q.row.width}%`, height: `${q.row.height}%` }}
                    />
                  )}
                  {marked.map((b) => (
                    <div
                      key={b.key}
                      className={`absolute rounded-full border-2 ${q.right ? 'border-emerald-text' : 'border-red-800'}`}
                      style={{ left: `${b.left - b.size * 0.75}%`, top: `calc(${b.top}% - ${b.size * 0.75 * ((view.width || 210) / (view.height || 297))}%)`, width: `${b.size * 1.5}%`, aspectRatio: '1 / 1' }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-slate/80">{t('bub.review.gone')}</p>
      )}
      {view.url && !broken && <p className="text-slate/70">{t('bub.review.legend')}</p>}
      {detail.source === 'scan' && view.applied && view.mayChange && (
        <button type="button" data-bubble-not-this className={`${TAP} self-start`} disabled={busy} onClick={onNotThis}>{t('bub.review.notThis')}</button>
      )}
    </section>
  );
});

// What was read for one question, beside the key, in words (the picture's colours say the same).
export function BubbleReadLine({ q }: { q: BubbleQuestionView }) {
  const { t } = useT();
  const state: MessageKey =
    q.state === 'unclear' ? 'bub.review.unclear' : q.state === 'multiple' ? 'bub.review.multiple' : q.state === 'blank' ? 'bub.review.blank' : q.right === true ? 'bub.review.right' : q.right === false ? 'bub.review.wrong' : 'bub.review.noKey';
  const tone = q.state === 'unclear' || q.state === 'multiple' ? 'text-amber-text' : q.right === true ? 'text-emerald-text' : q.right === false ? 'text-red-800' : 'text-slate/80';
  return (
    <p data-bubble-read={q.label} className="flex flex-wrap gap-x-3 gap-y-1">
      <span>{q.read.length ? t('bub.review.shaded', { keys: q.read.join(', ') }) : t('bub.review.nothing')}</span>
      <span>{q.correct ? t('bub.review.key', { keys: q.correct.join(', ') }) : t('bub.review.noKey')}</span>
      <span className={`font-semibold ${tone}`}>{t(state)}</span>
    </p>
  );
}
