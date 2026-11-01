import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// W15-D: a school's own monthly AI-marking page limit, set by the founder in Control, sits above the plan's. On real
// Postgres (PGlite), through the routes: the plan's number reaches the school; the school's own number wins and survives
// the plan being applied again; clearing it puts the plan's number back; a school's session cannot do any of it.
// Every school, person and plan here is made up.

// The whole schema (every migration, as the screenshot harness applies them), because the marking limit is read through
// aiMarkingState, which needs the marking tables. Only the routes' connection is replaced, with the same role and settings.
type Tx = { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> };
const h = vi.hoisted(() => ({
  db: null as unknown as {
    stop(): Promise<void>;
    platform<T>(fn: (db: Tx) => Promise<T>): Promise<T>;
    tenant<T>(claims: { role: string; schoolId: string | null; sub: string }, fn: (db: Tx) => Promise<T>): Promise<T>;
  },
}));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  return { ...real, withTenantContext: (claims: never, fn: (db: unknown) => Promise<unknown>) => h.db.tenant(claims, fn as never) };
});

// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { POST as createPlanRoute } from '@/app/api/control/billing/route';
import { POST as planRoute } from '@/app/api/control/billing/plans/[planId]/route';
import { GET as entitlementsGet, PUT as entitlementsPut } from '@/app/api/control/schools/[schoolId]/entitlements/route';
import { aiMarkingState } from '@/lib/marking/context';

const FOUNDER = randomUUID();
const PRINCIPAL = randomUUID();
const SCHOOL = randomUUID();
const PLAN = 'w15d-plan';
const at = { params: { schoolId: SCHOOL } };
let founder = '';
let principal = '';

function req(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, cookie?: string): NextRequest {
  return new NextRequest(`https://www.netcyberai.test${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
}
async function cookieFor(sub: string, role: string, schoolId: string | null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal: role === 'super_admin' ? 'aal2' : 'aal1', sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const q = async (sql: string, params: unknown[] = []) => (await h.db.platform((db) => db.query(sql, params))).rows;
const planBody = (pages?: number) => ({
  planId: PLAN, name: 'W15D Made-up Plan', priceMonthRupees: '4,500', priceYearRupees: '45,000', graceDays: 10, allWorkingModules: false,
  moduleIds: ['students', 'exams'], limits: pages === undefined ? {} : { exams: { ai_marking_pages: pages } },
});
const setPlanLimit = async (pages?: number) => (await planRoute(req('POST', `/api/control/billing/plans/${PLAN}`, { action: 'edit', ...planBody(pages) }, founder), { params: { planId: PLAN } })).status;
const applyPlan = async () => (await entitlementsPut(req('PUT', `/api/control/schools/${SCHOOL}/entitlements`, { applyPlan: PLAN, reason: 'put the school on the plan' }, founder), at)).status;
const put = (body: Record<string, unknown>, cookie = founder) => entitlementsPut(req('PUT', `/api/control/schools/${SCHOOL}/entitlements`, { reason: 'the school asked for more pages', ...body }, cookie), at);
const setOwn = (n: unknown) => put({ moduleId: 'exams', enabled: true, limits: { ai_marking_pages: n } });
const clear = (extra: Record<string, unknown> = {}) => put({ moduleId: 'exams', enabled: true, clearLimit: 'ai_marking_pages', ...extra });
// What marking itself sees: read as the school's own principal, as the marking screens do.
const state = async () => h.db.tenant({ role: 'principal', schoolId: SCHOOL, sub: PRINCIPAL }, (db) => aiMarkingState(db as never, SCHOOL));
const row = async () => (await q(`select enabled, source, limits from school_module_entitlements where school_id = $1 and module_id = 'exams'`, [SCHOOL]))[0];

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-limit-override-tests-0123456789';
  const harness = await startHarnessDb({ port: 0 });
  const NIL = '00000000-0000-0000-0000-000000000000';
  h.db = {
    stop: () => harness.stop(),
    platform: (fn) =>
      harness.pg.transaction(async (tx: Tx) => {
        await tx.query('set local role nca_super');
        return fn(tx);
      }),
    tenant: (claims, fn) =>
      harness.pg.transaction(async (tx: Tx) => {
        await tx.query(`set local role ${claims.role === 'super_admin' ? 'nca_super' : 'app_user'}`);
        for (const [k, v] of [['app.current_tenant_id', claims.schoolId ?? NIL], ['app.current_role', claims.role], ['app.current_user_id', claims.sub]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
        return fn(tx);
      }),
  };
  await h.db.platform(async (db) => {
    await db.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up School', 'IN-HR')`, [SCHOOL]);
    await db.query(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder'), ($2, $3, 'principal', 'Priya Principal')`, [FOUNDER, PRINCIPAL, SCHOOL]);
  });
  founder = await cookieFor(FOUNDER, 'super_admin', null);
  principal = await cookieFor(PRINCIPAL, 'principal', SCHOOL);
  expect((await createPlanRoute(req('POST', '/api/control/billing', planBody(2000), founder))).status).toBe(201);
}, 120000);
afterAll(async () => {
  await h.db?.stop();
});

