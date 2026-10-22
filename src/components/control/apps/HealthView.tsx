import { AppCard } from '@/components/app-ui/Card';
import { StatTile } from '@/components/app-ui/StatTile';
import type { Alert, Health } from '@/lib/control/health';
import { t, type Lang } from '@/lib/i18n';

// Control → Apps, health and usage (M2-11, C285): today's alerts first, then the AI platform per profile, then M2's
// counts. Numbers and ids only (src/lib/control/health.ts keeps nothing else).

const count = (n: number) => n.toLocaleString('en-IN');

function alertText(a: Alert, lang: Lang): string {
  switch (a.kind) {
    case 'ai_failures':
      return t(lang, 'control.health.alert.aiFailures', { profile: a.profileId, failures: count(a.failures), requests: count(a.requests) });
    case 'ai_cap':
      return t(lang, 'control.health.alert.aiCap', { profile: a.profileId, refusals: count(a.refusals) });
    case 'key_test_failed':
      return t(lang, 'control.health.alert.keyTest', { provider: a.providerId });
    case 'video_quota':
      return t(lang, 'control.health.alert.videoQuota', { used: count(a.used), limit: count(a.limit) });
    case 'review_queue':
      return t(lang, 'control.health.alert.reviewQueue', { days: count(a.oldestDays), target: count(a.targetDays) });
  }
}

export function HealthView({ health, lang }: { health: Health; lang: Lang }) {
  const c = health.counts;
  return (
    <div className="flex min-w-0 flex-col gap-4" data-control-health>
      <AppCard title={t(lang, 'control.health.alerts')}>
        {health.alerts.length === 0 ? (
          <p className="text-sm text-slate/80" data-health-ok>
            {t(lang, 'control.health.allClear')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-health-alerts>
            {health.alerts.map((a, i) => (
              <li key={i} role="status" className="rounded-xl bg-coral/10 px-3 py-2 text-sm font-semibold text-slate">
                {alertText(a, lang)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate/80">{t(lang, 'control.health.alertsNote')}</p>
      </AppCard>
      <AppCard title={t(lang, 'control.health.ai')}>
        {health.profiles.length === 0 ? (
          <p className="text-sm text-slate/80">{t(lang, 'control.health.aiNone')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm text-slate">
              <thead>
                <tr className="border-b border-slate/10 text-xs uppercase tracking-wide text-slate/80">
                  <th scope="col" className="py-2 pr-3">{t(lang, 'control.health.col.profile')}</th>
                  <th scope="col" className="py-2 pr-3">{t(lang, 'control.health.col.today')}</th>
                  <th scope="col" className="py-2 pr-3">{t(lang, 'control.health.col.failures')}</th>
                  <th scope="col" className="py-2 pr-3">{t(lang, 'control.health.col.capRefusals')}</th>
                  <th scope="col" className="py-2 pr-3">{t(lang, 'control.health.col.month')}</th>
                  <th scope="col" className="py-2">{t(lang, 'control.health.col.tokens')}</th>
                </tr>
              </thead>
              <tbody>
                {health.profiles.map((p) => (
                  <tr key={p.profileId} className="border-b border-slate/5">
                    <th scope="row" className="py-2 pr-3 font-mono text-xs font-semibold">{p.profileId}</th>
                    <td className="py-2 pr-3">{count(p.requestsToday)}</td>
                    <td className="py-2 pr-3">{count(p.failuresToday)}</td>
                    <td className="py-2 pr-3">{count(p.capRefusalsToday)}</td>
                    <td className="py-2 pr-3">{count(p.requestsMonth)}</td>
                    <td className="py-2">{count(p.tokensMonth)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AppCard>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile icon="calendar" tone="royal" label={t(lang, 'control.health.plansDone7d')} value={`${count(c.plansDone7d)} / ${count(c.plansBuilt7d)}`} attrs={{ 'data-count': 'plans_done_7d' }} />
        <StatTile icon="student" tone="emerald" label={t(lang, 'control.health.childrenPlanDone7d')} value={count(c.childrenPlanDone7d)} attrs={{ 'data-count': 'children_plan_done_7d' }} />
        <StatTile icon="reports" tone="amber" label={t(lang, 'control.health.revisitsDue')} value={count(c.revisitsDue)} attrs={{ 'data-count': 'revisits_due' }} />
        <StatTile icon="exams" tone="grape" label={t(lang, 'control.health.photoQuestions7d')} value={count(c.photoQuestions7d)} attrs={{ 'data-count': 'photo_questions_7d' }} />
        <StatTile icon="pulse" tone="violet" label={t(lang, 'control.health.videoSearchesToday')} value={`${count(health.video.used)} / ${count(health.video.limit)}`} attrs={{ 'data-count': 'video_searches_today' }} />
      </div>
    </div>
  );
}
