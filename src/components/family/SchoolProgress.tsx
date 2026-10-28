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
        <section key={g.type} className="fam-card fam-section bg-white" data-progress-group={g.type}>
          <h2 className="fam-h2 text-slate">{lang === 'hi' ? g.name.hi : g.name.en}</h2>
          <ol className="flex flex-col gap-3">
            {g.exams.map((e) => (
              <li key={e.examId} className="flex flex-col gap-1 rounded-xl bg-off-white px-3 py-3" data-progress-exam={e.examId}>
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
      {progress.weighted && <Counted weighted={progress.weighted} w={w} lang={lang} />}
    </>
  );
}

// The result across the exam types the school counts (C230-AJ part 2), only when its grading scheme counts some: each subject's
// percent in each counted type, and the counted result. A counted type with nothing published yet reads "not complete", and so
// does the result. About the child alone.
function Counted({ weighted, w, lang }: { weighted: NonNullable<SchoolProgress['weighted']>; w: Words; lang: 'en' | 'hi' }) {
  const types = weighted.weights.map((x) => fill(w['fam.schoolProgress.countedType'], { name: lang === 'hi' ? x.name.hi : x.name.en, weight: x.weight })).join(', ');
  const rows = [...weighted.subjects.map((s) => ({ name: s.name, types: s.types, percent: s.percent, grade: s.grade, strong: false })), { name: w['fam.school.resultOverall'], types: weighted.overall.types, percent: weighted.overall.percent, grade: weighted.overall.grade, strong: true }];
  return (
    <section className="fam-card fam-section bg-white" data-progress-counted>
      <h2 className="fam-h2 text-slate">{w['fam.schoolProgress.counted']}</h2>
      <p className="text-sm text-slate">{fill(w['fam.schoolProgress.countedHow'], { types })}</p>
      <ul className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-col gap-1 rounded-xl bg-off-white px-3 py-3">
            <p className="text-base font-bold text-slate">{r.strong ? r.name : <SchoolText text={r.name} />}</p>
            <p className="text-sm text-slate">{r.types.map((p, j) => `${lang === 'hi' ? weighted.weights[j].name.hi : weighted.weights[j].name.en}: ${p === null ? w['fam.school.resultNotComplete'] : `${Math.round(p * 10) / 10}%`}`).join(' · ')}</p>
            <p className="text-base font-bold text-slate">{fill(w['fam.schoolProgress.countedResult'], { value: scored(w, r.percent, r.grade) })}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
