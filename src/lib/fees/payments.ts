import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { nextNumber } from '@/lib/frameworks/numbering';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import { FINANCE } from './structures';

// Payments at the counter, receipts and reversals (docs/23 6c, C160).
//
//   - Money received is put against dues: the oldest first, or the dues the
//     office picks. Each due it touches gets one payment row; together they
//     are one numbered receipt.
//   - Payments are append-only. A mistake is corrected by reversing the
//     whole receipt, with a reason: each of its payments gets an opposite
//     row. The receipt number is never used again.
//   - More than is owed is refused. (An advance is not taken in this slice.)
//
// The balance rule (docs/23 §3 rule 2): for every due, net − payments =
// balance ≥ 0; reconcile() checks it for the whole school in one query.

// 'online' is a receipt made from a payment provider's notice, never at the counter.
export const COUNTER_METHODS = ['cash', 'upi', 'cheque', 'card', 'netbanking'] as const;
export type Method = (typeof COUNTER_METHODS)[number];
const REVERSERS: readonly string[] = ['principal', 'school_admin'];
export const DEFAULT_RECEIPT_FORMAT = 'RCP-{YYYY}-{SEQ:5}';
type Actor = { schoolId: string; userId: string; role: StaffRole };

export type OpenDue = { fee_id: string; student_id: string; student_name: string; head_name: string | null; period_key: string | null; is_late_fee: boolean; overdue: boolean; due_date: string; net_minor: number; paid_minor: number; balance_minor: number };

const OPEN_DUES = `select l.fee_id, l.student_id, st.name as student_name, h.name as head_name, l.period_key, l.late_fee_for is not null as is_late_fee, (l.status::text = 'overdue' or l.due_date < (now() at time zone 'Asia/Kolkata')::date) as overdue, l.due_date::text as due_date, l.amount_minor as net_minor,
         coalesce((select sum(p.amount_minor) from payments p where p.fee_id = l.fee_id), 0) as paid_minor
    from fees_ledger l
    join fee_billing_students() st on st.school_id = l.school_id and st.student_id = l.student_id
    left join fee_heads h on h.school_id = l.school_id and h.head_id = l.head_id`;
const asDue = (r: Record<string, unknown>): OpenDue => ({ ...(r as unknown as OpenDue), net_minor: Number(r.net_minor), paid_minor: Number(r.paid_minor), balance_minor: Number(r.net_minor) - Number(r.paid_minor) });

// The dues with something still owed, oldest first: of one student, or of
// every child of that student's family.
export async function openDues(db: PoolClient, schoolId: string, studentId: string, scope: 'student' | 'family'): Promise<OpenDue[]> {
  const { rows } = await db.query(
    `${OPEN_DUES}
      where l.school_id = $1
        and (l.student_id = $2 or ($3 and st.family_id is not null and st.family_id = (select family_id from fee_billing_students() where school_id = $1 and student_id = $2)))
      order by l.due_date, l.created_at, l.fee_id`,
    [schoolId, studentId, scope === 'family']
  );
  return rows.map(asDue).filter((d) => d.balance_minor > 0);
}

// Where an amount goes when nobody chooses: the oldest due first, each
// filled before the next. Whole paise.
export function allocateOldestFirst(amountMinor: number, dues: readonly Pick<OpenDue, 'fee_id' | 'balance_minor'>[]): { feeId: string; amountMinor: number }[] {
  const out: { feeId: string; amountMinor: number }[] = [];
  let left = amountMinor;
  for (const d of dues) {
    if (left <= 0) break;
    const take = Math.min(left, d.balance_minor);
    if (take > 0) out.push({ feeId: d.fee_id, amountMinor: take });
    left -= take;
  }
  return out;
}

export type TakeInput = { studentId: string; scope: 'student' | 'family'; amountMinor: number; method: Method; reference: string | null; allocations: { feeId: string; amountMinor: number }[] | null; clientRef?: string | null };
export type TakeResult =
  | { ok: true; receiptId: string; receiptNo: string; payments: { feeId: string; amountMinor: number }[]; replayed: boolean }
  | { ok: false; reason: 'not_allowed' | 'amount' | 'method' | 'unknown_student' | 'nothing_owed' | 'more_than_owed' | 'bad_allocation' };

export async function receiptFormat(db: PoolClient, schoolId: string): Promise<string> {
  const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'fees');
  const v = schema ? (await readSettings(db, schoolId, schema)).effective.receipt_no_format : undefined;
  return typeof v === 'string' && v.includes('{SEQ:') ? v : DEFAULT_RECEIPT_FORMAT;
}

