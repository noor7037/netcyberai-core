import { createDecipheriv, createECDH, createPublicKey, hkdfSync, verify } from 'crypto';
import { createRequire } from 'module';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import type { PushOutcome, PushTarget } from '@/lib/family/web-push';

// Web Push to a linked family's browsers (M3-8b, C339).
//   1. The standard parts: RFC 8291's own worked example, a message a browser can open, and the VAPID header (RFC 8292)
//      signed with the server's derived key.
//   2. Only a known push service's address is ever kept or posted to; the service worker's words are fixed.
//   3. The send job, through the real schema and pool with a stand-in push service: the first scan only sets the marks;
//      new homework is pushed once, as a kind and a page only; an off kind never; a browser that ended it goes, and one
//      that keeps failing goes after five; tonight's plan once an evening; only the platform reads whom to tell.

process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-push-tests-0123456789abcdef';
const sw = createRequire(import.meta.url)('../../public/sw.js') as { pushNotice: (d: unknown) => { title: string; body: string; url: string; tag: string } };
const b64 = (s: string) => Buffer.from(s, 'base64url');

// A browser's side: its key pair, and opening a message (RFC 8291 §3.4, one record).
function browser() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = Buffer.from('0123456789abcdef');
  return { ecdh, p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') };
}
function open(body: Buffer, ua: ReturnType<typeof createECDH>, auth: Buffer): string {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const ikm = Buffer.from(hkdfSync('sha256', ua.computeSecret(asPublic), auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  expect(plain[plain.length - 1]).toBe(2); // the last record's delimiter
  return plain.subarray(0, plain.length - 1).toString();
}

describe('the standard parts (C339)', () => {
  it('RFC 8291’s worked example, byte for byte', async () => {
    const { encryptForBrowser } = await import('@/lib/family/web-push');
    const as = createECDH('prime256v1');
    as.setPrivateKey(b64('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'));
    const out = encryptForBrowser(
      Buffer.from('When I grow up, I want to be a watermelon'),
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
      'BTBZMqHH6r4Tts7J_aSIgg',
      b64('DGv6ra1nlYgDCS1FRnbzlw'),
      as
    );
    expect(out.toString('base64url')).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
    );
  });

  it('a message the browser opens, and a header its push service checks', async () => {
    const { encryptForBrowser, vapidAuthorization, vapidPublicKey } = await import('@/lib/family/web-push');
    const b = browser();
    expect(open(encryptForBrowser(Buffer.from('{"k":"homework"}'), b.p256dh, b.auth), b.ecdh, b64(b.auth))).toBe('{"k":"homework"}');
    const header = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', 1_800_000_000);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!;
    expect(m[4]).toBe(vapidPublicKey());
    expect(JSON.parse(b64(m[2]).toString())).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_800_000_000 + 12 * 3600, sub: 'mailto:admin@netcyberai.com' });
    const pub = b64(m[4]);
    const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
    expect(verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: 'ieee-p1363' }, b64(m[3]))).toBe(true);
    // Derived, never stored: the same server secret, the same key.
    expect(vapidPublicKey()).toBe(m[4]);
  });

  it('only a known push service’s https address, and well-formed keys', async () => {
    const { pushEndpointAllowed, subscriptionKeysOk } = await import('@/lib/family/web-push');
    for (const ok of ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/x', 'https://db5p.notify.windows.com/w/?token=x'])
      expect(pushEndpointAllowed(ok), ok).toBe(true);
    for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x', 'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://notify.windows.com/x', 'https://169.254.169.254/x', 42])
      expect(pushEndpointAllowed(bad), String(bad)).toBe(false);
    const b = browser();
    expect(subscriptionKeysOk(b.p256dh, b.auth)).toBe(true);
    expect(subscriptionKeysOk(b.p256dh.slice(2), b.auth)).toBe(false);
    expect(subscriptionKeysOk(b.p256dh, 'short')).toBe(false);
  });

  it('each run of the job starts at a different account', async () => {
    const { scanOrder } = await import('@/lib/family/push');
    const ten = (n: number) => new Date(n * 600_000);
    expect(scanOrder(['a', 'b', 'c'], ten(0))).toEqual(['a', 'b', 'c']);
    expect(scanOrder(['a', 'b', 'c'], ten(1))).toEqual(['b', 'c', 'a']);
    expect(scanOrder(['a', 'b', 'c'], ten(5))).toEqual(['c', 'a', 'b']);
    expect(scanOrder([], ten(5))).toEqual([]);
  });

  it('the service worker says only fixed words, and opens only the app’s own pages', () => {
    expect(sw.pushNotice({ k: 'homework', u: '/family/parent', l: 'en' })).toEqual({ title: 'New homework from school', body: 'Open NetCyberAI Family to see it.', url: '/family/parent', tag: 'nca-homework' });
    expect(sw.pushNotice({ k: 'tonight', u: '/family', l: 'hi' }).title).toBe('आज रात का अभ्यास तैयार है');
    expect(sw.pushNotice({ k: '<b>Aarav got 12/50</b>', u: 'https://evil.example', l: 'en' })).toEqual({ title: 'NetCyberAI Family', body: 'Open NetCyberAI Family to see it.', url: '/family', tag: 'nca-news' });
    expect(sw.pushNotice({ k: 'body', u: '/family' }).title).toBe('NetCyberAI Family');
    expect(sw.pushNotice(null).url).toBe('/family');
  });
});

