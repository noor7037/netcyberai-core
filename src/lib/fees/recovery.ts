import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { indiaDate, isIsoDate } from '@/lib/time/india';
import { proposeConcession } from './concessions';
import { FINANCE } from './structures';

// Fee recovery, the minimal loop (docs/23 6g, C178).
//
//   - The follow-up list: every family (or lone child) with a fee past its
//     date and money still owed: how much, how old, and the last thing the
//     office did. It is the office's list. It is never shown to teachers,
//     and it ranks nobody: it is ordered by how long the oldest due has waited.
//   - A call is a note. A promise to pay has a date. Hardship asks a person
//     to decide a concession: it PROPOSES one for each child who owes, and
//     nothing is conceded until someone other than the proposer approves.
//   - While a promise or a hardship is open, the family gets no reminder.
//   - The refund list: money that arrived and could not be applied. The
//     school gives it back by hand; the app only records that it did.

type Actor = { schoolId: string; userId: string; role: StaffRole };
const clean = (raw: unknown) => (typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ').slice(0, 300) : '');
const PAYER_KEY = `coalesce(st.family_id, st.student_id)`;

export type FollowUpRow = {
  student_id: string; // any one child of the family: what the office's actions are recorded against
  payer: string;
  children: number;
  overdue_minor: number;
  oldest_due: string;
  days_overdue: number;
  last_kind: 'call' | 'promise' | 'hardship' | null;
  last_note: string | null;
  last_on: string | null;
  last_by: string | null;
  promise_id: string | null;
  promise_date: string | null;
  promise_passed: boolean;
  hardship_id: string | null;
};

export async function followUpList(db: PoolClient, schoolId: string): Promise<FollowUpRow[]> {
  const { rows } = await db.query(
    `with owed as (
       select ${PAYER_KEY} as payer_id, (array_agg(st.student_id order by st.name, st.student_id))[1] as student_id,
              max(f.family_code) as family_code, (array_agg(st.name order by st.name, st.student_id))[1] as first_child, count(distinct st.student_id)::int as children,
              sum(l.amount_minor - coalesce(p.paid, 0)) as overdue_minor, min(l.due_date) as oldest_due
         from fees_ledger l
         join fee_billing_students() st on st.school_id = l.school_id and st.student_id = l.student_id
         left join families f on f.school_id = st.school_id and f.family_id = st.family_id
         left join lateral (select sum(amount_minor) as paid from payments p where p.fee_id = l.fee_id) p on true
        where l.school_id = $1 and l.due_date < (now() at time zone 'Asia/Kolkata')::date and l.amount_minor - coalesce(p.paid, 0) > 0
        group by 1
     )
     select o.student_id, coalesce(o.family_code || ' · ', '') || o.first_child as payer, o.children, o.overdue_minor, o.oldest_due::text as oldest_due,
            ((now() at time zone 'Asia/Kolkata')::date - o.oldest_due)::int as days_overdue,
            last.kind as last_kind, last.note as last_note, (last.created_at at time zone 'Asia/Kolkata')::date::text as last_on, last.by as last_by,
            pr.followup_id as promise_id, pr.promise_date::text as promise_date, coalesce(pr.promise_date < (now() at time zone 'Asia/Kolkata')::date, false) as promise_passed,
            hd.followup_id as hardship_id
       from owed o
       left join lateral (select w.kind, w.note, w.created_at, u.display_name as by from fee_followups w left join users u on u.user_id = w.created_by
                           where w.school_id = $1 and coalesce(w.family_id, w.student_id) = o.payer_id order by w.created_at desc limit 1) last on true
       left join fee_followups pr on pr.school_id = $1 and coalesce(pr.family_id, pr.student_id) = o.payer_id and pr.kind = 'promise' and pr.status = 'open'
       left join fee_followups hd on hd.school_id = $1 and coalesce(hd.family_id, hd.student_id) = o.payer_id and hd.kind = 'hardship' and hd.status = 'open'
      order by o.oldest_due, payer limit 500`,
    [schoolId]
  );
  return rows.map((r) => ({ ...r, overdue_minor: Number(r.overdue_minor) })) as FollowUpRow[];
}

export type FollowUpInput =
  | { kind: 'call'; studentId: string; note: string }
  | { kind: 'promise'; studentId: string; note: string; promiseDate: string }
  | { kind: 'hardship'; studentId: string; note: string; percentOff: number };
export type FollowUpResult = { ok: true; followupId: string; proposed?: number } | { ok: false; reason: 'not_allowed' | 'unknown_student' | 'note' | 'date' | 'percent' | 'already_open' | 'nothing_owed' | 'not_found' };

export async function recordFollowUp(db: PoolClient, actor: Actor, input: FollowUpInput): Promise<FollowUpResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const note = clean(input.note);
  if (!note) return { ok: false, reason: 'note' };
  const today = indiaDate();
  if (input.kind === 'promise' && (!isIsoDate(input.promiseDate) || input.promiseDate < today || input.promiseDate > indiaDate(new Date(Date.now() + 90 * 86400_000)))) return { ok: false, reason: 'date' };
  if (input.kind === 'hardship' && !(input.percentOff > 0 && input.percentOff <= 100 && Math.round(input.percentOff * 100) === input.percentOff * 100)) return { ok: false, reason: 'percent' };
  const student = (await db.query(`select family_id from fee_billing_students() where school_id = $1 and student_id = $2`, [actor.schoolId, input.studentId])).rows[0];
  if (!student) return { ok: false, reason: 'unknown_student' };
  const payerId = (student.family_id as string | null) ?? input.studentId;
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`followup:${actor.schoolId}:${payerId}`]);
  if (input.kind !== 'call' && (await db.query(`select 1 from fee_followups where school_id = $1 and coalesce(family_id, student_id) = $2 and kind = $3 and status = 'open'`, [actor.schoolId, payerId, input.kind])).rows[0]) return { ok: false, reason: 'already_open' };

  // Hardship: a concession is proposed for each child of the family who owes, from the first of this month.
  // Proposed, not given: the approval is another person's (C116).
  let proposed: number | undefined;
  if (input.kind === 'hardship') {
    const children = (await db.query(
      `select distinct st.student_id from fees_ledger l join fee_billing_students() st on st.school_id = l.school_id and st.student_id = l.student_id
        where l.school_id = $1 and ${PAYER_KEY} = $2 and l.amount_minor - coalesce((select sum(p.amount_minor) from payments p where p.fee_id = l.fee_id), 0) > 0`,
      [actor.schoolId, payerId]
    )).rows as { student_id: string }[];
    if (children.length === 0) return { ok: false, reason: 'nothing_owed' };
    for (const c of children) {
      const made = await proposeConcession(db, actor, { studentId: c.student_id, headId: null, kind: 'hardship', percentOff: input.percentOff, amountOffMinor: null, reason: note, validFrom: `${today.slice(0, 8)}01`, validTo: null });
      if (!made.ok) throw new Error(`hardship concession not proposed: ${made.reason}`);
    }
    proposed = children.length;
  }
  const made = await db.query(
    `insert into fee_followups (school_id, family_id, student_id, kind, note, promise_date, status, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8) returning followup_id`,
    [actor.schoolId, student.family_id, input.studentId, input.kind, note, input.kind === 'promise' ? input.promiseDate : null, input.kind === 'call' ? 'closed' : 'open', actor.userId]
  );
  const followupId = made.rows[0].followup_id as string;
  // The audit row says what was done and when a promise falls due; the family's own words stay in the follow-up.
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: `fees.followup_${input.kind}`, targetType: 'fee_followups', targetId: followupId, beforeState: undefined, afterState: { studentId: input.studentId, promiseDate: input.kind === 'promise' ? input.promiseDate : null, percentOff: input.kind === 'hardship' ? input.percentOff : null, concessionsProposed: proposed ?? 0 } });
  return { ok: true, followupId, proposed };
}

