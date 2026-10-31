import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// W11-B, the QA run of 30 Oct: "View as" refused an active admin with "may no longer be active", and after End view
// Control answered {"error":"forbidden"} or asked for a new sign-in. Through the real routes and middleware on the
// whole schema (the harness database), as the founder's own session. Every name is made up.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const SCHOOL = 'eb000000-0000-4000-8000-000000000001';
const FOUNDER = 'eb000000-0000-4000-8000-0000000000f1';
const ADMIN = 'eb000000-0000-4000-8000-0000000000a1';
const OFF = 'eb000000-0000-4000-8000-0000000000a2';
let adminMembership = '';
let offMembership = '';

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-w11b-view-as-session-0123456789';
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${SCHOOL}', 'ZZ Test School', 'IN-KA');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${FOUNDER}', null, 'founder@w11b.invalid', 'super_admin', 'Founder', true),
      ('${ADMIN}', '${SCHOOL}', 'admin@w11b.invalid', 'school_admin', 'Asha Admin', true),
      ('${OFF}', '${SCHOOL}', 'off@w11b.invalid', 'teacher', 'Off Teacher', true);
  `);
  adminMembership = (await db.pg.query(`insert into memberships (user_id, school_id, role) values ($1, $2, 'school_admin') returning membership_id`, [ADMIN, SCHOOL])).rows[0].membership_id;
  offMembership = (await db.pg.query(`insert into memberships (user_id, school_id, role, is_active) values ($1, $2, 'teacher', false) returning membership_id`, [OFF, SCHOOL])).rows[0].membership_id;
}, 120_000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

async function founderAccess(ttlSeconds?: number) {
  const { signAccessToken } = await import('@/lib/auth/jwt');
  return signAccessToken({ sub: FOUNDER, role: 'super_admin', schoolId: null, membershipId: null, tokenVersion: 0, aal: 'aal2', sessionId: randomUUID() }, ttlSeconds);
}
async function founderRefresh(): Promise<string> {
  const { newRefreshToken, hashToken } = await import('@/lib/auth/hash');
  const token = newRefreshToken();
  await db.pg.query(
    `insert into sessions (user_id, refresh_token_hash, selected_school_id, token_version_snapshot, aal, expires_at, persistent)
     values ($1, $2, null, 0, 'aal2', now() + interval '30 days', true)`,
    [FOUNDER, hashToken(token)]
  );
  return token;
}
const cookieHeader = (c: Record<string, string>) => Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; ');
const post = (path: string, cookies: Record<string, string>, body?: unknown) =>
  new NextRequest(`https://www.netcyberai.test${path}`, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', cookie: cookieHeader(cookies) } });

async function startView(cookies: Record<string, string>, membershipId = adminMembership, target = ADMIN) {
  const { POST } = await import('@/app/api/control/impersonate/start/route');
  const { signStepUpToken } = await import('@/lib/auth/jwt');
  const { STEP_UP_COOKIE } = await import('@/lib/auth/step-up');
  return POST(post('/api/control/impersonate/start', { ...cookies, [STEP_UP_COOKIE]: await signStepUpToken(FOUNDER, 0, 900) }, { targetUserId: target, membershipId, reason: 'Checking the new school' }));
}

describe('starting a view names the real reason it did not start', () => {
  it('an active admin is viewed as; a switched-off membership and a person not in the school are named as such', async () => {
    const access = await founderAccess();
    const ok = await startView({ nca_access: access });
    expect(ok.status).toBe(200);
    const off = await startView({ nca_access: access }, offMembership, OFF);
    expect(await off.json()).toMatchObject({ code: 'membership_inactive' });
    const none = await startView({ nca_access: access }, randomUUID(), ADMIN);
    expect(await none.json()).toMatchObject({ code: 'no_membership' });
  });

  it('the screen says each one in its own words, never "no longer active" for a sign-in that ran out', async () => {
    const { viewAsRefusal } = await import('@/lib/control/people');
    expect(viewAsRefusal(401, { error: 'not authenticated' })).toBe('signed_out');
    expect(viewAsRefusal(403, { error: 'step_up_required' })).toBe('step_up');
    expect(viewAsRefusal(404, { code: 'membership_inactive' })).toBe('membership_inactive');
    expect(viewAsRefusal(409, { code: 'account_inactive' })).toBe('account_inactive');
    expect(viewAsRefusal(400, { code: 'aadhaar' })).toBe('aadhaar');
    expect(viewAsRefusal(500, null)).toBe('other');
    const { en } = await import('@/lib/i18n/messages/en');
    const { hi } = await import('@/lib/i18n/messages/hi');
    for (const r of ['signed_out', 'step_up', 'account_inactive', 'membership_inactive', 'no_membership', 'parent', 'other']) {
      expect(en[`viewAs.refused.${r}` as keyof typeof en]).toBeTruthy();
      expect(hi[`viewAs.refused.${r}` as keyof typeof hi]).toBeTruthy();
    }
  });
});

