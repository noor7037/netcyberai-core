'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Input } from '@/components/ui/Input';
import type { BillingOverview } from '@/lib/control/billing';
import type { Trial, TrialEvent } from '@/lib/control/trial';
import type { Send } from './BillingSchools';
import { trialLine } from './BillingTrials';

// Control → Billing & Plans → a school → "Free month" (C226, docs/30). Read by NetCyberAI staff only.
//   - No free month yet: "Start the free month": its last day (day 30 by default), the plan after it (the school's
//     plan by default; a test schools' plan only for a test school), and a reason only the founder reads. A school that
//     already pays cannot start one (the screen says so; the server refuses it too).
//   - In its free month: the line, and "Extend the free month": a later last day and a reason.
//   - Ended: the line, and that a complimentary term is the way to give modules for a time now.
//   - What happened: each start, extension and end, by whom and when, with the reason.
// Every change goes to the Control API, which checks the session and writes the audit row.

type School = BillingOverview['schools'][number];
type Loaded = { trial: Trial | null; history: TrialEvent[] };
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const FIELD = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-3 text-sm text-slate';
const shiftDay = (isoDay: string, n: number) => new Date(Date.parse(`${isoDay}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const validReason = (r: string) => r.trim().length >= 3 && r.trim().length <= 500;

export function BillingTrial({ school, data, busy, send }: { school: School; data: BillingOverview; busy: boolean; send: Send }) {
  const { t, tCount, lang } = useT();
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const day = (isoDate: string) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${isoDate}T00:00:00Z`));
  const moment = (at: string) => new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(at));
  const url = `/api/control/schools/${school.schoolId}/subscription`;
  const planName = (planId: string | null) => data.plans.find((p) => p.planId === planId)?.name ?? t('billing.trial.noPlan');

  // The plans a school may be put on: not retired (unless it is on it already), and a test schools' plan only for a test school.
  const plans = data.plans.filter((p) => (!p.retired || p.planId === school.planId) && (!p.testSchoolsOnly || school.isTest));
  // The plan after the free month starts as the school's own plan (chosen at onboarding), else the plan for new schools,
  // whichever of them may be chosen here.
  const offered = (planId: string | null) => (planId !== null && plans.some((p) => p.planId === planId) ? planId : null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [start, setStart] = useState({ endsOn: shiftDay(data.today, data.trialDays), planId: offered(school.planId) ?? offered(data.defaultPlanId) ?? '', reason: '' });
  const [extend, setExtend] = useState({ endsOn: '', reason: '' });

  const load = useCallback(async () => {
    const res = await fetch(url, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? await res.json().catch(() => null) : null;
    setLoaded({ trial: (got?.trial as Trial | null) ?? null, history: (got?.trialHistory as TrialEvent[] | undefined) ?? [] });
  }, [url]);
  useEffect(() => {
    void load();
  }, [load]);

  const trial = loaded?.trial ?? null;
  const startTrial = async () => {
    const ok = await send(url, { action: 'trial_start', endsOn: start.endsOn, planId: start.planId, reason: start.reason.trim() }, 'billing.trial.started');
    if (ok) await load();
  };
  const extendTrial = async () => {
    const ok = await send(url, { action: 'trial_extend', endsOn: extend.endsOn, reason: extend.reason.trim() }, 'billing.trial.extended');
    if (ok) {
      setExtend({ endsOn: '', reason: '' });
      await load();
    }
  };
  const eventLine = (e: TrialEvent) => {
    if (e.kind === 'started') return t('billing.trial.event.started', { last: e.endsOn ? day(e.endsOn) : '—', plan: planName(e.planId) });
    if (e.kind === 'extended') return t('billing.trial.event.extended', { from: e.endsOnBefore ? day(e.endsOnBefore) : '—', to: e.endsOn ? day(e.endsOn) : '—' });
    return t('billing.trial.event.ended', { plan: planName(e.planId) });
  };

  return (
    <div data-billing-trial-panel className="flex flex-col gap-3 rounded-md bg-off-white p-3">
      <div>
        <h3 className="text-base font-bold">{t('billing.trial.title')}</h3>
        <p className="max-w-prose text-slate/70">{t('billing.trial.how')}</p>
      </div>
      {!loaded && <p className="text-slate/70">{t('billing.trial.historyLoading')}</p>}
      {trial && (
        <p data-billing-trial-now className="break-words font-semibold">
          {trialLine(t, tCount, day, trial)}
        </p>
      )}

      {loaded && !trial && school.paidUntil && <p className="max-w-prose">{t('billing.trial.billed')}</p>}
      {loaded && !trial && !school.paidUntil && (
        <form
          data-billing-trial-start
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void startTrial();
          }}
        >
          <h4 className="font-bold">{t('billing.trial.start.title')}</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              id={`trial-ends-${school.schoolId}`}
              type="date"
              required
              min={shiftDay(data.today, 1)}
              max={shiftDay(data.today, data.maxTrialDays)}
              label={t('billing.trial.endsOn')}
              helperText={t('billing.trial.endsOnHelp', { days: data.trialDays, max: data.maxTrialDays })}
              value={start.endsOn}
              onChange={(e) => setStart({ ...start, endsOn: e.target.value })}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`trial-plan-${school.schoolId}`} className="text-sm font-medium text-slate">
                {t('billing.trial.planAfter')}
              </label>
              <select id={`trial-plan-${school.schoolId}`} required className={FIELD} value={start.planId} onChange={(e) => setStart({ ...start, planId: e.target.value })}>
                <option value="">{t('billing.change.choose')}</option>
                {plans.map((p) => (
                  <option key={p.planId} value={p.planId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <Input id={`trial-why-${school.schoolId}`} required maxLength={500} label={t('billing.trial.reason')} value={start.reason} onChange={(e) => setStart({ ...start, reason: e.target.value })} />
          </div>
          <button type="submit" data-billing-trial-start-save disabled={busy || !start.endsOn || !start.planId || !validReason(start.reason)} className={`${PRIMARY} self-start`}>
            {t('billing.trial.start.save')}
          </button>
        </form>
      )}

      {trial && trial.inForce && (
        <form
          data-billing-trial-extend
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void extendTrial();
          }}
        >
          <h4 className="font-bold">{t('billing.trial.extend.title')}</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id={`trial-extend-${school.schoolId}`}
              type="date"
              required
              min={shiftDay(trial.endsOn, 1) > data.today ? shiftDay(trial.endsOn, 1) : data.today}
              max={shiftDay(trial.startsOn, data.maxTrialDays)}
              label={t('billing.trial.extend.newLast')}
              helperText={t('billing.trial.endsOnHelp', { days: data.trialDays, max: data.maxTrialDays })}
              value={extend.endsOn}
              onChange={(e) => setExtend({ ...extend, endsOn: e.target.value })}
            />
            <Input id={`trial-extend-why-${school.schoolId}`} required maxLength={500} label={t('billing.trial.reason')} value={extend.reason} onChange={(e) => setExtend({ ...extend, reason: e.target.value })} />
          </div>
          <button type="submit" data-billing-trial-extend-save disabled={busy || !extend.endsOn || !validReason(extend.reason)} className={`${PRIMARY} self-start`}>
            {t('billing.trial.extend.save')}
          </button>
        </form>
      )}
      {trial && !trial.inForce && <p className="max-w-prose">{t('billing.trial.over')}</p>}

      {loaded && loaded.history.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="font-bold">{t('billing.trial.history')}</h4>
          <ul className="flex flex-col gap-2">
            {loaded.history.map((e) => (
              <li key={e.id} data-billing-trial-event={e.kind} className="flex flex-col gap-1 rounded-md border border-slate/10 bg-white p-3">
                <p className="break-words font-semibold">{eventLine(e)}</p>
                {e.reason && <p className="break-words">{t('billing.trial.event.reason', { reason: e.reason })}</p>}
                <p className="text-slate/70">{e.actorName ? t('billing.trial.event.by', { name: e.actorName, at: moment(e.at) }) : t('billing.trial.event.byJob', { at: moment(e.at) })}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
