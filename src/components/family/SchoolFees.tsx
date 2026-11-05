'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/family/ui/Button';
import { Input } from '@/components/ui/Input';
import type { SchoolFeePay, SchoolFees as Fees } from '@/lib/contracts/school-link';
import { sameInkOnBothSides } from '@/lib/family/day-text';
import { fill, type Words } from '@/lib/family/fill';
import { familyApi } from './client';
import { SchoolText } from './SchoolText';

// A matched child's school fees in the parent area (W20-A, H1; docs/23 §2, §5), read as the guardian: each due still
// owed with its concession and what was paid, the total, and the receipts. "Pay by UPI" pays the school's own UPI ID with
// the family's one payment link (its amount and reference), by the UPI app's link on this phone or the QR from another;
// then "I have paid" with the UTR, which the school checks in its own bank before a receipt is made.

const rupees = (minor: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(minor / 100);
const day = (iso: string, lang: 'en' | 'hi') => sameInkOnBothSides(new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)));
// A receipt's moment as India's calendar day.
const stamp = (iso: string, lang: 'en' | 'hi') => sameInkOnBothSides(new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso)));

function PayBox({ w, childId, pay }: { w: Words; childId: string; pay: SchoolFeePay }) {
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(pay.claim === 'being_verified');
  if (sent)
    return (
      <p role="status" data-fees-claim="being_verified" className="rounded-lg bg-slate/5 px-3 py-2 text-sm font-semibold text-slate">
        {pay.claim === 'being_verified' ? w['fam.w20.fees.beingVerified'] : w['fam.w20.fees.sent']}
      </p>
    );
  const send = async () => {
    const digits = utr.replace(/\s+/g, '');
    if (!/^[0-9]{12}$/.test(digits)) return setError(w['fam.w20.fees.bad']);
    setBusy(true);
    setError('');
    const r = await familyApi('/api/family/school/fees/claim', 'POST', { childId, utr: digits });
    setBusy(false);
    if (r.ok || r.error === 'already_reported') return setSent(true);
    setError(r.error === 'utr' ? w['fam.w20.fees.bad'] : r.error === 'utr_used' ? w['fam.w20.fees.used'] : w['fam.w20.fees.failed']);
  };
  return (
    <div data-fees-pay className="flex flex-col gap-3 rounded-xl bg-white p-3 ring-1 ring-slate/10">
      {pay.claim === 'not_found' && <p className="rounded-lg bg-tangerine/10 px-3 py-2 text-sm text-slate">{w['fam.w20.fees.notFound']}</p>}
      <p className="text-sm text-slate">{fill(w['fam.w20.fees.payHow'], { amount: rupees(pay.amountMinor), name: pay.payeeName })}</p>
      <p className="text-sm text-slate">{w['fam.w20.fees.payFamily']}</p>
      <a data-fees-upi href={pay.uri} className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-sapphire px-5 text-base font-semibold text-white">
        {w['fam.w20.fees.openApp']}
      </a>
      {/* The school's QR of the same link, drawn on the server: no image from anywhere else. */}
      <div data-fees-qr role="img" aria-label={w['fam.w20.fees.qr']} className="mx-auto h-[220px] w-[220px] bg-white" dangerouslySetInnerHTML={{ __html: pay.qrSvg }} />
      <p className="break-all text-center text-sm text-slate">
        {pay.upiId} · <span data-fees-reference className="font-semibold">{fill(w['fam.w20.fees.reference'], { ref: pay.reference })}</span>
      </p>
      <p className="text-sm font-semibold text-slate">{w['fam.w20.fees.paid']}</p>
      <Input id={`fam-fees-utr-${childId}`} label={w['fam.w20.fees.utr']} helperText={w['fam.w20.fees.utrHint']} value={utr} onChange={(e) => setUtr(e.target.value)} inputMode="numeric" maxLength={20} autoComplete="off" />
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
      <Button type="button" disabled={busy || !utr.trim()} onClick={() => void send()}>
        {w['fam.w20.fees.send']}
      </Button>
    </div>
  );
}

