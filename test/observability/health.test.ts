import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// /api/health on real Postgres (PGlite with the B2 migrations): ok, degraded
// on a stuck job, down (503) when the database does not answer (C111).
const h = vi.hoisted(() => ({ db: null as unknown as import('../db/pglite-harness').TestDb, dbDown: false }));
vi.mock('@/lib/auth/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/db')>()),
  withBackendConnection: (fn: (db: unknown) => Promise<unknown>) => (h.dbDown ? Promise.reject(new Error('connect ECONNREFUSED')) : h.db.platform(fn as never)),
  withPlatformService: (fn: (db: unknown) => Promise<unknown>) => (h.dbDown ? Promise.reject(new Error('connect ECONNREFUSED')) : h.db.platform(fn as never)),
}));

import { createTestDb } from '../db/pglite-harness';
import { GET } from '@/app/api/health/route';

const call = async () => {
  const res = await GET(new NextRequest('https://www.netcyberai.test/api/health', { headers: { 'x-request-id': 'req-health-1' } }));
  return { status: res.status, cache: res.headers.get('cache-control'), body: await res.json() };
};

beforeAll(async () => {
  h.db = await createTestDb();
}, 60000);

describe('/api/health', () => {
  it('ok: 200, no counts or names', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.cache).toBe('no-store');
    expect(r.body).toMatchObject({ status: 'ok', checks: { database: 'ok', jobs: 'ok' } });
    expect(Object.keys(r.body).sort()).toEqual(['checks', 'commit', 'status', 'time']);
  });

  it('degraded when a due job has waited more than 10 minutes', async () => {
    await h.db.platform((db) => db.query(`insert into jobs (type, idempotency_key, next_run_at) values ('email.send', 'stuck', now() - interval '11 minutes')`));
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'degraded', checks: { database: 'ok', jobs: 'backlog' } });
  });

  it('down (503) when the database does not answer', async () => {
    h.dbDown = true;
    const r = await call();
    h.dbDown = false;
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ status: 'down', checks: { database: 'fail', jobs: 'unknown' } });
  });
});
