import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { importStudentRecords } from '@/lib/import/run-import';
import { readGender, readImportGender } from '@/lib/students/gender';

// Gender on the student form and on the CSV import (C222, C224): Aadhaar's set or "not given", recorded by the office
// only (the principal and the school admin), as the database's students_gender_office_only says. A teacher's form
// does not offer it and the app refuses it. Every name and number is made up.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const session = vi.hoisted(() => ({ claims: null as any, run: null as any }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => session.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => session.claims }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => session.run(claims, fn),
}));

import { GET as listRoute, POST as addRoute } from '@/app/api/app/students/route';
import { GET as oneRoute, PATCH as editRoute } from '@/app/api/app/students/[studentId]/route';

const A = 'ee240000-0000-4000-8000-000000000001';
const u = (n: number) => `ee240000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TARA] = [u(11), u(12), u(13)];
const C5A = u(51);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const tara: Who = { role: 'teacher', user: TARA };
const signIn = (w: Who) => {
  session.claims = { sub: w.user, role: w.role, schoolId: A, membershipId: null, tv: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session.run = (claims: any, fn: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.pg.transaction(async (tx: any) => {
      await tx.query('set local role app_user');
      for (const [k, v] of [['app.current_tenant_id', claims.schoolId], ['app.current_role', claims.role], ['app.current_user_id', claims.sub]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
      return fn(tx);
    });
};
const send = async (w: Who, method: 'POST' | 'PATCH' | 'GET', path: string, body?: unknown, studentId = '') => {
  signIn(w);
  const req = new NextRequest(`http://school.example${path}`, body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  const route = method === 'POST' ? addRoute : method === 'PATCH' ? editRoute : studentId ? oneRoute : listRoute;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (route as any)(req, { params: { studentId } });
  return { status: res.status, body: await res.json() };
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const genderOf = async (name: string) => (await db.pg.query(`select gender from students where school_id = $1 and name = $2`, [A, name])).rows.map((r: { gender: string }) => r.gender);

describe('the rule', () => {
  it('a form takes one of the four, from the office only; an import takes Aadhaar’s three or empty', () => {
    expect(readGender(undefined, 'teacher')).toEqual({ ok: true, value: null });
    expect(readGender('', 'teacher')).toEqual({ ok: true, value: null });
    expect(readGender('female', 'principal')).toEqual({ ok: true, value: 'female' });
    expect(readGender('not_given', 'school_admin')).toEqual({ ok: true, value: 'not_given' });
    expect(readGender('female', 'teacher')).toEqual({ ok: false, reason: 'not_allowed' });
    expect(readGender('female', 'accountant')).toEqual({ ok: false, reason: 'not_allowed' });
    expect(readGender('girl', 'principal')).toEqual({ ok: false, reason: 'gender' });
    expect(readGender(1, 'principal')).toEqual({ ok: false, reason: 'gender' });
    expect(readImportGender('Female')).toEqual({ ok: true, value: 'female' });
    expect(readImportGender(' TRANSGENDER ')).toEqual({ ok: true, value: 'transgender' });
    expect(readImportGender('')).toEqual({ ok: true, value: 'not_given' });
    expect(readImportGender(undefined)).toEqual({ ok: true, value: 'not_given' });
    expect(readImportGender('F')).toEqual({ ok: false });
    expect(readImportGender('not_given')).toEqual({ ok: false });
  });
});