// A promise kept, broken or replaced; a hardship decided. Closing it lets reminders start again.
export async function closeFollowUp(db: PoolClient, actor: Actor, followupId: string, noteRaw: string): Promise<FollowUpResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const note = clean(noteRaw);
  if (!note) return { ok: false, reason: 'note' };
  const done = await db.query(`update fee_followups set status = 'closed', closed_by = $3, closed_at = now(), close_note = $4 where school_id = $1 and followup_id = $2 and status = 'open' returning kind`, [actor.schoolId, followupId, actor.userId, note]);
  if (done.rowCount !== 1) return { ok: false, reason: 'not_found' };
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'fees.followup_closed', targetType: 'fee_followups', targetId: followupId, beforeState: { status: 'open' }, afterState: { status: 'closed', kind: done.rows[0].kind } });
  return { ok: true, followupId };
}

export type RefundRow = { evidence_id: string; payer: string; amount_minor: number; source: string; arrived_on: string; receipt_no: string | null; refunded_on: string | null; how: string | null; recorded_by: string | null };
// Money that arrived and could not be applied, newest first: still to give back, then given back.
export async function refundList(db: PoolClient, schoolId: string): Promise<RefundRow[]> {
  const { rows } = await db.query(
    `select v.evidence_id, coalesce(f.family_code || ' · ', '') || st.name as payer, v.unapplied_minor as amount_minor, v.source, (v.created_at at time zone 'Asia/Kolkata')::date::text as arrived_on,
            r.receipt_no, x.refunded_on::text as refunded_on, x.how, u.display_name as recorded_by
       from payment_evidence v
       join payment_links k on k.school_id = v.school_id and k.link_id = v.link_id
       join fee_billing_students() st on st.school_id = k.school_id and st.student_id = k.student_id
       left join families f on f.school_id = k.school_id and f.family_id = k.family_id
       left join receipts r on r.school_id = v.school_id and r.receipt_id = v.receipt_id
       left join fee_refunds x on x.school_id = v.school_id and x.evidence_id = v.evidence_id
       left join users u on u.user_id = x.recorded_by
      where v.school_id = $1 and v.unapplied_minor > 0 and v.mode = 'live'
      order by (x.refund_id is not null), v.created_at desc limit 200`,
    [schoolId]
  );
  return rows.map((r) => ({ ...r, amount_minor: Number(r.amount_minor) })) as RefundRow[];
}

