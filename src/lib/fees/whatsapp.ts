import type { PoolClient } from 'pg';
import { jobQueue } from '@/lib/jobs/pg-queue';
import type { JobQueue, Sql } from '@/lib/jobs/types';
import { queueWhatsAppMessage } from '@/lib/whatsapp/gate';
import { normalizePhone } from '@/lib/whatsapp/phone';

// Fees on WhatsApp (docs/25 slice 7g, C188): the reminder, "payment
// initiated", and the receipt. Each is a template whose words are in
// src/lib/whatsapp/templates.ts, queued through the one gate, where consent,
// STOP, the budget, quiet hours and the school's approval are read.
//
//   - Nothing here decides money. A message is a consequence of something
//     already recorded: a due line, a UTR a parent entered, a receipt issued.
//   - "Payment initiated" says the school WILL verify; it never says paid.
//   - A receipt message is queued only where the receipt is issued, which is
//     only after the school (or the bank's own line, or a gateway's signed
//     notice) has verified the money.
//   - A message that cannot be queued never undoes the thing it is about:
//     it is tried inside a savepoint, and a failure is left behind.

const rupees = (minor: number) => (minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export type FeeGuardian = { parentId: string; studentId: string; phone: string };
const MAX_GUARDIANS = 2;

// The guardians of a family (or of a lone child) who have a number WhatsApp can use: one per number, at most two.
export async function feeGuardians(db: Sql, schoolId: string, payer: { familyId: string | null; studentId: string }): Promise<FeeGuardian[]> {
  const { rows } = await db.query(
    `select p.parent_id, m.student_id, p.phone
       from students st join parent_student_map m on m.school_id = st.school_id and m.student_id = st.student_id
       join parents p on p.school_id = m.school_id and p.parent_id = m.parent_id
      where st.school_id = $1 and (st.student_id = $3 or ($2::uuid is not null and st.family_id = $2))
      order by (st.student_id = $3) desc, p.created_at, p.parent_id`,
    [schoolId, payer.familyId, payer.studentId]
  );
  const seen = new Set<string>();
  const out: FeeGuardian[] = [];
  for (const r of rows) {
    const phone = normalizePhone(String(r.phone ?? ''));
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    out.push({ parentId: r.parent_id, studentId: r.student_id, phone });
    if (out.length === MAX_GUARDIANS) break;
  }
  return out;
}

type Told = { queued: number; held: number };
async function tell(db: Sql, queue: JobQueue, schoolId: string, guardians: readonly FeeGuardian[], templateName: string, params: Record<string, string>, key: string): Promise<Told> {
  const told: Told = { queued: 0, held: 0 };
  for (const g of guardians) {
    const out = await queueWhatsAppMessage(db as PoolClient, queue, { schoolId, studentId: g.studentId, parentId: g.parentId, purpose: 'operational_communication', toPhone: g.phone, templateName, templateParams: params, dedupeKey: `${key}:${g.parentId}` });
    if (out.status === 'queued') told.queued += 1;
    else if (!out.idempotent) told.held += 1;
  }
  return told;
}

// Something already done must never be undone because a message about it could not be queued.
async function quietly<T>(db: Sql, fn: () => Promise<T>): Promise<T | null> {
  await db.query('savepoint fee_message');
  try {
    const out = await fn();
    await db.query('release savepoint fee_message');
    return out;
  } catch (err) {
    await db.query('rollback to savepoint fee_message');
    console.error('[fees] a WhatsApp message could not be queued', err instanceof Error ? err.name : 'error');
    return null;
  }
}

// The fee reminder, to the family's guardians. Returns how many were queued: none means "use email".
export function tellFeeReminder(db: Sql, queue: JobQueue, schoolId: string, payer: { familyId: string | null; studentId: string; payerId: string }, r: { kind: string; amountMinor: number; dueDate: string; payUrl: string; today: string }): Promise<Told | null> {
  return quietly(db, async () => tell(db, queue, schoolId, await feeGuardians(db, schoolId, payer), r.kind === 'after_7' ? 'fee_overdue' : 'fee_reminder', { amount: rupees(r.amountMinor), due_date: r.dueDate.split('-').reverse().join('-'), pay_link: r.payUrl }, `fee-reminder:${payer.payerId}:${r.today}`));
}

// A parent has entered a UTR: "we have noted it; the school will verify". Never "paid".
export function tellPaymentInitiated(db: Sql, reportId: string, queue: JobQueue = jobQueue): Promise<Told | null> {
  return quietly(db, async () => {
    const r = (await db.query(`select r.school_id, r.utr, r.amount_minor, k.family_id, k.student_id from payment_reports r join payment_links k on k.school_id = r.school_id and k.link_id = r.link_id where r.report_id = $1`, [reportId])).rows[0];
    if (!r) return { queued: 0, held: 0 };
    return tell(db, queue, r.school_id, await feeGuardians(db, r.school_id, { familyId: r.family_id, studentId: r.student_id }), 'fee_payment_initiated', { amount: rupees(Number(r.amount_minor)), utr_last4: String(r.utr).slice(-4) }, `fee-initiated:${reportId}`);
  });
}

// A receipt has been issued through the ledger door: the family is told its number and the amount.
export function tellReceipt(db: Sql, r: { schoolId: string; familyId: string | null; studentId: string; receiptId: string; receiptNo: string; amountMinor: number }, queue: JobQueue = jobQueue): Promise<Told | null> {
  return quietly(db, async () => tell(db, queue, r.schoolId, await feeGuardians(db, r.schoolId, r), 'fee_receipt', { amount: rupees(r.amountMinor), receipt_no: r.receiptNo }, `fee-receipt:${r.receiptId}`));
}
