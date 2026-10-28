'use client';

import { useWords } from '@/components/app-shell/Words';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Badge } from '@/components/ui/Badge';
import type { BillingOverview } from '@/lib/control/billing';
import type { Trial } from '@/lib/control/trial';
import type { MessageKey } from '@/lib/i18n';

// Control → Billing & Plans → Free month (C226, docs/30): every school with a free month, in force first and the
// soonest last day first (the server's order), then those that have ended. Each with its last day, the days left and
// the plan after it. The free month is started and extended on the school's own card below.

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

// "12 days left", "last day today", or "last day passed: moved tonight" (before the nightly job has run).
export function trialLeft(t: T, tCount: (base: string, count: number) => string, trial: Trial): string {
  if (trial.daysLeft > 0) return tCount('billing.trial.daysLeft', trial.daysLeft);
  return t(trial.daysLeft === 0 ? 'billing.trial.lastDay' : 'billing.trial.overdue');
}

// The free month in one line: in force, or how it ended.
export function trialLine(t: T, tCount: (base: string, count: number) => string, day: (iso: string) => string, trial: Trial): string {
  const plan = trial.planName ?? t('billing.trial.noPlan');
  return trial.inForce ? t('billing.trial.until', { last: day(trial.endsOn), left: trialLeft(t, tCount, trial), plan }) : t('billing.trial.endedOn', { last: day(trial.endsOn), plan });
}

export function BillingTrials({ data }: { data: BillingOverview }) {
  const { t, tCount, lang } = useWords();
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const day = (isoDate: string) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${isoDate}T00:00:00Z`));
  return (
    <section data-billing-trials className="flex flex-col gap-3 rounded-xl border border-slate/10 bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 className="text-lg font-bold">{t('billing.trials.title')}</h2>
        <InfoTip>{t('billing.trials.how')}</InfoTip>
      </div>
      {data.trials.length === 0 && <p className="rounded-md bg-off-white px-3 py-2">{t('billing.trials.none')}</p>}
      <ul className="flex flex-col gap-2">
        {data.trials.map((trial) => (
          <li key={trial.schoolId} data-billing-trial={trial.schoolId} data-billing-trial-state={trial.inForce ? 'in_force' : 'ended'} className="flex flex-col gap-1 rounded-md border border-slate/10 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <a href={`#billing-school-${trial.schoolId}`} className="inline-flex min-h-[44px] items-center break-words font-bold text-sapphire underline">
                {trial.schoolName}
              </a>
              {trial.inForce && <Badge variant={trial.daysLeft <= data.trialNoticeDays ? 'warning' : 'success'}>{trialLeft(t, tCount, trial)}</Badge>}
              {trial.isTest && <Badge>{t('billing.school.test')}</Badge>}
            </div>
            <p data-billing-trial-line className="break-words">
              {trialLine(t, tCount, day, trial)}
            </p>
            {trial.extensions > 0 && <p className="text-slate/70">{tCount('billing.trial.extensions', trial.extensions)}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
