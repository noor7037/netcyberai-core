'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import type { BillingOverview, BillingState, PaymentRow, SchoolBilling } from '@/lib/control/billing';
import type { AmountDue } from '@/lib/control/billing-amount';
import { lastGraceDay } from '@/lib/control/grace-day';
import { minorToRupees } from '@/lib/fees/money';
import type { MessageKey } from '@/lib/i18n';
import { BillingTerms } from './BillingTerms';
import { BillingTrial } from './BillingTrial';
import { trialLine } from './BillingTrials';

// Control → Billing & Plans, the schools (docs/26 slice 8e, C204): each school's plan, the period it pays for, the
// amount due for that period (C212), the day it has paid until, its access and when grace ends; "Record a payment",
// "Change plan", "Terms and amount due", and the payments already recorded. A payment is never edited: "Correct this
// entry" adds a new row that names the wrong one. Amounts are typed in rupees and shown from the stored paise.

export type Send = (url: string, payload: unknown, done: MessageKey | ((answer: Record<string, unknown>) => MessageKey)) => Promise<boolean>;
type Panel = 'payment' | 'plan' | 'history' | 'terms' | 'trial';
type PayDraft = { amountRupees: string; paidOn: string; coversUntil: string; reference: string; note: string; corrects: PaymentRow | null; nothingPaid: boolean };
const STATE_VARIANT: Record<BillingState, 'neutral' | 'success' | 'warning' | 'danger'> = { not_billed: 'neutral', paid: 'success', due: 'warning', grace: 'warning', read_only: 'danger', suspended: 'danger' };
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const FIELD = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-3 text-sm text-slate';
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS: Record<string, number> = { month: 1, year: 12 };
const iso = (d: Date) => d.toISOString().slice(0, 10);
// The amount due for the school's period, or what is missing before it can be worked out.
export function amountLine(t: (key: MessageKey, params?: Record<string, string | number>) => string, amount: AmountDue | null): string {
  if (!amount) return '—';
  if (amount.amountMinor === null || amount.period === null) return t(`billing.due.${amount.missing ?? 'no_price'}` as MessageKey);
  return t(`billing.due.${amount.period}` as MessageKey, { amount: rupees(amount.amountMinor) });
}

// A day one period after `from`, kept inside the month (31 January and a month is the last day of February).
function addPeriod(from: string, period: string): string {
  const [y, m, d] = from.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + MONTHS[period], 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, lastDay))));
}
// The day a payment made today would cover until: one period on from what is already paid, or from yesterday when nothing is.
function suggestCoversUntil(school: SchoolBilling, paidOn: string): string {
  if (!school.period) return '';
  const yesterday = iso(new Date(Date.parse(`${paidOn}T00:00:00Z`) - 86_400_000));
  return addPeriod(school.paidUntil ?? yesterday, school.period);
}

