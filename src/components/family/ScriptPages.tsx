'use client';

import { useState } from 'react';
import { MarkedScript, type MarkedScriptMark, type MarkedScriptPage } from '@/components/app-ui/MarkedScript';
import type { Words } from '@/lib/family/fill';
import { useDataSaver } from './useDataSaver';

// The checked pages of a child's paper in the Family app (C351), each with its marks in the margin. With the phone's
// data-saver on, nothing is fetched until the family taps (docs/family-app/09 §4: no image on first paint then).
export const familyPageSrc = (pageId: string) => `/api/family/school/marking/pages/${pageId}`;

export function ScriptPages({ pages, marks, w }: { pages: MarkedScriptPage[]; marks: MarkedScriptMark[]; w: Words }) {
  const saver = useDataSaver();
  const [asked, setAsked] = useState(false);
  if (!pages.length) return null;
  // Until the phone's setting is read, a skeleton the size of the first page, so nothing jumps when it loads.
  if (!saver.ready) return <div aria-hidden="true" className="w-full animate-pulse rounded-2xl bg-slate/10 motion-reduce:animate-none" style={{ aspectRatio: `${pages[0].width} / ${pages[0].height}` }} />;
  if (saver.state.on && !asked) {
    return (
      <div className="flex flex-col items-start gap-2" data-pages-saver>
        <p className="text-sm text-slate">{w['fam.marks.saverNote']}</p>
        <button type="button" onClick={() => setAsked(true)} className="fam-press inline-flex min-h-[44px] items-center rounded-xl bg-off-white px-4 text-sm font-bold text-ink">
          {w['fam.marks.showPages']}
        </button>
      </div>
    );
  }
  return (
    <MarkedScript
      pages={pages}
      marks={marks}
      src={familyPageSrc}
      words={{ page: w['fam.marks.page'] ?? '', badge: w['fam.marks.badge'] ?? '', badgeNotCounted: w['fam.marks.badgeNotCounted'] ?? '' }}
    />
  );
}
