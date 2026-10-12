'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

// The school's late-fee rule (docs/23 6d, C163): off unless an amount is
// set. It is two fields of the Fees settings, saved through the settings
// framework, so every change is kept in its history. The nightly job reads
// it; nothing here touches a due.

const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const whole = (v: string, max: number): number | null => (/^\d{1,6}$/.test(v.trim()) && Number(v) <= max ? Number(v) : null);

export function FeesLateFeeCard() {
  const { t } = useT();
  const toast = useToast();
  const [revision, setRevision] = useState<number | null>(null);
  const [saved, setSaved] = useState({ rupees: 0, grace: 0 });
  const [rupees, setRupees] = useState('0');
  const [grace, setGrace] = useState('0');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/settings/fees').catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (!body) return;
    const now = { rupees: Number(body.effective?.late_fee_rupees ?? 0), grace: Number(body.effective?.late_fee_grace_days ?? 0) };
    setRevision(Number(body.settings?.revision ?? 0));
    setSaved(now);
    setRupees(String(now.rupees));
    setGrace(String(now.grace));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (revision === null) return null;
  const amount = whole(rupees, 100000);
  const days = whole(grace, 90);

  async function save() {
    if (amount === null || days === null) return;
    setBusy(true);
    const res = await fetch('/api/app/settings/fees', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRevision: revision, set: { late_fee_rupees: amount, late_fee_grace_days: days } }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) toast.show(t('fee.late.saved'), 'success');
    else toast.show(t(res?.status === 403 ? 'fee.late.office' : 'fee.failed'), 'danger');
    void load();
  }

  return (
    <div data-late-fee className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
      <h2 className="text-base font-bold text-slate">{t('fee.late.title')}</h2>
      <p className="text-sm text-slate/70">{t('fee.late.how')}</p>
      <p data-late-fee-now className="text-sm font-semibold text-slate">
        {saved.rupees > 0 ? t('fee.late.on', { amount: saved.rupees.toLocaleString('en-IN'), days: saved.grace }) : t('fee.late.off')}
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Input id="late-fee-rupees" label={t('fee.late.amount')} inputMode="numeric" value={rupees} onChange={(e) => setRupees(e.target.value)} error={amount === null ? t('fee.late.bad') : undefined} />
        <Input id="late-fee-grace" label={t('fee.late.grace')} inputMode="numeric" value={grace} onChange={(e) => setGrace(e.target.value)} error={days === null ? t('fee.late.bad') : undefined} />
        <button type="button" data-save-late-fee disabled={busy || amount === null || days === null} className={PRIMARY} onClick={() => void save()}>
          {t('fee.late.save')}
        </button>
      </div>
    </div>
  );
}
