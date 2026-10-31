import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// W13-A: the Students tab of a school in Control, through the real route on the whole schema (the harness database), as
// the founder's own session. Every name is made up.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const A = 'd1300000-0000-4000-8000-000000000001';
const B = 'd1300000-0000-4000-8000-000000000002';
const FOUNDER = 'd1300000-0000-4000-8000-0000000000f1';
const PRINCIPAL = 'd1300000-0000-4000-8000-0000000000a1';

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-w13a-school-students-0123456789';
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'ZZ School A', 'IN-KA'), ('${B}', 'ZZ School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${FOUNDER}', null, 'founder@w13a.invalid', 'super_admin', 'Founder', true),
      ('${PRINCIPAL}', '${A}', 'principal@w13a.invalid', 'principal', 'Priya Principal', true);
    insert into classes (class_id, school_id, name, grade, section) values
      ('d1300000-0000-4000-8000-0000000000c1', '${A}', '8-A', '8', 'A'),
      ('d1300000-0000-4000-8000-0000000000c2', '${A}', '10-B', '10', 'B'),
      ('d1300000-0000-4000-8000-0000000000c3', '${B}', '8-A', '8', 'A');
    insert into students (school_id, admission_no, name, class_id, status) values
      ('${A}', 'A-001', 'Asha Rao', 'd1300000-0000-4000-8000-0000000000c1', 'active'),
      ('${A}', 'A-002', 'Bala Iyer', 'd1300000-0000-4000-8000-0000000000c1', 'pending_consent'),
      ('${A}', 'A-003', 'Chitra Nair', 'd1300000-0000-4000-8000-0000000000c2', 'active'),
      ('${A}', 'A-004', 'Dev Menon', null, 'inactive'),
      ('${B}', 'B-001', 'Zed Other', 'd1300000-0000-4000-8000-0000000000c3', 'active'),
      ('${B}', 'B-002', 'Asha Elsewhere', 'd1300000-0000-4000-8000-0000000000c3', 'active');
  `);
  // Sixty more in school B, to show a page is 50 and that school A never sees them.
  await db.pg.exec(`insert into students (school_id, name, status) select '${B}', 'Bulk ' || lpad(g::text, 3, '0'), 'active' from generate_series(1, 60) g;`);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

async function access(sub: string, role: 'super_admin' | 'principal', schoolId: string | null) {
  const { signAccessToken } = await import('@/lib/auth/jwt');
  return signAccessToken({ sub, role, schoolId, membershipId: null, tokenVersion: 0, aal: 'aal2', sessionId: randomUUID() });
}
async function get(schoolId: string, query: string, token: string) {
  const { GET } = await import('@/app/api/control/schools/[schoolId]/students/route');
  return GET(new NextRequest(`https://www.netcyberai.test/api/control/schools/${schoolId}/students${query}`, { headers: { cookie: `nca_access=${token}` } }), { params: { schoolId } });
}

describe('the school students route', () => {
  it('a principal is refused, and a request with no sign-in is too', async () => {
    const res = await get(A, '', await access(PRINCIPAL, 'principal', A));
    expect(res.status).toBe(403);
    const { GET } = await import('@/app/api/control/schools/[schoolId]/students/route');
    expect((await GET(new NextRequest(`https://www.netcyberai.test/api/control/schools/${A}/students`), { params: { schoolId: A } })).status).toBe(401);
  });

  it('a school id that is not a uuid is 404', async () => {
    const res = await get('not-a-uuid', '', await access(FOUNDER, 'super_admin', null));
    expect(res.status).toBe(404);
  });

  it('the founder gets the counts and the list of that school only, in name order', async () => {
    const res = await get(A, '', await access(FOUNDER, 'super_admin', null));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counts).toEqual({ total: 4, active: 2, byLevel: [{ level: '8', count: 2 }, { level: '10', count: 1 }, { level: null, count: 1 }] });
    expect(body.students.map((s: { name: string }) => s.name)).toEqual(['Asha Rao', 'Bala Iyer', 'Chitra Nair', 'Dev Menon']);
    expect(body.students[0]).toEqual({ studentId: expect.any(String), admissionNo: 'A-001', name: 'Asha Rao', className: '8-A', section: 'A', status: 'active' });
    expect(body.students[3]).toMatchObject({ className: null, section: null, status: 'inactive' });
    expect(body.matching).toBe(4);
    // Nothing but those fields about a child.
    expect(Object.keys(body.students[0]).sort()).toEqual(['admissionNo', 'className', 'name', 'section', 'status', 'studentId']);
    expect(JSON.stringify(body)).not.toMatch(/Zed Other|Asha Elsewhere|Bulk/);
  });

  it('q narrows by name or admission number, within the one school', async () => {
    const token = await access(FOUNDER, 'super_admin', null);
    const byName = await (await get(A, '?q=asha', token)).json();
    expect(byName.students.map((s: { name: string }) => s.name)).toEqual(['Asha Rao']);
    expect(byName.matching).toBe(1);
    // The counts stay the school's whole.
    expect(byName.counts.total).toBe(4);
    const byNo = await (await get(A, '?q=A-003', token)).json();
    expect(byNo.students.map((s: { name: string }) => s.name)).toEqual(['Chitra Nair']);
    const none = await (await get(A, '?q=%25', token)).json();
    expect(none.students).toEqual([]);
  });

  it('a page is 50, ?page= moves on, and a bad page is the first', async () => {
    const token = await access(FOUNDER, 'super_admin', null);
    const first = await (await get(B, '', token)).json();
    expect(first.counts.total).toBe(62);
    expect(first.students).toHaveLength(50);
    expect(first.matching).toBe(62);
    const second = await (await get(B, '?page=2', token)).json();
    expect(second.students).toHaveLength(12);
    expect(second.page).toBe(2);
    expect((await (await get(B, '?page=abc', token)).json()).page).toBe(1);
  });
});
