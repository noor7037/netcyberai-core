import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { hasAadhaarNumber } from '@/lib/privacy/aadhaar';
import { indiaDate } from '@/lib/time/india';

// 05_BUSINESS_LOGIC.md Sec3: Haryana's Form 6 advisory. CPI and the
// filing deadline are both admin-entered configuration with a recorded
// source -- never a hardcoded constant (the deadline in particular has
// moved in practice across past years; a literal date in code or copy
// is a live correctness bug waiting to happen, not just stale content).
export type CpiState = 'unknown' | 'within_advisory' | 'above_advisory';
export type DeadlineState = 'unknown' | 'before_deadline' | 'past_deadline';

export interface Form6Advisory {
  jurisdictionApplies: boolean;
  cpiState: CpiState;
  cpiPercent: number | null;
  cpiSource: string | null;
  permissibleIncreasePercent: number | null;
  proposedIncreasePercent: number | null;
  lastYearTotalMinor: number | null;
  thisYearTotalMinor: number | null;
  deadlineState: DeadlineState;
  filingDeadline: string | null;
  filingDeadlineSource: string | null;
  advisoryMuted: boolean;
  // Who entered each figure, when, and the day its source was read (C232 part B); null for a figure typed before the
  // desk could enter one.
  cpiReadOn: string | null;
  cpiRecordedBy: string | null;
  cpiRecordedAt: string | null;
  filingDeadlineReadOn: string | null;
  filingDeadlineRecordedBy: string | null;
  filingDeadlineRecordedAt: string | null;
}

interface ComplianceConfigRow {
  cpi_percent: string | null;
  cpi_source: string | null;
  cpi_read_on: string | null;
  cpi_recorded_by: string | null;
  cpi_recorded_at: Date | string | null;
  filing_deadline: string | null;
  filing_deadline_source: string | null;
  filing_deadline_read_on: string | null;
  filing_deadline_recorded_by: string | null;
  filing_deadline_recorded_at: Date | string | null;
  advisory_muted: boolean;
}
const iso = (at: Date | string | null | undefined) => (at ? new Date(at).toISOString() : null);

// Normalizes every fee_structure_items row to an annual minor-unit
// figure (amount_minor -- Pre-F Architecture Hardening's provider-
// neutral currency rename, migration 20260921085859) so items billed
// at different frequencies (monthly/quarterly/half_yearly/annual/
// one_time) can be summed meaningfully. one_time items (e.g. an
// admission fee) are excluded from a recurring year-over-year hike
// comparison -- including them would make a school's non-recurring
// one-off charge look like part of its annual fee increase.
const ANNUAL_MULTIPLIER: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
  annual: 1,
};

async function annualTotalForYear(client: PoolClient, schoolId: string, academicYear: string): Promise<number | null> {
  const { rows } = await client.query(
    `select fsi.frequency, sum(fsi.amount_minor)::bigint as total
     from fee_structures fs
     join fee_structure_items fsi on fsi.structure_id = fs.structure_id
     where fs.school_id = $1 and fs.academic_year = $2 and fsi.frequency <> 'one_time'
     group by fsi.frequency`,
    [schoolId, academicYear]
  );
  if (rows.length === 0) return null;
  return rows.reduce((sum, r) => sum + Number(r.total) * (ANNUAL_MULTIPLIER[r.frequency] ?? 1), 0);
}

