import Link from 'next/link';
import type { ReactNode } from 'react';
import { t, type Lang } from '@/lib/i18n';

// The rows behind a dashboard number, on the module's own screen (docs/26
// slice 8d, C203). A tile's link opens the screen with the filter in its
// address; the screen lists exactly those rows here, above its usual
// content, with the count in the title, so the number on the dashboard and
// the rows a person then reads are the same rows. "Show everything" takes
// the filter away. The rows are read by the module's own function, in the
// reader's own session: this file only draws the frame.
export function ShownRows({
  id,
  title,
  days,
  note,
  backHref,
  empty,
  lang,
  more,
  children,
}: {
  id: string;
  title: string; // says what the rows are and how many
  days?: { from: string; to: string };
  note?: string;
  backHref: string; // the screen without the filter
  empty: boolean;
  lang: Lang;
  more?: ReactNode; // other filters of the same list, as links
  children: ReactNode; // the rows, as <li>
}) {
  return (
    <section lang={lang} data-shown={id} className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate">{t(lang, 'shown.from')}</p>
        <h2 data-shown-title className="text-base font-bold text-slate">
          {title}
        </h2>
        {days && <p className="text-sm text-slate">{t(lang, 'shown.days', days)}</p>}
        {note && <p className="text-sm text-slate">{note}</p>}
      </div>
      {empty ? (
        <p data-shown-none className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t(lang, 'shown.none')}</p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
      <div className="flex flex-wrap items-center gap-x-4">
        {more}
        <Link href={backHref} data-shown-back className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline">
          {t(lang, 'shown.back')}
        </Link>
      </div>
    </section>
  );
}

// One row: who or what on the left, the figures under it.
export const SHOWN_ROW = 'flex flex-col gap-0.5 rounded-md border border-slate/10 p-3 text-sm text-slate';

// A date as the screens write it for a person: 14 Oct 2026.
export const shownDay = (lang: Lang, iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
