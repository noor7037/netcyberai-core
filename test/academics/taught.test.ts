import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { parseSyllabusInput } from '@/lib/academics/syllabus';
import { TAUGHT_MARK, sendTaughtMark, type TaughtMark } from '@/lib/offline/taught-sender';
import { createOutbox, type Sender } from '@/lib/offline/outbox';
import { memoryStore } from '@/lib/offline/store';
import { addUnits, coverage, parseUnitLines, recordTaught, removeUnit, taughtTapCoverage, unitsFor, type TaughtInput } from '@/lib/academics/taught';

// One tap "taught today" (D5, docs/20 5d, C147), on the whole real schema as
// app_user: the classwork log row, the Pulse draft and the measurement are
// each written once, and a second tap changes them instead of adding more.

const A = 'a7000000-0000-4000-8000-000000000001';
const B = 'a7000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'a7000000-0000-4000-8000-0000000000a1';
const T1 = 'a7000000-0000-4000-8000-0000000000a2';
const T2 = 'a7000000-0000-4000-8000-0000000000a3';
const T1_PROFILE = 'a7000000-0000-4000-8000-0000000000f2';
const T2_PROFILE = 'a7000000-0000-4000-8000-0000000000f3';
const C5 = 'a7000000-0000-4000-8000-0000000000c1';
const C6 = 'a7000000-0000-4000-8000-0000000000c2';
const MATHS = 'a7000000-0000-4000-8000-0000000000d1';
const HINDI = 'a7000000-0000-4000-8000-0000000000d2';
const DAY = '2026-10-12'; // a Monday

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
const tap = (who: Who, more: Partial<TaughtInput> = {}) =>
  as(who, (c) => recordTaught(c, actor(who), { classId: C5, subjectId: MATHS, topic: 'Fractions: halves and quarters', status: 'taught', date: DAY, teacherId: who.role === 'teacher' ? null : T1_PROFILE, unitId: null, note: null, ...more }));
