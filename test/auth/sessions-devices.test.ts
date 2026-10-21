import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// F1-1 (C257) on a real Postgres (the harness's PGlite with every migration): "Keep me signed in" renews a session
// while it is used and ends it after 30 days without use (12 hours when not kept); a revoked or expired session is
// never renewed; "Trust this browser" rows count only while they are the person's own, not forgotten, not expired and
// under the same token version.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const ADMIN = 'f1000000-0000-4000-8000-0000000000a1';
const OTHER = 'f1000000-0000-4000-8000-0000000000b1';
const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-f1-sessions-and-devices-0123456789';
  await db.pg.exec(`
    insert into users (user_id, school_id, email, role, display_name) values
      ('${ADMIN}', null, 'founder@f1.invalid', 'super_admin', 'Founder'), ('${OTHER}', null, 'other@f1.invalid', 'super_admin', 'Other');
  `);
}, 90_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

async function newSession(persistent: boolean, expiresInMs = 30 * DAY): Promise<{ token: string; id: string }> {
  const { newRefreshToken, hashToken } = await import('@/lib/auth/hash');
  const token = newRefreshToken();
  const { rows } = await db.pg.query(
    `insert into sessions (user_id, refresh_token_hash, selected_school_id, token_version_snapshot, aal, expires_at, persistent)
     values ($1, $2, null, 0, 'aal2', $3, $4) returning session_id`,
    [ADMIN, hashToken(token), new Date(Date.now() + expiresInMs), persistent]
  );
  return { token, id: rows[0].session_id };
}
const row = async (id: string) => (await db.pg.query(`select persistent, expires_at, revoked_at from sessions where session_id = $1`, [id])).rows[0];
const near = (d: Date, ms: number) => Math.abs(new Date(d).getTime() - (Date.now() + ms)) < 60_000;

describe('keep me signed in: the sliding session', () => {
  it('a kept session renews for another 30 days at each use; the old token stops working', async () => {
    const { refreshSession } = await import('@/lib/auth/refresh');
    const s = await newSession(true, 2 * DAY);
    const r = await refreshSession(s.token);
    expect(r.ok && r.persistent).toBe(true);
    if (!r.ok) return;
    const fresh = await row(r.claims.sessionId);
    expect(fresh.persistent).toBe(true);
    expect(near(fresh.expires_at, 30 * DAY)).toBe(true);
    expect((await row(s.id)).revoked_at).not.toBeNull();
    expect(await refreshSession(s.token)).toEqual({ ok: false, reason: 'not_found' });
  });

  it('a session not kept renews for 12 hours only, and marking never lengthens one', async () => {
    const { refreshSession, markSessionNotPersistent } = await import('@/lib/auth/refresh');
    const s = await newSession(true);
    await markSessionNotPersistent(s.id);
    const marked = await row(s.id);
    expect(marked.persistent).toBe(false);
    expect(near(marked.expires_at, 12 * 60 * 60 * 1000)).toBe(true);
    const r = await refreshSession(s.token);
    expect(r.ok && r.persistent).toBe(false);
    if (r.ok) expect(near((await row(r.claims.sessionId)).expires_at, 12 * 60 * 60 * 1000)).toBe(true);
    const short = await newSession(true, 60_000);
    await markSessionNotPersistent(short.id);
    expect(near((await row(short.id)).expires_at, 60_000)).toBe(true);
  });

  it('a revoked or expired session is never renewed; the refresh route keeps a session-only cookie session-only', async () => {
    const { refreshSession } = await import('@/lib/auth/refresh');
    const revoked = await newSession(true);
    await db.pg.query(`update sessions set revoked_at = now() where session_id = $1`, [revoked.id]);
    expect(await refreshSession(revoked.token)).toEqual({ ok: false, reason: 'not_found' });
    const expired = await newSession(true, -1000);
    expect(await refreshSession(expired.token)).toEqual({ ok: false, reason: 'not_found' });
    // Signed out everywhere (token version moved): refused and ended.
    const moved = await newSession(true);
    await db.pg.query(`update users set token_version = token_version + 1 where user_id = $1`, [ADMIN]);
    expect(await refreshSession(moved.token)).toEqual({ ok: false, reason: 'token_version_changed' });
    await db.pg.query(`update users set token_version = 0 where user_id = $1`, [ADMIN]);

    const { POST } = await import('@/app/api/auth/refresh/route');
    const notKept = await newSession(false);
    const res = await POST(new NextRequest('http://localhost/api/auth/refresh', { method: 'POST', headers: { cookie: `nca_refresh=${notKept.token}` } }));
    expect(res.status).toBe(200);
    expect(res.cookies.get('nca_refresh')?.maxAge).toBeUndefined();
    const kept = await newSession(true);
    const res2 = await POST(new NextRequest('http://localhost/api/auth/refresh', { method: 'POST', headers: { cookie: `nca_refresh=${kept.token}` } }));
    expect(res2.cookies.get('nca_refresh')?.maxAge).toBe(30 * 24 * 60 * 60);
  });
});

