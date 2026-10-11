'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { MessageKey } from '@/lib/i18n';
import { minorToRupees, rupeesToMinor } from '@/lib/fees/money';

// Taking a payment at the counter (docs/23 6c, C160). The office finds the
// student, sees what is owed (oldest first), types the amount received and
// how it was paid. By default the money goes to the oldest due first; the
// office may instead pick the dues. One press makes one numbered receipt,
// however many times the press arrives. A wrong receipt is reversed with a
// reason by the principal or the school admin; nothing is edited.

type Due = { fee_id: string; student_name: string; head_name: string | null; period_key: string | null; due_date: string; balance_minor: number };
type Receipt = { receipt_id: string; receipt_no: string; issued_at: string; total_minor: number; method: string; student_name: string; reversed_at: string | null };
type Totals = { netMinor: number; paidMinor: number; balanceMinor: number; problems: unknown[] };
const METHODS = ['cash', 'upi', 'cheque', 'card', 'netbanking'] as const;
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

export function FeesCollectView() {
  const { t, lang } = useT();
  const toast = useToast();
  const [classes, setClasses] = useState<{ class_id: string; name: string }[]>([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState<{ student_id: string; name: string }[]>([]);
  const [studentId, setStudentId] = useState('');
  const [scope, setScope] = useState<'student' | 'family'>('student');
  const [inFamily, setInFamily] = useState(false);
  const [dues, setDues] = useState<Due[] | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<(typeof METHODS)[number]>('cash');
  const [reference, setReference] = useState('');
  const [choose, setChoose] = useState(false);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [clientRef, setClientRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ receiptId: string; receiptNo: string } | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [mayReverse, setMayReverse] = useState(false);
  const [reversing, setReversing] = useState<{ id: string; reason: string } | null>(null);

  const loadSummary = useCallback(async () => {
    const res = await fetch('/api/app/fees/payments').catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    if (res?.ok) {
      setTotals(body.totals);
      setReceipts(body.receipts);
      setMayReverse(body.mayReverse === true);
    }
  }, []);
  useEffect(() => {
    fetch('/api/app/fees/setup')
      .then((r) => r.json())
      .then((b) => setClasses(b.classes ?? []))
      .catch(() => undefined);
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    setStudents([]);
    setStudentId('');
    if (!classId) return;
    fetch(`/api/app/fees/students?classId=${classId}`)
      .then((r) => r.json())
      .then((b) => setStudents(b.students ?? []))
      .catch(() => undefined);
  }, [classId]);

  const loadDues = useCallback(async () => {
    if (!studentId) {
      setDues(null);
      return;
    }
    const res = await fetch(`/api/app/fees/payments?studentId=${studentId}&scope=${scope}`).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    if (!res?.ok) {
      setDues([]);
      return;
    }
    setDues(body.dues);
    setInFamily(body.student?.in_family === true);
    setAmount(minorToRupees((body.dues as Due[]).reduce((s, d) => s + d.balance_minor, 0)).replace(/,/g, ''));
    setPicked({});
    // One id per form: pressing twice, or a retry, is the same payment.
    setClientRef(crypto.randomUUID());
  }, [studentId, scope]);
  useEffect(() => {
    setLast(null);
    void loadDues();
  }, [loadDues]);

  const owed = (dues ?? []).reduce((s, d) => s + d.balance_minor, 0);
  const pickedParts = Object.entries(picked).map(([feeId, v]) => ({ feeId, amountMinor: v.trim() === '' ? 0 : rupeesToMinor(v) }));
  const pickedBad = pickedParts.some((p) => p.amountMinor === null);
  const pickedTotal = pickedParts.reduce((s, p) => s + (p.amountMinor ?? 0), 0);
  const amountMinor = choose ? pickedTotal : rupeesToMinor(amount);

  async function take() {
    if (!amountMinor || amountMinor <= 0 || pickedBad) {
      toast.show(t('fee.amount.bad'), 'danger');
      return;
    }
    if (amountMinor > owed) {
      toast.show(t('pay.refused.more_than_owed'), 'danger');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/app/fees/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, scope, amountMinor, method, reference, clientRef, allocations: choose ? pickedParts.filter((p) => (p.amountMinor ?? 0) > 0) : null }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    if (!res?.ok) {
      const code = String(body.code ?? '');
      toast.show(t((['more_than_owed', 'nothing_owed', 'bad_allocation'].includes(code) ? `pay.refused.${code}` : res ? 'fee.failed' : 'pay.refused.network') as MessageKey), 'danger');
      return;
    }
    setLast({ receiptId: body.receiptId, receiptNo: body.receiptNo });
    toast.show(t('pay.taken', { number: body.receiptNo }), 'success');
    setReference('');
    setChoose(false);
    void loadDues();
    void loadSummary();
  }

  async function reverse() {
    if (!reversing || !reversing.reason.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/app/fees/receipts/${reversing.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reversing.reason }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      toast.show(t('fee.failed'), 'danger');
      return;
    }
    toast.show(t('pay.reversed'), 'success');
    setReversing(null);
    void loadDues();
    void loadSummary();
  }

  if (classes.length === 0) return null;
  const dueLabel = (d: Due) => [scope === 'family' ? d.student_name : null, d.head_name ?? t('rcp.fee'), d.period_key && d.period_key !== 'once' ? d.period_key : null].filter(Boolean).join(' · ');

  return (
    <section lang={lang} className="flex flex-col gap-6">
      {totals && (
        <div data-fee-totals className="grid gap-3 rounded-lg border border-slate/10 bg-white p-4 text-sm text-slate sm:grid-cols-3">
          <p>
            <span className="block text-slate/70">{t('pay.totals.net')}</span>
            <span className="text-lg font-bold">{`₹${minorToRupees(totals.netMinor)}`}</span>
          </p>
          <p>
            <span className="block text-slate/70">{t('pay.totals.paid')}</span>
            <span className="text-lg font-bold">{`₹${minorToRupees(totals.paidMinor)}`}</span>
          </p>
          <p>
            <span className="block text-slate/70">{t('pay.totals.balance')}</span>
            <span data-fee-balance className="text-lg font-bold">{`₹${minorToRupees(totals.balanceMinor)}`}</span>
          </p>
          {totals.problems.length > 0 && (
            <p role="alert" className="font-semibold text-red-800 sm:col-span-3">
              {t('pay.totals.problem', { count: totals.problems.length })}
            </p>
          )}
        </div>
      )}

      <div data-collect className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        <h2 className="text-base font-bold text-slate">{t('pay.title')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select id="pay-class" label={t('fee.class')} value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{t('fee.class.choose')}</option>
            {classes.map((c) => (
              <option key={c.class_id} value={c.class_id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select id="pay-student" label={t('con.student')} value={studentId} onChange={(e) => (setStudentId(e.target.value), setScope('student'))} disabled={!classId}>
            <option value="">{t('con.student.choose')}</option>
            {students.map((s) => (
              <option key={s.student_id} value={s.student_id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        {studentId && inFamily && (
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate">
            <input type="checkbox" data-family-scope className="h-5 w-5" checked={scope === 'family'} onChange={(e) => setScope(e.target.checked ? 'family' : 'student')} />
            {t('pay.family')}
          </label>
        )}

        {dues !== null && dues.length === 0 && (
          <p role="status" data-nothing-owed className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">
            {t('pay.nothingOwed')}
          </p>
        )}
        {dues !== null && dues.length > 0 && (
          <>
            <ul className="flex flex-col gap-1">
              {dues.map((d) => (
                <li key={d.fee_id} data-open-due className="grid items-center gap-2 rounded-md bg-off-white px-3 py-2 text-sm text-slate sm:grid-cols-[1fr_auto_10rem]">
                  <span>
                    <span className="font-semibold">{dueLabel(d)}</span>
                    <span className="block text-xs text-slate/70">{t('pay.dueOn', { date: d.due_date })}</span>
                  </span>
                  <span className="font-semibold">{`₹${minorToRupees(d.balance_minor)}`}</span>
                  {choose && <Input id={`pick-${d.fee_id}`} label={t('pay.pick.amount')} inputMode="decimal" value={picked[d.fee_id] ?? ''} onChange={(e) => setPicked((p) => ({ ...p, [d.fee_id]: e.target.value }))} />}
                </li>
              ))}
            </ul>
            <p data-owed className="text-sm font-semibold text-slate">
              {t('pay.owed', { amount: minorToRupees(owed) })}
            </p>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate">
              <input type="checkbox" data-choose className="h-5 w-5" checked={choose} onChange={(e) => setChoose(e.target.checked)} />
              {t('pay.pick')}
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              {choose ? (
                <p className="self-end text-sm font-semibold text-slate">{t('pay.pick.total', { amount: minorToRupees(pickedTotal) })}</p>
              ) : (
                <Input id="pay-amount" label={t('pay.amount')} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={amount.trim() !== '' && rupeesToMinor(amount) === null ? t('fee.amount.bad') : undefined} />
              )}
              <Select id="pay-method" label={t('pay.method')} value={method} onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`pay.method.${m}` as MessageKey)}
                  </option>
                ))}
              </Select>
              <Input id="pay-reference" label={t('pay.reference')} maxLength={80} value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <button type="button" data-take disabled={busy} className={`${PRIMARY} self-start`} onClick={() => void take()}>
              {t('pay.take')}
            </button>
          </>
        )}
        {last && (
          <p role="status" data-last-receipt className="flex flex-wrap items-center gap-3 rounded-md border border-slate/10 p-3 text-sm text-slate">
            <span className="font-semibold">{t('pay.taken', { number: last.receiptNo })}</span>
            <Link href={`/app/fees/receipts/${last.receiptId}`} className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline">
              {t('pay.openReceipt')}
            </Link>
          </p>
        )}
      </div>

      {receipts.length > 0 && (
        <div data-receipts className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4">
          <h2 className="text-base font-bold text-slate">{t('pay.receipts')}</h2>
          {receipts.map((r) => (
            <div key={r.receipt_id} className="flex flex-col gap-2 border-t border-slate/10 pt-2 text-sm text-slate">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Link href={`/app/fees/receipts/${r.receipt_id}`} className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline">
                    {r.receipt_no}
                  </Link>{' '}
                  · {r.student_name} · {`₹${minorToRupees(r.total_minor)}`} · {t(`pay.method.${r.method}` as MessageKey)}
                </span>
                <span className="flex items-center gap-2">
                  {r.reversed_at && <Badge variant="danger">{t('pay.reversedBadge')}</Badge>}
                  {mayReverse && !r.reversed_at && (
                    <button type="button" className={TAP} onClick={() => setReversing(reversing?.id === r.receipt_id ? null : { id: r.receipt_id, reason: '' })}>
                      {t('pay.reverse')}
                    </button>
                  )}
                </span>
              </span>
              {reversing?.id === r.receipt_id && (
                <span className="grid items-end gap-2 sm:grid-cols-[1fr_auto]">
                  <Input id={`reverse-${r.receipt_id}`} label={t('pay.reverse.reason')} maxLength={300} value={reversing.reason} onChange={(e) => setReversing({ id: r.receipt_id, reason: e.target.value })} />
                  <button type="button" data-reverse-go disabled={busy || !reversing.reason.trim()} className={PRIMARY} onClick={() => void reverse()}>
                    {t('pay.reverse.go')}
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
