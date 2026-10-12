import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import { indiaDate } from '@/lib/time/india';
import type { Frequency } from './money';
import { applySiblingRule } from './sibling';
import { FINANCE, structureInForce } from './structures';

// Raising dues (docs/23 6b, C159). For a class and a month, every head due
// in that month becomes one ledger line per student: gross from the fee
// structure in force on the first of the month, less the student's approved
// concessions, gives the net. Raising the same month twice makes no second
// line. A due is never changed or deleted afterwards.

type Actor = { schoolId: string; userId: string; role: StaffRole };

// ---- The arithmetic, with no database -------------------------------------

export type AppliedConcession = { concessionId: string | null; kind: string; percentOff: number | null; amountOffMinor: number | null };
export type LineAmounts = { grossMinor: number; concessionMinor: number; netMinor: number; detail: { kind: string; minor: number; concessionId: string | null }[] };

// A percentage of an amount in paise, rounded half up to the paisa, in whole
// numbers only: the percentage is taken in hundredths of a percent.
export function percentOfMinor(grossMinor: number, percentOff: number): number {
  const hundredths = Math.round(percentOff * 100);
  return Math.floor((grossMinor * hundredths + 5000) / 10000);
}

// Gross less concessions. RTE takes the whole of a head it covers. Then the
// percentages (each on the gross), then the fixed amounts, in the order
// given; together they never take more than the gross.
export function lineAmounts(grossMinor: number, concessions: readonly AppliedConcession[], rteCovers: boolean): LineAmounts {
  const detail: LineAmounts['detail'] = [];
  let left = grossMinor;
  const take = (kind: string, want: number, concessionId: string | null) => {
    const minor = Math.min(left, Math.max(0, want));
    if (minor > 0) {
      detail.push({ kind, minor, concessionId });
      left -= minor;
    }
  };
  if (rteCovers) take('rte', grossMinor, null);
  for (const c of concessions.filter((x) => x.percentOff !== null)) take(c.kind, percentOfMinor(grossMinor, c.percentOff as number), c.concessionId);
  for (const c of concessions.filter((x) => x.percentOff === null)) take(c.kind, c.amountOffMinor ?? 0, c.concessionId);
  return { grossMinor, concessionMinor: grossMinor - left, netMinor: left, detail };
}

export type SessionDates = { label: string; start_date: string; end_date: string };
const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

// Which period of a head falls due in a month ("2026-07") of a session, or
// null when that head is not due then. Quarters and halves are counted from
// the session's first month. A one-time head is due once, ever.
export function periodKeyFor(frequency: Frequency, month: string, session: SessionDates): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const n = monthIndex(`${month}-01`) - monthIndex(session.start_date);
  if (n < 0 || monthIndex(`${month}-01`) > monthIndex(session.end_date)) return null;
  if (frequency === 'monthly') return month;
  if (frequency === 'quarterly') return n % 3 === 0 ? `${session.label}-Q${n / 3 + 1}` : null;
  if (frequency === 'half_yearly') return n % 6 === 0 ? `${session.label}-H${n / 6 + 1}` : null;
  if (frequency === 'annual') return n === 0 ? session.label : null;
  return n === 0 ? 'once' : null;
}

// ---- With the database ------------------------------------------------------

export async function defaultDueDay(db: PoolClient, schoolId: string): Promise<number> {
  const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'fees');
  const v = schema ? (await readSettings(db, schoolId, schema)).effective.due_day : undefined;
  return typeof v === 'number' && Math.floor(v) >= 1 && Math.floor(v) <= 28 ? Math.floor(v) : 10;
}

export type RaiseResult =
  | { ok: true; raised: number; alreadyThere: number; students: number; grossMinor: number; concessionMinor: number; netMinor: number }
  | { ok: false; reason: 'not_allowed' | 'unknown_class' | 'unknown_session' | 'month_outside_session' | 'due_date' | 'no_structure' | 'nothing_due' };

