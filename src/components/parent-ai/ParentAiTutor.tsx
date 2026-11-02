import { AppCard } from '@/components/app-ui/Card';
import { withTenantContext } from '@/lib/auth/db';
import type { StaffRole } from '@/lib/auth/types';
import { getServerSession } from '@/lib/auth/server-session';
import { t, type MessageKey } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { DOUBT_ROLES, SUMMARY_ROLES, readClassSummaries, readRecentDoubts, summaryWeek, weekText, type ClassDoubts, type ClassSummary } from '@/lib/parent-ai/doubts';
import { indiaDate } from '@/lib/time/india';
import { ClassSummaryDraft } from './ClassSummaryDraft';

// The Family app's tutor, as the school sees it (W16-B3): the recent doubts of the reader's own classes (the office:
// every class) as chapters, topics and counts, and, for the principal and the school admin, the week's class summaries
// with "Draft the notices". Counts only: no child's name and no question is ever shown. Nothing when the reader's role
// has neither, or the read fails (the rest of the page stands).
export async function ParentAiTutor() {
  const session = await getServerSession();
  if (!session?.schoolId || !DOUBT_ROLES.includes(session.role)) return null;
  const { lang } = getLang(session.sub);
  const actor = { schoolId: session.schoolId, userId: session.sub, role: session.role as StaffRole };
  const week = summaryWeek(indiaDate());
  let doubts: ClassDoubts[];
  let summaries: ClassSummary[] | null;
  try {
    [doubts, summaries] = await withTenantContext(session, async (db) => [await readRecentDoubts(db, actor, lang), SUMMARY_ROLES.includes(session.role) ? await readClassSummaries(db, actor, lang, week) : null]);
  } catch {
    return null;
  }
  return (
    <div data-parent-ai-tutor className="mb-6 flex flex-col gap-4">
      <AppCard title={t(lang, 'pai.doubts.title')} description={t(lang, 'pai.doubts.lead')}>
        {doubts.length === 0 ? (
          <p data-doubts-none className="text-sm text-slate/80">
            {t(lang, 'pai.doubts.none')}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {doubts.map((c) => (
              <section key={c.classId} data-doubts-class={c.className} aria-label={c.className}>
                <h3 className="text-sm font-bold text-slate">{c.className}</h3>
                <ul className="mt-1 flex flex-col divide-y divide-slate/10">
                  {c.doubts.map((d, i) => (
                    <li key={i} data-doubt-row className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 py-2 text-sm text-slate">
                      <span className="min-w-0">
                        <span className="font-semibold">{t(lang, `fam.subject.${d.subject}` as MessageKey)}</span>
                        {' · '}
                        {d.chapter ?? t(lang, 'pai.doubts.general')}
                        {d.topic ? ` · ${d.topic}` : ''}
                      </span>
                      <span className="shrink-0 font-semibold">{t(lang, 'pai.doubts.count', { n: d.count })}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </AppCard>
      {summaries && (
        <AppCard
          title={`${t(lang, 'pai.summary.title')} · ${weekText(week, lang)}`}
          description={t(lang, 'pai.summary.lead')}
          actions={summaries.length > 0 ? <ClassSummaryDraft words={{ draft: t(lang, 'pai.summary.draft'), drafted: t(lang, 'pai.summary.drafted'), failed: t(lang, 'pai.summary.failed') }} /> : undefined}
        >
          {summaries.length === 0 ? (
            <p data-summary-none className="text-sm text-slate/80">
              {t(lang, 'pai.summary.none')}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate/10">
              {summaries.map((s) => (
                <li key={s.classId} data-summary-row className="flex min-h-[44px] flex-col gap-0.5 py-2 text-sm text-slate">
                  <span className="font-bold">{s.className}</span>
                  <span>{t(lang, 'pai.summary.row', { children: s.children, sessions: s.sessions, questions: s.questions })}</span>
                  {s.chapters.length > 0 && <span>{t(lang, 'pai.summary.bodyChapters', { chapters: s.chapters.join(', ') })}</span>}
                  {s.quizPercent !== null && <span>{t(lang, 'pai.summary.bodyQuiz', { percent: s.quizPercent })}</span>}
                </li>
              ))}
            </ul>
          )}
        </AppCard>
      )}
    </div>
  );
}
