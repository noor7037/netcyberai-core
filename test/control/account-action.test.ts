import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';

// Control → a school → People → a person's account (W14-B), through the real route on the real schema (PGlite).
// Only Supabase Auth's admin client is replaced, by a small stand-in that holds accounts by id; the step-up proof is
// taken as given (its own tests are in test/auth/authenticator-flow.test.ts).
//   a seeded teacher (a users row, no sign-in account) gets a password and a link → deactivate, with every session
//   revoked at once → reactivate → remove from one of two schools → remove from the only school.

const h = vi.hoisted(() => ({
  db: null as unknown as import('../db/pglite-harness').TestDb,
  accounts: new Map<string, { email: string; password: string }>(),
  updated: [] as string[],
}));

vi.mock('@/lib/auth/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/db')>()),
  withTenantContext: (claims: never, fn: (db: unknown) => Promise<unknown>) => h.db.tenant(claims, fn as never),
  withBackendConnection: (fn: (db: unknown) => Promise<unknown>) => h.db.asRole('app_backend', {}, fn as never),
  bumpTokenVersion: async (userId: string) =>
    Number((await h.db.platform((db) => db.query(`update users set token_version = token_version + 1 where user_id = $1 returning token_version`, [userId]))).rows[0].token_version),
}));
vi.mock('@/lib/auth/env', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/auth/env')>()), hasServiceRoleKey: () => true }));
vi.mock('@/lib/auth/step-up', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/auth/step-up')>()), requireStepUp: async () => null }));
vi.mock('@/lib/auth/supabase', () => {
  const notFound = { status: 404, code: 'user_not_found', message: 'User not found' };
  const admin = {
    getUserById: async (id: string) => (h.accounts.has(id) ? { data: { user: { id } }, error: null } : { data: { user: null }, error: notFound }),
    updateUserById: async (id: string, attrs: { password: string }) => {
      const a = h.accounts.get(id);
      if (!a) return { data: { user: null }, error: notFound };
      a.password = attrs.password;
      h.updated.push(id);
      return { data: { user: { id } }, error: null };
    },
    createUser: async ({ email, password, id }: { email: string; password: string; id?: string }) => {
      const userId = id ?? randomUUID();
      h.accounts.set(userId, { email, password });
      return { data: { user: { id: userId } }, error: null };
    },
    deleteUser: async (id: string) => (h.accounts.delete(id) ? { data: {}, error: null } : { data: {}, error: notFound }),
    generateLink: async () => ({ data: { properties: { hashed_token: 'hashed', email_otp: '123456' } }, error: null }),
  };
  return { newAuthAdminClient: () => ({ auth: { admin } }), newAuthClient: () => ({}) };
});

import { createTestDb } from '../db/pglite-harness';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { POST as accountAction } from '@/app/api/control/users/[userId]/account-action/route';

const FOUNDER = randomUUID();
const A = randomUUID();
const B = randomUUID();
const GEETA = randomUUID(); // seeded: a users row and a membership, no sign-in account, an email
const RAVI = randomUUID(); // seeded with no email
const ASHA = randomUUID(); // in schools A and B, with a sign-in account
const MEERA = randomUUID(); // only in school A, with a sign-in account
const membership: Record<string, string> = {};

let founder = '';
const q = async (sql: string, params: unknown[] = []) => (await h.db.platform((db) => db.query(sql, params))).rows;
const act = (userId: string, body: Record<string, unknown>) =>
  accountAction(
    new NextRequest(`https://www.netcyberai.test/api/control/users/${userId}/account-action`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', cookie: founder } }),
    { params: { userId } }
  );
const openSessions = async (userId: string) => (await q(`select count(*)::int as n from sessions where user_id = $1 and revoked_at is null`, [userId]))[0].n;
const audits = (userId: string, action: string) =>
  q(`select a.after_state::text as after, r.reason from audit_log a left join entitlement_change_reasons r on r.audit_id = a.audit_id where a.target_id = $1 and a.event_action = $2 order by a.audit_id`, [userId, action]);

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-account-action-tests-0123456789';
  h.db = await createTestDb();
  // The sessions and remembered devices of the real schema (the migrations of 2026-09-17 and F1), as this small
  // database does not have them.
  await h.db.query(`create table sessions (
    session_id uuid primary key default gen_random_uuid(), user_id uuid not null references users(user_id), refresh_token_hash text not null unique,
    selected_school_id uuid references schools(school_id), token_version_snapshot integer not null, aal text not null default 'aal1',
    created_at timestamptz not null default now(), last_used_at timestamptz not null default now(), expires_at timestamptz not null, revoked_at timestamptz)`);
  await h.db.query(`create table trusted_devices (device_id uuid primary key default gen_random_uuid(), user_id uuid not null references users(user_id) on delete cascade, revoked_at timestamptz)`);
  await h.db.query(`grant select, insert, update on sessions, trusted_devices to app_backend`);
  await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'School A', 'IN-HR'), ($2, 'School B', 'IN-DL')`, [A, B]);
  await q(
    `insert into users (user_id, school_id, email, role, display_name) values
       ($1, $5, 'geeta@school-a.in', 'teacher', 'Geeta Kulkarni'), ($2, $5, null, 'teacher', 'Ravi Das'),
       ($3, $5, 'asha@school-a.in', 'teacher', 'Asha Verma'), ($4, $5, 'meera@school-a.in', 'teacher', 'Meera Iyer')`,
    [GEETA, RAVI, ASHA, MEERA, A]
  );
  for (const [user, school, key] of [[GEETA, A, 'geeta'], [RAVI, A, 'ravi'], [ASHA, A, 'ashaA'], [ASHA, B, 'ashaB'], [MEERA, A, 'meera']]) {
    membership[key] = (await q(`insert into memberships (user_id, school_id, role) values ($1, $2, 'teacher') returning membership_id`, [user, school]))[0].membership_id;
  }
  const token = await signAccessToken({ sub: FOUNDER, role: 'super_admin', schoolId: null, membershipId: null, tokenVersion: 0, aal: 'aal2', sessionId: randomUUID() });
  founder = `${ACCESS_COOKIE}=${token}`;
}, 60000);

beforeEach(() => {
  h.updated.length = 0;
  h.accounts.set(ASHA, { email: 'asha@school-a.in', password: 'Old-Password-1' });
  h.accounts.set(MEERA, { email: 'meera@school-a.in', password: 'Old-Password-1' });
});

describe('a person seeded with no sign-in account (W14-B a)', () => {
  it('a new password makes the account first, with the same id and email, and says so', async () => {
    const res = await act(GEETA, { action: 'temp_password', password: 'Sunrise-Morning-42' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'done', action: 'temp_password', loginCreated: true });
    expect(h.accounts.get(GEETA)).toEqual({ email: 'geeta@school-a.in', password: 'Sunrise-Morning-42' });
    const [row] = await audits(GEETA, 'user.console.temp_password');
    expect(JSON.parse(row.after)).toEqual({ action: 'temp_password', loginCreated: true });
    expect(row.after).not.toContain('Sunrise');

    // The next new password changes the account that is there now.
    const again = await act(GEETA, { action: 'temp_password', password: 'Another-Morning-42' });
    expect(again.status).toBe(200);
    expect(await again.json()).not.toHaveProperty('loginCreated');
    expect(h.updated).toEqual([GEETA]);
    expect(h.accounts.get(GEETA)?.password).toBe('Another-Morning-42');
  });

  it('a sign-in link makes the account first too; a person with no email is told so, and nothing is made', async () => {
    h.accounts.delete(GEETA);
    const res = await act(GEETA, { action: 'signin_link' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ loginCreated: true, code: '123456' });
    expect(h.accounts.get(GEETA)?.email).toBe('geeta@school-a.in');

    const none = await act(RAVI, { action: 'temp_password', password: 'Sunrise-Morning-42' });
    expect(none.status).toBe(409);
    expect(await none.json()).toEqual({ error: 'no_email' });
    expect(h.accounts.has(RAVI)).toBe(false);
  });
});

describe('deactivate and reactivate (W14-B b)', () => {
  it('a reason is required, and an Aadhaar number in it is refused', async () => {
    expect((await act(ASHA, { action: 'deactivate', membershipId: membership.ashaA })).status).toBe(400);
    const aadhaar = await act(ASHA, { action: 'deactivate', membershipId: membership.ashaA, reason: 'Card 1234 5678 9012' });
    expect(await aadhaar.json()).toMatchObject({ error: 'reason', code: 'aadhaar' });
    expect((await q(`select is_active from memberships where membership_id = $1`, [membership.ashaA]))[0].is_active).toBe(true);
  });

  it('switches the membership off and revokes every session of the person immediately; the reason is founder-only', async () => {
    await q(`insert into sessions (user_id, refresh_token_hash, token_version_snapshot, expires_at) values ($1, 'h1', 0, now() + interval '1 day'), ($1, 'h2', 0, now() + interval '1 day')`, [MEERA]);
    expect(await openSessions(MEERA)).toBe(2);
    const before = (await q(`select token_version from users where user_id = $1`, [MEERA]))[0].token_version;

    const res = await act(MEERA, { action: 'deactivate', membershipId: membership.meera, reason: 'Left the school in October' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'done', action: 'deactivate', signedOut: 2 });
    expect(await openSessions(MEERA)).toBe(0);
    expect((await q(`select token_version from users where user_id = $1`, [MEERA]))[0].token_version).toBe(before + 1);
    expect((await q(`select is_active from memberships where membership_id = $1`, [membership.meera]))[0].is_active).toBe(false);
    // The sign-in account stays: the person can be reactivated.
    expect(h.accounts.has(MEERA)).toBe(true);

    const [row] = await audits(MEERA, 'user.deactivated');
    expect(JSON.parse(row.after)).toEqual({ membershipId: membership.meera, reasoned: true });
    expect(row.after).not.toContain('October');
    expect(row.reason).toBe('Left the school in October');
  });

  it('reactivate switches it back on, with its own audit row', async () => {
    const res = await act(MEERA, { action: 'reactivate', membershipId: membership.meera, reason: 'Came back' });
    expect(res.status).toBe(200);
    expect((await q(`select is_active from memberships where membership_id = $1`, [membership.meera]))[0].is_active).toBe(true);
    expect(await audits(MEERA, 'user.reactivated')).toHaveLength(1);
  });

  it('a membership that is not this person’s is not found; the founder’s own account is refused', async () => {
    expect((await act(MEERA, { action: 'deactivate', membershipId: membership.geeta, reason: 'x reason' })).status).toBe(404);
    expect((await act(FOUNDER, { action: 'deactivate', membershipId: membership.geeta, reason: 'x reason' })).status).toBe(409);
  });
});

describe('remove (W14-B b)', () => {
  it('from one of two schools: that membership goes, the sign-in account stays, sessions are revoked', async () => {
    await q(`insert into sessions (user_id, refresh_token_hash, token_version_snapshot, expires_at) values ($1, 'h3', 0, now() + interval '1 day')`, [ASHA]);
    const res = await act(ASHA, { action: 'remove', membershipId: membership.ashaB, reason: 'Never worked at B' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ action: 'remove', signedOut: 1, accountDeleted: false });
    expect(await q(`select 1 from memberships where membership_id = $1`, [membership.ashaB])).toHaveLength(0);
    expect((await q(`select is_active from users where user_id = $1`, [ASHA]))[0].is_active).toBe(true);
    expect(h.accounts.has(ASHA)).toBe(true);
    const [row] = await audits(ASHA, 'user.removed');
    expect(JSON.parse(row.after)).toEqual({ membershipId: membership.ashaB, membershipDeleted: true, accountDeleted: false, reasoned: true });
  });

  it('from the only school: the person is kept inactive (the records name them) and the sign-in account is deleted', async () => {
    const res = await act(MEERA, { action: 'remove', membershipId: membership.meera, reason: 'Duplicate record' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ action: 'remove', accountDeleted: true });
    expect((await q(`select m.is_active as m, u.is_active as u from memberships m join users u using (user_id) where m.membership_id = $1`, [membership.meera]))[0]).toEqual({ m: false, u: false });
    expect(h.accounts.has(MEERA)).toBe(false);
    const [row] = await audits(MEERA, 'user.removed');
    expect(JSON.parse(row.after)).toMatchObject({ accountDeleted: true, reasoned: true });
    expect(row.reason).toBe('Duplicate record');
  });
});
