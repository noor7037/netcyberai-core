import type { SchoolProgress } from '@/lib/contracts/progress-report';
import { fill, type Words } from '@/lib/family/fill';
import { SchoolText } from './SchoolText';

// A child's progress report in the Family app (C230-AJ part 5): the exams of this session the school published and shared,
// by kind of exam, oldest first, each with its subjects' percent and grade and the overall, as the report card says them.
// Read as the guardian, so only the child's own published results are ever here; it compares the child with no one (no rank,
// no position). The kinds of exam are the school's own, in the reader's language. Calm: no chart, no colour judging.

const day = (iso: string, lang: 'en' | 'hi') => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const scored = (w: Words, percent: number | null, grade: string | null) => (percent === null ? w['fam.school.resultNotComplete'] : grade ? `${percent}% · ${grade}` : `${percent}%`);

export function SchoolProgressView({ progress, w, lang }: { progress: SchoolProgress; w: Words; lang: 'en' | 'hi' }) {
  if (progress.groups.length === 0) {
    return (
      <p className="fam-card bg-white p-4 text-base text-slate" data-progress-none>
        {w['fam.schoolProgress.none']}
      </p>
    );
  }
  return (
    <>
      {progress.session && <p className="px-1 text-sm font-bold text-slate" data-progress-session>{fill(w['fam.schoolProgress.session'], { session: progress.session })}</p>}
      {progress.groups.map((g) => (
        <section key={g.type} className="fam-card flex flex-col gap-3 bg-white p-4 sm:p-5" data-progress-group={g.type}>
          <h2 className="text-lg font-extrabold text-slate">{lang === 'hi' ? g.name.hi : g.name.en}</h2>
          <ol className="flex flex-col gap-3">
            {g.exams.map((e) => (
              <li key={e.examId} className="flex flex-col gap-1 rounded-2xl bg-off-white px-3 py-3" data-progress-exam={e.examId}>
                <p className="text-base font-bold text-slate">
                  <SchoolText text={e.term ? `${e.name} · ${e.term}` : e.name} />
                </p>
                <p className="text-sm text-slate">{fill(w['fam.school.resultPublished'], { date: day(e.publishedOn, lang) })}</p>
                <ul className="flex flex-col">
                  {e.subjects.map((s, i) => (
                    <li key={i} className="text-base font-semibold text-slate">
                      <SchoolText text={s.name} />: {scored(w, s.percent, s.grade)}
                    </li>
                  ))}
                </ul>
                <p className="text-base font-bold text-slate">
                  {w['fam.school.resultOverall']}: {scored(w, e.overall.percent, e.overall.grade)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}
