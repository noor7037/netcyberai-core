import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { MAX_MINOR } from './money';
import { FINANCE } from './structures';

// Concessions and the RTE tag (docs/23 6b, C159). Every concession is a
// person's decision: one of the finance roles proposes it with a reason,
// and the principal or the school admin approves it. Nothing is conceded
// until then, and a concession is ended, never deleted. Dues already raised
// keep the amounts they were raised with.

export const CONCESSION_KINDS = ['sibling', 'staff_ward', 'negotiated', 'hardship', 'scholarship'] as const; // 'rte' comes from the student's RTE tag, not from a concession row
export type ConcessionKind = (typeof CONCESSION_KINDS)[number];
const APPROVERS: readonly string[] = ['principal', 'school_admin'];
type Actor = { schoolId: string; userId: string; role: StaffRole };

export type Concession = { concession_id: string; student_id: string; student_name: string; class_name: string | null; head_name: string | null; kind: string; percent_off: number | null; amount_off_minor: number | null; reason: string; status: 'proposed' | 'approved' | 'ended'; valid_from: string; valid_to: string | null };

export async function listConcessions(db: PoolClient, schoolId: string): Promise<Concession[]> {
  const { rows } = await db.query(
    `select c.concession_id, c.student_id, st.name as student_name, cl.name as class_name, h.name as head_name, c.kind, c.percent_off::float8 as percent_off, c.amount_off_minor, c.reason, c.status, c.valid_from::text as valid_from, c.valid_to::text as valid_to
       from fee_concessions c
       join fee_billing_students() st on st.school_id = c.school_id and st.student_id = c.student_id
       left join classes cl on cl.school_id = st.school_id and cl.class_id = st.class_id
       left join fee_heads h on h.school_id = c.school_id and h.head_id = c.head_id
      where c.school_id = $1
      order by case c.status when 'proposed' then 0 when 'approved' then 1 else 2 end, c.created_at desc limit 200`,
    [schoolId]
  );
  return rows.map((r) => ({ ...r, amount_off_minor: r.amount_off_minor === null ? null : Number(r.amount_off_minor) }));
}

export type ProposeInput = { studentId: string; headId: string | null; kind: ConcessionKind; percentOff: number | null; amountOffMinor: number | null; reason: string; validFrom: string; validTo: string | null };
export type ConcessionResult = { ok: true; concessionId: string } | { ok: false; reason: 'not_allowed' | 'unknown_student' | 'unknown_head' | 'measure' | 'reason' | 'dates' | 'not_found' | 'not_proposed' | 'own_proposal' };

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export async function proposeConcession(db: PoolClient, actor: Actor, input: ProposeInput): Promise<ConcessionResult> {
  if (!FINANCE.includes(actor.role) || !CONCESSION_KINDS.includes(input.kind)) return { ok: false, reason: 'not_allowed' };
  const reason = input.reason.trim().replace(/\s+/g, ' ');
  if (!reason || reason.length > 300) return { ok: false, reason: 'reason' };
  const percent = input.percentOff;
  const amount = input.amountOffMinor;
  // Exactly one: a percentage (to two decimals, up to 100) or an amount in whole paise.
  if ((percent === null) === (amount === null)) return { ok: false, reason: 'measure' };
  if (percent !== null && !(percent > 0 && percent <= 100 && Math.round(percent * 100) === percent * 100)) return { ok: false, reason: 'measure' };
  if (amount !== null && !(Number.isInteger(amount) && amount > 0 && amount <= MAX_MINOR)) return { ok: false, reason: 'measure' };
  if (!isDate(input.validFrom) || (input.validTo !== null && (!isDate(input.validTo) || input.validTo < input.validFrom))) return { ok: false, reason: 'dates' };
  if (!(await db.query(`select 1 from fee_billing_students() where school_id = $1 and student_id = $2`, [actor.schoolId, input.studentId])).rows[0]) return { ok: false, reason: 'unknown_student' };
  if (input.headId && !(await db.query(`select 1 from fee_heads where school_id = $1 and head_id = $2`, [actor.schoolId, input.headId])).rows[0]) return { ok: false, reason: 'unknown_head' };
  const made = await db.query(
    `insert into fee_concessions (school_id, student_id, head_id, kind, percent_off, amount_off_minor, reason, status, proposed_by, valid_from, valid_to)
     values ($1, $2, $3, $4, $5, $6, $7, 'proposed', $8, $9, $10) returning concession_id`,
    [actor.schoolId, input.studentId, input.headId, input.kind, percent, amount, reason, actor.userId, input.validFrom, input.validTo]
  );
  const id = made.rows[0].concession_id as string;
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'fees.concession_proposed', targetType: 'fee_concessions', targetId: id, beforeState: undefined, afterState: { studentId: input.studentId, kind: input.kind, percentOff: percent, amountOffMinor: amount, validFrom: input.validFrom } });
  return { ok: true, concessionId: id };
}

