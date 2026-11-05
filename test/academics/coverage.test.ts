import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { coverageTable, elapsedPercent, trendOf } from '@/lib/academics/coverage';
import { FACTS, NotThisRolesFact, factContext, loadFact, rangeFor } from '@/lib/insights';

// Syllabus coverage by class and subject, the trend against the session, objectives met, and the principal's tile
// (W20-D, H4), on the whole real schema as app_user.

const A = 'c9000000-0000-4000-8000-000000000001';
const PRINCIPAL = 'c9000000-0000-4000-8000-0000000000a1';
const T1 = 'c9000000-0000-4000-8000-0000000000a2';
const T2 = 'c9000000-0000-4000-8000-0000000000a3';
const T1_PROFILE = 'c9000000-0000-4000-8000-0000000000f2';
const T2_PROFILE = 'c9000000-0000-4000-8000-0000000000f3';
const C5 = 'c9000000-0000-4000-8000-0000000000c1';
const C6 = 'c9000000-0000-4000-8000-0000000000c2';
const MATHS = 'c9000000-0000-4000-8000-0000000000d1';
const HINDI = 'c9000000-0000-4000-8000-0000000000d2';
const SESSION = 'c9000000-0000-4000-8000-0000000000e1';
// Session 2026-04-01 to 2027-03-31 is 364 days; 2026-10-12 is its day 194: 53% has passed.
const TODAY = '2026-10-12';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const t1: Who = { role: 'teacher', user: T1, school: A };
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

