'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';

// The school's WhatsApp month (docs/25 slice 7o, C197): its budget, what delivered messages have cost, what is on
// its way, and what the budget held back. Counted from the message log; nothing is estimated.

type Spend = { budgetPaise: number | null; spentPaise: number; delivered: number; onItsWayPaise: number; onItsWay: number; heldForBudget: number };
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function BudgetView() {
  const { t, lang } = useT();
  const [data, setData] = useState<Spend | null>(null);
  useEffect(() => {
    void fetch('/api/app/communication/budget').then(async (res) => setData(res.ok ? await res.json() : null)).catch(() => undefined);
  }, []);
  if (!data) return null;
  const left = data.budgetPaise === null ? 0 : Math.max(0, data.budgetPaise - data.spentPaise - data.onItsWayPaise);
  return (
    <section lang={lang} data-budget={data.budgetPaise === null ? 'not-set' : 'set'} className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4 text-sm text-slate">
      <h2 className="text-base font-bold">{t('bud.title')}</h2>
      {data.budgetPaise === null ? (
        <p className="rounded-md border border-tangerine/40 bg-off-white px-3 py-2 font-semibold">{t('bud.notSet')}</p>
      ) : (
        <>
          <p className="font-semibold">{t('bud.line', { spent: rupees(data.spentPaise), budget: rupees(data.budgetPaise), left: rupees(left) })}</p>
          <p className="text-slate/70">{t('bud.detail', { delivered: data.delivered, onItsWay: data.onItsWay, onItsWayCost: rupees(data.onItsWayPaise) })}</p>
        </>
      )}
      {data.heldForBudget > 0 && <p className="font-semibold">{t('bud.held', { count: data.heldForBudget })}</p>}
      <p className="text-xs text-slate/70">{t('bud.how')}</p>
      <a className="inline-flex min-h-[44px] items-center self-start font-semibold text-sapphire underline" href="/app/help/ticket">{t('bud.ask')}</a>
    </section>
  );
}
