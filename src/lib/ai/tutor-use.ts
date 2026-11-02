import type { Sql } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';

// The tutor's use on one India day, for Control's AI dashboard and the daily ops job (W16-B4). Counts only, from the
// children's daily totals (family.tutor_day_totals, a definer function: the platform role cannot read the table), the
// job queue (quizzes made and reports sent are the tutor.quiz and tutor.parent_report jobs that finished that day) and
// the usage ledger (cost, by service). No word a child said, no name, no account.

export type TutorTotals = { children: number; textTurns: number; voiceMinutes: number; photoDoubts: number; quizzes: number; reports: number };
export type ServiceCost = { profileId: string; usd: number | null };
export type TutorUseToday = TutorTotals & { day: string; cost: ServiceCost[] };

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const minutes = (seconds: number) => Math.round((seconds / 60) * 10) / 10;

export async function tutorTotals(db: Sql, day: string): Promise<TutorTotals> {
  const t = (await db.query(`select family.tutor_day_totals($1::date) as t`, [day])).rows[0]?.t ?? {};
  const jobs = await db.query(
    `select type, count(*)::int as n from jobs
      where type in ('tutor.quiz', 'tutor.parent_report') and status = 'succeeded' and (completed_at at time zone 'Asia/Kolkata')::date = $1::date group by type`,
    [day]
  );
  const made = (type: string) => n(jobs.rows.find((r) => r.type === type)?.n);
  return { children: n(t.children), textTurns: n(t.text_turns), voiceMinutes: minutes(n(t.voice_seconds)), photoDoubts: n(t.photo_doubts), quizzes: made('tutor.quiz'), reports: made('tutor.parent_report') };
}

// The cost the ledger gives for each family service on the day; null where no attempt had a price (none is invented).
export async function serviceCosts(db: Sql, day: string): Promise<ServiceCost[]> {
  const { rows } = await db.query(
    `select profile_id, sum(cost_usd)::float8 as usd, count(*) filter (where cost_usd is not null)::int as priced
       from control.ai_usage_ledger where day = $1::date and profile_id like 'family.%' group by profile_id order by profile_id`,
    [day]
  );
  return rows.map((r) => ({ profileId: String(r.profile_id), usd: n(r.priced) > 0 ? Math.round(n(r.usd) * 100) / 100 : null }));
}

export async function loadTutorUse(db: Sql, day: string = indiaDate()): Promise<TutorUseToday> {
  return { day, ...(await tutorTotals(db, day)), cost: await serviceCosts(db, day) };
}
