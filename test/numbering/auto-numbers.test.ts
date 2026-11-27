import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';

// C554: admission numbers, roll numbers, staff codes and school codes are given by the system, in order, never twice.
// Every name and number is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
vi.mock('@/lib/frameworks/page-access', () => ({ moduleOffReason: async () => null }));

import { POST as importStudents } from '@/app/api/app/students/import/route';
import { POST as addStudent } from '@/app/api/app/students/route';
import { GET as nextNumbers } from '@/app/api/app/students/next-numbers/route';

const A = 'e5540000-0000-4000-8000-000000000001';
const B = 'e5540000-0000-4000-8000-000000000002';
const PRINCIPAL = 'e5540000-0000-4000-8000-000000000011';
const C7A = 'e5540000-0000-4000-8000-000000000071';
const C7B = 'e5540000-0000-4000-8000-000000000072';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', 'principal'], ['app.current_user_id', PRINCIPAL]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const signIn = () => {
  state.claims = { sub: PRINCIPAL, role: 'principal', schoolId: A, membershipId: PRINCIPAL, tokenVersion: 0, aal: 'aal1', sessionId: PRINCIPAL };
};
const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const add = async (body: unknown) => {
  signIn();
  const res = await addStudent(new NextRequest('http://localhost/api/app/students', json(body)));
  return { status: res.status, body: await res.json() };
};
const rows = async (sql: string) => (await db.pg.query(sql)).rows;

describe('numbers the system gives', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-HR');
      insert into users (user_id, school_id, email, role, display_name, is_active) values ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true);
      insert into school_module_entitlements (school_id, module_id, enabled, source)
        select '${A}', m, true, 'plan' from unnest(array[${MODULE_REGISTRY.map((m) => `'${m.id}'`).join(', ')}]) m on conflict (school_id, module_id) do update set enabled = true;
      insert into classes (class_id, school_id, name, grade, section) values ('${C7A}', '${A}', '7-A', '7', 'A'), ('${C7B}', '${A}', '7-B', '7', 'B');
      insert into students (school_id, name, admission_no, class_id, roll_no, status) values
        ('${A}', 'Aarav Example', 'ADM/0041', '${C7A}', '1', 'active'),
        ('${A}', 'Diya Sample', 'ADM/0042', '${C7A}', '2', 'active'),
        ('${A}', 'Gone Left', 'ADM/0043', '${C7A}', '3', 'transferred');
    `);
    state.tenant = (_c: unknown, fn: (client: unknown) => Promise<unknown>) => as(fn);
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('a student added with blanks gets the next admission number and the class next roll number', async () => {
    signIn();
    const preview = await nextNumbers(new NextRequest(`http://localhost/api/app/students/next-numbers?classId=${C7A}`));
    expect(await preview.json()).toEqual({ admissionNo: 'ADM/0044', rollNo: '3' });
    const r = await add({ name: 'Kabir Specimen', classId: C7A });
    expect(r.status).toBe(201);
    expect(r.body.student).toMatchObject({ admission_no: 'ADM/0044', roll_no: '3' });
    // Another section counts on its own.
    expect((await add({ name: 'Meera Placeholder', classId: C7B })).body.student).toMatchObject({ admission_no: 'ADM/0045', roll_no: '1' });
  });

  it('a number typed by hand is kept, and one already in use is refused in plain words', async () => {
    expect((await add({ name: 'Ira Demoji', admissionNo: 'X-9', classId: C7A, rollNo: '20' })).body.student).toMatchObject({ admission_no: 'X-9', roll_no: '20' });
    const taken = await add({ name: 'Neel Fictional', admissionNo: 'adm/0044' });
    expect(taken.status).toBe(409);
    expect(taken.body.error).toMatch(/already another student's/);
    await expect(db.pg.query(`insert into students (school_id, name, admission_no, status) values ('${A}', 'Twin', ' ADM/0041 ', 'active')`)).rejects.toThrow(/students_admission_no_per_school/);
  });

  it('an import gives the blanks in file order and never a number the file itself uses', async () => {
    signIn();
    const form = new FormData();
    const csv = ['name,admission_no,class_name,roll_no', 'Row One,,7-A,', 'Row Two,ADM/0046,7-A,', 'Row Three,,7-B,', 'Row Four,,7-A,22'].join('\n');
    form.set('file', new File([csv], 'students.csv', { type: 'text/csv' }));
    const res = await importStudents(new NextRequest('http://localhost/api/app/students/import', { method: 'POST', body: form }));
    expect(res.status).toBe(201);
    const got = await rows(`select name, admission_no, roll_no from students where name like 'Row %' order by name`);
    expect(got).toEqual([
      { name: 'Row Four', admission_no: 'ADM/0049', roll_no: '22' },
      { name: 'Row One', admission_no: 'ADM/0047', roll_no: '23' },
      { name: 'Row Three', admission_no: 'ADM/0048', roll_no: '2' },
      { name: 'Row Two', admission_no: 'ADM/0046', roll_no: '24' },
    ]);
  });

  it('every staff member gets the school next staff code on joining, and each school its own series', async () => {
    const T1 = 'e5540000-0000-4000-8000-000000000021';
    const T2 = 'e5540000-0000-4000-8000-000000000022';
    const T3 = 'e5540000-0000-4000-8000-000000000023';
    const P = 'e5540000-0000-4000-8000-000000000024';
    await db.pg.exec(`
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${T1}', '${A}', 't1@school-a.example', 'teacher', 'Tara Teacher', true),
        ('${T2}', '${A}', 't2@school-a.example', 'teacher', 'Tej Teacher', true),
        ('${T3}', '${B}', 't3@school-b.example', 'teacher', 'Tina Teacher', true),
        ('${P}', '${A}', 'p@school-a.example', 'parent', 'Pari Parent', true);
      insert into memberships (user_id, school_id, role) values ('${T1}', '${A}', 'teacher'), ('${T2}', '${A}', 'teacher'), ('${T3}', '${B}', 'teacher'), ('${P}', '${A}', 'parent');
    `);
    const codes = await rows(`select user_id, staff_code from staff_profiles where user_id in ('${T1}', '${T2}', '${T3}', '${P}') order by user_id`);
    expect(codes).toEqual([
      { user_id: T1, staff_code: 'EMP-001' },
      { user_id: T2, staff_code: 'EMP-002' },
      { user_id: T3, staff_code: 'EMP-001' },
    ]);
  });

  it('every school gets the next school code, whichever screen makes it', async () => {
    const before = await rows(`select school_code from schools where school_id in ('${A}', '${B}') order by school_code`);
    expect(before.every((r: { school_code: string }) => /^NCA-\d{4,}$/.test(r.school_code))).toBe(true);
    const made = (await rows(`insert into schools (name, jurisdiction) values ('School C', 'IN-HR') returning school_code`))[0].school_code;
    expect(made).toMatch(/^NCA-\d{4,}$/);
    expect(new Set((await rows(`select school_code from schools`)).map((r: { school_code: string }) => r.school_code)).size).toBe(Number((await rows(`select count(*)::int n from schools`))[0].n));
  });
});