// jurisdiction is read from the caller (schools.jurisdiction, Pre-F
// hardening) -- this module never queries it itself, so the same
// "renders only for IN-HR" gate a caller checks is the only place that
// decision is made, not duplicated here.
export async function computeForm6Advisory(client: PoolClient, schoolId: string, jurisdiction: string): Promise<Form6Advisory> {
  const jurisdictionApplies = jurisdiction === 'IN-HR';

  // Who entered a figure is read by name; a name the reader cannot see is left out, never guessed.
  const { rows } = await client.query<ComplianceConfigRow>(
    `select c.cpi_percent, c.cpi_source, c.cpi_read_on::text as cpi_read_on, cu.display_name as cpi_recorded_by, c.cpi_recorded_at,
            c.filing_deadline::text as filing_deadline, c.filing_deadline_source, c.filing_deadline_read_on::text as filing_deadline_read_on,
            du.display_name as filing_deadline_recorded_by, c.filing_deadline_recorded_at, c.advisory_muted
       from compliance_config c
       left join users cu on cu.school_id = c.school_id and cu.user_id = c.cpi_recorded_by
       left join users du on du.school_id = c.school_id and du.user_id = c.filing_deadline_recorded_by
      where c.school_id = $1`,
    [schoolId]
  );
  const config = rows[0];
  const cpiPercent = config?.cpi_percent != null ? Number(config.cpi_percent) : null;
  const advisoryMuted = config?.advisory_muted ?? false;

  let lastYearTotalMinor: number | null = null;
  let thisYearTotalMinor: number | null = null;
  let proposedIncreasePercent: number | null = null;
  if (jurisdictionApplies) {
    const { rows: yearRows } = await client.query(
      `select distinct academic_year from fee_structures where school_id = $1 order by academic_year desc limit 2`,
      [schoolId]
    );
    if (yearRows.length === 2) {
      thisYearTotalMinor = await annualTotalForYear(client, schoolId, yearRows[0].academic_year);
      lastYearTotalMinor = await annualTotalForYear(client, schoolId, yearRows[1].academic_year);
      if (thisYearTotalMinor != null && lastYearTotalMinor != null && lastYearTotalMinor > 0) {
        proposedIncreasePercent = ((thisYearTotalMinor - lastYearTotalMinor) / lastYearTotalMinor) * 100;
      }
    }
  }

  const permissibleIncreasePercent = cpiPercent != null ? cpiPercent + 5 : null;
  let cpiState: CpiState;
  if (cpiPercent == null) {
    cpiState = 'unknown'; // never guess a number
  } else if (proposedIncreasePercent == null || proposedIncreasePercent <= permissibleIncreasePercent!) {
    cpiState = 'within_advisory';
  } else {
    cpiState = 'above_advisory';
  }

  let deadlineState: DeadlineState;
  if (!config?.filing_deadline) {
    deadlineState = 'unknown'; // never assume 1 Feb
  } else if (indiaDate() > config.filing_deadline) {
    // India's day against the date as typed (YYYY-MM-DD): the deadline day itself is not past (review of C227).
    deadlineState = 'past_deadline';
  } else {
    deadlineState = 'before_deadline';
  }

  return {
    jurisdictionApplies,
    cpiState,
    cpiPercent,
    cpiSource: config?.cpi_source ?? null,
    permissibleIncreasePercent,
    proposedIncreasePercent,
    lastYearTotalMinor,
    thisYearTotalMinor,
    deadlineState,
    filingDeadline: config?.filing_deadline ?? null,
    filingDeadlineSource: config?.filing_deadline_source ?? null,
    advisoryMuted,
    cpiReadOn: config?.cpi_read_on ?? null,
    cpiRecordedBy: config?.cpi_recorded_by ?? null,
    cpiRecordedAt: iso(config?.cpi_recorded_at),
    filingDeadlineReadOn: config?.filing_deadline_read_on ?? null,
    filingDeadlineRecordedBy: config?.filing_deadline_recorded_by ?? null,
    filingDeadlineRecordedAt: iso(config?.filing_deadline_recorded_at),
  };
}

// compliance_config.state has no database default (Pre-F Architecture
// Hardening deliberately dropped it: migration
// 20260921085859_jurisdiction_timezone_currency_statutory_label.sql --
// a fixed 'HR' default silently mislabeled every non-Haryana school.
// That migration's own comment leaves a standing rule for this exact
// prompt: any insert must derive `state` from schools.jurisdiction
// (the state segment of 'IN-HR'), never rely on a default. Found live
// while gathering VERIFY evidence: the first mute attempt against a
// school with no existing compliance_config row failed with a
// not-null violation on `state` because this function never supplied
// it, exactly the gap that comment warned about.
function stateFromJurisdiction(jurisdiction: string): string {
  const parts = jurisdiction.split('-');
  return parts[1] ?? jurisdiction;
}

export async function muteForm6Advisory(client: PoolClient, schoolId: string, jurisdiction: string, mutedBy: string): Promise<void> {
  await client.query(
    `insert into compliance_config (school_id, state, advisory_muted, muted_by, muted_at)
     values ($1, $3, true, $2, now())
     on conflict (school_id) do update set advisory_muted = true, muted_by = $2, muted_at = now(), updated_at = now()`,
    [schoolId, mutedBy, stateFromJurisdiction(jurisdiction)]
  );
}

export async function unmuteForm6Advisory(client: PoolClient, schoolId: string, jurisdiction: string, actorUserId: string): Promise<void> {
  await client.query(
    `insert into compliance_config (school_id, state, advisory_muted, muted_by, muted_at)
     values ($1, $3, false, $2, now())
     on conflict (school_id) do update set advisory_muted = false, muted_by = $2, muted_at = now(), updated_at = now()`,
    [schoolId, actorUserId, stateFromJurisdiction(jurisdiction)]
  );
}

// ---- entering the CPI and the filing deadline (C230-A, C232 part B) -------------------------------------------------
// On the compliance desk, by the principal or the school admin: each figure with the https address of its source and
// the day that source was read, as the Form 6 feature page promises. Never a default number: a figure is empty (the
// advisory says "not set") until a person enters it, and the office may clear it again. The database holds the same
// rules (compliance_config_figures) and records who entered it and when. Audited with the figure and the day read,
// never the address (C56: typed text stays off the audit row).

export const FIGURE_ROLES: readonly string[] = ['principal', 'school_admin'];
export const SOURCE_MAX = 500;
export type Figure = 'cpi' | 'deadline';
export type FigureValue =
  | { figure: 'cpi'; clear: false; percent: number; source: string; readOn: string }
  | { figure: 'deadline'; clear: false; deadline: string; source: string; readOn: string }
  | { figure: Figure; clear: true };
