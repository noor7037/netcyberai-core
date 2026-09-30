import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDb, type TestDb } from '../db/pglite-harness';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { runJobs } from '@/lib/jobs/runner';
import type { Sql } from '@/lib/jobs/types';
import { createDefinition, writeValues } from '@/lib/frameworks/custom-fields';
import { compileListQuery, runList } from '@/lib/frameworks/filter-engine';
import { listSpec, type StudentListRow } from '@/lib/frameworks/lists';
import { createView, listViews, updateView } from '@/lib/frameworks/saved-views';
import { bulkRunHandler, confirmBulk, getBulkRun, previewBulk, undoBulk } from '@/lib/frameworks/bulk-engine';

// The filter engine, saved views and bulk actions on real Postgres (C112).

let db: TestDb;
const A = randomUUID();
const principal = randomUUID();
const admin = randomUUID();
const c8a = randomUUID();
const c8b = randomUUID();
const c9a = randomUUID();
const spec = listSpec('students')!;
const actor = { schoolId: A, userId: principal, role: 'principal' as const };
const claims = (role: string, user: string) => ({ role: role as any, sub: user, schoolId: A });
const asPrincipal = <T>(fn: (q: Sql) => Promise<T>) => db.tenant(claims('principal', principal), fn);
const queue = () => createPgJobQueue((fn) => db.platform(fn));

async function list(query: unknown) {
  return asPrincipal(async (q) => {
    const customFields = (await q.query(`select field_id, field_type, options from custom_field_definitions`)).rows.map((r) => ({
      fieldId: r.field_id, entity: 'student' as const, key: 'k', label: 'L', type: r.field_type, options: r.options ?? undefined, required: false, archived: false,
    }));
    const c = compileListQuery(spec, query, { schoolId: A, customFields });
    if (!c.ok) throw new Error(JSON.stringify(c.errors));
    return runList<StudentListRow>(q, spec, c.compiled);
  });
}

