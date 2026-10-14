import { SHOWN_ROW, ShownRows, shownDay } from '@/components/dashboards/ShownRows';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { minorToRupees } from '@/lib/fees/money';
import { DUE_ROWS_MAX, listDues, loadFeesSummary, type DueRow } from '@/lib/fees/overdue';
import { RECEIPT_ROWS_MAX, collectedBetween, receiptsBetween, type ReceiptView } from '@/lib/fees/payments';
import { promisesDue, type PromiseDueRow } from '@/lib/fees/recovery';
import { FINANCE } from '@/lib/fees/structures';
import { t, tCount, type MessageKey } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import type { FeesShow } from '@/lib/insights/screens';
import type { FactRange } from '@/lib/insights/types';
import { waitingReports, type WaitingReport } from '@/lib/payments/upi';
import { indiaDate } from '@/lib/time/india';

// /app/fees?show=… (docs/26 slice 8d, C203): the fee rows behind a dashboard number.
//   overdue, owed   the fee entries with money still to come, by the one overdue rule (src/lib/fees/overdue.ts)
//   collected       the receipts issued from..to that still stand
//   promises        the promises to pay whose date has come
//   verify          the UPI payments parents reported that nobody has yet found in the bank
// The finance roles only (the database refuses anyone else), read in the person's own session. The oldest first;
// never ordered by amount, and nothing here sits beside a child's learning.
const money = (minor: number) => `₹${minorToRupees(minor)}`;

export async function FeesShown({ show, range }: { show: FeesShow; range: FactRange | null }) {
  const session = await getServerSession();
  if (!session?.schoolId || !FINANCE.includes(session.role)) return null;
  const schoolId = session.schoolId;
  const { lang } = getLang(session.sub);
  // "Collected" needs its days; without them, today.
  const days = range ?? { from: indiaDate(), to: indiaDate() };
  let dues: DueRow[] = [];
  // The dues' total is the fee summary's own figure (never cut short); the rows are its entries.
  let owing = { count: 0, minor: 0 };
  let receipts: ReceiptView[] = [];
  let collected = { count: 0, minor: 0, reversed: 0 };
  let promises: PromiseDueRow[] = [];
  let reports: WaitingReport[] = [];
  try {
    await withTenantContext(session, async (db) => {
      if (show === 'overdue' || show === 'owed') {
        dues = await listDues(db, schoolId, show);
        const summary = await loadFeesSummary(db, schoolId);
        owing = show === 'overdue' ? { count: summary.overdueCount, minor: summary.overdueMinor } : { count: dues.length, minor: summary.pendingMinor };
      }
      else if (show === 'collected') [collected, receipts] = [await collectedBetween(db, schoolId, days.from, days.to), await receiptsBetween(db, schoolId, days.from, days.to)];
      else if (show === 'promises') promises = await promisesDue(db, schoolId);
      else reports = await waitingReports(db, schoolId);
    });
  } catch {
    return null;
  }
  // The receipts' count and amount are the totals; the rows are the first of them when there are very many.
  const count = owing.count + collected.count + promises.length + reports.length;
  const amount = money(owing.minor + collected.minor);
  const capped = dues.length >= DUE_ROWS_MAX ? DUE_ROWS_MAX : collected.count > receipts.length ? RECEIPT_ROWS_MAX : 0;
  const reversed = collected.reversed;
  const note = [capped ? t(lang, 'shown.capped', { count: capped }) : '', reversed > 0 ? tCount(lang, 'shown.fees.reversed', reversed) : '', show === 'promises' || show === 'verify' ? t(lang, 'shown.fees.below') : ''].filter(Boolean).join(' ');
  return (
    <ShownRows id={`fees-${show}`} lang={lang} title={t(lang, `shown.fees.title.${show}` as MessageKey, { count, amount })} days={show === 'collected' ? { from: shownDay(lang, days.from), to: shownDay(lang, days.to) } : undefined} note={note || undefined} backHref="/app/fees" empty={count === 0}>
      {dues.map((d) => (
        <li key={d.fee_id} data-shown-row className={SHOWN_ROW}>
          <span className="font-bold">
            {d.student_name ?? ''}
            {d.class_name ? ` · ${d.class_name}` : ''}
          </span>
          <span>
            {d.is_late_fee ? t(lang, 'shown.fees.lateFee') : (d.head_name ?? '')}
            {d.period_key ? ` · ${d.period_key}` : ''}
          </span>
          <span>{t(lang, 'shown.fees.due', { date: shownDay(lang, d.due_date), billed: money(d.amount_minor), paid: money(d.paid_minor), left: money(d.balance_minor) })}</span>
        </li>
      ))}
      {receipts.map((r) => (
        <li key={r.receipt_id} data-shown-row className={SHOWN_ROW}>
          <span className="font-bold">
            {r.student_name} · {money(r.total_minor)}
          </span>
          <span>{t(lang, 'shown.fees.receipt', { no: r.receipt_no, date: shownDay(lang, indiaDate(new Date(r.issued_at))) })}</span>
        </li>
      ))}
      {promises.map((p) => (
        <li key={p.followup_id} data-shown-row className={SHOWN_ROW}>
          <span className="font-bold">{p.payer}</span>
          <span>{t(lang, 'shown.fees.promise', { date: shownDay(lang, p.promise_date), made: shownDay(lang, p.made_on), by: p.made_by ?? '' })}</span>
        </li>
      ))}
      {reports.map((r) => (
        <li key={r.report_id} data-shown-row className={SHOWN_ROW}>
          <span className="font-bold">
            {r.payer} · {money(r.amount_minor)}
          </span>
          <span>{t(lang, 'shown.fees.verify', { utr: r.utr, date: shownDay(lang, indiaDate(new Date(r.reported_at))) })}</span>
        </li>
      ))}
    </ShownRows>
  );
}
