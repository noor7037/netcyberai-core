import { loadFamilyCounts } from '@/lib/control/family-counts';
import { csvOf } from '@/lib/control/audit-logs';
import type { Sql } from '@/lib/jobs/types';

// Control → Analytics (W21-M6): the platform's numbers, each read from its own table and each with the range it
// covers; nothing is estimated or made up. A tagged test school (schools.is_test_fixture) is never added to a total
// (C64): its schools are counted apart, its people and messages not at all.
//   schools by onboarding stage        schools, now
//   active users, 7 and 30 days        distinct people whose sign-in was used in that window (sessions.last_used_at)
//   Family accounts and children       family.control_counts(), now
//   AI requests and cost by day        control.ai_usage_ledger, the chosen India days (cost only where a price is set)
//   WhatsApp sends by day              communication_log, the chosen India days; only days that have any

export const ANALYTICS_MAX_DAYS = 366;
export const ANALYTICS_DEFAULT_DAYS = 30;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LIVE = `school_id in (select school_id from schools where not is_test_fixture)`;

export type AnalyticsRange = { from: string; to: string };
export type PlatformAnalytics = {
  range: AnalyticsRange;
  asOf: string;
  schoolsByStage: { stage: string; count: number }[];
  testSchools: number;
  activeUsers: { days7: number; days30: number };
  family: { accounts: number; children: number };
  aiByDay: { day: string; requests: number; failures: number; costUsd: number; unpriced: number }[];
  whatsappByDay: { day: string; sent: number; failed: number; stopped: number }[];
};

const indiaToday = (now: Date) => new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const valid = (v: string) => DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

export function parseAnalyticsRange(params: URLSearchParams, now: Date = new Date()): { ok: true; range: AnalyticsRange } | { ok: false } {
  const to = params.get('to') || indiaToday(now);
  const from = params.get('from') || addDays(to, -(ANALYTICS_DEFAULT_DAYS - 1));
  if (!valid(from) || !valid(to) || from > to) return { ok: false };
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 > ANALYTICS_MAX_DAYS) return { ok: false };
  return { ok: true, range: { from, to } };
}

// Who used a sign-in in the last 30 days, and when last. sessions is reachable only by the backend's own role (no
// tenant role, not even the platform's, may read it), so this is read on that connection and passed in.
export type RecentSignIn = { userId: string; lastUsedAt: string };
export async function recentSignIns(backend: Sql): Promise<RecentSignIn[]> {
  const { rows } = await backend.query(`select user_id, max(last_used_at) as last from sessions where last_used_at > now() - interval '30 days' group by user_id`);
  return rows.map((r: Record<string, unknown>) => ({ userId: String(r.user_id), lastUsedAt: new Date(r.last as string).toISOString() }));
}

export async function loadPlatformAnalytics(db: Sql, range: AnalyticsRange, signIns: readonly RecentSignIn[], now: Date = new Date()): Promise<PlatformAnalytics> {
  const stages = (await db.query(`select onboarding_stage::text as stage, count(*)::int as n from schools where not is_test_fixture group by 1 order by 1`)).rows;
  const tests = Number((await db.query(`select count(*)::int as n from schools where is_test_fixture`)).rows[0]?.n ?? 0);
  // People of a test school are not counted; the platform's own staff (no school) are.
  const active = (
    await db.query(
      `select count(*) filter (where x.last > $3::timestamptz - interval '7 days')::int as d7, count(*)::int as d30
         from unnest($1::uuid[], $2::timestamptz[]) as x(user_id, last)
         join users u on u.user_id = x.user_id
        where u.school_id is null or u.school_id in (select school_id from schools where not is_test_fixture)`,
      [signIns.map((s) => s.userId), signIns.map((s) => s.lastUsedAt), now.toISOString()]
    )
  ).rows[0];
  const family = await loadFamilyCounts(db);
  const ai = (
    await db.query(
      `select day::text as day, count(*)::int as requests, count(*) filter (where outcome <> 'ok')::int as failures,
              coalesce(sum(cost_usd), 0)::float8 as cost, count(*) filter (where cost_usd is null and outcome = 'ok')::int as unpriced
         from control.ai_usage_ledger where day between $1::date and $2::date group by day order by day`,
      [range.from, range.to]
    )
  ).rows;
  const wa = (
    await db.query(
      `select (created_at at time zone 'Asia/Kolkata')::date::text as day,
              count(*) filter (where status::text in ('sent', 'delivered', 'read'))::int as sent,
              count(*) filter (where status::text in ('failed', 'uncertain'))::int as failed,
              count(*) filter (where status::text like 'blocked\\_%')::int as stopped
         from communication_log
        where channel = 'whatsapp' and ${LIVE} and (created_at at time zone 'Asia/Kolkata')::date between $1::date and $2::date
        group by 1 order by 1`,
      [range.from, range.to]
    )
  ).rows;
  return {
    range,
    asOf: now.toISOString(),
    schoolsByStage: stages.map((r: Record<string, unknown>) => ({ stage: String(r.stage), count: Number(r.n) })),
    testSchools: tests,
    activeUsers: { days7: Number(active?.d7 ?? 0), days30: Number(active?.d30 ?? 0) },
    family: { accounts: family.accounts, children: family.children },
    aiByDay: ai.map((r: Record<string, unknown>) => ({ day: String(r.day), requests: Number(r.requests), failures: Number(r.failures), costUsd: Math.round(Number(r.cost) * 10_000) / 10_000, unpriced: Number(r.unpriced) })),
    whatsappByDay: wa.map((r: Record<string, unknown>) => ({ day: String(r.day), sent: Number(r.sent), failed: Number(r.failed), stopped: Number(r.stopped) })),
  };
}

// One CSV of every number above: section, what, day (or the range it covers), value.
export function analyticsCsv(a: PlatformAnalytics): string {
  const span = `${a.range.from}..${a.range.to}`;
  const now = a.asOf.slice(0, 10);
  const rows: unknown[][] = [['section', 'measure', 'day_or_range', 'value']];
  for (const s of a.schoolsByStage) rows.push(['schools', `stage:${s.stage}`, now, s.count]);
  rows.push(['schools', 'test_schools', now, a.testSchools]);
  rows.push(['users', 'active_7_days', now, a.activeUsers.days7], ['users', 'active_30_days', now, a.activeUsers.days30]);
  rows.push(['family', 'accounts', now, a.family.accounts], ['family', 'children', now, a.family.children]);
  for (const d of a.aiByDay) rows.push(['ai', 'requests', d.day, d.requests], ['ai', 'failures', d.day, d.failures], ['ai', 'cost_usd', d.day, d.costUsd], ['ai', 'unpriced', d.day, d.unpriced]);
  for (const d of a.whatsappByDay) rows.push(['whatsapp', 'sent', d.day, d.sent], ['whatsapp', 'failed', d.day, d.failed], ['whatsapp', 'stopped', d.day, d.stopped]);
  rows.push(['range', 'days', span, '']);
  return csvOf(rows);
}