// n units for a class and subject; the first `taught` of them taught on their own day, the first `noted` of those
// with a note (a note of only spaces is not a note).
async function plan(classId: string, subjectId: string, teacherId: string, n: number, taught: number, noted: number, blankNoteAt = -1) {
  for (let i = 0; i < n; i += 1) {
    const unit = (await db.pg.query(`insert into syllabus_units (school_id, class_id, subject_id, position, chapter, topic) values ($1, $2, $3, $4, 'Ch', $5) returning unit_id`, [A, classId, subjectId, i + 1, `Topic ${i + 1}`])).rows[0].unit_id;
    if (i >= taught) continue;
    const note = i === blankNoteAt ? '   ' : i < noted ? 'Children can add halves' : null;
    await db.pg.query(`insert into syllabus_progress (school_id, teacher_id, class_id, subject_id, topic, status, date, unit_id, note) values ($1, $2, $3, $4, $5, 'taught', ($6::date + $7::int), $8, $9)`, [A, teacherId, classId, subjectId, `Topic ${i + 1}`, '2026-08-01', i, unit, note]);
  }
}

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR');
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${T1}', '${A}', 't1@a.invalid', 'teacher', 'Teacher One'), ('${T2}', '${A}', 't2@a.invalid', 'teacher', 'Teacher Two');
    insert into teachers (teacher_id, school_id, user_id, name) values ('${T1_PROFILE}', '${A}', '${T1}', 'Teacher One'), ('${T2_PROFILE}', '${A}', '${T2}', 'Teacher Two');
    insert into classes (class_id, school_id, name) values ('${C5}', '${A}', '5-A'), ('${C6}', '${A}', '6-A');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths'), ('${HINDI}', '${A}', 'Hindi');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values
      ('${A}', '${T1_PROFILE}', '${MATHS}', '${C5}'), ('${A}', '${T1_PROFILE}', '${HINDI}', '${C5}'), ('${A}', '${T2_PROFILE}', '${MATHS}', '${C6}');
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
  `);
  await plan(C5, MATHS, T1_PROFILE, 10, 6, 4);
  await plan(C5, HINDI, T1_PROFILE, 4, 0, 0);
  await plan(C6, MATHS, T2_PROFILE, 4, 4, 2, 0); // one real note; the unit with a blank note is taught but not noted
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('the trend', () => {
  it('sets coverage against the share of the session that has passed, ten points either way', () => {
    expect(elapsedPercent(TODAY, { start: '2026-04-01', end: '2027-03-31' })).toBe(53);
    expect(elapsedPercent('2026-01-01', { start: '2026-04-01', end: '2027-03-31' })).toBe(0);
    expect(elapsedPercent('2028-01-01', { start: '2026-04-01', end: '2027-03-31' })).toBe(100);
    expect(elapsedPercent(TODAY, { start: '2026-04-01', end: '2026-04-01' })).toBeNull();
    expect([trendOf(63, 53), trendOf(62, 53), trendOf(43, 53), trendOf(42, 53), trendOf(null, 53), trendOf(50, null)]).toEqual(['ahead', 'on_track', 'on_track', 'behind', null, null]);
  });
});

describe('the coverage table', () => {
  it('counts planned, taught, percent, trend and objectives met for each class and subject', async () => {
    const table = await as(principal, (c) => coverageTable(c, A, 'principal', TODAY));
    expect(table.elapsedPercent).toBe(53);
    expect(table.rows.map((r) => [r.class_name, r.subject_name, r.planned, r.taught, r.percent, r.trend, r.noted, r.objectivesPercent])).toEqual([
      ['5-A', 'Hindi', 4, 0, 0, 'behind', 0, null],
      ['5-A', 'Maths', 10, 6, 60, 'on_track', 4, 67],
      ['6-A', 'Maths', 4, 4, 100, 'ahead', 1, 25],
    ]);
    expect(table.total).toEqual({ classSubjects: 3, planned: 18, taught: 10, percent: 56, behind: 1 });
  });

  it('shows a teacher only their own classes, and says nothing of ahead or behind with no current session', async () => {
    const mine = await as(t1, (c) => coverageTable(c, A, 'teacher', TODAY));
    expect(mine.rows.map((r) => [r.class_name, r.subject_name])).toEqual([['5-A', 'Hindi'], ['5-A', 'Maths']]);
    expect(mine.total.planned).toBe(14);
    await db.pg.exec(`update academic_sessions set is_current = false`);
    const none = await as(principal, (c) => coverageTable(c, A, 'principal', TODAY));
    expect(none.elapsedPercent).toBeNull();
    expect(none.rows.every((r) => r.trend === null)).toBe(true);
    expect(none.total.behind).toBe(0);
    await db.pg.exec(`update academic_sessions set is_current = true`);
  });
});

describe('the principal’s tile', () => {
  it('shows the table’s school-wide percent and its number of class-subjects behind, for the office only', async () => {
    const def = FACTS.find((f) => f.id === 'syllabus.coverage')!;
    const range = rangeFor(TODAY, 'today');
    const tile = await as(principal, (c) => loadFact(c, def, factContext({ schoolId: A, userId: PRINCIPAL, role: 'principal' }, TODAY, range)));
    const table = await as(principal, (c) => coverageTable(c, A, 'principal', TODAY));
    expect(tile).toMatchObject({ state: 'ok', value: 56, total: 3, unit: 'percent', href: '/app/syllabus' });
    expect([tile.value, tile.total, tile.parts]).toEqual([table.total.percent, table.total.classSubjects, [{ key: 'behind', value: table.total.behind }]]);
    await expect(as(t1, (c) => loadFact(c, def, factContext({ schoolId: A, userId: T1, role: 'teacher' }, TODAY, range)))).rejects.toBeInstanceOf(NotThisRolesFact);
  });

  it('is "not set up" while no class has a syllabus map', async () => {
    await db.pg.exec(`delete from syllabus_progress; delete from syllabus_units;`);
    const def = FACTS.find((f) => f.id === 'syllabus.coverage')!;
    const tile = await as(principal, (c) => loadFact(c, def, factContext({ schoolId: A, userId: PRINCIPAL, role: 'principal' }, TODAY, rangeFor(TODAY, 'today'))));
    expect(tile).toMatchObject({ state: 'not_set_up', value: null });
  });
});
