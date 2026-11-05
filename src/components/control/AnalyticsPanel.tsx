'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { Input } from '@/components/ui/Input';
import { Table, type TableColumn } from '@/components/ui/Table';
import type { MessageKey } from '@/lib/i18n';

// Control → Analytics (W21-M6): the platform's numbers, each from its own table and each with the range it covers.
// Test schools are never in a total. One CSV of everything shown.

type Ai = { day: string; requests: number; failures: number; costUsd: number; unpriced: number };
type Wa = { day: string; sent: number; failed: number; stopped: number };
type Data = { range: { from: string; to: string }; asOf: string; schoolsByStage: { stage: string; count: number }[]; testSchools: number; activeUsers: { days7: number; days30: number }; family: { accounts: number; children: number }; aiByDay: Ai[]; whatsappByDay: Wa[] };
const TAP = 'inline-flex min-h-[44px] items-center rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

function Tile({ label, value, range }: { label: string; value: number | string; range: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate/10 bg-white p-4">
      <span className="text-sm font-semibold text-slate">{label}</span>
      <span className="text-2xl font-bold text-midnight">{value}</span>
      <span className="text-xs text-slate">{range}</span>
    </div>
  );
}

export function AnalyticsPanel() {
  const { t, lang, has } = useWords();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  const qs = (extra: Record<string, string> = {}) => {
    const q = new URLSearchParams(extra);
    if (applied.from) q.set('from', applied.from);
    if (applied.to) q.set('to', applied.to);
    return q.toString();
  };
  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (applied.from) q.set('from', applied.from);
    if (applied.to) q.set('to', applied.to);
    const res = await fetch(`/api/control/analytics?${q.toString()}`).catch(() => null);
    const out = res?.ok ? ((await res.json().catch(() => null)) as Data | null) : null;
    setData(out);
    setFailed(!out);
    if (out) {
      setFrom((f) => f || out.range.from);
      setTo((v) => v || out.range.to);
    }
  }, [applied]);
  useEffect(() => {
    void load();
  }, [load]);

  const n = new Intl.NumberFormat(lang === 'hi' ? 'hi-IN' : 'en-IN');
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
  const now = t('control.m6.an.now');
  const span = data ? t('control.m6.an.range', { from: data.range.from, to: data.range.to }) : '';
  const stage = (s: string) => {
    const k = `control.m6.an.stage.${s}`;
    return has(k) ? t(k as MessageKey) : s;
  };
  const aiCols: TableColumn<Ai>[] = [
    { key: 'day', header: t('control.m6.an.col.day'), render: (r) => r.day },
    { key: 'req', header: t('control.m6.an.col.requests'), render: (r) => n.format(r.requests) },
    { key: 'fail', header: t('control.m6.an.col.failures'), render: (r) => n.format(r.failures) },
    { key: 'cost', header: t('control.m6.an.col.cost'), render: (r) => usd.format(r.costUsd) },
    { key: 'unpriced', header: t('control.m6.an.col.unpriced'), render: (r) => n.format(r.unpriced) },
  ];
  const waCols: TableColumn<Wa>[] = [
    { key: 'day', header: t('control.m6.an.col.day'), render: (r) => r.day },
    { key: 'sent', header: t('control.m6.wa.col.sent'), render: (r) => n.format(r.sent) },
    { key: 'failed', header: t('control.m6.wa.col.failed'), render: (r) => n.format(r.failed) },
    { key: 'stopped', header: t('control.m6.wa.col.stopped'), render: (r) => n.format(r.stopped) },
  ];
  const state = data === null && !failed ? 'loading' : failed ? 'error' : 'ready';

  return (
    <section lang={lang} data-analytics className="flex flex-col gap-6">
      <form
        data-analytics-range
        className="flex flex-wrap items-end gap-3 rounded-lg border border-slate/10 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ from, to });
        }}
      >
        <Input id="an-from" type="date" floating={false} label={t('control.m6.an.from')} value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input id="an-to" type="date" floating={false} label={t('control.m6.an.to')} value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="submit" className={PRIMARY}>
          {t('control.m6.an.show')}
        </button>
        <a data-analytics-export className={TAP} href={`/api/control/analytics?${qs({ format: 'csv' })}`} download>
          {t('control.m6.an.export')}
        </a>
      </form>
      {failed && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {t('control.m6.an.error')}{' '}
          <button type="button" className={TAP} onClick={() => void load()}>
            {t('control.m6.retry')}
          </button>
        </p>
      )}
      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label={t('control.m6.an.active7')} value={n.format(data.activeUsers.days7)} range={t('control.m6.an.last7')} />
            <Tile label={t('control.m6.an.active30')} value={n.format(data.activeUsers.days30)} range={t('control.m6.an.last30')} />
            <Tile label={t('control.m6.an.familyAccounts')} value={n.format(data.family.accounts)} range={now} />
            <Tile label={t('control.m6.an.children')} value={n.format(data.family.children)} range={now} />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold text-midnight">{t('control.m6.an.schools')}</h2>
            <p className="text-sm text-slate">
              {now} · {t('control.m6.an.testApart', { n: data.testSchools })}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {data.schoolsByStage.length === 0 ? <p className="text-sm text-slate">{t('control.m6.noSchools')}</p> : data.schoolsByStage.map((s) => <Tile key={s.stage} label={stage(s.stage)} value={n.format(s.count)} range={now} />)}
            </div>
          </div>
        </>
      )}
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold text-midnight">{t('control.m6.an.ai')}</h2>
        <p className="text-sm text-slate">
          {span} · {t('control.m6.an.aiAbout')}
        </p>
        <Table columns={aiCols} rows={data?.aiByDay ?? []} getRowId={(r) => r.day} state={state} errorMessage={t('control.m6.an.error')} emptyTitle={t('control.m6.an.none')} />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold text-midnight">{t('control.m6.an.wa')}</h2>
        <p className="text-sm text-slate">{span}</p>
        <Table columns={waCols} rows={data?.whatsappByDay ?? []} getRowId={(r) => r.day} state={state} errorMessage={t('control.m6.an.error')} emptyTitle={t('control.m6.an.none')} />
      </div>
    </section>
  );
}
