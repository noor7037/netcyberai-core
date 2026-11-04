import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { AverageBar, StatTiles } from '@/components/family/progress/ProgressParts';
import { WeekChart } from '@/components/family/progress/WeekChart';
import { classSubjects } from '@/lib/family/catalog';
import { loadChildSettings } from '@/lib/family/child-settings';
import { isPrePrimary, syllabusBoardOf } from '@/lib/family/children';
import { sameInkOnBothSides } from '@/lib/family/day-text';
import { childProgress, openSubjects } from '@/lib/family/learning';
import { subjectAccess } from '@/lib/family/modules';
import { progressStats, weekAnswers, weekBars } from '@/lib/family/progress-view';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { t } from '@/lib/i18n';
import { indiaDate } from '@/lib/time/india';

// W19-C: the child's own Progress (the founder's reference "Learning Plan"; W11-A had sent this address to the parent
// area, whose Overview stays as it is). Three stat tiles (subjects open, topics checked, topics mastered), the average
// progress (mastered out of checked, said in words under the bar), the last seven days' checked answers as bars, and the
// topics with their state. Made only of checked answers (02 §4.2): no time in the app, no streaks, no ranks.
export default async function FamilyProgressPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const today = indiaDate();
  const { progress, subjects, openToAll, week, settings } = await familyPageRead(page, async (db) => ({
    progress: await childProgress(db, page.session.accountId, child.childId, lang),
    subjects: isPrePrimary(child.classLevel) ? [] : await classSubjects(db, { board: syllabusBoardOf(child), classLevel: child.classLevel, stream: child.stream }),
    openToAll: await openSubjects(db),
    week: await weekAnswers(db, page.session.accountId, child.childId, today),
    settings: await loadChildSettings(db, page.session.accountId, child.childId),
  }));
  const stats = progressStats(progress, subjects.filter((s) => subjectAccess(child, s, openToAll).open).length);
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const dayName = (day: string, weekday: 'short' | 'long') => sameInkOnBothSides(new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, { weekday, timeZone: 'UTC' }));
  const bars = weekBars(week, today).map((b) => ({ ...b, short: dayName(b.day, 'short'), value: t(lang, 'fam.w19.progress.dayValue', { n: b.n, day: dayName(b.day, 'long') }) }));
  const total = week.reduce((a, d) => a + d.n, 0);
  return (
    <div lang={lang} data-family-progress-page data-fam-motion={settings.motion ? undefined : 'off'} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family" backLabel={t(lang, 'fam.nav.home')} title={t(lang, 'fam.progress.title')} />
      <main className="fam-page">
        <StatTiles
          tiles={[
            { key: 'subjects', label: t(lang, 'fam.w19.progress.subjects'), value: stats.subjects },
            { key: 'checked', label: t(lang, 'fam.w19.progress.checked'), value: stats.checked },
            { key: 'mastered', label: t(lang, 'fam.w19.progress.mastered'), value: stats.mastered },
          ]}
        />
        <AverageBar title={t(lang, 'fam.w19.progress.average')} value={stats.average} label={t(lang, 'fam.w19.progress.averageValue', { n: stats.average ?? 0 })} note={t(lang, 'fam.w19.progress.averageNote')} none={t(lang, 'fam.w19.progress.averageNone')} />
        <section data-progress-week aria-labelledby="fam-week-chart" className="fam-card fam-section fam-rise bg-white px-2 sm:px-5" style={{ ['--d' as string]: '240ms' } as React.CSSProperties}>
          <div className="px-2 sm:px-0">
            <h2 id="fam-week-chart" className="fam-h2 text-ink">
              {t(lang, 'fam.w19.progress.week')}
            </h2>
            <p className="fam-num text-sm font-semibold text-ink">{t(lang, 'fam.w19.progress.weekTotal', { n: total })}</p>
          </div>
          <WeekChart bars={bars} label={t(lang, 'fam.w19.progress.week')} />
          <p className="fam-note px-2 text-ink sm:px-0">{t(lang, 'fam.w19.progress.weekNote')}</p>
        </section>
        {progress.length > 0 && (
          <section data-family-progress aria-labelledby="fam-progress" className="fam-card fam-section fam-rise bg-white" style={{ ['--d' as string]: '300ms' } as React.CSSProperties}>
            <h2 id="fam-progress" className="fam-h2 text-ink">
              {t(lang, 'fam.w19.progress.topics')}
            </h2>
            <p className="text-sm text-ink">{t(lang, 'fam.progress.summary', { topics: progress.length, mastered: stats.mastered })}</p>
            <ul className="flex flex-col gap-2">
              {progress.slice(0, 20).map((p) => (
                <li key={p.topicKey}>
                  <Link href={`/family/understand?kind=${/\.t\d+$/.test(p.topicKey) ? 'topic' : 'chapter'}&key=${encodeURIComponent(p.topicKey)}`} className="fam-row fam-lift justify-between bg-off-white">
                    <span className="min-w-0 text-sm font-semibold text-slate">{p.title}</span>
                    <span className={`fam-pill shrink-0 ${p.mastered ? 'bg-emerald-text text-white' : 'bg-white text-slate ring-1 ring-slate/15'}`}>
                      {p.mastered ? t(lang, 'fam.progress.mastered') : t(lang, 'fam.progress.rightOf', { right: p.correct, all: p.answered })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
