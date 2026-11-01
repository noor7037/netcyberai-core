import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// Linking a login to an existing person asks for the step-up proof (security review of W14-B); the proof itself is
// proven in test/auth; here it is given.
vi.mock('@/lib/auth/step-up', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/auth/step-up')>()), requireStepUp: async () => null }));
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
  // The account id Supabase answers with, in place of a new one (to make the database refuse after it was made).
  forceId: null as string | null,
  // Ids Supabase Auth holds no account for (seeded staff).
  noAccount: new Set<string>(),
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
    const userId = h.forceId ?? id ?? randomUUID();
    h.forceId = null;
    return { ok: true, userId };
  },
  hasLoginAccount: async (userId: string) => !h.noAccount.has(userId),
  deleteLoginAccount: async (userId: string) => {
    h.deleted.push(userId);
  },
}));

import { createTestDb } from '../db/pglite-harness';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { GET as noLoginStaff, POST as createLogin } from '@/app/api/control/schools/[schoolId]/logins/route';
import { GET as people } from '@/app/api/control/schools/[schoolId]/people/route';

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
  h.forceId = null;
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

describe('an invitation that was never sent (W11-B)', () => {
  it('is listed on the school’s page as not sent; a login made for that email withdraws it', async () => {
    const [inv] = await q(
      `insert into staff_invitations (school_id, email, email_key, display_name, role, source, invited_by) values ($1, 'neha@example.com', 'neha@example.com', 'Neha Joshi', 'teacher', 'staff', $2) returning invitation_id`,
      [A, FOUNDER]
    );
    await q(
      `insert into jobs (type, idempotency_key, school_id, payload, status, attempts, max_attempts, last_error, completed_at) values ('invite.send', $1, $2, $3, 'dead', 8, 8, 'invite failed: 500 unexpected_failure', now())`,
      [`invite.send:${inv.invitation_id}:1`, A, JSON.stringify({ invitationId: inv.invitation_id, sendNumber: 1, redirectTo: 'https://x.invalid' })]
    );
    const list = async () => (await (await people(new NextRequest(`https://www.netcyberai.test/api/control/schools/${A}/people`, { headers: { cookie: founder } }), { params: { schoolId: A } })).json()).invites;
    expect(await list()).toEqual([{ invitationId: inv.invitation_id, name: 'Neha Joshi', email: 'neha@example.com', role: 'teacher', state: 'failed', setting: null }]);

    expect((await post(A, { role: 'teacher', name: 'Neha Joshi', signIn: 'neha@example.com' })).status).toBe(201);
    expect((await q(`select status from staff_invitations where invitation_id = $1`, [inv.invitation_id]))[0].status).toBe('revoked');
    expect(await list()).toEqual([]);
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

  it('the same sign-in name twice in a school is refused before any account is made (W14-B)', async () => {
    const res = await post(A, { role: 'teacher', name: 'Asha Verma Two', signIn: 'Asha.Verma' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'taken' });
    expect(h.made).toHaveLength(0);
    expect(await q(`select count(*)::int as n from users where email = 'asha.verma@login.netcyberai.com'`)).toEqual([{ n: 1 }]);
  });

  it('the database refuses after the account was made: the account is removed', async () => {
    const [someone] = await q(`select user_id from users where email = 'asha.verma@login.netcyberai.com'`);
    h.forceId = someone.user_id;
    const res = await post(A, { role: 'teacher', name: 'Dev Malhotra', signIn: 'dev.malhotra' }).catch((e: unknown) => e);
    expect(res instanceof Error || (res as Response).status >= 500).toBe(true);
    expect(h.made).toHaveLength(1);
    expect(h.deleted).toEqual([someone.user_id]);
    expect(await q(`select 1 from users where email = 'dev.malhotra@login.netcyberai.com'`)).toHaveLength(0);
  });
});

describe('a login for a person the school already has (W14-B c)', () => {
  const GEETA = randomUUID();
  const RAVI = randomUUID();
  let geetaMembership = '';
  const listNoLogin = async () =>
    (await (await noLoginStaff(new NextRequest(`https://www.netcyberai.test/api/control/schools/${A}/logins`, { headers: { cookie: founder } }), { params: { schoolId: A } })).json()).staff;

  beforeAll(async () => {
    // Seeded staff: a users row and a membership, no sign-in account. Geeta has an email; Ravi none.
    await q(`insert into users (user_id, school_id, email, role, display_name) values ($1, $3, 'geeta@school-a.in', 'teacher', 'Geeta Kulkarni'), ($2, $3, null, 'teacher', 'Ravi Kapoor')`, [GEETA, RAVI, A]);
    geetaMembership = (await q(`insert into memberships (user_id, school_id, role) values ($1, $2, 'teacher') returning membership_id`, [GEETA, A]))[0].membership_id;
    await q(`insert into memberships (user_id, school_id, role) values ($1, $2, 'teacher')`, [RAVI, A]);
    h.noAccount.add(GEETA);
    h.noAccount.add(RAVI);
  });

  it('lists the school’s staff with no sign-in yet: no account, or no email', async () => {
    const staff = await listNoLogin();
    expect(staff).toEqual([
      { userId: GEETA, name: 'Geeta Kulkarni', role: 'teacher', signIn: 'geeta@school-a.in' },
      { userId: RAVI, name: 'Ravi Kapoor', role: 'teacher', signIn: null },
    ]);
  });

  it('links the login to that record: the account takes its id, no second person or membership is made', async () => {
    const people = async () => (await q(`select count(*)::int as n from memberships where school_id = $1`, [A]))[0].n;
    const before = await people();
    const res = await post(A, { role: 'teacher', name: 'Geeta Kulkarni', signIn: 'geeta.k', userId: GEETA });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ userId: GEETA, membershipId: geetaMembership, name: 'Geeta Kulkarni', role: 'teacher', signIn: 'geeta.k' });
    expect(h.made).toEqual([{ email: 'geeta.k@login.netcyberai.com', password: body.password, id: GEETA }]);
    expect(await people()).toBe(before);
    expect((await q(`select email from users where user_id = $1`, [GEETA]))[0].email).toBe('geeta.k@login.netcyberai.com');
    expect(await q(`select count(*)::int as n from users where lower(display_name) = 'geeta kulkarni'`)).toEqual([{ n: 1 }]);
    const [audit] = await q(`select after_state::text as after from audit_log where target_id = $1 and event_action = 'membership.login_created'`, [geetaMembership]);
    expect(JSON.parse(audit.after)).toEqual({ role: 'teacher', targetUserId: GEETA, signInKind: 'username', existingPerson: true });
  });

  it('sets the email of a person who had none', async () => {
    const res = await post(A, { role: 'teacher', name: 'Ravi Kapoor', signIn: 'ravi@school-a.in', userId: RAVI });
    expect(res.status).toBe(201);
    expect((await q(`select email from users where user_id = $1`, [RAVI]))[0].email).toBe('ravi@school-a.in');
  });

  it('a person of another school is not linked', async () => {
    const res = await post(B, { role: 'teacher', name: 'Geeta Kulkarni', signIn: 'geeta.b', userId: GEETA });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'staff' });
    expect(h.made).toHaveLength(0);
  });
});
