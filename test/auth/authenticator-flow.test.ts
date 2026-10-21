import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeSupabase as fake, type FakeUser } from './in-memory-supabase';

// C95 end-to-end checks of authenticator set-up, replacement and removal:
// the real routes and auth code, with Supabase Auth and Postgres replaced by
// the in-memory stand-in in test/auth/in-memory-supabase.ts (no network, no database).
// Codes are real TOTP codes computed from the secret the fake issued.

vi.mock('@/lib/auth/supabase', async () => {
  const { fakeSupabase } = await import('./in-memory-supabase');
  return { newAuthClient: () => fakeSupabase.client(), newAuthAdminClient: () => fakeSupabase.admin() };
});
// Friendly names stay real, except in the race test below, which makes them
// distinct so Supabase's same-name refusal cannot hide a race.
vi.mock('@/lib/auth/authenticator-rules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/authenticator-rules')>();
  return { ...actual, authenticatorFriendlyName: vi.fn(actual.authenticatorFriendlyName) };
});
vi.mock('@/lib/auth/env', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/auth/env')>()), hasServiceRoleKey: () => true }));
vi.mock('@/lib/auth/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/db')>();
  const { fakeSupabase } = await import('./in-memory-supabase');
  const run = <T>(fn: (c: never) => Promise<T>) => fn(fakeSupabase.db() as never);
  return {
    ...actual,
    withSelfContext: (_userId: string, fn: (c: never) => Promise<unknown>) => run(fn),
    withBackendConnection: run,
    withSuperAdminBypass: run,
    withTenantContext: (_claims: unknown, fn: (c: never) => Promise<unknown>) => run(fn),
    bumpTokenVersion: (userId: string) =>
      run(async (c: { query: (s: string, p: unknown[]) => Promise<{ rows: { token_version: number }[] }> }) => {
        const { rows } = await c.query('update users set token_version = token_version + 1 where user_id = $1', [userId]);
        return Number(rows[0].token_version);
      }),
    emailForPhone: async () => null,
  };
});

import { changePassword, completeEmailStep, loginWithEmailCode, passwordLogin, resetPasswordWithCode } from '@/lib/auth/account';
import { signAccessToken, signDeviceToken, signPendingToken } from '@/lib/auth/jwt';
import { trustDevice } from '@/lib/auth/devices';
import { ACCESS_COOKIE, AUTHENTICATOR_COOKIE, DEVICE_COOKIE, KEEP_COOKIE, PENDING_COOKIE, REFRESH_COOKIE } from '@/lib/auth/cookies';
import { authenticatorFriendlyName } from '@/lib/auth/authenticator-rules';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as emailStepRoute } from '@/app/api/auth/email-step/route';
import { POST as codeVerifyRoute } from '@/app/api/auth/code/verify/route';
import { POST as forgetThisDeviceRoute } from '@/app/api/auth/device/forget/route';
import { GET as devicesRoute, POST as forgetDeviceRoute } from '@/app/api/auth/devices/route';
import { POST as logoutAllRoute } from '@/app/api/auth/logout-all/route';
import { POST as mfaVerifyRoute } from '@/app/api/auth/mfa/verify/route';
import { POST as signInSetupStart } from '@/app/api/auth/mfa/setup/start/route';
import { POST as signInSetupVerify } from '@/app/api/auth/mfa/setup/verify/route';
import { POST as accountSetupStart } from '@/app/api/auth/authenticator/start/route';
import { POST as accountSetupVerify } from '@/app/api/auth/authenticator/verify/route';
import { POST as founderAction } from '@/app/api/control/users/[userId]/account-action/route';

const PASSWORD = 'test-only password 1';
const SESSION_ID = '00000000-0000-4000-8000-00000000c950';

function post(path: string, body: unknown, cookies: Record<string, string> = {}): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
}

async function accessCookie(user: FakeUser) {
  const token = await signAccessToken({
    sub: user.id,
    role: user.role as never,
    schoolId: user.role === 'super_admin' ? null : '00000000-0000-4000-8000-0000000005c1',
    membershipId: user.role === 'super_admin' ? null : '00000000-0000-4000-8000-0000000005c2',
    tokenVersion: user.token_version,
    aal: 'aal2',
    sessionId: SESSION_ID,
  });
  return { [ACCESS_COOKIE]: token };
}

