import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { FREQUENCIES, MAX_MINOR, type Frequency } from './money';

// Fee heads and structures (docs/23 6a, C157). A fee rule is never
// overwritten: a head is added or retired, and a structure gets a new
// version from a date. Dues already raised keep what they were raised with.
//
// Every function runs in the caller's own tenant transaction. RLS lets only
// the principal, the school admin and the accountant read or write these.

export const FINANCE: readonly string[] = ['principal', 'school_admin', 'accountant'];
type Actor = { schoolId: string; userId: string; role: StaffRole };

export type Head = { head_id: string; name: string; is_mandatory: boolean; is_active: boolean };
export type StructureItem = { head_id: string; head_name: string; amount_minor: number; frequency: Frequency };
export type Structure = { structure_id: string; class_id: string; class_name: string; session_id: string | null; academic_year: string; effective_from: string; created_at: string; items: StructureItem[] };

export async function listHeads(db: PoolClient, schoolId: string): Promise<Head[]> {
  return (await db.query(`select head_id, name, is_mandatory, is_active from fee_heads where school_id = $1 order by is_active desc, lower(name)`, [schoolId])).rows;
}

export type HeadResult = { ok: true; head: Head } | { ok: false; reason: 'not_allowed' | 'name' | 'exists' | 'not_found' };

export async function addHead(db: PoolClient, actor: Actor, input: { name: string; isMandatory: boolean }): Promise<HeadResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 60) return { ok: false, reason: 'name' };
  if ((await db.query(`select 1 from fee_heads where school_id = $1 and lower(btrim(name)) = lower($2)`, [actor.schoolId, name])).rows[0]) return { ok: false, reason: 'exists' };
  const made = await db.query(`insert into fee_heads (school_id, name, is_mandatory) values ($1, $2, $3) returning head_id, name, is_mandatory, is_active`, [actor.schoolId, name, input.isMandatory]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'fees.head_added', targetType: 'fee_heads', targetId: made.rows[0].head_id, beforeState: undefined, afterState: { name, isMandatory: input.isMandatory } });
  return { ok: true, head: made.rows[0] };
}

// Retire or bring back a head. Its name never changes: it is on structures already made.
export async function setHeadActive(db: PoolClient, actor: Actor, headId: string, isActive: boolean): Promise<HeadResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const changed = await db.query(`update fee_heads set is_active = $3 where school_id = $1 and head_id = $2 returning head_id, name, is_mandatory, is_active`, [actor.schoolId, headId, isActive]);
  if (!changed.rows[0]) return { ok: false, reason: 'not_found' };
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: isActive ? 'fees.head_restored' : 'fees.head_retired', targetType: 'fee_heads', targetId: headId, beforeState: { isActive: !isActive }, afterState: { isActive } });
  return { ok: true, head: changed.rows[0] };
}

const STRUCTURES = `select f.structure_id, f.class_id, c.name as class_name, f.session_id, f.academic_year, f.effective_from::text as effective_from, f.created_at,
         coalesce((select jsonb_agg(jsonb_build_object('head_id', i.head_id, 'head_name', h.name, 'amount_minor', i.amount_minor, 'frequency', i.frequency) order by lower(h.name))
                     from fee_structure_items i join fee_heads h on h.school_id = i.school_id and h.head_id = i.head_id
                    where i.school_id = f.school_id and i.structure_id = f.structure_id), '[]'::jsonb) as items
    from fee_structures f join classes c on c.school_id = f.school_id and c.class_id = f.class_id`;

// Every version, the newest first within a class and session.
export async function listStructures(db: PoolClient, schoolId: string): Promise<Structure[]> {
  const { rows } = await db.query(`${STRUCTURES} where f.school_id = $1 order by c.name, f.academic_year desc, f.effective_from desc`, [schoolId]);
  return rows.map((r) => ({ ...r, items: (r.items as StructureItem[]).map((i) => ({ ...i, amount_minor: Number(i.amount_minor) })) }));
}

