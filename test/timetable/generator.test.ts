import { describe, expect, it } from 'vitest';
import { diffWeeks, generateTimetable, runThrough, swapInWeek, weekProblems, type GeneratorInput, type Load, type Unavailable } from '@/lib/timetable/generator';
import type { Slot } from '@/lib/timetable/plan';

// The timetable generator's rules (docs/28 slice 10f, C229), with no database. The acceptance sentence: a proposal
// never puts a teacher in two classes at once or a class in two subjects in one period, and meets each subject's
// periods or says which it could not. Also: the same input gives the same week, a teacher's unavailable periods and
// the limit of periods in a row hold, the periods of classes not planned are kept, a week with no answer says what
// was not placed and why, a tight week is found, and a school-sized week takes well under a few seconds.

const id = (p: string, n: number) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MON_SAT = [1, 2, 3, 4, 5, 6];

// Every rule, checked from scratch on the week the generator gave: the same check publishing runs on a changed week.
function expectSound(input: GeneratorInput, entries: Slot[]) {
  expect(weekProblems(entries, input)).toEqual([]);
  const placed = new Map<string, number>();
  for (const e of entries) placed.set(`${e.classId}:${e.subjectId}`, (placed.get(`${e.classId}:${e.subjectId}`) ?? 0) + 1);
  // Every lesson is one of a load, by that load's own teacher, and never more than the load asks for.
  for (const e of entries) {
    const load = input.loads.find((l) => l.classId === e.classId && l.subjectId === e.subjectId);
    expect(load?.teacherUserId).toBe(e.teacherUserId);
    expect(placed.get(`${e.classId}:${e.subjectId}`)!).toBeLessThanOrEqual(load!.periods);
  }
  return placed;
}
function expectComplete(input: GeneratorInput) {
  const result = generateTimetable(input);
  expect(result.unplaced).toEqual([]);
  const placed = expectSound(input, result.entries);
  for (const l of input.loads) expect(placed.get(`${l.classId}:${l.subjectId}`), `${l.classId} ${l.subjectId}`).toBe(l.periods);
  return result;
}

// A school: `classes` sections, each with the subjects' periods a week; each teacher teaches one subject to as many
// sections as fit under `perTeacher` periods. A third of the teachers cannot teach one period of the week.
function school(classes: number, weights: number[], perTeacher: number, maxConsecutive: number): GeneratorInput {
  const loads: Load[] = [];
  let teachers = 0;
  weights.forEach((w, s) => {
    const each = Math.max(1, Math.floor(perTeacher / w));
    for (let c = 0; c < classes; c++) loads.push({ classId: id('c', c), subjectId: id('d', s), teacherUserId: id('a', teachers + Math.floor(c / each)), periods: w });
    teachers += Math.ceil(classes / each);
  });
  const unavailable: Unavailable[] = [];
  for (let t = 0; t < teachers; t += 3) unavailable.push({ teacherUserId: id('a', t), weekday: 1 + (t % 6), period: 1 + (t % 8) });
  return { days: MON_SAT, periods: 8, maxConsecutive, loads, unavailable, fixed: [] };
}

