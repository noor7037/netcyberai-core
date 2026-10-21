import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// M1-4: the Control → Content routes on the real migrations (PGlite). Only the connection is replaced: the routes' own
// transaction helper runs on the test database with the same role and settings as src/lib/auth/db.ts. Who is let in
// (nobody without a session, nobody from a school, no super_admin session without the authenticator), and the two-
// person rule at the route. Made-up accounts and lines.

const h = vi.hoisted(() => ({ db: null as unknown as { pg: { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>; query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }; stop: () => Promise<void> } }));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  return {
    ...real,
    withTenantContext: (claims: { role: string; sub: string; schoolId: string | null }, fn: (db: unknown) => Promise<unknown>) =>
      h.db.pg.transaction(async (tx: any) => {
        await tx.query(`set local role ${claims.role === 'super_admin' ? 'nca_super' : 'app_user'}`);
        await tx.query(`select set_config('app.current_tenant_id', $1, true)`, [claims.schoolId ?? '00000000-0000-0000-0000-000000000000']);
        await tx.query(`select set_config('app.current_role', $1, true)`, [claims.role]);
        await tx.query(`select set_config('app.current_user_id', $1, true)`, [claims.sub]);
        return fn(tx);
      }),
  };
});

// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { CATALOG_COLUMNS } from '@/lib/content/catalog-csv';
import { GET as listRoute } from '@/app/api/control/content/route';
import { POST as importRoute } from '@/app/api/control/content/import/route';
import { GET as versionGet, POST as versionPost } from '@/app/api/control/content/versions/[versionId]/route';
import { GET as diffRoute } from '@/app/api/control/content/diff/route';

const FOUNDER = 'c5000000-0000-4000-8000-0000000000f1';
const SECOND = 'c5000000-0000-4000-8000-0000000000f2';
const PRINCIPAL = 'c5000000-0000-4000-8000-0000000000a1';
const SCHOOL = 'c5000000-0000-4000-8000-0000000000b1';