describe('ending a view puts the founder back in Control without a new sign-in', () => {
  it('the founder’s own token from the start had run out: End gives a fresh founder session, and /control opens', async () => {
    // The founder's access token was issued 15 minutes before the view began: it runs out a second after the start.
    const stale = await founderAccess(1);
    const refresh = await founderRefresh();
    const started = await startView({ nca_access: stale, nca_refresh: refresh });
    expect(started.status).toBe(200);
    const viewing = started.cookies.get('nca_access')!.value;
    const returned = started.cookies.get('nca_impersonation_return')!.value;
    expect(returned).toBe(stale);
    await new Promise((r) => setTimeout(r, 1100));

    const { POST: end } = await import('@/app/api/control/impersonate/end/route');
    const res = await end(post('/api/control/impersonate/end', { nca_access: viewing, nca_impersonation_return: returned, nca_refresh: refresh }));
    expect(res.status).toBe(200);
    const { verifyAccessToken } = await import('@/lib/auth/jwt');
    const back = await verifyAccessToken(res.cookies.get('nca_access')!.value);
    expect(back).toMatchObject({ sub: FOUNDER, role: 'super_admin', schoolId: null });
    expect(res.cookies.get('nca_refresh')?.value).toBeTruthy();
    expect(res.cookies.get('nca_refresh')!.value).not.toBe(refresh);
    expect((await db.pg.query(`select ended_at from impersonation_sessions where target_user_id = $1 order by started_at desc limit 1`, [ADMIN])).rows[0].ended_at).not.toBeNull();

    const { middleware } = await import('@/middleware');
    const control = await middleware(new NextRequest('https://www.netcyberai.test/control', { headers: { cookie: cookieHeader({ nca_access: res.cookies.get('nca_access')!.value }) } }));
    expect(control.status).toBe(200);
  });

  it('a view that ran out before End was pressed still puts the founder back', async () => {
    const refresh = await founderRefresh();
    const { POST: end } = await import('@/app/api/control/impersonate/end/route');
    const res = await end(post('/api/control/impersonate/end', { nca_refresh: refresh }));
    expect(res.status).toBe(200);
    expect((await (await import('@/lib/auth/jwt')).verifyAccessToken(res.cookies.get('nca_access')!.value))?.role).toBe('super_admin');
  });
});

describe('the gate keeps a renewed session on every answer', () => {
  it('an expired access token renewed on a Control page reaches that page’s layout, and a refusal keeps the new refresh token', async () => {
    const { POST: refreshRoute } = await import('@/app/api/auth/refresh/route');
    vi.stubGlobal('fetch', async (url: URL | string, init?: RequestInit) => refreshRoute(new NextRequest(String(url), init as never)));
    const { middleware } = await import('@/middleware');
    const stale = await founderAccess(-10);

    const page = await middleware(new NextRequest('https://www.netcyberai.test/control/schools', { headers: { cookie: cookieHeader({ nca_access: stale, nca_refresh: await founderRefresh() }) } }));
    expect(page.status).toBe(200);
    // Next hands the cookies set through `cookies` to the same request's server components by this header.
    expect(page.headers.get('x-middleware-set-cookie') ?? '').toMatch(/nca_access=/);
    expect(page.cookies.get('nca_refresh')?.value).toBeTruthy();

    // The founder on a school-app page: refused, but the rotated refresh token is kept, so the next page needs no sign-in.
    const refused = await middleware(new NextRequest('https://www.netcyberai.test/app/my-day', { headers: { cookie: cookieHeader({ nca_access: stale, nca_refresh: await founderRefresh() }) } }));
    expect(refused.status).toBe(403);
    expect(refused.cookies.get('nca_refresh')?.value).toBeTruthy();
    expect(refused.cookies.get('nca_access')?.value).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
