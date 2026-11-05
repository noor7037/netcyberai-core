'use client';

import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import type { MessageKey } from '@/lib/i18n';

// How the pipeline converts this session (W21-M1), per source and per class sought: enquiries → visits → forms →
// admitted, with the average days between those steps. The numbers are src/lib/admissions/conversion.ts's, the same
// call as the principal's tile ('admissions.conversion').

type Days = { toVisit: number | null; toForm: number | null; toAdmitted: number | null };
type Funnel = { enquiries: number; visits: number; forms: number; admitted: number; days: Days };
type Row = Funnel & { key: string; label: string | null };
export type ConversionData = { session: { start: string; end: string } | null; from: string | null; to: string; total: Funnel; bySource: Row[]; byClass: Row[]; rate: number | null };

const COUNTS = ['enquiries', 'visits', 'forms', 'admitted'] as const;
const GAPS = ['toVisit', 'toForm', 'toAdmitted'] as const;
const pct = (n: number, of: number) => (of === 0 ? null : Math.round((n / of) * 100));

export function AdmissionsConversion({ data }: { data: ConversionData }) {
  const { t, tCount, lang } = useT();
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const gap = (d: number | null) => (d === null ? '–' : tCount('adm.conv.days', d));
  const cell = (f: Funnel, k: (typeof COUNTS)[number]) => {
    const p = k === 'enquiries' ? null : pct(f[k], f.enquiries);
    return p === null ? String(f[k]) : `${f[k]} (${p}%)`;
  };

  const table = (id: 'source' | 'class', rows: Row[]) => (
    <div className="min-w-0 overflow-x-auto">
      <table data-adm-conv-table={id} className="w-full min-w-[640px] text-left text-sm">
        <caption className="pb-2 text-left font-bold">{t(`adm.conv.by.${id}` as MessageKey)}</caption>
        <thead>
          <tr className="border-b border-slate/10">
            <th scope="col" className="py-2 pr-3">{t(`adm.conv.col.${id}` as MessageKey)}</th>
            {COUNTS.map((k) => (
              <th key={k} scope="col" className="py-2 pr-3">{t(`adm.conv.col.${k}` as MessageKey)}</th>
            ))}
            {GAPS.map((k) => (
              <th key={k} scope="col" className="py-2 pr-3">{t(`adm.conv.col.${k}` as MessageKey)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...rows.map((r) => ({ ...r, name: id === 'source' ? t(`adm.source.${r.key}` as MessageKey) : r.label ?? '' })), { ...data.total, key: 'all', label: null, name: t('adm.conv.all') }].map((r) => (
            <tr key={r.key} data-adm-conv-row={r.key} className={`border-b border-slate/10 ${r.key === 'all' ? 'font-bold' : ''}`}>
              <th scope="row" className="py-2 pr-3 font-semibold">{r.name}</th>
              {COUNTS.map((k) => (
                <td key={k} data-n={r[k]} className="py-2 pr-3">{cell(r, k)}</td>
              ))}
              {GAPS.map((k) => (
                <td key={k} className="py-2 pr-3">{gap(r.days[k])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section id="adm-conversion" data-adm-conversion data-rate={data.rate ?? ''} aria-labelledby="adm-conv-title" className="flex scroll-mt-4 flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 id="adm-conv-title" className="text-base font-bold">{t('adm.conv.title')}</h2>
        <InfoTip>{t('adm.conv.how')}</InfoTip>
      </div>
      <p className="text-slate/70">{data.from ? t('adm.conv.since', { from: day(data.from), to: day(data.to) }) : t('adm.conv.noSession')}</p>
      {data.total.enquiries === 0 ? (
        <p className="rounded-md bg-off-white px-3 py-2">{t('adm.conv.none')}</p>
      ) : (
        <>
          <p data-adm-conv-rate className="font-semibold">{t('adm.conv.rate', { rate: data.rate ?? 0, admitted: data.total.admitted, enquiries: data.total.enquiries })}</p>
          {table('source', data.bySource)}
          {table('class', data.byClass)}
        </>
      )}
    </section>
  );
}