export type FigureProblem = 'figure' | 'percent' | 'deadline' | 'source' | 'aadhaar' | 'read_on' | 'future';

const realDate = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
};

// An https address with a host, at most SOURCE_MAX characters, never an Aadhaar number.
export function readSource(v: unknown): { ok: true; source: string } | { ok: false; reason: 'source' | 'aadhaar' } {
  const typed = typeof v === 'string' ? v.trim() : '';
  // A phone may type "Https://": the scheme is kept in small letters, as the database's rule reads it.
  const s = typed.toLowerCase().startsWith('https://') ? `https://${typed.slice(8)}` : typed;
  if (!s || s.length > SOURCE_MAX || /\s/.test(s) || !s.startsWith('https://')) return { ok: false, reason: 'source' };
  let host = '';
  try {
    const u = new URL(s);
    host = u.protocol === 'https:' ? u.hostname : '';
  } catch {
    host = '';
  }
  if (!host.includes('.')) return { ok: false, reason: 'source' };
  if (hasAadhaarNumber(s)) return { ok: false, reason: 'aadhaar' };
  return { ok: true, source: s };
}

// What the office sent, read: { figure: 'cpi', percent, source, readOn }, { figure: 'deadline', deadline, source,
// readOn }, or { figure, clear: true }. The CPI is a percent above -100 and below 100 with at most two decimal places.
export function readFigure(input: Readonly<Record<string, unknown>>, today: string): { ok: true; value: FigureValue } | { ok: false; reason: FigureProblem } {
  const figure = input.figure;
  if (figure !== 'cpi' && figure !== 'deadline') return { ok: false, reason: 'figure' };
  if (input.clear === true) return { ok: true, value: { figure, clear: true } };
  let percent = 0;
  let deadline = '';
  if (figure === 'cpi') {
    const raw = typeof input.percent === 'number' ? String(input.percent) : typeof input.percent === 'string' ? input.percent.trim() : '';
    if (!/^-?\d{1,2}(\.\d{1,2})?$/.test(raw)) return { ok: false, reason: 'percent' };
    percent = Number(raw);
  } else {
    const d = realDate(input.deadline);
    if (!d) return { ok: false, reason: 'deadline' };
    deadline = d;
  }
  const source = readSource(input.source);
  if (!source.ok) return source;
  const readOn = realDate(input.readOn);
  if (!readOn) return { ok: false, reason: 'read_on' };
  if (readOn > today) return { ok: false, reason: 'future' };
  return { ok: true, value: figure === 'cpi' ? { figure, clear: false, percent, source: source.source, readOn } : { figure, clear: false, deadline, source: source.source, readOn } };
}

export type FigureResult = { ok: true; figure: Figure; cleared: boolean } | { ok: false; reason: 'not_allowed' | 'not_haryana' | 'unchanged' | FigureProblem };
type FigureActor = { schoolId: string; userId: string; role: StaffRole };

export async function saveForm6Figure(client: Pick<PoolClient, 'query'>, actor: FigureActor, jurisdiction: string, input: Readonly<Record<string, unknown>>): Promise<FigureResult> {
  if (!FIGURE_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  // Form 6 is Haryana's: a school elsewhere has no figure to enter.
  if (jurisdiction !== 'IN-HR') return { ok: false, reason: 'not_haryana' };
  const read = readFigure(input, indiaDate());
  if (!read.ok) return read;
  const v = read.value;
  const cols = v.figure === 'cpi' ? ['cpi_percent', 'cpi_source', 'cpi_read_on'] : ['filing_deadline', 'filing_deadline_source', 'filing_deadline_read_on'];
  const values = v.clear ? [null, null, null] : v.figure === 'cpi' ? [v.percent, v.source, v.readOn] : [v.deadline, v.source, v.readOn];
  const before = (await client.query(`select ${cols[0]}::text as a, ${cols[1]} as b, ${cols[2]}::text as c from compliance_config where school_id = $1`, [actor.schoolId])).rows[0];
  const same = before
    ? (v.figure === 'cpi' ? (before.a === null ? null : Number(before.a)) : before.a) === values[0] && before.b === values[1] && before.c === values[2]
    : v.clear;
  if (same) return { ok: false, reason: 'unchanged' };
  await client.query(
    `insert into compliance_config (school_id, state, ${cols.join(', ')})
     values ($1, $2, $3, $4, $5)
     on conflict (school_id) do update set ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}, updated_at = now()`,
    [actor.schoolId, stateFromJurisdiction(jurisdiction), ...values]
  );
  await writeAuditLog(client, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'compliance_desk.form6_figure_saved',
    targetType: 'compliance_config',
    targetId: actor.schoolId,
    afterState: {
      figure: v.figure,
      cleared: v.clear,
      percent: v.clear || v.figure !== 'cpi' ? null : v.percent,
      deadline: v.clear || v.figure !== 'deadline' ? null : v.deadline,
      readOn: v.clear ? null : v.readOn,
    },
  });
  return { ok: true, figure: v.figure, cleared: v.clear };
}
