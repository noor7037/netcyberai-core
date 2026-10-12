'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { minorToRupees } from '@/lib/fees/money';

// Fee clearance for a transfer or leaving certificate (docs/23 6g, C179): cleared, or held while fees are unpaid.
// The principal or school admin may let it through, with a reason that is kept with their name.
type Clearance = { owedMinor: number; cleared: boolean; override: { reason: string; by: string | null; on: string; owedMinor: number } | null };

export function FeeClearance({ studentId, refreshKey }: { studentId: string; refreshKey?: unknown }) {
  const { t } = useT();
  const toast = useToast();
  const [state, setState] = useState<{ clearance: Clearance; mayOverride: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/app/fees/clearance?studentId=${studentId}`).catch(() => null);
    setState(res?.ok ? await res.json().catch(() => null) : null);
  }, [studentId]);
  useEffect(() => {
    setState(null);
    void load();
  }, [load, refreshKey]);

  async function override() {
    setBusy(true);
    const res = await fetch('/api/app/fees/clearance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId, reason }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.show(t('fee.failed'), 'danger');
    setReason('');
    void load();
  }

  if (!state) return null;
  const c = state.clearance;
  return (
    <div data-clearance={c.cleared ? 'cleared' : 'held'} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3 text-sm text-slate">
      <p className="font-bold">{t('clr.title')}</p>
      <p className={c.cleared ? '' : 'font-semibold text-red-800'}>{c.owedMinor <= 0 ? t('clr.clear') : c.cleared ? t('clr.overridden', { amount: minorToRupees(c.owedMinor) }) : t('clr.held', { amount: minorToRupees(c.owedMinor) })}</p>
      {c.override && <p className="text-slate/80">{t('clr.override.by', { by: c.override.by ?? '', date: c.override.on, reason: c.override.reason })}</p>}
      {!c.cleared && state.mayOverride && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <Input id="clearance-reason" label={t('clr.reason')} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" data-clearance-override disabled={busy || !reason.trim()} className="min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60" onClick={() => void override()}>
            {t('clr.override')}
          </button>
        </div>
      )}
      {!c.cleared && !state.mayOverride && <p className="text-slate/70">{t('clr.ask')}</p>}
    </div>
  );
}