export type RefundResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'how' | 'date' | 'not_found' | 'already_recorded' };
// The school gave the money back, by hand. Recorded once, for the whole amount, by the principal or the school admin.
export async function recordRefund(db: PoolClient, actor: Actor, evidenceId: string, howRaw: string, refundedOn: string): Promise<RefundResult> {
  if (actor.role !== 'principal' && actor.role !== 'school_admin') return { ok: false, reason: 'not_allowed' };
  const how = clean(howRaw);
  if (!how) return { ok: false, reason: 'how' };
  if (!isIsoDate(refundedOn) || refundedOn > indiaDate()) return { ok: false, reason: 'date' };
  const evidence = (await db.query(`select unapplied_minor from payment_evidence where school_id = $1 and evidence_id = $2 and unapplied_minor > 0 and mode = 'live' for update`, [actor.schoolId, evidenceId])).rows[0];
  if (!evidence) return { ok: false, reason: 'not_found' };
  const made = await db.query(`insert into fee_refunds (school_id, evidence_id, amount_minor, how, refunded_on, recorded_by) values ($1, $2, $3, $4, $5, $6) on conflict (evidence_id) do nothing`, [actor.schoolId, evidenceId, evidence.unapplied_minor, how, refundedOn, actor.userId]);
  if (made.rowCount !== 1) return { ok: false, reason: 'already_recorded' };
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'fees.refund_recorded', targetType: 'payment_evidence', targetId: evidenceId, beforeState: undefined, afterState: { amountMinor: Number(evidence.unapplied_minor), refundedOn } });
  return { ok: true };
}