describe('trust this browser: the rows', () => {
  it('counts while it is the person’s own, live and under the same token version; forgetting ends it', async () => {
    const { trustDevice, deviceProof, forgetDevice, forgetThisDevice, listDevices } = await import('@/lib/auth/devices');
    const a = await trustDevice(ADMIN, 'authenticator', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15');
    expect(a.ttlSeconds).toBe(30 * 24 * 60 * 60);
    expect(await deviceProof(a.token, ADMIN)).toBe('authenticator');
    expect(await deviceProof(a.token, OTHER)).toBeNull();
    const list = await listDevices(ADMIN, a.token);
    expect(list).toEqual([expect.objectContaining({ label: 'Safari on Mac', proof: 'authenticator', thisDevice: true })]);
    // Re-trusting the same browser ends its old row: one browser, one row.
    const again = await trustDevice(ADMIN, 'email', null, a.token);
    expect(await deviceProof(a.token, ADMIN)).toBeNull();
    expect(await deviceProof(again.token, ADMIN)).toBe('email');
    // Another person cannot forget it; the person can, from the list or from the browser.
    expect(await forgetDevice(OTHER, list[0].deviceId)).toBe(false);
    const b = await trustDevice(ADMIN, 'authenticator', null);
    const rowB = (await listDevices(ADMIN, b.token)).find((d) => d.thisDevice)!;
    expect(await forgetDevice(ADMIN, rowB.deviceId)).toBe(true);
    expect(await deviceProof(b.token, ADMIN)).toBeNull();
    expect(await forgetThisDevice(again.token)).toBe(true);
    expect(await deviceProof(again.token, ADMIN)).toBeNull();
  });

  it('expiry is 30 days from trusting, never lengthened by use; a token version change or forgetting all ends it', async () => {
    const { trustDevice, deviceProof, forgetAllDevices } = await import('@/lib/auth/devices');
    const t = await trustDevice(ADMIN, 'authenticator', null);
    const before = (await db.pg.query(`select expires_at from trusted_devices where user_id = $1 and revoked_at is null`, [ADMIN])).rows[0].expires_at;
    await deviceProof(t.token, ADMIN);
    const after = (await db.pg.query(`select expires_at from trusted_devices where user_id = $1 and revoked_at is null`, [ADMIN])).rows[0].expires_at;
    expect(new Date(after).getTime()).toBe(new Date(before).getTime());
    await db.pg.query(`update trusted_devices set expires_at = now() - interval '1 second' where user_id = $1`, [ADMIN]);
    expect(await deviceProof(t.token, ADMIN)).toBeNull();
    const u = await trustDevice(ADMIN, 'authenticator', null);
    await db.pg.query(`update users set token_version = token_version + 1 where user_id = $1`, [ADMIN]);
    expect(await deviceProof(u.token, ADMIN)).toBeNull();
    const v = await trustDevice(ADMIN, 'authenticator', null);
    expect(await forgetAllDevices(ADMIN)).toBeGreaterThan(0);
    expect(await deviceProof(v.token, ADMIN)).toBeNull();
  });

  it('only the backend role reaches the rows', async () => {
    const { rows } = await db.pg.query(
      `select r as role, has_table_privilege(r, 'trusted_devices', 'select') as can_read from unnest(array['app_backend', 'app_user', 'nca_super', 'anon', 'authenticated']) as r`
    );
    expect(Object.fromEntries(rows.map((x: { role: string; can_read: boolean }) => [x.role, x.can_read]))).toEqual({
      app_backend: true,
      app_user: false,
      nca_super: false,
      anon: false,
      authenticated: false,
    });
  });
});