// The version in force for a class on a date: the latest that began on or before it, in that session.
export async function structureInForce(db: PoolClient, schoolId: string, classId: string, sessionId: string, onDate: string): Promise<Structure | null> {
  const { rows } = await db.query(`${STRUCTURES} where f.school_id = $1 and f.class_id = $2 and f.session_id = $3 and f.effective_from <= $4::date order by f.effective_from desc limit 1`, [schoolId, classId, sessionId, onDate]);
  return rows[0] ? { ...rows[0], items: (rows[0].items as StructureItem[]).map((i) => ({ ...i, amount_minor: Number(i.amount_minor) })) } : null;
}

export type NewStructure = { classId: string; sessionId: string; effectiveFrom: string; items: { headId: string; amountMinor: number; frequency: Frequency }[] };
export type StructureResult = { ok: true; structureId: string } | { ok: false; reason: 'not_allowed' | 'unknown_class' | 'unknown_session' | 'outside_session' | 'no_items' | 'bad_item' | 'unknown_head' | 'version_exists' };

// A new version of a class's structure from a date. Nothing earlier is touched.
export async function addStructureVersion(db: PoolClient, actor: Actor, input: NewStructure): Promise<StructureResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!(await db.query(`select 1 from classes where school_id = $1 and class_id = $2`, [actor.schoolId, input.classId])).rows[0]) return { ok: false, reason: 'unknown_class' };
  const session = (await db.query(`select label, start_date::text as start_date, end_date::text as end_date from academic_sessions where school_id = $1 and session_id = $2`, [actor.schoolId, input.sessionId])).rows[0];
  if (!session) return { ok: false, reason: 'unknown_session' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom) || input.effectiveFrom < session.start_date || input.effectiveFrom > session.end_date) return { ok: false, reason: 'outside_session' };
  const items = input.items.filter((i) => i.amountMinor > 0);
  if (items.length === 0) return { ok: false, reason: 'no_items' };
  if (items.some((i) => !Number.isInteger(i.amountMinor) || i.amountMinor > MAX_MINOR || !FREQUENCIES.includes(i.frequency)) || new Set(items.map((i) => i.headId)).size !== items.length) return { ok: false, reason: 'bad_item' };
  const heads = new Set(((await db.query(`select head_id from fee_heads where school_id = $1 and is_active and head_id = any($2::uuid[])`, [actor.schoolId, items.map((i) => i.headId)])).rows as { head_id: string }[]).map((r) => r.head_id));
  if (items.some((i) => !heads.has(i.headId))) return { ok: false, reason: 'unknown_head' };
  if ((await db.query(`select 1 from fee_structures where school_id = $1 and class_id = $2 and academic_year = $3 and effective_from = $4`, [actor.schoolId, input.classId, session.label, input.effectiveFrom])).rows[0]) return { ok: false, reason: 'version_exists' };

  const made = await db.query(`insert into fee_structures (school_id, class_id, academic_year, session_id, effective_from, created_by) values ($1, $2, $3, $4, $5, $6) returning structure_id`, [actor.schoolId, input.classId, session.label, input.sessionId, input.effectiveFrom, actor.userId]);
  const structureId = made.rows[0].structure_id as string;
  await db.query(
    `insert into fee_structure_items (school_id, structure_id, head_id, amount_minor, frequency)
     select $1, $2, n.head_id, n.amount_minor, n.frequency from unnest($3::uuid[], $4::bigint[], $5::text[]) as n(head_id, amount_minor, frequency)`,
    [actor.schoolId, structureId, items.map((i) => i.headId), items.map((i) => i.amountMinor), items.map((i) => i.frequency)]
  );
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'fees.structure_version_added', targetType: 'fee_structures', targetId: structureId, beforeState: undefined, afterState: { classId: input.classId, session: session.label, effectiveFrom: input.effectiveFrom, items: items.length } });
  return { ok: true, structureId };
}
