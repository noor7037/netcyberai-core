import Link from 'next/link';

// The top of a page inside child mode (M1-5, C251): back, and what this page is, in the subject's colour. Two literal
// variants, so scripts/check_contrast.py can read each background.
const back = (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export function SubPageHeader(p: { back: string; backLabel: string; title: string; kicker?: string; tone?: 'royal' | 'emerald' }) {
  if (p.tone === 'emerald') {
    return (
      <header className="bg-emerald-text px-4 pb-8 pt-4">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-2">
          <Link href={p.back} className="flex min-h-[44px] items-center gap-2 self-start bg-emerald-text text-sm font-bold text-white">
            {back}
            {p.backLabel}
          </Link>
          {p.kicker && <p className="bg-emerald-text text-sm font-bold uppercase tracking-wide text-white">{p.kicker}</p>}
          <h1 className="bg-emerald-text text-2xl font-extrabold leading-tight text-white">{p.title}</h1>
        </div>
      </header>
    );
  }
  return (
    <header className="bg-gradient-to-br from-royal-deep to-royal px-4 pb-8 pt-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-2">
        <Link href={p.back} className="flex min-h-[44px] items-center gap-2 self-start text-sm font-bold text-white">
          {back}
          {p.backLabel}
        </Link>
        {p.kicker && <p className="text-sm font-bold uppercase tracking-wide text-white">{p.kicker}</p>}
        <h1 className="text-2xl font-extrabold leading-tight text-white">{p.title}</h1>
      </div>
    </header>
  );
}
