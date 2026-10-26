'use client';

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { TAP } from '@/components/exams/SchemeParts';
import type { SheetPage } from '@/lib/contracts/marking';
import type { BadgeKind, BadgePlacement } from '@/lib/marking/margin';

// The scanned pages of one script, one above the next, zoomable and scrolling, with each question's mark in the margin at
// its answer's place (C347). A badge is a label on the picture, not a button: the question list beside the pages is where
// a person taps (a question scrolls the pages to its place). Full is green, part is amber, nothing is red, a question
// internal choice left out is plain, and a question with no mark yet is outlined; each also says its mark in numbers,
// so colour is never the only word. Motion is off under prefers-reduced-motion.

export type PagesPaneHandle = { scrollToPlace: (pageId: string, yFrom: number) => void };

export const ZOOMS = [1, 1.5, 2, 3] as const;

// Written out in full so the contrast check sees each pairing.
const BADGE_LOOK: Record<BadgeKind, string> = {
  full: 'bg-emerald-text text-white',
  part: 'bg-amber-text text-white',
  none: 'bg-red-800 text-white',
  unmarked: 'border-2 border-slate bg-white text-slate',
  out: 'border border-slate/60 bg-white text-slate',
};
const BRACKET_LOOK: Record<BadgeKind, string> = {
  full: 'bg-emerald-text',
  part: 'bg-amber-text',
  none: 'bg-red-800',
  unmarked: 'bg-slate',
  out: 'bg-slate/40',
};

export const PagesPane = forwardRef<PagesPaneHandle, { pages: SheetPage[]; badges: BadgePlacement[]; active: string | null }>(function PagesPane({ pages, badges, active }, ref) {
  const { t } = useT();
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(1);
  const [broken, setBroken] = useState<string[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    scrollToPlace(pageId, yFrom) {
      const pane = scroller.current;
      const page = pane?.querySelector<HTMLElement>(`[data-page-id="${pageId}"]`);
      if (!pane || !page) return;
      const smooth = typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const behavior = smooth ? 'smooth' : 'auto';
      pane.scrollTo({ top: Math.max(0, page.offsetTop + yFrom * page.offsetHeight - 32), behavior });
      // On a phone the pages sit above the questions: bring them into view as well.
      pane.scrollIntoView({ block: 'nearest', behavior });
    },
  }));

  const zoomBy = (step: -1 | 1) => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(zoom) + step))]);

  return (
    <div data-pages-pane className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-zoom="out" className={TAP} disabled={zoom === ZOOMS[0]} onClick={() => zoomBy(-1)} aria-label={t('mk.pages.zoomOut')}>
          <span aria-hidden="true">−</span>
          <span className="sr-only">{t('mk.pages.zoomOut')}</span>
        </button>
        <span data-zoom-level className="min-w-[3.5rem] text-center font-semibold">{Math.round(zoom * 100)}%</span>
        <button type="button" data-zoom="in" className={TAP} disabled={zoom === ZOOMS[ZOOMS.length - 1]} onClick={() => zoomBy(1)} aria-label={t('mk.pages.zoomIn')}>
          <span aria-hidden="true">+</span>
          <span className="sr-only">{t('mk.pages.zoomIn')}</span>
        </button>
        <button type="button" className={TAP} disabled={zoom === 1} onClick={() => setZoom(1)}>{t('mk.pages.fit')}</button>
      </div>
      <div
        ref={scroller}
        role="region"
        tabIndex={0}
        aria-label={t('mk.pages.region')}
        className="relative h-[60vh] min-h-[320px] overflow-auto rounded-lg border border-slate/15 bg-slate/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal lg:h-[calc(100vh-11rem)]"
      >
        {pages.length === 0 && <p className="p-4">{t('mk.pages.none')}</p>}
        <div className="flex flex-col gap-3 p-2" style={{ width: `${zoom * 100}%` }}>
          {pages.map((p) => {
            const mine = badges.filter((b) => b.pageId === p.pageId);
            return (
              <div key={p.pageId} data-page-id={p.pageId} className="relative w-full overflow-hidden rounded bg-white shadow-sm" style={{ aspectRatio: `${p.width} / ${p.height}` }}>
                {broken.includes(p.pageId) ? (
                  <p className="p-4">{t('mk.pages.broken', { n: p.position })}</p>
                ) : (
                  // The address is the app's own route, which checks who is asking every time.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} width={p.width} height={p.height} alt={t('mk.pages.alt', { n: p.position, total: pages.length })} loading={p.position <= 2 ? 'eager' : 'lazy'} draggable={false} className="block h-full w-full select-none" onError={() => setBroken([...broken, p.pageId])} />
                )}
                <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                  {mine.map((b) => (
                    <div key={b.questionId} data-badge={b.questionId} data-badge-kind={b.kind} className="absolute inset-x-0" style={{ top: `${b.top}%`, height: `${Math.max(b.height, 0)}%` }}>
                      {active === b.questionId && <div data-badge-active className="absolute inset-x-1 inset-y-0 rounded border-2 border-royal bg-royal/10" />}
                      <span className={`absolute top-0 h-full w-0.5 rounded-full ${BRACKET_LOOK[b.kind]}`} style={{ right: `${0.4 + b.slot * 3.8}rem` }} />
                      <span className={`absolute top-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-4 shadow ${BADGE_LOOK[b.kind]}`} style={{ right: `${0.7 + b.slot * 3.8}rem` }}>
                        {b.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
