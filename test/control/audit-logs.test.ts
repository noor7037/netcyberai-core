import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Control → Audit Logs (W13-E): the route and its query on the real schema (PGlite). Only the connection is replaced:
// the route's own transaction helper runs on the test database as the platform role. Who is let in, that the founder
// reads every school's rows newest first, that the filters narrow and the pages hold 50, and that a long value is
// never shown in full. Made-up people and schools only.

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
import { writeAuditLog } from '@/lib/audit/log';
import { previewState, parseAuditQuery } from '@/lib/control/audit-logs';
import { GET } from '@/app/api/control/audit-logs/route';

const FOUNDER = randomUUID();
const PRINCIPAL = randomUUID();
const A = randomUUID();
const B = randomUUID();
const q = async (sql: string, params: unknown[] = []) => (await h.db.pg.query(sql, params)).rows;

function req(qs = '', cookie?: string): NextRequest {
  return new NextRequest(`https://www.netcyberai.test/api/control/audit-logs${qs}`, { method: 'GET', headers: cookie ? { cookie } : {} });
}
async function cookieFor(sub: string, role: string, schoolId: string | null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal: role === 'super_admin' ? 'aal2' : 'aal1', sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
let founder = '';
let principal = '';
const get = async (qs = '', cookie = founder) => {
  const res = await GET(req(qs, cookie));
  return { status: res.status, body: await res.json() };
};
const write = (schoolId: string | null, action: string, afterState?: unknown, actor: string | null = FOUNDER) =>
  h.db.pg.transaction(async (raw) => {
    const tx = raw as { query: (s: string, p?: unknown[]) => Promise<unknown> };
    await tx.query('set local role nca_super');
    await writeAuditLog(tx as never, { schoolId, actorUserId: actor, actorRole: actor ? 'super_admin' : null, eventAction: action, targetType: 'things', targetId: 'thing-1', afterState });
  });

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-audit-logs-tests-0123456789';
  h.db = await startHarnessDb({ port: 0 });
  await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up School A', 'IN-HR'), ($2, 'Made-up School B', 'IN-DL')`, [A, B]);
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder'), ($2, $3, 'principal', 'Priya Principal')`, [FOUNDER, PRINCIPAL, A]);
  founder = await cookieFor(FOUNDER, 'super_admin', null);
  principal = await cookieFor(PRINCIPAL, 'principal', A);
  // 55 rows in school A, 2 in B, 1 platform event with no one recorded.
  for (let i = 1; i <= 55; i++) await write(A, i === 55 ? 'test.newest_in_a' : 'test.in_a', { n: i });
  await write(B, 'test.in_b', { note: 'x'.repeat(120), kind: 'long' });
  await write(B, 'test.in_b', { ok: true });
  await write(null, 'test.platform', undefined, null);
}, 120_000);
afterAll(async () => {
  await h.db?.stop();
});

describe('who is let in', () => {
  it('nobody without a session, and nobody from a school', async () => {
    expect((await get('', '')).status).toBe(401);
    expect((await get('', principal)).status).toBe(403);
  });
});

describe('what the founder reads', () => {
  it('rows from every school and the platform, newest first, 50 a page, with names', async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.rows).toHaveLength(50);
    expect(body.hasMore).toBe(true);
    expect(body.rows[0]).toMatchObject({ action: 'test.platform', actorName: null, schoolName: null, schoolId: null });
    expect(body.rows[1]).toMatchObject({ action: 'test.in_b', schoolName: 'Made-up School B', actorName: 'Farid Founder', targetType: 'things', targetId: 'thing-1', afterPreview: '{"ok":true}', keysOnly: false });
    const names = new Set(body.rows.map((r: { schoolName: string | null }) => r.schoolName));
    expect(names).toEqual(new Set([null, 'Made-up School B', 'Made-up School A']));
    expect(body.schools.map((s: { name: string }) => s.name)).toEqual(['Made-up School A', 'Made-up School B']);
  });

  it('the second page holds the rest, and no more after it', async () => {
    // School A has 55 rows: 50, then 5 (the harness's own seed rows are in the unfiltered list too).
    const { body } = await get(`?schoolId=${A}&page=2`);
    expect(body.rows).toHaveLength(5);
    expect(body.hasMore).toBe(false);
    expect(body.rows.at(-1).afterPreview).toBe('{"n":1}');
    expect((await get(`?schoolId=${A}&page=3`)).body.rows).toEqual([]);
    expect((await get('?page=2')).body.page).toBe(2);
  });

  it('the school filter narrows to that school; the action filter to that exact action', async () => {
    const b = await get(`?schoolId=${B}`);
    expect(b.body.rows).toHaveLength(2);
    expect(b.body.rows.every((r: { schoolId: string }) => r.schoolId === B)).toBe(true);
    const a = await get(`?schoolId=${A}`);
    expect(a.body.rows).toHaveLength(50);
    expect(a.body.hasMore).toBe(true);
    const one = await get('?action=test.newest_in_a');
    expect(one.body.rows).toHaveLength(1);
    expect((await get('?action=test.newest')).body.rows).toEqual([]);
  });

  it('the day filters keep today and drop other days', async () => {
    const today = new Date().toISOString().slice(0, 10);
    expect((await get(`?from=${today}&to=${today}&schoolId=${B}`)).body.rows).toHaveLength(2);
    expect((await get('?to=2000-01-01')).body.rows).toEqual([]);
    expect((await get('?from=2999-01-01')).body.rows).toEqual([]);
  });

  it('a value longer than 80 characters is never shown: the field names only', async () => {
    const rows = (await get(`?schoolId=${B}`)).body.rows;
    const long = rows.find((r: { keysOnly: boolean }) => r.keysOnly);
    expect(long.afterPreview).toBe('kind, note');
    expect(JSON.stringify(rows)).not.toContain('xxxxxxxxxx');
  });
});

describe('what is refused', () => {
  it('a school id that is not a uuid, a bad page or a bad date: 400', async () => {
    expect((await get('?schoolId=not-a-uuid')).status).toBe(400);
    expect((await get("?schoolId=1' or '1'='1")).status).toBe(400);
    expect((await get('?page=0')).status).toBe(400);
    expect((await get('?page=abc')).status).toBe(400);
    expect((await get('?from=yesterday')).status).toBe(400);
    expect((await get('?to=2026-02-31')).status).toBe(400);
  });
});

describe('the pure parts', () => {
  it('previewState cuts at 200 characters and hides long values', () => {
    expect(previewState(null)).toEqual({ preview: null, keysOnly: false });
    expect(previewState({ a: 1 })).toEqual({ preview: '{"a":1}', keysOnly: false });
    const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, i]));
    expect(previewState(many).preview).toHaveLength(200);
    expect(previewState({ name: 'y'.repeat(81), id: 1 })).toEqual({ preview: 'name, id', keysOnly: true });
    expect(previewState('z'.repeat(81))).toEqual({ preview: '', keysOnly: true });
  });
  it('parseAuditQuery defaults to page 1 with no filters', () => {
    expect(parseAuditQuery(new URLSearchParams(''))).toEqual({ ok: true, query: { page: 1, schoolId: null, action: null, from: null, to: null } });
  });
});
