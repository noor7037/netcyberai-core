import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { planHasFeature } from '@/lib/frameworks/plans';
import { settingsSchemaFor } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import { MAX_TEACHERS, teachersFromCsv } from '@/lib/free-tools/teacher-register';
import { indiaDate } from '@/lib/time/india';
import { changedFields, checkStaff, DESK_ROLES, matchImport, QUALIFICATION_FIELDS, readQualification, REGISTER_ROLES, registerSettingsOf, type Ending, type GapCode, type ImportRow, type Qualification, type QualificationProblem, type RegisterSettings } from './register-rules';

// The compliance desk's teacher register (docs/28 row 10d, C227): each teaching staff account's qualifications and
// TET, checked by the website tool's own rules (src/lib/compliance/register-rules.ts), with what is missing and what
// ends within the school's window; saving a row; the CSV import in the tool's own columns; and the count My Day shows.
//
// Every function runs in the caller's own tenant transaction. Row level security lets only the principal and the
// school admin read or write staff_qualifications; every function also refuses anyone else itself. Each change is
// audited with the staff member's id and the NAMES of the fields that changed, never their values (C56).

type Actor = { schoolId: string; userId: string; role: StaffRole };
type Db = Pick<PoolClient, 'query'>;

// The desk is a part of the plan (C223-A answer 1, C226: Growth and Compass): the page, every route of the desk and
// its My Day card ask this first.
export const COMPLIANCE_DESK_FEATURE = 'compliance-desk' as const;
export const deskInPlan = (db: Db, schoolId: string): Promise<boolean> => planHasFeature(db as never, schoolId, COMPLIANCE_DESK_FEATURE);
export const isDeskRole = (role: string) => DESK_ROLES.includes(role);

export const IMPORT_MAX_BYTES = 200_000;

// The school's register rules: the Compliance module's settings, read as the tool reads its own.
export async function registerSettings(db: Db, schoolId: string): Promise<RegisterSettings> {
  const schema = settingsSchemaFor('compliance');
  return registerSettingsOf(schema ? (await readSettings(db as never, schoolId, schema)).effective : {});
}

export type StaffEntry = {
  user_id: string;
  name: string;
  role: string;
  qualification: Qualification | null;
  updated_by: string | null;
  updated_at: string | null;
  gaps: GapCode[];
  endings: Ending[];
};
export type Register = {
  today: string;
  settings: RegisterSettings;
  staff: StaffEntry[];
  totals: { staff: number; recorded: number; withGaps: number; ending: number; passed: number };
  // Every certificate or approval ending within the window or passed, soonest first: the alert list.
  endings: (Ending & { user_id: string; name: string })[];
};

const SELECT_ROW = `q.stage, q.subjects, q.degree, q.postgraduate_degree, q.professional_qualification, q.tet_type, q.tet_paper,
  q.tet_certificate_date::text as tet_certificate_date, q.tet_valid_until::text as tet_valid_until, q.other_approval, q.other_valid_until::text as other_valid_until`;
const rowOf = (r: Record<string, unknown>): Qualification => Object.fromEntries(QUALIFICATION_FIELDS.map((f) => [f, (r[f] as string | null) ?? null])) as Qualification;

// The school's active teaching staff, each with their row (or none yet), in name order.
async function staffRows(db: Db, schoolId: string) {
  const { rows } = await db.query(
    `select u.user_id, u.display_name as name, u.role::text as role, q.qualification_id is not null as has_row, ${SELECT_ROW},
            b.display_name as updated_by, q.updated_at
       from users u
       left join staff_qualifications q on q.school_id = u.school_id and q.user_id = u.user_id
       left join users b on b.school_id = q.school_id and b.user_id = q.updated_by
      where u.school_id = $1 and u.is_active and u.role::text = any($2::text[])
      order by lower(u.display_name), u.user_id`,
    [schoolId, [...REGISTER_ROLES]]
  );
  return rows as (Record<string, unknown> & { user_id: string; name: string; role: string; has_row: boolean; updated_by: string | null; updated_at: Date | null })[];
}

export async function loadRegister(db: Db, actor: Actor): Promise<Register | null> {
  if (!isDeskRole(actor.role)) return null;
  const today = indiaDate();
  const settings = await registerSettings(db, actor.schoolId);
  const staff: StaffEntry[] = (await staffRows(db, actor.schoolId)).map((r) => {
    const qualification = r.has_row ? rowOf(r) : null;
    const check = checkStaff(r.name, qualification, settings, today);
    return { user_id: r.user_id, name: r.name, role: r.role, qualification, updated_by: r.updated_by, updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null, gaps: check.gaps, endings: check.endings };
  });
  const endings = staff.flatMap((s) => s.endings.map((e) => ({ ...e, user_id: s.user_id, name: s.name }))).sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
  return {
    today,
    settings,
    staff,
    endings,
    totals: {
      staff: staff.length,
      recorded: staff.filter((s) => s.qualification).length,
      withGaps: staff.filter((s) => s.gaps.length).length,
      ending: endings.filter((e) => e.days >= 0).length,
      passed: endings.filter((e) => e.days < 0).length,
    },
  };
}

