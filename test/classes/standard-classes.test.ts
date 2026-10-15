import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { readClassCsv, readGrade, readSection } from '@/lib/classes/class-csv';
import { sortClasses } from '@/lib/classes/class-order';
import { STANDARD_CLASSES } from '@/lib/classes/standard-classes';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';

// The standard classes and classes by CSV (C235-A), on the whole schema as the app's own database role, through the
// app's routes. The acceptance test: the principal adds LKG, UKG and 1 to 12 with sections A to C in one step; a
// teacher is refused; a second press makes nothing; another school is untouched. A classes CSV is checked line by
// line and added all or nothing. Every name and email is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
vi.mock('@/lib/frameworks/page-access', () => ({ moduleOffReason: async () => null }));

import { GET as listClasses } from '@/app/api/app/classes/route';
import { POST as addStandard } from '@/app/api/app/classes/standard/route';
import { POST as importClasses } from '@/app/api/app/classes/import/route';
import { GET as exportClasses } from '@/app/api/app/classes/export/route';

const A = 'c8000000-0000-4000-8000-000000000001';
const B = 'c8000000-0000-4000-8000-000000000002';
const u = (n: number) => `c8000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TARA, LATA, ACCOUNTANT, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15), u(16)];
const [SESSION_OLD, SESSION_NOW] = [u(21), u(22)];
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const tara: Who = { role: 'teacher', user: TARA };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const bPrincipal: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school ?? A, membershipId: u(90), tokenVersion: 0, aal: 'aal1', sessionId: u(91) });
const call = async (who: Who, fn: () => Promise<Response>) => {
  state.claims = claims(who);
  const res = await fn();
  const text = await res.text();
  return { status: res.status, type: res.headers.get('content-type') ?? '', text, body: res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : null };
};
const standard = (who: Who) => call(who, () => addStandard(new NextRequest('http://localhost/api/app/classes/standard', { method: 'POST' })));
const upload = (who: Who, csv: string, preview = false) =>
  call(who, () => importClasses(new NextRequest('http://localhost/api/app/classes/import', { method: 'POST', body: JSON.stringify({ csv, preview }) })));
const names = async (school = A): Promise<string[]> => (await db.pg.query(`select name from classes where school_id = $1 order by name`, [school])).rows.map((r: { name: string }) => r.name);
const count = async (sql: string, params: unknown[] = []): Promise<number> => (await db.pg.query(sql, params)).rows[0].n;
const audits = async (action: string) => (await db.pg.query(`select actor_user_id, actor_role::text as role, after_state from audit_log where event_action = $1 and school_id = $2 order by occurred_at, audit_id`, [action, A])).rows;

describe('the standard classes and classes by CSV, on the whole schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin', true),
        ('${TARA}', '${A}', 'Tara@School-A.example', 'teacher', 'Tara Teacher', true), ('${LATA}', '${A}', 'lata@school-a.example', 'teacher', 'Lata Left', false),
        ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant', true), ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Bela Principal', true);
      insert into school_module_entitlements (school_id, module_id, enabled, source)
        select s, m, true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s, unnest(array[${MODULE_REGISTRY.map((m) => `'${m.id}'`).join(', ')}]) m on conflict (school_id, module_id) do update set enabled = true;
      insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values
        ('${SESSION_OLD}', '${A}', '2025-26', '2025-04-01', '2026-03-31', false), ('${SESSION_NOW}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
      -- School A has three classes of its own: 5-A, a "6B" named without a hyphen and with no grade or section, and
      -- a class of its own kind. School B has 1-A.
      insert into classes (school_id, name, grade, section, session_id, class_teacher_id) values
        ('${A}', '5-A', '5', 'A', '${SESSION_OLD}', '${TARA}'), ('${A}', '6B', null, null, null, null), ('${A}', 'Toddlers', null, null, null, null),
        ('${B}', '1-A', '1', 'A', null, null);
    `);
    state.tenant = (c: { role: string; sub: string; schoolId: string }, fn: (client: unknown) => Promise<unknown>) => as({ role: c.role, user: c.sub, school: c.schoolId }, fn);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('the standard set is LKG, UKG and 1 to 12, each with A, B and C: 42 classes, named as the school names its classes', () => {
    expect(STANDARD_CLASSES).toHaveLength(42);
    expect(new Set(STANDARD_CLASSES.map((c) => c.name)).size).toBe(42);
    expect(STANDARD_CLASSES.slice(0, 7).map((c) => c.name)).toEqual(['LKG-A', 'LKG-B', 'LKG-C', 'UKG-A', 'UKG-B', 'UKG-C', '1-A']);
    expect(STANDARD_CLASSES.find((c) => c.name === '10-B')).toEqual({ name: '10-B', grade: '10', section: 'B' });
  });

  it('a teacher, the accountant and another school’s principal cannot add them, and nothing is added', async () => {
    for (const who of [tara, accountant]) expect(await standard(who), who.role).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
    expect(await names()).toEqual(['5-A', '6B', 'Toddlers']);
    expect(await audits('class.standard_set')).toEqual([]);
  });

  it('the principal adds every one the school does not have, in the current session, with one audit row of counts', async () => {
    const first = await standard(principal);
    expect(first.status).toBe(201);
    // 5-A is there, and so is 6-B under the name "6B": 40 are added, in the class order.
    expect(first.body.createdCount).toBe(40);
    expect(first.body.alreadyThere).toBe(2);
    expect(first.body.sessionId).toBe(SESSION_NOW);
    expect(first.body.created.map((c: { name: string }) => c.name)).toEqual(STANDARD_CLASSES.map((c) => c.name).filter((n) => n !== '5-A' && n !== '6-B'));
    expect(await count(`select count(*)::int as n from classes where school_id = $1 and session_id = $2 and name = any($3::text[])`, [A, SESSION_NOW, first.body.created.map((c: { name: string }) => c.name)])).toBe(40);
    expect((await db.pg.query(`select grade, section from classes where school_id = $1 and name = 'LKG-B'`, [A])).rows).toEqual([{ grade: 'LKG', section: 'B' }]);
    // The classes that were there are untouched.
    expect((await db.pg.query(`select name, grade, section, session_id, class_teacher_id from classes where school_id = $1 and name in ('5-A', '6B', 'Toddlers') order by name`, [A])).rows).toEqual([
      { name: '5-A', grade: '5', section: 'A', session_id: SESSION_OLD, class_teacher_id: TARA },
      { name: '6B', grade: null, section: null, session_id: null, class_teacher_id: null },
      { name: 'Toddlers', grade: null, section: null, session_id: null, class_teacher_id: null },
    ]);
    expect(await audits('class.standard_set')).toEqual([{ actor_user_id: PRINCIPAL, role: 'principal', after_state: { created: 40, already_there: 2, standard: 42, session_id: SESSION_NOW } }]);
  });

  it('a second press, by the principal or the school admin, makes nothing; another school is untouched', async () => {
    const before = await names();
    for (const who of [principal, admin]) expect(await standard(who), who.role).toMatchObject({ status: 200, body: { createdCount: 0, alreadyThere: 42, created: [] } });
    expect(await names()).toEqual(before);
    expect(before).toHaveLength(43);
    expect((await audits('class.standard_set')).map((a: { after_state: { created: number } }) => a.after_state.created)).toEqual([40, 0, 0]);
    expect(await names(B)).toEqual(['1-A']);
    // School B's own press adds its 41 and never sees or touches School A's.
    expect(await standard(bPrincipal)).toMatchObject({ status: 201, body: { createdCount: 41, alreadyThere: 1 } });
    expect(await names()).toEqual(before);
  });

  it('the list of classes is in the class order: LKG, UKG, 1 to 12, then classes of the school’s own kind', async () => {
    const listed = await call(principal, () => listClasses(new NextRequest('http://localhost/api/app/classes')));
    const order = listed.body.classes.map((c: { name: string }) => c.name);
    expect(order.slice(0, 7)).toEqual(['LKG-A', 'LKG-B', 'LKG-C', 'UKG-A', 'UKG-B', 'UKG-C', '1-A']);
    expect(order.indexOf('2-A')).toBeLessThan(order.indexOf('10-A'));
    expect(order.slice(-4)).toEqual(['12-A', '12-B', '12-C', 'Toddlers']);
    // "6B" sits with grade 6, before 6-C.
    expect(order.slice(order.indexOf('6-A'), order.indexOf('6-A') + 3)).toEqual(['6-A', '6B', '6-C']);
    expect(order).toEqual(sortClasses(listed.body.classes).map((c: { name: string }) => c.name));
    expect([listed.body.mayManageClasses, (await call(tara, () => listClasses(new NextRequest('http://localhost/api/app/classes')))).body.mayManageClasses]).toEqual([true, false]);
  });

  describe('classes from a CSV file', () => {
    it('reads grades and sections strictly', () => {
      expect(['lkg', 'UKG', 'Nursery', '1', '05', '12'].map(readGrade)).toEqual(['LKG', 'UKG', 'Nursery', '1', '5', '12']);
      expect(['0', '13', 'Prep', 'X', 'Class 5', '5A', ''].map(readGrade)).toEqual([null, null, null, null, null, null, null]);
      expect(['a', 'B', ' c '].map(readSection)).toEqual(['A', 'B', 'C']);
      expect(['AB', '1', '-', '', 'Ä'].map(readSection)).toEqual([null, null, null, null, null]);
    });

    it('names every problem of a file by its line, without the database', () => {
      const read = readClassCsv(['grade,section,class_teacher_email', 'Nursery,A,', 'Nursery,a,', '13,B,', ',C,', 'LKG,,', 'LKG,AB,', '2,D,x@y.example,extra', '', '2,E,'].join('\n'));
      expect(read.problems).toEqual([
        { line: 3, code: 'duplicate_in_file', value: 'Nursery-A', with: 2 },
        { line: 4, code: 'grade_unknown', value: '13' },
        { line: 5, code: 'grade_missing' },
        { line: 6, code: 'section_missing' },
        { line: 7, code: 'section_bad', value: 'AB' },
        { line: 8, code: 'too_many_values' },
      ]);
      expect(read.rows.map((r) => [r.line, r.name])).toEqual([[2, 'Nursery-A'], [10, '2-E']]);
      expect(read.lines).toBe(8);
      expect(readClassCsv('grade,section\n"5,A\n').problems).toEqual([{ line: 1, code: 'unclosed_quote' }]);
      expect(readClassCsv('class,section\n5,A\n').problems).toEqual([{ line: 1, code: 'header' }]);
      expect(readClassCsv('grade,section\n\n').problems).toEqual([{ line: 1, code: 'no_rows' }]);
      expect(readClassCsv(`grade,section\n${'5,A\n'.repeat(1001)}`).problems).toEqual([{ line: 1, code: 'too_many_rows', value: '1000' }]);
      // The app's own download starts with a byte order mark; it is read past.
      expect(readClassCsv('﻿grade,section,class_teacher_email,name,students\r\nNursery,B,,Nursery-B,0\r\n')).toEqual({ rows: [{ line: 2, name: 'Nursery-B', grade: 'Nursery', section: 'B', teacherEmail: null }], problems: [], lines: 1 });
    });

    it('“Check file” writes nothing; a file with any problem adds nothing and lists every line; a good file adds all', async () => {
      const before = await names();
      const bad = ['grade,section,class_teacher_email', 'Nursery,A,tara@school-a.example', 'Nursery,B,lata@school-a.example', 'Nursery,C,nobody@school-a.example', '5,A,', '6,B,', 'Prep,A,', 'Nursery,A,'].join('\n');
      const problems = [
        { line: 3, code: 'teacher_unknown', value: 'lata@school-a.example' },
        { line: 4, code: 'teacher_unknown', value: 'nobody@school-a.example' },
        { line: 5, code: 'already_exists', value: '5-A' },
        { line: 6, code: 'already_exists', value: '6-B' },
        { line: 7, code: 'grade_unknown', value: 'Prep' },
        { line: 8, code: 'duplicate_in_file', value: 'Nursery-A', with: 2 },
      ];
      expect(await upload(principal, bad, true)).toMatchObject({ status: 200, body: { preview: true, committed: false, rowCount: 7, problems, created: [] } });
      expect(await upload(principal, bad)).toMatchObject({ status: 422, body: { code: 'import_problems', committed: false, problems } });
      expect(await names()).toEqual(before);
      expect(await audits('class.import')).toEqual([]);

      const good = '﻿grade,section,class_teacher_email\r\nNursery,B,\r\nnursery,a,TARA@school-a.example\r\n';
      expect(await upload(principal, good, true)).toMatchObject({ status: 200, body: { committed: false, rowCount: 2, problems: [] } });
      expect(await names()).toEqual(before);
      const added = await upload(admin, good);
      expect(added).toMatchObject({ status: 201, body: { committed: true, rowCount: 2, problems: [] } });
      // In the class order, whatever the file's.
      expect(added.body.created.map((c: { name: string }) => c.name)).toEqual(['Nursery-A', 'Nursery-B']);
      expect((await db.pg.query(`select name, grade, section, session_id, class_teacher_id from classes where school_id = $1 and grade = 'Nursery' order by name`, [A])).rows).toEqual([
        { name: 'Nursery-A', grade: 'Nursery', section: 'A', session_id: SESSION_NOW, class_teacher_id: TARA },
        { name: 'Nursery-B', grade: 'Nursery', section: 'B', session_id: SESSION_NOW, class_teacher_id: null },
      ]);
      expect(await audits('class.import')).toEqual([{ actor_user_id: ADMIN, role: 'school_admin', after_state: { created: 2, with_class_teacher: 1, session_id: SESSION_NOW } }]);
      // The same file again: both are there now.
      expect(await upload(principal, good)).toMatchObject({ status: 422, body: { problems: [{ line: 2, code: 'already_exists' }, { line: 3, code: 'already_exists' }] } });
    });

    it('a malformed file is refused as a whole; a teacher may not upload; a request not sent properly changes nothing', async () => {
      const before = await names();
      expect(await upload(principal, 'grade,section\n"Nursery,C\n')).toMatchObject({ status: 422, body: { problems: [{ line: 1, code: 'unclosed_quote' }] } });
      expect(await upload(principal, 'class,day\n5-A,MON\n')).toMatchObject({ status: 422, body: { problems: [{ line: 1, code: 'header' }] } });
      expect(await upload(tara, 'grade,section\nNursery,C\n')).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      expect(await call(principal, () => importClasses(new NextRequest('http://localhost/api/app/classes/import', { method: 'POST', body: JSON.stringify({ csv: 7 }) })))).toMatchObject({ status: 400 });
      expect(await call(principal, () => importClasses(new NextRequest('http://localhost/api/app/classes/import', { method: 'POST', body: JSON.stringify({ csv: 'x'.repeat(200_001) }) })))).toMatchObject({ status: 400 });
      expect(await names()).toEqual(before);
    });

    it('the download is every class in the class order, as the upload reads it, for the office only, audited', async () => {
      const got = await call(principal, () => exportClasses(new NextRequest('http://localhost/api/app/classes/export')));
      expect(got.status).toBe(200);
      expect(got.type).toContain('text/csv');
      const lines = got.text.replace(/^﻿/, '').trim().split('\r\n');
      expect(lines[0]).toBe('grade,section,class_teacher_email,name,students');
      expect(lines.slice(1, 4)).toEqual(['Nursery,A,Tara@School-A.example,Nursery-A,0', 'Nursery,B,,Nursery-B,0', 'LKG,A,,LKG-A,0']);
      expect(lines).toContain(',,,6B,0');
      expect(lines.at(-1)).toBe(',,,Toddlers,0');
      expect(lines).toHaveLength(1 + 45);
      // Given back as it is, every class is one the school already has: nothing is added, and the file says which.
      const back = await upload(principal, got.text);
      expect(back.status).toBe(422);
      expect(back.body.problems.filter((p: { code: string }) => p.code === 'already_exists')).toHaveLength(43);
      expect(back.body.problems.filter((p: { code: string }) => p.code === 'grade_missing')).toHaveLength(2);
      expect(await call(tara, () => exportClasses(new NextRequest('http://localhost/api/app/classes/export')))).toMatchObject({ status: 403 });
      expect((await audits('class.exported')).map((a: { after_state: unknown }) => a.after_state)).toEqual([{ rows: 45 }]);
    });
  });
});
