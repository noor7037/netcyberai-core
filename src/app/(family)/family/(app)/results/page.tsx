import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExamTimetable } from '@/components/family/ExamTimetable';
import { SchoolText } from '@/components/family/SchoolText';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { fill } from '@/lib/family/fill';
import { MY_RESULTS_KEYS } from '@/lib/family/marks-words';
import { activeLinks, childResultsFor } from '@/lib/family/school';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';

// "My results" (C351), the child's own view: for the child using the app now, matched to a school student, the results
// the school published for their class and their coming exam papers, only while the school lets children see their
// own results. Calm: each subject's percent and grade as the report card says them, a way into each checked paper, and
// nothing about any other child. Without the school's leave there is nothing here, and the home shows no way in.
export const dynamic = 'force-dynamic';

const day = (iso: string, lang: 'en' | 'hi') => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

export default async function FamilyMyResultsPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const w = familyWords(lang, MY_RESULTS_KEYS);
  const links = await familyPageRead(page, (db) => activeLinks(db, page.session.accountId));
  const mine = await childResultsFor({ accountId: page.session.accountId, tokenVersion: page.session.tokenVersion }, links, child.childId);
  if (!mine) redirect('/family');
  const scored = (percent: number | null, grade: string | null) => (percent === null ? w['fam.school.resultNotComplete'] : grade ? `${percent}% · ${grade}` : `${percent}%`);
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family" backLabel={w['fam.tab.home']} title={w['fam.marks.myResults']} tone="emerald" />
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24" data-my-results>
        <p className="fam-card bg-white p-4 text-sm font-semibold text-slate">{w['fam.marks.myResultsLead']}</p>
        <section className="fam-card fam-rise bg-white p-4 sm:p-5">
          <ExamTimetable w={w} lang={lang} papers={mine.examSchedule} heading="h2" />
        </section>
        {mine.results.length === 0 ? (
          <p className="fam-card bg-white p-4 text-base text-slate">{w['fam.marks.none']}</p>
        ) : (
          mine.results.map((r, i) => (
            <section key={i} className="fam-card flex flex-col gap-2 bg-white p-4 sm:p-5" data-my-result>
              <h2 className="text-lg font-extrabold text-slate">
                <SchoolText text={r.term ? `${r.exam} · ${r.term}` : r.exam} />
              </h2>
              <p className="text-sm text-slate">{fill(w['fam.school.resultPublished'], { date: day(r.publishedOn, lang) })}</p>
              <ul className="flex flex-col gap-2">
                {r.subjects.map((s) => (
                  <li key={s.paperId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-off-white px-3 py-2">
                    <span className="text-base font-semibold text-slate">
                      <SchoolText text={s.name} />: {scored(s.percent, s.grade)}
                    </span>
                    {s.checked && (
                      <Link
                        href={`/family/results/${s.paperId}`}
                        aria-label={fill(w['fam.marks.openSubject'], { subject: s.name })}
                        data-checked-paper-link={s.paperId}
                        className="fam-press inline-flex min-h-[44px] items-center rounded-xl bg-white px-3 text-sm font-bold text-royal ring-1 ring-royal/20"
                      >
                        {w['fam.marks.open']}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-base font-bold text-slate">
                {w['fam.school.resultOverall']}: {scored(r.overall.percent, r.overall.grade)}
              </p>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
