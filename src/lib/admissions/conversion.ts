import type { PoolClient } from 'pg';
import { compareClasses } from '@/lib/classes/class-order';
import { indiaDate } from '@/lib/time/india';

// How the pipeline converts (W21-M1): per source and per class sought, of the enquiries recorded this session, how
// many reached a visit, a form and admission, and the days between those steps. The Admissions screen's table and the
// principal's tile ('admissions.conversion', src/lib/insights/facts.ts) are this one call.
//
//   - THIS SESSION: enquiries recorded from the start of the school's current session (academic_sessions.is_current)
//     to today. With no current session set, every enquiry is counted, and the answer says so (`session: null`).
//   - THE STEPS are the pipeline's stages, as the enquiry's own kept history says it reached them (admission_events,
//     'recorded' and 'stage'): a visit is "Visit booked" or "Visited"; a form is "Form taken" or "Form submitted" (the
//     school's offer of a place: there is no separate offer stage); admitted is "Admitted". An enquiry that went
//     straight from enquiry to admitted reached every step on the day it was admitted. A family that said "not
//     joining" keeps the steps it reached.
//   - DAYS between steps: the average, in whole days (India's dates), of the enquiries that reached both; null when
//     none did.

type Sql = Pick<PoolClient, 'query'>;

// Where the principal's tile opens: the Admissions screen, at the conversion table.
export const CONVERSION_HREF = '/app/admissions?show=conversion';

export const FUNNEL = ['enquiries', 'visits', 'forms', 'admitted'] as const;
export type FunnelStep = (typeof FUNNEL)[number];
export type Funnel = { enquiries: number; visits: number; forms: number; admitted: number; days: { toVisit: number | null; toForm: number | null; toAdmitted: number | null } };
export type ConversionRow = Funnel & { key: string; label: string | null };
export type Conversion = {
  session: { start: string; end: string } | null;
  from: string | null;
  to: string;
  total: Funnel;
  bySource: ConversionRow[];
  byClass: ConversionRow[];
  // Admitted over enquiries, as a whole percent; null with no enquiry.
  rate: number | null;
};

type Reached = { source: string; class_id: string; class_name: string; grade: string | null; section: string | null; recorded: string; visit: string | null; form: string | null; admitted: string | null };

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
function average(pairs: [string | null, string | null][]): number | null {
  const gaps = pairs.flatMap(([a, b]) => (a && b ? [days(a, b)] : []));
  return gaps.length === 0 ? null : Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
}

export function funnelOf(rows: readonly Reached[]): Funnel {
  return {
    enquiries: rows.length,
    visits: rows.filter((r) => r.visit).length,
    forms: rows.filter((r) => r.form).length,
    admitted: rows.filter((r) => r.admitted).length,
    days: {
      toVisit: average(rows.map((r) => [r.recorded, r.visit])),
      toForm: average(rows.map((r) => [r.visit, r.form])),
      toAdmitted: average(rows.map((r) => [r.form, r.admitted])),
    },
  };
}

export const conversionRate = (f: Pick<Funnel, 'enquiries' | 'admitted'>): number | null => (f.enquiries === 0 ? null : Math.round((f.admitted / f.enquiries) * 100));

// The first India day the enquiry's history reached each step: a later step reached means the earlier ones were too.
const REACHED = `
  with steps as (
    select v.enquiry_id, (v.at at time zone 'Asia/Kolkata')::date as on_day,
           case v.stage_to when 'visit_booked' then 1 when 'visited' then 1 when 'form_taken' then 2 when 'form_submitted' then 2 when 'admitted' then 3 else 0 end as level
      from admission_events v
     where v.school_id = $1 and v.kind in ('recorded', 'stage')
  )
  select e.source, e.class_id, c.name as class_name, c.grade, c.section,
         (e.created_at at time zone 'Asia/Kolkata')::date::text as recorded,
         (select min(s.on_day)::text from steps s where s.enquiry_id = e.enquiry_id and s.level >= 1) as visit,
         (select min(s.on_day)::text from steps s where s.enquiry_id = e.enquiry_id and s.level >= 2) as form,
         (select min(s.on_day)::text from steps s where s.enquiry_id = e.enquiry_id and s.level >= 3) as admitted
    from admission_enquiries e
    join classes c on c.school_id = e.school_id and c.class_id = e.class_id
   where e.school_id = $1
     and ($2::date is null or (e.created_at at time zone 'Asia/Kolkata')::date >= $2::date)
     and (e.created_at at time zone 'Asia/Kolkata')::date <= $3::date`;

function grouped(rows: readonly Reached[], keyOf: (r: Reached) => string, labelOf: (r: Reached) => string | null): ConversionRow[] {
  const groups = new Map<string, Reached[]>();
  for (const r of rows) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r]);
  return [...groups.entries()].map(([key, rs]) => ({ key, label: labelOf(rs[0]), ...funnelOf(rs) }));
}

export async function conversion(db: Sql, schoolId: string, today: string = indiaDate()): Promise<Conversion> {
  const session = ((await db.query(`select start_date::text as start, end_date::text as "end" from academic_sessions where school_id = $1 and is_current limit 1`, [schoolId])).rows[0] as Conversion['session'] | undefined) ?? null;
  const from = session && session.start <= today ? session.start : null;
  const rows = (await db.query(REACHED, [schoolId, from, today])).rows as Reached[];
  const total = funnelOf(rows);
  const bySource = grouped(rows, (r) => r.source, () => null).sort((a, b) => b.enquiries - a.enquiries || a.key.localeCompare(b.key));
  const byClass = grouped(rows, (r) => r.class_id, (r) => r.class_name).sort((a, b) => {
    const ra = rows.find((r) => r.class_id === a.key)!;
    const rb = rows.find((r) => r.class_id === b.key)!;
    return compareClasses({ name: ra.class_name, grade: ra.grade, section: ra.section }, { name: rb.class_name, grade: rb.grade, section: rb.section });
  });
  return { session, from, to: today, total, bySource, byClass, rate: conversionRate(total) };
}