const log = () => rows(`select progress_id, class_id, subject_id, date::text as date, topic, status, unit_id, note from syllabus_progress where school_id = $1 order by date, class_id, subject_id`, [A]);
const drafts = () => rows(`select pulse_id, class_id, subject_id, topic, exception_state, status, sent_on::text as sent_on, created_by, source_progress_id, body_hinglish from pulse_messages where school_id = $1 order by sent_on, class_id, subject_id`, [A]);
const taps = () => rows(`select kind, class_id, day::text as day, value::int as value from usage_events where school_id = $1 order by day, class_id`, [A]);
const reset = () => db.pg.exec(`delete from pulse_messages; delete from syllabus_progress; delete from syllabus_units; delete from usage_events;`);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${T1}', '${A}', 't1@a.invalid', 'teacher', 'Teacher One'), ('${T2}', '${A}', 't2@a.invalid', 'teacher', 'Teacher Two');
    insert into teachers (teacher_id, school_id, user_id, name) values ('${T1_PROFILE}', '${A}', '${T1}', 'Teacher One'), ('${T2_PROFILE}', '${A}', '${T2}', 'Teacher Two');
    insert into classes (class_id, school_id, name) values ('${C5}', '${A}', '5-A'), ('${C6}', '${A}', '6-A');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths'), ('${HINDI}', '${A}', 'Hindi');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values
      ('${A}', '${T1_PROFILE}', '${MATHS}', '${C5}'), ('${A}', '${T1_PROFILE}', '${HINDI}', '${C5}'), ('${A}', '${T2_PROFILE}', '${MATHS}', '${C6}');
  `);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('one tap', () => {
  it('writes exactly one classwork log row, one Pulse draft and one measurement; a second tap changes them and adds nothing', async () => {
    await reset();
    const first = await tap(t1);
    expect(first).toMatchObject({ kind: 'ok', created: true });
    expect(await log()).toMatchObject([{ class_id: C5, subject_id: MATHS, date: DAY, topic: 'Fractions: halves and quarters', status: 'taught', unit_id: null, note: null }]);
    const [draft] = await drafts();
    expect(draft).toMatchObject({ class_id: C5, subject_id: MATHS, topic: 'Fractions: halves and quarters', exception_state: 'taught', status: 'draft', sent_on: DAY, created_by: T1, body_hinglish: '' });
    expect(draft.source_progress_id).toBe((await log())[0].progress_id);
    expect(await taps()).toEqual([{ kind: 'taught.tap', class_id: C5, day: DAY, value: 1 }]);

    const second = await tap(t1, { topic: 'Fractions: comparing', status: 'partial', note: 'Half the class needs one more period' });
    expect(second).toMatchObject({ kind: 'ok', created: false });
    if (first.kind !== 'ok' || second.kind !== 'ok') throw new Error('unreachable');
    expect(second.entry.progress_id).toBe(first.entry.progress_id);
    expect(second.pulseId).toBe(first.pulseId);
    expect(await log()).toMatchObject([{ topic: 'Fractions: comparing', status: 'partial', note: 'Half the class needs one more period' }]);
    expect(await drafts()).toMatchObject([{ pulse_id: draft.pulse_id, topic: 'Fractions: comparing', exception_state: 'partial', status: 'draft' }]);
    expect(await taps()).toHaveLength(1);
    // Both taps are in the audit log.
    expect((await rows(`select event_action from audit_log where school_id = $1 and target_id = $2 order by audit_id`, [A, first.entry.progress_id])).map((r: { event_action: string }) => r.event_action)).toEqual(['syllabus.record', 'syllabus.update']);
  });

  it('a lesson not taught is never prepared as taught', async () => {
    await reset();
    await tap(t1, { status: 'not_taught', topic: 'Fractions: word problems' });
    expect(await drafts()).toMatchObject([{ exception_state: 'not_taught', status: 'draft' }]);
  });

  it('a topic typed by hand saves with no syllabus map', async () => {
    await reset();
    expect(await rows(`select 1 from syllabus_units`)).toEqual([]);
    const parsed = parseSyllabusInput({ classId: C5, subjectId: HINDI, topic: '  Kabir ke   dohe ', status: 'taught' }, DAY);
    expect(parsed).toMatchObject({ ok: true, value: { topic: 'Kabir ke dohe', date: DAY } });
    expect(await tap(t1, { subjectId: HINDI, topic: 'Kabir ke dohe' })).toMatchObject({ kind: 'ok', created: true });
    expect(await log()).toMatchObject([{ subject_id: HINDI, topic: 'Kabir ke dohe', unit_id: null }]);
  });

  it('a message that was made ready follows a changed lesson back to draft; one already sent is left as it was', async () => {
    await reset();
    await tap(t1);
    await db.pg.query(`update pulse_messages set status = 'ready'`);
    await tap(t1, { topic: 'Fractions: on the number line' });
    expect(await drafts()).toMatchObject([{ status: 'draft', topic: 'Fractions: on the number line' }]);
    await db.pg.query(`update pulse_messages set status = 'sent'`);
    const again = await tap(t1, { topic: 'Something else' });
    expect(again.kind).toBe('ok');
    expect(await drafts()).toMatchObject([{ status: 'sent', topic: 'Fractions: on the number line' }]);
    expect(await drafts()).toHaveLength(1);
  });

  it('a teacher records only their own class and subject, as themselves; another teacher sees neither the log nor the draft', async () => {
    await reset();
    // T2 teaches Maths in 6-A, not in 5-A.
    await expect(tap(t2)).rejects.toThrow(/row-level security/);
    // A teacher cannot record under another teacher's profile.
    await tap(t1, { teacherId: T2_PROFILE });
    expect(await rows(`select teacher_id from syllabus_progress`)).toEqual([{ teacher_id: T1_PROFILE }]);
    const seen = (who: Who, table: string) => as(who, (c) => c.query(`select 1 from ${table}`).then((r: { rows: unknown[] }) => r.rows.length));
    expect([await seen(t1, 'syllabus_progress'), await seen(t1, 'pulse_messages')]).toEqual([1, 1]);
    expect([await seen(t2, 'syllabus_progress'), await seen(t2, 'pulse_messages')]).toEqual([0, 0]);
    expect(await as(t2, (c) => c.query(`update pulse_messages set status = 'ready' returning 1`).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    // The office records for a named teacher.
    expect(await tap(principal, { subjectId: HINDI, topic: 'Kabir' })).toMatchObject({ kind: 'ok', created: true });
    expect(await log()).toHaveLength(2);
  });
});

describe('with no network', () => {
  it('the tap waits on the phone, is sent once, and a lost answer sent again changes nothing', async () => {
    await reset();
    const store = memoryStore();
    const outbox = createOutbox(store);
    const net = { on: false, loseAnswer: true, calls: 0 };
    const senders: Record<string, Sender> = {
      [TAUGHT_MARK]: (op) =>
        sendTaughtMark(op, store, async (_url, init) => {
          if (!net.on) throw new TypeError('network off');
          net.calls += 1;
          const body = JSON.parse(String(init.body));
          const parsed = parseSyllabusInput(body, DAY);
          if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
          const result = await as(t1, (c) => recordTaught(c, actor(t1), { ...parsed.value, unitId: body.unitId ?? null, note: body.note ?? null }));
          if (net.loseAnswer) {
            net.loseAnswer = false;
            throw new TypeError('answer lost');
          }
          return Response.json(result, { status: 201 });
        }),
    };
    await outbox.add<TaughtMark>(TAUGHT_MARK, DAY, { classId: C5, subjectId: MATHS, topic: 'Fractions: halves', status: 'taught', unitId: null, note: null });
    expect(await outbox.flush(senders)).toMatchObject({ waiting: 1, failed: 0 });
    expect(await log()).toEqual([]);
    net.on = true;
    expect(await outbox.flush(senders)).toMatchObject({ waiting: 1 }); // saved, but the phone did not hear
    expect(await outbox.flush(senders)).toMatchObject({ waiting: 0, failed: 0 });
    expect(net.calls).toBe(2);
    expect([(await log()).length, (await drafts()).length, (await taps()).length]).toEqual([1, 1, 1]);
    // A lesson dated too far back is refused and stays visible on the phone.
    await outbox.add<TaughtMark>(TAUGHT_MARK, '2026-09-01', { classId: C5, subjectId: MATHS, topic: 'Old', status: 'taught', unitId: null, note: null });
    expect(await outbox.flush(senders)).toMatchObject({ waiting: 0, failed: 1 });
    expect(await outbox.all()).toMatchObject([{ state: 'failed', reason: 'not_accepted', detail: { topic: 'Old' } }]);
  });
});

describe('the syllabus map', () => {
  it('topics are typed or pasted, one per line, under the chapter last named', () => {
    expect(parseUnitLines('Fractions | Halves and quarters\n  Comparing fractions \n\nDecimals|Tenths\n| Hundredths\n|\n')).toEqual([
      { chapter: 'Fractions', topic: 'Halves and quarters' },
      { chapter: 'Fractions', topic: 'Comparing fractions' },
      { chapter: 'Decimals', topic: 'Tenths' },
      { chapter: 'Decimals', topic: 'Hundredths' },
    ]);
    expect(parseUnitLines('Just a topic')).toEqual([{ chapter: 'Just a topic', topic: 'Just a topic' }]);
  });

  it('coverage is taught units over planned units, and matches a hand count', async () => {
    await reset();
    const pair = [{ class_id: C5, subject_id: MATHS }];
    expect(coverage(await as(t1, (c) => unitsFor(c, A, pair)))).toEqual({ planned: 0, taught: 0, percent: null });
    expect(await as(t1, (c) => addUnits(c, actor(t1), { classId: C5, subjectId: MATHS }, parseUnitLines('Fractions | Halves\nQuarters\nComparing\nDecimals | Tenths')))).toBe(4);
    expect(await as(t1, (c) => addUnits(c, actor(t1), { classId: C5, subjectId: MATHS }, parseUnitLines('Decimals | Hundredths')))).toBe(1);
    const units = await as(t1, (c) => unitsFor(c, A, pair));
    expect(units.map((u) => [u.position, u.chapter, u.topic, u.taught])).toEqual([[1, 'Fractions', 'Halves', false], [2, 'Fractions', 'Quarters', false], [3, 'Fractions', 'Comparing', false], [4, 'Decimals', 'Tenths', false], [5, 'Decimals', 'Hundredths', false]]);

    // By hand: 5 planned. Halves taught (Monday), Quarters taught (Tuesday), Comparing only partly (Wednesday). 2 of 5 = 40%.
    await tap(t1, { unitId: units[0].unit_id, topic: 'Halves', date: '2026-10-12' });
    await tap(t1, { unitId: units[1].unit_id, topic: 'Quarters', date: '2026-10-13' });
    await tap(t1, { unitId: units[2].unit_id, topic: 'Comparing', date: '2026-10-14', status: 'partial' });
    expect(coverage(await as(t1, (c) => unitsFor(c, A, pair)))).toEqual({ planned: 5, taught: 2, percent: 40 });
    expect((await log()).map((l: { unit_id: string }) => l.unit_id)).toEqual([units[0].unit_id, units[1].unit_id, units[2].unit_id]);
  });

  it('a topic of another class’s map is refused; a topic a lesson used stays; an unused one can be removed', async () => {
    const mine = await as(t1, (c) => unitsFor(c, A, [{ class_id: C5, subject_id: MATHS }]));
    await as(t2, (c) => addUnits(c, actor(t2), { classId: C6, subjectId: MATHS }, [{ chapter: 'Integers', topic: 'Negative numbers' }]));
    const theirs = await as(t2, (c) => unitsFor(c, A, [{ class_id: C6, subject_id: MATHS }]));
    expect(await tap(t1, { unitId: theirs[0].unit_id, date: '2026-10-15' })).toEqual({ kind: 'unknown_unit' });
    expect(await as(t1, (c) => removeUnit(c, actor(t1), mine[0].unit_id))).toBe('in_use');
    expect(await as(t1, (c) => removeUnit(c, actor(t1), mine[4].unit_id))).toBe('removed');
    expect(await as(t1, (c) => removeUnit(c, actor(t1), mine[4].unit_id))).toBe('not_found');
  });

  it('a teacher reads and writes only their own classes’ map', async () => {
    // T1 has nothing in 6-A; T2 has nothing in 5-A.
    expect(await as(t1, (c) => unitsFor(c, A, [{ class_id: C6, subject_id: MATHS }]))).toEqual([]);
    expect(await as(t2, (c) => unitsFor(c, A, [{ class_id: C5, subject_id: MATHS }]))).toEqual([]);
    await expect(as(t2, (c) => addUnits(c, actor(t2), { classId: C5, subjectId: MATHS }, [{ chapter: 'x', topic: 'y' }]))).rejects.toThrow(/row-level security/);
    const theirs = await as(t2, (c) => unitsFor(c, A, [{ class_id: C6, subject_id: MATHS }]));
    expect(await as(t1, (c) => removeUnit(c, actor(t1), theirs[0].unit_id))).toBe('not_found');
    expect(await as(principal, (c) => unitsFor(c, A, [{ class_id: C5, subject_id: MATHS }, { class_id: C6, subject_id: MATHS }]))).toHaveLength(5);
    expect(await rows(`select grantee from information_schema.role_table_grants where table_name = 'syllabus_units' and grantee in ('anon', 'authenticated', 'PUBLIC')`)).toEqual([]);
  });
});

describe('"taught" tap coverage against the timetable', () => {
  it('for a seeded week matches a hand count', async () => {
    await reset();
    // The timetable: 5-A has Maths and Hindi on Monday and Tuesday (Maths twice on Monday), Maths only on Wednesday. 6-A has Maths on Monday.
    await db.pg.exec(`
      delete from timetable_entries;
      insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values
        ('${A}', '${C5}', 1, 1, '${MATHS}', '${T1}'), ('${A}', '${C5}', 1, 2, '${HINDI}', '${T1}'), ('${A}', '${C5}', 1, 3, '${MATHS}', '${T1}'),
        ('${A}', '${C5}', 2, 1, '${MATHS}', '${T1}'), ('${A}', '${C5}', 2, 2, '${HINDI}', '${T1}'),
        ('${A}', '${C5}', 3, 1, '${MATHS}', '${T1}'),
        ('${A}', '${C6}', 1, 1, '${MATHS}', '${T2}');
    `);
    // The taps: Monday both lessons of 5-A, and 6-A's; Tuesday only Maths (as "not taught": still a mark); Wednesday none.
    await tap(t1, { date: '2026-10-12' });
    await tap(t1, { date: '2026-10-12', subjectId: HINDI, topic: 'Kabir' });
    await tap(t2, { date: '2026-10-12', classId: C6, topic: 'Integers' });
    await tap(t1, { date: '2026-10-13', status: 'not_taught' });
    const week = await as(principal, (c) => taughtTapCoverage(c, A, '2026-10-12', '2026-10-18'));
    expect(week.map((w) => [w.day, w.class_name, w.scheduled, w.marked])).toEqual([
      ['2026-10-12', '5-A', 2, 2],
      ['2026-10-12', '6-A', 1, 1],
      ['2026-10-13', '5-A', 2, 1],
      ['2026-10-14', '5-A', 1, 0],
    ]);
    // One measurement per first tap, by class and day, with nobody's name.
    expect(await taps()).toEqual([
      { kind: 'taught.tap', class_id: C5, day: '2026-10-12', value: 1 },
      { kind: 'taught.tap', class_id: C5, day: '2026-10-12', value: 1 },
      { kind: 'taught.tap', class_id: C6, day: '2026-10-12', value: 1 },
      { kind: 'taught.tap', class_id: C5, day: '2026-10-13', value: 1 },
    ]);
  });
});
