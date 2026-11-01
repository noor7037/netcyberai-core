import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { classLevelOf, copyFromLibrary, libraryPlan, librarySubjectOf } from '@/lib/academics/syllabus-library';
import { recordTaught, unitsFor } from '@/lib/academics/taught';
import { unitFacts } from '@/lib/curriculum-gap/curriculum-gap';
import { onboardingChecklist } from '@/lib/setup/checklist';

// "Use the NetCyberAI syllabus" (W14-I), on the whole real schema as app_user: the library's units of a board, class and
// subject are copied into a school's own syllabus map, in order, once; and what Taught today, the Daily Pulse and the
// Curriculum Gap read then lists them.

const u = (n: number) => `a8000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = u(1);
const B = u(2);
const PRINCIPAL = u(0xa1);
const T1 = u(0xa2);
const T2 = u(0xa3);
const T1_PROFILE = u(0xf2);
const T2_PROFILE = u(0xf3);
const C6 = u(0xc1);
const C7 = u(0xc2);
const B6 = u(0xc3);
const MATHS = u(0xd1);
const HINDI = u(0xd2);
const SANSKRIT = u(0xd3);
const B_MATHS = u(0xd4);
const SESSION = u(0xe1);
const FOUNDER = u(0xb1);
const V_MATHS = u(0x101);
const V_HINDI = u(0x102);
const DAY = '2026-10-12';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const t1: Who = { role: 'teacher', user: T1, school: A };
const t2: Who = { role: 'teacher', user: T2, school: A };
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
const rows = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const unitsOf = (school: string, classId: string, subjectId: string) =>
  rows(`select position, chapter, topic, source from syllabus_units where school_id = $1 and class_id = $2 and subject_id = $3 order by position`, [school, classId, subjectId]);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, board_id) values ('${A}', 'School A', 'IN-UP', 'cbse'), ('${B}', 'School B', 'IN-DL', 'cbse');
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${T1}', '${A}', 't1@a.invalid', 'teacher', 'Teacher One'), ('${T2}', '${A}', 't2@a.invalid', 'teacher', 'Teacher Two');
    insert into teachers (teacher_id, school_id, user_id, name) values ('${T1_PROFILE}', '${A}', '${T1}', 'Teacher One'), ('${T2_PROFILE}', '${A}', '${T2}', 'Teacher Two');
    insert into classes (class_id, school_id, name, grade, section) values ('${C6}', '${A}', '6-A', '6', 'A'), ('${C7}', '${A}', '7-A', '7', 'A'), ('${B6}', '${B}', '6-A', '6', 'A');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths'), ('${HINDI}', '${A}', 'HINDI'), ('${SANSKRIT}', '${A}', 'Sanskrit'), ('${B_MATHS}', '${B}', 'Mathematics');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values
      ('${A}', '${T1_PROFILE}', '${MATHS}', '${C6}'), ('${A}', '${T1_PROFILE}', '${HINDI}', '${C6}'), ('${A}', '${T1_PROFILE}', '${SANSKRIT}', '${C6}'), ('${A}', '${T2_PROFILE}', '${MATHS}', '${C7}');
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
    -- School B already has its own map for class 6 Mathematics.
    insert into syllabus_units (school_id, class_id, subject_id, position, chapter, topic) values ('${B}', '${B6}', '${B_MATHS}', 1, 'B chapter', 'B topic');
    -- The library: CBSE class 6 Mathematics (two chapters, the first with two topics) and Hindi (one chapter, no topics).
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at) values
      ('${V_MATHS}', 'CBSE', 6, 'mathematics', '2026-27', 1, 'published', 'everyone', 'repository', 'test', '${FOUNDER}', now()),
      ('${V_HINDI}', 'CBSE', 6, 'hindi', '2026-27', 1, 'published', 'everyone', 'repository', 'test', '${FOUNDER}', now());
    insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, source_url, source_page, checked_on) values
      ('${u(0x201)}', '${V_MATHS}', 'cbse.c6.maths.ch01', 1, 'Knowing our numbers', 'https://cbseacademic.nic.in/', '1', '2026-10-21'),
      ('${u(0x202)}', '${V_MATHS}', 'cbse.c6.maths.ch02', 2, 'Whole numbers', 'https://cbseacademic.nic.in/', '2', '2026-10-21'),
      ('${u(0x203)}', '${V_HINDI}', 'cbse.c6.hindi.ch01', 1, 'Vasant: Vah Chidiya Jo', 'https://cbseacademic.nic.in/', '3', '2026-10-21');
    insert into content.topics (version_id, chapter_id, topic_key, position, title_en, source_url, source_page, checked_on) values
      ('${V_MATHS}', '${u(0x201)}', 'cbse.c6.maths.ch01.t1', 1, 'Comparing numbers', 'https://cbseacademic.nic.in/', '1', '2026-10-21'),
      ('${V_MATHS}', '${u(0x201)}', 'cbse.c6.maths.ch01.t2', 2, 'Large numbers', 'https://cbseacademic.nic.in/', '1', '2026-10-21');
  `);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('the rules that match a school to the library', () => {
  it('matches subject names case-insensitively, with the usual spellings', () => {
    expect(['Maths', 'MATHEMATICS', ' maths ', 'Math'].map(librarySubjectOf)).toEqual(['mathematics', 'mathematics', 'mathematics', 'mathematics']);
    expect(['EVS', 'Environmental Studies', 'SST', 'Social Science', 'Social Studies', 'Hindi', 'english', 'Science'].map(librarySubjectOf)).toEqual(['evs', 'evs', 'social_science', 'social_science', 'social_science', 'hindi', 'english', 'science']);
    expect(librarySubjectOf('Origami')).toBeNull();
  });
  it('reads the class level from the grade, else the name', () => {
    expect([classLevelOf('6', '6-A'), classLevelOf(null, '7-B'), classLevelOf('LKG', 'LKG-A'), classLevelOf(null, 'Rainbow')]).toEqual([6, 7, -1, null]);
  });
});

