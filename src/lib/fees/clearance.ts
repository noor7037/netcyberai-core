import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { FINANCE } from './structures';

// The fee clearance gate (docs/23 6g, C179). A transfer or leaving
// certificate is held while the student has fees unpaid, unless a named
// person (the principal or the school admin) lets it through with a reason.
//
// feeClearance() is the gate: whatever issues such a certificate asks it
// first. Certificates inside the app are not built yet (the free tool on
// the website is separate and knows no student), so today the answer is
// shown at the fee counter, and nothing else calls it.
//
// An override covers what was owed when it was made. If more falls due
// afterwards, the student is held again.

type Actor = { schoolId: string; userId: string; role: StaffRole };
export type Clearance = { owedMinor: number; cleared: boolean; override: { reason: string; by: string | null; on: string; owedMinor: number } | null };

export async function feeClearance(db: PoolClient, schoolId: string, studentId: string): Promise<Clearance | null> {
  if (!(await db.query(`select 1 from fee_billing_students() where school_id = $1 and student_id = $2`, [schoolId, studentId])).rows[0]) return null;
  const owedMinor = Number((await db.query(`select coalesce(sum(l.amount_minor - coalesce((select sum(p.amount_minor) from payments p where p.fee_id = l.fee_id), 0)), 0) as owed from fees_ledger l where l.school_id = $1 and l.student_id = $2`, [schoolId, studentId])).rows[0].owed);
  const o = (await db.query(`select o.reason, u.display_name as by, (o.decided_at at time zone 'Asia/Kolkata')::date::text as on, o.owed_minor from fee_clearance_overrides o left join users u on u.user_id = o.decided_by where o.school_id = $1 and o.student_id = $2 order by o.decided_at desc limit 1`, [schoolId, studentId])).rows[0];
  const override = o ? { reason: o.reason as string, by: (o.by as string | null) ?? null, on: o.on as string, owedMinor: Number(o.owed_minor) } : null;
  return { owedMinor, cleared: owedMinor <= 0 || (override !== null && override.owedMinor >= owedMinor), override };
}

export type OverrideResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'unknown_student' | 'reason' | 'nothing_owed' };
export async function overrideClearance(db: PoolClient, actor: Actor, studentId: string, reasonRaw: string): Promise<OverrideResult> {
  if (actor.role !== 'principal' && actor.role !== 'school_admin') return { ok: false, reason: 'not_allowed' };
  const reason = reasonRaw.trim().replace(/\s+/g, ' ').slice(0, 300);
  if (!reason) return { ok: false, reason: 'reason' };
  const now = await feeClearance(db, actor.schoolId, studentId);
  if (!now) return { ok: false, reason: 'unknown_student' };
  if (now.owedMinor <= 0) return { ok: false, reason: 'nothing_owed' };
  const made = await db.query(`insert into fee_clearance_overrides (school_id, student_id, owed_minor, reason, decided_by) values ($1, $2, $3, $4, $5) returning override_id`, [actor.schoolId, studentId, now.owedMinor, reason, actor.userId]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'fees.clearance_overridden', targetType: 'fee_clearance_overrides', targetId: made.rows[0].override_id, beforeState: undefined, afterState: { studentId, owedMinor: now.owedMinor, reason } });
  return { ok: true };
}
export const mayReadClearance = (role: StaffRole) => FINANCE.includes(role);
