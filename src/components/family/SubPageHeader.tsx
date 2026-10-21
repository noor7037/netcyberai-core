import Link from 'next/link';

// The top of a page inside child mode (M1-5, C251): back, and what this page is.
export function SubPageHeader({ back, backLabel, title, kicker, tone = 'royal' }: { back: string; backLabel: string; title: string; kicker?: string; tone?: 'royal' | 'emerald' }) {
  const bg = tone === 'emerald' ? 'from-emerald-text to-teal-800' : 'from-royal-deep to-royal';
  return (
    <header className={`bg-gradient-to-br ${bg} px-4 pb-8 pt-4 text-white`}>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-2">
        <Link href={back} className="flex min-h-[44px] items-center gap-2 self-start text-sm font-bold text-white">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {backLabel}
        </Link>
        {kicker && <p className="text-sm font-bold uppercase tracking-wide text-white/90">{kicker}</p>}
        <h1 className="text-2xl font-extrabold leading-tight">{title}</h1>
      </div>
    </header>
  );
}