export async function takePayment(db: PoolClient, actor: Actor, input: TakeInput): Promise<TakeResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) return { ok: false, reason: 'amount' };
  if (!COUNTER_METHODS.includes(input.method)) return { ok: false, reason: 'method' };
  const student = (await db.query(`select family_id from fee_billing_students() where school_id = $1 and student_id = $2`, [actor.schoolId, input.studentId])).rows[0];
  if (!student) return { ok: false, reason: 'unknown_student' };
  // One payer at a time: two counters taking money for the same family wait for each other.
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`pay:${actor.schoolId}:${student.family_id ?? input.studentId}`]);
  // The same press of the button arriving twice (a double tap, a retry after a lost answer) is one receipt.
  if (input.clientRef) {
    const before = (await db.query(`select receipt_id, receipt_no from receipts where school_id = $1 and client_ref = $2`, [actor.schoolId, input.clientRef])).rows[0];
    if (before) {
      const paid = (await db.query(`select fee_id, amount_minor from payments where school_id = $1 and receipt_id = $2 and reverses_payment_id is null`, [actor.schoolId, before.receipt_id])).rows;
      return { ok: true, receiptId: before.receipt_id, receiptNo: before.receipt_no, payments: paid.map((p) => ({ feeId: p.fee_id as string, amountMinor: Number(p.amount_minor) })), replayed: true };
    }
  }
  const dues = await openDues(db, actor.schoolId, input.studentId, input.scope);
  const owed = dues.reduce((s, d) => s + d.balance_minor, 0);
  if (owed === 0) return { ok: false, reason: 'nothing_owed' };
  if (input.amountMinor > owed) return { ok: false, reason: 'more_than_owed' };

  let parts: { feeId: string; amountMinor: number }[];
  if (input.allocations) {
    // The office picked the dues: each must be one of this payer's open dues, no more than its balance, and together exactly the amount.
    const byId = new Map(dues.map((d) => [d.fee_id, d]));
    parts = input.allocations.filter((a) => a.amountMinor > 0);
    const seen = new Set<string>();
    for (const a of parts) {
      const due = byId.get(a.feeId);
      if (!due || seen.has(a.feeId) || !Number.isInteger(a.amountMinor) || a.amountMinor > due.balance_minor) return { ok: false, reason: 'bad_allocation' };
      seen.add(a.feeId);
    }
    if (parts.reduce((s, a) => s + a.amountMinor, 0) !== input.amountMinor) return { ok: false, reason: 'bad_allocation' };
  } else {
    parts = allocateOldestFirst(input.amountMinor, dues);
  }

  const receiptNo = await nextNumber(db, actor.schoolId, 'receipt', await receiptFormat(db, actor.schoolId));
  const reference = (input.reference ?? '').trim().slice(0, 80) || null;
  const made = await db.query(
    `insert into receipts (school_id, receipt_no, student_id, family_id, total_minor, method, reference, allocation, issued_by, client_ref)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning receipt_id`,
    [actor.schoolId, receiptNo, input.studentId, input.scope === 'family' ? student.family_id : null, input.amountMinor, input.method, reference, input.allocations ? 'chosen' : 'oldest_first', actor.userId, input.clientRef ?? null]
  );
  const receiptId = made.rows[0].receipt_id as string;
  await db.query(
    `insert into payments (school_id, fee_id, amount_minor, method, received_by, receipt_id, gateway)
     select $1, n.fee_id, n.amount_minor, $2, $3, $4, 'counter' from unnest($5::uuid[], $6::bigint[]) as n(fee_id, amount_minor)`,
    [actor.schoolId, input.method, actor.userId, receiptId, parts.map((p) => p.feeId), parts.map((p) => p.amountMinor)]
  );
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'fees.payment_taken', targetType: 'receipts', targetId: receiptId, beforeState: undefined, afterState: { receiptNo, studentId: input.studentId, scope: input.scope, totalMinor: input.amountMinor, method: input.method, allocation: input.allocations ? 'chosen' : 'oldest_first', dues: parts.length } });
  return { ok: true, receiptId, receiptNo, payments: parts, replayed: false };
}

export type ReverseResult = { ok: true; reversed: number } | { ok: false; reason: 'not_allowed' | 'reason' | 'not_found' | 'already_reversed' };

// Reverse a whole receipt: every payment on it gets an opposite row. The
// receipt stays, marked reversed with the reason, and its number is not
// used again.
export async function reverseReceipt(db: PoolClient, actor: Actor, receiptId: string, reason: string): Promise<ReverseResult> {
  if (!REVERSERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const why = reason.trim().replace(/\s+/g, ' ');
  if (!why || why.length > 300) return { ok: false, reason: 'reason' };
  const receipt = (await db.query(`select receipt_no, reversed_at from receipts where school_id = $1 and receipt_id = $2 for update`, [actor.schoolId, receiptId])).rows[0];
  if (!receipt) return { ok: false, reason: 'not_found' };
  if (receipt.reversed_at) return { ok: false, reason: 'already_reversed' };
  const undone = await db.query(
    `insert into payments (school_id, fee_id, amount_minor, method, received_by, receipt_id, reverses_payment_id, gateway)
     select p.school_id, p.fee_id, -p.amount_minor, 'adjustment', $3, p.receipt_id, p.payment_id, p.gateway
       from payments p where p.school_id = $1 and p.receipt_id = $2 and p.reverses_payment_id is null
     returning payment_id`,
    [actor.schoolId, receiptId, actor.userId]
  );
  await db.query(`update receipts set reversed_at = now(), reversed_by = $3, reversal_reason = $4 where school_id = $1 and receipt_id = $2`, [actor.schoolId, receiptId, actor.userId, why]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'fees.receipt_reversed', targetType: 'receipts', targetId: receiptId, beforeState: { receiptNo: receipt.receipt_no }, afterState: { reason: why, payments: undone.rows.length } });
  return { ok: true, reversed: undone.rows.length };
}

