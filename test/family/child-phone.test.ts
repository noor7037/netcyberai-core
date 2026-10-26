import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// A child's own phone (M2b-2, C342; reversed by C230-AF, C346; docs/34 §9.4), on the real schema through the real
// routes and pool.
//   1. The child's phone asks and shows a code (six digits, ten minutes, kept only as a keyed hash) and keeps a claim in
//      its own cookie; asking is limited per network and in all, and only while the Focus Lock is open to anyone.
//   2. The parent, signed in and in parent mode, types the code for one of their own children: only with the family's
//      Focus Lock switched on, ten tries an hour. A code alone opens nothing; only the phone with the claim takes the
//      session, once.
//   3. The phone's session reaches one child only: by the database's own rules on every family table that names a
//      child, whatever the code asks; it never opens parent mode.
//   4. Removing the phone, its own sign-out, or "sign out everywhere" ends it at once.
//   5. Family code builds a session's claims only through familyClaims, so a phone's scope is never dropped.

process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-child-phone-tests-0123456789ab';
const ACCOUNT = 'fb000000-0000-4000-8000-0000000000a1';
const OTHER = 'fb000000-0000-4000-8000-0000000000b1';
const ASHA = 'fb000000-0000-4000-8000-0000000000c1';
const KABIR = 'fb000000-0000-4000-8000-0000000000c2';
const RIYA = 'fb000000-0000-4000-8000-0000000000d1';
const TOPIC = 'cbse.c6.science.ch01.t01';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
type Session = { accountId: string; tokenVersion: number; sessionId: string; device?: { deviceId: string; childId: string } };
const parent: Session = { accountId: ACCOUNT, tokenVersion: 0, sessionId: 'parent-session' };
const other: Session = { accountId: OTHER, tokenVersion: 0, sessionId: 'other-session' };
let phone: Session;
const cookie = async (s: Session, withParent = false) => {
  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  return `ncf_session=${await signFamilySession(s)}${withParent ? `; ncf_parent=${await signParentMode(s)}` : ''}`;
};
const call = async (mod: { POST: (r: NextRequest) => Promise<Response> }, url: string, body: unknown, c = '', ip = '203.0.113.7') => {
  const res = await mod.POST(new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: c, 'x-forwarded-for': ip }, body: JSON.stringify(body) }));
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown>, setCookie: res.headers.get('set-cookie') ?? '' };
};
const phoneRoute = () => import('@/app/api/family/child-phone/route');
const linkRoute = () => import('@/app/api/family/child-phone/link/route');
const asFamily = async <R>(s: Session, fn: (c: { query: (q: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) => Promise<R>): Promise<R> => {
  const { familyClaims, withFamilyContext } = await import('@/lib/family/db');
  return withFamilyContext(familyClaims(s), fn as never) as Promise<R>;
};
// The child's phone asks: its code, and its claim cookie as the browser would send it back.
const ask = async (ip = '203.0.113.7') => {
  const r = await call(await linkRoute(), '/api/family/child-phone/link', { action: 'start' }, '', ip);
  const claim = /ncf_link=([^;]*)/.exec(r.setCookie)?.[1] ?? '';
  return { ...r, code: String(r.body.code ?? ''), claim: `ncf_link=${claim}` };
};
const check = async (claimCookie: string) => call(await linkRoute(), '/api/family/child-phone/link', { action: 'check' }, claimCookie);
const approve = async (childId: string, code: string, as: Session = parent) => call(await phoneRoute(), '/api/family/child-phone', { action: 'link', childId, code }, await cookie(as, true));
// A phone linked for that child, end to end.
const linkPhone = async (childId: string, ip = '192.0.2.50') => {
  const asked = await ask(ip);
  await approve(childId, asked.code);
  const done = await check(asked.claim);
  const token = /ncf_session=([^;]+)/.exec(done.setCookie)![1];
  const { verifyFamilySession } = await import('@/lib/family/session');
  return (await verifyFamilySession(token)) as Session;
};
const focusLock = (on: boolean) => q(`insert into control.app_flags (app, module, enabled, reason) values ('family', 'focus_lock', $1, 'closed pilot') on conflict (app, module) do update set enabled = excluded.enabled`, [on]);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'phones@example.org'), ('${OTHER}', 'other@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${ASHA}', '${ACCOUNT}', 'Asha', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${KABIR}', '${ACCOUNT}', 'Kabir', 9, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${RIYA}', '${OTHER}', 'Riya', 7, 'CBSE', 'en', 'en', 'IN-HR');
    insert into family.attempts (account_id, child_id, subject, topic_key, item_key, kind, answer, correct, answered_on) values
      ('${ACCOUNT}', '${ASHA}', 'science', '${TOPIC}', 'q1', 'check', 'a', true, current_date),
      ('${ACCOUNT}', '${KABIR}', 'science', '${TOPIC}', 'q1', 'check', 'b', false, current_date);
  `);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('only behind the Focus Lock’s switch (C230-AF)', () => {
  it('with no switch saved, or one switched off, a phone cannot ask and a parent cannot link', async () => {
    expect(await ask()).toMatchObject({ status: 403, body: { error: 'off' } });
    await focusLock(false);
    expect(await ask()).toMatchObject({ status: 403, body: { error: 'off' } });
    expect(await approve(ASHA, '123456')).toMatchObject({ status: 403, body: { error: 'off' } });
    expect(await q(`select count(*)::int as n from family.child_link_requests`)).toEqual([{ n: 0 }]);
    await focusLock(true);
  });
});

describe('the child’s phone asks for a code (C346)', () => {
  it('six digits to show, ten minutes; the code and the claim are kept only as keyed hashes; the claim is the phone’s own cookie', async () => {
    const r = await ask();
    expect(r.status).toBe(200);
    expect(r.code).toMatch(/^[0-9]{6}$/);
    expect(r.setCookie).toMatch(/ncf_link=[A-Za-z0-9_-]{43};/);
    expect(r.setCookie).toMatch(/Path=\/api\/family\/child-phone\/link/i);
    expect(r.setCookie).toMatch(/HttpOnly/i);
    expect(r.setCookie).toMatch(/SameSite=strict/i);
    const rows = await q(`select code_hash, claim_hash, account_id, extract(epoch from expires_at - created_at)::int as secs from family.child_link_requests`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code_hash: expect.stringMatching(/^[0-9a-f]{64}$/), claim_hash: expect.stringMatching(/^[0-9a-f]{64}$/), account_id: null, secs: 600 });
    expect(JSON.stringify(rows)).not.toContain(r.code);
    expect(JSON.stringify(rows)).not.toContain(r.claim.slice('ncf_link='.length));
    // Until a parent types it, the phone waits; a made-up claim is gone.
    expect(await check(r.claim)).toMatchObject({ status: 200, body: { status: 'waiting' } });
    expect(await check('ncf_link=' + 'A'.repeat(43))).toMatchObject({ status: 410, body: { error: 'gone' } });
    expect(await check('')).toMatchObject({ status: 410 });
  });

  it('ten asks an hour from one network (an IPv6 /64 is one), three hundred in all', async () => {
    for (let i = 0; i < 10; i++) expect((await ask('2001:db8:5:6::' + (i + 1))).status).toBe(200);
    expect(await ask('2001:db8:5:6:ffff::1')).toMatchObject({ status: 429, body: { error: 'too_many' } });
    await q(`update family.child_link_tries set n = 300 where scope = '*'`);
    expect(await ask('192.0.2.200')).toMatchObject({ status: 429, body: { error: 'too_many' } });
    await q(`delete from family.child_link_tries`);
  });
});

describe('the parent types the code (C346)', () => {
  it('only the parent, in parent mode, for one of their own children; a wrong code links nothing', async () => {
    const asked = await ask('198.51.100.20');
    const wrong = asked.code === '000000' ? '000001' : '000000';
    expect(await call(await phoneRoute(), '/api/family/child-phone', { action: 'link', childId: ASHA, code: asked.code }, await cookie(parent))).toMatchObject({ status: 403, body: { error: 'parent_pin_required' } });
    expect(await approve(RIYA, asked.code)).toMatchObject({ status: 404, body: { error: 'not_found' } });
    expect(await approve(ASHA, wrong)).toMatchObject({ status: 400, body: { error: 'wrong' } });
    expect(await approve(ASHA, 'not a code')).toMatchObject({ status: 400, body: { error: 'wrong' } });
    expect(await check(asked.claim)).toMatchObject({ body: { status: 'waiting' } });
    // Another family typing this code gets it for their own child only, never this family's.
    expect(await approve(ASHA, asked.code, other)).toMatchObject({ status: 404 });
  });

  it('the right code links the phone that asked, to that one child, once; the code alone opens nothing', async () => {
    const asked = await ask('198.51.100.21');
    expect(await approve(ASHA, `${asked.code.slice(0, 3)} ${asked.code.slice(3)}`)).toMatchObject({ status: 200, body: { ok: true } });
    // The same code again is spent.
    expect(await approve(KABIR, asked.code)).toMatchObject({ status: 400, body: { error: 'wrong' } });
    // Nothing is linked until the phone itself takes it; no other phone can.
    expect(await q(`select count(*)::int as n from family.child_devices`)).toEqual([{ n: 0 }]);
    expect(await check('ncf_link=' + 'B'.repeat(43))).toMatchObject({ status: 410 });
    const linked = await check(asked.claim);
    expect(linked).toMatchObject({ status: 200, body: { status: 'linked' } });
    expect(linked.setCookie).toMatch(/ncf_session=/);
    expect(linked.setCookie).toMatch(/ncf_link=;/);
    const devices = await q(`select device_id, child_id, revoked_at from family.child_devices`);
    expect(devices).toEqual([{ device_id: expect.any(String), child_id: ASHA, revoked_at: null }]);
    phone = { accountId: ACCOUNT, tokenVersion: 0, sessionId: 'phone-session', device: { deviceId: devices[0].device_id, childId: ASHA } };
    const token = /ncf_session=([^;]+)/.exec(linked.setCookie)![1];
    const { verifyFamilySession } = await import('@/lib/family/session');
    expect((await verifyFamilySession(token))?.device).toEqual(phone.device);
    // Taken once.
    expect(await check(asked.claim)).toMatchObject({ status: 410 });
    expect(await q(`select count(*)::int as n from family.child_devices`)).toEqual([{ n: 1 }]);
  });

  it('an old code links nothing; an approval not taken within ten minutes is gone', async () => {
    const old = await ask('198.51.100.22');
    await q(`update family.child_link_requests set created_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute' where approved_at is null`);
    expect(await approve(KABIR, old.code)).toMatchObject({ status: 400, body: { error: 'wrong' } });
    expect(await check(old.claim)).toMatchObject({ status: 410 });
    const late = await ask('198.51.100.23');
    expect((await approve(KABIR, late.code)).status).toBe(200);
    await q(`update family.child_link_requests set approved_at = now() - interval '11 minutes' where claimed_at is null and approved_at is not null`);
    expect(await check(late.claim)).toMatchObject({ status: 410 });
  });

  it('ten tries an hour for one family, counted before any code is looked at', async () => {
    await q(`delete from family.child_link_tries`);
    for (let i = 0; i < 10; i++) await approve(KABIR, '111111');
    const asked = await ask('198.51.100.24');
    expect(await approve(KABIR, asked.code)).toMatchObject({ status: 429, body: { error: 'too_many' } });
    // Another family is not held back by it.
    expect((await approve(RIYA, '111111', other)).status).toBe(400);
    await q(`delete from family.child_link_tries`);
  });

  it('a phone’s own session cannot approve, even through the database function', async () => {
    const asked = await ask('198.51.100.25');
    expect(await asFamily(phone, async (c) => (await c.query(`select family.approve_child_link($1, $2) as o`, ['0'.repeat(64), ASHA])).rows)).toEqual([{ o: 'not_found' }]);
    expect(await call(await phoneRoute(), '/api/family/child-phone', { action: 'link', childId: ASHA, code: asked.code }, await cookie(phone))).toMatchObject({ status: 403, body: { error: 'child_phone' } });
    // No family role reads the requests themselves.
    expect(await asFamily(parent, (c) => c.query(`select * from family.child_link_requests`)).then(() => 'read', (e: Error) => e.message)).toMatch(/permission denied/);
  });
});

