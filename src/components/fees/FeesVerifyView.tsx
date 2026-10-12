'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { minorToRupees, rupeesToMinor } from '@/lib/fees/money';

// UPI payments parents have reported, waiting for the school to check them in its own bank (docs/24 §3.4 path A,
// C174). A report is a claim: nothing is credited until a verifier says "Found in bank", ticking that they looked
// and giving the amount they saw. Above the school's limit the principal confirms as well. Nothing here is
// decided by time passing; a report stays until a person decides it.

type NotFound = { report_id: string; payer: string; utr: string; amount_minor: number };
type Waiting = { working_days_waiting: number; report_id: string; payer: string; class_name: string | null; utr: string; reference: string | null; amount_minor: number; reported_at: string; status: 'reported' | 'awaiting_principal'; amount_seen_minor: number | null; checked_by_name: string | null };
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

export function FeesVerifyView() {
  const { t, lang } = useT();
  const toast = useToast();
  const [waiting, setWaiting] = useState<Waiting[] | null>(null);
  const [mayVerify, setMayVerify] = useState(false);
  const [isPrincipal, setIsPrincipal] = useState(false);
  const [limitMinor, setLimitMinor] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [seen, setSeen] = useState('');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState<NotFound[]>([]);
  const [mayReopen, setMayReopen] = useState(false);
  const [reopening, setReopening] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/app/fees/reports').catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (!body) return;
    setWaiting(body.waiting ?? []);
    setNotFound(body.notFound ?? []);
    setMayReopen(body.mayReopen === true);
    setMayVerify(body.mayVerify === true);
    setIsPrincipal(body.isPrincipal === true);
    setLimitMinor(Number(body.limitMinor ?? 0));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function start(r: Waiting) {
    setOpen(r.report_id);
    setSeen(minorToRupees(r.amount_seen_minor ?? r.amount_minor).replace(/,/g, ''));
    setChecked(false);
  }

  async function decide(r: Waiting, action: 'found' | 'not_found') {
    setBusy(true);
    const res = await fetch(`/api/app/fees/reports/${r.report_id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action === 'found' ? { action, amountSeenMinor: rupeesToMinor(seen), checked } : { action }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    if (!res?.ok) toast.show(t(body.code === 'needs_principal' ? 'ver.needsPrincipal' : body.code === 'not_checked' ? 'ver.tickFirst' : 'fee.failed'), 'danger');
    else toast.show(t(body.state === 'verified' ? (body.unappliedMinor > 0 ? 'ver.done.excess' : 'ver.done.found') : body.state === 'awaiting_principal' ? 'ver.done.waitsPrincipal' : 'ver.done.notFound'), 'success');
    setOpen(null);
    void load();
  }

  async function reopen(r: NotFound) {
    setBusy(true);
    const res = await fetch(`/api/app/fees/reports/${r.report_id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reopen', reason }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    toast.show(t(res?.ok ? 'ver.reopen.done' : body.code === 'another_waiting' ? 'ver.reopen.another' : 'fee.failed'), res?.ok ? 'success' : 'danger');
    setReopening(null);
    setReason('');
    void load();
  }

  if (!waiting || (waiting.length === 0 && notFound.length === 0)) return null;
  const when = (iso: string) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

  return (
    <section lang={lang} data-verify className="flex flex-col gap-3 rounded-lg border-2 border-tangerine/40 bg-white p-4">
      <h2 className="text-base font-bold text-slate">{t('ver.title', { count: waiting.length })}</h2>
      <p className="text-sm text-slate/70">{t('ver.how')}</p>
      {limitMinor > 0 && <p className="text-sm text-slate/70">{t('ver.limit', { amount: minorToRupees(limitMinor) })}</p>}
      <ul className="flex flex-col gap-2">
        {waiting.map((r) => {
          const mine = mayVerify && (r.status === 'reported' || isPrincipal);
          return (
            <li key={r.report_id} data-report={r.status} className="flex flex-col gap-2 rounded-md bg-off-white px-3 py-2 text-sm text-slate">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-semibold">{r.payer}</span>
                  {r.class_name ? ` · ${r.class_name}` : ''} · <span className="font-semibold">{`₹${minorToRupees(r.amount_minor)}`}</span>
                  <span className="block text-slate/70">
                    {t('ver.utr', { utr: r.utr })}
                    {r.reference ? ` · ${r.reference}` : ''} · {when(r.reported_at)}
                  </span>
                </span>
                {r.working_days_waiting >= 1 && (
                  <span data-waiting-days={r.working_days_waiting} className={`text-xs font-bold ${r.working_days_waiting >= 2 ? 'text-red-800' : 'text-slate'}`}>
                    {t('ver.waitingDays', { days: r.working_days_waiting })}
                  </span>
                )}
                {r.status === 'awaiting_principal' && <Badge variant="warning">{t('ver.awaitingPrincipal', { name: r.checked_by_name ?? '', amount: minorToRupees(r.amount_seen_minor ?? 0) })}</Badge>}
              </span>
              {mine && open !== r.report_id && (
                <span className="flex flex-wrap gap-2">
                  <button type="button" data-found disabled={busy} className={PRIMARY} onClick={() => start(r)}>
                    {t('ver.found')}
                  </button>
                  <button type="button" data-not-found disabled={busy} className={TAP} onClick={() => void decide(r, 'not_found')}>
                    {t('ver.notFound')}
                  </button>
                </span>
              )}
              {mine && open === r.report_id && (
                <span className="flex flex-col gap-2">
                  <Input id={`seen-${r.report_id}`} label={t('ver.amountSeen')} inputMode="decimal" value={seen} onChange={(e) => setSeen(e.target.value)} error={rupeesToMinor(seen) === null || rupeesToMinor(seen) === 0 ? t('fee.amount.bad') : undefined} />
                  <label className="flex min-h-[44px] cursor-pointer items-start gap-2">
                    <input type="checkbox" data-checked className="mt-1 h-5 w-5" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
                    <span>{t('ver.iChecked', { utr: r.utr, amount: seen })}</span>
                  </label>
                  <span className="flex flex-wrap gap-2">
                    <button type="button" data-found-confirm disabled={busy || !checked || !rupeesToMinor(seen)} className={PRIMARY} onClick={() => void decide(r, 'found')}>
                      {t('ver.confirm')}
                    </button>
                    <button type="button" className={TAP} onClick={() => setOpen(null)}>
                      {t('viewAs.dialog.cancel')}
                    </button>
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {notFound.length > 0 && (
        <div data-not-found-list className="flex flex-col gap-2 border-t border-slate/10 pt-3">
          <h3 className="text-sm font-bold text-slate">{t('ver.notFound.title')}</h3>
          <p className="text-sm text-slate/70">{t('ver.notFound.how')}</p>
          {notFound.map((r) => (
            <div key={r.report_id} data-not-found-report className="flex flex-col gap-2 rounded-md bg-off-white px-3 py-2 text-sm text-slate">
              <span>
                <span className="font-semibold">{r.payer}</span> · {`₹${minorToRupees(r.amount_minor)}`} · {t('ver.utr', { utr: r.utr })}
              </span>
              {mayReopen && reopening !== r.report_id && (
                <button type="button" data-reopen disabled={busy} className={`${TAP} self-start`} onClick={() => setReopening(r.report_id)}>
                  {t('ver.reopen')}
                </button>
              )}
              {mayReopen && reopening === r.report_id && (
                <span className="flex flex-col gap-2">
                  <Input id={`reopen-${r.report_id}`} label={t('ver.reopen.reason')} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button type="button" data-reopen-confirm disabled={busy || !reason.trim()} className={`${PRIMARY} self-start`} onClick={() => void reopen(r)}>
                    {t('ver.reopen.confirm')}
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
