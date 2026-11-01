import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';

// W14-H: a roll number is one student's in a class. The import names the row and the clash; the Add and Edit routes
// answer in plain words; the database's unique index backs them. The list's counts come from one query and agree with
// the rows. Every name and number is made up.

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
import { GET as listStudents, POST as addStudent } from '@/app/api/app/students/route';
import { PATCH as editStudent } from '@/app/api/app/students/[studentId]/route';

const A = 'e1400000-0000-4000-8000-000000000001';
const PRINCIPAL = 'e1400000-0000-4000-8000-000000000011';
const C6A = 'e1400000-0000-4000-8000-000000000061';
const C7A = 'e1400000-0000-4000-8000-000000000071';
const AARAV = 'e1400000-0000-4000-8000-000000000031';
const DIYA = 'e1400000-0000-4000-8000-000000000032';

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
const sendCsv = async (csv: string, preview = false) => {
  signIn();
  const form = new FormData();
  form.set('file', new File([csv], 'students.csv', { type: 'text/csv' }));
  const res = await importStudents(new NextRequest(`http://localhost/api/app/students/import${preview ? '?preview=1' : ''}`, { method: 'POST', body: form }));
  return { status: res.status, body: await res.json() };
};
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const list = async (query = '') => {
  signIn();
  const res = await listStudents(new NextRequest(`http://localhost/api/app/students${query}`));
  return { status: res.status, body: await res.json() };
};

