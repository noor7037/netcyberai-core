import type { PoolClient } from 'pg';
import { classOrderSql } from '@/lib/classes/class-order';

// Syllabus coverage by class and subject (W20-D, H4). Everything is counted from the school's own tables:
//   planned   the units of the syllabus map (syllabus_units) for the class and subject
//   taught    the units a lesson was logged for with status "taught" (syllabus_progress)
//   noted     the taught units whose lesson has a note (the teacher wrote what was achieved)
// "Objectives met" is noted over taught. The trend sets coverage against the share of the current academic session
// that has passed (its start and end dates, set by the office in Setup): ahead, on track or behind. With no current
// session there is no trend, and none is guessed.

// A class and subject are "ahead" or "behind" only when coverage is this many points away from the elapsed share.
export const TREND_MARGIN = 10;

export type Trend = 'ahead' | 'on_track' | 'behind';
export type SessionSpan = { start: string; end: string };
export type CoverageRow = {
  class_id: string;
  class_name: string;
  // The class's section, so a class is named "5-A" where its name alone is "5" (classLabel).
  class_section: string | null;
  subject_id: string;
  subject_name: string;
  planned: number;
  taught: number;
  noted: number;
  percent: number | null;
  objectivesPercent: number | null;
  trend: Trend | null;
};
export type CoverageTable = { elapsedPercent: number | null; rows: CoverageRow[]; total: { classSubjects: number; planned: number; taught: number; percent: number | null; behind: number } };

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

// The share of the session that has passed on `today`, in whole percent, held between 0 and 100. Null for a session
// whose end is not after its start.
export function elapsedPercent(today: string, span: SessionSpan): number | null {
  const length = dayNumber(span.end) - dayNumber(span.start);
  if (!(length > 0)) return null;
  const share = ((dayNumber(today) - dayNumber(span.start)) / length) * 100;
  return Math.round(Math.min(100, Math.max(0, share)));
}

export function trendOf(percent: number | null, elapsed: number | null): Trend | null {
  if (percent === null || elapsed === null) return null;
  if (percent >= elapsed + TREND_MARGIN) return 'ahead';
  if (percent < elapsed - TREND_MARGIN) return 'behind';
  return 'on_track';
}

const pct = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 100));

export async function currentSessionSpan(db: PoolClient, schoolId: string): Promise<SessionSpan | null> {
  const r = (await db.query(`select start_date::text as start, end_date::text as "end" from academic_sessions where school_id = $1 and is_current limit 1`, [schoolId])).rows[0] as SessionSpan | undefined;
  return r ?? null;
}

// One row per class and subject that has a syllabus map. A teacher is limited to their own classes (also by RLS).
export async function coverageTable(db: PoolClient, schoolId: string, role: string, today: string): Promise<CoverageTable> {
  const rows = (await db.query(
    `select u.class_id, c.name as class_name, c.section as class_section, u.subject_id, s.name as subject_name,
            count(*)::int as planned,
            count(*) filter (where t.unit_id is not null)::int as taught,
            count(*) filter (where n.unit_id is not null)::int as noted
       from syllabus_units u
       join classes c on c.school_id = u.school_id and c.class_id = u.class_id
       join subjects s on s.school_id = u.school_id and s.subject_id = u.subject_id
       left join (select distinct unit_id from syllabus_progress where school_id = $1 and status = 'taught' and unit_id is not null) t on t.unit_id = u.unit_id
       left join (select distinct unit_id from syllabus_progress where school_id = $1 and status = 'taught' and unit_id is not null and btrim(coalesce(note, '')) <> '') n on n.unit_id = u.unit_id
      where u.school_id = $1 and ($2::text <> 'teacher' or u.class_id = any (public.teacher_own_class_ids()))
      group by u.class_id, c.name, c.grade, c.section, u.subject_id, s.name
      order by ${classOrderSql('c')}, s.name, u.subject_id`,
    [schoolId, role]
  )).rows as Pick<CoverageRow, 'class_id' | 'class_name' | 'class_section' | 'subject_id' | 'subject_name' | 'planned' | 'taught' | 'noted'>[];
  const span = await currentSessionSpan(db, schoolId);
  const elapsed = span ? elapsedPercent(today, span) : null;
  const table: CoverageRow[] = rows.map((r) => {
    const percent = pct(r.taught, r.planned);
    return { ...r, percent, objectivesPercent: pct(r.noted, r.taught), trend: trendOf(percent, elapsed) };
  });
  const planned = table.reduce((n, r) => n + r.planned, 0);
  const taught = table.reduce((n, r) => n + r.taught, 0);
  return { elapsedPercent: elapsed, rows: table, total: { classSubjects: table.length, planned, taught, percent: pct(taught, planned), behind: table.filter((r) => r.trend === 'behind').length } };
}
