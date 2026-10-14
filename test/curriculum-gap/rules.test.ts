import { describe, expect, it } from 'vitest';
import { GAP_STATES, gapStates, mapOrder, type GapPaper, type UnitFacts } from '@/lib/curriculum-gap/rules';

// The Curriculum Gap Detector's one rule (docs/27 row 9d and section 5, C216), on its own: which state a unit is in,
// and the days it rests on. The database test (curriculum-gap.test.ts) proves the same on the whole schema.

const paper = (n: number, date: string | null): GapPaper => ({ paperId: `p${n}`, examId: `e${n}`, examName: `Exam ${n}`, date });
const unit = (n: number, taught: string[] = [], papers: GapPaper[] = [], more: Partial<UnitFacts> = {}): UnitFacts => {
  const days = [...taught].sort();
  return { unitId: `u${n}`, place: n, chapter: `Chapter ${n}`, topic: `Topic ${n}`, addedAt: '2026-06-01T00:00:00.000000', taughtFirst: days[0] ?? null, taughtLast: days[days.length - 1] ?? null, lessons: days.length, papers, ...more };
};
const states = (facts: UnitFacts[]) => gapStates(facts).units.map((u) => [u.unitId, u.state]);

describe('each unit is in exactly one state', () => {
  it('taught and on a paper dated on or after the first lesson: taught and assessed', () => {
    expect(states([unit(1, ['2026-07-01'], [paper(1, '2026-07-10')])])).toEqual([['u1', 'taught-assessed']]);
    // The paper on the very day of the first lesson is not before it.
    expect(states([unit(1, ['2026-07-10'], [paper(1, '2026-07-10')])])).toEqual([['u1', 'taught-assessed']]);
  });

  it('taught and on no paper: taught, not assessed', () => {
    expect(states([unit(1, ['2026-07-01', '2026-07-03'])])).toEqual([['u1', 'taught-not-assessed']]);
  });

  it('on a paper and never taught, or first taught after the paper’s date: assessed before it was taught', () => {
    const never = gapStates([unit(1, [], [paper(1, '2026-07-10')])]).units[0];
    expect(never).toMatchObject({ state: 'assessed-before-taught', papersBefore: [paper(1, '2026-07-10')] });
    const later = gapStates([unit(1, ['2026-07-11', '2026-07-20'], [paper(1, '2026-07-10')])]).units[0];
    expect(later).toMatchObject({ state: 'assessed-before-taught', taughtFirst: '2026-07-11', papersBefore: [paper(1, '2026-07-10')] });
    // One paper before the first lesson is enough, even when a later paper came after it.
    const both = gapStates([unit(1, ['2026-07-11'], [paper(1, '2026-07-10'), paper(2, '2026-09-01')])]).units[0];
    expect(both).toMatchObject({ state: 'assessed-before-taught', papersBefore: [paper(1, '2026-07-10')] });
  });

  it('a paper with no date yet: never before a lesson, but a unit never taught on it is still assessed before it was taught', () => {
    expect(states([unit(1, ['2026-07-11'], [paper(1, null)])])).toEqual([['u1', 'taught-assessed']]);
    expect(states([unit(1, [], [paper(1, null)])])).toEqual([['u1', 'assessed-before-taught']]);
  });

  it('never taught and on no paper while a unit after it was taught: skipped, with the later unit and its day', () => {
    const { units } = gapStates([unit(1, ['2026-07-01']), unit(2), unit(3), unit(4, ['2026-07-20']), unit(5, ['2026-07-08']), unit(6)]);
    expect(units.map((u) => [u.unitId, u.state])).toEqual([
      ['u1', 'taught-not-assessed'],
      ['u2', 'skipped'],
      ['u3', 'skipped'],
      ['u4', 'taught-not-assessed'],
      ['u5', 'taught-not-assessed'],
      ['u6', 'not-yet-taught'],
    ]);
    // The later unit that was taught first: 5 on 8 July, before 4 on 20 July.
    expect(units[1].laterTaught).toEqual({ unitId: 'u5', chapter: 'Chapter 5', topic: 'Topic 5', day: '2026-07-08' });
    expect(units[2].laterTaught).toEqual({ unitId: 'u5', chapter: 'Chapter 5', topic: 'Topic 5', day: '2026-07-08' });
    // A taught unit has no "later taught" fact, and nor has a unit with nothing taught after it.
    expect(units[0].laterTaught).toBeNull();
    expect(units[5].laterTaught).toBeNull();
  });

  it('on the same day, the later unit nearer in the map is named', () => {
    const { units } = gapStates([unit(1), unit(2, ['2026-07-08']), unit(3, ['2026-07-08'])]);
    expect(units[0].laterTaught?.unitId).toBe('u2');
  });

  it('never taught, on a paper, and before a taught unit: the heavier gap is shown, and the skip is still said', () => {
    const { units } = gapStates([unit(1, [], [paper(1, '2026-07-10')]), unit(2, ['2026-07-05'])]);
    expect(units[0]).toMatchObject({ state: 'assessed-before-taught', laterTaught: { unitId: 'u2', day: '2026-07-05' } });
  });

  it('nothing taught at all: every unit is not taught yet; nothing is skipped', () => {
    expect(states([unit(1), unit(2), unit(3)])).toEqual([['u1', 'not-yet-taught'], ['u2', 'not-yet-taught'], ['u3', 'not-yet-taught']]);
  });
});

describe('the map, once, and the counts', () => {
  it('in the map’s order (place, then when it was added, then id), each unit once, and the counts add up to the units', () => {
    const facts = [
      unit(3, ['2026-07-01']),
      unit(1, [], [paper(1, '2026-07-10')], { addedAt: '2026-06-02T00:00:00.000000' }),
      unit(9, [], [], { place: 1, addedAt: '2026-06-01T00:00:00.000000' }),
      unit(2),
    ];
    const { units, counts } = gapStates(facts);
    expect(units.map((u) => u.unitId)).toEqual(['u9', 'u1', 'u2', 'u3']);
    expect(mapOrder(facts).map((u) => u.unitId)).toEqual(['u9', 'u1', 'u2', 'u3']);
    expect(counts).toEqual({ 'assessed-before-taught': 1, 'taught-assessed': 0, 'taught-not-assessed': 1, skipped: 2, 'not-yet-taught': 0 });
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(units.length);
    expect(Object.keys(counts)).toEqual([...GAP_STATES]);
  });

  it('no units: no state and every count zero (the screen says "not set up" instead, never these zeros)', () => {
    expect(gapStates([])).toEqual({ units: [], counts: { 'assessed-before-taught': 0, 'taught-assessed': 0, 'taught-not-assessed': 0, skipped: 0, 'not-yet-taught': 0 } });
  });
});