describe('use the NetCyberAI syllabus', () => {
  it('shows what the library has for each class and subject before anything is copied', async () => {
    const plan = await as(principal, (c) => libraryPlan(c, actor(principal)));
    expect(plan.board).toBe('cbse');
    expect(plan.pairs.map((p) => `${p.className} ${p.subjectName}: ${p.status}`)).toEqual(['6-A HINDI: available', '6-A Maths: available', '6-A Sanskrit: no_match', '7-A Maths: no_match']);
  });

  it('a teacher who does not teach the class is refused, and nothing is written', async () => {
    const refused = await as(t2, (c) => copyFromLibrary(c, actor(t2), { classId: C6, subjectId: MATHS }));
    expect(refused).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await unitsOf(A, C6, MATHS)).toEqual([]);
    // Their own class has nothing in the library: said, not invented.
    const own = await as(t2, (c) => copyFromLibrary(c, actor(t2), null));
    expect(own).toMatchObject({ ok: true, run: { copied: [], noMatch: [{ className: '7-A', subjectName: 'Maths' }], unitsCopied: 0 } });
    expect(await unitsOf(A, C6, MATHS)).toEqual([]);
  });

  it('fills a class-subject with the library’s units in order, marked as the library’s, and reports the subject with no match', async () => {
    const result = await as(principal, (c) => copyFromLibrary(c, actor(principal), null));
    if (!result.ok) throw new Error('unreachable');
    expect(result.run.copied.map((c) => `${c.className} ${c.subjectName}: ${c.units}`)).toEqual(['6-A HINDI: 1', '6-A Maths: 3']);
    expect(result.run.noMatch.map((c) => `${c.className} ${c.subjectName}`)).toEqual(['6-A Sanskrit', '7-A Maths']);
    expect(result.run.unitsCopied).toBe(4);
    expect(await unitsOf(A, C6, MATHS)).toEqual([
      { position: 1, chapter: 'Knowing our numbers', topic: 'Comparing numbers', source: 'library' },
      { position: 2, chapter: 'Knowing our numbers', topic: 'Large numbers', source: 'library' },
      { position: 3, chapter: 'Whole numbers', topic: 'Whole numbers', source: 'library' },
    ]);
    expect(await unitsOf(A, C6, HINDI)).toEqual([{ position: 1, chapter: 'Vasant: Vah Chidiya Jo', topic: 'Vasant: Vah Chidiya Jo', source: 'library' }]);
    expect(await unitsOf(A, C6, SANSKRIT)).toEqual([]);
    // One audit row for each run, with counts only.
    const audit = await rows(`select after_state from audit_log where school_id = $1 and event_action = 'syllabus.copied_from_library' order by audit_id`, [A]);
    expect(audit).toHaveLength(2);
    expect(audit[1].after_state).toEqual({ board_id: 'cbse', scope: 'all', class_subjects_copied: 2, units_copied: 4, left_alone: 0, no_match: 2 });
  });

  it('a second run copies nothing and says the class-subjects were left alone', async () => {
    const again = await as(principal, (c) => copyFromLibrary(c, actor(principal), null));
    if (!again.ok) throw new Error('unreachable');
    expect(again.run).toMatchObject({ copied: [], unitsCopied: 0 });
    expect(again.run.leftAlone.map((c) => `${c.className} ${c.subjectName}: ${c.units}`)).toEqual(['6-A HINDI: 1', '6-A Maths: 3']);
    expect(await unitsOf(A, C6, MATHS)).toHaveLength(3);
    expect(await rows(`select 1 from audit_log where school_id = $1 and event_action = 'syllabus.copied_from_library'`, [A])).toHaveLength(3);
  });

  it('leaves another school’s syllabus untouched', async () => {
    expect(await unitsOf(B, B6, B_MATHS)).toEqual([{ position: 1, chapter: 'B chapter', topic: 'B topic', source: 'school' }]);
    expect(await rows(`select 1 from audit_log where school_id = $1 and event_action = 'syllabus.copied_from_library'`, [B])).toEqual([]);
  });

  it('is read by Taught today, the Daily Pulse and Curriculum Gap with nothing else changed', async () => {
    // Taught today lists the units, in order, none taught.
    const listed = await as(t1, (c) => unitsFor(c, A, [{ class_id: C6, subject_id: MATHS }]));
    expect(listed.map((x) => [x.position, x.topic, x.taught])).toEqual([[1, 'Comparing numbers', false], [2, 'Large numbers', false], [3, 'Whole numbers', false]]);
    // Curriculum Gap lists the same units, each "not yet taught", from the database's own reader.
    const gap = await as(principal, (c) => unitFacts(c, C6, MATHS, SESSION));
    expect(gap.map((x) => [x.place, x.chapter, x.topic, x.lessons])).toEqual([[1, 'Knowing our numbers', 'Comparing numbers', 0], [2, 'Knowing our numbers', 'Large numbers', 0], [3, 'Whole numbers', 'Whole numbers', 0]]);
    // One tap on the first unit prepares the day's Pulse draft for that topic, and the unit shows as taught in both.
    const unit = listed[0];
    const tapped = await as(t1, (c) => recordTaught(c, actor(t1), { classId: C6, subjectId: MATHS, topic: unit.topic, status: 'taught', date: DAY, teacherId: null, unitId: unit.unit_id, note: null }));
    expect(tapped).toMatchObject({ kind: 'ok', created: true });
    expect(await rows(`select topic, status from pulse_messages where school_id = $1 and class_id = $2 and subject_id = $3`, [A, C6, MATHS])).toEqual([{ topic: 'Comparing numbers', status: 'draft' }]);
    expect((await as(t1, (c) => unitsFor(c, A, [{ class_id: C6, subject_id: MATHS }]))).map((x) => x.taught)).toEqual([true, false, false]);
    expect((await as(principal, (c) => unitFacts(c, C6, MATHS, SESSION))).map((x) => x.lessons)).toEqual([1, 0, 0]);
  });

  it('turns the setup checklist’s syllabus step done when every taught class-subject is mapped', async () => {
    const step = async () => (await as(principal, (c) => onboardingChecklist(c, A))).find((i) => i.id === 'syllabus');
    // Class 6 Sanskrit and class 7 Maths still have no map: 2 of 4 mapped.
    expect(await step()).toMatchObject({ done: false, count: 2, without: 2, href: '/app/syllabus' });
    await as(principal, (c) =>
      c.query(`insert into syllabus_units (school_id, class_id, subject_id, position, chapter, topic) values ($1, $2, $3, 1, 'Ch', 'T'), ($1, $4, $5, 1, 'Ch', 'T')`, [A, C6, SANSKRIT, C7, MATHS])
    );
    expect(await step()).toMatchObject({ done: true, count: 4, without: 0 });
  });
});
