import Link from 'next/link';
import { subjectTheme } from '@/lib/family/subject-theme';
import { SubjectGlyph } from './SubjectGlyph';

export type SubjectTileData = { subject: string; name: string; open: boolean; free: boolean; checked: number; mastered: number };

// The child's subjects as tiles in their own colours (D1, C230-Q; the overview board's subject grid). Each shows what
// is true: topics checked and mastered from checked answers only (02 §4.2), "free" on the free subject, a lock on a
// subject that opens with Family Plus. No ranks, no streaks (09 §6).
export function SubjectGrid({ title, tiles, words, delay = 0 }: { title: string; tiles: SubjectTileData[]; words: { free: string; locked: string; start: string; meter: (checked: number, mastered: number) => string }; delay?: number }) {
  if (!tiles.length) return null;
  return (
    <section aria-labelledby="fam-subjects" className="flex flex-col gap-3">
      <h2 id="fam-subjects" className="fam-h2 px-1 text-slate">
        {title}
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((s, i) => {
          const theme = subjectTheme(s.subject);
          return (
            <li key={s.subject} className="fam-rise" style={{ ['--d' as string]: `${delay + i * 60}ms` } as React.CSSProperties}>
              <Link href={`/family/study?subject=${s.subject}`} className={`fam-tile fam-press flex h-full min-h-[132px] flex-col justify-between gap-3 bg-ink p-4 text-white ${theme.tile}`}>
                <span className="flex items-start justify-between gap-2">
                  <span className="fam-icon-glass flex h-11 w-11 items-center justify-center rounded-xl">
                    <SubjectGlyph subject={s.subject} className="h-6 w-6" />
                  </span>
                  {s.free && <span className="fam-pill bg-white text-slate">{words.free}</span>}
                  {!s.open && (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="5" y="11" width="14" height="10" rx="2" />
                        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                      </svg>
                      <span className="sr-only">{words.locked}</span>
                    </span>
                  )}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-lg font-extrabold leading-tight text-white">{s.name}</span>
                  <span className="fam-num text-sm font-semibold text-white">{s.checked ? words.meter(s.checked, s.mastered) : words.start}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