describe('a school’s own AI-marking page limit', () => {
  it('the plan’s limit reaches the school, the school’s own number wins and holds when the plan is applied again, and clearing puts the plan’s back', async () => {
    expect(await applyPlan()).toBe(200);
    expect(await row()).toEqual({ enabled: true, source: 'plan', limits: { ai_marking_pages: 2000 } });
    expect(await state()).toMatchObject({ limit: 2000 });

    expect((await setOwn(5000)).status).toBe(200);
    expect(await row()).toEqual({ enabled: true, source: 'founder_override', limits: { ai_marking_pages: 5000 } });
    expect(await state()).toMatchObject({ limit: 5000 });
    // Control sees both numbers: the school's own in its row, the plan's beside it.
    const seen = await (await entitlementsGet(req('GET', `/api/control/schools/${SCHOOL}/entitlements`, undefined, founder), at)).json();
    expect(seen.entitlements.modules.exams.limits).toEqual({ ai_marking_pages: 5000 });
    expect(seen.planLimits).toEqual({ exams: { ai_marking_pages: 2000 } });

    // The plan's number changes and the plan is applied again: the school's own number holds.
    expect(await setPlanLimit(3000)).toBe(200);
    expect(await applyPlan()).toBe(200);
    expect(await state()).toMatchObject({ limit: 5000 });
    expect((await row()).source).toBe('founder_override');

    // Clear: the plan's number is back, and the row is the plan's again, so the next apply owns it.
    expect((await clear()).status).toBe(200);
    expect(await row()).toEqual({ enabled: true, source: 'plan', limits: { ai_marking_pages: 3000 } });
    expect(await state()).toMatchObject({ limit: 3000 });
    expect(await setPlanLimit(4000)).toBe(200);
    expect(await applyPlan()).toBe(200);
    expect(await state()).toMatchObject({ limit: 4000 });
  });

  it('every change is audited with its reason, and the history says what changed', async () => {
    const history = (await (await entitlementsGet(req('GET', `/api/control/schools/${SCHOOL}/entitlements?history=1`, undefined, founder), at)).json()).history;
    const limitEntries = history.filter((e: { limit?: unknown }) => e.limit);
    expect(limitEntries.map((e: { limit: { from: number | null; to: number | null; toPlan?: boolean } }) => e.limit)).toEqual([
      { key: 'ai_marking_pages', from: 5000, to: 3000, toPlan: true },
      { key: 'ai_marking_pages', from: 2000, to: 5000 },
    ]);
    expect(limitEntries.map((e: { reason: string }) => e.reason)).toEqual(['the school asked for more pages', 'the school asked for more pages']);
  });

  it('a plan with no number for it: clearing removes the key, and the row is the plan’s again', async () => {
    expect(await setPlanLimit(undefined)).toBe(200);
    expect((await setOwn(7000)).status).toBe(200);
    expect(await state()).toMatchObject({ limit: 7000 });
    expect((await clear()).status).toBe(200);
    expect(await row()).toEqual({ enabled: true, source: 'plan', limits: {} });
    expect(await state()).toMatchObject({ on: false, why: 'no_limit', limit: null });
  });

  it('a clear that leaves another hand-made difference stays a founder override', async () => {
    expect(await setPlanLimit(2000)).toBe(200);
    expect(await applyPlan()).toBe(200);
    expect((await setOwn(9000)).status).toBe(200);
    // The module is switched off by hand as well: clearing the limit alone does not make the row the plan's.
    expect((await put({ moduleId: 'exams', enabled: false, clearLimit: 'ai_marking_pages' })).status).toBe(200);
    expect(await row()).toEqual({ enabled: false, source: 'founder_override', limits: { ai_marking_pages: 2000 } });
  });

  it('refuses a number that is not a whole number of at least 0, a clear of an unknown limit, a clear with no flag, and both at once', async () => {
    for (const bad of [-1, 1.5, '5000', null]) expect((await setOwn(bad)).status).toBe(400);
    expect((await clear({ clearLimit: 'no_such_limit' })).status).toBe(400);
    expect((await put({ moduleId: 'fees', enabled: true, clearLimit: 'ai_marking_pages' })).status).toBe(400); // Fees has no such limit
    expect((await put({ moduleId: 'exams', clearLimit: 'ai_marking_pages' })).status).toBe(400); // would otherwise switch the module off
    expect((await clear({ limits: { ai_marking_pages: 1 } })).status).toBe(400);
    expect((await clear({ reason: 'x' })).status).toBe(400); // a reason is required
    expect((await row()).limits).toEqual({ ai_marking_pages: 2000 });
  });

  it('a principal’s session cannot read or change it, and nobody without a session can', async () => {
    const before = await row();
    expect((await put({ moduleId: 'exams', enabled: true, limits: { ai_marking_pages: 1 } }, principal)).status).toBe(403);
    expect((await put({ moduleId: 'exams', enabled: true, clearLimit: 'ai_marking_pages' }, principal)).status).toBe(403);
    expect((await entitlementsGet(req('GET', `/api/control/schools/${SCHOOL}/entitlements`, undefined, principal), at)).status).toBe(403);
    expect((await put({ moduleId: 'exams', enabled: true, limits: { ai_marking_pages: 1 } }, '')).status).toBe(401);
    expect(await row()).toEqual(before);
  });
});