// For My Day: how many certificates and approvals of the active teaching staff end within the school's window or
// have ended. The register's own rule, so the card and the desk agree.
export async function endingCount(db: Db, schoolId: string): Promise<number> {
  const today = indiaDate();
  const settings = await registerSettings(db, schoolId);
  return (await staffRows(db, schoolId)).filter((r) => r.has_row).reduce((n, r) => n + checkStaff(r.name, rowOf(r), settings, today).endings.length, 0);
}

// ---- saving ---------------------------------------------------------------------------------------------------------

export type SaveResult = { ok: true; changed: string[] } | { ok: false; reason: 'not_allowed' | 'not_staff' | QualificationProblem; field?: string };

async function writeRow(db: Db, actor: Actor, userId: string, value: Qualification, via: 'form' | 'import'): Promise<string[]> {
  const before = (await db.query(`select ${SELECT_ROW} from staff_qualifications q where q.school_id = $1 and q.user_id = $2`, [actor.schoolId, userId])).rows[0];
  const changed = changedFields(before ? rowOf(before) : null, value);
  if (before && changed.length === 0) return [];
  const cols = QUALIFICATION_FIELDS as readonly string[];
  await db.query(
    `insert into staff_qualifications (school_id, user_id, updated_by, ${cols.join(', ')})
     values ($1, $2, $3, ${cols.map((_, i) => `$${i + 4}`).join(', ')})
     on conflict (school_id, user_id) do update set updated_by = excluded.updated_by, ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}`,
    [actor.schoolId, userId, actor.userId, ...cols.map((c) => value[c as keyof Qualification])]
  );
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'compliance_desk.qualification_saved',
    targetType: 'users',
    targetId: userId,
    beforeState: undefined,
    afterState: { fields: changed, first: !before, via },
  });
  return changed;
}

async function isRegisterStaff(db: Db, schoolId: string, userId: string): Promise<boolean> {
  const { rows } = await db.query(`select 1 from users where school_id = $1 and user_id = $2 and is_active and role::text = any($3::text[])`, [schoolId, userId, [...REGISTER_ROLES]]);
  return rows.length === 1;
}

export async function saveQualification(db: Db, actor: Actor, userId: string, input: Readonly<Record<string, unknown>>): Promise<SaveResult> {
  if (!isDeskRole(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!(await isRegisterStaff(db, actor.schoolId, userId))) return { ok: false, reason: 'not_staff' };
  const read = readQualification(input, indiaDate());
  if (!read.ok) return { ok: false, reason: read.reason, field: read.field };
  return { ok: true, changed: await writeRow(db, actor, userId, read.value, 'form') };
}

// ---- the CSV import -------------------------------------------------------------------------------------------------

export type ImportResult =
  | { ok: true; rows: Omit<ImportRow, 'value'>[]; unreadableDates: number; unknownStages: number; saved: number | null }
  | { ok: false; reason: 'not_allowed' | 'empty' | 'no_name_column' | 'too_large' };

// `apply` false: what the file would do, line by line (nothing is saved). `apply` true: the lines that are ready are
// saved, each a staff member's row replaced as a whole, each audited; the others are left out and said.
export async function importRegister(db: Db, actor: Actor, csv: string, apply: boolean): Promise<ImportResult> {
  if (!isDeskRole(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (csv.length > IMPORT_MAX_BYTES) return { ok: false, reason: 'too_large' };
  const read = teachersFromCsv(csv);
  if (read.error) return { ok: false, reason: read.teachers.length === 0 && /name column/.test(read.error) ? 'no_name_column' : 'empty' };
  if (read.teachers.length === 0) return { ok: false, reason: 'empty' };
  const staff = (await staffRows(db, actor.schoolId)).map((r) => ({ user_id: r.user_id, name: r.name, has_row: r.has_row }));
  const rows = matchImport(read.teachers.slice(0, MAX_TEACHERS), staff, indiaDate());
  let saved: number | null = null;
  if (apply) {
    saved = 0;
    for (const r of rows) {
      if (r.status !== 'ready' || !r.userId || !r.value) continue;
      // A row is saved when it changed something, or is the staff member's first row (review of C227).
      const changed = await writeRow(db, actor, r.userId, r.value, 'import');
      if (changed.length > 0 || !r.replaces) saved += 1;
    }
  }
  return { ok: true, rows: rows.map(({ value: _value, ...rest }) => rest), unreadableDates: read.unreadableDates, unknownStages: read.unknownStages, saved };
}