describe('the proposal', () => {
  const small: GeneratorInput = {
    days: [1, 2, 3],
    periods: 4,
    maxConsecutive: 3,
    loads: [
      { classId: id('c', 1), subjectId: id('d', 1), teacherUserId: id('a', 1), periods: 3 },
      { classId: id('c', 1), subjectId: id('d', 2), teacherUserId: id('a', 2), periods: 3 },
      { classId: id('c', 2), subjectId: id('d', 1), teacherUserId: id('a', 1), periods: 3 },
      { classId: id('c', 2), subjectId: id('d', 2), teacherUserId: id('a', 3), periods: 5 },
      { classId: id('c', 3), subjectId: id('d', 3), teacherUserId: id('a', 2), periods: 6 },
    ],
    unavailable: [{ teacherUserId: id('a', 1), weekday: 1, period: null }, { teacherUserId: id('a', 2), weekday: 2, period: 4 }],
    fixed: [],
  };

  it('never a teacher in two classes at once or a class with two subjects in one period; each subject’s periods met', () => {
    const { entries } = expectComplete(small);
    // Teacher a1 cannot teach on Monday at all, and a2 not on Tuesday's period 4.
    expect(entries.filter((e) => e.teacherUserId === id('a', 1) && e.weekday === 1)).toEqual([]);
    expect(entries.filter((e) => e.teacherUserId === id('a', 2) && e.weekday === 2 && e.period === 4)).toEqual([]);
    // A subject is spread over the week before a second period of it falls on one day.
    const days = (c: number, s: number) => entries.filter((e) => e.classId === id('c', c) && e.subjectId === id('d', s)).map((e) => e.weekday);
    expect(new Set(days(1, 2)).size).toBe(3);
  });

  it('the same input gives the same week, whatever order the input comes in', () => {
    const first = generateTimetable(small);
    expect(generateTimetable(small)).toEqual(first);
    const shuffled = { ...small, loads: [...small.loads].reverse(), unavailable: [...small.unavailable].reverse(), days: [3, 1, 2] };
    expect(generateTimetable(shuffled)).toEqual(first);
    expect(JSON.stringify(generateTimetable(school(12, [8, 7, 7, 6, 6, 5, 5, 4], 36, 4)))).toBe(JSON.stringify(generateTimetable(school(12, [8, 7, 7, 6, 6, 5, 5, 4], 36, 4))));
  });

  it('the limit of periods in a row holds, counting the periods a teacher keeps in classes not planned', () => {
    // One teacher, one day of six periods, at most two in a row, and period 6 kept in a class not planned. Without
    // that period four would fit (1 2 _ 4 5 _); with it, three is the most, and the fourth is said not to fit.
    const input: GeneratorInput = {
      days: [1],
      periods: 6,
      maxConsecutive: 2,
      loads: [{ classId: id('c', 1), subjectId: id('d', 1), teacherUserId: id('a', 1), periods: 4 }],
      unavailable: [],
      fixed: [{ classId: id('c', 9), weekday: 1, period: 6, subjectId: id('d', 9), teacherUserId: id('a', 1) }],
    };
    const { entries, unplaced } = generateTimetable(input);
    expectSound(input, entries);
    expect(entries).toHaveLength(3);
    expect(unplaced).toEqual([{ classId: id('c', 1), subjectId: id('d', 1), teacherUserId: id('a', 1), wanted: 4, placed: 3, reason: 'consecutive_limit' }]);
    // Never in the fixed period, and the fixed period itself is not proposed again: it is kept as it is.
    expect(entries.some((e) => e.period === 6 || e.classId === id('c', 9))).toBe(false);
    expect(expectComplete({ ...input, fixed: [] }).entries.map((e) => e.period)).toHaveLength(4);
    expect(runThrough([1, 2, 4, 5, 6], 5)).toBe(3);
    expect(runThrough([1, 2, 4, 5, 6], 3)).toBe(0);
  });

  it('a run kept in a class not planned that is already over the limit does not shut the rest of that day', () => {
    // Periods 1 to 3 kept in a class not planned (three in a row, over the limit of two), and the only day: the two
    // lessons go later that day, never in period 4 (that would make four in a row).
    const input: GeneratorInput = {
      days: [1],
      periods: 8,
      maxConsecutive: 2,
      loads: [{ classId: id('c', 1), subjectId: id('d', 1), teacherUserId: id('a', 1), periods: 2 }],
      unavailable: [],
      fixed: [1, 2, 3].map((period) => ({ classId: id('c', 9), weekday: 1, period, subjectId: id('d', 9), teacherUserId: id('a', 1) })),
    };
    const { entries } = expectComplete(input);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.period >= 5)).toBe(true);
    // Periods 5 to 8 hold three at most (5 6 _ 8), so of four lessons the fourth is said not to fit.
    const four: GeneratorInput = { ...input, loads: [{ ...input.loads[0], periods: 4 }] };
    const more = generateTimetable(four);
    expectSound(four, more.entries);
    expect(more.entries).toHaveLength(3);
    expect(more.unplaced.map((u) => [u.reason, u.wanted - u.placed])).toEqual([['consecutive_limit', 1]]);
  });

  it('a tight week is found: every class and every teacher busy in every period', () => {
    // Six classes and six teachers, one day of six periods, each class with each teacher once (a Latin square).
    const loads: Load[] = [];
    for (let c = 0; c < 6; c++) for (let t = 0; t < 6; t++) loads.push({ classId: id('c', c), subjectId: id('d', t), teacherUserId: id('a', t), periods: 1 });
    expectComplete({ days: [1], periods: 6, maxConsecutive: 6, loads, unavailable: [], fixed: [] });
    // Two days of three periods, each class with each teacher twice, every one of them busy all day.
    const twice = loads.filter((l) => l.classId < id('c', 3) && l.teacherUserId! < id('a', 3)).map((l) => ({ ...l, periods: 2 }));
    expectComplete({ days: [1, 2], periods: 3, maxConsecutive: 3, loads: twice, unavailable: [], fixed: [] });
    // Classes full all week, teachers at 36 of 48 periods, at most four in a row, some periods unavailable.
    expectComplete(school(8, [8, 7, 7, 6, 6, 5, 5, 4], 36, 4));
  });

  it('a school-sized week: forty classes of 48 periods each, placed in full well within a few seconds', () => {
    const input = school(40, [8, 7, 7, 6, 6, 5, 5, 4], 36, 4);
    expect(input.loads.length).toBe(320);
    const started = Date.now();
    const { entries } = expectComplete(input);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(entries).toHaveLength(40 * 48);
    // With no tries at moving lessons out of the way at all, the week is still sound and what is short is said.
    const quick = generateTimetable(school(40, [8, 7, 7, 6, 6, 5, 5, 4], 42, 3), 0);
    expectSound(school(40, [8, 7, 7, 6, 6, 5, 5, 4], 42, 3), quick.entries);
    for (const u of quick.unplaced) expect(u.placed).toBeLessThan(u.wanted);
    expect(quick.entries.length + quick.unplaced.reduce((n, u) => n + u.wanted - u.placed, 0)).toBe(40 * 48);
  });

  it('with no answer, it says exactly what could not be placed and why: never a silent partial', () => {
    const L = (c: number, s: number, t: number | null, periods: number): Load => ({ classId: id('c', c), subjectId: id('d', s), teacherUserId: t === null ? null : id('a', t), periods });
    const base = { days: [1, 2], periods: 3, maxConsecutive: 3, unavailable: [] as Unavailable[], fixed: [] as Slot[] };
    // No teacher for the subject.
    expect(generateTimetable({ ...base, loads: [L(1, 1, null, 2)] }).unplaced).toEqual([{ classId: id('c', 1), subjectId: id('d', 1), teacherUserId: null, wanted: 2, placed: 0, reason: 'no_teacher' }]);
    // The class needs seven periods and its week has six.
    const full = generateTimetable({ ...base, loads: [L(1, 1, 1, 4), L(1, 2, 2, 3)] });
    expect(full.entries).toHaveLength(6);
    expect(full.unplaced.map((u) => [u.reason, u.wanted - u.placed])).toEqual([['class_week_full', 1]]);
    // The teacher needs five periods and is free for four (two unavailable).
    const busy = generateTimetable({ ...base, loads: [L(1, 1, 1, 3), L(2, 1, 1, 2)], unavailable: [{ teacherUserId: id('a', 1), weekday: 2, period: 2 }, { teacherUserId: id('a', 1), weekday: 2, period: 3 }] });
    expect(busy.unplaced.map((u) => [u.reason, u.wanted - u.placed])).toEqual([['teacher_week_full', 1]]);
    // Each needs one period; both teachers can teach only the first period of Monday, and the class has one class there.
    const one = generateTimetable({
      ...base,
      loads: [L(1, 1, 1, 1), L(1, 2, 2, 1)],
      unavailable: [1, 2].flatMap((t) => [{ teacherUserId: id('a', t), weekday: 2, period: null }, { teacherUserId: id('a', t), weekday: 1, period: 2 }, { teacherUserId: id('a', t), weekday: 1, period: 3 }]),
    });
    expect(one.entries).toHaveLength(1);
    expect(one.unplaced).toEqual([{ classId: id('c', 1), subjectId: id('d', 2), teacherUserId: id('a', 2), wanted: 1, placed: 0, reason: 'no_common_period' }]);
    // Three periods a day and at most two in a row: three periods on one day cannot be.
    expect(generateTimetable({ days: [1], periods: 3, maxConsecutive: 2, loads: [L(1, 1, 1, 3)], unavailable: [], fixed: [] }).unplaced).toEqual([{ classId: id('c', 1), subjectId: id('d', 1), teacherUserId: id('a', 1), wanted: 3, placed: 2, reason: 'consecutive_limit' }]);
    // What is placed is still sound.
    expectSound({ ...base, loads: [L(1, 1, 1, 4), L(1, 2, 2, 3)] }, full.entries);
  });
});

