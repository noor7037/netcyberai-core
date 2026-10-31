import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// W13-B: Control → a school → Staff, read-only, on the real migrations (PGlite). Only the connection is replaced: the
// route's own query runs as nca_super, as in production. Who is let in, the counts and the list for the one school,
// and that nothing of another school or of a parent appears. Made-up people only.

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
import { GET } from '@/app/api/control/schools/[schoolId]/staff/route';

const A = randomUUID();
const B = randomUUID();
const FOUNDER = randomUUID();
const PRINCIPAL = randomUUID();
const TEACHER = randomUUID();
const LEFT = randomUUID();
const CLERK = randomUUID();
const PARENT = randomUUID();
const OTHER = randomUUID();
const q = async (sql: string, params: unknown[] = []) => (await h.db.pg.query(sql, params)).rows;

function req(schoolId: string, cookie?: string): NextRequest {
  return new NextRequest(`https://www.netcyberai.test/api/control/schools/${schoolId}/staff`, { method: 'GET', headers: cookie ? { cookie } : {} });
}
async function cookieFor(sub: string, role: string, schoolId: string | null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal: 'aal2', sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
let founder = '';
let principal = '';

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-school-staff-route-tests-0123456789';
  h.db = await startHarnessDb({ port: 0 });
  await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'School A', 'IN-HR'), ($2, 'School B', 'IN-DL')`, [A, B]);
  await q(
    `insert into users (user_id, school_id, email, role, display_name, is_active) values
       ($1, null, 'f@x.invalid', 'super_admin', 'Farid Founder', true),
       ($2, $7, 'p@a.invalid', 'principal', 'Priya Principal', true),
       ($3, $7, 't@a.invalid', 'teacher', 'Tara Teacher', true),
       ($4, $7, 'l@a.invalid', 'teacher', 'Lena Left', false),
       ($5, $7, 'c@a.invalid', 'accountant', 'Anil Accounts', true),
       ($6, $7, 'g@a.invalid', 'parent', 'Gita Guardian', true),
       ($8, $9, 'o@b.invalid', 'teacher', 'Omar Other', true)`,
    [FOUNDER, PRINCIPAL, TEACHER, LEFT, CLERK, PARENT, A, OTHER, B]
  );
  await q(
    `insert into memberships (user_id, school_id, role, is_active) values
       ($1, $6, 'principal', true), ($2, $6, 'teacher', true), ($3, $6, 'teacher', false), ($4, $6, 'accountant', true), ($5, $6, 'parent', true), ($7, $8, 'teacher', true)`,
    [PRINCIPAL, TEACHER, LEFT, CLERK, PARENT, A, OTHER, B]
  );
  const [{ teacher_id: tid }] = await q(`insert into teachers (school_id, user_id, name, joining_date) values ($1, $2, 'Tara Teacher', '2024-04-01') returning teacher_id`, [A, TEACHER]);
  const [{ class_id: cid }] = await q(`insert into classes (school_id, name) values ($1, '8-A') returning class_id`, [A]);
  const [{ subject_id: sid }] = await q(`insert into subjects (school_id, name) values ($1, 'Maths') returning subject_id`, [A]);
  await q(`insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ($1, $2, $3, $4)`, [A, tid, sid, cid]);
  founder = await cookieFor(FOUNDER, 'super_admin', null);
  principal = await cookieFor(PRINCIPAL, 'principal', A);
}, 90_000);
afterAll(async () => {
  await h.db?.stop();
});

describe('who is let in', () => {
  it('no session is 401, a school session is 403, a bad id is 404', async () => {
    expect((await GET(req(A), { params: { schoolId: A } })).status).toBe(401);
    expect((await GET(req(A, principal), { params: { schoolId: A } })).status).toBe(403);
    expect((await GET(req('nope', founder), { params: { schoolId: 'nope' } })).status).toBe(404);
  });
});

describe('the staff of one school', () => {
  it('the founder reads the counts and the list of that school only, without any parent', async () => {
    const res = await GET(req(A, founder), { params: { schoolId: A } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counts).toEqual({ total: 4, teaching: 2, nonTeaching: 2, active: 3, inactive: 1 });
    // Active first, teachers before the rest, then by name.
    expect(body.staff.map((s: { name: string; role: string; status: string }) => [s.name, s.role, s.status])).toEqual([
      ['Tara Teacher', 'teacher', 'active'],
      ['Anil Accounts', 'accountant', 'active'],
      ['Priya Principal', 'principal', 'active'],
      ['Lena Left', 'teacher', 'inactive'],
    ]);
    expect(body.staff[0]).toMatchObject({ subjects: ['Maths'], joined: '2024-04-01' });
    expect(JSON.stringify(body)).not.toMatch(/Omar Other|Gita Guardian|@/);
  });

  it('another school lists its own staff and none of the first', async () => {
    const body = await (await GET(req(B, founder), { params: { schoolId: B } })).json();
    expect(body.counts).toEqual({ total: 1, teaching: 1, nonTeaching: 0, active: 1, inactive: 0 });
    expect(body.staff.map((s: { name: string }) => s.name)).toEqual(['Omar Other']);
  });

  it('a school with no staff has zero counts and an empty list', async () => {
    const empty = randomUUID();
    await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'School C', 'IN-HR')`, [empty]);
    const body = await (await GET(req(empty, founder), { params: { schoolId: empty } })).json();
    expect(body).toEqual({ counts: { total: 0, teaching: 0, nonTeaching: 0, active: 0, inactive: 0 }, staff: [] });
  });
});
