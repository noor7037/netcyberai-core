import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// M2b-1 (C305): the Focus Lock's server, on the real schema through the real routes and pool. Two families, A and B.
//   1. The focus_lock module is off until Control switches it on.
//   2. A phone is kept only as a keyed hash of its id, with the children set for it, its last report and three flags.
//   3. One account never reads or writes another's phones, children sets or notices (row rules, column rights, routes).
//   4. The status says "done" only from today's checked answers: not from a forged completion, progress, or yesterday.
//   5. A report with any field beyond the three flags, or anything else, is refused and changes nothing.
//   6. A report that stops while the lock was on tells the parent once (one notice, one email), and a new gap again.
//   7. A permission switched off and a clock change are told once until seen; Control's switch off never alarms.
// Made-up names, addresses and phone ids only.

const A = 'f9000000-0000-4000-8000-0000000000a1';
const B = 'f9000000-0000-4000-8000-0000000000b1';
const CA1 = 'f9000000-0000-4000-8000-0000000000a2';
const CA2 = 'f9000000-0000-4000-8000-0000000000a3';
const CB = 'f9000000-0000-4000-8000-0000000000b2';
const VERSION = 'f9000000-0000-4000-8000-0000000000c1';
const CH = 'f9000000-0000-4000-8000-0000000000d1';
const T1 = 'cbse.c9.science.u1.ch01.t01';
const T2 = 'cbse.c9.science.u1.ch01.t02';
const T3 = 'cbse.c9.science.u1.ch01.t03';
// Each phone's own random id (base64url), as the plugin makes it.
const PHONE_A = 'phoneA-0123456789abcdefghijklmnopqrstuvwxyz_';
const PHONE_A2 = 'phoneA2-0123456789abcdefghijklmnopqrstuvwxyz';
const PHONE_X = 'phoneX-0123456789abcdefghijklmnopqrstuvwxyz_';
const FLAGS = { lockOn: true, permissionsOk: true, clockChanged: false };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: Record<string, any>;
let childA = '';
let parentA = '';
let childB = '';
let parentB = '';
let devA = '';
let devA2 = '';
let devB = '';
let today = '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; affectedRows?: number }> };
const asFamily = <T>(account: string, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', '${account}', true)`);
    return fn(tx);
  });
const asRole = <T>(role: string, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query(`set local role ${role}`);
    return fn(tx);
  });
const refused = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error('expected the database to refuse');
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q = async (sql: string, p: unknown[] = []): Promise<any[]> => (await db.pg.query(sql, p)).rows;

const req = (path: string, o: { method?: string; cookie?: string; device?: string; body?: unknown; raw?: string } = {}) => {
  const headers: Record<string, string> = {};
  if (o.cookie) headers.cookie = o.cookie;
  if (o.device) headers['x-focus-device'] = o.device;
  const body = o.raw ?? (o.body === undefined ? undefined : JSON.stringify(o.body));
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`http://localhost${path}`, { method: o.method ?? 'GET', headers, body });
};
const status = async (cookie: string, device: string) => {
  const res = await R.status.GET(req('/api/family/focus/status', { cookie, device }));
  return { code: res.status as number, body: await res.json() };
};
const beat = async (cookie: string, device: string, raw: string, path = '/api/family/focus/heartbeat') =>
  (await R.heartbeat.POST(req(path, { method: 'POST', cookie, device, raw }))).status as number;