describe('roll numbers and counts on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR');
      insert into users (user_id, school_id, email, role, display_name, is_active) values ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true);
      insert into school_module_entitlements (school_id, module_id, enabled, source)
        select '${A}', m, true, 'plan' from unnest(array[${MODULE_REGISTRY.map((m) => `'${m.id}'`).join(', ')}]) m on conflict (school_id, module_id) do update set enabled = true;
      insert into classes (class_id, school_id, name, grade, section) values ('${C6A}', '${A}', '6-A', '6', 'A'), ('${C7A}', '${A}', '7-A', '7', 'A');
      insert into students (student_id, school_id, name, class_id, roll_no, status) values
        ('${AARAV}', '${A}', 'Aarav Example', '${C6A}', '7', 'active'),
        ('${DIYA}', '${A}', 'Diya Sample', '${C6A}', '8', 'active'),
        (gen_random_uuid(), '${A}', 'Kabir Specimen', '${C7A}', '7', 'active'),
        (gen_random_uuid(), '${A}', 'Meera Placeholder', null, null, 'inactive'),
        (gen_random_uuid(), '${A}', 'Ira Demoji', null, null, 'transferred'),
        (gen_random_uuid(), '${A}', 'Neel Fictional', null, null, 'pending_consent');
    `);
    state.tenant = (_c: unknown, fn: (client: unknown) => Promise<unknown>) => as(fn);
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('the unique index exists, and the database refuses a second student with the same roll in a class', async () => {
    const idx = await db.pg.query(`select indexdef from pg_indexes where tablename = 'students' and indexname = 'students_class_roll_unique'`);
    expect(idx.rows).toHaveLength(1);
    expect(idx.rows[0].indexdef).toMatch(/UNIQUE[\s\S]*\(school_id, class_id, roll_no\)[\s\S]*roll_no IS NOT NULL/);
    await expect(db.pg.query(`insert into students (school_id, name, class_id, roll_no, status) values ('${A}', 'Twin Roll', '${C6A}', '7', 'active')`)).rejects.toThrow(/students_class_roll_unique/);
    // The same roll in another class, and no roll at all, are fine.
    await db.pg.query(`insert into students (school_id, name, class_id, roll_no, status) values ('${A}', 'No Roll One', '${C6A}', null, 'inactive'), ('${A}', 'No Roll Two', '${C6A}', null, 'inactive')`);
    await db.pg.query(`delete from students where name like 'No Roll%'`);
  });

  it('the import refuses a roll already held in the class, and one repeated in the file, naming the row', async () => {
    const csv = ['name,class_name,roll_no', 'Anaya Madeup,6-A,9', 'Reyansh Example,6-A,7', 'Saanvi Sample,7-A,9', 'Ishaan Specimen,7-A, 9 '].join('\n');
    const checked = await sendCsv(csv, true);
    expect(checked.status).toBe(200);
    expect(checked.body.errors).toEqual([
      { row: 2, name: 'Reyansh Example', admissionNo: null, errors: ['roll 7 is already Aarav Example in 6-A'] },
      { row: 4, name: 'Ishaan Specimen', admissionNo: null, errors: ['roll 9 is also on row 3 of this file, for 7-A'] },
    ]);
    const refused = await sendCsv(csv, false);
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ refused: true, importedCount: 0, skippedCount: 2 });
    expect((await db.pg.query(`select count(*)::int as n from students where name in ('Anaya Madeup', 'Reyansh Example')`)).rows[0].n).toBe(0);
    // Without the clashes the same rows land.
    const ok = await sendCsv(['name,class_name,roll_no', 'Anaya Madeup,6-A,9', 'Saanvi Sample,7-A,9'].join('\n'));
    expect(ok.status).toBe(201);
    expect(ok.body.importedCount).toBe(2);
  });

  it('Add and Edit student answer in plain words and write nothing on a clash', async () => {
    signIn();
    const add = await addStudent(new NextRequest('http://localhost/api/app/students', json('POST', { name: 'Dhruv Testwala', classId: C6A, rollNo: '8' })));
    expect(add.status).toBe(409);
    expect((await add.json()).error).toBe('The roll number was not saved: roll 8 is already Diya Sample in 6-A.');
    expect((await db.pg.query(`select count(*)::int as n from students where name = 'Dhruv Testwala'`)).rows[0].n).toBe(0);

    const edit = await editStudent(new NextRequest(`http://localhost/api/app/students/${AARAV}`, json('PATCH', { rollNo: '8' })), { params: { studentId: AARAV } });
    expect(edit.status).toBe(409);
    expect((await edit.json()).error).toBe('The change was not saved: roll 8 is already Diya Sample in 6-A.');
    // Moving into a class where the roll is taken is the same clash; keeping his own roll is not.
    const move = await editStudent(new NextRequest(`http://localhost/api/app/students/${AARAV}`, json('PATCH', { classId: C7A })), { params: { studentId: AARAV } });
    expect(move.status).toBe(409);
    const same = await editStudent(new NextRequest(`http://localhost/api/app/students/${AARAV}`, json('PATCH', { rollNo: '7', name: 'Aarav Example' })), { params: { studentId: AARAV } });
    expect(same.status).toBe(200);
    const free = await addStudent(new NextRequest('http://localhost/api/app/students', json('POST', { name: 'Dhruv Testwala', classId: C6A, rollNo: '30' })));
    expect(free.status).toBe(201);
  });

  it('the status counts come from one grouped query and match the rows', async () => {
    const all = await list('?status=active&limit=200');
    const { counts, total, students } = all.body;
    expect(counts.active).toBe(students.length);
    expect(total).toBe(counts.active);
    const left = await list('?status=left&limit=200');
    expect(left.body.students).toHaveLength(counts.left);
    expect(left.body.students.every((s: { status: string }) => s.status === 'inactive' || s.status === 'transferred')).toBe(true);
    expect(left.body.total).toBe(left.body.counts.left);
    // The same counts whichever view is asked for, and with no status the total is every student.
    expect(left.body.counts).toEqual(counts);
    const everyone = await list('?limit=200');
    expect(everyone.body.students).toHaveLength(counts.active + counts.left + counts.pending_consent);
    expect(everyone.body.total).toBe(everyone.body.students.length);
    expect(counts.pending_consent).toBe((await db.pg.query(`select count(*)::int as n from students where status = 'pending_consent'`)).rows[0].n);
    expect((await list('?status=bogus')).status).toBe(400);
  });
});
