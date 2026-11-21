import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDb, type TestDb } from '../db/pglite-harness';
import type { Sql } from '@/lib/jobs/types';
import { importStudentRecords, readStudentCsv } from '@/lib/import/run-import';
import { basicRowErrors, readRowGuardian } from '@/lib/import/rules';
import { checkImportCsv } from '@/lib/free-tools/import-check';

// The student import adds and links guardians from the file's own guardian columns, on real Postgres (PGlite) with
// every migration: one guardian a phone number (siblings share one), linked to each student; consent is never
// recorded; a number a guardian already has is never linked by the import (C116); another school's guardian with the
// same number is never touched.

let db: TestDb;
const A = randomUUID();
const B = randomUUID();
const principal = randomUUID();
const cA = randomUUID();
const cB = randomUUID();
const onRecordA = randomUUID();
const otherSchoolParent = randomUUID();
const OTHER_SCHOOL_PHONE = '9811100001';
const ON_RECORD_PHONE = '9811100002';
const asOffice = <T>(fn: (q: Sql) => Promise<T>) => db.tenant({ role: 'principal' as any, sub: principal, schoolId: A }, fn);
const count = async (sql: string, params: unknown[] = []) => Number((await db.query(sql, params)).rows[0].n);
const rows = (csv: string) => readStudentCsv(csv).records;
const run = (csv: string, hash: string, opts: { preview?: boolean } = {}) =>
  asOffice((q) => importStudentRecords(q, { schoolId: A, sub: principal, role: 'principal' }, rows(csv), hash, 'kids.csv', { today: '2026-11-21', ...opts }));

