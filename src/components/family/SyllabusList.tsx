import Link from 'next/link';
import { subjectTheme } from '@/lib/family/subject-theme';

// A syllabus as a numbered list of chapters with their topics, each topic a link (C230-AB). Study draws a parent's own
// syllabus with it ("Your syllabus"); a school's syllabus can use it the same way. No hooks: it renders on the server.
// A chapter may carry its own link (a chapter with no topics printed under it can still be opened). A title is marked
// with the language it is written in, for screen readers.

export type SyllabusListTopic = { title: string; href: string };
export type SyllabusListChapter = { title: string; href?: string; topics: SyllabusListTopic[] };

const titleLang = (title: string) => (/[ऀ-ॿ]/.test(title) ? 'hi' : 'en');

export function SyllabusList({ title, chapters, tone, id = 'fam-syllabus', note }: { title: string; chapters: SyllabusListChapter[]; tone?: string; id?: string; note?: string }) {
  const theme = subjectTheme(tone ?? 'mathematics');
  return (
    <section aria-labelledby={id} data-syllabus-list className="flex flex-col gap-2">
      <h2 id={id} className="px-1 text-lg font-extrabold text-slate">
        {title}
      </h2>
      {note && <p className="px-1 text-sm text-slate">{note}</p>}
      <ol className="flex flex-col gap-2">
        {chapters.map((c, i) => {
          const head = (
            <>
              <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-royal-deep text-base font-black text-white shadow-md ${theme.tile}`}>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1" lang={titleLang(c.title)}>
                {c.title}
              </span>
            </>
          );
          return (
            <li key={`${i}:${c.title}`} className="fam-card fam-rise bg-white p-3" style={{ ['--d' as string]: `${Math.min(i, 8) * 50}ms` } as React.CSSProperties}>
              {c.href ? (
                <Link href={c.href} prefetch={false} className="fam-press flex min-h-[52px] items-center gap-3 rounded-2xl px-1 text-base font-bold text-slate">
                  {head}
                  <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 ${theme.ink}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              ) : (
                <p className="flex min-h-[52px] items-center gap-3 px-1 text-base font-bold text-slate">{head}</p>
              )}
              {c.topics.length > 0 && (
                <ul className="mt-1 flex flex-col">
                  {c.topics.map((tp, j) => (
                    <li key={`${j}:${tp.title}`}>
                      <Link href={tp.href} prefetch={false} className="flex min-h-[44px] items-center gap-3 rounded-xl px-2 text-sm text-slate hover:bg-off-white">
                        <span aria-hidden="true" className={`ml-4 h-2 w-2 shrink-0 rounded-full ${theme.chip}`} />
                        <span lang={titleLang(tp.title)}>{tp.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
