'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/app-shell/LangContext';
import { Input } from '@/components/ui/Input';
import type { MessageKey } from '@/lib/i18n';

// Control → Messaging & Cost (docs/25 slice 7o, C197): a rate read from Meta's own pricing page, with the page and
// the day it was read; and each school's monthly limit beside what its delivered messages have cost this month.

type School = { schoolId: string; schoolName: string; budgetPaise: number | null; spentPaise: number; delivered: number; onItsWayPaise: number; onItsWay: number; heldForBudget: number };
const CATEGORIES = ['utility', 'marketing', 'authentication', 'service'];
const ERRORS = ['category', 'rate', 'gst', 'source', 'verified_on', 'effective_from', 'amount', 'reason', 'not_found'];
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export function CostControls() {
  const { t, lang } = useT();
  const router = useRouter();
  const [schools, setSchools] = useState<School[] | null>(null);
  const [rate, setRate] = useState({ category: 'utility', rateRupees: '', gstPercent: '18', source: '', verifiedOn: today(), effectiveFrom: today() });
  const [budget, setBudget] = useState<Record<string, { rupees: string; reason: string }>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/control/messaging-cost').catch(() => null);
    const got = res?.ok ? await res.json().catch(() => null) : null;
    if (got) setSchools(got.schools);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const send = async (payload: unknown, done: MessageKey, url = '/api/control/messaging-cost') => {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) return setNote({ ok: false, text: ERRORS.includes(got?.code) ? t(`cost.err.${got.code}` as MessageKey) : t('cost.err.other') });
    setNote({ ok: true, text: t(done) });
    await load();
    router.refresh();
  };

  return (
    <div lang={lang} className="flex flex-col gap-5 text-sm text-slate">
      {note && <p role="status" data-cost-note className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p>}

      <section data-cost-rate-form className="flex flex-col gap-3 rounded-xl border border-slate/10 bg-white p-4">
        <div>
          <h2 className="text-lg font-bold">{t('cost.add.title')}</h2>
          <p className="max-w-prose text-slate/70">{t('cost.add.how')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1">
            <label htmlFor="rate-category" className="font-semibold">{t('cost.category')}</label>
            <select id="rate-category" className="min-h-[44px] rounded-md border border-slate/20 bg-white px-3" value={rate.category} onChange={(e) => setRate({ ...rate, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`cost.category.${c}` as MessageKey)}</option>
              ))}
            </select>
          </div>
          <Input id="rate-rupees" inputMode="decimal" label={t('cost.add.rate')} value={rate.rateRupees} onChange={(e) => setRate({ ...rate, rateRupees: e.target.value })} />
          <Input id="rate-gst" inputMode="decimal" label={t('cost.gstPercent')} value={rate.gstPercent} onChange={(e) => setRate({ ...rate, gstPercent: e.target.value })} />
          <Input id="rate-verified" type="date" label={t('cost.add.verifiedOn')} value={rate.verifiedOn} onChange={(e) => setRate({ ...rate, verifiedOn: e.target.value })} />
          <Input id="rate-from" type="date" label={t('cost.from')} value={rate.effectiveFrom} onChange={(e) => setRate({ ...rate, effectiveFrom: e.target.value })} />
        </div>
        <Input id="rate-source" type="url" label={t('cost.add.source')} maxLength={500} value={rate.source} onChange={(e) => setRate({ ...rate, source: e.target.value })} />
        <button type="button" data-cost-rate-add disabled={busy || rate.rateRupees.trim() === '' || !rate.source.trim()} className={`${PRIMARY} self-start`} onClick={() => void send({ action: 'rate', category: rate.category, rateRupees: Number(rate.rateRupees), gstPercent: Number(rate.gstPercent), source: rate.source, verifiedOn: rate.verifiedOn, effectiveFrom: rate.effectiveFrom }, 'cost.add.done')}>
          {t('cost.add.save')}
        </button>
      </section>

      <section data-cost-budgets className="flex flex-col gap-3 rounded-xl border border-slate/10 bg-white p-4">
        <div>
          <h2 className="text-lg font-bold">{t('cost.budget.title')}</h2>
          <p className="max-w-prose text-slate/70">{t('cost.budget.how')}</p>
        </div>
        {schools && schools.length === 0 && <p className="rounded-md bg-off-white px-3 py-2">{t('cost.budget.none')}</p>}
        <ul className="flex flex-col gap-3">
          {(schools ?? []).map((s) => {
            const draft = budget[s.schoolId] ?? { rupees: '', reason: '' };
            return (
              <li key={s.schoolId} data-cost-school className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                <p className="font-bold">{s.schoolName}</p>
                <p>{s.budgetPaise === null ? t('cost.budget.notSet') : t('cost.budget.line', { budget: rupees(s.budgetPaise), spent: rupees(s.spentPaise), delivered: s.delivered })}</p>
                <p className="text-slate/70">{t('cost.budget.more', { onItsWay: s.onItsWay, onItsWayCost: rupees(s.onItsWayPaise), held: s.heldForBudget })}</p>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
                  <Input id={`budget-${s.schoolId}`} inputMode="decimal" label={t('cost.budget.amount')} value={draft.rupees} onChange={(e) => setBudget({ ...budget, [s.schoolId]: { ...draft, rupees: e.target.value } })} />
                  <Input id={`budget-why-${s.schoolId}`} label={t('cost.budget.reason')} maxLength={300} value={draft.reason} onChange={(e) => setBudget({ ...budget, [s.schoolId]: { ...draft, reason: e.target.value } })} />
                  <button type="button" data-cost-budget-save disabled={busy || draft.rupees.trim() === '' || !draft.reason.trim()} className={TAP} onClick={() => void send({ budgetRupees: Number(draft.rupees), reason: draft.reason }, 'cost.budget.done', `/api/control/schools/${s.schoolId}/budget`)}>
                    {t('cost.budget.save')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