// Approve (the principal or the school admin, and never the person who
// proposed it), or end an approved one from a date. Ending leaves dues
// already raised as they are.
export async function decideConcession(db: PoolClient, actor: Actor, concessionId: string, action: 'approve' | 'reject' | 'end', today: string): Promise<ConcessionResult> {
  if (!APPROVERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const row = (await db.query(`select status, proposed_by, valid_from::text as valid_from from fee_concessions where school_id = $1 and concession_id = $2 for update`, [actor.schoolId, concessionId])).rows[0];
  if (!row) return { ok: false, reason: 'not_found' };
  if (action === 'end') {
    if (row.status !== 'approved') return { ok: false, reason: 'not_proposed' };
    await db.query(`update fee_concessions set status = 'ended', valid_to = greatest($3::date, valid_from), decided_at = now() where school_id = $1 and concession_id = $2`, [actor.schoolId, concessionId, today]);
  } else {
    if (row.status !== 'proposed') return { ok: false, reason: 'not_proposed' };
    if (action === 'approve' && row.proposed_by === actor.userId) return { ok: false, reason: 'own_proposal' };
    if (action === 'approve') await db.query(`update fee_concessions set status = 'approved', approved_by = $3, decided_at = now() where school_id = $1 and concession_id = $2`, [actor.schoolId, concessionId, actor.userId]);
    // A rejected proposal is ended on the day it would have begun: it never applied.
    else await db.query(`update fee_concessions set status = 'ended', approved_by = $3, valid_to = valid_from, decided_at = now() where school_id = $1 and concession_id = $2`, [actor.schoolId, concessionId, actor.userId]);
  }
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: `fees.concession_${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'ended'}`, targetType: 'fee_concessions', targetId: concessionId, beforeState: { status: row.status }, afterState: { action } });
  return { ok: true, concessionId };
}

export type RteResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'unknown_student' | 'details' };

// The RTE tag (D4, tagging only): a child admitted under RTE Section
// 12(1)(c). Set by the principal or the school admin. From then on the
// child's mandatory heads are raised and conceded in full as "rte".
export async function setRteTag(db: PoolClient, actor: Actor, input: { studentId: string; rte: boolean; entryClass: string | null; admittedOn: string | null }): Promise<RteResult> {
  if (!APPROVERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const entryClass = input.rte ? (input.entryClass ?? '').trim().slice(0, 40) || null : null;
  const admittedOn = input.rte ? input.admittedOn : null;
  if (input.rte && (!entryClass || !isDate(admittedOn))) return { ok: false, reason: 'details' };
  const before = (await db.query(`select rte_admission, rte_entry_class, rte_admitted_on::text as rte_admitted_on from students where school_id = $1 and student_id = $2 for update`, [actor.schoolId, input.studentId])).rows[0];
  if (!before) return { ok: false, reason: 'unknown_student' };
  await db.query(`update students set rte_admission = $3, rte_entry_class = $4, rte_admitted_on = $5 where school_id = $1 and student_id = $2`, [actor.schoolId, input.studentId, input.rte, entryClass, admittedOn]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: input.rte ? 'student.rte_tagged' : 'student.rte_untagged', targetType: 'students', targetId: input.studentId, beforeState: before, afterState: { rte_admission: input.rte, rte_entry_class: entryClass, rte_admitted_on: admittedOn } });
  return { ok: true };
}
