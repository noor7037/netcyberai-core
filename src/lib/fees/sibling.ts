import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import { FINANCE } from './structures';

// The sibling rule (docs/23 6e, C168). A school may set one: which children
// of a family get a concession, on which heads, and how much. The app only
// proposes: from family links the office has confirmed (a student's
// family), never from a guess. A person approves each one before it applies
// to anything. When a brother or sister leaves, the concession of a child
// who no longer qualifies is ended from that day; dues already raised keep
// what they were raised with.

export type SiblingRule = { percent: number; child: 'younger' | 'third_onwards'; mandatoryOnly: boolean };
type Actor = { schoolId: string; userId: string; role: StaffRole };

// Null when the school has no sibling rule (the default).
export async function siblingRule(db: Pick<PoolClient, 'query'>, schoolId: string): Promise<SiblingRule | null> {
  const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'fees');
  const v = schema ? (await readSettings(db, schoolId, schema)).effective : {};
  const percent = typeof v.sibling_percent === 'number' ? v.sibling_percent : 0;
  if (v.sibling_enabled !== true || !(percent > 0 && percent <= 100)) return null;
  return { percent: Math.round(percent * 100) / 100, child: v.sibling_child === 'third_onwards' ? 'third_onwards' : 'younger', mandatoryOnly: v.sibling_heads !== 'all' };
}

// Which children of a family the rule covers. `elderRank` 1 is the eldest
// child on the rolls. A family with one child on the rolls has no sibling.
export function ruleCovers(rule: SiblingRule, elderRank: number, childrenOnRolls: number): boolean {
  if (childrenOnRolls < 2) return false;
  return elderRank >= (rule.child === 'third_onwards' ? 3 : 2);
}

export type SiblingSync = { proposed: number; ended: number };

// Bring the rule's concessions in line with the families as they are today:
// propose for a covered child who has none, end for a child who is no
// longer covered. Safe to run any number of times. Runs for the caller's
// own school, as one of the finance roles. A proposal counts from the first
// of the month it is made in, so once approved it covers that month's dues
// if they are raised after the approval.
export async function applySiblingRule(db: PoolClient, actor: Actor, today: string): Promise<SiblingSync> {
  if (!FINANCE.includes(actor.role)) return { proposed: 0, ended: 0 };
  const rule = await siblingRule(db, actor.schoolId);
  const children = (await db.query(`select family_id, student_id, elder_rank, children from fee_family_children() where school_id = $1`, [actor.schoolId])).rows as { family_id: string; student_id: string; elder_rank: number; children: number }[];
  const covered = new Map(children.filter((c) => rule !== null && ruleCovers(rule, c.elder_rank, c.children)).map((c) => [c.student_id, c]));
  const open = (await db.query(`select concession_id, student_id from fee_concessions where school_id = $1 and source = 'rule' and status in ('proposed', 'approved') for update`, [actor.schoolId])).rows as { concession_id: string; student_id: string }[];

  // A child who no longer qualifies (a sibling left, the family link was removed, or the rule was switched off).
  const toEnd = open.filter((c) => !covered.has(c.student_id));
  if (toEnd.length > 0) {
    await db.query(`update fee_concessions set status = 'ended', valid_to = greatest($3::date, valid_from), decided_at = now(), approved_by = coalesce(approved_by, $4) where school_id = $1 and concession_id = any($2::uuid[])`, [actor.schoolId, toEnd.map((c) => c.concession_id), today, actor.userId]);
  }
  const has = new Set(open.map((c) => c.student_id));
  const toPropose = [...covered.values()].filter((c) => !has.has(c.student_id));
  if (rule && toPropose.length > 0) {
    await db.query(
      `insert into fee_concessions (school_id, student_id, family_id, head_id, kind, percent_off, reason, status, source, mandatory_only, valid_from)
       select $1, n.student_id, n.family_id, null, 'sibling', $2, 'Sibling rule: child ' || n.elder_rank || ' of ' || n.children || ' in the family', 'proposed', 'rule', $3, $4
         from unnest($5::uuid[], $6::uuid[], $7::int[], $8::int[]) as n(student_id, family_id, elder_rank, children)
       on conflict (school_id, student_id) where source = 'rule' and status in ('proposed', 'approved') do nothing`,
      [actor.schoolId, rule.percent, rule.mandatoryOnly, `${today.slice(0, 7)}-01`, toPropose.map((c) => c.student_id), toPropose.map((c) => c.family_id), toPropose.map((c) => c.elder_rank), toPropose.map((c) => c.children)]
    );
  }
  const result = { proposed: rule ? toPropose.length : 0, ended: toEnd.length };
  if (result.proposed > 0 || result.ended > 0) await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'fees.sibling_rule_applied', targetType: 'fee_concessions', targetId: undefined, beforeState: undefined, afterState: { ...result, rule } });
  return result;
}