beforeAll(async () => {
  db = await createTestDb();
  await db.platform(async (q) => {
    await q.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'A', 'IN-HR')`, [A]);
    await q.query(`insert into classes (class_id, school_id, name, section) values ($1, $4, '8-A', 'A'), ($2, $4, '8-B', 'B'), ($3, $4, '9-A', 'A')`, [c8a, c8b, c9a, A]);
    await q.query(
      `insert into students (school_id, admission_no, name, class_id, roll_no, status, dob)
       select $1, 'A' || lpad(g::text, 3, '0'), 'Pupil ' || lpad(g::text, 3, '0'), case when g <= 150 then $2::uuid else $3::uuid end,
              g::text, case when g % 10 = 0 then 'inactive' else 'active' end::student_status, date '2014-01-01' + g
       from generate_series(1, 300) g`,
      [A, c8a, c8b]
    );
  });
}, 60000);

describe('filter engine on the students list', () => {
  it('filters, searches, sorts and pages, with the total of the whole filtered set', async () => {
    const q = { filter: { combinator: 'and', conditions: [{ field: 'class', op: 'in', value: [c8a] }, { field: 'status', op: 'in', value: ['active'] }] }, pageSize: 50 };
    const p1 = await list(q);
    expect(p1.total).toBe(135);
    expect(p1.rows).toHaveLength(50);
    expect(p1.rows[0]).toMatchObject({ name: 'Pupil 001', class_name: '8-A', section: 'A', status: 'active', dob: '2014-01-02' });
    const p3 = await list({ ...q, cursor: (await list({ ...q, cursor: p1.nextCursor! })).nextCursor! });
    expect(p3.rows).toHaveLength(35);
    expect(p3.nextCursor).toBeNull();
    const searched = await list({ search: 'pupil 29', sort: [{ field: 'admission_no', dir: 'desc' }] });
    expect(searched.rows.map((r) => r.admission_no)).toEqual(['A299', 'A298', 'A297', 'A296', 'A295', 'A294', 'A293', 'A292', 'A291', 'A290']);
    const either = await list({ filter: { combinator: 'or', conditions: [{ field: 'admission_no', op: 'eq', value: 'a001' }, { field: 'roll_no', op: 'eq', value: '300' }] } });
    expect(either.rows.map((r) => r.admission_no)).toEqual(['A001', 'A300']);
  });

  it('filters on a custom field', async () => {
    const f = await asPrincipal((q) => createDefinition(q, actor, { entity: 'student', key: 'house', label: 'House', type: 'list', options: ['Red', 'Blue'], required: false }));
    if (!f.ok) throw new Error(f.error);
    const ids = (await list({ pageSize: 3 })).rows.map((r) => r.id);
    for (const id of ids) await asPrincipal((q) => writeValues(q, actor, 'student', id, { [f.field.fieldId]: 'Red' }));
    const red = await list({ filter: { combinator: 'and', conditions: [{ field: `cf:${f.field.fieldId}`, op: 'in', value: ['Red'] }] } });
    expect(red.rows.map((r) => r.id).sort()).toEqual([...ids].sort());
    const empty = await list({ filter: { combinator: 'and', conditions: [{ field: `cf:${f.field.fieldId}`, op: 'is_empty' }] } });
    expect(empty.total).toBe(297);
  });
});

describe('saved views', () => {
  it('validates the query, keeps one role default per list, and hides personal views from others', async () => {
    const bad = await asPrincipal((q) => createView(q, actor, spec, { name: 'Bad', query: { filter: { combinator: 'and', conditions: [{ field: 'nope', op: 'eq', value: 1 }] } } }));
    expect(bad).toMatchObject({ ok: false, status: 400 });
    const v1 = await asPrincipal((q) => createView(q, actor, spec, { name: 'Active 8-A', scope: 'school', defaultForRoles: ['teacher'], query: { filter: { combinator: 'and', conditions: [{ field: 'class', op: 'in', value: [c8a] }] }, cursor: 'eyJvIjo1MH0' } }));
    if (!v1.ok) throw new Error(v1.error);
    expect(v1.value.query).not.toHaveProperty('cursor');
    const v2 = await asPrincipal((q) => createView(q, actor, spec, { name: 'All', scope: 'school', defaultForRoles: ['teacher'] }));
    if (!v2.ok) throw new Error(v2.error);
    const views = await asPrincipal((q) => listViews(q, A, 'students'));
    expect(views.filter((v) => v.defaultForRoles?.includes('teacher')).map((v) => v.name)).toEqual(['All']);
    await asPrincipal((q) => createView(q, actor, spec, { name: 'Mine' }));
    const adminViews = await db.tenant(claims('school_admin', admin), (q) => listViews(q, A, 'students'));
    expect(adminViews.map((v) => v.name).sort()).toEqual(['Active 8-A', 'All']);
    const dup = await asPrincipal((q) => createView(q, actor, spec, { name: ' mine ' }));
    expect(dup).toMatchObject({ ok: false, status: 409 });
    const renameOthers = await db.tenant(claims('teacher', randomUUID()), (q) => updateView(q, { ...actor, userId: randomUUID(), role: 'teacher' }, spec, v2.value.viewId, { name: 'X' }));
    expect(renameOthers).toMatchObject({ ok: false, status: 403 });
  });
});

describe('bulk actions: move to class', () => {
  const inClass = async (classId: string) => (await db.query(`select count(*)::int n from students where class_id = $1`, [classId])).rows[0].n;

  it('previews, refuses a changed set at confirm, runs, and undoes', async () => {
    const selection = { mode: 'filtered', query: { filter: { combinator: 'and', conditions: [{ field: 'class', op: 'in', value: [c8a] }, { field: 'status', op: 'in', value: ['inactive'] }] } }, expectedCount: 15 };
    const wrongCount = await asPrincipal((q) => previewBulk(q, actor, { actionId: 'students.move_class', selection: { ...selection, expectedCount: 14 }, params: { classId: c9a } }));
    expect(wrongCount).toMatchObject({ ok: false, status: 409, error: 'selection_changed', count: 15 });

    const p = await asPrincipal((q) => previewBulk(q, actor, { actionId: 'students.move_class', selection, params: { classId: c9a } }));
    if (!p.ok) throw new Error(p.error);
    expect(p.preview).toMatchObject({ count: 15, runsAsJob: false, warnings: [] });
    expect(p.preview.firstRows[0]).toEqual({ id: expect.any(String), label: 'Pupil 010', change: '8-A → 9-A' });
    expect(await inClass(c9a)).toBe(0); // preview changes nothing

    // Someone changes the set before confirm: refused, nothing moves.
    await db.platform((q) => q.query(`update students set status = 'active' where admission_no = 'A010'`));
    const refused = await asPrincipal((q) => confirmBulk(q, actor, p.preview.previewId, queue()));
    expect(refused).toMatchObject({ ok: false, status: 409, error: 'selection_changed', count: 14 });
    expect(await inClass(c9a)).toBe(0);

    const p2 = await asPrincipal((q) => previewBulk(q, actor, { actionId: 'students.move_class', selection: { ...selection, expectedCount: 14 }, params: { classId: c9a } }));
    if (!p2.ok) throw new Error(p2.error);
    const other = await db.tenant(claims('school_admin', admin), (q) => confirmBulk(q, { ...actor, userId: admin, role: 'school_admin' }, p2.preview.previewId, queue()));
    expect(other).toMatchObject({ ok: false, status: 403 });
    const done = await asPrincipal((q) => confirmBulk(q, actor, p2.preview.previewId, queue()));
    expect(done).toMatchObject({ ok: true, run: { status: 'succeeded', total: 14, done: 14, failed: 0, undoUntil: expect.any(String) } });
    expect(await inClass(c9a)).toBe(14);
    const again = await asPrincipal((q) => confirmBulk(q, actor, p2.preview.previewId, queue()));
    expect(again).toMatchObject({ ok: true, run: { status: 'succeeded', done: 14 } }); // a double click runs nothing twice
    expect(await inClass(c9a)).toBe(14);

    // One student is moved again by hand: undo leaves that one alone.
    await db.platform((q) => q.query(`update students set class_id = $1 where admission_no = 'A020'`, [c8b]));
    const undone = await asPrincipal((q) => undoBulk(q, actor, p2.preview.previewId));
    expect(undone).toMatchObject({ ok: true, restored: 13, skipped: 1, run: { status: 'undone' } });
    expect(await inClass(c9a)).toBe(0);
    expect(await asPrincipal((q) => undoBulk(q, actor, p2.preview.previewId))).toMatchObject({ ok: false, status: 409 });

    const audit = await db.platform((q) => q.query(`select event_action from audit_log where school_id = $1 and event_action like 'bulk.%' order by audit_id`, [A]));
    expect(audit.rows.map((r) => r.event_action)).toEqual(['bulk.confirmed', 'bulk.finished', 'bulk.undone']);
  });

  it('above syncLimit it queues a bulk.run job, which runs once', async () => {
    const selection = { mode: 'filtered', query: { filter: { combinator: 'and', conditions: [{ field: 'status', op: 'in', value: ['active'] }] } }, expectedCount: 271 };
    const p = await asPrincipal((q) => previewBulk(q, actor, { actionId: 'students.move_class', selection, params: { classId: c9a } }));
    if (!p.ok) throw new Error(JSON.stringify(p));
    expect(p.preview.runsAsJob).toBe(true);
    const c = await asPrincipal((q) => confirmBulk(q, actor, p.preview.previewId, queue()));
    expect(c).toMatchObject({ ok: true, run: { status: 'queued' }, jobKey: `bulk.run:${p.preview.previewId}` });
    const handlers = { 'bulk.run': bulkRunHandler({ platform: (fn) => db.platform(fn) }) };
    const summary = await runJobs({ handlers, queue: queue(), limit: 5 } as any);
    expect(summary).toMatchObject({ succeeded: 1 });
    const run = await asPrincipal((q) => getBulkRun(q, A, p.preview.previewId));
    expect(run).toMatchObject({ status: 'succeeded', done: 271 });
    expect(await inClass(c9a)).toBe(271);
  });

  it('refuses ids outside the list and roles the action does not allow', async () => {
    const r = await asPrincipal((q) => previewBulk(q, actor, { actionId: 'students.move_class', selection: { mode: 'ids', ids: [randomUUID()] }, params: { classId: c9a } }));
    expect(r).toMatchObject({ ok: false, status: 400 });
    const t = await db.tenant(claims('teacher', randomUUID()), (q) => previewBulk(q, { ...actor, role: 'teacher' }, { actionId: 'students.move_class', selection: { mode: 'ids', ids: [randomUUID()] }, params: {} }));
    expect(t).toMatchObject({ ok: false, status: 403 });
  });
});
