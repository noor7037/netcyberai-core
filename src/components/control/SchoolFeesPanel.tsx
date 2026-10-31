'use client';

import { useEffect, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { KpiTile } from '@/components/app-ui/KpiTile';
import { AreaTrend } from '@/components/app-ui/ProgressCharts';
import { lastDays } from '@/components/dashboards/dashboard-parts';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table } from '@/components/ui/Table';
import { formatValue } from '@/components/app-ui/format';
import type { MessageKey } from '@/lib/i18n';
import type { SchoolFees } from '@/lib/control/school-fees';

// Control → a school → Fees (W13-D): read-only. What the school has collected, what is owed and what is overdue, how
// many students owe, and the last 30 days of payments by day and by method. Counts and money only: no student names,
// no bank details. All figures come from the API in paise.

const KNOWN_METHODS = ['cash', 'upi', 'cheque', 'card', 'netbanking', 'online', 'adjustment'];

export function SchoolFeesPanel({ schoolId }: { schoolId: string }) {
  const { t } = useWords();
  const [fees, setFees] = useState<SchoolFees | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch(`/api/control/schools/${schoolId}/fees`).catch(() => null);
      const body = res?.ok ? ((await res.json().catch(() => null)) as SchoolFees | null) : null;
      if (!live) return;
      if (body?.summary) setFees(body);
      else setFailed(true);
    })();
    return () => {
      live = false;
    };
  }, [schoolId]);

  if (failed) return <p role="alert" className="text-sm font-semibold text-red-800">{t('control.school.fees.failed')}</p>;
  if (!fees) return <p role="status" className="text-sm text-slate/70">{t('control.school.fees.loading')}</p>;
  if (!fees.hasFees) return <EmptyState title={t('control.school.fees.empty.title')} description={t('control.school.fees.empty.body')} />;

  const { summary } = fees;
  const methodName = (m: string) => (KNOWN_METHODS.includes(m) ? t(`pay.method.${m}` as MessageKey) : m);
  const points = lastDays(fees.perDay.map((d) => ({ date: d.day, value: d.amountMinor })), 30, 0);

  return (
    <section data-school-fees className="flex flex-col gap-4">
      <h3 className="text-base font-bold text-slate">{t('control.school.fees.title')}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile tile={{ kind: 'kpi', id: 'fees-collected', label: t('control.school.fees.kpi.collected'), value: summary.collectedMinor, unit: 'inr_paise' }} tone="emerald" />
        <KpiTile tile={{ kind: 'kpi', id: 'fees-pending', label: t('control.school.fees.kpi.pending'), value: summary.pendingMinor, unit: 'inr_paise' }} tone="royal" />
        <KpiTile tile={{ kind: 'kpi', id: 'fees-overdue', label: t('control.school.fees.kpi.overdue'), value: summary.overdueMinor, unit: 'inr_paise' }} tone="coral" />
        <KpiTile tile={{ kind: 'kpi', id: 'fees-students', label: t('control.school.fees.kpi.students'), value: fees.studentsWithDues, unit: 'count' }} tone="amber" />
      </div>
      <AreaTrend title={t('control.school.fees.chart.title')} seriesLabel={t('control.school.fees.chart.series')} unit="inr_paise" tone="royal" points={fees.perDay.length ? points : []} emptyHint={t('control.school.fees.chart.empty')} />
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-bold text-slate">{t('control.school.fees.method.title')}</h4>
        <Table
          columns={[
            { key: 'method', header: t('control.school.fees.col.method'), render: (r) => methodName(r.method) },
            { key: 'amount', header: t('control.school.fees.col.amount'), render: (r) => formatValue(r.amountMinor, 'inr_paise') },
            { key: 'count', header: t('control.school.fees.col.count'), render: (r) => r.count.toLocaleString('en-IN') },
          ]}
          rows={fees.byMethod}
          getRowId={(r) => r.method}
          state={fees.byMethod.length ? 'ready' : 'empty'}
          emptyTitle={t('control.school.fees.method.none')}
        />
      </div>
    </section>
  );
}