export async function raiseDues(db: PoolClient, actor: Actor, input: { classId: string; sessionId: string; month: string; dueDate: string }): Promise<RaiseResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!(await db.query(`select 1 from classes where school_id = $1 and class_id = $2`, [actor.schoolId, input.classId])).rows[0]) return { ok: false, reason: 'unknown_class' };
  const session = (await db.query(`select label, start_date::text as start_date, end_date::text as end_date from academic_sessions where school_id = $1 and session_id = $2`, [actor.schoolId, input.sessionId])).rows[0] as SessionDates | undefined;
  if (!session) return { ok: false, reason: 'unknown_session' };
  if (periodKeyFor('monthly', input.month, session) === null) return { ok: false, reason: 'month_outside_session' };
  const monthStart = `${input.month}-01`;
  // The due date is a real date, no earlier than the month it is for and no more than about two months after it.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || Number.isNaN(Date.parse(`${input.dueDate}T00:00:00Z`)) || input.dueDate < monthStart || (Date.parse(`${input.dueDate}T00:00:00Z`) - Date.parse(`${monthStart}T00:00:00Z`)) / 86_400_000 > 92) return { ok: false, reason: 'due_date' };
  // The structure in force on the first of the month; if the session starts mid-month, on its first day.
  const structure = await structureInForce(db, actor.schoolId, input.classId, input.sessionId, monthStart < session.start_date ? session.start_date : monthStart);
  if (!structure) return { ok: false, reason: 'no_structure' };
  const due = structure.items.map((i) => ({ ...i, periodKey: periodKeyFor(i.frequency, input.month, session) })).filter((i) => i.periodKey !== null && i.amount_minor > 0);
  if (due.length === 0) return { ok: false, reason: 'nothing_due' };

  // One class at a time: two people raising the same month wait for each other.
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`dues:${actor.schoolId}:${input.classId}:${input.month}`]);
  const heads = (await db.query(`select head_id, rte_covered, is_mandatory from fee_heads where school_id = $1 and head_id = any($2::uuid[])`, [actor.schoolId, due.map((d) => d.head_id)])).rows as { head_id: string; rte_covered: boolean; is_mandatory: boolean }[];
  const rteCovered = new Map(heads.map((h) => [h.head_id, h.rte_covered]));
  const mandatory = new Map(heads.map((h) => [h.head_id, h.is_mandatory]));
  // The sibling rule is brought up to date first (C168): a child whose brother or sister has left no longer
  // has the concession from today, and a newly covered child gets a proposal (which applies to nothing until approved).
  await applySiblingRule(db, actor, indiaDate());
  // Active students and those still waiting for consent (C162): a child owes fees before the parent's consent
  // is recorded; consent governs messages. Read through the billing function, so the list is the same whoever
  // presses the button (the consent gate hides a waiting student's record from the accountant).
  const students = (await db.query(`select student_id, rte_admission from fee_billing_students() where school_id = $1 and class_id = $2 and status in ('active', 'pending_consent') order by name`, [actor.schoolId, input.classId])).rows as { student_id: string; rte_admission: boolean }[];
  const concessions = (await db.query(
    `select concession_id, student_id, head_id, kind, percent_off::float8 as percent_off, amount_off_minor, mandatory_only
       from fee_concessions
      where school_id = $1 and status = 'approved' and student_id = any($2::uuid[]) and valid_from <= $3::date and (valid_to is null or valid_to >= $3::date)
      order by created_at, concession_id`,
    [actor.schoolId, students.map((s) => s.student_id), monthStart]
  )).rows as { concession_id: string; student_id: string; head_id: string | null; kind: string; percent_off: number | null; amount_off_minor: string | null; mandatory_only: boolean }[];

  const lines: { studentId: string; headId: string; periodKey: string; a: LineAmounts }[] = [];
  for (const s of students) {
    for (const d of due) {
      const mine = concessions.filter((c) => c.student_id === s.student_id && (c.head_id === null || c.head_id === d.head_id) && (!c.mandatory_only || mandatory.get(d.head_id) === true)).map((c) => ({ concessionId: c.concession_id, kind: c.kind, percentOff: c.percent_off, amountOffMinor: c.amount_off_minor === null ? null : Number(c.amount_off_minor) }));
      // RTE covers the heads the school has marked as covered; any other head is charged as for every child.
      lines.push({ studentId: s.student_id, headId: d.head_id, periodKey: d.periodKey as string, a: lineAmounts(d.amount_minor, mine, s.rte_admission && rteCovered.get(d.head_id) === true) });
    }
  }
  if (lines.length === 0) return { ok: true, raised: 0, alreadyThere: 0, students: 0, grossMinor: 0, concessionMinor: 0, netMinor: 0 };
  const inserted = await db.query(
    `insert into fees_ledger (school_id, student_id, head_id, period_key, structure_id, gross_minor, concession_minor, amount_minor, concession_detail, due_date)
     select $1, n.student_id, n.head_id, n.period_key, $2, n.gross, n.concession, n.net, n.detail, $3
       from unnest($4::uuid[], $5::uuid[], $6::text[], $7::bigint[], $8::bigint[], $9::bigint[], $10::jsonb[]) as n(student_id, head_id, period_key, gross, concession, net, detail)
     on conflict (school_id, student_id, head_id, period_key) where head_id is not null do nothing
     returning gross_minor, concession_minor, amount_minor`,
    [actor.schoolId, structure.structure_id, input.dueDate, lines.map((l) => l.studentId), lines.map((l) => l.headId), lines.map((l) => l.periodKey), lines.map((l) => l.a.grossMinor), lines.map((l) => l.a.concessionMinor), lines.map((l) => l.a.netMinor), lines.map((l) => JSON.stringify(l.a.detail))]
  );
  const sum = (k: string) => inserted.rows.reduce((t, r) => t + Number(r[k]), 0);
  const result = { ok: true as const, raised: inserted.rows.length, alreadyThere: lines.length - inserted.rows.length, students: students.length, grossMinor: sum('gross_minor'), concessionMinor: sum('concession_minor'), netMinor: sum('amount_minor') };
  if (result.raised > 0) await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'fees.dues_raised', targetType: 'fee_structures', targetId: structure.structure_id, beforeState: undefined, afterState: { classId: input.classId, month: input.month, dueDate: input.dueDate, lines: result.raised, grossMinor: result.grossMinor, concessionMinor: result.concessionMinor, netMinor: result.netMinor } });
  return result;
}

