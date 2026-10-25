import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// A child's own phone (M2b-2, C342; docs/34 §9.4), on the real schema through the real routes and pool.
//   1. The code: six digits, ten minutes, used once, kept only as a keyed hash, at most five an hour; spending it is
//      limited per network and in all.
//   2. The phone's session reaches one child only: by the database's own rules on every family table that names a
//      child, whatever the code asks; it never opens parent mode.
//   3. Removing the phone, its own sign-out, or "sign out everywhere" ends it at once.
//   4. Family code builds a session's claims only through familyClaims, so a phone's scope is never dropped.

process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-child-phone-tests-0123456789ab';
const ACCOUNT = 'fb000000-0000-4000-8000-0000000000a1';
const OTHER = 'fb000000-0000-4000-8000-0000000000b1';
const ASHA = 'fb000000-0000-4000-8000-0000000000c1';
const KABIR = 'fb000000-0000-4000-8000-0000000000c2';
const TOPIC = 'cbse.c6.science.ch01.t01';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
type Session = { accountId: string; tokenVersion: number; sessionId: string; device?: { deviceId: string; childId: string } };
const parent: Session = { accountId: ACCOUNT, tokenVersion: 0, sessionId: 'parent-session' };
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
const newCode = async (childId: string) => {
  const r = await call(await phoneRoute(), '/api/family/child-phone', { action: 'code', childId }, await cookie(parent, true));
  return r;
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'phones@example.org'), ('${OTHER}', 'other@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${ASHA}', '${ACCOUNT}', 'Asha', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${KABIR}', '${ACCOUNT}', 'Kabir', 9, 'CBSE', 'en', 'en', 'IN-HR');
    insert into family.attempts (account_id, child_id, subject, topic_key, item_key, kind, answer, correct, answered_on) values
      ('${ACCOUNT}', '${ASHA}', 'science', '${TOPIC}', 'q1', 'check', 'a', true, current_date),
      ('${ACCOUNT}', '${KABIR}', 'science', '${TOPIC}', 'q1', 'check', 'b', false, current_date);
  `);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('the parent’s one-time code (C342)', () => {
  it('six digits for one of the family’s children, kept only as a keyed hash, for ten minutes', async () => {
    const r = await newCode(ASHA);
    expect(r.status).toBe(200);
    expect(r.body.code).toMatch(/^[0-9]{6}$/);
    const rows = await q(`select code_hash, extract(epoch from expires_at - created_at)::int as secs from family.child_link_codes`);
    expect(rows).toHaveLength(1);
    expect(rows[0].code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].code_hash).not.toContain(String(r.body.code));
    expect(rows[0].secs).toBe(600);
    expect((await newCode('fb000000-0000-4000-8000-0000000000ff')).status).toBe(404);
  });

  it('a new code replaces the unused one; at most five an hour', async () => {
    await newCode(ASHA);
    expect(await q(`select count(*)::int as n from family.child_link_codes where child_id = $1 and used_at is null`, [ASHA])).toEqual([{ n: 1 }]);
    // Two for Asha (one replaced) and three for Kabir (two replaced): five this hour, so the sixth is refused.
    await newCode(KABIR);
    await newCode(KABIR);
    await newCode(KABIR);
    expect(await q(`select count(*)::int as n from family.child_link_codes where child_id = $1 and used_at is null`, [KABIR])).toEqual([{ n: 1 }]);
    expect(await newCode(KABIR)).toMatchObject({ status: 429, body: { error: 'too_many' } });
    await q(`update family.child_link_codes set created_at = created_at - interval '2 hours', expires_at = expires_at - interval '2 hours'`);
  });

  it('only the parent, in parent mode, makes a code', async () => {
    expect((await call(await phoneRoute(), '/api/family/child-phone', { action: 'code', childId: ASHA }, await cookie(parent))).status).toBe(403);
  });
});

describe('a child’s phone spends the code (C342)', () => {
  it('a wrong code links nothing; the right one links the phone to that one child, once', async () => {
    const r = await newCode(ASHA);
    const code = String(r.body.code);
    const wrong = code === '000000' ? '000001' : '000000';
    expect(await call(await linkRoute(), '/api/family/child-phone/link', { code: wrong })).toMatchObject({ status: 400, body: { error: 'wrong' } });
    const linked = await call(await linkRoute(), '/api/family/child-phone/link', { code: `${code.slice(0, 3)} ${code.slice(3)}` });
    expect(linked).toMatchObject({ status: 200, body: { status: 'linked' } });
    expect(linked.setCookie).toMatch(/ncf_session=/);
    const devices = await q(`select device_id, child_id, revoked_at from family.child_devices`);
    expect(devices).toEqual([{ device_id: expect.any(String), child_id: ASHA, revoked_at: null }]);
    phone = { accountId: ACCOUNT, tokenVersion: 0, sessionId: 'phone-session', device: { deviceId: devices[0].device_id, childId: ASHA } };
    // The token the phone got carries that device and child.
    const token = /ncf_session=([^;]+)/.exec(linked.setCookie)![1];
    const { verifyFamilySession } = await import('@/lib/family/session');
    expect((await verifyFamilySession(token))?.device).toEqual(phone.device);
    expect(await call(await linkRoute(), '/api/family/child-phone/link', { code })).toMatchObject({ status: 400, body: { error: 'wrong' } });
  });

  it('an old code links nothing', async () => {
    const code = String((await newCode(KABIR)).body.code);
    await q(`update family.child_link_codes set created_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute' where used_at is null`);
    expect(await call(await linkRoute(), '/api/family/child-phone/link', { code }, '', '203.0.113.8')).toMatchObject({ status: 400, body: { error: 'wrong' } });
  });

  it('ten tries an hour from one network, three hundred in all', async () => {
    for (let i = 0; i < 8; i++) await call(await linkRoute(), '/api/family/child-phone/link', { code: '123456' }, '', '198.51.100.9');
    // This network has now tried 8 times; the 11th try is refused before any code is looked at.
    await call(await linkRoute(), '/api/family/child-phone/link', { code: '123456' }, '', '198.51.100.9');
    await call(await linkRoute(), '/api/family/child-phone/link', { code: '123456' }, '', '198.51.100.9');
    expect(await call(await linkRoute(), '/api/family/child-phone/link', { code: '123456' }, '', '198.51.100.9')).toMatchObject({ status: 429, body: { error: 'too_many' } });
    expect(await q(`select count(*)::int as n from family.child_link_tries where scope ~ '^[0-9a-f]{64}$' and scope <> '*'`)).toEqual([{ n: 3 }]);
    await q(`update family.child_link_tries set n = 300 where scope = '*'`);
    expect(await call(await linkRoute(), '/api/family/child-phone/link', { code: '654321' }, '', '192.0.2.1')).toMatchObject({ status: 429, body: { error: 'too_many' } });
    await q(`update family.child_link_tries set n = 0`);
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
    expect(await call(await phoneRoute(), '/api/family/child-phone', { action: 'code', childId: ASHA }, await cookie(phone))).toMatchObject({ status: 403 });
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
    const link = async (childId: string) => {
      const code = String((await newCode(childId)).body.code);
      await call(await linkRoute(), '/api/family/child-phone/link', { code }, '', '192.0.2.50');
      const d = (await q(`select device_id from family.child_devices where child_id = $1 and revoked_at is null order by linked_at desc limit 1`, [childId]))[0].device_id as string;
      return { ...parent, sessionId: `s-${d}`, device: { deviceId: d, childId } } as Session;
    };
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
