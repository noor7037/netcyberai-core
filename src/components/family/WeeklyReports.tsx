import { sameInkOnBothSides } from '@/lib/family/day-text';
import { fill, type Words } from '@/lib/family/fill';
import type { StoredReport } from '@/lib/family/parent-report';

// The weekly parent reports of one child (W16-B3) on the parent area's Progress: the newest first, each its four
// sentences and its counts as tiles. Written from counts and chapter names only; nothing here compares the child.
export const weekLabel = (weekStart: string, lang: 'en' | 'hi'): string =>
  sameInkOnBothSides(new Date(`${weekStart}T00:00:00Z`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }));

export function WeeklyReports({ reports, w, lang }: { reports: readonly StoredReport[]; w: Words; lang: 'en' | 'hi' }) {
  return (
    <section data-weekly-reports aria-labelledby="weekly-reports-title" className="mb-6 flex flex-col gap-3">
      <h2 id="weekly-reports-title" className="text-lg font-bold text-ink">
        {w['fam.report.section']}
      </h2>
      {reports.length === 0 ? (
        <p data-weekly-reports-none className="fam-card bg-white p-4 text-base text-slate">
          {w['fam.report.none']}
        </p>
      ) : (
        reports.map((r) => {
          const c = r.body.counts;
          const tiles: [string, string][] = [
            [w['fam.report.tile.sessions'], String(c.sessions)],
            [w['fam.report.tile.questions'], String(c.questions)],
          ];
          if (c.quizAverage !== null) tiles.push([w['fam.report.tile.quiz'], `${c.quizAverage}%`]);
          if (c.voiceMinutes > 0) tiles.push([w['fam.report.tile.voice'], String(c.voiceMinutes)]);
          if (c.drawings) tiles.push([w['fam.report.tile.drawings'], String(c.drawings)]);
          if (c.school && c.school.markedDays > 0) tiles.push([w['fam.report.tile.school'], fill(w['fam.report.tile.schoolValue'], { present: c.school.presentDays, marked: c.school.markedDays })]);
          return (
            <article key={r.weekStart} data-weekly-report={r.weekStart} className="fam-card flex flex-col gap-3 bg-white p-4 text-slate">
              <p className="text-sm font-semibold text-ink">{fill(w['fam.report.weekOf'], { date: weekLabel(r.weekStart, lang) })}</p>
              <p className="text-base leading-relaxed">{r.body.sentences.join(' ')}</p>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {tiles.map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-paper p-3">
                    <dt className="text-sm">{label}</dt>
                    <dd className="text-xl font-bold text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              {c.chapters.length > 0 && (
                <p className="text-sm">
                  <span className="font-semibold">{w['fam.report.chaptersLabel']}: </span>
                  {c.chapters.map((x) => x.name).join(', ')}
                </p>
              )}
              {c.weak.length > 0 && (
                <p className="text-sm">
                  <span className="font-semibold">{w['fam.report.weakLabel']}: </span>
                  {c.weak.join(', ')}
                </p>
              )}
              {c.school && c.school.results.length > 0 && (
                <p className="text-sm">
                  <span className="font-semibold">{w['fam.report.resultsLabel']}: </span>
                  {c.school.results.map((x) => (x.percent === null ? x.exam : `${x.exam} ${x.percent}%`)).join(', ')}
                </p>
              )}
              <p className="text-xs">{w['fam.report.fromCounts']}</p>
            </article>
          );
        })
      )}
    </section>
  );
}
