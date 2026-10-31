import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Control → System Settings (W13-E): the route and its register on the real schema (PGlite). Who is let in, that
// every control.settings row is listed with the screen that owns it, and that a secret-looking value never leaves
// the database. Made-up values only.

const h = vi.hoisted(() => ({ db: null as unknown as { pg: { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>; query: (sql: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }; stop: () => Promise<void> } }));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  const run = (fn: (db: unknown) => Promise<unknown>) =>
    h.db.pg.transaction(async (tx) => {
      await (tx as { query: (s: string) => Promise<unknown> }).query('set local role nca_super');
      return fn(tx);
    });
  return { ...real, withPlatformService: run, withTenantContext: (_c: unknown, fn: (db: unknown) => Promise<unknown>) => run(fn) };
});

// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { looksSecret } from '@/lib/control/system-settings';
import { GET } from '@/app/api/control/system-settings/route';

const FOUNDER = randomUUID();
const PRINCIPAL = randomUUID();
const SCHOOL = randomUUID();
const q = async (sql: string, params: unknown[] = []) => (await h.db.pg.query(sql, params)).rows;
const SECRET_VALUE = 'sk-made-up-value-that-must-never-appear';

function req(cookie?: string): NextRequest {
  return new NextRequest('https://www.netcyberai.test/api/control/system-settings', { method: 'GET', headers: cookie ? { cookie } : {} });
}
async function cookieFor(sub: string, role: string, schoolId: string | null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal: role === 'super_admin' ? 'aal2' : 'aal1', sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
let founder = '';
let principal = '';

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-system-settings-tests-0123456789';
  h.db = await startHarnessDb({ port: 0 });
  await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up School', 'IN-HR')`, [SCHOOL]);
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder'), ($2, $3, 'principal', 'Priya Principal')`, [FOUNDER, PRINCIPAL, SCHOOL]);
  founder = await cookieFor(FOUNDER, 'super_admin', null);
  principal = await cookieFor(PRINCIPAL, 'principal', SCHOOL);
  await q(`insert into control.settings (key, value) values ('made_up.api_key', $1::jsonb), ('made_up.signing_secret', '"s3cret"'::jsonb), ('made_up.bot_token', '"t0ken"'::jsonb), ('made_up.admin_password', '"pw"'::jsonb), ('made_up.plain', '{"on":true}'::jsonb)`, [JSON.stringify(SECRET_VALUE)]);
}, 120_000);
afterAll(async () => {
  await h.db?.stop();
});

describe('System Settings', () => {
  it('nobody without a session, and nobody from a school', async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req(principal))).status).toBe(403);
  });

  it('lists every control.settings row, newest values as JSON, with its owning screen or none', async () => {
    await q(`insert into control.settings (key, value) values ('ai.testing_mode', '"on"'::jsonb), ('leads.auto_reply', 'true'::jsonb), ('content.pilot_scope', '{}'::jsonb) on conflict (key) do update set value = excluded.value`);
    const res = await GET(req(founder));
    expect(res.status).toBe(200);
    const { settings } = (await res.json()) as { settings: { key: string; value: string | null; hidden: boolean; screen: string | null; updatedAt: string | null }[] };
    const stored = (await q(`select count(*)::int as n from control.settings`))[0].n;
    expect(settings).toHaveLength(stored as number);
    const by = Object.fromEntries(settings.map((s) => [s.key, s]));
    expect(by['ai.testing_mode']).toMatchObject({ value: '"on"', screen: '/control/ai', hidden: false });
    expect(by['leads.auto_reply'].screen).toBe('/control/leads');
    expect(by['content.pilot_scope'].screen).toBe('/control/content');
    expect(by['made_up.plain']).toMatchObject({ value: '{"on":true}', screen: null, hidden: false });
    expect(by['made_up.plain'].updatedAt).toMatch(/^\d{4}-/);
  });

  it('a secret-looking setting is hidden: no value in the answer at all', async () => {
    const res = await GET(req(founder));
    const text = await res.text();
    expect(text).not.toContain(SECRET_VALUE);
    expect(text).not.toContain('s3cret');
    expect(text).not.toContain('t0ken');
    const { settings } = JSON.parse(text) as { settings: { key: string; value: string | null; hidden: boolean }[] };
    for (const key of ['made_up.api_key', 'made_up.signing_secret', 'made_up.bot_token', 'made_up.admin_password']) {
      expect(settings.find((s) => s.key === key)).toMatchObject({ hidden: true, value: null });
    }
  });

  it('looksSecret follows the four words only', () => {
    expect(['a.key', 'x.SECRET', 'y.token_ttl', 'z.password']).toSatisfy((ks: string[]) => ks.every(looksSecret));
    expect(looksSecret('ai.testing_mode')).toBe(false);
  });
});