export type DueLine = { fee_id: string; student_id: string; student_name: string; head_name: string; period_key: string; gross_minor: number; concession_minor: number; net_minor: number; due_date: string; status: string; kinds: string[] };

// Every period key that can fall due in a month of a session, whatever the head's frequency.
export function periodKeysIn(month: string, session: SessionDates): string[] {
  return (['monthly', 'quarterly', 'half_yearly', 'annual', 'one_time'] as const).map((f) => periodKeyFor(f, month, session)).filter((k): k is string => k !== null);
}

// A class's raised lines for the periods given (see periodKeysIn).
export async function duesFor(db: PoolClient, schoolId: string, classId: string, periodKeys: readonly string[]): Promise<DueLine[]> {
  const { rows } = await db.query(
    `select l.fee_id, l.student_id, st.name as student_name, h.name as head_name, l.period_key, l.gross_minor, l.concession_minor, l.amount_minor as net_minor, l.due_date::text as due_date, l.status::text as status,
            coalesce((select jsonb_agg(distinct d->>'kind') from jsonb_array_elements(l.concession_detail) d), '[]'::jsonb) as kinds
       from fees_ledger l
       join fee_billing_students() st on st.school_id = l.school_id and st.student_id = l.student_id
       join fee_heads h on h.school_id = l.school_id and h.head_id = l.head_id
      where l.school_id = $1 and st.class_id = $2 and l.period_key = any($3::text[])
      order by st.name, lower(h.name)`,
    [schoolId, classId, periodKeys]
  );
  return rows.map((r) => ({ ...r, gross_minor: Number(r.gross_minor), concession_minor: Number(r.concession_minor), net_minor: Number(r.net_minor) }));
}

// The reconciliation rule for dues (docs/23 §3 rule 2), as one query: the
// lines whose gross, concession and net do not add up, or whose concession
// detail does not sum to the concession. It must return no row.
export async function duesThatDoNotAddUp(db: PoolClient, schoolId: string): Promise<{ fee_id: string }[]> {
  return (await db.query(
    `select fee_id from fees_ledger l
      where school_id = $1 and (gross_minor - concession_minor <> amount_minor
         or (head_id is not null and concession_minor <> coalesce((select sum((d->>'minor')::bigint) from jsonb_array_elements(l.concession_detail) d), 0)))`,
    [schoolId]
  )).rows;
}
