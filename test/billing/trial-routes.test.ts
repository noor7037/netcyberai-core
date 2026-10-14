import { randomUUID } from 'crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The Control routes of the free month (C226, docs/30): who is let in, what each answers, and that a start and an
// extension reach the database as the platform role. On real Postgres (PGlite) with the billing migrations applied
// verbatim; only the connection is replaced, as test/control/billing-routes.test.ts does. Every school, person and
// reason is made up.

const h = vi.hoisted(() => ({
  db: null as unknown as import('../db/pglite-harness').TestDb,
}));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  return { ...real, withTenantContext: (claims: never, fn: (db: unknown) => Promise<unknown>) => h.db.tenant(claims, fn as never) };
});

import { createTestDb } from '../db/pglite-harness';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { GET as overviewRoute } from '@/app/api/control/billing/route';
import { GET as subscriptionRoute, POST as subscriptionPost } from '@/app/api/control/schools/[schoolId]/subscription/route';
import { applyPlan } from '@/lib/frameworks/plans';
import { indiaDate } from '@/lib/time/india';

const FOUNDER = randomUUID();
const PRINCIPAL = randomUUID();
const [SOON, LATER, PLAIN] = [randomUUID(), randomUUID(), randomUUID()];
const TODAY = indiaDate();
const day = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const req = (path: string, body?: unknown, cookie?: string) =>
  new NextRequest(`https://www.netcyberai.test${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
async function cookieFor(sub: string, role: string, schoolId: string | null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal: role === 'super_admin' ? 'aal2' : 'aal1', sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const q = async (sql: string, params: unknown[] = []) => (await h.db.platform((db) => db.query(sql, params))).rows;
const at = (schoolId: string) => ({ params: { schoolId } });
const post = (schoolId: string, body: unknown, cookie: string) => subscriptionPost(req(`/api/control/schools/${schoolId}/subscription`, body, cookie), at(schoolId));
let founder = '';
let principal = '';

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-trial-route-tests-0123456789';
  h.db = await createTestDb();
  await h.db.platform(async (db) => {
    await db.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up Soon School', 'IN-HR'), ($2, 'Made-up Later School', 'IN-DL'), ($3, 'Made-up Plain School', 'IN-UP')`, [SOON, LATER, PLAIN]);
    await db.query(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder'), ($2, $3, 'principal', 'Priya Principal')`, [FOUNDER, PRINCIPAL, SOON]);
    for (const school of [SOON, LATER, PLAIN]) {
      const r = await applyPlan(db, school, 'starter', { userId: FOUNDER, role: 'super_admin' }, 'made-up: the plan chosen at onboarding');
      if (!r.ok) throw new Error(r.error);
    }
  });
  founder = await cookieFor(FOUNDER, 'super_admin', null);
  principal = await cookieFor(PRINCIPAL, 'principal', SOON);
}, 60000);

describe('the free month through Control', () => {
  it('nobody without a session and nobody from a school starts or extends one, even their own school’s', async () => {
    const calls = (cookie?: string) => [
      subscriptionPost(req(`/api/control/schools/${SOON}/subscription`, { action: 'trial_start', reason: 'let me in' }, cookie), at(SOON)),
      subscriptionPost(req(`/api/control/schools/${SOON}/subscription`, { action: 'trial_extend', endsOn: day(40), reason: 'let me in' }, cookie), at(SOON)),
    ];
    expect((await Promise.all(calls())).map((r) => r.status)).toEqual([401, 401]);
    expect((await Promise.all(calls(principal))).map((r) => r.status)).toEqual([403, 403]);
    expect(await q(`select count(*)::int as n from school_trials`)).toEqual([{ n: 0 }]);
  });

  it('starts one to day 30 by default, with the plan after it; a second is refused in a code; the extension is checked and saved', async () => {
    const started = await post(SOON, { action: 'trial_start', reason: 'made-up: met at the fair' }, founder);
    expect([started.status, await started.json()]).toEqual([201, { ok: true, endsOn: day(30), planId: 'starter', modules: expect.any(Number) }]);
    const again = await post(SOON, { action: 'trial_start', reason: 'made-up: once more' }, founder);
    expect([again.status, (await again.json()).code]).toEqual([409, 'trial_used']);
    const later = await post(LATER, { action: 'trial_start', endsOn: day(45), planId: 'growth', reason: 'made-up: a longer look' }, founder);
    expect([later.status, (await later.json()).planId]).toEqual([201, 'growth']);
    const farPlain = await post(PLAIN, { action: 'trial_start', endsOn: day(91), reason: 'made-up: too far' }, founder);
    expect([farPlain.status, (await farPlain.json()).code]).toEqual([400, 'trial_ends_on']);

    const earlier = await post(SOON, { action: 'trial_extend', endsOn: day(29), reason: 'made-up: shorter' }, founder);
    expect([earlier.status, (await earlier.json()).code]).toEqual([400, 'trial_ends_on']);
    const none = await post(PLAIN, { action: 'trial_extend', endsOn: day(40), reason: 'made-up: none to extend' }, founder);
    expect([none.status, (await none.json()).code]).toEqual([400, 'no_trial']);
    const missing = await post(randomUUID(), { action: 'trial_extend', endsOn: day(40), reason: 'made-up: no such school' }, founder);
    expect(missing.status).toBe(404);
    const extended = await post(SOON, { action: 'trial_extend', endsOn: day(35), reason: 'made-up: exams week' }, founder);
    expect([extended.status, await extended.json()]).toEqual([200, { ok: true, endsOn: day(35) }]);
    expect(await q(`select school_id, ends_on::text as ends_on, started_by from school_trials order by ends_on`)).toEqual([
      { school_id: SOON, ends_on: day(35), started_by: FOUNDER },
      { school_id: LATER, ends_on: day(45), started_by: FOUNDER },
    ]);
  });

  it('Control reads each school’s free month with its reasons, and lists them by last day, soonest first', async () => {
    const res = await subscriptionRoute(req(`/api/control/schools/${SOON}/subscription`, undefined, founder), at(SOON));
    const got = await res.json();
    expect(got.trial).toMatchObject({ schoolId: SOON, startsOn: TODAY, endsOn: day(35), daysLeft: 35, inForce: true, planId: 'starter', planName: 'Starter', extensions: 1 });
    expect(got.trialHistory.map((e: { kind: string; reason: string }) => [e.kind, e.reason])).toEqual([
      ['extended', 'made-up: exams week'],
      ['started', 'made-up: met at the fair'],
    ]);
    const plain = await (await subscriptionRoute(req(`/api/control/schools/${PLAIN}/subscription`, undefined, founder), at(PLAIN))).json();
    expect([plain.trial, plain.trialHistory]).toEqual([null, []]);

    const overview = await (await overviewRoute(req('/api/control/billing', undefined, founder))).json();
    expect(overview.trials.map((x: { schoolId: string; endsOn: string }) => [x.schoolId, x.endsOn])).toEqual([
      [SOON, day(35)],
      [LATER, day(45)],
    ]);
    expect([overview.trialDays, overview.maxTrialDays, overview.trialNoticeDays]).toEqual([30, 90, 7]);
  });
});
