import Link from 'next/link';
import { familyClaims } from '@/lib/family/db';
import { redirect } from 'next/navigation';
import { ExamTimetable } from '@/components/family/ExamTimetable';
import { SchoolText } from '@/components/family/SchoolText';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { LinkRow } from '@/components/family/ui/LinkRow';
import { fill } from '@/lib/family/fill';
import { MY_RESULTS_KEYS } from '@/lib/family/marks-words';
import { activeLinks, childResultsFor } from '@/lib/family/school';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { sameInkOnBothSides } from '@/lib/family/day-text';

// "My results" (C351), the child's own view: for the child using the app now, matched to a school student, the results
// the school published for their class and their coming exam papers, only while the school lets children see their
// own results. Calm: each subject's percent and grade as the report card says them, a way into each checked paper, and
// nothing about any other child. Without the school's leave there is nothing here, and the home shows no way in.
export const dynamic = 'force-dynamic';

const day = (iso: string, lang: 'en' | 'hi') => sameInkOnBothSides(new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)));

export default async function FamilyMyResultsPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const w = familyWords(lang, MY_RESULTS_KEYS);
  const links = await familyPageRead(page, (db) => activeLinks(db, page.session.accountId));
  const mine = await childResultsFor(familyClaims(page.session), links, child.childId);
  if (!mine) redirect('/family');
  const scored = (percent: number | null, grade: string | null) => (percent === null ? w['fam.school.resultNotComplete'] : grade ? `${percent}% · ${grade}` : `${percent}%`);
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family" backLabel={w['fam.tab.home']} title={w['fam.marks.myResults']} tone="emerald" />
      <main className="fam-page" data-my-results>
        <LinkRow href="/family/results/progress" icon="chart" data-my-progress-link="" card>
          {w['fam.schoolProgress.open']}
        </LinkRow>
        <section className="fam-card fam-section fam-rise bg-white">
          <ExamTimetable w={w} lang={lang} papers={mine.examSchedule} heading="h2" />
        </section>
        {mine.results.length === 0 ? (
          <p className="fam-card bg-white p-4 text-base font-semibold text-slate">{w['fam.marks.none']}</p>
        ) : (
          mine.results.map((r, i) => (
            <section key={i} className="fam-card fam-section fam-rise bg-white" style={{ ['--d' as string]: `${i * 60}ms` } as React.CSSProperties} data-my-result>
              <div className="flex flex-col gap-1">
                <h2 className="fam-h2 text-slate">
                  <SchoolText text={r.term ? `${r.exam} · ${r.term}` : r.exam} />
                </h2>
                <p className="fam-note text-slate/80">{fill(w['fam.school.resultPublished'], { date: day(r.publishedOn, lang) })}</p>
              </div>
              <ul className="flex flex-col gap-2">
                {r.subjects.map((s) => (
                  <li key={s.paperId} className="fam-row flex-wrap justify-between gap-2 bg-off-white">
                    <span className="text-base font-semibold text-slate">
                      <SchoolText text={s.name} />: <span className="fam-num">{scored(s.percent, s.grade)}</span>
                    </span>
                    {s.checked && (
                      <Link
                        href={`/family/results/${s.paperId}`}
                        aria-label={fill(w['fam.marks.openSubject'], { subject: s.name })}
                        data-checked-paper-link={s.paperId}
                        className="fam-lift inline-flex min-h-[44px] items-center rounded-full bg-white px-4 text-sm font-bold text-ink ring-1 ring-ink/25"
                      >
                        {w['fam.marks.open']}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              <p className="fam-row justify-between bg-ink text-base font-extrabold text-white">
                <span>{w['fam.school.resultOverall']}</span>
                <span className="fam-num text-lg">{scored(r.overall.percent, r.overall.grade)}</span>
              </p>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
