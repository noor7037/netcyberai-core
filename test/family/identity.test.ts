import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// M1-2 (C248): the Family app's identity, through its real routes, on the real migrations (PGlite served over the
// Postgres wire protocol, so src/lib/auth/db.ts runs unchanged with its own pool). The email sender is the only thing
// replaced: it records what would be sent. Made-up addresses only.

const mail = vi.hoisted(() => ({ sent: [] as { to: string[]; subject: string; text: string }[] }));
vi.mock('@/lib/email/sender', async (original) => ({
  ...(await original<typeof import('@/lib/email/sender')>()),
  emailSenderFromEnv: () => ({
    send: async (m: { to: string[]; subject: string; text: string }) => {
      mail.sent.push(m);
      return { providerId: `p${mail.sent.length}` };
    },
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: Record<string, any>;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-identity-tests-0123456789';
  R = {
    code: await import('@/app/api/family/auth/code/route'),
    verify: await import('@/app/api/family/auth/verify/route'),
    signOut: await import('@/app/api/family/auth/sign-out/route'),
    consent: await import('@/app/api/family/consent/route'),
    pin: await import('@/app/api/family/pin/route'),
    unlock: await import('@/app/api/family/pin/unlock/route'),
    resetCode: await import('@/app/api/family/pin/reset/code/route'),
    reset: await import('@/app/api/family/pin/reset/route'),
    children: await import('@/app/api/family/children/route'),
    child: await import('@/app/api/family/children/[childId]/route'),
    switcher: await import('@/app/api/family/child/route'),
    answers: await import('@/app/api/family/answers/route'),
    account: await import('@/app/api/family/account/route'),
    renew: await import('@/app/api/family/auth/renew/route'),
    staffStudents: await import('@/app/api/app/students/route'),
  };
}, 90_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

type Jar = Record<string, string>;
const req = (path: string, method: string, body: unknown, jar: Jar = {}, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
// Keep what the response set, as a browser would (an empty value deletes).
const keep = (jar: Jar, res: Response): Jar => {
  const next = { ...jar };
  for (const c of (res as unknown as { cookies: { getAll(): { name: string; value: string }[] } }).cookies.getAll()) {
    if (c.value) next[c.name] = c.value;
    else delete next[c.name];
  }
  return next;
};
const lastCode = () => /\b(\d{6})\b/.exec(mail.sent[mail.sent.length - 1].text)![1];

async function signIn(email: string, ip = '10.0.0.1'): Promise<Jar> {
  let jar: Jar = {};
  const sent = await R.code.POST(req('/api/family/auth/code', 'POST', { email, lang: 'hi' }, jar, { 'x-forwarded-for': ip }));
  expect(sent.status).toBe(200);
  jar = keep(jar, sent);
  const ok = await R.verify.POST(req('/api/family/auth/verify', 'POST', { code: lastCode() }, jar));
  expect(ok.status).toBe(200);
  return keep(jar, ok);
}
async function onboard(email: string): Promise<Jar> {
  let jar = await signIn(email);
  jar = keep(jar, await R.consent.POST(req('/api/family/consent', 'POST', { purpose: 'study_core', granted: true, tap: true }, jar)));
  const pin = await R.pin.POST(req('/api/family/pin', 'POST', { pin: '480371' }, jar));
  expect(pin.status).toBe(200);
  return keep(jar, pin);
}
const addChild = (jar: Jar, body: Record<string, unknown>) => R.children.POST(req('/api/family/children', 'POST', body, jar));
const CHILD = { firstName: 'Asha', classLevel: 7, board: 'CBSE', language: 'hi', style: 'hinglish', stateCode: 'IN-UP' };

describe('sign-in by email code', () => {
  it('sends a random six-digit code, keeps only its keyed hash, and signs in once', async () => {
    const before = mail.sent.length;
    let jar: Jar = {};
    const sent = await R.code.POST(req('/api/family/auth/code', 'POST', { email: 'Parent.One@Example.org', lang: 'en' }, jar));
    jar = keep(jar, sent);
    expect(mail.sent.length).toBe(before + 1);
    expect(mail.sent[before].to).toEqual(['parent.one@example.org']);
    const code = lastCode();
    const stored = (await db.pg.query(`select code_key from family.sign_in_codes`)).rows.map((r: { code_key: string }) => r.code_key);
    expect(stored.some((k: string) => k.includes(code))).toBe(false);
    expect(jar.ncf_code).toBeTruthy();
    expect(JSON.stringify(jar)).not.toContain('parent.one');

    const wrong = await R.verify.POST(req('/api/family/auth/verify', 'POST', { code: code === '000000' ? '000001' : '000000' }, jar));
    expect(wrong.status).toBe(400);
    const ok = await R.verify.POST(req('/api/family/auth/verify', 'POST', { code }, jar));
    expect(ok.status).toBe(200);
    expect(keep(jar, ok).ncf_session).toBeTruthy();
    const again = await R.verify.POST(req('/api/family/auth/verify', 'POST', { code }, jar));
    expect(again.status).toBe(410);
  });

  it('a code sent to one email never opens another', async () => {
    let jar: Jar = {};
    jar = keep(jar, await R.code.POST(req('/api/family/auth/code', 'POST', { email: 'first@example.org' }, jar)));
    const firstCode = lastCode();
    let other: Jar = {};
    other = keep(other, await R.code.POST(req('/api/family/auth/code', 'POST', { email: 'second@example.org' }, other)));
    const res = await R.verify.POST(req('/api/family/auth/verify', 'POST', { code: firstCode }, other));
    expect(res.status).toBe(400);
  });

  it('refuses a bad email, and rate-limits codes per email', async () => {
    expect((await R.code.POST(req('/api/family/auth/code', 'POST', { email: 'not an email' }))).status).toBe(400);
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await R.code.POST(req('/api/family/auth/code', 'POST', { email: 'busy@example.org' }))).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

describe('a family session and a staff session never pass for each other', () => {
  it('a staff session is refused on family APIs', async () => {
    const { signAccessToken } = await import('@/lib/auth/jwt');
    const staff = await signAccessToken({ sub: '00000000-0000-4000-8000-0000000000a1', role: 'principal', schoolId: '00000000-0000-4000-8000-0000000000b1', membershipId: null, tokenVersion: 0, aal: 'aal1', sessionId: 's' });
    expect((await R.children.GET(req('/api/family/children', 'GET', null, { nca_access: staff }))).status).toBe(401);
    // Even placed in the family cookie, a staff token is not a family session.
    expect((await R.children.GET(req('/api/family/children', 'GET', null, { ncf_session: staff }))).status).toBe(401);
  });

  it('a family session is refused on staff APIs', async () => {
    const jar = await signIn('crossover@example.org');
    expect((await R.staffStudents.GET(req('/api/app/students', 'GET', null, jar))).status).toBe(401);
    // Even placed in the staff cookie, a family token is not a staff session.
    expect((await R.staffStudents.GET(req('/api/app/students', 'GET', null, { nca_access: jar.ncf_session }))).status).toBe(401);
    const { verifyAccessToken } = await import('@/lib/auth/jwt');
    expect(await verifyAccessToken(jar.ncf_session)).toBeNull();
  });
});

describe('consent before processing, then the parent PIN', () => {
  it('records consent only from the parent’s tap, and nothing about a child before it', async () => {
    let jar = await signIn('consent@example.org');
    expect((await R.consent.POST(req('/api/family/consent', 'POST', { purpose: 'study_core', granted: true }, jar))).status).toBe(400);
    expect((await R.pin.POST(req('/api/family/pin', 'POST', { pin: '480371' }, jar))).status).toBe(409);
    expect((await addChild(jar, CHILD)).status).toBe(403);
    const rows = await db.pg.query(`select count(*)::int n from family.consents c join family.accounts a using (account_id) where a.email = 'consent@example.org'`);
    expect(rows.rows[0].n).toBe(0);
    const ok = await R.consent.POST(req('/api/family/consent', 'POST', { purpose: 'study_core', granted: true, tap: true }, jar));
    expect(ok.status).toBe(200);
    jar = keep(jar, ok);
    const row = (await db.pg.query(`select granted, verification_method from family.consents c join family.accounts a using (account_id) where a.email = 'consent@example.org'`)).rows;
    expect(row).toEqual([{ granted: true, verification_method: 'parent_tap' }]);
  });

  it('the PIN is six digits, not trivial, set once, stored only as a salted hash', async () => {
    let jar = await signIn('pin@example.org');
    jar = keep(jar, await R.consent.POST(req('/api/family/consent', 'POST', { purpose: 'study_core', granted: true, tap: true }, jar)));
    expect((await R.pin.POST(req('/api/family/pin', 'POST', { pin: '12345' }, jar))).status).toBe(400);
    expect((await R.pin.POST(req('/api/family/pin', 'POST', { pin: '123456' }, jar))).status).toBe(400);
    expect((await R.pin.POST(req('/api/family/pin', 'POST', { pin: '777777' }, jar))).status).toBe(400);
    const set = await R.pin.POST(req('/api/family/pin', 'POST', { pin: '480371' }, jar));
    expect(set.status).toBe(200);
    expect(keep(jar, set).ncf_parent).toBeTruthy();
    expect((await R.pin.POST(req('/api/family/pin', 'POST', { pin: '590482' }, jar))).status).toBe(409);
    const hash = (await db.pg.query(`select pin_hash from family.accounts where email = 'pin@example.org'`)).rows[0].pin_hash;
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain('480371');
  });
});

describe('the parent area', () => {
  it('children are added only in parent mode, first name only, with a state chosen', async () => {
    const jar = await onboard('children@example.org');
    const child = { ...jar };
    delete child.ncf_parent;
    expect((await addChild(child, CHILD)).status).toBe(403);
    const bad = await addChild(jar, { ...CHILD, firstName: 'Asha Verma', stateCode: '' });
    expect(bad.status).toBe(400);
    expect((await bad.json()).problems).toEqual(['first_name', 'state']);
    expect((await (await addChild(jar, { ...CHILD, classLevel: 13 })).json()).problems).toEqual(['class']);
    for (const missing of [null, '', undefined]) expect((await (await addChild(jar, { ...CHILD, classLevel: missing as never })).json()).problems, String(missing)).toEqual(['class']);
    expect((await (await addChild(jar, { ...CHILD, board: 'ICSE' })).json()).problems).toEqual(['board']);
    const ok = await addChild(jar, CHILD);
    expect(ok.status).toBe(201);
    expect((await ok.json()).child.firstName).toBe('Asha');
  });

  it('every class from Nursery to 12 and every board (C263); the board can be changed', async () => {
    const jar = await onboard('allclasses@example.org');
    const nursery = await (await addChild(jar, { ...CHILD, firstName: 'Tiya', classLevel: -2, board: 'STATE', stateCode: 'IN-MH' })).json();
    expect(nursery.child).toMatchObject({ classLevel: -2, board: 'STATE', stateCode: 'IN-MH' });
    const senior = await (await addChild(jar, { ...CHILD, firstName: 'Kabir', classLevel: 12, board: 'CISCE' })).json();
    expect(senior.child).toMatchObject({ classLevel: 12, board: 'CISCE' });
    const id = senior.child.childId;
    const changed = await R.child.PATCH(req(`/api/family/children/${id}`, 'PATCH', { ...CHILD, firstName: 'Kabir', classLevel: 11, board: 'NIOS' }, jar), { params: { childId: id } });
    expect((await changed.json()).child).toMatchObject({ classLevel: 11, board: 'NIOS' });
    // A free subject the new class does not teach is let go (C264); one it does teach stays.
    await db.pg.query(`update family.children set free_subject = 'science' where child_id = $1`, [id]);
    const toThree = await R.child.PATCH(req(`/api/family/children/${id}`, 'PATCH', { ...CHILD, firstName: 'Kabir', classLevel: 3, board: 'NIOS' }, jar), { params: { childId: id } });
    expect((await toThree.json()).child.freeSubject).toBeNull();
    await db.pg.query(`update family.children set free_subject = 'mathematics' where child_id = $1`, [id]);
    const toFour = await R.child.PATCH(req(`/api/family/children/${id}`, 'PATCH', { ...CHILD, firstName: 'Kabir', classLevel: 4, board: 'NIOS' }, jar), { params: { childId: id } });
    expect((await toFour.json()).child.freeSubject).toBe('mathematics');
  });

  it('a changed class drops today’s plan built from the old class, so Home links the new class’s pages (W10, C411)', async () => {
    const jar = await onboard('classplan@example.org');
    const made = await (await addChild(jar, { ...CHILD, firstName: 'Riya', classLevel: 6, board: 'CBSE' })).json();
    const id = made.child.childId;
    const { indiaDate } = await import('@/lib/time/india');
    const plant = () =>
      db.pg.query(`insert into family.plan_days (account_id, child_id, day, items, minutes) select account_id, child_id, $2::date, '[]'::jsonb, 0 from family.children where child_id = $1 on conflict do nothing`, [id, indiaDate()]);
    const plans = async () => (await db.pg.query(`select count(*)::int n from family.plan_days where child_id = $1`, [id])).rows[0].n;
    await plant();
    // The same class (only the name changed): today's plan stays.
    await R.child.PATCH(req(`/api/family/children/${id}`, 'PATCH', { ...CHILD, firstName: 'Riyaa', classLevel: 6, board: 'CBSE' }, jar), { params: { childId: id } });
    expect(await plans()).toBe(1);
    // Class 6 to class 3: today's plan of class 6 topics goes; Home builds class 3's.
    const toThree = await R.child.PATCH(req(`/api/family/children/${id}`, 'PATCH', { ...CHILD, firstName: 'Riyaa', classLevel: 3, board: 'CBSE' }, jar), { params: { childId: id } });
    const body = await toThree.json();
    expect(body).toMatchObject({ child: { classLevel: 3 } });
    expect(await plans()).toBe(0);
  });

  it('wrong PINs bring growing waits, with no hint; the right PIN after the wait opens parent mode', async () => {
    const jar = await onboard('waits@example.org');
    delete jar.ncf_parent;
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await R.unlock.POST(req('/api/family/pin/unlock', 'POST', { pin: '111222' }, jar))).status);
    expect(statuses).toEqual([400, 400, 400, 400, 429]);
    const locked = await R.unlock.POST(req('/api/family/pin/unlock', 'POST', { pin: '480371' }, jar));
    expect(locked.status).toBe(429);
    expect((await locked.json()).minutes).toBe(1);
    await db.pg.query(`update family.accounts set pin_locked_until = now() - interval '1 second' where email = 'waits@example.org'`);
    const sixth = await R.unlock.POST(req('/api/family/pin/unlock', 'POST', { pin: '111222' }, jar));
    expect((await sixth.json()).minutes).toBe(5);
    await db.pg.query(`update family.accounts set pin_locked_until = now() - interval '1 second' where email = 'waits@example.org'`);
    const open = await R.unlock.POST(req('/api/family/pin/unlock', 'POST', { pin: '480371' }, jar));
    expect(open.status).toBe(200);
    expect(keep(jar, open).ncf_parent).toBeTruthy();
    expect((await db.pg.query(`select pin_failures from family.accounts where email = 'waits@example.org'`)).rows[0].pin_failures).toBe(0);
  });

  it('a forgotten PIN is reset only by the code sent to the account’s own email', async () => {
    const jar = await onboard('reset@example.org');
    delete jar.ncf_parent;
    const sent = await R.resetCode.POST(req('/api/family/pin/reset/code', 'POST', { email: 'attacker@example.org' }, jar));
    expect(sent.status).toBe(200);
    expect(mail.sent[mail.sent.length - 1].to).toEqual(['reset@example.org']);
    const code = lastCode();
    const otherPhone = await signIn('reset@example.org');
    const res = await R.reset.POST(req('/api/family/pin/reset', 'POST', { code, pin: '602913' }, jar));
    expect(res.status).toBe(200);
    // F1-1: a PIN change signs every other phone out; this one gets a new session token and stays.
    const after = keep(jar, res);
    expect((await R.unlock.POST(req('/api/family/pin/unlock', 'POST', { pin: '602913' }, after))).status).toBe(200);
    expect((await R.children.GET(req('/api/family/children', 'GET', null, otherPhone))).status).toBe(401);
    expect((await R.children.GET(req('/api/family/children', 'GET', null, jar))).status).toBe(401);
  });

  it('the switcher and the parent’s changes reach only this account’s children', async () => {
    const a = await onboard('alpha@example.org');
    const b = await onboard('beta@example.org');
    const aChild = (await (await addChild(a, CHILD)).json()).child.childId;
    const bChild = (await (await addChild(b, { ...CHILD, firstName: 'Ravi' })).json()).child.childId;
    expect((await R.switcher.POST(req('/api/family/child', 'POST', { childId: bChild }, a))).status).toBe(404);
    expect((await R.switcher.POST(req('/api/family/child', 'POST', { childId: aChild }, a))).status).toBe(200);
    expect((await R.child.DELETE(req(`/api/family/children/${bChild}`, 'DELETE', {}, a), { params: { childId: bChild } })).status).toBe(404);
    expect((await R.answers.GET(req(`/api/family/answers?childId=${bChild}`, 'GET', null, a))).status).toBe(200);
    expect((await (await R.answers.GET(req(`/api/family/answers?childId=${bChild}`, 'GET', null, a))).json()).answers).toEqual([]);
    const list = await (await R.children.GET(req('/api/family/children', 'GET', null, a))).json();
    expect(list.children.map((c: { firstName: string }) => c.firstName)).toEqual(['Asha']);
  });

  it('answers are seen and deleted by the parent, and progress goes with them', async () => {
    const jar = await onboard('answers@example.org');
    const childId = (await (await addChild(jar, CHILD)).json()).child.childId;
    const account = (await db.pg.query(`select account_id from family.accounts where email = 'answers@example.org'`)).rows[0].account_id;
    await db.pg.query(
      `insert into family.attempts (account_id, child_id, subject, topic_key, item_key, kind, answer, correct, answered_on) values ($1, $2, 'science', 'cbse.c7.science.ch01.t01', 'q1', 'check', 'b', true, '2026-10-20'), ($1, $2, 'science', 'cbse.c7.science.ch01.t01', 'q2', 'check', 'a', false, '2026-10-21')`,
      [account, childId]
    );
    await db.pg.query(`insert into family.topic_progress (account_id, child_id, topic_key, subject, answered, correct) values ($1, $2, 'cbse.c7.science.ch01.t01', 'science', 2, 1)`, [account, childId]);
    const seen = (await (await R.answers.GET(req(`/api/family/answers?childId=${childId}`, 'GET', null, jar))).json()).answers;
    expect(seen).toHaveLength(2);
    expect(seen.map((a: { answeredOn: string }) => a.answeredOn).sort()).toEqual(['2026-10-20', '2026-10-21']);
    const right = seen.find((a: { correct: boolean }) => a.correct);
    expect((await R.answers.DELETE(req('/api/family/answers', 'DELETE', { attemptId: right.attemptId }, jar))).status).toBe(200);
    const progress = (await db.pg.query(`select answered, correct from family.topic_progress where child_id = $1`, [childId])).rows[0];
    expect(progress).toEqual({ answered: 1, correct: 0 });
    await R.answers.DELETE(req('/api/family/answers', 'DELETE', { childId, all: true }, jar));
    expect((await db.pg.query(`select count(*)::int n from family.topic_progress where child_id = $1`, [childId])).rows[0].n).toBe(0);
  });

  it('signing out everywhere ends every session of the account', async () => {
    const phoneA = await onboard('everywhere@example.org');
    const phoneB = await signIn('everywhere@example.org');
    const out = await R.signOut.POST(req('/api/family/auth/sign-out', 'POST', { everywhere: true }, phoneA));
    expect(out.status).toBe(200);
    expect((await R.children.GET(req('/api/family/children', 'GET', null, phoneB))).status).toBe(401);
  });

  it('deleting the account erases every family row of it, and the session with it', async () => {
    const jar = await onboard('erase@example.org');
    await addChild(jar, CHILD);
    const account = (await db.pg.query(`select account_id from family.accounts where email = 'erase@example.org'`)).rows[0].account_id;
    expect((await R.account.DELETE(req('/api/family/account', 'DELETE', { confirm: 'yes' }, jar))).status).toBe(400);
    const gone = await R.account.DELETE(req('/api/family/account', 'DELETE', { confirm: 'DELETE' }, jar));
    expect(gone.status).toBe(200);
    for (const t of ['accounts', 'consents', 'children', 'attempts', 'topic_progress', 'ai_daily']) {
      expect((await db.pg.query(`select count(*)::int n from family.${t} where account_id = $1`, [account])).rows[0].n, t).toBe(0);
    }
    expect((await R.children.GET(req('/api/family/children', 'GET', null, jar))).status).toBe(401);
  });
});

describe('F1-1: keep me signed in', () => {
  const DAY = 24 * 60 * 60;
  const sessionCookie = (res: Response) => (res as unknown as { cookies: { get(n: string): { value: string; maxAge?: number } | undefined } }).cookies.get('ncf_session');
  async function verifyWith(email: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
    let jar: Jar = {};
    jar = keep(jar, await R.code.POST(req('/api/family/auth/code', 'POST', { email }, jar, { 'x-forwarded-for': '10.0.9.9' })));
    return R.verify.POST(req('/api/family/auth/verify', 'POST', { code: lastCode(), ...body }, jar, headers));
  }
  // A session token signed a while ago, as the browser would still hold it.
  async function agedToken(accountId: string, tv: number, keepSignedIn: boolean, ageSeconds: number) {
    const { SignJWT } = await import('jose');
    const iat = Math.floor(Date.now() / 1000) - ageSeconds;
    return new SignJWT({ typ: 'family', tv, sid: '00000000-0000-4000-8000-00000000f101', kp: keepSignedIn ? 1 : 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(accountId)
      .setAudience('nca-family')
      .setIssuedAt(iat)
      .setExpirationTime(iat + (keepSignedIn ? 180 : 0.5) * DAY)
      .sign(new TextEncoder().encode(process.env.APP_SESSION_SECRET!));
  }

  it('on by default: 180 days; off: the cookie ends with the browser; the Android app always keeps', async () => {
    expect(sessionCookie(await verifyWith('keep1@example.org', {}))?.maxAge).toBe(180 * DAY);
    const off = sessionCookie(await verifyWith('keep2@example.org', { keepSignedIn: false }));
    expect(off?.value).toBeTruthy();
    expect(off?.maxAge).toBeUndefined();
    const app = sessionCookie(await verifyWith('keep3@example.org', { keepSignedIn: false }, { 'user-agent': 'Mozilla/5.0 (Linux; Android 14; wv) NetCyberAIFamily/1' }));
    expect(app?.maxAge).toBe(180 * DAY);
  });

  it('renews a session in use once a day, kept or not; never a signed-out one', async () => {
    const jar = await onboard('renew@example.org');
    const account = (await db.pg.query(`select account_id, token_version from family.accounts where email = 'renew@example.org'`)).rows[0];
    // Fresh: nothing to do.
    expect(await (await R.renew.POST(req('/api/family/auth/renew', 'POST', {}, jar))).json()).toEqual({ status: 'fresh' });
    // Two days old, kept: a new 180-day token for the same session.
    const old = await agedToken(account.account_id, account.token_version, true, 2 * DAY);
    const renewed = await R.renew.POST(req('/api/family/auth/renew', 'POST', {}, { ncf_session: old }));
    expect(await renewed.json()).toEqual({ status: 'renewed' });
    const fresh = sessionCookie(renewed)!;
    expect(fresh.maxAge).toBe(180 * DAY);
    const { verifyFamilySession } = await import('@/lib/family/session');
    expect(await verifyFamilySession(fresh.value)).toMatchObject({ accountId: account.account_id, sessionId: '00000000-0000-4000-8000-00000000f101', keep: true });
    // Not kept: renewed for 12 hours, still session-only.
    const short = await agedToken(account.account_id, account.token_version, false, 2 * 60 * 60);
    const shortRes = await R.renew.POST(req('/api/family/auth/renew', 'POST', {}, { ncf_session: short }));
    expect(await shortRes.json()).toEqual({ status: 'renewed' });
    expect(sessionCookie(shortRes)?.maxAge).toBeUndefined();
    expect(await verifyFamilySession(sessionCookie(shortRes)!.value)).toMatchObject({ keep: false });
    // Signed out everywhere: refused, cookies cleared, nothing renewed.
    await R.signOut.POST(req('/api/family/auth/sign-out', 'POST', { everywhere: true }, jar));
    const revoked = await R.renew.POST(req('/api/family/auth/renew', 'POST', {}, { ncf_session: old }));
    expect(revoked.status).toBe(401);
    expect(sessionCookie(revoked)?.value ?? '').toBe('');
  });
});
