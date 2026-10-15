import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDb, type TestDb } from '../db/pglite-harness';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import type { Sql } from '@/lib/jobs/types';
import { confirmBulk, previewBulk, undoBulk } from '@/lib/frameworks/bulk-engine';
import { compileListQuery, runList } from '@/lib/frameworks/filter-engine';
import { listSpec, type StudentListRow } from '@/lib/frameworks/lists';
import { saveSettings } from '@/lib/frameworks/settings-store';
import { settingsSchemaFor } from '@/lib/frameworks/settings-schemas';
import { importStudentRecords } from '@/lib/import/run-import';
import {
  confirmSuggestion,
  getFamilyView,
  guardianMerges,
  linkSiblings,
  mergeGuardians,
  setStudentFamily,
  suggestSiblingsFor,
} from '@/lib/families/families';

// Sibling mapping (C116) on real Postgres (PGlite), every migration applied
// verbatim: detection only suggests, the office links, merges lose nothing,
// teachers see families only through their own classes, sibling order is
// computed from dates of birth.

let db: TestDb;
const A = randomUUID();
const B = randomUUID();
const principal = randomUUID();
const teacher = randomUUID();
const c1 = randomUUID(); // the teacher's class
const c2 = randomUUID();
const cB = randomUUID();
const office = { schoolId: A, userId: principal, role: 'principal' as const };
const claims = (role: string, user: string, school = A) => ({ role: role as any, sub: user, schoolId: school });
const asOffice = <T>(fn: (q: Sql) => Promise<T>) => db.tenant(claims('principal', principal), fn);
const asTeacher = <T>(fn: (q: Sql) => Promise<T>) => db.tenant(claims('teacher', teacher), fn);
const year = new Date().getUTCFullYear();

// Students: Riya (c1, 2014), Arjun (c2, 2011), Kabir (c2, 2016, transferred), Meera (c1, no dob).
const st = { riya: randomUUID(), arjun: randomUUID(), kabir: randomUUID(), meera: randomUUID(), neel: randomUUID(), other: randomUUID() };
const par = { father: randomUUID(), fatherDup: randomUUID(), mother: randomUUID(), otherSchool: randomUUID() };
const count = async (sql: string, params: unknown[] = []) => Number((await db.query(sql, params)).rows[0].n);

