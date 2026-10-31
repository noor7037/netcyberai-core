import Link from 'next/link';
import type { ReactNode } from 'react';
import { SubjectGlyph } from './ui/SubjectGlyph';

// The top of a page inside child mode (M1-5, C251): back, and what this page is. W10-4 (C413): the lesson identity's
// band on every screen: paper, the title in ink, the kicker in deep saffron, back as a teal chip, and the subject's
// mark drawn large and faint (no gradient, no dark blue). `tone` is kept for the callers; the band is the same. `aside`: one
// action on the band's right (the parent area's lock).
const back = (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export function SubPageHeader(p: { back: string; backLabel: string; title: string; kicker?: string; tone?: 'royal' | 'emerald'; subject?: string; aside?: ReactNode }) {
  return (
    <header className="fam-band rounded-b-[2rem] bg-paper px-4 pb-12 pt-4">
      <span aria-hidden="true" className="fam-band-dots" />
      {p.subject && (
        <span aria-hidden="true" className="absolute -right-4 top-6 -z-10 text-ink opacity-[0.07]">
          <SubjectGlyph subject={p.subject} className="h-36 w-36 text-[7rem]" />
        </span>
      )}
      <div className="mx-auto flex w-full max-w-xl flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <Link href={p.back} className="fam-press flex min-h-[44px] items-center gap-2 self-start rounded-full bg-emerald pl-3 pr-4 text-sm font-bold text-white">
            {back}
            {p.backLabel}
          </Link>
          {p.aside}
        </div>
        {p.kicker && <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-saffron-deep">{p.kicker}</p>}
        <h1 className="fam-display fam-rise text-3xl font-extrabold leading-tight tracking-tight text-ink">{p.title}</h1>
      </div>
    </header>
  );
}
