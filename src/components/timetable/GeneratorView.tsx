'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { useToast } from '@/components/ui/Toast';
import { MAX_PERIODS } from '@/lib/timetable/plan';
import { CARD, CONSECUTIVE_SETTING_HREF, dayKey, PRIMARY, send, type GeneratorData } from './generator-ui';
import { GeneratorDraft } from './GeneratorDraft';
import { GeneratorHistory } from './GeneratorHistory';
import { GeneratorLoads } from './GeneratorLoads';
import { GeneratorUnavailable } from './GeneratorUnavailable';

// The timetable generator's screen (docs/28 slice 10f, C229), for the office: the school day it plans for, what each
// class needs, when teachers cannot teach, the proposal, and the history of what was published. Every change reads
// the whole screen again from the server, so the proposal, its changes and the history always agree.

export function GeneratorView() {
  const { t } = useT();
  const toast = useToast();
  const [data, setData] = useState<GeneratorData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/app/timetable/generator');
      if (!res.ok) throw new Error('not loaded');
      setData((await res.json()) as GeneratorData);
      setState('ready');
    } catch {
      setState('failed');
    }
    setRefreshKey((k) => k + 1);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function proposeWeek() {
    setBusy(true);
    const r = await send('/api/app/timetable/generator', 'POST', { action: 'propose' });
    setBusy(false);
    if (r.ok) toast.show(t('ttg.propose.done'), 'success');
    else
      toast.show(
        t(r.body.code === 'no_consecutive_limit' ? 'ttg.propose.noLimit' : r.body.code === 'nothing_to_plan' ? 'ttg.propose.nothing' : r.body.code === 'no_working_days' ? 'ttg.propose.noDays' : 'ttg.propose.failed'),
        'danger'
      );
    await load();
  }

  if (state === 'loading' && !data)
    return (
      <p role="status" className="text-sm text-slate/70">
        {t('tt.loading')}
      </p>
    );
  if (!data)
    return (
      <p role="alert" data-ttg-failed className="text-sm text-slate">
        {t('ttg.failed')}
      </p>
    );

  const { rules } = data;
  // The most periods in a row for one teacher has no default (C231): until the school sets it, the screen says so
  // here and no proposal is made.
  const limitUnset = rules.maxConsecutive === null;
  return (
    <div data-ttg className="flex flex-col gap-4">
      <section data-ttg-rules className={CARD} aria-labelledby="ttg-rules-title">
        <h2 id="ttg-rules-title" className="text-base font-bold text-slate">
          {t('ttg.rules.title')}
        </h2>
        <ul className="flex flex-col gap-1 text-sm text-slate">
          <li>{t('ttg.rules.days', { days: rules.days.map((d) => t(dayKey(d))).join(', ') })}</li>
          <li>{t('ttg.rules.periods', { periods: rules.periods })}</li>
          <li data-ttg-limit={limitUnset ? 'unset' : rules.maxConsecutive}>
            {rules.maxConsecutive === null ? t('ttg.rules.limitUnset') : rules.maxConsecutive >= Math.min(rules.periods, MAX_PERIODS) ? t('ttg.rules.noLimit') : t('ttg.rules.consecutive', { count: rules.maxConsecutive })}
          </li>
        </ul>
        {data.mayEditSettings ? (
          <Link href="/app/settings" className="inline-flex min-h-[44px] items-center self-start text-sm font-semibold text-sapphire underline">
            {t('ttg.rules.settings')}
          </Link>
        ) : (
          <p className="text-sm text-slate/70">{t('ttg.rules.who')}</p>
        )}
      </section>

      <GeneratorLoads data={data} onChanged={load} />
      <GeneratorUnavailable data={data} onChanged={load} />

      <section data-ttg-propose className={CARD} aria-labelledby="ttg-propose-title">
        <h2 id="ttg-propose-title" className="text-base font-bold text-slate">
          {t('ttg.propose.title')}
        </h2>
        <p className="text-sm text-slate">{t('ttg.propose.how')}</p>
        {limitUnset && (
          <div role="status" data-ttg-limit-unset className="flex flex-col items-start gap-1 rounded-md border border-amber/40 bg-amber/10 p-3 text-sm text-slate">
            <p className="font-semibold">{t('ttg.limit.unsetTitle')}</p>
            <p>{t('ttg.limit.unsetHow')}</p>
            {data.mayEditSettings ? (
              <Link href={CONSECUTIVE_SETTING_HREF} data-ttg-limit-link className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline">
                {t('ttg.limit.set')}
              </Link>
            ) : (
              <p className="text-slate/70">{t('ttg.limit.who')}</p>
            )}
          </div>
        )}
        {data.draft && <p className="text-sm text-slate/70">{t('ttg.propose.replaces')}</p>}
        <button type="button" data-ttg-propose-go disabled={busy || limitUnset} onClick={proposeWeek} className={`${PRIMARY} self-start`}>
          {busy ? t('ttg.propose.working') : t(data.draft ? 'ttg.propose.again' : 'ttg.propose.go')}
        </button>
      </section>

      {data.draft && <GeneratorDraft key={data.draft.proposalId} draft={data.draft} data={data} onChanged={load} />}

      <GeneratorHistory refreshKey={refreshKey} days={rules.days} periods={rules.periods} />
    </div>
  );
}
