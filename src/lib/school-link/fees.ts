import type { PoolClient } from 'pg';
import QRCode from 'qrcode';
import { withGuardianContext, withPlatformService, type FamilyClaims } from '@/lib/auth/db';
import type { SchoolFeeClaimResult, SchoolFeeDue, SchoolFeePay, SchoolFeeReceipt, SchoolFeeReminder, SchoolFees } from '@/lib/contracts/school-link';
import { linkFor } from '@/lib/fees/reminders';
import { tellPaymentInitiated } from '@/lib/fees/whatsapp';
import { jobQueue } from '@/lib/jobs/pg-queue';
import type { Sql } from '@/lib/jobs/types';
import { notifyNewReport } from '@/lib/payments/upi-alerts';
import { reportUtr, schoolUpi, upiForPayer } from '@/lib/payments/upi';
import { indiaDate } from '@/lib/time/india';

// Fees in the Family app (W20-A, H1; docs/23 §2, §5; docs/family-app/03 §4).
//   Read: as the guardian the connect code was made for (withGuardianContext), so the school's own parent rules decide
//   every row: own active children with consent only, read only (w20_a_family_fees.sql). The dues are each due's
//   gross, concession and net as the office raised it, less what was paid; the receipts are the child's part of each.
//   Pay: direct UPI to the school's own account, the school's path for a parent with no account (C174), reused as it
//   is: the family's one payment link (C168; made by the reminder's own function when there is none), the school's
//   upi://pay link for its amount and reference, and "I have paid" with the UTR, recorded as a claim the school checks
//   in its own bank (reportUtr). Nothing is credited here. The link's token never leaves the server.
// The guardian's part is checked first, in its own transaction; the platform's part runs after it, for the school and
// payer that part verified, never with request input choosing either.

type Claims = FamilyClaims;
type Payer = { schoolId: string; payerId: string; studentName: string };
const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;

// The child as the school shows them to this guardian, and who pays for them (the family, or the child alone).
async function payerOf(db: PoolClient, schoolId: string, studentId: string): Promise<Payer | null> {
  const r = (
    await db.query(`select s.name, coalesce(s.family_id, s.student_id) as payer_id from students s where s.student_id = $1 and s.student_id = any ((select public.guardian_student_ids())::uuid[])`, [studentId])
  ).rows[0] as { name: string; payer_id: string } | undefined;
  return r ? { schoolId, payerId: r.payer_id, studentName: r.name } : null;
}

async function duesOf(db: PoolClient, studentId: string): Promise<SchoolFeeDue[]> {
  const { rows } = await db.query(
    `select l.fee_id, h.name as head, l.period_key, l.late_fee_for is not null as late_fee, l.due_date::text as due_date,
            (l.status::text = 'overdue' or l.due_date < (now() at time zone 'Asia/Kolkata')::date) as overdue,
            coalesce(l.gross_minor, l.amount_minor) as gross, l.concession_minor as concession, l.amount_minor as net,
            coalesce((select sum(p.amount_minor) from payments p where p.school_id = l.school_id and p.fee_id = l.fee_id), 0) as paid
       from fees_ledger l left join fee_heads h on h.school_id = l.school_id and h.head_id = l.head_id
      where l.student_id = $1
      order by l.due_date, l.created_at, l.fee_id`,
    [studentId]
  );
  return (rows as Record<string, unknown>[])
    .map((r) => {
      const net = Number(r.net);
      const paid = Number(r.paid);
      return { feeId: r.fee_id as string, head: (r.head as string | null) ?? null, period: (r.period_key as string | null) ?? null, lateFee: r.late_fee === true, dueDate: r.due_date as string, overdue: r.overdue === true, grossMinor: Number(r.gross), concessionMinor: Number(r.concession), netMinor: net, paidMinor: paid, balanceMinor: net - paid };
    })
    .filter((d) => d.balanceMinor > 0);
}

// Each receipt with a payment for this child, newest first: the child's part of it (a family receipt may cover siblings).
async function receiptsOf(db: PoolClient, studentId: string): Promise<SchoolFeeReceipt[]> {
  const { rows } = await db.query(
    `select r.receipt_no, r.issued_at, r.method, r.reversed_at is not null as reversed, x.amount
       from receipts r
       join lateral (select sum(p.amount_minor) as amount from payments p join fees_ledger l on l.school_id = p.school_id and l.fee_id = p.fee_id
                      where p.school_id = r.school_id and p.receipt_id = r.receipt_id and p.reverses_payment_id is null and l.student_id = $1) x on x.amount > 0
      order by r.issued_at desc limit 20`,
    [studentId]
  );
  return (rows as Record<string, unknown>[]).map((r) => ({ receiptNo: r.receipt_no as string, issuedAt: new Date(r.issued_at as string).toISOString(), method: r.method as string, amountMinor: Number(r.amount), reversed: r.reversed === true }));
}

// The family's open payment link's token, read by the platform role for the payer the guardian's part verified.
async function openToken(db: Sql, payer: Payer): Promise<string | null> {
  const r = (await db.query(`select token from payment_links where school_id = $1 and coalesce(family_id, student_id) = $2 and status = 'open' and expires_at > now() order by created_at desc limit 1`, [payer.schoolId, payer.payerId])).rows[0];
  return (r?.token as string | undefined) ?? null;
}

