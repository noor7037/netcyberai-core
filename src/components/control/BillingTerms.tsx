'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { BillingOverview } from '@/lib/control/billing';
import { bpToPercent, proposeYearMinor, type AmountDue } from '@/lib/control/billing-amount';
import type { BillingTerm, TermKind, TermState } from '@/lib/control/billing-terms';
import { isAlwaysOn } from '@/lib/contracts/entitlements';
import { minorToRupees, rupeesToMinor } from '@/lib/fees/money';
import type { MessageKey } from '@/lib/i18n';
import type { Send } from './BillingSchools';

// Control → Billing & Plans → a school → "Terms and amount due" (founder, C212). Read by NetCyberAI staff only.
//   - The amount due for the period the school pays for, with its working: students counted, the minimum, the
//     price per student and where it comes from, the discount, and any complimentary module (never charged). The
//     numbers come from the server's one rule (src/lib/control/billing-amount.ts); this screen only shows them.
//   - The period the school pays for: a month or a year, with a reason.
//   - The school's terms, newest first, each with its dates, reason, who added it and its state; "End this term".
//   - "Add a term": a negotiated price (the yearly one is filled in as ten months, and can be changed), a
//     complimentary module with its last day, a discount in percent, or a minimum number of students billed.
// Every change goes to the Control API, which checks the session and writes the audit row.