beforeAll(async () => {
  db = await createTestDb();
  await db.platform(async (q) => {
    await q.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'A', 'IN-HR'), ($2, 'B', 'IN-DL')`, [A, B]);
    await q.query(`insert into classes (class_id, school_id, name) values ($1, $4, '5-A'), ($2, $4, '8-B'), ($3, $5, '5-A')`, [c1, c2, cB, A, B]);
    const t = randomUUID();
    await q.query(`insert into teachers (teacher_id, school_id, user_id, name) values ($1, $2, $3, 'T')`, [t, A, teacher]);
    await q.query(`insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ($1, $2, $3, $4)`, [A, t, randomUUID(), c1]);
    await q.query(
      `insert into students (student_id, school_id, name, class_id, dob, status) values
         ($1, $7, 'Riya Mehta', $8, '2014-05-01', 'active'),
         ($2, $7, 'Arjun Mehta', $9, '2011-02-10', 'active'),
         ($3, $7, 'Kabir Mehta', $9, '2016-07-07', 'active'),
         ($4, $7, 'Meera Mehta', $8, null, 'active'),
         ($5, $7, 'Neel Shah', $8, '2014-01-01', 'active'),
         ($6, $10, 'Other School Kid', $11, '2014-01-01', 'active')`,
      [st.riya, st.arjun, st.kabir, st.meera, st.neel, st.other, A, c1, c2, B, cB]
    );
    await q.query(
      `insert into parents (parent_id, school_id, name, phone, email, relation) values
         ($1, $5, 'Rakesh Mehta', '+91 98765 43210', 'Rakesh@Example.in', 'Father'),
         ($2, $5, 'R. Mehta', '098765-43210', null, 'Father'),
         ($3, $5, 'Sunita Mehta', '9811122233', 'sunita@example.in', 'Mother'),
         ($4, $6, 'Same Phone Elsewhere', '9876543210', null, 'Father')`,
      [par.father, par.fatherDup, par.mother, par.otherSchool, A, B]
    );
    // Arjun is on record with his father; the father's duplicate is linked to Kabir.
    await q.query(
      `insert into parent_student_map (school_id, parent_id, student_id) values ($1, $2, $3), ($1, $4, $5), ($6, $7, $8)`,
      [A, par.father, st.arjun, par.fatherDup, st.kabir, B, par.otherSchool, st.other]
    );
  });
}, 60000);

describe('detection only suggests', () => {
  it('matches the last ten digits of the phone, or the email, in this school only, and writes nothing', async () => {
    const before = await count(`select (select count(*) from parent_student_map) + (select count(*) from families) + (select count(*) from students where family_id is not null) n`);
    const found = await asOffice((q) =>
      suggestSiblingsFor(q, A, [
        { key: 'phone', phone: '9876543210', email: null },
        { key: 'email', phone: null, email: 'rakesh@example.in' },
        { key: 'none', phone: '9000000000', email: null },
      ])
    );
    expect(found.get('phone')!.map((s) => [s.guardianName, s.matchedOn, s.phoneLast4, s.students.map((x) => x.displayName)])).toEqual([
      ['R. Mehta', 'phone', '3210', ['Kabir Mehta']],
      ['Rakesh Mehta', 'phone', '3210', ['Arjun Mehta']],
    ]);
    expect(found.get('email')!.map((s) => [s.guardianName, s.matchedOn, s.phoneLast4])).toEqual([['Rakesh Mehta', 'email', null]]);
    expect(found.has('none')).toBe(false);
    const after = await count(`select (select count(*) from parent_student_map) + (select count(*) from families) + (select count(*) from students where family_id is not null) n`);
    expect(after).toBe(before);
  });

  it('the CSV preview suggests siblings and writes nothing; the import writes students but never links them', async () => {
    const records = [
      { name: 'Tara Mehta', class_name: '5-A', dob: '2017-03-03', guardian_phone: '+91-98765-43210' },
      { name: 'No Match', class_name: '5-A', guardian_email: 'nobody@example.in' },
      { name: '', class_name: '5-A' },
    ];
    const studentsBefore = await count(`select count(*) n from students`);
    const preview = await asOffice((q) => importStudentRecords(q, { schoolId: A, sub: principal }, records, 'hash-1', 'kids.csv', { preview: true }));
    expect(preview).toMatchObject({ preview: true, importedCount: 0, skippedCount: 1 });
    expect(preview.siblingSuggestions).toHaveLength(1);
    expect(preview.siblingSuggestions[0]).toMatchObject({ row: 1, studentId: null, name: 'Tara Mehta' });
    expect(await count(`select count(*) n from students`)).toBe(studentsBefore);
    expect(await count(`select count(*) n from csv_imports`)).toBe(0);

    // All or nothing (C235-A): with the nameless row the import writes nothing; without it, both land.
    const refused = await asOffice((q) => importStudentRecords(q, { schoolId: A, sub: principal }, records, 'hash-1', 'kids.csv'));
    expect(refused).toMatchObject({ preview: false, refused: true, importedCount: 0, skippedCount: 1, errors: [{ row: 3, errors: ['name is required'] }] });
    expect(refused.siblingSuggestions[0]).toMatchObject({ row: 1, studentId: null });
    expect(await count(`select count(*) n from students`)).toBe(studentsBefore);
    expect(await count(`select count(*) n from csv_imports`)).toBe(0);
    const real = await asOffice((q) => importStudentRecords(q, { schoolId: A, sub: principal }, records.slice(0, 2), 'hash-2', 'kids.csv'));
    expect(real).toMatchObject({ preview: false, refused: false, importedCount: 2 });
    const tara = real.siblingSuggestions[0].studentId!;
    expect(await count(`select count(*) n from students where student_id = $1 and family_id is null`, [tara])).toBe(1);
    expect(await count(`select count(*) n from parent_student_map where student_id = $1`, [tara])).toBe(0);
  });
});

describe('the office links', () => {
  it('confirming a suggestion links the guardian and makes a numbered family of their children', async () => {
    const r = await asOffice((q) => confirmSuggestion(q, office, st.riya, par.father));
    expect(r).toEqual({ ok: true, family: { familyId: expect.any(String), familyCode: `FAM-${year}-0001` } });
    const fam = (r as any).family.familyId;
    expect(await count(`select count(*) n from students where family_id = $1`, [fam])).toBe(2); // Riya and Arjun
    expect(await count(`select count(*) n from parent_student_map where parent_id = $1 and student_id = $2`, [par.father, st.riya])).toBe(1);
    const audit = await db.query(`select event_action from audit_log where school_id = $1 and event_action like 'family.%' order by audit_id`, [A]);
    expect(audit.rows.map((x) => x.event_action)).toEqual(['family.suggestion_confirmed', 'family.linked']);
  });

  it('links, refuses students of two different families, moves and removes; the family stays when one leaves', async () => {
    const fam = (await db.query(`select family_id from students where student_id = $1`, [st.riya])).rows[0].family_id;
    const other = await asOffice((q) => linkSiblings(q, office, [st.neel, st.meera]));
    if (!other.ok) throw new Error(other.error);
    expect(other.familyCode).toBe(`FAM-${year}-0002`);
    expect(await asOffice((q) => linkSiblings(q, office, [st.riya, st.neel]))).toMatchObject({ ok: false, status: 409 });
    expect(await asOffice((q) => setStudentFamily(q, office, st.meera, fam))).toMatchObject({ ok: true, to: fam });
    expect(await asOffice((q) => setStudentFamily(q, office, st.neel, null))).toMatchObject({ ok: true, to: null });
    // Kabir joins, then transfers out: still in the family.
    await asOffice((q) => linkSiblings(q, office, [st.riya, st.kabir]));
    await db.platform((q) => q.query(`update students set status = 'transferred' where student_id = $1`, [st.kabir]));
    expect(await count(`select count(*) n from students where family_id = $1`, [fam])).toBe(4);
  });

  it('a refused confirm writes nothing (code-review finding)', async () => {
    // Two new students already in their own family; Rakesh's children are in another one.
    const [x, y] = [randomUUID(), randomUUID()];
    await db.platform((q) => q.query(`insert into students (student_id, school_id, name, class_id, status) values ($1, $3, 'Cousin One', $4, 'active'), ($2, $3, 'Cousin Two', $4, 'active')`, [x, y, A, c2]));
    const own = await asOffice((q) => linkSiblings(q, office, [x, y]));
    expect(own.ok).toBe(true);
    const r = await asOffice((q) => confirmSuggestion(q, office, x, par.father));
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(await count(`select count(*) n from parent_student_map where student_id = $1`, [x])).toBe(0);
    // Leave no trace for the later tests: these two leave their family.
    await asOffice((q) => setStudentFamily(q, office, x, null));
    await asOffice((q) => setStudentFamily(q, office, y, null));
  });

  it('the family number follows the Students setting', async () => {
    await asOffice((q) => saveSettings(q, office, settingsSchemaFor('students')!, { moduleId: 'students', baseRevision: 0, set: { family_code_format: 'F/{SEQ:3}' } }));
    const noMatch = (await db.query(`select student_id from students where name = 'No Match'`)).rows[0].student_id;
    const r = await asOffice((q) => linkSiblings(q, office, [st.neel, noMatch]));
    expect(r).toMatchObject({ ok: true, familyCode: 'F/001' });
  });
});

describe('sibling order and the family view', () => {
  it('orders the family’s active students by date of birth, unknown last; the view shows children and guardians', async () => {
    const view = (await asOffice((q) => getFamilyView(q, A, st.riya, 'principal')))!;
    expect(view.family?.familyCode).toBe(`FAM-${year}-0001`);
    expect(view.members.map((m) => [m.displayName, m.siblingOrder, m.isSelf])).toEqual([
      ['Riya Mehta', 2, true],
      ['Arjun Mehta', 1, false],
      ['Meera Mehta', 3, false],
      ['Kabir Mehta', null, false], // transferred: not counted
    ]);
    expect(view.guardians.map((g) => [g.name, g.phoneLast4, g.childIds.length])).toEqual([
      ['R. Mehta', '3210', 1],
      ['Rakesh Mehta', '3210', 2],
    ]);
    expect(view.canManage).toBe(true);
  });

  it('the students list filters on has_siblings, family_size and sibling_order with the same rule', async () => {
    const spec = listSpec('students')!;
    const run = (query: unknown) =>
      asOffice(async (q) => {
        const c = compileListQuery(spec, query, { schoolId: A, customFields: [] });
        if (!c.ok) throw new Error(JSON.stringify(c.errors));
        return runList<StudentListRow & Record<string, unknown>>(q, spec, c.compiled);
      });
    const eldest = await run({ filter: { combinator: 'and', conditions: [{ field: 'sibling_order', op: 'eq', value: 1 }, { field: 'family_size', op: 'eq', value: 3 }] } });
    expect(eldest.rows.map((r) => r.name)).toEqual(['Arjun Mehta']);
    const withSiblings = await run({ filter: { combinator: 'and', conditions: [{ field: 'has_siblings', op: 'eq', value: true }] }, sort: [{ field: 'sibling_order', dir: 'asc' }, { field: 'name', dir: 'asc' }] });
    // Siblings count among ACTIVE students: Neel's only sibling (No Match) is
    // still pending consent, so Neel has none; students without an order
    // (transferred Kabir, pending No Match) sort last.
    expect(withSiblings.rows.map((r) => r.name)).toEqual(['Arjun Mehta', 'Riya Mehta', 'Meera Mehta', 'Kabir Mehta', 'No Match']);
  });
});

describe('teachers see families only through their own classes', () => {
  it('a teacher sees the family of an own-class student with only own-class siblings, no order, and cannot change it', async () => {
    const view = (await asTeacher((q) => getFamilyView(q, A, st.riya, 'teacher')))!;
    expect(view.members.map((m) => [m.displayName, m.siblingOrder])).toEqual([
      ['Riya Mehta', null],
      ['Meera Mehta', null],
    ]);
    expect(view.guardians.map((g) => g.name)).toEqual(['Rakesh Mehta']); // Riya's guardian; not Kabir's
    expect(view.canManage).toBe(false);
    expect(await asTeacher((q) => getFamilyView(q, A, st.arjun, 'teacher'))).toBeNull(); // another class
    const fams = await asTeacher((q) => q.query(`select family_code from families order by family_code`));
    expect(fams.rows.map((r) => r.family_code).sort()).toEqual(['F/001', `FAM-${year}-0001`]); // families with a student in class 5-A only
    await expect(asTeacher((q) => q.query(`insert into families (school_id, family_code, created_by) values ($1, 'X', $2)`, [A, teacher]))).rejects.toThrow(/row-level security/);
    await expect(asTeacher((q) => q.query(`update families set family_code = 'X'`))).rejects.toThrow(/row-level security/);
  });

  it('a teacher cannot change a student’s family or a guardian’s merge mark, even in their own class', async () => {
    await expect(asTeacher((q) => q.query(`update students set family_id = null where student_id = $1`, [st.riya]))).rejects.toThrow(/principal or school admin/);
    await expect(asTeacher((q) => q.query(`update parents set merged_into = $1, merged_at = now() where parent_id = $2`, [par.mother, par.father]))).rejects.toThrow(
      /principal or school admin|row-level security/
    );
    // Other student fields stay writable for the flows that need them (document review).
    const ok = await asTeacher((q) => q.query(`update students set dob = dob where student_id = $1`, [st.riya]));
    expect(ok.rowCount).toBe(1);
  });

  it('another school sees none of it', async () => {
    const r = await db.tenant(claims('principal', randomUUID(), B), (q) => q.query(`select (select count(*)::int from families) f, (select count(*)::int from guardian_merges) g`));
    expect(r.rows[0]).toEqual({ f: 0, g: 0 });
  });
});

describe('guardian merge', () => {
  it('re-points links, drops and records a duplicate link, keeps the merged record, and is refused twice', async () => {
    // Both father records are now linked to Kabir: link the main one too, so one link is a duplicate.
    await asOffice((q) => q.query(`insert into parent_student_map (school_id, parent_id, student_id) values ($1, $2, $3)`, [A, par.father, st.kabir]));
    await asOffice((q) => q.query(`insert into parent_student_map (school_id, parent_id, student_id) values ($1, $2, $3)`, [A, par.fatherDup, st.meera]));
    const r = await asOffice((q) => mergeGuardians(q, office, par.father, par.fatherDup));
    expect(r).toMatchObject({ ok: true, linksMoved: 1, linksDropped: 1 });
    expect(await count(`select count(*) n from parent_student_map where parent_id = $1`, [par.fatherDup])).toBe(0);
    expect((await db.query(`select student_id from parent_student_map where parent_id = $1 order by student_id`, [par.father])).rows.map((x) => x.student_id).sort()).toEqual(
      [st.arjun, st.riya, st.kabir, st.meera].sort()
    );
    const dup = (await db.query(`select name, phone, merged_into from parents where parent_id = $1`, [par.fatherDup])).rows[0];
    expect(dup).toEqual({ name: 'R. Mehta', phone: '098765-43210', merged_into: par.father }); // kept, marked
    const history = await asOffice((q) => guardianMerges(q, A, par.father));
    expect(history).toEqual([expect.objectContaining({ mergedParentId: par.fatherDup, merged: { name: 'R. Mehta', relation: 'Father', phoneLast4: '3210', hasEmail: false }, linksMoved: 1, linksDropped: 1 })]);
    expect(await asOffice((q) => mergeGuardians(q, office, par.father, par.fatherDup))).toMatchObject({ ok: false, status: 409 });
    // A merged record is never suggested again.
    const found = await asOffice((q) => suggestSiblingsFor(q, A, [{ key: 'p', phone: '9876543210', email: null }]));
    expect(found.get('p')!.map((s) => s.guardianName)).toEqual(['Rakesh Mehta']);
  });

  it('merges are office-only and append-only', async () => {
    await expect(
      asTeacher((q) => q.query(`insert into guardian_merges (school_id, kept_parent_id, merged_parent_id, merged_by) values ($1, $2, $3, $4)`, [A, par.father, par.mother, teacher]))
    ).rejects.toThrow(/row-level security/);
    for (const sql of [`update guardian_merges set links_moved = '{}'`, `delete from guardian_merges`]) {
      await expect(asOffice((q) => q.query(sql))).rejects.toThrow(/permission denied/);
    }
  });
});

describe('bulk: link as siblings', () => {
  const queue = () => createPgJobQueue((fn) => db.platform(fn));

  it('previews, links, and undoes; one student alone is refused', async () => {
    const one = await asOffice((q) => previewBulk(q, office, { actionId: 'students.link_siblings', selection: { mode: 'ids', ids: [st.neel] } }));
    expect(one).toMatchObject({ ok: false, status: 400 });
    const [x, y] = [randomUUID(), randomUUID()];
    await db.platform((q) => q.query(`insert into students (student_id, school_id, name, class_id, status) values ($1, $3, 'Twin One', $4, 'active'), ($2, $3, 'Twin Two', $4, 'active')`, [x, y, A, c2]));
    const p = await asOffice((q) => previewBulk(q, office, { actionId: 'students.link_siblings', selection: { mode: 'ids', ids: [x, y] } }));
    if (!p.ok) throw new Error(p.error);
    expect(p.preview.firstRows.map((r) => r.change)).toEqual(['joins a new family', 'joins a new family']);
    const done = await asOffice((q) => confirmBulk(q, office, p.preview.previewId, queue()));
    expect(done).toMatchObject({ ok: true, run: { status: 'succeeded', done: 2 } });
    expect(await count(`select count(distinct family_id) n from students where student_id in ($1, $2) and family_id is not null`, [x, y])).toBe(1);
    const undone = await asOffice((q) => undoBulk(q, office, p.preview.previewId));
    expect(undone).toMatchObject({ ok: true, restored: 2 });
    expect(await count(`select count(*) n from students where student_id in ($1, $2) and family_id is null`, [x, y])).toBe(2);
  });
});