beforeAll(async () => {
  db = await createTestDb();
  await db.platform(async (q) => {
    await q.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'A', 'IN-HR'), ($2, 'B', 'IN-DL')`, [A, B]);
    await q.query(`insert into classes (class_id, school_id, name) values ($1, $3, '5-A'), ($2, $4, '5-A')`, [cA, cB, A, B]);
    await q.query(
      `insert into parents (parent_id, school_id, name, phone, relation) values ($1, $3, 'On Record', $5, 'father'), ($2, $4, 'Elsewhere', $6, 'mother')`,
      [onRecordA, otherSchoolParent, A, B, ON_RECORD_PHONE, OTHER_SCHOOL_PHONE]
    );
  });
}, 60000);

describe('guardian columns: the shared row rules (importer and free checker)', () => {
  it('reads a guardian and checks phone, relation and email', () => {
    expect(readRowGuardian({ guardian_name: ' Sunita  Rao ', guardian_relation: 'Mother', guardian_phone: '+91 98111 22233', guardian_email: 'S@Example.in' })).toEqual({
      errors: [],
      guardian: { name: 'Sunita Rao', relation: 'mother', phone: '9811122233', email: 's@example.in' },
    });
    expect(basicRowErrors({ name: 'A', guardian_name: 'G', guardian_phone: '12345' })).toEqual(['guardian_phone must be a 10-digit Indian mobile number starting 6, 7, 8 or 9']);
    expect(basicRowErrors({ name: 'A', guardian_name: 'G', guardian_phone: '9811122233', guardian_relation: 'uncle' })).toEqual(['guardian_relation must be mother, father, guardian or other']);
    expect(basicRowErrors({ name: 'A', guardian_name: 'G', guardian_phone: '9811122233', guardian_email: 'nope' })).toEqual(['guardian_email is not an email address']);
  });
  it('a guardian column without a phone is an error; a phone or email alone is only a sibling hint', () => {
    expect(basicRowErrors({ name: 'A', guardian_name: 'G' })).toEqual(['a guardian needs a guardian_phone']);
    expect(basicRowErrors({ name: 'A', guardian_relation: 'father', guardian_phone: '9811122233' })).toEqual(['a guardian needs a guardian_name']);
    expect(readRowGuardian({ guardian_phone: '9811122233' })).toEqual({ errors: [], guardian: null });
    expect(readRowGuardian({ guardian_email: 'x@example.in' })).toEqual({ errors: [], guardian: null });
  });
  it('the free checker knows and checks the same columns', () => {
    const r = checkImportCsv('name,guardian_name,guardian_relation,guardian_phone,guardian_email\nAarav,Sunita,mother,9811122233,\nRiya,Ravi,uncle,123,\n', '2026-11-21');
    expect(r.unknownColumns).toEqual([]);
    expect(r.okRows).toBe(1);
    expect(r.rowIssues[0].errors).toEqual(['guardian_phone must be a 10-digit Indian mobile number starting 6, 7, 8 or 9', 'guardian_relation must be mother, father, guardian or other']);
  });
});

describe('the import adds and links guardians', () => {
  it('a check counts what would be added and writes nothing', async () => {
    const before = await count(`select (select count(*) from parents) + (select count(*) from parent_student_map) + (select count(*) from students) n`);
    const r = await run('name,class_name,guardian_name,guardian_relation,guardian_phone\nAsha Rao,5-A,Sunita Rao,mother,9800000101\nDev Rao,5-A,Sunita Rao,mother,98000 00101\n', 'h-check', { preview: true });
    expect(r.guardians).toEqual({ created: 1, linked: 2, onRecord: 0 });
    expect(await count(`select (select count(*) from parents) + (select count(*) from parent_student_map) + (select count(*) from students) n`)).toBe(before);
  });

  it('creates one guardian a phone, links siblings to it, and records no consent', async () => {
    // This small database has no consent ledger at all: any consent write by the import would fail the import.
    expect((await db.query(`select to_regclass('public.consent_ledger') as t`)).rows[0].t).toBeNull();
    const csv = [
      'name,class_name,guardian_name,guardian_relation,guardian_phone,guardian_email',
      'Asha Rao,5-A,Sunita Rao,Mother,9800000101,sunita@example.in',
      'Dev Rao,5-A,Sunita Rao,mother,+91 98000 00101,',
      'Ira Sen,5-A,Amit Sen,father,9800000102,',
      'No Guardian,5-A,,,,',
    ].join('\n');
    const r = await run(csv, 'h-real');
    expect(r).toMatchObject({ refused: false, importedCount: 4, guardians: { created: 2, linked: 3, onRecord: 0 } });
    const g = await db.query(`select p.name, p.phone, p.email, p.relation, array_agg(s.name order by s.name) kids from parents p join parent_student_map m on m.parent_id = p.parent_id join students s on s.student_id = m.student_id where p.school_id = $1 and p.parent_id <> $2 group by p.parent_id order by p.name`, [A, onRecordA]);
    expect(g.rows).toEqual([
      { name: 'Amit Sen', phone: '9800000102', email: null, relation: 'father', kids: ['Ira Sen'] },
      { name: 'Sunita Rao', phone: '9800000101', email: 'sunita@example.in', relation: 'mother', kids: ['Asha Rao', 'Dev Rao'] },
    ]);
    expect(await count(`select count(*) n from students s where s.school_id = $1 and s.name = 'No Guardian' and not exists (select 1 from parent_student_map m where m.student_id = s.student_id)`, [A])).toBe(1);
    // Consent stays the office's, by hand: the import succeeded with no ledger to write to, every student still waiting.
    expect(await count(`select count(*) n from students where school_id = $1 and status <> 'pending_consent'`, [A])).toBe(0);
    const audit = await db.query(`select actor_user_id, after_state from audit_log where school_id = $1 and event_action = 'guardian.imported'`, [A]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_user_id).toBe(principal);
    expect(audit.rows[0].after_state).toMatchObject({ links: 3, consent_recorded: false });
    expect(JSON.stringify(audit.rows[0].after_state)).not.toMatch(/9800000101|Sunita/);
  });

  it('a later file with the same number never makes a second guardian and never links by the import (suggested instead)', async () => {
    const r = await run('name,class_name,guardian_name,guardian_phone\nNew Sibling,5-A,Sunita Rao,9800000101\nOn Record Kid,5-A,X,' + ON_RECORD_PHONE + '\n', 'h-later');
    expect(r.guardians).toEqual({ created: 0, linked: 0, onRecord: 2 });
    expect(await count(`select count(*) n from parents where school_id = $1 and phone = '9800000101'`, [A])).toBe(1);
    // A guardian on record with children is suggested (Link button); every such row is counted in `onRecord`.
    expect(r.siblingSuggestions.map((s) => s.name)).toEqual(['New Sibling']);
    expect(await count(`select count(*) n from parent_student_map m join students s on s.student_id = m.student_id where s.name in ('New Sibling', 'On Record Kid')`)).toBe(0);
  });

  it('a number another school’s guardian has never links there: this school gets its own guardian', async () => {
    const r = await run(`name,class_name,guardian_name,guardian_phone\nTara Das,5-A,Mina Das,${OTHER_SCHOOL_PHONE}\n`, 'h-iso');
    expect(r.guardians).toEqual({ created: 1, linked: 1, onRecord: 0 });
    expect(await count(`select count(*) n from parent_student_map where parent_id = $1`, [otherSchoolParent])).toBe(0);
    expect(await count(`select count(*) n from parents where school_id = $1 and phone = $2`, [A, OTHER_SCHOOL_PHONE])).toBe(1);
    expect(await count(`select count(*) n from parents where school_id = $1`, [B])).toBe(1);
  });

  it('a bad phone or relation refuses the file and writes nothing', async () => {
    const before = await count(`select (select count(*) from parents) + (select count(*) from students) n`);
    const r = await run('name,class_name,guardian_name,guardian_relation,guardian_phone\nOk Kid,5-A,Ok Parent,father,9800000201\nBad Kid,5-A,Bad Parent,aunt,12345\n', 'h-bad');
    expect(r).toMatchObject({ refused: true, importedCount: 0, guardians: { created: 0, linked: 0, onRecord: 0 } });
    expect(r.errors).toEqual([{ row: 2, name: 'Bad Kid', admissionNo: null, errors: ['guardian_phone must be a 10-digit Indian mobile number starting 6, 7, 8 or 9', 'guardian_relation must be mother, father, guardian or other'] }]);
    expect(await count(`select (select count(*) from parents) + (select count(*) from students) n`)).toBe(before);
  });

  it('a file without guardian columns imports as before: students only', async () => {
    const before = await count(`select (select count(*) from parents) + (select count(*) from parent_student_map) + (select count(*) from audit_log where event_action like 'guardian.%') n`);
    const r = await run('name,class_name,dob\nPlain One,5-A,2015-04-23\nPlain Two,5-A,\n', 'h-plain');
    expect(r).toMatchObject({ refused: false, importedCount: 2, guardians: { created: 0, linked: 0, onRecord: 0 } });
    expect(await count(`select (select count(*) from parents) + (select count(*) from parent_student_map) + (select count(*) from audit_log where event_action like 'guardian.%') n`)).toBe(before);
  });
});
