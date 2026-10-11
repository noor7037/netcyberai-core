import { readFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { addHomeworkFile, assignmentRoster, createHomework, editHomework, homeworkFileUrl, listAssignments, parseHomeworkText, setCompletion, sniffHomeworkFile } from '@/lib/homework/homework';
import { HOMEWORK_CHECK, sendHomeworkCheck, type HomeworkCheck } from '@/lib/offline/homework-sender';
import { createOutbox, type Sender } from '@/lib/offline/outbox';
import { memoryStore } from '@/lib/offline/store';
import { FileStorageUnavailableError, MemoryFileStorage } from '@/lib/storage/file-storage';

// Homework (docs/20 5e, C150), on the whole real schema as app_user.

const A = 'a9000000-0000-4000-8000-000000000001';
const B = 'a9000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'a9000000-0000-4000-8000-0000000000a1';
const T1 = 'a9000000-0000-4000-8000-0000000000a2'; // class teacher of 5-A, 5-B and 5-C
const T2 = 'a9000000-0000-4000-8000-0000000000a3'; // class teacher of 6-A
const ACCOUNTANT = 'a9000000-0000-4000-8000-0000000000a4';
const PRINCIPAL_B = 'a9000000-0000-4000-8000-0000000000b1';
const C5A = 'a9000000-0000-4000-8000-0000000000c1';
const C5B = 'a9000000-0000-4000-8000-0000000000c2';
const C5C = 'a9000000-0000-4000-8000-0000000000c3';
const C6A = 'a9000000-0000-4000-8000-0000000000c4';
const MATHS = 'a9000000-0000-4000-8000-0000000000d1';
const sid = (n: number) => `a9000000-0000-4000-8000-0000005000${String(n).padStart(2, '0')}`;
const TODAY = '2026-10-12';
const DUE = '2026-10-14';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PDF = new TextEncoder().encode('%PDF-1.7 worksheet');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const t1: Who = { role: 'teacher', user: T1, school: A };
const t2: Who = { role: 'teacher', user: T2, school: A };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
const principalB: Who = { role: 'principal', user: PRINCIPAL_B, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', $1, true)`, [who.school]);
    await tx.query(`select set_config('app.current_role', $1, true)`, [who.role]);
    await tx.query(`select set_config('app.current_user_id', $1, true)`, [who.user]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
const text = { title: 'Fractions worksheet', details: 'Questions 1 to 5 on page 42', dueDate: DUE };
const set = (who: Who, classIds: string[], more = {}) => as(who, (c) => createHomework(c, actor(who), { ...text, subjectId: MATHS, classIds, ...more }));
const list = (who: Who) => as(who, (c) => listAssignments(c, who.school, TODAY));
const reset = () => db.pg.exec(`delete from homework_status; delete from homework_attachments; delete from homework_targets; delete from homework;`);
const seen = (who: Who, table: string) => as(who, (c) => c.query(`select 1 from ${table}`).then((r: { rows: unknown[] }) => r.rows.length));

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${T1}', '${A}', 't1@a.invalid', 'teacher', 'Teacher One'), ('${T2}', '${A}', 't2@a.invalid', 'teacher', 'Teacher Two'),
      ('${ACCOUNTANT}', '${A}', 'acc@a.invalid', 'accountant', 'Accountant'), ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Principal B');
    insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5A}', '${A}', '5-A', '${T1}'), ('${C5B}', '${A}', '5-B', '${T1}'), ('${C5C}', '${A}', '5-C', '${T1}'), ('${C6A}', '${A}', '6-A', '${T2}');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths');
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no) values
      ('${sid(1)}', '${A}', 'A-1', 'Asha', '${C5A}', '1'), ('${sid(2)}', '${A}', 'A-2', 'Bilal', '${C5A}', '2'), ('${sid(3)}', '${A}', 'A-3', 'Chitra', '${C5A}', '3'),
      ('${sid(4)}', '${A}', 'A-4', 'Dev', '${C5B}', '1'), ('${sid(5)}', '${A}', 'A-5', 'Esha', '${C5C}', '1'), ('${sid(10)}', '${A}', 'A-10', 'Sixth', '${C6A}', '1');
  `);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('what a homework must say', () => {
  it('a title, an optional description, and a due date from today to sixty days on', () => {
    expect(parseHomeworkText({ title: '  Fractions   worksheet ', details: ' Q1 to 5 ', dueDate: DUE }, TODAY)).toEqual({ ok: true, value: { title: 'Fractions worksheet', details: 'Q1 to 5', dueDate: DUE } });
    expect(parseHomeworkText({ title: 'x', dueDate: TODAY }, TODAY)).toMatchObject({ ok: true, value: { details: null } });
    expect(parseHomeworkText({ title: '', dueDate: DUE }, TODAY)).toEqual({ ok: false, reason: 'title' });
    expect(parseHomeworkText({ title: 'x'.repeat(121), dueDate: DUE }, TODAY)).toEqual({ ok: false, reason: 'title' });
    for (const dueDate of ['2026-10-11', '2026-12-12', '14-10-2026', '', undefined]) expect(parseHomeworkText({ title: 'x', dueDate }, TODAY)).toEqual({ ok: false, reason: 'due_date' });
  });
});

describe('setting and copying', () => {
  it('one homework copied to three sections makes three assignments, each checked separately', async () => {
    await reset();
    const made = await set(t1, [C5A, C5B, C5C]);
    expect(made).toMatchObject({ ok: true });
    if (!made.ok) throw new Error('unreachable');
    expect(made.targetIds).toHaveLength(3);
    const all = await list(t1);
    expect(all.map((a) => [a.class_name, a.title, a.due_date, a.students, a.checked, a.done, a.siblings.length])).toEqual([['5-A', 'Fractions worksheet', DUE, 3, 0, 0, 2], ['5-B', 'Fractions worksheet', DUE, 1, 0, 0, 2], ['5-C', 'Fractions worksheet', DUE, 1, 0, 0, 2]]);
    expect(new Set(all.map((a) => a.homework_id)).size).toBe(1);

    // Checking 5-A does nothing to 5-B or 5-C.
    const a5 = all[0];
    expect(await as(t1, (c) => setCompletion(c, actor(t1), a5.target_id, [{ studentId: sid(1), done: true }, { studentId: sid(2), done: false }]))).toEqual({ ok: true, saved: 2, notInClass: [] });
    expect((await list(t1)).map((a) => [a.class_name, a.checked, a.done])).toEqual([['5-A', 2, 1], ['5-B', 0, 0], ['5-C', 0, 0]]);
    const roster = await as(t1, (c) => assignmentRoster(c, A, a5.target_id));
    expect(roster!.roster.map((r) => [r.name, r.done])).toEqual([['Asha', true], ['Bilal', false], ['Chitra', null]]);
  });

  it('editing the original changes only the copies the person names; the others stay as sent', async () => {
    const all = await list(t1);
    const [a, b, c] = all;
    const edit = { title: 'Fractions worksheet (corrected)', details: 'Questions 1 to 6 on page 42', dueDate: '2026-10-15' };
    // Naming none: only the original changes.
    expect(await as(t1, (cl) => editHomework(cl, actor(t1), a.homework_id, { ...edit, applyTo: [] }))).toEqual({ ok: true, changedTargets: [], leftAsSent: [a.target_id, b.target_id, c.target_id] });
    expect((await list(t1)).map((x) => x.title)).toEqual(['Fractions worksheet', 'Fractions worksheet', 'Fractions worksheet']);
    // Naming 5-B: 5-B changes, 5-A and 5-C stay.
    expect(await as(t1, (cl) => editHomework(cl, actor(t1), a.homework_id, { ...edit, applyTo: [b.target_id] }))).toMatchObject({ ok: true, changedTargets: [b.target_id] });
    expect((await list(t1)).map((x) => [x.class_name, x.title, x.due_date])).toEqual([['5-A', 'Fractions worksheet', DUE], ['5-C', 'Fractions worksheet', DUE], ['5-B', 'Fractions worksheet (corrected)', '2026-10-15']]);
    // A copy of some other homework cannot be named.
    expect(await as(t1, (cl) => editHomework(cl, actor(t1), a.homework_id, { ...edit, applyTo: ['a9000000-0000-4000-8000-00000000ffff'] }))).toEqual({ ok: false, reason: 'not_a_copy' });
    const audit = (await db.pg.query(`select after_state from audit_log where school_id = $1 and event_action = 'homework.edit' order by audit_id`, [A])).rows;
    expect(audit.map((r: { after_state: { changedCopies: number; leftAsSent: number } }) => [r.after_state.changedCopies, r.after_state.leftAsSent])).toEqual([[0, 3], [1, 2]]);
  });

  it('a teacher cannot set homework for a class they do not teach, and sees only their own classes’ homework', async () => {
    await reset();
    expect(await set(t1, [C5A, C6A])).toEqual({ ok: false, reason: 'not_your_class' });
    expect(await db.pg.query(`select 1 from homework`).then((r: { rows: unknown[] }) => r.rows)).toEqual([]);
    // The database refuses it directly, whatever the code does.
    await set(t1, [C5A]);
    const hw = (await db.pg.query(`select homework_id from homework`)).rows[0].homework_id;
    await expect(as(t1, (c) => c.query(`insert into homework_targets (school_id, homework_id, class_id, title, due_date) values ($1, $2, $3, 'x', $4)`, [A, hw, C6A, DUE]))).rejects.toThrow(/row-level security/);
    // T2 sees none of it; the principal sees it; the accountant and another school see nothing.
    for (const table of ['homework', 'homework_targets']) expect([await seen(t1, table), await seen(t2, table), await seen(principal, table), await seen(accountant, table), await seen(principalB, table)]).toEqual([1, 0, 1, 0, 0]);
    const target = (await list(t1))[0];
    expect(await as(t2, (c) => setCompletion(c, actor(t2), target.target_id, [{ studentId: sid(1), done: true }]))).toEqual({ ok: false, reason: 'not_found' });
    expect(await as(t2, (c) => editHomework(c, actor(t2), hw, { ...text, applyTo: [] }))).toEqual({ ok: false, reason: 'not_found' });
    expect(await set(accountant, [C5A])).toEqual({ ok: false, reason: 'not_allowed' });
    // The office sets homework for any class; an unknown class or none is refused.
    expect(await set(principal, [C6A])).toMatchObject({ ok: true });
    expect(await set(principal, [])).toEqual({ ok: false, reason: 'no_sections' });
    expect(await set(principal, ['a9000000-0000-4000-8000-00000000eeee'])).toEqual({ ok: false, reason: 'unknown_class' });
    expect(await seen(t2, 'homework_targets')).toBe(1);
  });
});

describe('completion', () => {
  it('only the assignment’s own students are saved; the later answer stands; each submission is audited', async () => {
    await reset();
    await set(t1, [C5A]);
    const target = (await list(t1))[0];
    const first = await as(t1, (c) => setCompletion(c, actor(t1), target.target_id, [{ studentId: sid(1), done: true }, { studentId: sid(4), done: true }, { studentId: sid(10), done: true }]));
    expect(first).toEqual({ ok: true, saved: 1, notInClass: [sid(4), sid(10)] });
    await as(principal, (c) => setCompletion(c, actor(principal), target.target_id, [{ studentId: sid(1), done: false }]));
    expect((await db.pg.query(`select student_id, done, checked_by from homework_status`)).rows).toEqual([{ student_id: sid(1), done: false, checked_by: PRINCIPAL }]);
    expect((await db.pg.query(`select actor_user_id from audit_log where school_id = $1 and event_action = 'homework.checked' and target_id = $2 order by audit_id`, [A, target.target_id])).rows.map((r: { actor_user_id: string }) => r.actor_user_id)).toEqual([T1, PRINCIPAL]);
  });

  it('marked with no network, it waits on the phone and is saved once; a lost answer sent again changes nothing', async () => {
    await reset();
    await set(t1, [C5A]);
    const target = (await list(t1))[0];
    const store = memoryStore();
    const outbox = createOutbox(store);
    const net = { on: false, loseAnswer: true, calls: 0 };
    const senders: Record<string, Sender> = {
      [HOMEWORK_CHECK]: (op) =>
        sendHomeworkCheck(op, store, async (url, init) => {
          if (!net.on) throw new TypeError('network off');
          net.calls += 1;
          const body = JSON.parse(String(init.body));
          const result = await as(t1, (c) => setCompletion(c, actor(t1), url.split('/').pop()!, body.entries));
          if (net.loseAnswer) {
            net.loseAnswer = false;
            throw new TypeError('answer lost');
          }
          return Response.json(result, { status: result.ok ? 200 : 404 });
        }),
    };
    await outbox.add<HomeworkCheck>(HOMEWORK_CHECK, TODAY, { targetId: target.target_id, entries: [{ studentId: sid(1), done: true }, { studentId: sid(2), done: true }, { studentId: sid(3), done: false }] });
    expect(await outbox.flush(senders)).toMatchObject({ waiting: 1, failed: 0 });
    expect(await db.pg.query(`select 1 from homework_status`).then((r: { rows: unknown[] }) => r.rows)).toEqual([]);
    net.on = true;
    expect(await outbox.flush(senders)).toMatchObject({ waiting: 1 });
    expect(await outbox.flush(senders)).toMatchObject({ waiting: 0, failed: 0 });
    expect(net.calls).toBe(2);
    expect((await db.pg.query(`select student_id, done from homework_status order by student_id`)).rows).toEqual([{ student_id: sid(1), done: true }, { student_id: sid(2), done: true }, { student_id: sid(3), done: false }]);
    expect((await list(t1))[0]).toMatchObject({ checked: 3, done: 2 });
  });
});

describe('a photo or a file', () => {
  it('is kept under the school’s own prefix, only if it really is a photo or a PDF, and is handed out only as a short-lived link to someone who can see the homework', async () => {
    await reset();
    await set(t1, [C5A]);
    const hw = (await list(t1))[0].homework_id;
    const storage = new MemoryFileStorage();
    expect([sniffHomeworkFile(PNG), sniffHomeworkFile(PDF), sniffHomeworkFile(new TextEncoder().encode('<html>'))]).toEqual(['image/png', 'application/pdf', null]);
    const photo = await as(t1, (c) => addHomeworkFile(c, storage, actor(t1), hw, { name: '../../etc/passwd<script>.png', bytes: PNG }, () => 'file-1'));
    expect(photo).toMatchObject({ ok: true });
    expect([...storage.files.keys()]).toEqual([`${A}/homework/${hw}/file-1.png`]);
    expect((await db.pg.query(`select file_name, mime_type, size_bytes, uploaded_by from homework_attachments`)).rows).toEqual([{ file_name: '....etcpasswdscript.png', mime_type: 'image/png', size_bytes: PNG.length, uploaded_by: T1 }]);
    expect(await as(t1, (c) => addHomeworkFile(c, storage, actor(t1), hw, { name: 'page.exe', bytes: new TextEncoder().encode('MZ not a photo') }))).toEqual({ ok: false, reason: 'not_a_photo_or_pdf' });
    expect(await as(t1, (c) => addHomeworkFile(c, storage, actor(t1), hw, { name: 'big.pdf', bytes: new Uint8Array(4 * 1024 * 1024 + 1) }))).toEqual({ ok: false, reason: 'too_large' });
    expect(storage.files.size).toBe(1);
    if (!photo.ok) throw new Error('unreachable');
    expect(await as(t1, (c) => homeworkFileUrl(c, storage, A, hw, photo.attachmentId))).toBe(`memory://${A}/homework/${hw}/file-1.png?ttl=300`);
    // Another teacher cannot add to it or open it; nor can another school.
    expect(await as(t2, (c) => addHomeworkFile(c, storage, actor(t2), hw, { name: 'x.pdf', bytes: PDF }))).toEqual({ ok: false, reason: 'not_found' });
    expect(await as(t2, (c) => homeworkFileUrl(c, storage, A, hw, photo.attachmentId))).toBeNull();
    expect(await as(principalB, (c) => homeworkFileUrl(c, storage, B, hw, photo.attachmentId))).toBeNull();
    // At most three files; the database holds the prefix rule itself.
    await as(t1, (c) => addHomeworkFile(c, storage, actor(t1), hw, { name: 'a.pdf', bytes: PDF }));
    await as(t1, (c) => addHomeworkFile(c, storage, actor(t1), hw, { name: 'b.pdf', bytes: PDF }));
    expect(await as(t1, (c) => addHomeworkFile(c, storage, actor(t1), hw, { name: 'c.pdf', bytes: PDF }))).toEqual({ ok: false, reason: 'too_many' });
    await expect(db.pg.query(`insert into homework_attachments (school_id, homework_id, storage_key, file_name, mime_type, size_bytes, uploaded_by) values ($1, $2, $3, 'x.png', 'image/png', 3, $4)`, [A, hw, `${B}/homework/${hw}/x.png`, T1])).rejects.toThrow(/check/);
  });

  it('when the store is not available the homework stands without the file, and no row is left behind', async () => {
    const hw = (await list(t1))[0].homework_id;
    await db.pg.exec(`delete from homework_attachments`);
    const down = { put: async () => { throw new FileStorageUnavailableError(); }, signedUrl: async () => '', remove: async () => undefined };
    expect(await as(t1, (c) => addHomeworkFile(c, down, actor(t1), hw, { name: 'x.pdf', bytes: PDF }))).toEqual({ ok: false, reason: 'storage_unavailable' });
    expect(await db.pg.query(`select 1 from homework_attachments`).then((r: { rows: unknown[] }) => r.rows)).toEqual([]);
    expect(await list(t1)).toHaveLength(1);
  });
});

describe('the switch-on and the grants', () => {
  it('Homework is switched on for every existing school, once; public roles have no access to its tables', async () => {
    const statement = readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261011183026_p2_homework.sql'), 'utf8').match(/insert into school_module_entitlements[\s\S]*?;/)![0];
    await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'homework', false, 'founder_override')`, [B]);
    await db.pg.exec(statement);
    await db.pg.exec(statement);
    expect((await db.pg.query(`select school_id, enabled, source from school_module_entitlements where module_id = 'homework' order by school_id`)).rows).toEqual([{ school_id: A, enabled: true, source: 'plan' }, { school_id: B, enabled: false, source: 'founder_override' }]);
    expect((await db.pg.query(`select table_name from information_schema.role_table_grants where table_name like 'homework%' and grantee in ('anon', 'authenticated', 'PUBLIC')`)).rows).toEqual([]);
  });
});