const unverified = (user: FakeUser) => fake.factorsOf(user.id).filter((f) => f.status === 'unverified');
const verified = (user: FakeUser) => fake.factorsOf(user.id).filter((f) => f.status === 'verified');

// Everything that must never carry the QR code, setup key or otpauth URI.
const consoleLines: string[] = [];
const issuedSecrets: string[] = [];
function rememberEnrolment(body: Record<string, unknown>) {
  if (typeof body.factorId !== 'string') return;
  for (const k of ['qrCode', 'uri']) issuedSecrets.push(String(body[k]));
  issuedSecrets.push(String(body.setupKey).replace(/\s+/g, ''));
}

beforeAll(() => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-authenticator-flow-tests-0123456789';
});

beforeEach(() => {
  fake.reset();
  delete process.env.AUTH_EMAIL_STEP;
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      consoleLines.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  // (2) Nothing written to the audit log or any console, in any test, holds a
  // QR code, setup key or otpauth URI; error bodies are checked where made.
  const logged = JSON.stringify(fake.auditRows) + consoleLines.join('\n');
  for (const secret of issuedSecrets) expect(logged).not.toContain(secret);
  for (const f of fake.factors) expect(logged).not.toContain(f.secret);
});

async function signInToSetupStep(admin: FakeUser): Promise<string> {
  const step = await passwordLogin(admin.email, PASSWORD);
  expect(step.status).toBe('email_step');
  const outcome = (await completeEmailStep((step as { pendingToken: string }).pendingToken, fake.emailedCodes.get(admin.email)!)).outcome;
  expect(outcome.status).toBe('mfa_setup');
  return (outcome as { pendingToken: string }).pendingToken;
}

describe('(3) enrolment at sign-in needs the password and the email in the same sign-in', () => {
  it('offers set-up after password + emailed code', async () => {
    const admin = fake.addUser({ email: 'admin@test.invalid', password: PASSWORD, role: 'super_admin' });
    await signInToSetupStep(admin);
  });

  it('refuses an emailed code alone', async () => {
    const admin = fake.addUser({ email: 'admin@test.invalid', password: PASSWORD, role: 'super_admin' });
    fake.emailedCodes.set(admin.email, '424242');
    await expect(loginWithEmailCode(admin.email, '424242')).rejects.toMatchObject({ code: 'mfa_not_enrolled' });
    expect(fake.factorsOf(admin.id)).toHaveLength(0);
  });

  it('refuses a password alone (email step switched off)', async () => {
    const admin = fake.addUser({ email: 'admin@test.invalid', password: PASSWORD, role: 'super_admin' });
    process.env.AUTH_EMAIL_STEP = 'off';
    await expect(passwordLogin(admin.email, PASSWORD)).rejects.toMatchObject({ code: 'mfa_not_enrolled' });
    expect(fake.factorsOf(admin.id)).toHaveLength(0);
  });

  it('refuses a set-up token whose Supabase session proved only the password', async () => {
    const admin = fake.addUser({ email: 'admin@test.invalid', password: PASSWORD, role: 'super_admin' });
    const { data } = await fake.client().auth.signInWithPassword({ email: admin.email, password: PASSWORD });
    const forged = await signPendingToken({
      userId: admin.id,
      purpose: 'mfa_setup',
      aal: 'aal1',
      sbAccessToken: data.session!.access_token,
      sbRefreshToken: data.session!.refresh_token,
    });
    const res = await signInSetupStart(post('/api/auth/mfa/setup/start', {}, { [PENDING_COOKIE]: forged }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'pending_token_invalid' });
    expect(fake.factorsOf(admin.id)).toHaveLength(0);
  });
});

