import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDb, type TestDb } from '../db/pglite-harness';
import { changeModuleEntitlement, changeSchoolAccess, checkModuleAccess, loadEntitlements } from '@/lib/frameworks/entitlements';
import { createDefinition, readValues, writeValues } from '@/lib/frameworks/custom-fields';
import { readSettings, saveSettings, settingsHistory } from '@/lib/frameworks/settings-store';
import { settingsSchemaFor } from '@/lib/frameworks/settings-schemas';
import { parseStudentSearch, searchStudents } from '@/lib/frameworks/student-search';

// P1-b frameworks on real Postgres (PGlite) with the migration applied
// verbatim (C112): Student 360 search and the teacher own-classes rule,
// entitlements, settings and custom fields, and their RLS.

let db: TestDb;
const A = randomUUID();
const B = randomUUID();
const founder = randomUUID();
const principal = randomUUID();
const teacher = randomUUID();
const coordinator = randomUUID();
const classA1 = randomUUID();
const classA2 = randomUUID();
const classB1 = randomUUID();
const ids = { aarav: randomUUID(), pending: randomUUID(), anaya: randomUUID(), aaravB: randomUUID() };

const as = (role: string, user: string, school = A) => ({ role: role as any, sub: user, schoolId: school });
const search = (role: string, user: string, q: string, school = A) =>
  db.tenant(as(role, user, school), (q2) => searchStudents(q2, school, parseStudentSearch(q, undefined)!));
const names = (rows: { displayName: string }[]) => rows.map((r) => r.displayName);

