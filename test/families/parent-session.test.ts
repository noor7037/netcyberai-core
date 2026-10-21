import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { loadFamilyHome } from '@/lib/parent-home/home';

// Parent logins (C230-D): a parent's session sees its own children only, writes nothing, and is refused by every
// other table; staff sessions are untouched. Run as app_user with the settings withTenantContext sets.

const A = 'd1000000-0000-4000-8000-00000000000a';
const B = 'd1000000-0000-4000-8000-00000000000b';
const P1 = 'd1000000-0000-4000-8000-0000000000e1'; // guardian of S1 and S3 in A
const P2 = 'd1000000-0000-4000-8000-0000000000e2'; // guardian of S2 in A
const S1 = 'd1000000-0000-4000-8000-0000000005a1';
const S2 = 'd1000000-0000-4000-8000-0000000005a2';
const S3 = 'd1000000-0000-4000-8000-0000000005a3'; // P1's second child, no consent recorded
const SB = 'd1000000-0000-4000-8000-0000000005b1';
const C5A = 'd1000000-0000-4000-8000-0000000000c5';
const PRINCIPAL = 'd1000000-0000-4000-8000-0000000000a1';
const TODAY = '2026-10-15';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tx = (gucs: Record<string, string>, fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query(`set local role app_user`);
    for (const [k, v] of Object.entries(gucs)) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c);
  });
const asParent = (parentId: string, school = A) => ({ 'app.current_tenant_id': school, 'app.current_role': 'parent', 'app.current_user_id': parentId });
const asPrincipal = { 'app.current_tenant_id': A, 'app.current_role': 'principal', 'app.current_user_id': PRINCIPAL };
const ids = async (gucs: Record<string, string>, sql: string, col: string): Promise<string[]> => (await tx(gucs, (c) => c.query(sql))).rows.map((r: Record<string, string>) => r[col]).sort();

