import type { Sql } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';

// Control → Apps health and usage (docs/family-app/10 §6; M2-11, C285): the AI platform's requests, failures and cap
// refusals per profile today and this month, the keys whose last test failed, the video search quota, and M2's counts
// (family.m2_counts(), numbers only). Alerts are worked out here from Control's thresholds (control.alert.*) and shown
// on the page; they carry counts and ids, never a child's data. Runs as the platform role (nca_super).

export type ProfileHealth = { profileId: string; requestsToday: number; failuresToday: number; capRefusalsToday: number; requestsMonth: number; tokensMonth: number };
export type M2Counts = {
  plansBuilt7d: number;
  plansDone7d: number;
  childrenPlanDone7d: number;
  revisitsDue: number;
  revisitsDone7d: number;
  photoQuestionsToday: number;
  photoQuestions7d: number;
  voiceSeconds7d: number;
  jarsOpen: number;
  jarsGiven7d: number;
};
export type Thresholds = { aiFailureShare: number; aiMinRequests: number; videoQuotaShare: number };
export type Alert =
  | { kind: 'ai_failures'; profileId: string; failures: number; requests: number }
  | { kind: 'ai_cap'; profileId: string; refusals: number }
  | { kind: 'key_test_failed'; providerId: string }
  | { kind: 'video_quota'; used: number; limit: number };
export type Health = { day: string; profiles: ProfileHealth[]; failedKeys: string[]; video: { used: number; limit: number }; counts: M2Counts; alerts: Alert[] };

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function readM2Counts(raw: unknown): M2Counts {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    plansBuilt7d: num(r.plans_built_7d),
    plansDone7d: num(r.plans_done_7d),
    childrenPlanDone7d: num(r.children_plan_done_7d),
    revisitsDue: num(r.revisits_due),
    revisitsDone7d: num(r.revisits_done_7d),
    photoQuestionsToday: num(r.photo_questions_today),
    photoQuestions7d: num(r.photo_questions_7d),
    voiceSeconds7d: num(r.voice_seconds_7d),
    jarsOpen: num(r.jars_open),
    jarsGiven7d: num(r.jars_given_7d),
  };
}

// The alerts, from today's numbers and Control's thresholds. A profile's failures alert only past a minimum of
// requests, so one failed call in the morning is not an alarm.
export function alertsOf(h: Omit<Health, 'alerts' | 'day' | 'counts'>, t: Thresholds): Alert[] {
  const out: Alert[] = [];
  for (const p of h.profiles) {
    if (p.requestsToday >= t.aiMinRequests && p.failuresToday / p.requestsToday >= t.aiFailureShare) out.push({ kind: 'ai_failures', profileId: p.profileId, failures: p.failuresToday, requests: p.requestsToday });
    if (p.capRefusalsToday > 0) out.push({ kind: 'ai_cap', profileId: p.profileId, refusals: p.capRefusalsToday });
  }
  for (const providerId of h.failedKeys) out.push({ kind: 'key_test_failed', providerId });
  if (h.video.limit > 0 && h.video.used >= h.video.limit * t.videoQuotaShare) out.push({ kind: 'video_quota', used: h.video.used, limit: h.video.limit });
  return out;
}

async function settingNumber(db: Sql, key: string, fallback: number): Promise<number> {
  const { rows } = await db.query(`select value from control.settings where key = $1`, [key]);
  const v = Number(rows[0]?.value);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export async function loadHealth(db: Sql, day: string = indiaDate()): Promise<Health> {
  const usage = await db.query(
    `select profile_id,
            sum(requests) filter (where day = $1::date) as requests_today, sum(failures) filter (where day = $1::date) as failures_today,
            sum(cap_refusals) filter (where day = $1::date) as cap_today, sum(requests) as requests_month, sum(tokens_in + tokens_out) as tokens_month
       from control.ai_usage where day >= date_trunc('month', $1::date)::date and day <= $1::date
      group by profile_id order by profile_id`,
    [day]
  );
  const keys = await db.query(`select provider_id from control.ai_credentials where test_ok = false order by provider_id`);
  const searches = await db.query(`select searches from content.video_searches where day = $1::date`, [day]);
  const counts = await db.query(`select family.m2_counts() as c`);
  const base = {
    profiles: usage.rows.map((r: Record<string, unknown>) => ({
      profileId: String(r.profile_id),
      requestsToday: num(r.requests_today),
      failuresToday: num(r.failures_today),
      capRefusalsToday: num(r.cap_today),
      requestsMonth: num(r.requests_month),
      tokensMonth: num(r.tokens_month),
    })),
    failedKeys: keys.rows.map((r: Record<string, unknown>) => String(r.provider_id)),
    video: { used: num(searches.rows[0]?.searches), limit: await settingNumber(db, 'family.video_searches_per_day', 90) },
  };
  const thresholds: Thresholds = {
    aiFailureShare: await settingNumber(db, 'control.alert.ai_failure_share', 0.2),
    aiMinRequests: await settingNumber(db, 'control.alert.ai_min_requests', 10),
    videoQuotaShare: await settingNumber(db, 'control.alert.video_quota_share', 0.8),
  };
  return { day, ...base, counts: readM2Counts(counts.rows[0]?.c), alerts: alertsOf(base, thresholds) };
}