type School = BillingOverview['schools'][number];
type Loaded = { terms: BillingTerm[]; amount: AmountDue | null };
type TermDraft = { kind: TermKind; priceMonth: string; priceYear: string; yearTyped: boolean; moduleId: string; percent: string; minimum: string; startsOn: string; endsOn: string; reason: string };
const KINDS: readonly TermKind[] = ['price', 'complimentary', 'discount', 'minimum'];
const STATE_VARIANT: Record<TermState, 'neutral' | 'success' | 'warning'> = { in_force: 'success', later: 'warning', ended: 'neutral', never: 'neutral' };
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shiftDay = (isoDay: string, n: number) => new Date(Date.parse(`${isoDay}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const proposedYear = (month: string) => {
  const minor = rupeesToMinor(month);
  return minor === null ? '' : minorToRupees(proposeYearMinor(minor));
};
const validReason = (r: string) => r.trim().length >= 3 && r.trim().length <= 500;

export function BillingTerms({ school, data, busy, send }: { school: School; data: BillingOverview; busy: boolean; send: Send }) {
  const { t, lang } = useT();
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const day = (isoDate: string) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${isoDate}T00:00:00Z`));
  const moment = (at: string) => new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(at));
  const moduleLabel = (id: string) => t(`module.${id}` as MessageKey);
  const url = `/api/control/schools/${school.schoolId}/subscription`;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [period, setPeriod] = useState({ period: school.period ?? '', reason: '' });
  const [draft, setDraft] = useState<TermDraft | null>(null);
  const [ending, setEnding] = useState<{ termId: string; endsOn: string; reason: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(url, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? await res.json().catch(() => null) : null;
    setLoaded(got ? { terms: got.terms as BillingTerm[], amount: (got.amount as AmountDue | null) ?? null } : { terms: [], amount: null });
  }, [url]);
  useEffect(() => {
    void load();
  }, [load]);

  const after = async (ok: boolean) => {
    if (ok) await load();
    return ok;
  };
  const savePeriod = async () => {
    if (await after(await send(url, { action: 'period', period: period.period, reason: period.reason.trim() }, 'billing.period.done'))) setPeriod({ ...period, reason: '' });
  };
  const saveTerm = async (d: TermDraft) => {
    const value =
      d.kind === 'price' ? { priceMonthRupees: d.priceMonth.trim(), priceYearRupees: d.priceYear.trim() } : d.kind === 'complimentary' ? { moduleId: d.moduleId } : d.kind === 'discount' ? { percent: d.percent.trim() } : { minimumStudents: d.minimum.trim() };
    const ok = await send(url, { action: 'term', kind: d.kind, ...value, startsOn: d.startsOn, endsOn: d.endsOn || null, reason: d.reason.trim() }, (answer) => (Number(answer.replaced) > 0 ? 'billing.term.addedReplaced' : 'billing.term.added'));
    if (await after(ok)) setDraft(null);
  };
  const saveEnd = async (e: { termId: string; endsOn: string; reason: string }) => {
    if (await after(await send(url, { action: 'end_term', termId: e.termId, endsOn: e.endsOn, reason: e.reason.trim() }, 'billing.term.ended'))) setEnding(null);
  };

  const a = loaded?.amount ?? null;
  const complimentaryChoices = data.workingModules.filter((m) => !isAlwaysOn(m));
  const termValue = (term: BillingTerm) => {
    if (term.kind === 'price' && term.priceMonthMinor !== null && term.priceYearMinor !== null) return t('billing.pricing.perStudent', { month: rupees(term.priceMonthMinor), year: rupees(term.priceYearMinor) });
    if (term.kind === 'complimentary' && term.moduleId) return t('billing.term.value.complimentary', { module: moduleLabel(term.moduleId) });
    if (term.kind === 'discount' && term.discountBp !== null) return t('billing.term.value.discount', { percent: bpToPercent(term.discountBp) });
    if (term.kind === 'minimum' && term.minimumStudents !== null) return t('billing.term.value.minimum', { count: term.minimumStudents.toLocaleString('en-IN') });
    return '';
  };
  const termDates = (term: BillingTerm) =>
    term.state === 'never' ? t('billing.term.datesNever', { from: day(term.startsOn) }) : term.endsOn ? t('billing.term.dates', { from: day(term.startsOn), to: day(term.endsOn) }) : t('billing.term.datesOpen', { from: day(term.startsOn) });
  // A term can still be ended while it is in force or has not begun.
  const endable = (term: BillingTerm) => term.state === 'in_force' || term.state === 'later';
  // The earliest last day the server takes: yesterday (not in force from today), and never more than a day before the
  // term's first day (that day means it is never in force). A term not begun yet is offered that day.
  const earliestEnd = (term: BillingTerm) => {
    const yesterday = shiftDay(data.today, -1);
    const dayBefore = shiftDay(term.startsOn, -1);
    return dayBefore > yesterday ? dayBefore : yesterday;
  };

  return (
    <div data-billing-terms-panel className="flex flex-col gap-3 rounded-md bg-off-white p-3">
      <div className="flex flex-wrap items-center gap-x-1">
        <h3 className="text-base font-bold">{t('billing.terms.title')}</h3>
        <InfoTip tone="white">{t('billing.terms.how')}</InfoTip>
      </div>
      {!loaded && <p className="text-slate/70">{t('billing.terms.loading')}</p>}

      {loaded && (
        <section data-billing-working className="flex flex-col gap-1 rounded-md border border-slate/10 bg-white p-3">
          <h4 className="font-bold">{t('billing.work.title')}</h4>
          {a && (
            <>
              <p data-billing-enrolled>{t('billing.work.enrolled', { count: a.enrolledStudents.toLocaleString('en-IN') })}</p>
              <p>{a.minimumStudents === null ? t('billing.work.noMinimum') : t('billing.work.minimum', { count: a.minimumStudents.toLocaleString('en-IN') })}</p>
              <p>{t('billing.work.billed', { count: a.billedStudents.toLocaleString('en-IN') })}</p>
              {a.pricePerStudentMinor !== null && a.period && a.priceSource && <p>{t(`billing.work.price.${a.priceSource}.${a.period}` as MessageKey, { price: rupees(a.pricePerStudentMinor) })}</p>}
              {a.grossMinor !== null && a.pricePerStudentMinor !== null && <p>{t('billing.work.gross', { count: a.billedStudents.toLocaleString('en-IN'), price: rupees(a.pricePerStudentMinor), amount: rupees(a.grossMinor) })}</p>}
              {a.missing === null && <p>{a.discountBp === null || a.discountMinor === null ? t('billing.work.noDiscount') : t('billing.work.discount', { percent: bpToPercent(a.discountBp), amount: rupees(a.discountMinor) })}</p>}
              <p data-billing-amount-due className="text-base font-bold">
                {a.amountMinor !== null && a.period ? t(`billing.work.amount.${a.period}` as MessageKey, { amount: rupees(a.amountMinor) }) : t(`billing.due.${a.missing ?? 'no_price'}` as MessageKey)}
              </p>
              {a.complimentary.map((c) => (
                <p key={c.moduleId} data-billing-complimentary={c.moduleId}>
                  {t('billing.work.complimentary', { module: moduleLabel(c.moduleId), day: day(c.endsOn) })}
                </p>
              ))}
            </>
          )}
        </section>
      )}

      <form
        data-billing-period-form
        className="flex flex-col gap-3 rounded-md border border-slate/10 bg-white p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void savePeriod();
        }}
      >
        <h4 className="font-bold">{t('billing.period.title')}</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select id={`period-${school.schoolId}`} required label={t('billing.period.label')} value={period.period} onChange={(e) => setPeriod({ ...period, period: e.target.value })}>
            <option value="">{t('billing.period.choose')}</option>
            <option value="month">{t('billing.period.month')}</option>
            <option value="year">{t('billing.period.year')}</option>
          </Select>
          <Input id={`period-why-${school.schoolId}`} required maxLength={500} label={t('billing.change.reason')} value={period.reason} onChange={(e) => setPeriod({ ...period, reason: e.target.value })} />
        </div>
        <button type="submit" data-billing-period-save disabled={busy || !period.period || !validReason(period.reason)} className={`${PRIMARY} self-start`}>
          {t('billing.period.save')}
        </button>
      </form>

      {loaded && loaded.terms.length === 0 && <p className="max-w-prose">{t('billing.terms.none')}</p>}
      {loaded && loaded.terms.length > 0 && (
        <ul className="flex flex-col gap-2">
          {loaded.terms.map((term) => (
            <li key={term.termId} data-billing-term={term.kind} data-billing-term-state={term.state} className="flex flex-col gap-1 rounded-md border border-slate/10 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold">{t(`billing.term.kind.${term.kind}` as MessageKey)}</p>
                <Badge variant={STATE_VARIANT[term.state]}>{t(`billing.term.state.${term.state}` as MessageKey)}</Badge>
              </div>
              <p className="break-words">{termValue(term)}</p>
              <p>{termDates(term)}</p>
              <p className="break-words">{t('billing.term.reason', { reason: term.reason })}</p>
              <p className="text-slate/70">{t('billing.term.by', { name: term.createdBy, at: moment(term.createdAt) })}</p>
              {term.replacedBy && <p className="text-slate/70">{t('billing.term.replaced')}</p>}
              {!term.replacedBy && term.endedAt && term.endReason && <p className="break-words text-slate/70">{t('billing.term.endedBy', { name: term.endedBy ?? '', at: moment(term.endedAt), reason: term.endReason })}</p>}
              {endable(term) && ending?.termId !== term.termId && (
                <button type="button" data-billing-term-end disabled={busy} className={`${TAP} self-start`} onClick={() => setEnding({ termId: term.termId, endsOn: earliestEnd(term) > data.today ? earliestEnd(term) : data.today, reason: '' })}>
                  {t('billing.term.end')}
                </button>
              )}
              {ending?.termId === term.termId && (
                <form
                  data-billing-term-end-form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveEnd(ending);
                  }}
                >
                  <div className="flex flex-wrap items-center gap-x-1">
                    <InfoTip tone="white">{t('billing.term.endHow')}</InfoTip>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input id={`end-on-${term.termId}`} type="date" required min={earliestEnd(term)} label={t('billing.term.endsOnRequired')} value={ending.endsOn} onChange={(e) => setEnding({ ...ending, endsOn: e.target.value })} />
                    <Input id={`end-why-${term.termId}`} required maxLength={500} label={t('billing.change.reason')} value={ending.reason} onChange={(e) => setEnding({ ...ending, reason: e.target.value })} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" data-billing-term-end-save disabled={busy || !ending.endsOn || !validReason(ending.reason)} className={PRIMARY}>
                      {t('billing.term.endSave')}
                    </button>
                    <button type="button" disabled={busy} className={TAP} onClick={() => setEnding(null)}>
                      {t('billing.form.cancel')}
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {!draft && (
        <button
          type="button"
          data-billing-term-add
          disabled={busy}
          className={`${PRIMARY} self-start`}
          onClick={() => setDraft({ kind: 'price', priceMonth: '', priceYear: '', yearTyped: false, moduleId: '', percent: '', minimum: '', startsOn: data.today, endsOn: '', reason: '' })}
        >
          {t('billing.term.add')}
        </button>
      )}
      {draft && (
        <form
          data-billing-term-form
          className="flex flex-col gap-3 rounded-md border border-slate/10 bg-white p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void saveTerm(draft);
          }}
        >
          <div className="flex flex-wrap items-center gap-x-1">
            <h4 className="font-bold">{t('billing.term.addTitle')}</h4>
            {draft.kind === 'price' && <InfoTip tone="white">{t('billing.pricing.yearProposed')}</InfoTip>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select id={`term-kind-${school.schoolId}`} label={t('billing.term.kind')} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as TermKind })}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`billing.term.kind.${k}` as MessageKey)}
                </option>
              ))}
            </Select>
            {draft.kind === 'price' && (
              <>
                <Input
                  id={`term-month-${school.schoolId}`}
                  inputMode="decimal"
                  required
                  label={t('billing.pricing.monthLabel')}
                  value={draft.priceMonth}
                  onChange={(e) => setDraft({ ...draft, priceMonth: e.target.value, priceYear: draft.yearTyped ? draft.priceYear : proposedYear(e.target.value) })}
                />
                <Input
                  id={`term-year-${school.schoolId}`}
                  inputMode="decimal"
                  required
                  label={t('billing.pricing.yearLabel')}
                  value={draft.priceYear}
                  onChange={(e) => setDraft({ ...draft, priceYear: e.target.value, yearTyped: e.target.value.trim() !== '' })}
                />
              </>
            )}
            {draft.kind === 'complimentary' && (
              <Select id={`term-module-${school.schoolId}`} required label={t('billing.term.module')} value={draft.moduleId} onChange={(e) => setDraft({ ...draft, moduleId: e.target.value })}>
                <option value="">{t('billing.term.chooseModule')}</option>
                {complimentaryChoices.map((m) => (
                  <option key={m} value={m}>
                    {moduleLabel(m)}
                  </option>
                ))}
              </Select>
            )}
            {draft.kind === 'discount' && <Input id={`term-percent-${school.schoolId}`} inputMode="decimal" required label={t('billing.term.percent')} value={draft.percent} onChange={(e) => setDraft({ ...draft, percent: e.target.value })} />}
            {draft.kind === 'minimum' && <Input id={`term-minimum-${school.schoolId}`} inputMode="numeric" required label={t('billing.term.minimum')} value={draft.minimum} onChange={(e) => setDraft({ ...draft, minimum: e.target.value })} />}
            <Input id={`term-from-${school.schoolId}`} type="date" required min={data.today} label={t('billing.term.startsOn')} value={draft.startsOn} onChange={(e) => setDraft({ ...draft, startsOn: e.target.value })} />
            <Input
              id={`term-to-${school.schoolId}`}
              type="date"
              required={draft.kind === 'complimentary'}
              min={draft.startsOn || data.today}
              label={t(draft.kind === 'complimentary' ? 'billing.term.endsOnRequired' : 'billing.term.endsOn')}
              value={draft.endsOn}
              onChange={(e) => setDraft({ ...draft, endsOn: e.target.value })}
            />
          </div>
          <Input id={`term-why-${school.schoolId}`} required maxLength={500} label={t('billing.change.reason')} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" data-billing-term-save disabled={busy || !draft.startsOn || !validReason(draft.reason) || (draft.kind === 'complimentary' && (!draft.moduleId || !draft.endsOn))} className={PRIMARY}>
              {t('billing.term.save')}
            </button>
            <button type="button" disabled={busy} className={TAP} onClick={() => setDraft(null)}>
              {t('billing.form.cancel')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