beforeAll(async () => {
  db = await createTestDb();
  await db.platform(async (q) => {
    await q.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'A', 'IN-HR'), ($2, 'B', 'IN-DL')`, [A, B]);
    await q.query(
      `insert into classes (class_id, school_id, name, section) values ($1, $4, '8-A', 'A'), ($2, $4, '8-B', 'B'), ($3, $5, '8-A', 'A')`,
      [classA1, classA2, classB1, A, B]
    );
    const teacherRow = randomUUID();
    await q.query(`insert into teachers (teacher_id, school_id, user_id, name) values ($1, $2, $3, 'T')`, [teacherRow, A, teacher]);
    await q.query(`insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ($1, $2, $3, $4)`, [A, teacherRow, randomUUID(), classA1]);
    await q.query(
      `insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
         ($1, $5, 'ADM-001', 'Aarav Sharma', $6, '7', 'active'),
         ($2, $5, 'ADM-0011', 'Pending Kid', $6, '8', 'pending_consent'),
         ($3, $5, 'ADM-002', 'Anaya Verma', $7, '1', 'active'),
         ($4, $8, 'ADM-001', 'Aarav Singh', $9, '7', 'active')`,
      [ids.aarav, ids.pending, ids.anaya, ids.aaravB, A, classA1, classA2, B, classB1]
    );
    const parent = randomUUID();
    await q.query(`insert into parents (parent_id, school_id, name, phone) values ($1, $2, 'Guardian', '+91 98765 43210')`, [parent, A]);
    await q.query(`insert into parent_student_map (school_id, parent_id, student_id) values ($1, $2, $3)`, [A, parent, ids.anaya]);
  });
}, 60000);

describe('Student 360 search', () => {
  it('finds by name, admission number and guardian phone, only in the own school', async () => {
    expect(names(await search('principal', principal, 'aar'))).toEqual(['Aarav Sharma']);
    const byAdm = await search('principal', principal, 'ADM-001');
    expect(byAdm.map((r) => [r.displayName, r.matchedOn])).toEqual([
      ['Aarav Sharma', 'admission_no'], // exact before prefix
      ['Pending Kid', 'admission_no'],
    ]);
    const byPhone = await search('principal', principal, '98765 43210');
    expect(byPhone).toEqual([expect.objectContaining({ displayName: 'Anaya Verma', matchedOn: 'guardian_phone', guardianPhoneLast4: '3210', className: '8-B' })]);
    expect(names(await search('principal', principal, 'aarav', B))).toEqual(['Aarav Singh']);
  });

  it('never shows a phone unless the phone matched, and treats % and _ literally', async () => {
    const r = await search('principal', principal, 'anaya');
    expect(r[0].guardianPhoneLast4).toBeUndefined();
    expect(await search('principal', principal, '%%')).toEqual([]);
    expect(parseStudentSearch('a', undefined)).toBeNull();
    expect(parseStudentSearch('12', undefined)!.digits).toBeNull(); // a phone needs 4 digits
  });

  it('a teacher finds only students of their own classes (RLS), by any field', async () => {
    expect(names(await search('teacher', teacher, 'anaya'))).toEqual([]); // Anaya is in 8-B
    expect(await search('teacher', teacher, '43210')).toEqual([]);
    expect(names(await search('teacher', teacher, 'ADM-00'))).toEqual(['Aarav Sharma', 'Pending Kid']);
    const direct = await db.tenant(as('teacher', teacher), (q) => q.query(`select count(*)::int n from students`));
    expect(direct.rows[0].n).toBe(2);
  });

  it('a class teacher also sees their class', async () => {
    await db.platform((q) => q.query(`insert into users (user_id, school_id, role, display_name) values ($1, $2, 'teacher', 'T')`, [teacher, A]));
    await db.platform((q) => q.query(`update classes set class_teacher_id = $1 where class_id = $2`, [teacher, classA2]));
    expect(names(await search('teacher', teacher, 'anaya'))).toEqual(['Anaya Verma']);
    await db.platform((q) => q.query(`update classes set class_teacher_id = null where class_id = $1`, [classA2]));
  });

  it('the coordinator searches school-wide, without pending-consent students', async () => {
    expect(names(await search('academic_coordinator', coordinator, 'ADM-00'))).toEqual(['Aarav Sharma', 'Anaya Verma']);
  });

  it('answers well under 300 ms with 5,000 students in the school', async () => {
    await db.platform(async (q) => {
      await q.query(
        `insert into students (school_id, admission_no, name, class_id, roll_no, status)
         select $1, 'S' || lpad(g::text, 5, '0'), 'Student ' || md5(g::text), case when g % 2 = 0 then $2::uuid else $3::uuid end, (g % 40)::text, 'active'
         from generate_series(1, 5000) g`,
        [A, classA1, classA2]
      );
      await q.query(
        `with p as (
           insert into parents (school_id, name, phone)
           select $1, 'G' || g, '9' || lpad(g::text, 9, '0') from generate_series(1, 5000) g returning parent_id, phone
         )
         insert into parent_student_map (school_id, parent_id, student_id)
         select $1, p.parent_id, s.student_id from p join students s on s.school_id = $1 and s.admission_no = 'S' || right(p.phone, 5)`,
        [A]
      );
      await q.query('analyze');
    });
    for (const q of ['student 4a', 'S04200', '9000004242', 'zzzz']) {
      await search('principal', principal, q); // warm
      const t0 = performance.now();
      const r = await search('principal', principal, q);
      const ms = performance.now() - t0;
      expect(ms).toBeLessThan(300);
      if (q === 'S04200') expect(r[0]).toMatchObject({ admissionNo: 'S04200', matchedOn: 'admission_no' });
      if (q === '9000004242') expect(r[0]).toMatchObject({ admissionNo: 'S04242', guardianPhoneLast4: '4242' });
    }
  }, 60000);
});

describe('entitlements', () => {
  it('a school reads its own entitlements and cannot change them', async () => {
    await db.platform((q) => changeModuleEntitlement(q, { schoolId: A, moduleId: 'students', enabled: true, reason: 'pilot' }, { userId: founder, role: 'super_admin' }));
    const e = await db.tenant(as('principal', principal), (q) => loadEntitlements(q, A));
    expect(e).toMatchObject({ plan: 'unassigned', accessMode: 'full', modules: { students: { enabled: true, source: 'founder_override', overriddenBy: founder } } });
    await expect(
      db.tenant(as('principal', principal), (q) => q.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'fees', true, 'plan')`, [A]))
    ).rejects.toThrow(/permission denied/);
    const other = await db.tenant(as('principal', principal, B), (q) => q.query(`select count(*)::int n from school_module_entitlements`));
    expect(other.rows[0].n).toBe(0);
  });

  it('Help Center and Raise Ticket cannot be switched off, in code or in the database', async () => {
    const r = await db.platform((q) => changeModuleEntitlement(q, { schoolId: A, moduleId: 'raise-ticket', enabled: false, reason: 'x y z' }, { userId: founder, role: 'super_admin' }));
    expect(r).toEqual({ ok: false, error: 'Help Center and Raise Ticket are always on' });
    await expect(
      db.platform((q) => q.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'help-center', false, 'plan')`, [A]))
    ).rejects.toThrow(/help_modules_always_on/);
    await db.platform((q) => changeSchoolAccess(q, { schoolId: A, accessMode: 'suspended', reason: 'unpaid' }, { userId: founder, role: 'super_admin' }));
    const help = await db.tenant(as('teacher', teacher), (q) => checkModuleAccess(q, { schoolId: A, role: 'teacher' }, 'raise-ticket', { write: true }));
    expect(help.ok).toBe(true);
    const students = await db.tenant(as('principal', principal), (q) => checkModuleAccess(q, { schoolId: A, role: 'principal' }, 'students'));
    expect(students).toMatchObject({ ok: false, error: 'module_not_enabled' });
  });

  it('read-only keeps reading, refuses changes; search follows the Students entitlement', async () => {
    await db.platform((q) => changeSchoolAccess(q, { schoolId: A, accessMode: 'read_only', reason: 'grace over' }, { userId: founder, role: 'super_admin' }));
    const read = await db.tenant(as('teacher', teacher), (q) => checkModuleAccess(q, { schoolId: A, role: 'teacher' }, 'students', { roles: ['teacher'] }));
    expect(read.ok).toBe(true);
    const write = await db.tenant(as('principal', principal), (q) => checkModuleAccess(q, { schoolId: A, role: 'principal' }, 'students', { write: true }));
    expect(write).toMatchObject({ ok: false, error: 'read_only' });
    // Teachers do not get the Students module itself.
    const mod = await db.tenant(as('teacher', teacher), (q) => checkModuleAccess(q, { schoolId: A, role: 'teacher' }, 'students'));
    expect(mod).toMatchObject({ ok: false, error: 'role_not_allowed' });
    await db.platform((q) => changeSchoolAccess(q, { schoolId: A, accessMode: 'full', reason: 'paid' }, { userId: founder, role: 'super_admin' }));
    const audit = await db.platform((q) => q.query(`select count(*)::int n from audit_log where event_action like 'entitlement.%' and school_id = $1`, [A]));
    expect(audit.rows[0].n).toBe(4);
  });
});

describe('settings', () => {
  const schema = settingsSchemaFor('setup')!;
  const actor = { schoolId: A, userId: principal, role: 'principal' as const };

  it('saves with a revision, refuses a stale one, keeps history and resets', async () => {
    const r1 = await db.tenant(as('principal', principal), (q) => saveSettings(q, actor, schema, { moduleId: 'setup', baseRevision: 0, set: { accent_color: 'grape' } }));
    expect(r1).toMatchObject({ ok: true, settings: { revision: 1, values: { accent_color: 'grape' } } });
    const stale = await db.tenant(as('principal', principal), (q) => saveSettings(q, actor, schema, { moduleId: 'setup', baseRevision: 0, set: { accent_color: 'coral' } }));
    expect(stale).toEqual({ ok: false, reason: 'stale_revision' });
    await db.tenant(as('principal', principal), (q) => saveSettings(q, actor, schema, { moduleId: 'setup', baseRevision: 1, resetToDefault: ['accent_color'] }));
    const view = await db.tenant(as('teacher', teacher), (q) => readSettings(q, A, schema));
    expect(view.settings).toMatchObject({ revision: 2, values: {} });
    expect(view.effective.accent_color).toBe('royal');
    const hist = await db.tenant(as('principal', principal), (q) => settingsHistory(q, A, 'setup'));
    expect(hist.map((h) => [h.key, h.from, h.to, h.revision])).toEqual([
      ['accent_color', 'grape', null, 2],
      ['accent_color', null, 'grape', 1],
    ]);
  });

  it('refuses __proto__ and unknown keys before touching the database', async () => {
    const set = JSON.parse('{"__proto__": {"x": 1}}');
    const r = await db.tenant(as('principal', principal), (q) => saveSettings(q, actor, schema, { moduleId: 'setup', baseRevision: 2, set }));
    expect(r).toMatchObject({ ok: false, reason: 'invalid' });
    const r2 = await db.tenant(as('principal', principal), (q) => saveSettings(q, actor, schema, { moduleId: 'setup', baseRevision: 2, set: { logo_url: 'x' } }));
    expect(r2).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('history is append-only and teachers cannot write settings', async () => {
    for (const sql of [`update school_setting_changes set to_value = null`, `delete from school_setting_changes`]) {
      await expect(db.tenant(as('principal', principal), (q) => q.query(sql))).rejects.toThrow(/permission denied/);
    }
    await expect(
      db.tenant(as('teacher', teacher), (q) => q.query(`update school_settings set setting_values = '{}' where school_id = $1`, [A]))
    ).rejects.toThrow(/row-level security/);
  });
});

describe('custom fields', () => {
  const actor = { schoolId: A, userId: principal, role: 'principal' as const };

  it('the office defines a field and stores validated values; teachers see no values', async () => {
    const created = await db.tenant(as('principal', principal), (q) =>
      createDefinition(q, actor, { entity: 'student', key: 'blood_group', label: 'Blood group', type: 'list', options: ['A+', 'B+', 'O+'], required: false })
    );
    if (!created.ok) throw new Error(created.error);
    const fid = created.field.fieldId;
    const bad = await db.tenant(as('principal', principal), (q) => writeValues(q, actor, 'student', ids.aarav, { [fid]: 'Z' }));
    expect(bad).toMatchObject({ ok: false, status: 400 });
    const good = await db.tenant(as('principal', principal), (q) => writeValues(q, actor, 'student', ids.aarav, { [fid]: 'B+' }));
    expect(good).toEqual({ ok: true, values: { [fid]: 'B+' } });
    const other = await db.tenant(as('principal', principal), (q) => writeValues(q, actor, 'student', ids.aaravB, { [fid]: 'B+' }));
    expect(other).toMatchObject({ ok: false, status: 404 }); // school B's student
    expect(await db.tenant(as('teacher', teacher), (q) => readValues(q, A, ids.aarav))).toEqual({});
    await expect(
      db.tenant(as('teacher', teacher), (q) =>
        q.query(`insert into custom_field_definitions (school_id, entity, field_key, label, field_type, created_by) values ($1, 'student', 'x', 'X', 'text', $2)`, [A, teacher])
      )
    ).rejects.toThrow(/row-level security/);
    const dup = await db.tenant(as('principal', principal), (q) => createDefinition(q, actor, { entity: 'student', key: 'blood_group', label: 'Again', type: 'text', required: false }));
    expect(dup).toMatchObject({ ok: false, status: 409 });
  });
});

describe('saved views, bulk runs and bulk jobs (RLS)', () => {
  it('personal views are the owner’s; school views are shared and office-managed', async () => {
    const insert = (role: string, user: string, scope: string) =>
      db.tenant(as(role, user), (q) =>
        q.query(`insert into saved_views (school_id, list_id, name, scope, owner_user_id, query) values ($1, 'students', $2, $3, $4, '{}')`, [A, `${role}-${scope}`, scope, user])
      );
    await insert('principal', principal, 'personal');
    await insert('principal', principal, 'school');
    await insert('teacher', teacher, 'personal');
    await expect(insert('teacher', teacher, 'school')).rejects.toThrow(/row-level security/);
    const seen = await db.tenant(as('teacher', teacher), (q) => q.query(`select name from saved_views order by name`));
    expect(seen.rows.map((r) => r.name)).toEqual(['principal-school', 'teacher-personal']);
    const upd = await db.tenant(as('teacher', teacher), (q) => q.query(`update saved_views set name = 'x' where name = 'principal-school'`));
    expect(upd.rowCount).toBe(0);
  });

  it('a bulk run is seen by its owner and the office; a school may enqueue its own bulk.run jobs', async () => {
    await db.tenant(as('teacher', teacher), (q) =>
      q.query(
        `insert into bulk_runs (school_id, action_id, target_ids, total, created_by, created_role, preview_expires_at) values ($1, 'students.move_class', array[$2::uuid], 1, $3, 'teacher', now())`,
        [A, ids.aarav, teacher]
      )
    );
    expect((await db.tenant(as('academic_coordinator', coordinator), (q) => q.query(`select 1 from bulk_runs`))).rows).toEqual([]);
    expect((await db.tenant(as('principal', principal), (q) => q.query(`select 1 from bulk_runs`))).rows).toHaveLength(1);
    const enqueue = (school: string) =>
      db.tenant(as('principal', principal), (q) => q.query(`insert into jobs (type, idempotency_key, school_id) values ('bulk.run', $1, $2)`, [randomUUID(), school]));
    await expect(enqueue(A)).resolves.toBeTruthy();
    await expect(enqueue(B)).rejects.toThrow(/row-level security/);
  });
});
