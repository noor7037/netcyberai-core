'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { minorToRupees } from '@/lib/fees/money';

// What the bank statements leave for a person (docs/24 §3.5, §3.6, C177): confirmations the statement does not
// bear out (red, the principal's), credits that need a person or matched nothing, and counter UPI or cheque
// payments the bank has not shown. Nothing here is decided by itself or by time passing.

type ListedRow = { row_id: string; value_date: string; narration: string; utr: string | null; amount_minor: number; needs_person: boolean; marked_not_found: boolean; candidate_link_id: string | null; candidate: string | null };
export type Lists = {
  rows: ListedRow[];
  unmatchedCount: number;
  unmatchedMinor: number;
  missing: { report_id: string; payer: string; utr: string; amount_minor: number; confirmed_by: string | null; confirmed_on: string }[];
  counterUnseen: { receipt_no: string; method: string; reference: string | null; total_minor: number; issued_on: string; days: number }[];
  unseenAfterDays: number;
  links: { link_id: string; label: string }[];
};
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

export function BankLists({ lists, onChanged }: { lists: Lists; onChanged: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [linkId, setLinkId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function decide(row: ListedRow, action: 'by_hand' | 'not_a_fee') {
    setBusy(true);
    const res = await fetch('/api/app/fees/bank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, rowId: row.row_id, linkId, reason }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    if (!res?.ok) return toast.show(t(body.code === 'reported_for_another' ? 'bank.row.otherFamily' : body.code === 'already_credited' ? 'bank.row.alreadyCredited' : 'fee.failed'), 'danger');
    setDone(!body.receiptNo ? t('bank.row.done.none') : Number(body.unappliedMinor) > 0 ? t('bank.row.done.refund', { receipt: body.receiptNo, amount: minorToRupees(Number(body.unappliedMinor)) }) : t('bank.row.done', { receipt: body.receiptNo }));
    setOpen(null);
    onChanged();
  }
  async function again() {
    setBusy(true);
    await fetch('/api/app/fees/bank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'match' }) }).catch(() => null);
    setBusy(false);
    onChanged();
  }

  return (
    <>
      {lists.missing.length > 0 && (
        <div data-bank-missing role="alert" className="flex flex-col gap-1 rounded-md border-2 border-red-800 bg-white p-3 text-sm text-red-800">
          <p className="text-base font-bold">{t('bank.missing.title')}</p>
          <p>{t('bank.missing.how')}</p>
          <ul className="list-disc pl-5 font-semibold">
            {lists.missing.map((m) => (
              <li key={m.report_id}>{t('bank.missing.row', { payer: m.payer, amount: minorToRupees(m.amount_minor), utr: m.utr, by: m.confirmed_by ?? '', date: m.confirmed_on })}</li>
            ))}
          </ul>
        </div>
      )}
      {done && <p role="status" data-bank-row-done className="rounded-md bg-emerald/10 px-3 py-2 text-sm font-semibold text-slate">{done}</p>}
      {lists.rows.length > 0 && (
        <div data-bank-rows className="flex flex-col gap-2 border-t border-slate/10 pt-3 text-sm text-slate">
          <p className="text-base font-bold">{t('bank.rows.title')}</p>
          <p className="text-slate/70">{t('bank.rows.how')}</p>
          {lists.unmatchedCount > 0 && <p>{t('bank.rows.left', { count: lists.unmatchedCount, amount: minorToRupees(lists.unmatchedMinor) })}</p>}
          {lists.links.length === 0 && <p className="rounded-md bg-off-white px-3 py-2">{t('bank.row.noLinks')}</p>}
          <ul className="flex flex-col gap-2">
            {lists.rows.map((r) => (
              <li key={r.row_id} data-bank-row={r.needs_person ? 'needs' : 'unmatched'} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">₹{minorToRupees(r.amount_minor)}</span>
                  <span>{r.value_date}</span>
                  {r.marked_not_found ? <Badge variant="warning">{t('bank.row.notFound')}</Badge> : r.needs_person ? <Badge variant="warning">{t('bank.row.needs')}</Badge> : null}
                </div>
                <p className="break-words text-xs text-slate/80">{r.narration}</p>
                {r.candidate && <p className="font-semibold">{t('bank.row.candidate', { payer: r.candidate })}</p>}
                {open === r.row_id ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select id={`bank-link-${r.row_id}`} label={t('bank.row.link')} value={linkId} onChange={(e) => setLinkId(e.target.value)}>
                      <option value="">{t('bank.row.link.pick')}</option>
                      {r.candidate_link_id && !lists.links.some((l) => l.link_id === r.candidate_link_id) && <option value={r.candidate_link_id}>{r.candidate}</option>}
                      {lists.links.map((l) => (
                        <option key={l.link_id} value={l.link_id}>{l.label}</option>
                      ))}
                    </Select>
                    <Input id={`bank-reason-${r.row_id}`} label={t('bank.row.reason')} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
                    <button type="button" data-bank-row-match disabled={busy || !linkId || !reason.trim()} className={PRIMARY} onClick={() => void decide(r, 'by_hand')}>
                      {t('bank.row.match')}
                    </button>
                    <button type="button" data-bank-row-not-fee disabled={busy || !reason.trim()} className={TAP} onClick={() => void decide(r, 'not_a_fee')}>
                      {t('bank.row.notFee')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    data-bank-row-open
                    className={`${TAP} self-start`}
                    onClick={() => {
                      setOpen(r.row_id);
                      setLinkId(r.candidate_link_id ?? '');
                      setReason('');
                      setDone(null);
                    }}
                  >
                    {t('bank.row.match')} / {t('bank.row.notFee')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button type="button" data-bank-again disabled={busy} className={`${TAP} self-start`} onClick={() => void again()}>
            {t('bank.again')}
          </button>
        </div>
      )}
      {lists.counterUnseen.length > 0 && (
        <div data-bank-counter className="flex flex-col gap-1 border-t border-slate/10 pt-3 text-sm text-slate">
          <p className="text-base font-bold">{t('bank.counter.title')}</p>
          <p className="text-slate/70">{t('bank.counter.how', { days: lists.unseenAfterDays })}</p>
          <ul className="list-disc pl-5">
            {lists.counterUnseen.map((c) => (
              <li key={c.receipt_no}>{t('bank.counter.row', { receipt: c.receipt_no, method: c.method.toUpperCase(), amount: minorToRupees(c.total_minor), date: c.issued_on, days: c.days })}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