describe('(3) the mailbox alone cannot stand in for the password (security review)', () => {
  it('refuses an email-only password reset for a platform admin without an authenticator', async () => {
    const admin = fake.addUser({ email: 'admin@test.invalid', password: PASSWORD, role: 'super_admin' });
    fake.emailedCodes.set(admin.email, '515151');
    await expect(resetPasswordWithCode(admin.email, '515151', 'attacker chosen 1')).rejects.toMatchObject({
      code: 'admin_reset_needs_founder',
    });
    expect(admin.password).toBe(PASSWORD);
    // So the chosen password cannot open the setup step either.
    await expect(passwordLogin(admin.email, 'attacker chosen 1')).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('still lets a platform admin with an authenticator reset by email plus its code', async () => {
    const admin = fake.addUser({ email: 'admin@test.invalid', password: PASSWORD, role: 'super_admin' });
    const factor = fake.addVerifiedFactor(admin.id);
    fake.emailedCodes.set(admin.email, '525252');
    const out = await resetPasswordWithCode(admin.email, '525252', 'new password 22', fake.codeFor(factor));
    expect(out.status).toBe('signed_in');
    expect(admin.password).toBe('new password 22');
  });
});

describe('C96: what follows the password', () => {
  const login = (identifier: string, password: string, cookies: Record<string, string> = {}) =>
    loginRoute(post('/api/auth/login', { identifier, password }, cookies));

  it('an authenticator account: password, then its code only; no email is sent, untrusted or trusted only by email', async () => {
    for (const role of ['super_admin', 'principal']) {
      fake.reset();
      const user = fake.addUser({ email: `${role}@test.invalid`, password: PASSWORD, role });
      const factor = fake.addVerifiedFactor(user.id);
      const byEmail = (await trustDevice(user.id, 'email', null)).token;
      // A token with no trusted row behind it (forged with the right key, or from before F1) counts for nothing.
      const rowless = await signDeviceToken(user.id, user.token_version, '00000000-0000-4000-8000-0000000000d1', 3600);
      for (const cookies of [{}, { [DEVICE_COOKIE]: byEmail }, { [DEVICE_COOKIE]: rowless }] as Record<string, string>[]) {
        const res = await login(user.email, PASSWORD, cookies);
        expect(await res.json()).toEqual({ status: 'mfa_required' });
        const pending = { [PENDING_COOKIE]: res.cookies.get(PENDING_COOKIE)!.value };
        // A wrong code is named as the authenticator's.
        const wrong = await mfaVerifyRoute(post('/api/auth/mfa/verify', { code: '000000' }, pending));
        expect((await wrong.json()).error).toBe('mfa_invalid_code');
        const right = await mfaVerifyRoute(post('/api/auth/mfa/verify', { code: fake.codeFor(factor) }, pending));
        // A platform admin is in; a principal passes the code (this stand-in has no school memberships).
        expect((await right.json()).status).toBe(role === 'super_admin' ? 'ok' : 'no_memberships');
      }
      expect(fake.sentCodes).toEqual([]);
    }
  });

  it('a staff account without one: password, then the emailed code', async () => {
    const teacher = fake.addUser({ email: 'noorislam8@test.invalid', password: PASSWORD, role: 'teacher' });
    const res = await login(teacher.email, PASSWORD);
    expect(await res.json()).toEqual({ status: 'email_step', maskedEmail: 'n•••8@test.invalid', setupNext: false });
    expect(fake.sentCodes).toEqual([teacher.email]);
    const pending = { [PENDING_COOKIE]: res.cookies.get(PENDING_COOKIE)!.value };
    // An authenticator-style code typed here is named as a wrong email code.
    const wrong = await emailStepRoute(post('/api/auth/email-step', { code: '000000' }, pending));
    expect((await wrong.json()).error).toBe('code_invalid');
    const right = await emailStepRoute(post('/api/auth/email-step', { code: fake.emailedCodes.get(teacher.email) }, pending));
    expect((await right.json()).status).toBe('no_memberships');
  });

  it('a remembered device skips the emailed code for staff, never for a platform admin without an authenticator', async () => {
    const teacher = fake.addUser({ email: 'teacher@test.invalid', password: PASSWORD, role: 'teacher' });
    const admin = fake.addUser({ email: 'admin@test.invalid', password: PASSWORD, role: 'super_admin' });
    const teacherDevice = { [DEVICE_COOKIE]: (await trustDevice(teacher.id, 'email', null)).token };
    const adminDevice = { [DEVICE_COOKIE]: (await trustDevice(admin.id, 'email', null)).token };
    expect((await (await login(teacher.email, PASSWORD, teacherDevice)).json()).status).toBe('no_memberships');
    expect(await (await login(admin.email, PASSWORD, adminDevice)).json()).toMatchObject({ status: 'email_step', setupNext: true });
    expect(fake.sentCodes).toEqual([admin.email]);
  });
});

describe('(6) start, abandon, start again: at most one unconfirmed authenticator', () => {
  it('during sign-in, one after another and two at once', async () => {
    const admin = fake.addUser({ email: 'admin@test.invalid', password: PASSWORD, role: 'super_admin' });
    const cookies = { [PENDING_COOKIE]: await signInToSetupStep(admin) };

    for (let i = 0; i < 3; i++) {
      const res = await signInSetupStart(post('/api/auth/mfa/setup/start', {}, cookies));
      expect(res.status).toBe(200);
      rememberEnrolment(await res.json());
      expect(unverified(admin)).toHaveLength(1);
    }
    // Two at once (double click, two tabs) in the same second: Supabase
    // refuses the second name, so one setup and one clean error.
    let bodies = await Promise.all(
      [1, 2].map(async () => (await signInSetupStart(post('/api/auth/mfa/setup/start', {}, cookies))).json())
    );
    bodies.forEach(rememberEnrolment);
    expect(unverified(admin)).toHaveLength(1);
    // Two at once a second apart (distinct names), fully interleaved: both
    // clean up before enrolling, so only the clean-up after enrolling keeps
    // it to one, the newest.
    let n = 0;
    vi.mocked(authenticatorFriendlyName).mockImplementation(() => `race ${n++}`);
    bodies = await Promise.all(
      [1, 2].map(async () => (await signInSetupStart(post('/api/auth/mfa/setup/start', {}, cookies))).json())
    );
    bodies.forEach(rememberEnrolment);
    expect(bodies.every((b) => typeof b.factorId === 'string')).toBe(true);
    expect(unverified(admin)).toHaveLength(1);
    expect(bodies.map((b) => b.factorId)).toContain(unverified(admin)[0].id);

    // The surviving setup finishes sign-in at aal2 with its first code.
    const survivor = unverified(admin)[0];
    const done = await signInSetupVerify(post('/api/auth/mfa/setup/verify', { factorId: survivor.id, code: fake.codeFor(survivor) }, cookies));
    expect(done.status).toBe(200);
    expect(done.headers.get('cache-control')).toBe('no-store');
    expect((await done.json()).status).toBe('ok');
    expect(verified(admin).map((f) => f.id)).toEqual([survivor.id]);
    expect(unverified(admin)).toHaveLength(0);
    expect(fake.auditRows.map((r) => r.event_action)).toEqual(['user.authenticator.enrolled']);
  });

  it('on the account page', async () => {
    const principal = fake.addUser({ email: 'principal@test.invalid', password: PASSWORD, role: 'principal' });
    const cookies = await accessCookie(principal);
    for (let i = 0; i < 3; i++) {
      const res = await accountSetupStart(post('/api/auth/authenticator/start', { currentPassword: PASSWORD }, cookies));
      expect(res.status).toBe(200);
      rememberEnrolment(await res.json());
      expect(unverified(principal)).toHaveLength(1);
    }
  });
});

describe('(1) replace: exactly one confirmed authenticator afterwards, the old one deleted', () => {
  it('removes the old one only after the new one works, then signs other devices out', async () => {
    const principal = fake.addUser({ email: 'principal@test.invalid', password: PASSWORD, role: 'principal' });
    const old = fake.addVerifiedFactor(principal.id);
    const cookies = await accessCookie(principal);

    // Replacing needs the current authenticator's code.
    const noCode = await accountSetupStart(post('/api/auth/authenticator/start', { currentPassword: PASSWORD }, cookies));
    expect(noCode.status).toBe(409);
    expect(await noCode.json()).toEqual({ error: 'mfa_required' });

    const started = await accountSetupStart(
      post('/api/auth/authenticator/start', { currentPassword: PASSWORD, mfaCode: fake.codeFor(old) }, cookies)
    );
    expect(started.status).toBe(200);
    expect(started.headers.get('cache-control')).toBe('no-store');
    const enrolment = await started.json();
    rememberEnrolment(enrolment);
    expect(enrolment.replacing).toBe(true);
    const parked = { ...cookies, [AUTHENTICATOR_COOKIE]: started.cookies.get(AUTHENTICATOR_COOKIE)!.value };
    const fresh = fake.factors.find((f) => f.id === enrolment.factorId)!;

    // A wrong first code changes nothing: the old one still works.
    const wrong = await accountSetupVerify(post('/api/auth/authenticator/verify', { factorId: fresh.id, code: '000000' }, parked));
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('cache-control')).toBe('no-store');
    expect(await wrong.json()).toEqual({ error: 'mfa_invalid_code' });
    expect(verified(principal).map((f) => f.id)).toEqual([old.id]);

    const done = await accountSetupVerify(post('/api/auth/authenticator/verify', { factorId: fresh.id, code: fake.codeFor(fresh) }, parked));
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({ status: 'replaced' });

    // listFactors, as Supabase would answer it for this account.
    const listed = fake.factorsOf(principal.id).filter((f) => f.factor_type === 'totp');
    expect(listed.map((f) => [f.id, f.status])).toEqual([[fresh.id, 'verified']]);
    expect(fake.factors.some((f) => f.id === old.id)).toBe(false);
    expect(fake.sessionsRevoked).toEqual([{ userId: principal.id, keep: SESSION_ID }]);
    expect(fake.auditRows).toHaveLength(1);
    expect(fake.auditRows[0]).toMatchObject({ event_action: 'user.authenticator.replaced', target_id: principal.id });
    expect(JSON.parse(String(fake.auditRows[0].after_state))).toEqual({ via: 'account_page', removedOld: 1 });
  });
});

describe('(2) responses are never cached; error bodies carry a code only', () => {
  it('sign-in set-up start: success and failure are no-store', async () => {
    const admin = fake.addUser({ email: 'admin@test.invalid', password: PASSWORD, role: 'super_admin' });
    const cookies = { [PENDING_COOKIE]: await signInToSetupStep(admin) };
    const ok = await signInSetupStart(post('/api/auth/mfa/setup/start', {}, cookies));
    expect(ok.headers.get('cache-control')).toBe('no-store');
    const body = await ok.json();
    rememberEnrolment(body);
    // The QR code is re-encoded: no raw '#' left to cut the image short.
    expect(body.qrCode).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    expect(body.qrCode).not.toContain('#');

    const bad = await signInSetupVerify(post('/api/auth/mfa/setup/verify', { factorId: body.factorId, code: '000000' }, cookies));
    expect(bad.headers.get('cache-control')).toBe('no-store');
    expect(await bad.json()).toEqual({ error: 'mfa_invalid_code' });
    const none = await signInSetupStart(post('/api/auth/mfa/setup/start', {}));
    expect(none.headers.get('cache-control')).toBe('no-store');
    expect(await none.json()).toEqual({ error: 'pending_token_invalid' });
  });
});

describe('(5) founder tools: remove another platform admin’s authenticator, never their own', () => {
  it('removes it, audits it, signs the target out everywhere; refuses the caller’s own', async () => {
    const founder = fake.addUser({ email: 'founder@test.invalid', password: PASSWORD, role: 'super_admin' });
    const other = fake.addUser({ email: 'other@test.invalid', password: PASSWORD, role: 'super_admin' });
    const founderFactor = fake.addVerifiedFactor(founder.id);
    fake.addVerifiedFactor(other.id);
    const cookies = await accessCookie(founder);
    const act = (userId: string) =>
      founderAction(post(`/api/control/users/${userId}/account-action`, { action: 'remove_authenticator' }, cookies), { params: { userId } });

    const own = await act(founder.id);
    expect(own.status).toBe(409);
    expect(await own.json()).toEqual({ error: 'own_authenticator' });
    expect(fake.factors.some((f) => f.id === founderFactor.id)).toBe(true);
    expect(fake.auditRows).toHaveLength(0);

    const tokenVersionBefore = other.token_version;
    const res = await act(other.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'done', removed: 1 });
    expect(fake.factorsOf(other.id)).toHaveLength(0);
    // Signed out everywhere: every token and remembered device is dead, and
    // every refresh session revoked.
    expect(other.token_version).toBe(tokenVersionBefore + 1);
    expect(fake.sessionsRevoked).toEqual([{ userId: other.id, keep: null }]);
    expect(fake.auditRows).toEqual([
      expect.objectContaining({ event_action: 'user.console.remove_authenticator', actor_user_id: founder.id, target_id: other.id }),
    ]);

    // Their next sign-in: password, then the emailed code, then set-up.
    await signInToSetupStep(other);
  });
});

