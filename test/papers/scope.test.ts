import { describe, expect, it } from 'vitest';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { applySettingsUpdate, effectiveValues } from '@/lib/frameworks/settings-engine';
import { blueprintCheck, blueprintOf, blueprintProblems, blueprintsFrom, blueprintTotal, DEFAULT_BLUEPRINT_ROWS, DEFAULT_SECTION_ROWS, withSections, type Blueprint } from '@/lib/papers/blueprint';
import { allocate, chooseScope, difficultiesOf, largestRemainder, makePlan, markedPart, typedTargets, weightsOf, type MapUnit, type TaughtRow } from '@/lib/papers/scope';

// Question papers from what was taught (docs/36 §1.1, C362): the blueprints by exam type, the scope rules over the
// taught log, the chapters' weights and the spread of each section over the chapters. Rules only, deterministic.
// Every chapter, topic and number is made up.

const u = (n: number) => `b1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MAP: MapUnit[] = [
  { unitId: u(1), chapter: 'Fractions', topic: 'Adding fractions', position: 1 },
  { unitId: u(2), chapter: 'Fractions', topic: 'Comparing fractions', position: 2 },
  { unitId: u(3), chapter: 'Decimals', topic: 'Tenths', position: 3 },
  { unitId: u(4), chapter: 'Geometry', topic: 'Angles', position: 4 },
  { unitId: u(5), chapter: 'Algebra', topic: 'Expressions', position: 5 },
];
const log = (rows: [number | null, string][]): TaughtRow[] => rows.map(([n, date]) => ({ unitId: n === null ? null : u(n), date }));
const TAUGHT = log([
  [1, '2026-07-01'], [1, '2026-07-02'], [2, '2026-07-03'], [1, '2026-07-04'], // Fractions: 4 periods, before the unit test
  [3, '2026-08-10'], [3, '2026-08-11'], [3, '2026-08-12'], // Decimals: 3
  [4, '2026-08-20'], // Geometry: 1
  [null, '2026-08-21'], // a period logged without a topic
]);
const defaults = (): Blueprint[] => blueprintsFrom(DEFAULT_BLUEPRINT_ROWS, DEFAULT_SECTION_ROWS);

describe('blueprints (an Exams setting)', () => {
  it('every default makes a valid blueprint whose sections add up to its total', () => {
    const all = defaults();
    expect(all.map((b) => b.examType)).toEqual(DEFAULT_BLUEPRINT_ROWS.map((r) => r.exam_type));
    for (const b of all) {
      expect(blueprintCheck(b), b.examType).toEqual([]);
      expect(blueprintTotal(b.sections)).toBe(b.totalMarks);
    }
    expect(blueprintProblems(DEFAULT_BLUEPRINT_ROWS, DEFAULT_SECTION_ROWS)).toEqual([]);
    // The scope rule follows the kind of exam.
    expect(blueprintOf(all, 'weekly')?.scope).toBe('since_last_of_type');
    expect(blueprintOf(all, 'half_yearly')?.scope).toBe('session');
    expect(blueprintOf(all, 'annual')?.scope).toBe('whole_map');
    expect(blueprintOf(all, 'practical')).toBeNull();
    // An internal choice counts the questions answered: 5 of 5 marks, answer any 4, is 20.
    expect(blueprintOf(all, 'half_yearly')?.sections.find((s) => s.section === 'D')).toMatchObject({ count: 5, marksEach: 5, answerAny: 4 });
  });

  it('the setting refuses sections that do not add up, a mix that is not 100, and a section of no blueprint', () => {
    const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'exams')!;
    const stored = {};
    const bad = DEFAULT_SECTION_ROWS.map((r) => (r.exam_type === 'weekly' && r.section === 'B' ? { ...r, count: 6 } : { ...r }));
    const r1 = applySettingsUpdate(schema, stored, { set: { paper_sections: bad } }, 'principal');
    expect(r1.ok).toBe(false);
    expect(!r1.ok && r1.errors.map((e) => e.message)).toEqual(['the sections of weekly add up to 22 marks, not its total of 20']);
    const mix = DEFAULT_BLUEPRINT_ROWS.map((r) => (r.exam_type === 'unit' ? { ...r, easy: 50 } : { ...r }));
    expect(applySettingsUpdate(schema, stored, { set: { paper_blueprints: mix } }, 'principal').ok).toBe(false);
    const stray = [...DEFAULT_SECTION_ROWS.map((r) => ({ ...r })), { exam_type: 'practical', section: 'A', kind: 'long', count: 1, marks_each: 10, answer_any: 0 }];
    expect(applySettingsUpdate(schema, stored, { set: { paper_sections: stray } }, 'principal').ok).toBe(false);
    // A word that is not a rule is refused by the column's own pattern.
    const word = DEFAULT_BLUEPRINT_ROWS.map((r) => (r.exam_type === 'unit' ? { ...r, scope: 'everything' } : { ...r }));
    expect(applySettingsUpdate(schema, stored, { set: { paper_blueprints: word } }, 'principal').ok).toBe(false);
    // A teacher does not change the blueprints.
    expect(applySettingsUpdate(schema, stored, { set: { paper_blueprints: DEFAULT_BLUEPRINT_ROWS.map((r) => ({ ...r })) } }, 'teacher')).toMatchObject({ ok: false, reason: 'forbidden' });
    // A school that changes both together is fine; a school that saved nothing reads the defaults.
    const ok = applySettingsUpdate(
      schema,
      stored,
      { set: { paper_blueprints: [{ ...DEFAULT_BLUEPRINT_ROWS[0], total_marks: 22 }], paper_sections: [{ ...DEFAULT_SECTION_ROWS[0] }, { ...DEFAULT_SECTION_ROWS[1], count: 6 }] } },
      'principal'
    );
    expect(ok.ok).toBe(true);
    expect(effectiveValues(schema, {}).paper_blueprints).toEqual(DEFAULT_BLUEPRINT_ROWS);
  });

  it('a teacher may change the sections of one paper; the total follows them', () => {
    const half = blueprintOf(defaults(), 'half_yearly')!;
    const mine = withSections(half, [{ section: 'a', kind: 'objective', count: 10, marksEach: 1 }, { section: 'B', kind: 'long', count: 2, marksEach: 5, answerAny: 1 }])!;
    expect(mine.totalMarks).toBe(15);
    expect(mine.sections.map((s) => s.section)).toEqual(['A', 'B']);
    expect(blueprintCheck(mine)).toEqual([]);
    expect(blueprintCheck(withSections(half, [{ section: 'A', kind: 'essay', count: 0, marksEach: 0.25 }])!)).toEqual(expect.arrayContaining(['kind', 'count', 'marks']));
    expect(blueprintCheck(withSections(half, [{ section: 'A', kind: 'short', count: 2, marksEach: 1, answerAny: 2 }])!)).toContain('answer_any');
    expect(withSections(half, 'all')).toBeNull();
  });
});

describe('scope: what was taught decides the chapters (C362)', () => {
  const window = (after: string | null) => ({ after, from: '2026-04-01', to: '2026-09-30' });

  it('since the last paper of the same type: only what was taught after it', () => {
    const s = chooseScope('since_last_of_type', MAP, TAUGHT, window('2026-07-31'), []);
    expect(s.used).toBe('log');
    expect(s.chapters.map((c) => [c.chapter, c.periods])).toEqual([['Decimals', 3], ['Geometry', 1]]);
    expect(s.unlinked).toBe(1);
    expect(s.after).toBe('2026-07-31');
  });

  it('the session: everything taught since its first day, in the map’s order', () => {
    const s = chooseScope('session', MAP, TAUGHT, window(null), []);
    expect(s.chapters.map((c) => [c.chapter, c.periods])).toEqual([['Fractions', 4], ['Decimals', 3], ['Geometry', 1]]);
    expect(s.chapters[0].units.map((x) => [x.topic, x.periods])).toEqual([['Adding fractions', 3], ['Comparing fractions', 1]]);
  });

  it('the whole map: every chapter, taught or not', () => {
    const s = chooseScope('whole_map', MAP, TAUGHT, window(null), []);
    expect(s.used).toBe('whole_map');
    expect(s.chapters.map((c) => [c.chapter, c.periods])).toEqual([['Fractions', 4], ['Decimals', 3], ['Geometry', 1], ['Algebra', 0]]);
  });

  it('nothing logged: the paper’s own chapters, then the whole map, and it says which', () => {
    const own = chooseScope('session', MAP, [], window(null), [u(5), u(4)]);
    expect(own.used).toBe('paper_units');
    expect(own.chapters.map((c) => c.chapter)).toEqual(['Geometry', 'Algebra']);
    const none = chooseScope('since_last_of_type', MAP, TAUGHT, { after: '2026-09-01', from: '2026-04-01', to: '2026-09-30' }, []);
    expect(none.used).toBe('whole_map');
    expect(none.chapters).toHaveLength(4);
    // A period after the paper's day does not count.
    expect(chooseScope('session', MAP, log([[5, '2026-10-02']]), window(null), []).used).toBe('whole_map');
  });
});

describe('weights and marks', () => {
  it('largest remainder: the parts add up, the remainders go to the largest, the earlier on a tie', () => {
    expect(largestRemainder(80, [4, 3, 1])).toEqual([40, 30, 10]);
    expect(largestRemainder(20, [1, 1, 1])).toEqual([7, 7, 6]);
    expect(largestRemainder(25, [4, 3, 1])).toEqual([13, 9, 3]);
    expect(largestRemainder(7.5, [1, 1])).toEqual([3.8, 3.7]);
    expect(largestRemainder(10, [0, 0])).toEqual([0, 0]);
  });

  it('periods, with a chapter of none counted as one; or equal', () => {
    expect(weightsOf([{ periods: 4 }, { periods: 0 }], 'periods')).toEqual([4, 1]);
    expect(weightsOf([{ periods: 4 }, { periods: 0 }], 'equal')).toEqual([1, 1]);
  });

  it('the teacher’s own marks per chapter must add up to the total', () => {
    const s = chooseScope('session', MAP, TAUGHT, { after: null, from: '2026-04-01', to: '2026-09-30' }, []);
    expect(typedTargets({ Fractions: 10, Decimals: 6, Geometry: 4 }, s.chapters, 20)).toEqual([10, 6, 4]);
    expect(typedTargets({ Fractions: 20 }, s.chapters, 20)).toEqual([20, 0, 0]);
    expect(typedTargets({ Fractions: 10 }, s.chapters, 20)).toBe(false);
    expect(typedTargets({ Algebra: 20 }, s.chapters, 20)).toBe(false);
    expect(typedTargets({ Fractions: -1, Decimals: 21 }, s.chapters, 20)).toBe(false);
    expect(typedTargets(undefined, s.chapters, 20)).toBeNull();
  });
});

describe('allocation: each section over the chapters, difficulty by the mix', () => {
  const half = () => blueprintOf(defaults(), 'half_yearly')!;
  const session = () => chooseScope('session', MAP, TAUGHT, { after: null, from: '2026-04-01', to: '2026-09-30' }, []);

  it('a half-yearly of 80 over three chapters taught 4, 3 and 1 periods: the chapters’ marks follow the log', () => {
    const plan = makePlan({ blueprint: half(), parts: [{ key: 'theory', name: 'Theory', max: 80 }, { key: 'internal', name: 'Internal', max: 20 }], scope: session() });
    expect(plan.problems).toEqual([]);
    expect(plan.part).toEqual({ key: 'theory', name: 'Theory', max: 80 });
    expect(plan.chapters.map((c) => [c.chapter, c.periods, c.marks])).toEqual([['Fractions', 4, 40], ['Decimals', 3, 30], ['Geometry', 1, 10]]);
    // Placed within a mark or two of each target, and every mark is placed.
    plan.chapters.forEach((c) => expect(Math.abs(c.planned - c.marks)).toBeLessThanOrEqual(2));
    expect(plan.chapters.reduce((n, c) => n + c.planned, 0)).toBeCloseTo(80, 6);
    // 39 questions numbered 1 to 39, section by section, in the map's chapter order within each section.
    expect(plan.slots).toHaveLength(39);
    expect(plan.slots.map((s) => s.n)).toEqual(Array.from({ length: 39 }, (_, i) => i + 1));
    expect(plan.slots.filter((s) => s.section === 'A').every((s) => s.kind === 'objective' && s.marks === 1)).toBe(true);
    const order = ['Fractions', 'Decimals', 'Geometry'];
    for (const sec of ['A', 'B', 'C', 'D', 'E']) {
      const idx = plan.slots.filter((s) => s.section === sec).map((s) => order.indexOf(s.chapter));
      expect(idx, sec).toEqual([...idx].sort((a, b) => a - b));
    }
    // The internal choice of section D: one group, answer any 4.
    expect(plan.choiceCounts).toEqual({ D: 4 });
    expect(plan.slots.filter((s) => s.choiceGroup === 'D')).toHaveLength(5);
    // The mix of 30, 50 and 20 in every 100, section by section: section A's 20 are 6 easy, 10 medium and 4 hard.
    const a = plan.slots.filter((s) => s.section === 'A').map((s) => s.difficulty);
    expect([a.filter((d) => d === 'easy').length, a.filter((d) => d === 'medium').length, a.filter((d) => d === 'hard').length]).toEqual([6, 10, 4]);
    // A chapter's questions take its topics in turn, the most taught first.
    expect(plan.slots.filter((s) => s.chapter === 'Fractions').slice(0, 2).map((s) => s.topic)).toEqual(['Adding fractions', 'Comparing fractions']);
    // The same input always makes the same plan.
    expect(makePlan({ blueprint: half(), parts: [{ key: 'theory', name: 'Theory', max: 80 }], scope: session() })).toEqual(makePlan({ blueprint: half(), parts: [{ key: 'theory', name: 'Theory', max: 80 }], scope: session() }));
  });

  it('equal shares, and the teacher’s own marks per chapter', () => {
    const equal = makePlan({ blueprint: { ...half(), weight: 'equal' }, parts: [{ key: 'theory', name: 'Theory', max: 80 }], scope: session() });
    expect(equal.weight).toBe('equal');
    expect(equal.chapters.map((c) => c.marks)).toEqual([27, 27, 26]);
    const typed = makePlan({ blueprint: half(), parts: [{ key: 'theory', name: 'Theory', max: 80 }], scope: session(), typed: { Fractions: 20, Decimals: 20, Geometry: 40 } });
    expect(typed.weight).toBe('typed');
    expect(typed.chapters.map((c) => c.marks)).toEqual([20, 20, 40]);
    expect(Math.abs(typed.chapters[2].planned - 40)).toBeLessThanOrEqual(2);
    expect(makePlan({ blueprint: half(), parts: [{ key: 'theory', name: 'Theory', max: 80 }], scope: session(), typed: { Fractions: 1 } }).problems).toEqual([{ kind: 'typed' }]);
  });

  it('a paper whose part is not the blueprint’s total says so plainly, and nothing is stretched', () => {
    const plan = makePlan({ blueprint: half(), parts: [{ key: 'theory', name: 'Theory', max: 20 }, { key: 'internal', name: 'Internal', max: 5 }], scope: session() });
    expect(plan.problems).toEqual([{ kind: 'total', blueprint: 80, part: 'theory', max: 20 }]);
    expect(plan.slots.reduce((n, s) => n + (s.choiceGroup ? 0 : s.marks), 0) + 20).toBe(80);
    expect(markedPart([{ key: 'a', name: 'A', max: 20 }, { key: 'b', name: 'B', max: 80 }])?.key).toBe('b');
    expect(markedPart([{ key: 'a', name: 'A', max: 20 }, { key: 'b', name: 'B', max: 20 }])?.key).toBe('a');
    expect(markedPart([])).toBeNull();
    expect(makePlan({ blueprint: half(), parts: [{ key: 'theory', name: 'Theory', max: 80 }], scope: { ...session(), chapters: [] } }).problems).toEqual([{ kind: 'no_map' }]);
  });

  it('difficulties are spread, not bunched', () => {
    expect(difficultiesOf(5, { easy: 40, medium: 40, hard: 20 })).toEqual(['easy', 'medium', 'hard', 'easy', 'medium']);
    expect(difficultiesOf(1, { easy: 0, medium: 0, hard: 100 })).toEqual(['hard']);
  });

  it('more chapters than questions: the ones furthest below their share get them', () => {
    const tiny: Blueprint = { examType: 'weekly', totalMarks: 2, minutes: 10, mix: { easy: 100, medium: 0, hard: 0 }, scope: 'whole_map', weight: 'periods', sections: [{ section: 'A', kind: 'short', count: 2, marksEach: 1, answerAny: 0 }] };
    const s = chooseScope('whole_map', MAP, TAUGHT, { after: null, from: '2026-04-01', to: '2026-09-30' }, []);
    const a = allocate(tiny, s.chapters, largestRemainder(2, weightsOf(s.chapters, 'periods')));
    expect(a.slots.map((x) => x.chapter)).toEqual(['Fractions', 'Decimals']);
  });
});