describe('checking a changed week', () => {
  const C1 = id('c', 1);
  const C2 = id('c', 2);
  const [T1, T2] = [id('a', 1), id('a', 2)];
  const [MATHS, HINDI] = [id('d', 1), id('d', 2)];
  const s = (classId: string, weekday: number, period: number, teacherUserId: string, subjectId = MATHS): Slot => ({ classId, weekday, period, subjectId, teacherUserId });
  const rules = { days: [1, 2], periods: 4, maxConsecutive: 2, unavailable: [{ teacherUserId: T2, weekday: 2, period: 1 }] as Unavailable[], fixed: [s(id('c', 9), 1, 3, T1)] };
  const week = [s(C1, 1, 1, T1), s(C1, 1, 2, T2, HINDI), s(C2, 1, 1, T2, HINDI), s(C2, 2, 2, T1)];

  it('a swap of two periods of one class, or a move to a free one, when every rule still holds', () => {
    expect(weekProblems(week, rules)).toEqual([]);
    const swapped = swapInWeek(week, C1, { weekday: 1, period: 1 }, { weekday: 1, period: 2 }, rules);
    expect(swapped.ok).toBe(false); // T2 would be in 5-A and 6-A in period 1
    expect(swapped).toMatchObject({ reason: 'teacher_clash', with: { classId: C2, period: 1 } });
    const moved = swapInWeek(week, C1, { weekday: 1, period: 1 }, { weekday: 2, period: 4 }, rules);
    expect(moved).toEqual({ ok: true, entries: [s(C1, 1, 2, T2, HINDI), s(C1, 2, 4, T1), s(C2, 1, 1, T2, HINDI), s(C2, 2, 2, T1)] });
    if (moved.ok) expect(weekProblems(moved.entries, rules)).toEqual([]);
  });

  it('refused: a teacher in a period they cannot teach, over the limit in a row, a fixed period, or outside the week', () => {
    expect(swapInWeek(week, C1, { weekday: 1, period: 2 }, { weekday: 2, period: 1 }, rules)).toMatchObject({ ok: false, reason: 'unavailable' });
    // T1: 6-A... period 3 on Monday is T1's fixed period in another class.
    expect(swapInWeek(week, C1, { weekday: 1, period: 1 }, { weekday: 1, period: 3 }, rules)).toMatchObject({ ok: false, reason: 'teacher_clash', with: { classId: id('c', 9) } });
    // T1 on Tuesday: periods 2 (in C2) and 3 would make... 1, 2, 3 in a row with the move to period 1 and 3.
    const longer = [...week, s(C1, 2, 3, T1, HINDI)];
    expect(swapInWeek(longer, C1, { weekday: 1, period: 1 }, { weekday: 2, period: 1 }, rules)).toMatchObject({ ok: false, reason: 'consecutive_limit' });
    expect(swapInWeek(week, C1, { weekday: 1, period: 1 }, { weekday: 3, period: 1 }, rules)).toMatchObject({ ok: false, reason: 'outside_week' });
    expect(swapInWeek(week, C1, { weekday: 1, period: 1 }, { weekday: 1, period: 1 }, rules)).toMatchObject({ ok: false, reason: 'same_slot' });
    expect(swapInWeek(week, C1, { weekday: 2, period: 1 }, { weekday: 2, period: 4 }, rules)).toMatchObject({ ok: false, reason: 'nothing_to_move' });
  });

  it('every kind of problem in a week is found', () => {
    const bad = [s(C1, 1, 1, T1), s(C1, 1, 1, T2, HINDI), s(C2, 1, 3, T1), s(C2, 2, 1, T2), s(C2, 1, 9, T2), s(C1, 1, 4, T1), s(C2, 1, 2, T1, HINDI)];
    const codes = weekProblems(bad, rules).map((p) => p.code).sort();
    // Teacher T1 has Monday's periods 1 to 4 (period 3 also a fixed period elsewhere): four lessons over the limit.
    expect(codes).toEqual(['class_clash', 'consecutive_limit', 'consecutive_limit', 'consecutive_limit', 'consecutive_limit', 'outside_week', 'teacher_clash', 'unavailable'].sort());
  });

  it('what changes: a period filled, emptied, or given another subject or teacher; the same period is no change', () => {
    const before = [s(C1, 1, 1, T1), s(C1, 1, 2, T2, HINDI), s(C2, 1, 1, T2, HINDI), s(id('c', 9), 1, 3, T1)];
    const after = [s(C1, 1, 1, T1), s(C1, 1, 2, T1, HINDI), s(C1, 2, 1, T2), s(C2, 1, 2, T2, HINDI)];
    expect(diffWeeks(before, after, [C1, C2]).map((c) => [c.classId === C1 ? '5-A' : '6-A', c.weekday, c.period, c.kind])).toEqual([
      ['5-A', 1, 2, 'changed'],
      ['5-A', 2, 1, 'added'],
      ['6-A', 1, 1, 'removed'],
      ['6-A', 1, 2, 'added'],
    ]);
  });
});