const register = async (cookie: string, device: string, childIds: string[]) => {
  const res = await R.devices.PUT(req('/api/family/focus/devices', { method: 'PUT', cookie, device, body: { childIds } }));
  return { code: res.status as number, body: await res.json() };
};
// The last report as if it came this many minutes ago (the route refuses reports closer than a minute apart).
const age = (device: string, minutes: number) => q(`update family.focus_devices set last_heartbeat_at = now() - make_interval(mins => ${minutes}) where device_id = '${device}'`);
const sweep = async () => Number((await q(`select family.focus_sweep() as n`))[0].n);
const notices = (device: string) => q(`select kind, emailed_at is not null as emailed, seen_at is not null as seen from family.focus_notices where device_id = $1 order by created_at, kind`, [device]);
const emails = () => q(`select payload, idempotency_key from jobs where type = 'email.send' and payload->>'template' = 'focus_notice' order by created_at, idempotency_key`);
const answer = (child: string, topic: string, day: string, correct: boolean) =>
  q(`insert into family.attempts (account_id, child_id, subject, topic_key, item_key, kind, answer, correct, answered_on) values ($1, $2, 'science', $3, 'q', 'check', 'x', $4, $5)`, [
    A,
    child,
    topic,
    correct,
    day,
  ]);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-focus-tests-0123456789';
  await db.pg.exec(`
    update control.settings set value = '[]'::jsonb where key in ('family.open_subjects', 'family.reviewed_only_subjects');
    insert into family.accounts (account_id, email, pin_hash, pin_set_at) values
      ('${A}', 'focus.a@example.org', 'scrypt$16384$8$1$c2FsdHNhbHRzYWx0c2FsdA==$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNo', '2026-10-01T10:00:00Z'),
      ('${B}', 'focus.b@example.org', null, null);
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values
      ('${A}', 'study_core', true, 'parent_tap', 'v1'), ('${B}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code, free_subject, free_subject_set_at) values
      ('${CA1}', '${A}', 'Tara', 9, 'CBSE', 'en', 'en', 'IN-KA', 'science', now()),
      ('${CA2}', '${A}', 'Veer', 9, 'CBSE', 'en', 'en', 'IN-KA', 'science', now()),
      ('${CB}', '${B}', 'Ravi', 9, 'CBSE', 'en', 'en', 'IN-HR', 'science', now());
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
      values ('${VERSION}', 'CBSE', 9, 'science', '2026-27', 1, 'published', 'everyone', 'repository', 'test', 'f9000000-0000-4000-8000-0000000000f1', now());
    insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, source_url, source_page, checked_on)
      values ('${CH}', '${VERSION}', 'cbse.c9.science.u1.ch01', 1, 'Matter', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
    insert into content.topics (version_id, chapter_id, topic_key, position, title_en, source_url, source_page, checked_on) values
      ('${VERSION}', '${CH}', '${T1}', 1, 'States of matter', 'https://cbseacademic.nic.in/', '4', '2026-10-21'),
      ('${VERSION}', '${CH}', '${T2}', 2, 'Evaporation', 'https://cbseacademic.nic.in/', '4', '2026-10-21'),
      ('${VERSION}', '${CH}', '${T3}', 3, 'Diffusion', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
  `);
  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  const sa = { accountId: A, tokenVersion: 0, sessionId: 'sa' };
  const sb = { accountId: B, tokenVersion: 0, sessionId: 'sb' };
  childA = `ncf_session=${await signFamilySession(sa)}`;
  parentA = `${childA}; ncf_parent=${await signParentMode(sa)}`;
  childB = `ncf_session=${await signFamilySession(sb)}`;
  parentB = `${childB}; ncf_parent=${await signParentMode(sb)}`;
  R = {
    status: await import('@/app/api/family/focus/status/route'),
    heartbeat: await import('@/app/api/family/focus/heartbeat/route'),
    devices: await import('@/app/api/family/focus/devices/route'),
    notices: await import('@/app/api/family/focus/notices/route'),
  };
  today = (await import('@/lib/time/india')).indiaDate();
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('the Focus Lock’s server (M2b-1, C305)', () => {
  it('is off until Control switches it on', async () => {
    expect(await register(parentA, PHONE_A, [CA1])).toEqual({ code: 403, body: { error: 'off' } });
    expect((await status(childA, PHONE_A)).body).toEqual({ error: 'off' });
    expect(await beat(childA, PHONE_A, JSON.stringify(FLAGS))).toBe(403);
    expect(await q(`select 1 from family.focus_devices`)).toEqual([]);
    await q(`insert into control.app_flags (app, module, enabled, reason) values ('family', 'focus_lock', true, 'closed pilot, written consent')`);
  });

  it('a phone is set up by the parent only, for the family’s own children, and kept as a keyed hash', async () => {
    expect((await register(childA, PHONE_A, [CA1, CA2])).body).toEqual({ error: 'parent_pin_required' });
    expect((await register(parentA, PHONE_A, [CA1, CB])).code).toBe(400);
    expect((await register(parentA, PHONE_A, [CA1, CA1])).code).toBe(400);
    expect((await register(parentA, PHONE_A, [])).code).toBe(400);
    expect((await register(parentA, 'short', [CA1])).body).toEqual({ error: 'bad_device' });
    const first = await register(parentA, PHONE_A, [CA1]);
    expect(first.code).toBe(200);
    devA = first.body.deviceId;
    // Set up again on the same phone: the same row, with the children changed.
    expect((await register(parentA, PHONE_A, [CA1, CA2])).body).toEqual({ deviceId: devA });
    devA2 = (await register(parentA, PHONE_A2, [CA2])).body.deviceId;
    // Family B sets up a phone with the very same id: its own row, which says nothing about A's.
    devB = (await register(parentB, PHONE_A, [CB])).body.deviceId;
    expect(new Set([devA, devA2, devB]).size).toBe(3);

    const rows = await q(`select device_hash from family.focus_devices`);
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.device_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(await q(`select * from family.focus_devices`))).not.toContain('phoneA');
    // The same phone id in two families: two unrelated hashes, so the table cannot link the families.
    expect(new Set(rows.map((r) => r.device_hash)).size).toBe(3);
    const set = await q(`select child_id from family.focus_device_children where device_id = $1 order by child_id`, [devA]);
    expect(set.map((r) => r.child_id)).toEqual([CA1, CA2]);
  });

  it('keeps no app data: the phone row is the hashed id, the last report and three flags', async () => {
    const cols = (await q(`select column_name from information_schema.columns where table_schema = 'family' and table_name = 'focus_devices' order by ordinal_position`)).map((r) => r.column_name);
    expect(cols).toEqual(['device_id', 'account_id', 'device_hash', 'created_at', 'last_heartbeat_at', 'lock_on', 'permissions_ok', 'clock_changed', 'stop_noticed_at']);
  });

  it('one account never reads or writes another’s phones, children sets or notices', async () => {
    await q(`insert into family.focus_notices (account_id, device_id, kind) values ('${A}', '${devA}', 'clock')`);
    const seen = await asFamily(B, async (tx) => ({
      devices: (await tx.query(`select device_id from family.focus_devices`)).rows.map((r) => r.device_id),
      children: (await tx.query(`select child_id from family.focus_device_children`)).rows.map((r) => r.child_id),
      notices: (await tx.query(`select notice_id from family.focus_notices`)).rows.length,
    }));
    expect(seen).toEqual({ devices: [devB], children: [CB], notices: 0 });
    // Plain statements (the ids written in), so a refusal can never be a planning error.
    const none = async (sql: string) => (await asFamily(B, (tx) => tx.query(sql))).affectedRows ?? 0;
    expect(await none(`update family.focus_devices set lock_on = false, last_heartbeat_at = now(), permissions_ok = true, clock_changed = false where device_id = '${devA}'`)).toBe(0);
    expect(await none(`delete from family.focus_devices where device_id = '${devA}'`)).toBe(0);
    expect(await none(`delete from family.focus_device_children where device_id = '${devA}'`)).toBe(0);
    expect(await none(`update family.focus_notices set seen_at = now() where account_id = '${A}'`)).toBe(0);
    expect(await refused(() => asFamily(B, (tx) => tx.query(`insert into family.focus_devices (account_id, device_hash) values ('${A}', '${'a'.repeat(64)}')`)))).toMatch(/row-level security/);
    expect(await refused(() => asFamily(B, (tx) => tx.query(`insert into family.focus_device_children (account_id, device_id, child_id) values ('${A}', '${devA}', '${CB}')`)))).toMatch(/row-level security/);
    // B's own phone can never name A's child: the composite key refuses it.
    expect(await refused(() => asFamily(B, (tx) => tx.query(`insert into family.focus_device_children (account_id, device_id, child_id) values ('${B}', '${devB}', '${CA1}')`)))).toMatch(/foreign key/);
    expect(await refused(() => asFamily(B, (tx) => tx.query(`insert into family.focus_notices (account_id, device_id, kind) values ('${A}', '${devA}', 'stopped')`)))).toMatch(/row-level security/);
    // Even on its own notices a family sets only "seen": when it happened and whether it was emailed are the server's.
    expect(await refused(() => asFamily(B, (tx) => tx.query(`update family.focus_notices set emailed_at = now()`)))).toMatch(/permission denied/);
    expect(await refused(() => asFamily(B, (tx) => tx.query(`select family.focus_sweep()`)))).toMatch(/permission denied/);
    for (const role of ['app_user', 'nca_super', 'anon', 'authenticated']) {
      for (const table of ['focus_devices', 'focus_device_children', 'focus_notices']) {
        expect(await refused(() => asRole(role, (tx) => tx.query(`select 1 from family.${table}`))), `${role} ${table}`).toMatch(/permission denied/);
      }
    }
    expect((await q(`select count(*)::int as n from family.focus_devices where device_id = '${devA}'`))[0].n).toBe(1);

    // Through the routes: B's session with A's phone id reaches B's own phone only; A's phone and notice are not found.
    expect((await status(childB, PHONE_A)).body.children.map((c: { childId: string }) => c.childId)).toEqual([CB]);
    expect((await status(childB, PHONE_X)).body).toEqual({ error: 'unknown_device' });
    expect((await R.devices.DELETE(req('/api/family/focus/devices', { method: 'DELETE', cookie: parentB, body: { deviceId: devA } }))).status).toBe(404);
    const [n] = await q(`select notice_id from family.focus_notices where device_id = $1`, [devA]);
    expect((await R.notices.POST(req('/api/family/focus/notices', { method: 'POST', cookie: parentB, body: { noticeId: n.notice_id } }))).status).toBe(404);
    expect((await R.notices.POST(req('/api/family/focus/notices', { method: 'POST', cookie: childA, body: { noticeId: n.notice_id } }))).status).toBe(403);
    expect((await R.notices.POST(req('/api/family/focus/notices', { method: 'POST', cookie: parentA, body: { noticeId: n.notice_id } }))).status).toBe(200);
    const { parentFocus } = await import('@/lib/family/focus');
    const { withFamilyContext } = await import('@/lib/family/db');
    const viewB = await withFamilyContext({ accountId: B, tokenVersion: 0 }, (c) => parentFocus(c, B));
    expect(viewB.devices.map((d) => d.deviceId)).toEqual([devB]);
    expect(viewB.devices[0].childNames).toEqual(['Ravi']);
  });

  it('says “done” only from today’s checked answers', async () => {
    const first = await status(childA, PHONE_A);
    expect(first.code).toBe(200);
    expect(first.body.day).toBe(today);
    expect(first.body.children.map((c: { childId: string; firstName: string; done: boolean }) => [c.childId, c.firstName, c.done])).toEqual([
      [CA1, 'Tara', false],
      [CA2, 'Veer', false],
    ]);
    const tara = () => status(childA, PHONE_A).then((s) => s.body.children.find((c: { childId: string }) => c.childId === CA1));
    expect((await tara()).pending).toEqual([
      { key: T1, title: 'States of matter', subject: 'science', kind: 'next' },
      { key: T2, title: 'Evaporation', subject: 'science', kind: 'next' },
    ]);
    // A completion written straight into the day, progress without an answer today, and yesterday's answers: not done.
    await q(`update family.plan_days set completed_at = now() where child_id = $1`, [CA1]);
    expect((await tara()).done).toBe(false);
    expect((await q(`select completed_at from family.plan_days where child_id = $1`, [CA1]))[0].completed_at).toBeNull();
    await q(`insert into family.topic_progress (account_id, child_id, topic_key, subject, answered, correct) values ($1, $2, $3, 'science', 4, 4), ($1, $2, $4, 'science', 4, 4)`, [A, CA1, T1, T2]);
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    await answer(CA1, T1, yesterday, true);
    await answer(CA1, T2, yesterday, true);
    expect((await tara()).done).toBe(false);
    // Today's checked answers, right or wrong, one per item: done, and nothing pending.
    await answer(CA1, T1, today, true);
    expect(await tara()).toMatchObject({ done: false, pending: [{ key: T2 }] });
    await answer(CA1, T2, today, false);
    expect(await tara()).toMatchObject({ done: true, pending: [] });
    // Another child set for the same phone is unaffected.
    expect((await status(childA, PHONE_A)).body.children.find((c: { childId: string }) => c.childId === CA2).done).toBe(false);
  });

  it('gives the PIN’s version, which changes when the PIN is set again', async () => {
    const before = (await status(childA, PHONE_A)).body.pinVersion;
    expect(before).toMatch(/^[0-9a-f]{16}$/);
    await q(`update family.accounts set pin_set_at = pin_set_at + interval '1 day' where account_id = $1`, [A]);
    const after = (await status(childA, PHONE_A)).body.pinVersion;
    expect(after).toMatch(/^[0-9a-f]{16}$/);
    expect(after).not.toBe(before);
    expect((await status(childB, PHONE_A)).body.pinVersion).toBeNull();
  });

  it('a day with nothing in the plan counts as done, and a pre-primary child is not set for a phone (review of C305)', async () => {
    const C7 = 'f9000000-0000-4000-8000-0000000000a4';
    const UKG = 'f9000000-0000-4000-8000-0000000000a5';
    await q(`insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ($1, $2, 'Isha', 7, 'CBSE', 'en', 'en', 'IN-KA'), ($3, $2, 'Kabir', 0, 'CBSE', 'en', 'en', 'IN-KA')`, [C7, A, UKG]);
    // A pre-primary child has no study plan, so the lock would have nothing to unlock with.
    expect((await register(parentA, PHONE_X, [UKG])).code).toBe(400);
    // A Class 7 child with no released catalog has nothing to study today: done, with nothing pending, never held.
    const dev = (await register(parentA, PHONE_X, [C7])).body.deviceId as string;
    expect((await status(childA, PHONE_X)).body.children).toEqual([{ childId: C7, firstName: 'Isha', done: true, pending: [] }]);
    await q(`delete from family.focus_devices where device_id = $1`, [dev]);
    await q(`delete from family.children where child_id = any ($1::uuid[])`, [[C7, UKG]]);
  });

  it('refuses a report with any field beyond the three flags, or any other shape, and changes nothing', async () => {
    const bad = [
      JSON.stringify({ ...FLAGS, app: 'com.example.game' }),
      JSON.stringify({ ...FLAGS, openedAt: '2026-10-24T10:00:00Z' }),
      JSON.stringify({ ...FLAGS, apps: [] }),
      JSON.stringify({ lockOn: true, permissionsOk: true }),
      JSON.stringify({ lockOn: 'true', permissionsOk: true, clockChanged: false }),
      JSON.stringify({ lockOn: 1, permissionsOk: true, clockChanged: false }),
      JSON.stringify({ lockOn: true, permissionsOk: null, clockChanged: false }),
      JSON.stringify([true, true, false]),
      JSON.stringify({ flags: FLAGS }),
      'lockOn=true&permissionsOk=true&clockChanged=false',
      '',
      `{"lockOn":true,"permissionsOk":true,"clockChanged":false,"pad":"${'x'.repeat(300)}"}`,
    ];
    for (const raw of bad) expect(await beat(childA, PHONE_A, raw), raw.slice(0, 60)).toBe(400);
    // Nothing in the address either.
    expect(await beat(childA, PHONE_A, JSON.stringify(FLAGS), '/api/family/focus/heartbeat?app=com.example.game')).toBe(400);
    expect(await beat(childA, 'not a phone id', JSON.stringify(FLAGS))).toBe(400);
    expect(await beat(childA, PHONE_X, JSON.stringify(FLAGS))).toBe(404);
    expect((await R.heartbeat.POST(req('/api/family/focus/heartbeat', { method: 'POST', device: PHONE_A, raw: JSON.stringify(FLAGS) }))).status).toBe(401);
    expect((await q(`select last_heartbeat_at, lock_on from family.focus_devices where device_id = $1`, [devA]))[0]).toEqual({ last_heartbeat_at: null, lock_on: null });

    // The three flags, in any order: kept. Another one within the minute is refused.
    expect(await beat(childA, PHONE_A, JSON.stringify({ clockChanged: false, permissionsOk: true, lockOn: true }))).toBe(200);
    expect((await q(`select lock_on, permissions_ok, clock_changed, last_heartbeat_at is not null as reported from family.focus_devices where device_id = $1`, [devA]))[0]).toEqual({
      lock_on: true,
      permissions_ok: true,
      clock_changed: false,
      reported: true,
    });
    expect(await beat(childA, PHONE_A, JSON.stringify(FLAGS))).toBe(429);
    // A report that changes a flag is always taken, however soon after the last (review of C305): the lock ending with
    // its window must never be lost, or the end of every lock time would read as a stop.
    expect(await beat(childA, PHONE_A, JSON.stringify({ ...FLAGS, lockOn: false }))).toBe(200);
    expect((await q(`select lock_on from family.focus_devices where device_id = $1`, [devA]))[0].lock_on).toBe(false);
    expect(await beat(childA, PHONE_A, JSON.stringify({ ...FLAGS, lockOn: false }))).toBe(429);
    await age(devA, 2);
    expect(await beat(childA, PHONE_A, JSON.stringify(FLAGS))).toBe(200);
  });

  it('a report that stops while the lock is on tells the parent once; a new gap, again', async () => {
    const before = (await emails()).length;
    // Phone A's lock was on, silent for three hours. Phone A2's last report said the lock had stopped normally (its
    // lock window ended). B's phone reported a minute ago.
    await age(devA, 180);
    expect(await beat(childA, PHONE_A2, JSON.stringify({ ...FLAGS, lockOn: false }))).toBe(200);
    await age(devA2, 180);
    expect(await beat(childB, PHONE_A, JSON.stringify(FLAGS))).toBe(200);

    expect(await sweep()).toBe(1);
    expect(await sweep()).toBe(0);
    expect(await sweep()).toBe(0);
    expect(await notices(devA)).toEqual([
      { kind: 'clock', emailed: false, seen: true },
      { kind: 'stopped', emailed: true, seen: false },
    ]);
    expect(await notices(devA2)).toEqual([]);
    expect(await notices(devB)).toEqual([]);
    const sent = (await emails()).slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({ to: ['focus.a@example.org'], template: 'focus_notice', data: { kind: 'stopped', lang: 'en' } });
    // The email names no child and no app.
    expect(JSON.stringify(sent[0].payload)).not.toMatch(/Tara|Veer|phoneA/);

    // Seen in the parent area: still nothing more for this gap.
    const [stopped] = await q(`select notice_id from family.focus_notices where device_id = $1 and kind = 'stopped'`, [devA]);
    expect((await R.notices.POST(req('/api/family/focus/notices', { method: 'POST', cookie: parentA, body: { noticeId: stopped.notice_id } }))).status).toBe(200);
    expect(await sweep()).toBe(0);
    expect((await notices(devA)).filter((n) => n.kind === 'stopped')).toHaveLength(1);

    // The phone reports again, which ends the gap; when it stops again, the parent is told again, once.
    expect(await beat(childA, PHONE_A, JSON.stringify(FLAGS))).toBe(200);
    expect((await q(`select stop_noticed_at from family.focus_devices where device_id = $1`, [devA]))[0].stop_noticed_at).toBeNull();
    await age(devA, 60);
    expect(await sweep()).toBe(0);
    await age(devA, 120);
    expect(await sweep()).toBe(1);
    expect(await sweep()).toBe(0);
    expect((await notices(devA)).filter((n) => n.kind === 'stopped')).toHaveLength(2);
    expect((await emails()).length - before).toBe(2);
  });

  it('a permission switched off and a clock change are told once until seen', async () => {
    const before = (await emails()).length;
    await age(devA2, 2);
    expect(await beat(childA, PHONE_A2, JSON.stringify({ lockOn: true, permissionsOk: false, clockChanged: true }))).toBe(200);
    await age(devA2, 2);
    expect(await beat(childA, PHONE_A2, JSON.stringify({ lockOn: true, permissionsOk: false, clockChanged: true }))).toBe(200);
    expect(await notices(devA2)).toEqual([
      { kind: 'clock', emailed: false, seen: false },
      { kind: 'permissions', emailed: false, seen: false },
    ]);
    expect(await sweep()).toBe(2);
    expect(await sweep()).toBe(0);
    const sent = (await emails()).slice(before).map((e) => e.payload.data.kind).sort();
    expect(sent).toEqual(['clock', 'permissions']);
    // Granted again, then off again: nothing new while the first is unseen.
    await age(devA2, 2);
    expect(await beat(childA, PHONE_A2, JSON.stringify(FLAGS))).toBe(200);
    await age(devA2, 2);
    expect(await beat(childA, PHONE_A2, JSON.stringify({ ...FLAGS, permissionsOk: false }))).toBe(200);
    expect((await notices(devA2)).filter((n) => n.kind === 'permissions')).toHaveLength(1);

    const { parentFocus, focusTimeLabel } = await import('@/lib/family/focus');
    const { withFamilyContext } = await import('@/lib/family/db');
    const view = await withFamilyContext({ accountId: A, tokenVersion: 0 }, (c) => parentFocus(c, A));
    expect(view.devices.map((d) => [d.deviceId, d.childNames, d.permissionsOk])).toEqual([
      [devA, ['Tara', 'Veer'], true],
      [devA2, ['Veer'], false],
    ]);
    expect(view.notices.map((n) => n.kind).sort()).toEqual(['clock', 'permissions', 'stopped']);
    expect(focusTimeLabel('2026-10-24T11:00:00.000Z', 'en')).toMatch(/24 Oct.*4:30/);
  });

  it('when Control switches the Focus Lock off, no phone is reported as stopped', async () => {
    // Off for this family only (staff preview): its phones stand down at their next call.
    await q(`update control.app_flags set audience = 'staff_preview' where app = 'family' and module = 'focus_lock'`);
    await age(devA, 2);
    expect(await beat(childA, PHONE_A, JSON.stringify(FLAGS))).toBe(403);
    expect((await q(`select lock_on from family.focus_devices where device_id = $1`, [devA]))[0].lock_on).toBe(false);
    await age(devA, 600);
    const stoppedBefore = (await notices(devA)).filter((n) => n.kind === 'stopped').length;
    expect(await sweep()).toBe(0);
    expect((await notices(devA)).filter((n) => n.kind === 'stopped')).toHaveLength(stoppedBefore);
    await q(`update control.app_flags set audience = 'everyone' where app = 'family' and module = 'focus_lock'`);

    // Off for everyone: a silent phone whose lock was on is not reported either.
    await age(devB, 2);
    expect(await beat(childB, PHONE_A, JSON.stringify(FLAGS))).toBe(200);
    await age(devB, 600);
    await q(`update control.app_flags set enabled = false where app = 'family' and module = 'focus_lock'`);
    expect(await sweep()).toBe(0);
    expect(await notices(devB)).toEqual([]);
    await q(`update control.app_flags set enabled = true where app = 'family' and module = 'focus_lock'`);
    expect(await sweep()).toBe(1);
    expect(await notices(devB)).toEqual([{ kind: 'stopped', emailed: true, seen: false }]);
  });

  it('the sweep and the app give one answer for whom the switch is on, audience included (C4, C341)', async () => {
    const { rolloutBucket } = await import('@/lib/contracts/app-flags');
    const { readFamilySwitches, switchOn } = await import('@/lib/family/flags');
    for (const id of [A, B, CA1, CB, VERSION, 'ffffffff-ffff-4fff-bfff-ffffffffffff', '00000000-0000-4000-8000-000000000000'])
      expect((await q(`select family.rollout_bucket($1) as b`, [id]))[0].b, id).toBe(rolloutBucket(id));
    const both = async (account: string) => {
      const s = await readFamilySwitches(db.pg, account);
      const sql = (await q(`select family.module_on($1, 'focus_lock', false) as f, family.module_on($1, 'plan', true) as p`, [account]))[0];
      return { app: [switchOn(s, 'focus_lock'), switchOn(s, 'plan')], sweep: [sql.f, sql.p] };
    };
    const configs: [string, string][] = [
      ['everyone', `update control.app_flags set audience = 'everyone', audience_percent = null where app = 'family' and module = 'focus_lock'`],
      ['preview', `update control.app_flags set audience = 'staff_preview', audience_percent = null where app = 'family' and module = 'focus_lock'`],
      ['percent of A', `update control.app_flags set audience = 'percent', audience_percent = ${rolloutBucket(A) + 1} where app = 'family' and module = 'focus_lock'`],
      ['percent below A', `update control.app_flags set audience = 'percent', audience_percent = ${rolloutBucket(A)} where app = 'family' and module = 'focus_lock'`],
      ['ended', `update control.app_flags set audience = 'everyone', audience_percent = null, ends_at = now() - interval '1 minute' where app = 'family' and module = 'focus_lock'`],
      ['plan off for B', `update control.app_flags set ends_at = null where app = 'family' and module = 'focus_lock'; insert into control.app_flags (app, module, enabled, audience, audience_percent) values ('family', 'plan', true, 'percent', ${rolloutBucket(B)}) on conflict (app, module) do update set audience = excluded.audience, audience_percent = excluded.audience_percent`],
    ];
    await q(`insert into control.preview_accounts (account_id, added_by) values ($1, $1)`, [A]);
    for (const [name, sql] of configs) {
      await db.pg.exec(sql);
      for (const account of [A, B]) {
        const r = await both(account);
        expect(r.sweep, `${name}, ${account === A ? 'A' : 'B'}`).toEqual(r.app);
      }
    }
    await q(`delete from control.app_flags where app = 'family' and module = 'plan'`);
    await q(`delete from control.preview_accounts where account_id = $1`, [A]);
    await q(`update control.app_flags set audience = 'everyone', audience_percent = null, ends_at = null where app = 'family' and module = 'focus_lock'`);
  });

  it('the sweep’s two defaults are the module list’s: the Focus Lock off until saved, the plan on (C341)', async () => {
    const { FAMILY_MODULES } = await import('@/lib/contracts/family-modules');
    const mod = (flag: string) => FAMILY_MODULES.find((m) => m.flag === flag)!;
    // family.focus_sweep() calls module_on(account, 'focus_lock', false) and module_on(account, 'plan', true).
    expect([mod('focus_lock').built, mod('focus_lock').offByDefault === true]).toEqual([true, true]);
    expect([mod('plan').built, mod('plan').offByDefault === true]).toEqual([true, false]);
  });

  it('a family outside the switch’s audience whose phone never reports again is not told it stopped (C4, C341)', async () => {
    const stoppedUnseen = async () => (await q(`select count(*)::int as n from family.focus_notices where device_id = $1 and kind = 'stopped' and seen_at is null`, [devB]))[0].n;
    // Staff preview only, and family B is not a preview account: its silent phone is never reported.
    await db.pg.exec(`update control.app_flags set audience = 'staff_preview' where app = 'family' and module = 'focus_lock'`);
    await db.pg.exec(`update family.focus_notices set seen_at = now() where device_id = '${devB}' and seen_at is null; update family.focus_devices set lock_on = true, stop_noticed_at = null, last_heartbeat_at = now() - interval '10 hours' where device_id = '${devB}'`);
    await sweep();
    expect(await stoppedUnseen()).toBe(0);
    // Family B joins the preview: now it is told, once.
    await q(`insert into control.preview_accounts (account_id, added_by) values ($1, $1)`, [B]);
    await sweep();
    expect(await stoppedUnseen()).toBe(1);
    await q(`delete from control.preview_accounts where account_id = $1`, [B]);
    await db.pg.exec(`update control.app_flags set audience = 'everyone' where app = 'family' and module = 'focus_lock'`);
  });

  it('the email says what happened and when, in the parent’s language, and nothing more', async () => {
    const { renderEmail } = await import('@/lib/email/templates');
    const en = renderEmail('focus_notice', { kind: 'stopped', at: '2026-10-24T11:00:00Z', lang: 'en' });
    expect(en.subject).toBe('Focus Lock: a phone in your family needs a look');
    expect(en.text).toMatch(/stopped reporting while it was on/);
    expect(en.text).toMatch(/4:30/);
    const hi = renderEmail('focus_notice', { kind: 'clock', at: '2026-10-24T11:00:00Z', lang: 'hi' });
    expect(hi.subject).toMatch(/फ़ोकस लॉक/);
    expect(hi.text).toMatch(/घड़ी बदली/);
    expect(() => renderEmail('focus_notice', { kind: 'apps', at: '2026-10-24T11:00:00Z', lang: 'en' })).toThrow(/unknown kind/);
  });

  it('removing a phone takes its children set and notices with it; a removed child leaves the set', async () => {
    await q(`delete from family.children where child_id = $1`, [CA2]);
    expect((await q(`select child_id from family.focus_device_children where device_id = $1`, [devA])).map((r) => r.child_id)).toEqual([CA1]);
    expect((await status(childA, PHONE_A2)).body.children).toEqual([]);
    expect((await R.devices.DELETE(req('/api/family/focus/devices', { method: 'DELETE', cookie: childA, body: { deviceId: devA2 } }))).status).toBe(403);
    expect((await R.devices.DELETE(req('/api/family/focus/devices', { method: 'DELETE', cookie: parentA, body: { deviceId: devA2 } }))).status).toBe(200);
    expect(await q(`select 1 from family.focus_devices where device_id = $1`, [devA2])).toEqual([]);
    expect(await notices(devA2)).toEqual([]);
    expect((await status(childA, PHONE_A2)).body).toEqual({ error: 'unknown_device' });
  });
});
