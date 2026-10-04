import type { Sql } from '@/lib/jobs/types';

// Numbering formats (17 §1a: admission, receipt, family numbers; C116). A
// pattern is literal capitals, digits and / - _, plus {YYYY}, {YY} and one
// {SEQ:n} (validated by the settings engine's 'numbering' type). The
// counter restarts each year when the pattern shows the year, and never
// otherwise. Allocation is a single upsert on school_sequences, so two
// requests at the same moment never share a number.

export function usesYear(pattern: string): boolean {
  return pattern.includes('{YYYY}') || pattern.includes('{YY}');
}

export function formatNumber(pattern: string, year: number, seq: number): string {
  return pattern
    .replace(/\{YYYY\}/g, String(year))
    .replace(/\{YY\}/g, String(year % 100).padStart(2, '0'))
    .replace(/\{SEQ:([1-8])\}/g, (_m, width: string) => String(seq).padStart(Number(width), '0'));
}

export async function nextNumber(db: Sql, schoolId: string, sequenceKey: string, pattern: string): Promise<string> {
  // The year in the school's own time zone.
  const { rows: y } = await db.query(`select extract(year from now() at time zone timezone)::int as year from schools where school_id = $1`, [schoolId]);
  const year: number = y[0]?.year ?? new Date().getUTCFullYear();
  const period = usesYear(pattern) ? String(year) : 'all';
  const { rows } = await db.query(
    `insert into school_sequences (school_id, sequence_key, period_key, last_value) values ($1, $2, $3, 1)
     on conflict (school_id, sequence_key, period_key)
       do update set last_value = school_sequences.last_value + 1, updated_at = now()
     returning last_value`,
    [schoolId, sequenceKey, period]
  );
  return formatNumber(pattern, year, rows[0].last_value);
}
