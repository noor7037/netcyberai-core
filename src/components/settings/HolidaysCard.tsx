'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

// The school's holidays (C176). With "Working days" above, they decide what counts as a working day: a payment
// waiting to be verified is not counted as late over a day the school is closed.
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';

export function HolidaysCard() {
  const { t, lang } = useT();
  const toast = useToast();
  const [holidays, setHolidays] = useState<{ date: string; name: string }[] | null>(null);
  const [mayEdit, setMayEdit] = useState(false);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/settings/holidays').catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (!body) return;
    setHolidays(body.holidays ?? []);
    setMayEdit(body.mayEdit === true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function change(method: 'POST' | 'DELETE', day: string) {
    setBusy(true);
    const res = await fetch(method === 'POST' ? '/api/app/settings/holidays' : `/api/app/settings/holidays?date=${day}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify({ date: day, name }) : undefined }).catch(() => null);
    setBusy(false);
    if (!res?.ok) toast.show(t('set.failed'), 'danger');
    else if (method === 'POST') {
      setDate('');
      setName('');
    }
    void load();
  }

  if (holidays === null) return null;
  return (
    <section lang={lang} data-holidays className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
      <h3 className="text-base font-bold text-slate">{t('hol.title')}</h3>
      <p className="text-sm text-slate/70">{t('hol.how')}</p>
      {holidays.length === 0 && <p className="text-sm text-slate">{t('hol.none')}</p>}
      <ul className="flex flex-col gap-1 text-sm text-slate">
        {holidays.map((h) => (
          <li key={h.date} data-holiday={h.date} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="font-semibold">{h.date}</span> · {h.name}
            </span>
            {mayEdit && (
              <button type="button" disabled={busy} className={TAP} onClick={() => void change('DELETE', h.date)}>
                {t('hol.remove')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {mayEdit && (
        <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
          <Input id="holiday-date" type="date" label={t('hol.date')} value={date} onChange={(e) => setDate(e.target.value)} />
          <Input id="holiday-name" label={t('hol.name')} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" data-holiday-add disabled={busy || !date || !name.trim()} className="min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60" onClick={() => void change('POST', date)}>
            {t('hol.add')}
          </button>
        </div>
      )}
    </section>
  );
}