async function payView(db: Sql, token: string | null): Promise<SchoolFeePay | null> {
  if (!token) return null;
  const upi = await upiForPayer(db, token);
  if (!upi) return null;
  const amount = Number((await db.query(`select amount_minor from payment_links where token = $1`, [token])).rows[0].amount_minor);
  const qrSvg = await QRCode.toString(upi.uri, { type: 'svg', margin: 1, width: 220 });
  return { payeeName: upi.payeeName, upiId: upi.upiId, amountMinor: amount, reference: upi.reference, uri: upi.uri, qrSvg, claim: upi.report };
}

// What a matched child owes, what was paid, and how to pay. null when the school does not show this child to this guardian.
export async function readFamilyFees(claims: Claims, linkId: string, studentId: string): Promise<SchoolFees | null> {
  const read = await withGuardianContext(claims, linkId, async (db, link) => {
    const payer = await payerOf(db, link.schoolId, studentId);
    if (!payer) return null;
    const dues = await duesOf(db, studentId);
    return { payer, dues, receipts: await receiptsOf(db, studentId) };
  });
  if (!read) return null;
  const { upi, pay } = await platform(async (db) => ({ upi: (await schoolUpi(db, read.payer.schoolId)).enabled, pay: await payView(db, await openToken(db, read.payer)) }));
  return { studentName: read.payer.studentName, dues: read.dues, totalMinor: read.dues.reduce((t, d) => t + d.balanceMinor, 0), receipts: read.receipts, upi, pay };
}

const guardianPayer = (claims: Claims, linkId: string, studentId: string) => withGuardianContext(claims, linkId, (db, link) => payerOf(db, link.schoolId, studentId));

// "Pay by UPI": the family's open link, or a new one for all the family owes (as the nightly reminder makes it). null
// when the child is not this guardian's, the school does not take UPI to its own account, or nothing is owed.
export async function startFamilyPayment(claims: Claims, linkId: string, studentId: string): Promise<SchoolFeePay | null> {
  const payer = await guardianPayer(claims, linkId, studentId);
  if (!payer) return null;
  return platform(async (db) => {
    if (!(await schoolUpi(db, payer.schoolId)).enabled) return null;
    const link = await linkFor(db, payer.schoolId, payer.payerId, 'family_app');
    return link ? payView(db, link.token) : null;
  });
}

// "I have paid", with the UTR: the school's own claim path, with its verifiers told as the payer's page tells them.
export async function claimFamilyPayment(claims: Claims, linkId: string, studentId: string, utr: string): Promise<SchoolFeeClaimResult> {
  const payer = await guardianPayer(claims, linkId, studentId);
  if (!payer) return 'not_found';
  return platform(async (db) => {
    const token = await openToken(db, payer);
    if (!token) return 'not_open';
    const r = await reportUtr(db, token, utr, async (schoolId, reportId) => {
      await notifyNewReport(db, jobQueue, schoolId, reportId, indiaDate());
      await tellPaymentInitiated(db, reportId);
    });
    if (r.ok) return 'recorded';
    return r.reason === 'no_such_link' ? 'not_open' : r.reason;
  });
}

// The fee reminders the office's nightly run sent in the last days for these matched students' dues, for the Family
// app's feed: one item a day, with what is still owed of the dues it reminded about (a reminder fully paid since is left
// out) and their earliest date. Read as the guardian: the school's own rules decide every row. A family with no email is
// told here too: its reminder was held only for want of an address, and the child's consent for messages holds.
export async function readFeeReminderFeed(claims: Claims, linkId: string, studentIds: readonly string[], days: number): Promise<SchoolFeeReminder[]> {
  if (!studentIds.length) return [];
  return withGuardianContext(claims, linkId, async (db) => {
    const { rows } = await db.query(
      `with sent as (
         select r.run_date, l.school_id, l.fee_id, l.due_date, l.amount_minor - coalesce((select sum(p.amount_minor) from payments p where p.school_id = l.school_id and p.fee_id = l.fee_id), 0) as balance
           from fee_reminders r join fees_ledger l on l.school_id = r.school_id and l.fee_id = r.fee_id
          where l.student_id = any ($1::uuid[]) and r.run_date > (now() at time zone 'Asia/Kolkata')::date - $2::int
            and (r.outcome = 'sent'
                 or (r.held_reason = 'no_email'
                     and coalesce((select c.granted from consent_ledger c where c.student_id = l.student_id and c.purpose::text = 'operational_communication' order by c.created_at desc limit 1), false))))
       select s.run_date::text as sent_on, sc.name as school_name, sum(s.balance) as owed, min(s.due_date)::text as due_date
         from sent s join schools sc on sc.school_id = s.school_id
        where s.balance > 0
        group by s.run_date, sc.name
        order by s.run_date desc limit 3`,
      [[...studentIds], days]
    );
    return (rows as { sent_on: string; school_name: string; owed: string; due_date: string }[]).map((r) => ({ id: `${linkId}.${r.sent_on}`, schoolName: r.school_name, amountMinor: Number(r.owed), dueDate: r.due_date, sentOn: r.sent_on }));
  });
}