// ---- the send job, on the real schema ---------------------------------------------------------------------------------

const A = 'db000000-0000-4000-8000-00000000000a';
const PRINCIPAL = 'db000000-0000-4000-8000-0000000000a1';
const TEACHER = 'db000000-0000-4000-8000-0000000000a2';
const P1 = 'db000000-0000-4000-8000-0000000000e1';
const S1 = 'db000000-0000-4000-8000-0000000005a1';
const C6A = 'db000000-0000-4000-8000-0000000000c6';
const SCI = 'db000000-0000-4000-8000-0000000000d1';
const ACCOUNT = 'f9000000-0000-4000-8000-0000000000a1';
const OTHER = 'f9000000-0000-4000-8000-0000000000b1';
const CHILD = 'f9000000-0000-4000-8000-0000000000c1';
const VERSION = 'f9000000-0000-4000-8000-0000000000e1';
const TOPIC = 'cbse.c6.science.ch01.t01';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let hw = 0;
const claims = { accountId: ACCOUNT, tokenVersion: 0 };
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
const sent: { to: PushTarget; payload: Record<string, string> }[] = [];
let answer: (to: PushTarget) => PushOutcome = () => 'sent';
const send = async (to: PushTarget, payload: Record<string, string>) => {
  sent.push({ to, payload });
  return answer(to);
};
const cookie = async (account = ACCOUNT) => {
  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  const s = { accountId: account, tokenVersion: 0, sessionId: 's1' };
  return `ncf_session=${await signFamilySession(s)}; ncf_parent=${await signParentMode(s)}`;
};
const subscribe = async (subscription: unknown, account = ACCOUNT) => {
  const { POST } = await import('@/app/api/family/push/route');
  const res = await POST(new NextRequest('http://localhost/api/family/push', { method: 'POST', headers: { 'content-type': 'application/json', cookie: await cookie(account) }, body: JSON.stringify({ action: 'subscribe', subscription }) }));
  return { status: res.status, body: await res.json() };
};
const newHomework = async () => {
  const id = `db000000-0000-4000-8000-0000000009${String(++hw).padStart(2, '0')}`;
  await q(`insert into homework (homework_id, school_id, subject_id, title, due_date, created_by) values ($1, $2, $3, 'Magnets', current_date + 2, $4)`, [id, A, SCI, TEACHER]);
  await q(`insert into homework_targets (school_id, homework_id, class_id, title, due_date) values ($1, $2, $3, 'Magnets', current_date + 2)`, [A, id, C6A]);
};
const scan = async (at: Date) => (await import('@/lib/family/push')).pushForAccount(claims, at, send);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false);
    insert into users (user_id, school_id, email, role, display_name, is_active) values ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true), ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Tara Teacher', true);
    insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${TEACHER}', '${A}', 'teacher', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C6A}', '${A}', '6-A', '6', 'A');
    insert into subjects (subject_id, school_id, name) values ('${SCI}', '${A}', 'Science');
    insert into students (student_id, school_id, admission_no, name, class_id, status) values ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1');
    update control.settings set value = '[]'::jsonb where key in ('family.open_subjects', 'family.reviewed_only_subjects');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'push@example.org'), ('${OTHER}', 'other@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code, free_subject) values ('${CHILD}', '${ACCOUNT}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR', 'science');
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
      values ('${VERSION}', 'CBSE', 6, 'science', '2026-27', 1, 'published', 'everyone', 'repository', 'test', 'f9000000-0000-4000-8000-0000000000f1', now());
    insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, source_url, source_page, checked_on)
      values ('f9000000-0000-4000-8000-0000000000d1', '${VERSION}', 'cbse.c6.science.ch01', 1, 'Magnets', 'https://ncert.nic.in/', '1', '2026-10-21');
    insert into content.topics (version_id, chapter_id, topic_key, position, title_en, source_url, source_page, checked_on)
      values ('${VERSION}', 'f9000000-0000-4000-8000-0000000000d1', '${TOPIC}', 1, 'Poles of a magnet', 'https://ncert.nic.in/', '1', '2026-10-21');
  `);
  const { issueConnectCode, redeemConnectCode } = await import('@/lib/school-link');
  const { withFamilyContext } = await import('@/lib/auth/db');
  const { setChildLinks } = await import('@/lib/family/school');
  const issued = await db.pg.transaction(async (c: { query: (s: string, p?: unknown[]) => Promise<unknown> }) => {
    await c.query(`set local role app_user`);
    for (const [k, v] of Object.entries({ 'app.current_tenant_id': A, 'app.current_role': 'principal', 'app.current_user_id': PRINCIPAL })) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return issueConnectCode(c as never, { userId: PRINCIPAL, role: 'principal', schoolId: A }, P1);
  });
  const made = await withFamilyContext(claims, (c) => redeemConnectCode(c, ACCOUNT, issued.code));
  await withFamilyContext(claims, (c) => setChildLinks(c, ACCOUNT, made!.linkId, [S1], [{ studentId: S1, childId: CHILD }]));
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('a family’s browsers (C339)', () => {
  const b1 = browser();
  const b2 = browser();
  const sub = (b: ReturnType<typeof browser>, endpoint: string) => ({ endpoint, keys: { p256dh: b.p256dh, auth: b.auth } });

  it('keeps only a known push service’s address with good keys, the account’s own', async () => {
    expect(await subscribe(sub(b1, 'https://evil.example/push'))).toEqual({ status: 400, body: { error: 'bad_subscription' } });
    expect(await subscribe({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'x', auth: 'y' } })).toEqual({ status: 400, body: { error: 'bad_subscription' } });
    expect(await subscribe(sub(b1, 'https://fcm.googleapis.com/fcm/send/one'))).toEqual({ status: 200, body: { ok: true } });
    expect(await subscribe(sub(b2, 'https://updates.push.services.mozilla.com/wpush/v2/two'))).toEqual({ status: 200, body: { ok: true } });
    // The same browser under another family account (a shared phone) is that account's own row.
    expect(await subscribe(sub(b1, 'https://fcm.googleapis.com/fcm/send/one'), OTHER)).toEqual({ status: 200, body: { ok: true } });
    expect(await q(`select account_id, count(*)::int as n from family.push_subscriptions group by 1 order by 1`)).toEqual([
      { account_id: ACCOUNT, n: 2 },
      { account_id: OTHER, n: 1 },
    ]);
  });

  it('only the platform reads whom to tell; the family and school roles cannot', async () => {
    const said = async (fn: () => Promise<unknown>) => fn().then(() => 'ran', (e: Error) => String(e.message));
    const { withFamilyContext } = await import('@/lib/auth/db');
    expect(await said(() => withFamilyContext(claims, (c) => c.query(`select * from family.push_accounts()`)))).toMatch(/permission denied/);
    const rows = await db.pg.transaction(async (c: { query: (s: string) => Promise<{ rows: unknown[] }> }) => {
      await c.query('set local role nca_super');
      return (await c.query(`select account_id from family.push_accounts()`)).rows;
    });
    expect(rows).toEqual([{ account_id: ACCOUNT }, { account_id: OTHER }]);
  });

  it('the first scan only sets the marks: no pile of old news', async () => {
    await newHomework();
    expect(await scan(new Date())).toEqual({ kinds: [], sent: 0, gone: 0, failed: 0 });
    expect(sent).toEqual([]);
  });

  it('new homework is pushed once to each browser: a kind and a page, nothing else', async () => {
    await newHomework();
    const r = await scan(new Date());
    expect(r).toEqual({ kinds: ['homework'], sent: 2, gone: 0, failed: 0 });
    expect(sent.map((s) => [s.to.endpoint, s.payload])).toEqual([
      ['https://fcm.googleapis.com/fcm/send/one', { k: 'homework', u: '/family/parent', l: 'en' }],
      ['https://updates.push.services.mozilla.com/wpush/v2/two', { k: 'homework', u: '/family/parent', l: 'en' }],
    ]);
    sent.length = 0;
    expect((await scan(new Date())).kinds).toEqual([]);
  });

  it('a kind the parent turned off is never pushed', async () => {
    await q(`insert into family.notify_off (account_id, kind) values ($1, 'homework')`, [ACCOUNT]);
    await newHomework();
    expect((await scan(new Date())).kinds).toEqual([]);
    await q(`delete from family.notify_off where account_id = $1`, [ACCOUNT]);
  });

  it('a browser that ended it goes at once; one that keeps failing goes after five', async () => {
    answer = (to) => (to.endpoint.includes('mozilla') ? 'gone' : 'failed');
    for (let i = 1; i <= 5; i++) {
      await newHomework();
      await scan(new Date());
      expect(await q(`select endpoint, failures from family.push_subscriptions where account_id = $1 order by endpoint`, [ACCOUNT]), `round ${i}`).toEqual(
        i < 5 ? [{ endpoint: 'https://fcm.googleapis.com/fcm/send/one', failures: i }] : []
      );
    }
    answer = () => 'sent';
  });

  it('signing out everywhere stops every browser of the account being told', async () => {
    expect(await subscribe(sub(b2, 'https://updates.push.services.mozilla.com/wpush/v2/two'))).toEqual({ status: 200, body: { ok: true } });
    const { signOutEverywhere } = await import('@/lib/family/account');
    const { withFamilyContext } = await import('@/lib/auth/db');
    await withFamilyContext(claims, (c) => signOutEverywhere(c, ACCOUNT));
    expect(await q(`select count(*)::int as n from family.push_subscriptions where account_id = $1`, [ACCOUNT])).toEqual([{ n: 0 }]);
    await q(`update family.accounts set token_version = 0 where account_id = $1`, [ACCOUNT]);
  });

  it('tonight’s plan, once an evening from 18:30 in India, when there is one', async () => {
    sent.length = 0;
    expect(await subscribe(sub(b1, 'https://fcm.googleapis.com/fcm/send/one'))).toEqual({ status: 200, body: { ok: true } });
    await q(`update control.settings set value = 'true'::jsonb where key = 'family.plus_open'`);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    await q(`insert into family.home_plans (account_id, child_id, starts_on, topics) values ($1, $2, $3::date, $4::jsonb)`, [ACCOUNT, CHILD, today, JSON.stringify([{ topicKey: TOPIC, subject: 'science' }])]);
    const evening = (hhmm: string) => new Date(`${today}T${hhmm}:00+05:30`);
    expect((await scan(evening('18:10'))).kinds).toEqual([]);
    expect((await scan(evening('18:40'))).kinds).toEqual(['tonight']);
    expect(sent.at(-1)?.payload).toEqual({ k: 'tonight', u: '/family', l: 'en' });
    expect((await scan(evening('19:30'))).kinds).toEqual([]);
  });
});