export function SchoolFees({ w, lang, childId }: { w: Words; lang: 'en' | 'hi'; childId: string }) {
  const [fees, setFees] = useState<Fees | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pay, setPay] = useState<SchoolFeePay | null>(null);
  const [payError, setPayError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void familyApi<{ fees: Fees }>(`/api/family/school/fees?childId=${encodeURIComponent(childId)}`, 'GET').then((r) => {
      if (!live) return;
      if (!r.ok) return setState('error');
      setFees(r.data.fees);
      setPay(r.data.fees.pay);
      setState('ready');
    });
    return () => {
      live = false;
    };
  }, [childId]);
  const startPay = async () => {
    setBusy(true);
    setPayError('');
    const r = await familyApi<{ pay: SchoolFeePay }>('/api/family/school/fees', 'POST', { childId });
    setBusy(false);
    if (!r.ok) return setPayError(r.error === 'not_offered' ? w['fam.w20.fees.notOffered'] : w['fam.w20.fees.failed']);
    setPay(r.data.pay);
  };
  if (state !== 'ready' || !fees)
    return (
      <p data-school-fees={state} className="text-sm text-slate">
        {state === 'loading' ? w['fam.w20.fees.loading'] : w['fam.w20.fees.loadError']}
      </p>
    );
  return (
    <div data-school-fees="ready" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate">{w['fam.w20.fees.title']}</p>
        {fees.totalMinor > 0 && (
          <p data-fees-total={fees.totalMinor} className="text-base font-bold tabular-nums text-slate">
            {fill(w['fam.w20.fees.owed'], { amount: rupees(fees.totalMinor) })}
          </p>
        )}
      </div>
      {fees.dues.length === 0 ? (
        <p className="text-sm text-slate">{w['fam.w20.fees.none']}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fees.dues.map((d) => (
            <li key={d.feeId} data-fees-due={d.feeId} className="flex items-start justify-between gap-3 rounded-lg bg-slate/5 px-3 py-2 text-sm text-slate">
              <div className="min-w-0">
                <p className="font-semibold">
                  {d.head ? <SchoolText text={d.head} /> : null}
                  {d.lateFee ? `${d.head ? ' · ' : ''}${w['fam.w20.fees.lateFee']}` : ''}
                  {d.period ? ` · ${d.period}` : ''}
                </p>
                <p>
                  {fill(w['fam.w20.fees.dueOn'], { date: day(d.dueDate, lang) })}
                  {d.overdue ? <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">{w['fam.w20.fees.overdue']}</span> : null}
                </p>
                {d.concessionMinor > 0 && <p data-fees-concession={d.concessionMinor}>{fill(w['fam.w20.fees.concession'], { gross: rupees(d.grossMinor), amount: rupees(d.concessionMinor) })}</p>}
                {d.paidMinor > 0 && <p>{fill(w['fam.w20.fees.paidPart'], { amount: rupees(d.paidMinor) })}</p>}
              </div>
              <p className="shrink-0 font-bold tabular-nums">{rupees(d.balanceMinor)}</p>
            </li>
          ))}
        </ul>
      )}
      {fees.totalMinor > 0 &&
        (!fees.upi ? (
          <p className="text-sm text-slate">{w['fam.w20.fees.notOffered']}</p>
        ) : pay ? (
          <PayBox w={w} childId={childId} pay={pay} />
        ) : (
          <>
            <Button type="button" data-fees-start disabled={busy} onClick={() => void startPay()}>
              {w['fam.w20.fees.pay']}
            </Button>
            {payError && (
              <p role="alert" className="text-sm font-semibold text-red-800">
                {payError}
              </p>
            )}
          </>
        ))}
      <p className="text-sm font-semibold text-slate">{w['fam.w20.fees.receipts']}</p>
      {fees.receipts.length === 0 ? (
        <p className="text-sm text-slate">{w['fam.w20.fees.receiptsNone']}</p>
      ) : (
        <ul className="flex flex-col gap-1" data-fees-receipts>
          {fees.receipts.map((r) => (
            <li key={r.receiptNo} className="rounded-lg bg-slate/5 px-3 py-2 text-sm text-slate">
              {fill(w['fam.w20.fees.receiptLine'], { no: r.receiptNo, date: stamp(r.issuedAt, lang), amount: rupees(r.amountMinor) })}
              {` · ${w[`fam.w20.fees.method.${r.method}`] ?? r.method}`}
              {r.reversed ? ` · ${w['fam.w20.fees.reversed']}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
