import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import type { InviteFailure } from '@/lib/auth/invite-failure';

// Control → a school → People → "Create a login" (C230-D), through the real route on the real schema (PGlite, the
// B2 migrations). Only Supabase Auth's admin calls are replaced: the account is "made" here and its id returned.
//   a teacher with a username and a made password → a parent tied to a guardian → refusals → the clean-up when the
//   database refuses after the account was made.

const h = vi.hoisted(() => ({
  db: null as unknown as import('../db/pglite-harness').TestDb,
  made: [] as { email: string; password: string; id?: string }[],
  deleted: [] as string[],
  failNext: null as InviteFailure | null,
}));

vi.mock('@/lib/auth/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/db')>()),
  withTenantContext: (claims: never, fn: (db: unknown) => Promise<unknown>) => h.db.tenant(claims, fn as never),
}));
vi.mock('@/lib/auth/admin-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/admin-actions')>()),
  createLoginAccount: async (email: string, password: string, id?: string) => {
    if (h.failNext) {
      const failure = h.failNext;
      h.failNext = null;
      return { ok: false, failure };
    }
    h.made.push({ email, password, id });
    return { ok: true, userId: id ?? randomUUID() };
  },
  deleteLoginAccount: async (userId: string) => {
    h.deleted.push(userId);
  },
}));

import { createTestDb } from '../db/pglite-harness';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { POST as createLogin } from '@/app/api/control/schools/[schoolId]/logins/route';

const FOUNDER = randomUUID();
const A = randomUUID();
const B = randomUUID();
const GUARDIAN_A = randomUUID();
const GUARDIAN_B = randomUUID();

let founder = '';
let principal = '';

async function cookieFor(sub: string, role: string, schoolId: string | null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal: role === 'super_admin' ? 'aal2' : 'aal1', sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const post = (schoolId: string, body: unknown, cookie = founder) =>
  createLogin(
    new NextRequest(`https://www.netcyberai.test/api/control/schools/${schoolId}/logins`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', cookie } }),
    { params: { schoolId } }
  );
const q = async (sql: string, params: unknown[] = []) => (await h.db.platform((db) => db.query(sql, params))).rows;

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-create-login-tests-0123456789abc';
  h.db = await createTestDb();
  await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'School A', 'IN-HR'), ($2, 'School B', 'IN-DL')`, [A, B]);
  await q(`insert into parents (parent_id, school_id, name, phone) values ($1, $2, 'Rajesh Kumar', '+919800000001'), ($3, $4, 'Meena Rao', '+919800000002')`, [GUARDIAN_A, A, GUARDIAN_B, B]);
  founder = await cookieFor(FOUNDER, 'super_admin', null);
  principal = await cookieFor(randomUUID(), 'principal', A);
}, 60000);

beforeEach(() => {
  h.made.length = 0;
  h.deleted.length = 0;
  h.failNext = null;
});

describe('a staff login', () => {
  it('a teacher with a username and no password: the account, the users row, the membership and the audit row; the password once', async () => {
    const res = await post(A, { role: 'teacher', name: 'Asha  Verma', signIn: 'Asha.Verma' });
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body).toMatchObject({ schoolName: 'School A', role: 'teacher', name: 'Asha Verma', signIn: 'asha.verma' });
    expect(body.password).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    expect(h.made).toEqual([{ email: 'asha.verma@login.netcyberai.com', password: body.password, id: undefined }]);

    const [user] = await q(`select school_id, email, role, display_name, is_active, token_version from users where user_id = $1`, [body.userId]);
    expect(user).toEqual({ school_id: A, email: 'asha.verma@login.netcyberai.com', role: 'teacher', display_name: 'Asha Verma', is_active: true, token_version: 0 });
    const [m] = await q(`select user_id, school_id, role from memberships where membership_id = $1`, [body.membershipId]);
    expect(m).toEqual({ user_id: body.userId, school_id: A, role: 'teacher' });

    const audit = await q(`select event_action, after_state::text as after from audit_log where target_id = $1`, [body.membershipId]);
    expect(audit).toHaveLength(1);
    expect(audit[0].event_action).toBe('membership.login_created');
    expect(JSON.parse(audit[0].after)).toEqual({ role: 'teacher', targetUserId: body.userId, signInKind: 'username' });
    // Never the password, the name or the sign-in name.
    expect(audit[0].after).not.toContain(body.password);
    expect(audit[0].after).not.toContain('asha');
    expect(audit[0].after).not.toContain('Verma');
  });

  it('a typed password is the one used; an email works as the sign-in name', async () => {
    const res = await post(A, { role: 'principal', name: 'Kavita Singh', signIn: 'kavita@school-a.in', password: 'Sunrise-Morning-42' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ signIn: 'kavita@school-a.in', password: 'Sunrise-Morning-42' });
    expect(h.made[0]).toMatchObject({ email: 'kavita@school-a.in', password: 'Sunrise-Morning-42' });
  });
});

describe('a parent login', () => {
  it('is the guardian: the account id is the guardian’s parent_id and the name is the guardian’s', async () => {
    const res = await post(A, { role: 'parent', parentId: GUARDIAN_A, signIn: 'rajesh.k' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ userId: GUARDIAN_A, role: 'parent', name: 'Rajesh Kumar' });
    expect(h.made[0].id).toBe(GUARDIAN_A);
    const [user] = await q(`select role, display_name from users where user_id = $1`, [GUARDIAN_A]);
    expect(user).toEqual({ role: 'parent', display_name: 'Rajesh Kumar' });
  });

  it('one login per guardian: a second is refused before any account is made', async () => {
    const res = await post(A, { role: 'parent', parentId: GUARDIAN_A, signIn: 'rajesh.k2' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'already_registered' });
    expect(h.made).toHaveLength(0);
  });

  it('a guardian of another school is refused', async () => {
    const res = await post(A, { role: 'parent', parentId: GUARDIAN_B, signIn: 'meena.r' });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'guardian' });
    expect(h.made).toHaveLength(0);
  });
});

describe('refusals', () => {
  it('only the founder: a principal’s session is refused', async () => {
    const res = await post(A, { role: 'teacher', name: 'Someone Else', signIn: 'someone' }, principal);
    expect(res.status).toBe(403);
    expect(h.made).toHaveLength(0);
  });

  it('bad input says which field, and makes nothing', async () => {
    const res = await post(A, { role: 'teacher', name: 'X', signIn: 'ok.name' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'name' });
    expect(h.made).toHaveLength(0);
  });

  it('the service key wrong: 503 naming the setting, and no rows', async () => {
    h.failNext = 'service_key';
    const res = await post(A, { role: 'teacher', name: 'Ravi Das', signIn: 'ravi.das' });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'service_key', setting: expect.any(String) });
    expect(await q(`select 1 from users where email = 'ravi.das@login.netcyberai.com'`)).toHaveLength(0);
  });

  it('the database refuses after the account was made (the same sign-in name twice in a school): the account is removed', async () => {
    const res = await post(A, { role: 'teacher', name: 'Asha Verma Two', signIn: 'asha.verma' }).catch((e: unknown) => e);
    expect(res instanceof Error || (res as Response).status >= 500).toBe(true);
    expect(h.made).toHaveLength(1);
    expect(h.deleted).toHaveLength(1);
    expect(await q(`select count(*)::int as n from users where email = 'asha.verma@login.netcyberai.com'`)).toEqual([{ n: 1 }]);
  });
});