describe('F1-1: trust this browser for 30 days, and keep me signed in', () => {
  const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
  const withUa = (req: NextRequest) => (req.headers.set('user-agent', UA), req);
  const login = (identifier: string, cookies: Record<string, string> = {}, extra: Record<string, unknown> = {}) =>
    loginRoute(withUa(post('/api/auth/login', { identifier, password: PASSWORD, ...extra }, cookies)));
  // Password, then the authenticator with "Trust this browser" ticked: the browser's trust token.
  async function trustedAdmin() {
    const user = fake.addUser({ email: `admin-${fake.users.size}@test.invalid`, password: PASSWORD, role: 'super_admin' });
    const factor = fake.addVerifiedFactor(user.id);
    const first = await login(user.email);
    expect(await first.json()).toEqual({ status: 'mfa_required' });
    const pending = { [PENDING_COOKIE]: first.cookies.get(PENDING_COOKIE)!.value };
    const done = await mfaVerifyRoute(withUa(post('/api/auth/mfa/verify', { code: fake.codeFor(factor), rememberDevice: true }, pending)));
    expect((await done.json()).status).toBe('ok');
    return { user, factor, device: { [DEVICE_COOKIE]: done.cookies.get(DEVICE_COOKIE)!.value } };
  }

  beforeEach(() => fake.reset());

  it('a browser trusted after the authenticator skips it, and the emailed code, for a platform admin', async () => {
    const { user, device } = await trustedAdmin();
    const again = await login(user.email, device);
    expect(await again.json()).toMatchObject({ status: 'ok', role: 'super_admin' });
    expect(again.cookies.get(ACCESS_COOKIE)?.value).toBeTruthy();
    expect(fake.sentCodes).toEqual([]);
    // The account page lists it by a short name, never the whole user agent.
    const list = await (await devicesRoute(new NextRequest('http://localhost/api/auth/devices', { headers: { cookie: Object.entries({ ...(await accessCookie(user)), ...device }).map(([k, v]) => `${k}=${v}`).join('; ') } }))).json();
    expect(list.devices).toEqual([expect.objectContaining({ label: 'Chrome on Android', proof: 'authenticator', thisDevice: true })]);
  });

  it('without the tick box nothing is trusted; trust is never renewed by a sign-in that only got through on it', async () => {
    const user = fake.addUser({ email: 'p@test.invalid', password: PASSWORD, role: 'principal' });
    const factor = fake.addVerifiedFactor(user.id);
    const first = await login(user.email);
    const pending = { [PENDING_COOKIE]: first.cookies.get(PENDING_COOKIE)!.value };
    const done = await mfaVerifyRoute(post('/api/auth/mfa/verify', { code: fake.codeFor(factor) }, pending));
    expect(done.cookies.get(DEVICE_COOKIE)).toBeUndefined();
    expect(fake.devices.size).toBe(0);
    // An emailed sign-in code on a browser trusted after the authenticator: in, and still exactly one row.
    const { user: admin, device } = await trustedAdmin();
    await loginWithEmailCodeFlow(admin.email, device);
    expect([...fake.devices.values()].filter((d) => d.user_id === admin.id)).toHaveLength(1);
  });

  async function loginWithEmailCodeFlow(email: string, cookies: Record<string, string>) {
    await fake.client().auth.signInWithOtp({ email });
    const res = await codeVerifyRoute(post('/api/auth/code/verify', { identifier: email, code: fake.emailedCodes.get(email), rememberDevice: true }, cookies));
    expect((await res.json()).status).toBe('ok');
  }

  it('ends after 30 days, on "forget" (here or from the list), on a password reset or sign-out everywhere', async () => {
    // Expired.
    let t = await trustedAdmin();
    for (const d of fake.devices.values()) d.expires_at = new Date(Date.now() - 1000);
    expect(await (await login(t.user.email, t.device)).json()).toEqual({ status: 'mfa_required' });
    // Forgotten from this browser.
    t = await trustedAdmin();
    await forgetThisDeviceRoute(post('/api/auth/device/forget', {}, t.device));
    expect(await (await login(t.user.email, t.device)).json()).toEqual({ status: 'mfa_required' });
    // Forgotten from the account page's list.
    t = await trustedAdmin();
    const cookies = { ...(await accessCookie(t.user)) };
    const [row] = [...fake.devices.values()].filter((d) => d.user_id === t.user.id && !d.revoked_at);
    expect((await forgetDeviceRoute(post('/api/auth/devices', { deviceId: row.device_id }, cookies))).status).toBe(200);
    expect(await (await login(t.user.email, t.device)).json()).toEqual({ status: 'mfa_required' });
    // Signed out everywhere.
    t = await trustedAdmin();
    expect((await logoutAllRoute(post('/api/auth/logout-all', {}, await accessCookie(t.user)))).status).toBe(200);
    expect(await (await login(t.user.email, t.device)).json()).toEqual({ status: 'mfa_required' });
    // The token version moved (a password reset does this): the token alone no longer counts.
    t = await trustedAdmin();
    fake.users.get(t.user.id)!.token_version += 1;
    expect(await (await login(t.user.email, t.device)).json()).toEqual({ status: 'mfa_required' });
  });

  it('a password change ends every trusted browser; this session stays', async () => {
    const t = await trustedAdmin();
    await changePassword(t.user.id, SESSION_ID, PASSWORD, 'test-only password 2', fake.codeFor(t.factor));
    expect(fake.sessionsRevoked.at(-1)).toEqual({ userId: t.user.id, keep: SESSION_ID });
    expect([...fake.devices.values()].every((d) => d.revoked_at)).toBe(true);
    const res = await loginRoute(post('/api/auth/login', { identifier: t.user.email, password: 'test-only password 2' }, t.device));
    expect(await res.json()).toEqual({ status: 'mfa_required' });
  });

  it("another person's browser token, or one row forgotten by someone else, is refused", async () => {
    const a = await trustedAdmin();
    const b = await trustedAdmin();
    expect(await (await login(b.user.email, a.device)).json()).toEqual({ status: 'mfa_required' });
    const [rowA] = [...fake.devices.values()].filter((d) => d.user_id === a.user.id);
    expect((await forgetDeviceRoute(post('/api/auth/devices', { deviceId: rowA.device_id }, await accessCookie(b.user)))).status).toBe(404);
    expect(rowA.revoked_at).toBeNull();
  });

  it('keep me signed in: on by default; off, the session cookies end with the browser and the server marks the session', async () => {
    const user = fake.addUser({ email: 'k@test.invalid', password: PASSWORD, role: 'super_admin' });
    const factor = fake.addVerifiedFactor(user.id);
    const finish = async (extra: Record<string, unknown>) => {
      const first = await login(user.email, {}, extra);
      const keep = first.cookies.get(KEEP_COOKIE)?.value;
      const cookies: Record<string, string> = { [PENDING_COOKIE]: first.cookies.get(PENDING_COOKIE)!.value, ...(keep ? { [KEEP_COOKIE]: keep } : {}) };
      return mfaVerifyRoute(post('/api/auth/mfa/verify', { code: fake.codeFor(factor) }, cookies));
    };
    const kept = await finish({});
    expect(kept.cookies.get(REFRESH_COOKIE)?.maxAge).toBe(30 * 24 * 60 * 60);
    expect(fake.notPersistent).toEqual([]);
    const notKept = await finish({ keepSignedIn: false });
    expect(notKept.cookies.get(REFRESH_COOKIE)?.value).toBeTruthy();
    expect(notKept.cookies.get(REFRESH_COOKIE)?.maxAge).toBeUndefined();
    expect(notKept.cookies.get(ACCESS_COOKIE)?.maxAge).toBeUndefined();
    expect(fake.notPersistent).toHaveLength(1);
  });

  it('no password reaches this app\'s storage: the sign-in leaves none in a cookie, a trusted row or an audit row', async () => {
    const { user } = await trustedAdmin();
    const res = await login(user.email);
    const stored = JSON.stringify([[...fake.devices.values()], fake.auditRows, res.cookies.getAll()]);
    expect(stored).not.toContain(PASSWORD);
  });
});