describe('a parent’s session on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-DL', false);
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true),
        ('${P1}', '${A}', 'p1@login.netcyberai.com', 'parent', 'Rajesh Parent', true),
        ('${P2}', '${A}', 'p2@login.netcyberai.com', 'parent', 'Sunita Parent', true);
      insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${P1}', '${A}', 'parent', true), ('${P2}', '${A}', 'parent', true);
      insert into classes (class_id, school_id, name, grade, section) values ('${C5A}', '${A}', '5-A', '5', 'A');
      insert into students (student_id, school_id, admission_no, name, class_id, status) values
        ('${S1}', '${A}', 'A-1', 'Aarav Child', '${C5A}', 'active'), ('${S2}', '${A}', 'A-2', 'Bela Child', '${C5A}', 'active'),
        ('${S3}', '${A}', 'A-3', 'Chirag Child', '${C5A}', 'active'), ('${SB}', '${B}', 'B-1', 'Other School Child', null, 'active');
      insert into parents (parent_id, school_id, name, phone, relation) values
        ('${P1}', '${A}', 'Rajesh Parent', '9800000001', 'Father'), ('${P2}', '${A}', 'Sunita Parent', '9800000002', 'Mother');
      insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}'), ('${A}', '${P1}', '${S3}'), ('${A}', '${P2}', '${S2}');
      insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values
        ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S2}', 'core_records', true, 'school_attested', 'v1');
      insert into attendance (school_id, student_id, class_id, date, status, marked_by) values
        ('${A}', '${S1}', '${C5A}', '${TODAY}', 'present', '${PRINCIPAL}'), ('${A}', '${S1}', '${C5A}', '2026-10-14', 'absent', '${PRINCIPAL}'),
        ('${A}', '${S2}', '${C5A}', '${TODAY}', 'late', '${PRINCIPAL}');
      insert into fees_ledger (school_id, student_id, amount_minor, due_date, status) values
        ('${A}', '${S1}', 450000, '2026-10-01', 'overdue'), ('${A}', '${S1}', 300000, '2026-11-10', 'pending'), ('${A}', '${S1}', 100000, '2026-09-01', 'paid'),
        ('${A}', '${S2}', 999900, '2026-10-01', 'overdue');
      insert into teachers (school_id, user_id, name) values ('${A}', '${PRINCIPAL}', 'Priya Principal');
    `);
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('sees only its own children, their attendance and their fees', async () => {
    expect(await ids(asParent(P1), `select student_id from students`, 'student_id')).toEqual([S1, S3].sort());
    expect(await ids(asParent(P1), `select distinct student_id from attendance`, 'student_id')).toEqual([S1]);
    expect(await ids(asParent(P1), `select distinct student_id from fees_ledger`, 'student_id')).toEqual([S1]);
    expect(await ids(asParent(P2), `select student_id from students`, 'student_id')).toEqual([S2]);
  });

  it('sees only its own guardian row, links, account and consent rows', async () => {
    expect(await ids(asParent(P1), `select parent_id from parents`, 'parent_id')).toEqual([P1]);
    expect(await ids(asParent(P1), `select distinct parent_id from parent_student_map`, 'parent_id')).toEqual([P1]);
    expect(await ids(asParent(P1), `select user_id from users`, 'user_id')).toEqual([P1]);
    expect(await ids(asParent(P1), `select user_id from memberships`, 'user_id')).toEqual([P1]);
    expect(await ids(asParent(P1), `select distinct student_id from consent_ledger`, 'student_id')).toEqual([S1]);
  });

  it('is refused by every other table, and nothing of another school is seen', async () => {
    expect((await tx(asParent(P1), (c) => c.query(`select 1 from teachers`))).rows).toEqual([]);
    expect((await tx(asParent(P1), (c) => c.query(`select 1 from audit_log`))).rows).toEqual([]);
    expect(await ids(asParent(P1, B), `select student_id from students`, 'student_id')).toEqual([]);
  });

  it('writes nothing', async () => {
    expect((await tx(asParent(P1), (c) => c.query(`update students set name = 'Changed' where student_id = $1`, [S1]))).rowCount).toBe(0);
    await expect(tx(asParent(P1), (c) => c.query(`insert into attendance (school_id, student_id, class_id, date, status) values ($1, $2, $3, '2026-10-13', 'present')`, [A, S1, C5A]))).rejects.toThrow();
    await expect(tx(asParent(P1), (c) => c.query(`insert into teachers (school_id, name) values ($1, 'Someone')`, [A]))).rejects.toThrow();
  });

  it('leaves staff sessions as they were', async () => {
    expect(await ids(asPrincipal, `select student_id from students`, 'student_id')).toEqual([S1, S2, S3].sort());
    expect((await tx(asPrincipal, (c) => c.query(`select 1 from teachers`))).rows.length).toBe(1);
  });

  it('builds the family home: the child with consent, today, the days, and what is owed', async () => {
    const home = await tx(asParent(P1), (c) => loadFamilyHome(c, { parentId: P1, schoolId: A }, TODAY));
    expect(home.schoolName).toBe('School A');
    expect(home.guardianName).toBe('Rajesh Parent');
    expect(home.awaitingConsent).toBe(1);
    expect(home.children).toHaveLength(1);
    const child = home.children[0];
    expect(child).toMatchObject({ studentId: S1, name: 'Aarav Child', className: '5-A', today: 'present', presentDays: 1, markedDays: 2, dueMinor: 750000, overdueMinor: 450000, nextDue: '2026-11-10' });
    expect(child.days.map((d: { date: string }) => d.date)).toEqual(['2026-10-14', TODAY]);
  });

  it('covers every table with row level security, so a new table cannot be left open to a parent', async () => {
    const open = (
      await db.pg.query(`
        select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
           and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                            and (p.policyname = c.relname || '_no_parent' or p.policyname = c.relname || '_parent_no_insert'))
         order by 1`)
    ).rows.map((r: { relname: string }) => r.relname);
    expect(open, 'add each to the parent rules (C230-D): refused, or read only with its own scope').toEqual([]);
  });
});
