'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import type { Form6Advisory } from '@/lib/compliance/form6';
import { minorToRupees } from '@/lib/fees/money';
import { CARD, dayFormat } from './desk-client';

// Form 6 fee data on the compliance desk (C227): exactly what src/lib/compliance/form6.ts's computeForm6Advisory works
// out from the school's fee structures, read from its own route (/api/app/compliance/form6). Nothing is worked out
// again here and nothing is typed: the year's recurring fees of this year and the year before, the increase, and the
// CPI and filing deadline with where they come from.

// A percent as a person writes it: at most two places, no floating-point tail (4.31 + 5 shows 9.31).
const pct = (x: number | null) => (x === null ? '' : String(Number(x.toFixed(2))));

export function Form6Panel() {
  const { t, lang } = useT();
  const [data, setData] = useState<Form6Advisory | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch('/api/app/compliance/form6')
      .then((r) => (r.ok ? (r.json() as Promise<Form6Advisory>) : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);
  const date = dayFormat(lang);
  const money = (minor: number | null) => (minor === null ? t('cdk.f6.none') : `₹${minorToRupees(minor)}`);

  return (
    <section data-cdk-form6 className={CARD}>
      <div>
        <h2 className="text-base font-bold">{t('cdk.f6.title')}</h2>
        <p className="text-slate/70">{t('cdk.f6.how')}</p>
      </div>
      {failed ? (
        <p role="alert" className="rounded-md bg-off-white px-3 py-2">{t('cdk.f6.failed')}</p>
      ) : !data ? null : !data.jurisdictionApplies ? (
        <p data-cdk-form6-state="not-haryana" className="rounded-md bg-off-white px-3 py-2">{t('cdk.f6.notHaryana')}</p>
      ) : (
        <div data-cdk-form6-state="haryana" className="flex flex-col gap-3">
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-md bg-off-white px-3 py-2">
              <dt className="text-slate/70">{t('cdk.f6.thisYear')}</dt>
              <dd data-cdk-f6="this" className="text-base font-bold">{money(data.thisYearTotalMinor)}</dd>
            </div>
            <div className="rounded-md bg-off-white px-3 py-2">
              <dt className="text-slate/70">{t('cdk.f6.lastYear')}</dt>
              <dd data-cdk-f6="last" className="text-base font-bold">{money(data.lastYearTotalMinor)}</dd>
            </div>
            <div className="rounded-md bg-off-white px-3 py-2">
              <dt className="text-slate/70">{t('cdk.f6.increase')}</dt>
              <dd data-cdk-f6="increase" className="text-base font-bold">{data.proposedIncreasePercent === null ? t('cdk.f6.none') : `${data.proposedIncreasePercent.toFixed(1)}%`}</dd>
            </div>
          </dl>
          {data.cpiState === 'unknown' ? (
            <Badge variant="warning" className="self-start">{t('cdk.f6.noCpi')}</Badge>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="break-words">{t('cdk.f6.cpi', { cpi: pct(data.cpiPercent), limit: pct(data.permissibleIncreasePercent), source: data.cpiSource ?? '' })}</p>
              {/* A verdict only when there is an increase to judge (review of C227): one year of fees is no comparison. */}
              {data.proposedIncreasePercent !== null && (
                <Badge variant={data.cpiState === 'above_advisory' ? 'danger' : 'success'} className="self-start">{t(data.cpiState === 'above_advisory' ? 'cdk.f6.above' : 'cdk.f6.within')}</Badge>
              )}
            </div>
          )}
          {data.deadlineState === 'unknown' || !data.filingDeadline ? (
            <Badge variant="warning" className="self-start">{t('cdk.f6.noDeadline')}</Badge>
          ) : (
            <p className="break-words">{t(data.deadlineState === 'past_deadline' ? 'cdk.f6.deadlinePassed' : 'cdk.f6.deadline', { date: date(String(data.filingDeadline)), source: data.filingDeadlineSource ?? '' })}</p>
          )}
          <p className="text-slate/70">{t('cdk.f6.advisory')}</p>
        </div>
      )}
    </section>
  );
}
