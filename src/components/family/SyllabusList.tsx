import type { ReactNode } from 'react';
import { subjectTheme } from '@/lib/family/subject-theme';
import { CHAPTER_GROUP } from './chapter-group';
import { SaverLink } from './offline/SaverLink';

// A syllabus as an accordion of chapters (C230-AB; W6-A, C395): one row per chapter (its number, its title, a status
// badge on the right, a chevron). Tapping a row opens that chapter's topics and actions (explain the chapter, open the
// published chapter to read and hear, take the chapter offline, a topic's worksheet), and closes any other row: every
// accordion on the page shares one group (the native <details name>, so it works without script, by keyboard, and
// says open or closed to a screen reader). The chevron turns and the topics fade in over 180 ms, and nothing moves
// under prefers-reduced-motion (family.css). A row with nothing inside (a chapter asked for, still waiting) is a plain
// row. Study draws the board's catalog, the published chapters and the parent's own syllabus with it. No hooks: it
// renders on the server. A title is marked with the language it is written in, for screen readers.

export type SyllabusListTopic = { key?: string; title: string; href: string; worksheet?: { href: string; label: string; ariaLabel: string } };
export type SyllabusListChapter = {
  key?: string;
  title: string;
  // Explain the whole chapter (Understand), with its label.
  href?: string;
  hrefLabel?: string;
  // The published chapter to read and hear.
  reader?: { href: string; label: string };
  topics: SyllabusListTopic[];
  // A status badge, drawn on the right of the row.
  status?: ReactNode;
  // More inside the open row (the offline pack's button).
  extra?: ReactNode;
  // `number`: the chapter's place in the syllabus; `book`: a published chapter outside it; `dot`: a chapter asked for.
  mark?: 'number' | 'book' | 'dot';
  // A data attribute for the row (pictures and tests find rows by it).
  data?: string;
};

const titleLang = (title: string) => (/[ऀ-ॿ]/.test(title) ? 'hi' : 'en');

export function SyllabusList({ title, chapters, tone, id = 'fam-syllabus', start = 0 }: { title?: string; chapters: SyllabusListChapter[]; tone?: string; id?: string; start?: number }) {
  const theme = subjectTheme(tone ?? 'mathematics');
  let n = start;
  return (
    <section aria-labelledby={title ? id : undefined} data-syllabus-list className="flex flex-col gap-2">
      {title && (
        <h2 id={id} className="px-1 text-lg font-extrabold text-slate">
          {title}
        </h2>
      )}
      <ol className="flex flex-col gap-2">
        {chapters.map((c, i) => {
          const mark = c.mark ?? 'number';
          if (mark === 'number') n += 1;
          const head = (
            <>
              <span
                aria-hidden="true"
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-black ${mark === 'dot' ? 'bg-off-white text-slate' : `bg-royal-deep text-white shadow-sm ${theme.tile}`}`}
              >
                {mark === 'number' ? (
                  n
                ) : mark === 'book' ? (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 5a2 2 0 0 1 2-2h5v16H6a2 2 0 0 0-2 2V5zM20 5a2 2 0 0 0-2-2h-5v16h5a2 2 0 0 1 2 2V5z" />
                  </svg>
                ) : (
                  <span className="h-2.5 w-2.5 rounded-full bg-slate" />
                )}
              </span>
              <span className="min-w-0 flex-1 text-base font-bold text-slate" lang={titleLang(c.title)}>
                {c.title}
              </span>
              {c.status}
            </>
          );
          const empty = !c.href && !c.reader && !c.extra && c.topics.length === 0;
          return (
            <li key={c.key ?? `${i}:${c.title}`} data-chapter-row={c.key ?? ''} {...(c.data ? { [c.data]: '' } : {})} className="fam-surface bg-white">
              {empty ? (
                <p className="flex min-h-[60px] items-center gap-3 px-3 py-2">{head}</p>
              ) : (
                <details name={CHAPTER_GROUP} className="fam-acc">
                  <summary className="flex min-h-[60px] items-center gap-3 rounded-2xl px-3 py-2">
                    {head}
                    <svg aria-hidden="true" viewBox="0 0 24 24" className={`fam-acc-chev h-5 w-5 shrink-0 ${theme.ink}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </summary>
                  <div className="fam-acc-body flex flex-col gap-1 border-t border-slate/10 px-2 pb-2 pt-2">
                    {(c.reader || c.href) && (
                      <div className="flex flex-wrap gap-2 px-1 pb-1">
                        {c.reader && (
                          <SaverLink href={c.reader.href} data-reader-link className={`fam-press flex min-h-[44px] items-center gap-2 rounded-xl bg-royal-deep px-4 text-sm font-bold text-white shadow-sm ${theme.tile}`}>
                            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 5a2 2 0 0 1 2-2h5v16H6a2 2 0 0 0-2 2V5zM20 5a2 2 0 0 0-2-2h-5v16h5a2 2 0 0 1 2 2V5z" />
                            </svg>
                            {c.reader.label}
                          </SaverLink>
                        )}
                        {c.href && (
                          <SaverLink href={c.href} data-chapter-explain className="fam-press flex min-h-[44px] items-center rounded-xl bg-white px-4 text-sm font-bold text-royal-deep ring-1 ring-royal/25 hover:bg-off-white">
                            {c.hrefLabel ?? c.title}
                          </SaverLink>
                        )}
                      </div>
                    )}
                    {c.extra}
                    {c.topics.length > 0 && (
                      <ul className="flex flex-col">
                        {c.topics.map((tp, j) => (
                          <li key={tp.key ?? `${j}:${tp.title}`} className="flex items-center gap-1">
                            <SaverLink href={tp.href} className="flex min-h-[44px] flex-1 items-center gap-3 rounded-xl px-2 text-sm text-slate hover:bg-off-white">
                              <span aria-hidden="true" className={`ml-1 h-2 w-2 shrink-0 rounded-full ${theme.chip}`} />
                              <span lang={titleLang(tp.title)}>{tp.title}</span>
                            </SaverLink>
                            {tp.worksheet && (
                              <SaverLink href={tp.worksheet.href} aria-label={tp.worksheet.ariaLabel} className={`fam-press flex min-h-[44px] shrink-0 items-center rounded-xl px-3 text-sm font-bold hover:bg-off-white ${theme.ink}`}>
                                {tp.worksheet.label}
                              </SaverLink>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
