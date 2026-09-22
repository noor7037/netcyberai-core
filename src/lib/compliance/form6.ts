import type { PoolClient } from 'pg';

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
  lastYearTotalPaise: number | null;
  thisYearTotalPaise: number | null;
  deadlineState: DeadlineState;
  filingDeadline: string | null;
  filingDeadlineSource: string | null;
  advisoryMuted: boolean;
}

interface ComplianceConfigRow {
  cpi_percent: string | null;
  cpi_source: string | null;
  filing_deadline: string | null;
  filing_deadline_source: string | null;
  advisory_muted: boolean;
}

// Normalizes every fee_structure_items row to an annual paise figure so
// items billed at different frequencies (monthly/quarterly/half_yearly/
// annual/one_time) can be summed meaningfully. one_time items (e.g. an
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
    `select fsi.frequency, sum(fsi.amount_paise)::bigint as total
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

  const { rows } = await client.query<ComplianceConfigRow>(
    `select cpi_percent, cpi_source, filing_deadline, filing_deadline_source, advisory_muted
     from compliance_config where school_id = $1`,
    [schoolId]
  );
  const config = rows[0];
  const cpiPercent = config?.cpi_percent != null ? Number(config.cpi_percent) : null;
  const advisoryMuted = config?.advisory_muted ?? false;

  let lastYearTotalPaise: number | null = null;
  let thisYearTotalPaise: number | null = null;
  let proposedIncreasePercent: number | null = null;
  if (jurisdictionApplies) {
    const { rows: yearRows } = await client.query(
      `select distinct academic_year from fee_structures where school_id = $1 order by academic_year desc limit 2`,
      [schoolId]
    );
    if (yearRows.length === 2) {
      thisYearTotalPaise = await annualTotalForYear(client, schoolId, yearRows[0].academic_year);
      lastYearTotalPaise = await annualTotalForYear(client, schoolId, yearRows[1].academic_year);
      if (thisYearTotalPaise != null && lastYearTotalPaise != null && lastYearTotalPaise > 0) {
        proposedIncreasePercent = ((thisYearTotalPaise - lastYearTotalPaise) / lastYearTotalPaise) * 100;
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
  } else if (new Date() > new Date(config.filing_deadline)) {
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
    lastYearTotalPaise,
    thisYearTotalPaise,
    deadlineState,
    filingDeadline: config?.filing_deadline ?? null,
    filingDeadlineSource: config?.filing_deadline_source ?? null,
    advisoryMuted,
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