describe('on the real schema, as each person’s own session', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false);
      insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'students', true, 'plan') on conflict (school_id, module_id) do update set enabled = true;
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'principal@g-a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'admin@g-a.example', 'school_admin', 'Asif Admin'),
        ('${TARA}', '${A}', 'tara@g-a.example', 'teacher', 'Tara Teacher');
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5A}', '${A}', '5A', '${TARA}');
    `);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('the office adds a child with a gender; a value outside the four is refused; a teacher cannot add one at all', async () => {
    expect((await send(principal, 'POST', '/api/app/students', { name: 'Asha Example', classId: C5A, gender: 'female' })).status).toBe(201);
    expect(await genderOf('Asha Example')).toEqual(['female']);
    expect((await send(admin, 'POST', '/api/app/students', { name: 'Bilal Example', classId: C5A })).status).toBe(201);
    expect(await genderOf('Bilal Example')).toEqual(['not_given']);
    expect(await send(admin, 'POST', '/api/app/students', { name: 'Chitra Example', classId: C5A, gender: 'girl' })).toMatchObject({ status: 400, body: { code: 'not_sent_properly' } });
    expect((await send(tara, 'POST', '/api/app/students', { name: 'Dev Example', classId: C5A, gender: 'male' })).status).toBe(403);
    expect(await genderOf('Chitra Example')).toEqual([]);
    expect(await genderOf('Dev Example')).toEqual([]);
    // The record made is audited without the child's name, date of birth or gender.
    const audit = (await db.pg.query(`select after_state from audit_log where event_action = 'student.create'`)).rows;
    expect(audit.map((r: { after_state: unknown }) => r.after_state)).toEqual([
      { classId: C5A, status: 'pending_consent', withAdmissionNo: false, withDob: false, withGender: true },
      { classId: C5A, status: 'pending_consent', withAdmissionNo: false, withDob: false, withGender: false },
    ]);
  });

  it('the office changes it on the record; the record shows it; a teacher cannot, through the app or the database', async () => {
    const id = (await db.pg.query(`select student_id from students where name = 'Bilal Example'`)).rows[0].student_id as string;
    expect((await send(admin, 'PATCH', `/api/app/students/${id}`, { gender: 'male' }, id)).body.student).toMatchObject({ gender: 'male' });
    expect((await send(tara, 'GET', `/api/app/students/${id}`, undefined, id)).body.student).toMatchObject({ gender: 'male' });
    expect(await send(admin, 'PATCH', `/api/app/students/${id}`, { gender: 'boy' }, id)).toMatchObject({ status: 400, body: { code: 'not_sent_properly' } });
    expect((await send(tara, 'PATCH', `/api/app/students/${id}`, { gender: 'female' }, id)).status).toBe(403);
    await expect(as(tara, (c) => c.query(`update students set gender = 'female' where student_id = $1`, [id]))).rejects.toThrow(/only the principal or the school admin/);
    expect(await genderOf('Bilal Example')).toEqual(['male']);
    // Audited by which details changed, never their values.
    const [audit] = (await db.pg.query(`select before_state, after_state from audit_log where event_action = 'student.update' and target_id = $1`, [id])).rows;
    expect(audit).toEqual({ before_state: { classId: C5A }, after_state: { changed: ['gender'], classId: C5A } });
  });

  it('the list tells the screen who is the office: it offers the gender and the data check to them only', async () => {
    expect((await send(principal, 'GET', '/api/app/students')).body.office).toBe(true);
    expect((await send(admin, 'GET', '/api/app/students')).body.office).toBe(true);
    expect((await send(tara, 'GET', '/api/app/students')).body.office).toBe(false);
  });

  it('the CSV import takes an optional gender column with Aadhaar’s values or empty; anything else is a row error', async () => {
    const records = [
      { name: 'Esha Example', class_name: '5A', gender: 'Female' },
      { name: 'Farid Example', class_name: '5A', gender: '' },
      { name: 'Gauri Example', class_name: '5A', gender: 'transgender' },
      { name: 'Hari Example', class_name: '5A', gender: 'M' },
      { name: 'Indu Example', class_name: '5A' },
    ];
    const done = await as(principal, (c) => importStudentRecords(c, { schoolId: A, sub: PRINCIPAL, role: 'principal' }, records, 'hash-gender-1', 'g.csv'));
    expect([done.importedCount, done.skippedCount]).toEqual([4, 1]);
    expect(done.errors).toEqual([{ row: 4, name: 'Hari Example', admissionNo: null, errors: ['gender must be male, female or transgender, as Aadhaar prints it, or left empty'] }]);
    for (const [name, gender] of [['Esha Example', 'female'], ['Farid Example', 'not_given'], ['Gauri Example', 'transgender'], ['Indu Example', 'not_given']]) expect(await genderOf(name), name).toEqual([gender]);
    expect(await genderOf('Hari Example')).toEqual([]);
  });

  it('a gender in a file from anyone but the office is a row error, and nothing of it is written', async () => {
    const records = [{ name: 'Jaya Example', class_name: '5A', gender: 'female' }, { name: 'Kiran Example', class_name: '5A', gender: '' }];
    const done = await as(tara, (c) => importStudentRecords(c, { schoolId: A, sub: TARA, role: 'teacher' }, records, 'hash-gender-2', 't.csv', { preview: true }));
    expect(done.errors).toEqual([{ row: 1, name: 'Jaya Example', admissionNo: null, errors: ['only the principal or the school admin records a gender'] }]);
    expect(await genderOf('Jaya Example')).toEqual([]);
  });
});