export type ReceiptView = { receipt_id: string; receipt_no: string; issued_at: string; total_minor: number; method: string; reference: string | null; allocation: string; student_name: string; class_name: string | null; family_code: string | null; issued_by_name: string | null; reversed_at: string | null; reversal_reason: string | null; lines: { student_name: string; head_name: string | null; period_key: string | null; is_late_fee: boolean; amount_minor: number }[] };

const RECEIPT = `select r.receipt_id, r.receipt_no, r.issued_at, r.total_minor, r.method, r.reference, r.allocation, st.name as student_name, c.name as class_name, f.family_code, u.display_name as issued_by_name, r.reversed_at, r.reversal_reason,
         coalesce((select jsonb_agg(jsonb_build_object('student_name', ps.name, 'head_name', h.name, 'period_key', l.period_key, 'is_late_fee', l.late_fee_for is not null, 'amount_minor', p.amount_minor) order by l.due_date, l.created_at)
                     from payments p join fees_ledger l on l.fee_id = p.fee_id join fee_billing_students() ps on ps.student_id = l.student_id left join fee_heads h on h.head_id = l.head_id
                    where p.school_id = r.school_id and p.receipt_id = r.receipt_id and p.reverses_payment_id is null), '[]'::jsonb) as lines
    from receipts r
    join fee_billing_students() st on st.school_id = r.school_id and st.student_id = r.student_id
    left join classes c on c.school_id = st.school_id and c.class_id = st.class_id
    left join families f on f.school_id = r.school_id and f.family_id = r.family_id
    left join users u on u.school_id = r.school_id and u.user_id = r.issued_by`;
const asReceipt = (r: Record<string, unknown>): ReceiptView => ({ ...(r as unknown as ReceiptView), total_minor: Number(r.total_minor), lines: (r.lines as ReceiptView['lines']).map((l) => ({ ...l, amount_minor: Number(l.amount_minor) })) });

export async function getReceipt(db: PoolClient, schoolId: string, receiptId: string): Promise<ReceiptView | null> {
  const { rows } = await db.query(`${RECEIPT} where r.school_id = $1 and r.receipt_id = $2`, [schoolId, receiptId]);
  return rows[0] ? asReceipt(rows[0]) : null;
}
export async function recentReceipts(db: PoolClient, schoolId: string, limit = 20): Promise<ReceiptView[]> {
  return (await db.query(`${RECEIPT} where r.school_id = $1 order by r.issued_at desc limit $2`, [schoolId, limit])).rows.map(asReceipt);
}

// The reconciliation rule for the whole school, as one query. `problems`
// must be empty: a due paid beyond its net, or below zero; a line that does
// not add up; a receipt whose payments do not sum to its total (or, once
// reversed, to zero).
export type Reconciliation = { dues: number; grossMinor: number; concessionMinor: number; netMinor: number; paidMinor: number; balanceMinor: number; problems: { kind: string; id: string }[] };
export async function reconcile(db: PoolClient, schoolId: string): Promise<Reconciliation> {
  const totals = (await db.query(
    `select count(*)::int as dues, coalesce(sum(l.gross_minor), 0) as gross, coalesce(sum(l.concession_minor), 0) as concession, coalesce(sum(l.amount_minor), 0) as net,
            coalesce(sum(paid.minor), 0) as paid
       from fees_ledger l left join lateral (select coalesce(sum(p.amount_minor), 0) as minor from payments p where p.fee_id = l.fee_id) paid on true
      where l.school_id = $1`,
    [schoolId]
  )).rows[0];
  const problems = (await db.query(
    `select 'due_paid_out_of_range' as kind, l.fee_id::text as id from fees_ledger l
      where l.school_id = $1 and (select coalesce(sum(p.amount_minor), 0) from payments p where p.fee_id = l.fee_id) not between 0 and l.amount_minor
     union all
     select 'due_does_not_add_up', l.fee_id::text from fees_ledger l where l.school_id = $1 and l.gross_minor - l.concession_minor <> l.amount_minor
     union all
     select 'receipt_does_not_match_payments', r.receipt_id::text from receipts r
      where r.school_id = $1 and (select coalesce(sum(p.amount_minor), 0) from payments p where p.receipt_id = r.receipt_id) <> case when r.reversed_at is null then r.total_minor else 0 end`,
    [schoolId]
  )).rows as { kind: string; id: string }[];
  const n = (v: unknown) => Number(v);
  return { dues: totals.dues, grossMinor: n(totals.gross), concessionMinor: n(totals.concession), netMinor: n(totals.net), paidMinor: n(totals.paid), balanceMinor: n(totals.net) - n(totals.paid), problems };
}