export function BillingSchools({ data, busy, send }: { data: BillingOverview; busy: boolean; send: Send }) {
  const { t, tCount, lang } = useT();
  const [open, setOpen] = useState<{ schoolId: string; panel: Panel } | null>(null);
  const [pay, setPay] = useState<PayDraft | null>(null);
  const [plan, setPlan] = useState({ planId: '', reason: '' });
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const day = (isoDate: string) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${isoDate}T00:00:00Z`));
  const moment = (at: string) => new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(at));

  const loadPayments = async (schoolId: string) => {
    setPayments(null);
    const res = await fetch(`/api/control/schools/${schoolId}/subscription`, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? await res.json().catch(() => null) : null;
    setPayments(got ? (got.payments as PaymentRow[]) : []);
  };
  const show = (school: BillingOverview['schools'][number], panel: Panel, corrects: PaymentRow | null = null) => {
    if (!corrects && open?.schoolId === school.schoolId && open.panel === panel) return setOpen(null);
    setOpen({ schoolId: school.schoolId, panel });
    // A new payment starts from the amount due for the school's period, when there is one (C212); it can be changed.
    const due = school.amount?.amountMinor ?? null;
    if (panel === 'payment')
      setPay(
        corrects
          ? { amountRupees: String(corrects.amountMinor / 100), paidOn: corrects.paidOn, coversUntil: corrects.coversUntil ?? '', reference: corrects.reference, note: '', corrects, nothingPaid: false }
          : { amountRupees: due !== null && due > 0 ? minorToRupees(due) : '', paidOn: data.today, coversUntil: suggestCoversUntil(school, data.today), reference: '', note: '', corrects: null, nothingPaid: false }
      );
    if (panel === 'plan') setPlan({ planId: '', reason: '' });
    if (panel === 'history') void loadPayments(school.schoolId);
  };
  const savePayment = async (school: SchoolBilling, d: PayDraft) => {
    const ok = await send(
      `/api/control/schools/${school.schoolId}/subscription`,
      { action: 'payment', amountRupees: d.nothingPaid ? '0' : d.amountRupees.trim(), paidOn: d.paidOn, coversUntil: d.nothingPaid ? null : d.coversUntil || null, reference: d.reference, note: d.note, correctsPaymentId: d.corrects?.paymentId ?? null },
      // A payment that brought the school up to date also ends a grace period set by hand: the line says so.
      d.corrects ? 'billing.pay.corrected' : (answer) => (answer.handGraceEnded ? 'billing.pay.doneGraceEnded' : 'billing.pay.done')
    );
    if (ok) setOpen(null);
  };
  const savePlan = async (school: SchoolBilling) => {
    const ok = await send(`/api/control/schools/${school.schoolId}/subscription`, { action: 'plan', planId: plan.planId, reason: plan.reason.trim() }, 'billing.change.done');
    if (ok) setOpen(null);
  };

  return (
    <section data-billing-schools className="flex flex-col gap-3 rounded-xl border border-slate/10 bg-white p-4">
      <div>
        <h2 className="text-lg font-bold">{t('billing.schools.title')}</h2>
        <p className="max-w-prose text-slate/70">{t('billing.schools.how')}</p>
      </div>
      {data.schools.length === 0 && <p className="rounded-md bg-off-white px-3 py-2">{t('billing.schools.none')}</p>}
      <ul className="flex flex-col gap-3">
        {data.schools.map((s) => {
          const mine = open?.schoolId === s.schoolId ? open.panel : null;
          // C226: the school's free month, if it has had one (docs/30).
          const trial = data.trials.find((x) => x.schoolId === s.schoolId) ?? null;
          return (
            <li key={s.schoolId} id={`billing-school-${s.schoolId}`} data-billing-school={s.schoolId} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-bold">{s.schoolName}</p>
                <Badge variant={STATE_VARIANT[s.state]} data-billing-state={s.state}>
                  {t(`billing.state.${s.state}` as MessageKey)}
                </Badge>
                {trial?.inForce && <Badge variant="success">{t('billing.trial.badge')}</Badge>}
                {s.isTest && <Badge>{t('billing.school.test')}</Badge>}
              </div>
              <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-slate/70">{t('billing.col.plan')}</dt>
                  <dd className="font-semibold">{s.planName ?? t('billing.school.noPlan')}</dd>
                </div>
                <div>
                  <dt className="text-slate/70">{t('billing.col.period')}</dt>
                  <dd data-billing-period className="font-semibold">
                    {s.period ? t(`billing.period.${s.period}` as MessageKey) : t('billing.period.none')}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate/70">{t('billing.col.amount')}</dt>
                  <dd data-billing-amount className="font-semibold">
                    {amountLine(t, s.amount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate/70">{t('billing.col.paidUntil')}</dt>
                  <dd data-billing-paid-until className="font-semibold">
                    {s.paidUntil ? day(s.paidUntil) : t('billing.school.notBilled')}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate/70">{t('billing.col.access')}</dt>
                  <dd className="font-semibold">{t(`billing.access.${s.accessMode}` as MessageKey)}</dd>
                  {s.accessMode !== 'full' && <dd className="text-slate/70">{t(s.byBilling ? 'billing.access.byCheck' : 'billing.access.byHand')}</dd>}
                  {s.checkOff && <dd data-billing-check-off className="text-slate/70">{t('billing.access.checkOff')}</dd>}
                </div>
                <div>
                  <dt className="text-slate/70">{t('billing.col.graceEnds')}</dt>
                  <dd className="font-semibold">{s.graceEndsAt ? day(lastGraceDay(s.graceEndsAt)) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate/70">{t('billing.col.trial')}</dt>
                  <dd data-billing-school-trial className="font-semibold">
                    {trial ? trialLine(t, tCount, day, trial) : t('billing.trial.none')}
                  </dd>
                </div>
              </dl>
              {s.isTest && <p className="max-w-prose text-slate/70">{t('billing.school.testHow')}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" data-billing-pay disabled={busy || !s.planId} className={TAP} aria-expanded={mine === 'payment'} onClick={() => show(s, 'payment')}>
                  {t('billing.pay.open')}
                </button>
                <button type="button" data-billing-change disabled={busy} className={TAP} aria-expanded={mine === 'plan'} onClick={() => show(s, 'plan')}>
                  {t('billing.change.open')}
                </button>
                <button type="button" data-billing-history disabled={busy} className={TAP} aria-expanded={mine === 'history'} onClick={() => show(s, 'history')}>
                  {t('billing.history.open')}
                </button>
                <button type="button" data-billing-terms disabled={busy} className={TAP} aria-expanded={mine === 'terms'} onClick={() => show(s, 'terms')}>
                  {t('billing.terms.open')}
                </button>
                <button type="button" data-billing-trial-open disabled={busy} className={TAP} aria-expanded={mine === 'trial'} onClick={() => show(s, 'trial')}>
                  {t('billing.trial.open')}
                </button>
              </div>
              {!s.planId && <p className="max-w-prose text-slate/70">{t('billing.school.noPlanHow')}</p>}

              {mine === 'payment' && pay && (
                <form
                  data-billing-pay-form
                  className="flex flex-col gap-3 rounded-md bg-off-white p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void savePayment(s, pay);
                  }}
                >
                  <div>
                    <h3 className="text-base font-bold">{t(pay.corrects ? 'billing.pay.correctTitle' : 'billing.pay.title')}</h3>
                    <p className="max-w-prose text-slate/70">{pay.corrects ? t('billing.pay.correctHow', { paidOn: day(pay.corrects.paidOn), amount: rupees(pay.corrects.amountMinor) }) : t('billing.pay.how')}</p>
                  </div>
                  {pay.corrects && (
                    <label className="flex min-h-[44px] items-center gap-2">
                      <input type="checkbox" checked={pay.nothingPaid} onChange={(e) => setPay({ ...pay, nothingPaid: e.target.checked })} />
                      {t('billing.pay.nothingPaid')}
                    </label>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {!pay.nothingPaid && <Input id={`pay-amount-${s.schoolId}`} inputMode="decimal" required label={t('billing.pay.amount')} value={pay.amountRupees} onChange={(e) => setPay({ ...pay, amountRupees: e.target.value })} />}
                    <Input id={`pay-on-${s.schoolId}`} type="date" required max={data.today} label={t('billing.pay.paidOn')} value={pay.paidOn} onChange={(e) => setPay({ ...pay, paidOn: e.target.value })} />
                    {!pay.nothingPaid && (
                      <Input id={`pay-until-${s.schoolId}`} type="date" required label={t('billing.pay.coversUntil')} helperText={s.paidUntil ? t('billing.pay.coversHelp', { paidUntil: day(s.paidUntil) }) : undefined} value={pay.coversUntil} onChange={(e) => setPay({ ...pay, coversUntil: e.target.value })} />
                    )}
                    <Input id={`pay-ref-${s.schoolId}`} required maxLength={120} label={t('billing.pay.reference')} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
                  </div>
                  <Input id={`pay-note-${s.schoolId}`} maxLength={500} required={!!pay.corrects} label={t(pay.corrects ? 'billing.pay.noteCorrect' : 'billing.pay.note')} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
                  <button type="submit" data-billing-pay-save disabled={busy || !pay.reference.trim() || (!pay.nothingPaid && (!pay.amountRupees.trim() || !pay.coversUntil)) || (!!pay.corrects && !pay.note.trim())} className={`${PRIMARY} self-start`}>
                    {t(pay.corrects ? 'billing.pay.saveCorrect' : 'billing.pay.save')}
                  </button>
                </form>
              )}

              {mine === 'plan' && (
                <form
                  data-billing-change-form
                  className="flex flex-col gap-3 rounded-md bg-off-white p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void savePlan(s);
                  }}
                >
                  <div>
                    <h3 className="text-base font-bold">{t('billing.change.title')}</h3>
                    <p className="max-w-prose text-slate/70">{t('billing.change.how')}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={`change-plan-${s.schoolId}`} className="text-sm font-medium text-slate">
                        {t('billing.change.plan')}
                      </label>
                      <select id={`change-plan-${s.schoolId}`} required className={FIELD} value={plan.planId} onChange={(e) => setPlan({ ...plan, planId: e.target.value })}>
                        <option value="">{t('billing.change.choose')}</option>
                        {data.plans
                          .filter((p) => (!p.retired || p.planId === s.planId) && (!p.testSchoolsOnly || s.isTest))
                          .map((p) => (
                            <option key={p.planId} value={p.planId}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <Input id={`change-why-${s.schoolId}`} required maxLength={500} label={t('billing.change.reason')} value={plan.reason} onChange={(e) => setPlan({ ...plan, reason: e.target.value })} />
                  </div>
                  <button type="submit" data-billing-change-save disabled={busy || !plan.planId || plan.reason.trim().length < 3} className={`${PRIMARY} self-start`}>
                    {t('billing.change.save')}
                  </button>
                </form>
              )}

              {mine === 'terms' && <BillingTerms school={s} data={data} busy={busy} send={send} />}
              {mine === 'trial' && <BillingTrial school={s} data={data} busy={busy} send={send} />}

              {mine === 'history' && (
                <div data-billing-history-list className="flex flex-col gap-2 rounded-md bg-off-white p-3">
                  <h3 className="text-base font-bold">{t('billing.history.title')}</h3>
                  {payments && payments.length === 0 && <p className="max-w-prose">{t('billing.history.none')}</p>}
                  <ul className="flex flex-col gap-2">
                    {(payments ?? []).map((p) => (
                      <li key={p.paymentId} data-billing-payment className="flex flex-col gap-1 rounded-md border border-slate/10 bg-white p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold">{p.amountMinor === 0 ? t('billing.history.nothingPaid') : rupees(p.amountMinor)}</p>
                          {p.correctedBy && <Badge>{t('billing.history.corrected')}</Badge>}
                          {p.correctsPaymentId && <Badge variant="warning">{t('billing.history.correction')}</Badge>}
                        </div>
                        <p>{p.coversUntil ? t('billing.history.line', { paidOn: day(p.paidOn), coversUntil: day(p.coversUntil), plan: p.planName }) : t('billing.history.lineNothing', { paidOn: day(p.paidOn) })}</p>
                        <p className="break-words">{t('billing.history.reference', { reference: p.reference })}</p>
                        {p.note && <p className="break-words">{t('billing.history.note', { note: p.note })}</p>}
                        <p className="text-slate/70">{t('billing.history.by', { name: p.recordedBy, at: moment(p.recordedAt) })}</p>
                        {!p.correctedBy && (
                          <button type="button" data-billing-correct disabled={busy} className={`${TAP} self-start`} onClick={() => show(s, 'payment', p)}>
                            {t('billing.history.correct')}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
