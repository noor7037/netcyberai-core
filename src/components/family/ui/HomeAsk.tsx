import Link from 'next/link';

// The home's first card (D1, C230-Q; the overview board's ask box): one question, one big way in. Learning first
// (docs/family-app/09 §1): the main action is the learning loop, one thumb away.
export function HomeAsk({ title, lead, cta, href = '/family/study', delay = 0 }: { title: string; lead: string; cta: string; href?: string; delay?: number }) {
  return (
    <section data-family-start className="fam-card fam-rise relative overflow-hidden bg-white p-5" style={{ ['--d' as string]: `${delay}ms` } as React.CSSProperties}>
      <span aria-hidden="true" className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-grape/10" />
      <span aria-hidden="true" className="absolute -right-2 top-8 h-12 w-12 rounded-full bg-cyan/20" />
      <div className="relative flex items-start gap-4">
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-royal to-violet text-white shadow-lg">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4zM19 15l.8 2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8zM5 15l.6 1.5 1.4.5-1.4.5L5 19l-.6-1.5L3 17l1.4-.5z" />
          </svg>
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold leading-snug text-slate">{title}</h2>
          <p className="mt-1 text-base text-slate/80">{lead}</p>
        </div>
      </div>
      <Link href={href} className="fam-cta fam-press relative mt-4 flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-royal to-violet px-4 text-base font-extrabold text-white">
        {cta}
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </Link>
    </section>
  );
}