describe('counting tries by network (review of C342)', () => {
  it('an IPv4 address is one network; an IPv6 address counts by its /64', async () => {
    const { networkOf, tryKey } = await import('@/lib/family/child-phone');
    expect(networkOf('203.0.113.7')).toBe('203.0.113.7');
    expect(networkOf('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(networkOf('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(networkOf('2001:0db8:0001:0002::1')).toBe('2001:db8:1:2::/64');
    expect(networkOf('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(networkOf('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(networkOf('not an address')).toBe('not an address');
    expect(networkOf('1:2:3')).toBe('unknown');
    expect(tryKey('2001:db8:1:2::5')).toBe(tryKey('2001:db8:1:2:ffff::9'));
    expect(tryKey('2001:db8:1:2::5')).not.toBe(tryKey('2001:db8:1:3::5'));
  });
});

describe('the phone’s session reaches one child only (C342)', () => {
  it('sees that child’s rows only, whatever it asks', async () => {
    expect(await asFamily(phone, async (c) => (await c.query(`select first_name from family.children order by 1`)).rows)).toEqual([{ first_name: 'Asha' }]);
    expect(await asFamily(phone, async (c) => (await c.query(`select child_id from family.attempts`)).rows)).toEqual([{ child_id: ASHA }]);
    const { listChildren } = await import('@/lib/family/children');
    expect((await asFamily(phone, (c) => listChildren(c as never, ACCOUNT))).map((c) => c.firstName)).toEqual(['Asha']);
    // The parent's own session still sees both.
    expect(await asFamily(parent, async (c) => (await c.query(`select first_name from family.children order by 1`)).rows)).toEqual([{ first_name: 'Asha' }, { first_name: 'Kabir' }]);
  });

  it('writes for that child only', async () => {
    const said = await asFamily(phone, (c) =>
      c.query(`insert into family.attempts (account_id, child_id, subject, topic_key, item_key, kind, answer, correct, answered_on) values ('${ACCOUNT}', '${KABIR}', 'science', '${TOPIC}', 'q2', 'check', 'x', true, current_date)`)
    ).then(
      () => 'ran',
      (e: Error) => String(e.message)
    );
    expect(said).toMatch(/row-level security/);
    expect(await asFamily(phone, async (c) => (await c.query(`delete from family.attempts where child_id = '${KABIR}' returning 1`)).rows)).toEqual([]);
    expect(await q(`select count(*)::int as n from family.attempts where child_id = $1`, [KABIR])).toEqual([{ n: 1 }]);
  });

  it('never opens the parent’s things: parent mode, the PIN, codes, other routes for parents', async () => {
    const { signParentMode, verifyParentMode } = await import('@/lib/family/session');
    await expect(signParentMode(phone)).rejects.toThrow(/child/);
    expect(await verifyParentMode('anything', phone)).toBe(false);
    expect(await call(await import('@/app/api/family/pin/unlock/route'), '/api/family/pin/unlock', { pin: '482915' }, await cookie(phone))).toMatchObject({ status: 403, body: { error: 'child_phone' } });
    expect(await call(await phoneRoute(), '/api/family/child-phone', { action: 'link', childId: ASHA, code: '123456' }, await cookie(phone))).toMatchObject({ status: 403 });
    expect(await call(await import('@/app/api/family/notify/route'), '/api/family/notify', { kind: 'homework', on: false }, await cookie(phone))).toMatchObject({ status: 403 });
  });

  it('a token with only a device or only a child is no session', async () => {
    const { signFamilyToken } = await import('@/lib/auth/jwt');
    const { verifyFamilySession } = await import('@/lib/family/session');
    const half = await signFamilyToken('family', ACCOUNT, { tv: 0, sid: 's', kp: 1, dv: phone.device!.deviceId }, 600);
    expect(await verifyFamilySession(half)).toBeNull();
    const whole = await signFamilyToken('family', ACCOUNT, { tv: 0, sid: 's', kp: 1, dv: phone.device!.deviceId, ch: ASHA }, 600);
    expect((await verifyFamilySession(whole))?.device).toEqual(phone.device);
  });
});

describe('ending a phone’s session (C342)', () => {
  it('the parent removes it: its next request is refused', async () => {
    const { FamilySessionRevokedError } = await import('@/lib/family/db');
    expect(await call(await phoneRoute(), '/api/family/child-phone', { action: 'remove', deviceId: phone.device!.deviceId }, await cookie(parent, true))).toMatchObject({ status: 200 });
    await expect(asFamily(phone, (c) => c.query(`select 1`))).rejects.toBeInstanceOf(FamilySessionRevokedError);
    expect(await call(await phoneRoute(), '/api/family/child-phone', { action: 'remove', deviceId: phone.device!.deviceId }, await cookie(parent, true))).toMatchObject({ status: 404 });
  });

  it('its own sign-out unlinks it; "sign out everywhere" unlinks every phone', async () => {
    const link = (childId: string) => linkPhone(childId);
    const own = await link(ASHA);
    expect((await call(await import('@/app/api/family/auth/sign-out/route'), '/api/family/auth/sign-out', {}, await cookie(own))).status).toBe(200);
    expect(await q(`select revoked_at is not null as gone from family.child_devices where device_id = $1`, [own.device!.deviceId])).toEqual([{ gone: true }]);
    await link(ASHA);
    await link(KABIR);
    const { signOutEverywhere } = await import('@/lib/family/account');
    await asFamily(parent, (c) => signOutEverywhere(c as never, ACCOUNT));
    expect(await q(`select count(*)::int as n from family.child_devices where revoked_at is null`)).toEqual([{ n: 0 }]);
  });
});

describe('a session’s claims are built in one place (C342)', () => {
  it('no family code builds claims by hand, so a phone’s scope is never dropped', () => {
    const roots = ['src/app/api/family', 'src/app/(family)', 'src/lib/family', 'src/lib/school-link', 'src/components/family'];
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = path.join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(n)) files.push(p);
      }
    };
    roots.forEach(walk);
    // Where a session is made (sign-in, the code, renewing) or claims are built: the only places a tokenVersion is written.
    const allowed = new Set([
      'src/lib/family/db.ts',
      'src/lib/family/session.ts',
      'src/lib/family/sign-in.ts',
      'src/lib/family/child-phone.ts',
      'src/app/api/family/auth/verify/route.ts',
      'src/app/api/family/auth/renew/route.ts',
      'src/app/api/family/child-phone/link/route.ts',
      'src/app/api/family/pin/reset/route.ts',
    ]);
    const bad: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (/tokenVersion\s*:/.test(line) && !allowed.has(f) && !/familyClaims\(/.test(line) && !/^\s*(\/\/|\*)/.test(line) && !/tokenVersion: number/.test(line)) bad.push(`${f}:${i + 1}`);
        if (/with(Family|Guardian)Context\(\s*\{/.test(line)) bad.push(`${f}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
