'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { useFeesChanged, useFeesPart } from './FeesFirstLoad';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { minorToRupees } from '@/lib/fees/money';
import type { MessageKey } from '@/lib/i18n';

// Fee recovery (docs/23 6g, C178): the families with fees past their date, what the office last did, a promise
// to pay, hardship, and the refund list. The office's own list: no teacher sees it, and it ranks no child.

type Row = { student_id: string; payer: string; children: number; overdue_minor: number; oldest_due: string; days_overdue: number; last_kind: 'call' | 'promise' | 'hardship' | null; last_note: string | null; last_on: string | null; last_by: string | null; promise_id: string | null; promise_date: string | null; promise_passed: boolean; hardship_id: string | null };
type Refund = { evidence_id: string; payer: string; amount_minor: number; arrived_on: string; receipt_no: string | null; refunded_on: string | null; how: string | null; recorded_by: string | null };
type Action = 'call' | 'promise' | 'hardship' | 'close';
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

export function FeesRecoveryView() {
  const { t, lang } = useT();
  const toast = useToast();
  const getRecovery = useFeesPart('recovery', '/api/app/fees/recovery');
  const feesChanged = useFeesChanged();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [mayRefund, setMayRefund] = useState(false);
  const [open, setOpen] = useState<{ key: string; action: Action; followupId?: string } | null>(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [percent, setPercent] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await getRecovery().catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (!body) return;
    setRows(body.followUps ?? []);
    setRefunds(body.refunds ?? []);
    setMayRefund(body.mayRecordRefund === true);
  }, [getRecovery]);
  useEffect(() => {
    void load();
  }, [load]);

  function start(key: string, action: Action, followupId?: string) {
    setOpen({ key, action, followupId });
    setNote('');
    setDate('');
    setPercent('');
  }
  async function send(body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch('/api/app/fees/recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    if (!res?.ok) return toast.show(t(answer.code === 'date' ? 'frec.bad.date' : answer.code === 'percent' ? 'frec.bad.percent' : answer.code === 'already_open' ? 'frec.bad.open' : 'fee.failed'), 'danger');
    if (body.action === 'hardship') toast.show(t('frec.hardship.done', { count: Number(answer.proposed ?? 0) }), 'success');
    setOpen(null);
    void load();
    feesChanged();
  }

  if (rows === null) return null;
  return (
    <section lang={lang} data-recovery className="flex flex-col gap-4 rounded-lg border border-slate/10 bg-white p-4">
      <div>
        <h2 className="text-base font-bold text-slate">{t('frec.title')}</h2>
        <p className="text-sm text-slate/70">{t('frec.how')}</p>
      </div>
      {rows.length === 0 && <p data-recovery-empty className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('frec.none')}</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.student_id} data-followup className="flex flex-col gap-2 rounded-md border border-slate/10 p-3 text-sm text-slate">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{r.payer}</span>
              {r.children > 1 && <span className="text-slate/70">{t('frec.children', { count: r.children })}</span>}
              <span className="font-bold">₹{minorToRupees(r.overdue_minor)}</span>
              <span>{t('frec.age', { days: r.days_overdue, date: r.oldest_due })}</span>
              {r.hardship_id && <Badge variant="warning">{t('frec.badge.hardship')}</Badge>}
              {r.promise_id && <Badge variant={r.promise_passed ? 'danger' : 'neutral'}>{t(r.promise_passed ? 'frec.badge.promisePassed' : 'frec.badge.promise', { date: r.promise_date ?? '' })}</Badge>}
            </div>
            <p className="text-slate/80">{r.last_kind ? t('frec.last', { what: t(`frec.kind.${r.last_kind}` as MessageKey), date: r.last_on ?? '', by: r.last_by ?? '', note: r.last_note ?? '' }) : t('frec.last.none')}</p>
            {(r.promise_id || r.hardship_id) && <p className="text-xs text-slate/70">{t('frec.held')}</p>}
            {open?.key === r.student_id ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input id={`rec-note-${r.student_id}`} label={t(open.action === 'close' ? 'frec.note.close' : open.action === 'hardship' ? 'frec.note.hardship' : 'frec.note')} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
                {open.action === 'promise' && <Input id={`rec-date-${r.student_id}`} type="date" label={t('frec.promise.date')} value={date} onChange={(e) => setDate(e.target.value)} />}
                {open.action === 'hardship' && <Input id={`rec-percent-${r.student_id}`} inputMode="decimal" label={t('frec.hardship.percent')} value={percent} onChange={(e) => setPercent(e.target.value)} />}
                <button
                  type="button"
                  data-followup-save
                  disabled={busy || !note.trim() || (open.action === 'promise' && !date) || (open.action === 'hardship' && !percent)}
                  className={PRIMARY}
                  onClick={() => void send(open.action === 'close' ? { action: 'close', followupId: open.followupId, note } : { action: open.action, studentId: r.student_id, note, promiseDate: date, percentOff: Number(percent) })}
                >
                  {t(`frec.save.${open.action}` as MessageKey)}
                </button>
                <button type="button" className={TAP} onClick={() => setOpen(null)}>
                  {t('frec.cancel')}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" data-followup-call className={TAP} onClick={() => start(r.student_id, 'call')}>{t('frec.do.call')}</button>
                {r.promise_id ? (
                  <button type="button" className={TAP} onClick={() => start(r.student_id, 'close', r.promise_id ?? undefined)}>{t('frec.do.closePromise')}</button>
                ) : (
                  <button type="button" data-followup-promise className={TAP} onClick={() => start(r.student_id, 'promise')}>{t('frec.do.promise')}</button>
                )}
                {r.hardship_id ? (
                  <button type="button" className={TAP} onClick={() => start(r.student_id, 'close', r.hardship_id ?? undefined)}>{t('frec.do.closeHardship')}</button>
                ) : (
                  <button type="button" data-followup-hardship className={TAP} onClick={() => start(r.student_id, 'hardship')}>{t('frec.do.hardship')}</button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <div data-refunds className="flex flex-col gap-2 border-t border-slate/10 pt-3 text-sm text-slate">
        <h3 className="text-base font-bold">{t('frec.refund.title')}</h3>
        <p className="text-slate/70">{t('frec.refund.how')}</p>
        {refunds.length === 0 && <p className="rounded-md bg-off-white px-3 py-2">{t('frec.refund.none')}</p>}
        <ul className="flex flex-col gap-2">
          {refunds.map((f) => (
            <li key={f.evidence_id} data-refund={f.refunded_on ? 'done' : 'owed'} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{f.payer}</span>
                <span className="font-bold">₹{minorToRupees(f.amount_minor)}</span>
                <span>{t('frec.refund.arrived', { date: f.arrived_on, receipt: f.receipt_no ?? '—' })}</span>
                {f.refunded_on ? <Badge variant="success">{t('frec.refund.done', { date: f.refunded_on })}</Badge> : <Badge variant="warning">{t('frec.refund.owed')}</Badge>}
              </div>
              {f.refunded_on && <p className="text-slate/80">{t('frec.refund.by', { how: f.how ?? '', by: f.recorded_by ?? '' })}</p>}
              {!f.refunded_on && mayRefund && (open?.key === f.evidence_id ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input id={`refund-how-${f.evidence_id}`} label={t('frec.refund.howGiven')} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
                  <Input id={`refund-date-${f.evidence_id}`} type="date" label={t('frec.refund.date')} value={date} onChange={(e) => setDate(e.target.value)} />
                  <button type="button" data-refund-save disabled={busy || !note.trim() || !date} className={PRIMARY} onClick={() => void send({ action: 'refunded', evidenceId: f.evidence_id, how: note, refundedOn: date })}>
                    {t('frec.refund.save')}
                  </button>
                  <button type="button" className={TAP} onClick={() => setOpen(null)}>
                    {t('frec.cancel')}
                  </button>
                </div>
              ) : (
                <button type="button" data-refund-open className={`${TAP} self-start`} onClick={() => start(f.evidence_id, 'call')}>
                  {t('frec.refund.record')}
                </button>
              ))}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