function req(pathAndQuery: string, body?: unknown, cookie?: string): NextRequest {
  return new NextRequest(`https://www.netcyberai.test${pathAndQuery}`, {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
}
async function cookieFor(sub: string, role: string, schoolId: string | null, aal: 'aal1' | 'aal2') {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal, sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const at = (versionId: string) => ({ params: { versionId } });
const CSV = [
  CATALOG_COLUMNS.join(','),
  'CBSE,8,science,2026-27,unit,cbse.c8.science.u1,,1,Made-up unit,,https://example.org/c.pdf,1,2026-10-20,in_review',
  'CBSE,8,science,2026-27,chapter,cbse.c8.science.u1.ch01,cbse.c8.science.u1,1,Made-up chapter,,https://example.org/c.pdf,1,2026-10-20,in_review',
].join('\n');

let founder = '';
let second = '';
let founderAal1 = '';
let principal = '';

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-content-route-tests-0123456789';
  h.db = await startHarnessDb({ port: 0 });
  await h.db.pg.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up School', 'IN-HR')`, [SCHOOL]);
  await h.db.pg.query(
    `insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Made-up Founder'), ($2, null, 'super_admin', 'Made-up Reviewer'), ($3, $4, 'principal', 'Made-up Principal')`,
    [FOUNDER, SECOND, PRINCIPAL, SCHOOL]
  );
  founder = await cookieFor(FOUNDER, 'super_admin', null, 'aal2');
  second = await cookieFor(SECOND, 'super_admin', null, 'aal2');
  founderAal1 = await cookieFor(FOUNDER, 'super_admin', null, 'aal1');
  principal = await cookieFor(PRINCIPAL, 'principal', SCHOOL, 'aal1');
}, 120_000);
afterAll(async () => {
  await h.db?.stop();
});

describe('who is let in', () => {
  const someId = randomUUID();
  const calls = (cookie?: string) => [
    listRoute(req('/api/control/content', undefined, cookie)),
    importRoute(req('/api/control/content/import', { csv: CSV, preview: true }, cookie)),
    versionGet(req(`/api/control/content/versions/${someId}`, undefined, cookie), at(someId)),
    versionPost(req(`/api/control/content/versions/${someId}`, { action: 'approve' }, cookie), at(someId)),
    diffRoute(req(`/api/control/content/diff?from=${someId}&to=${someId}`, undefined, cookie)),
  ];
  it('nobody without a session (401), nobody from a school (403), no staff session without the authenticator (403)', async () => {
    for (const res of await Promise.all(calls())) expect(res.status).toBe(401);
    for (const res of await Promise.all(calls(principal))) expect(res.status).toBe(403);
    for (const res of await Promise.all(calls(founderAal1))) {
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('authenticator_needed');
    }
    expect((await h.db.pg.query(`select 1 from content.syllabus_versions`)).rows).toHaveLength(0);
  });
});

describe('the routes, as NetCyberAI staff', () => {
  let versionId = '';
  it('check, then import; the importer cannot approve, another account can', async () => {
    const check = await importRoute(req('/api/control/content/import', { csv: CSV, preview: true }, founder));
    expect(check.status).toBe(200);
    expect(await check.json()).toMatchObject({ preview: true, committed: false, rowCount: 2, problems: [] });
    expect((await h.db.pg.query(`select 1 from content.syllabus_versions`)).rows).toHaveLength(0);

    const bad = await importRoute(req('/api/control/content/import', { csv: CSV.replace('2026-10-20,in_review', '2026-10-20,published'), preview: false }, founder));
    expect(bad.status).toBe(422);
    expect((await bad.json()).problems).toEqual([{ line: 2, code: 'status_bad', value: 'published' }]);

    const done = await importRoute(req('/api/control/content/import', { csv: CSV, preview: false }, founder));
    expect(done.status).toBe(201);
    versionId = (await done.json()).versions[0].versionId;

    const own = await versionPost(req(`/api/control/content/versions/${versionId}`, { action: 'approve' }, founder), at(versionId));
    expect(own.status).toBe(403);
    expect((await own.json()).code).toBe('own_import');
    const ok = await versionPost(req(`/api/control/content/versions/${versionId}`, { action: 'approve' }, second), at(versionId));
    expect(ok.status).toBe(200);

    const list = await (await listRoute(req('/api/control/content', undefined, founder))).json();
    expect(list.versions).toHaveLength(1);
    expect(list.versions[0]).toMatchObject({ versionId, status: 'published', audience: 'staff_preview', importedByMe: true, chapters: 1 });
    const theirs = await (await listRoute(req('/api/control/content', undefined, second))).json();
    expect(theirs.versions[0].importedByMe).toBe(false);

    const preview = await versionGet(req(`/api/control/content/versions/${versionId}`, undefined, second), at(versionId));
    expect((await preview.json()).units[0].chapters[0].titleEn).toBe('Made-up chapter');
  });

  it('refuses what is not sent properly, and what cannot be done now', async () => {
    expect((await versionPost(req(`/api/control/content/versions/not-an-id`, { action: 'approve' }, founder), at('not-an-id'))).status).toBe(400);
    expect((await versionPost(req(`/api/control/content/versions/${versionId}`, { action: 'publish' }, founder), at(versionId))).status).toBe(400);
    expect((await importRoute(req('/api/control/content/import', { csv: 7, preview: true }, founder))).status).toBe(400);
    expect((await diffRoute(req(`/api/control/content/diff?from=x&to=y`, undefined, founder))).status).toBe(400);
    const missing = randomUUID();
    expect((await versionGet(req(`/api/control/content/versions/${missing}`, undefined, founder), at(missing))).status).toBe(404);
    const rollBack = await versionPost(req(`/api/control/content/versions/${versionId}`, { action: 'rollback' }, founder), at(versionId));
    expect(rollBack.status).toBe(409);
    expect((await rollBack.json()).code).toBe('not_current');
    const reject = await versionPost(req(`/api/control/content/versions/${versionId}`, { action: 'reject', note: '' }, founder), at(versionId));
    expect(reject.status).toBe(400);
  });
});
