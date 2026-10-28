import Link from 'next/link';
import type { ReactNode } from 'react';
import { subjectTheme } from '@/lib/family/subject-theme';
import { SubjectGlyph } from './ui/SubjectGlyph';

// The top of a page inside child mode (M1-5, C251): back, and what this page is, in the subject's colour. D1 (C230-Q):
// the subject's own gradient (src/lib/family/subject-theme.ts, every stop AA with white) over a solid royal-deep that
// scripts/check_contrast.py reads, the band's soft light, and the subject's mark drawn large and faint. `aside`: one
// action on the band's right (the parent area's lock).
const back = (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export function SubPageHeader(p: { back: string; backLabel: string; title: string; kicker?: string; tone?: 'royal' | 'emerald'; subject?: string; aside?: ReactNode }) {
  const gradient = p.subject ? subjectTheme(p.subject).tile : p.tone === 'emerald' ? 'bg-gradient-to-br from-emerald to-azure' : 'bg-gradient-to-br from-midnight via-royal-deep to-violet';
  return (
    <header className={`fam-band rounded-b-[2rem] bg-royal-deep ${gradient} px-4 pb-12 pt-4`}>
      <span aria-hidden="true" className="fam-band-dots" />
      {p.subject && (
        <span aria-hidden="true" className="absolute -right-4 top-6 -z-10 text-white opacity-20">
          <SubjectGlyph subject={p.subject} className="h-36 w-36 text-[7rem]" />
        </span>
      )}
      <div className="mx-auto flex w-full max-w-xl flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <Link href={p.back} className="fam-press -ml-2 flex min-h-[44px] items-center gap-2 self-start rounded-full px-2 text-sm font-bold text-white">
            {back}
            {p.backLabel}
          </Link>
          {p.aside}
        </div>
        {p.kicker && <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-white">{p.kicker}</p>}
        <h1 className="fam-rise text-3xl font-extrabold leading-tight tracking-tight text-white">{p.title}</h1>
      </div>
    </header>
  );
}
