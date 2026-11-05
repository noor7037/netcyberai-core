'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import type { CoverageTable as Table, Trend } from '@/lib/academics/coverage';

// Syllabus coverage by class and subject (W20-D, H4): planned, taught, the percent, the trend against the share of
// the session that has passed, and the objectives met (taught units that have a note). A card a row, so it reads the
// same at 360 and at 1440.

const TREND: Record<Trend, 'success' | 'neutral' | 'warning'> = { ahead: 'success', on_track: 'neutral', behind: 'warning' };
const show = (v: number | null) => (v === null ? '—' : `${v}%`);

export function CoverageTable() {
  const { t, lang } = useT();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [table, setTable] = useState<Table | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const res = await fetch('/api/app/syllabus/coverage').catch(() => null);
      const body = (await res?.json().catch(() => null)) ?? null;
      if (!live) return;
      if (!res?.ok || !body) setState('failed');
      else {
        setTable(body);
        setState('ready');
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return (
    <section data-coverage lang={lang} aria-labelledby="cov-title" className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
      <div>
        <h2 id="cov-title" className="text-base font-bold text-slate">
          {t('cov.title')}
        </h2>
        <p className="text-sm text-slate/70">{t('cov.purpose')}</p>
      </div>
      {state === 'loading' && (
        <p role="status" className="text-sm text-slate/70">
          {t('cov.loading')}
        </p>
      )}
      {state === 'failed' && (
        <p role="status" className="text-sm font-semibold text-slate">
          {t('cov.failed')}
        </p>
      )}
      {state === 'ready' && table && (
        <>
          <p data-elapsed className="text-sm font-medium text-slate">
            {table.elapsedPercent === null ? t('cov.noSession') : t('cov.elapsed', { percent: table.elapsedPercent })}
          </p>
          {table.rows.length === 0 ? (
            <p className="text-sm text-slate/70">{t('cov.empty')}</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {table.rows.map((r) => (
                <li key={`${r.class_id}:${r.subject_id}`} data-coverage-row className="flex flex-col gap-2 rounded-md border border-slate/10 p-3 text-sm text-slate">
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-base font-semibold">{`${r.class_name} · ${r.subject_name}`}</span>
                    {r.trend && (
                      <Badge data-trend={r.trend} variant={TREND[r.trend]}>
                        {t(`cov.trend.${r.trend}`)}
                      </Badge>
                    )}
                  </p>
                  <dl className="grid grid-cols-3 gap-2">
                    <div>
                      <dt className="text-xs text-slate/70">{t('cov.col.planned')}</dt>
                      <dd className="font-semibold tabular-nums">{r.planned}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate/70">{t('cov.col.taught')}</dt>
                      <dd className="font-semibold tabular-nums">{r.taught}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate/70">{t('cov.col.percent')}</dt>
                      <dd data-percent className="font-semibold tabular-nums">
                        {show(r.percent)}
                      </dd>
                    </div>
                  </dl>
                  <p>
                    <span className="text-xs text-slate/70">{t('cov.col.objectives')}: </span>
                    <span data-objectives className="font-semibold tabular-nums">
                      {show(r.objectivesPercent)}
                    </span>{' '}
                    <span className="text-slate/70">{r.taught === 0 ? `(${t('cov.objectives.none')})` : `(${t('cov.objectives.of', { noted: r.noted, taught: r.taught })})`}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
