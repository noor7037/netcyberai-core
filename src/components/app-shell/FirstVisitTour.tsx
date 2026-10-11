'use client';

import { useEffect, useId, useState } from 'react';
import { TOURS, type TourId, type TourSlot } from '@/lib/contracts/tours';
import type { MessageKey } from '@/lib/i18n';
import { useT } from './LangContext';
import { useTours } from './ToursContext';

// A first-visit tour (docs/19 rule 8, C138): up to three short steps the
// first time a person opens a screen. It sits in a corner and never blocks
// the page: the person can use the screen, press Skip at any step, or
// Escape. Finishing or skipping remembers it on their account. While a step
// is shown, the part of the page it talks about is outlined.
export function FirstVisitTour({ id }: { id: TourId }) {
  const { lang, t } = useT();
  const { seen, markSeen } = useTours();
  const [at, setAt] = useState(0);
  const titleId = useId();
  const steps: readonly { slot?: TourSlot }[] = TOURS[id].steps;
  const show = seen !== null && !seen.has(id);
  const slot = show ? steps[at]?.slot : undefined;

  // Outline the part of the page this step is about.
  useEffect(() => {
    if (!slot) return;
    const el = document.querySelector<HTMLElement>(slot === 'tools' ? '[data-shell-lang]' : `[data-module-page] [data-slot="${slot}"]`);
    if (!el) return;
    el.setAttribute('data-tour-here', '');
    return () => el.removeAttribute('data-tour-here');
  }, [slot]);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') markSeen(id);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [show, id, markSeen]);

  if (!show) return null;
  const last = at === steps.length - 1;
  const button = 'inline-flex min-h-[44px] items-center justify-center rounded-md px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal';

  return (
    <aside
      lang={lang}
      role="dialog"
      aria-modal="false"
      aria-label={t('tour.label')}
      aria-describedby={titleId}
      data-tour={id}
      className="fixed inset-x-3 bottom-20 z-30 rounded-2xl border border-slate/20 bg-white p-4 shadow-xl md:inset-x-auto md:bottom-6 md:right-6 md:w-96 print:hidden"
    >
      <p className="text-xs font-bold uppercase tracking-wider text-slate/70">{t('tour.step', { n: at + 1, total: steps.length })}</p>
      <div id={titleId} aria-live="polite">
        <p className="mt-1 text-base font-extrabold text-slate">{t(`tour.${id}.${at + 1}.title` as MessageKey)}</p>
        <p className="mt-1 text-sm text-slate">{t(`tour.${id}.${at + 1}.text` as MessageKey)}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => (last ? markSeen(id) : setAt(at + 1))} className={`${button} bg-sapphire text-white`}>
          {t(last ? 'tour.done' : 'tour.next')}
        </button>
        {at > 0 && (
          <button type="button" onClick={() => setAt(at - 1)} className={`${button} border border-slate/20 bg-white text-slate`}>
            {t('tour.back')}
          </button>
        )}
        {!last && (
          <button type="button" onClick={() => markSeen(id)} className={`${button} ml-auto bg-white text-sapphire underline`}>
            {t('tour.skip')}
          </button>
        )}
      </div>
    </aside>
  );
}
