import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExamTypesEditor } from '@/components/exams/SchemeParts';
import { formToScheme, schemeToForm } from '@/components/exams/scheme-form';
import { DEFAULT_EXAM_TYPES } from '@/lib/contracts/exam-types';
import { weightedPercent } from '@/lib/exams/grading';
import type { Mark, PaperComponent } from '@/lib/exams/papers';
import { weightedChildResult, type WeightedPaper } from '@/lib/exams/results';
import { emptyScheme, validateScheme, type GradingScheme } from '@/lib/exams/scheme';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// The exam types a scheme counts toward a report card, and their weights (C230-AJ part 2, C357): the rule, the scheme
// that keeps it, the form that edits it, and the sentences for what it refuses. Every number is made up.

const W = [{ type: 'half_yearly', weight: 40 }, { type: 'annual', weight: 60 }];
const bands = [{ from: 75, to: 100, grade: 'A', meaning: null }, { from: 50, to: 74, grade: 'B', meaning: null }, { from: 0, to: 49, grade: 'C', meaning: null }];
const scheme = (over: Partial<GradingScheme> = {}): GradingScheme => ({ ...emptyScheme(), bands, ...over });

describe('weightedPercent', () => {
  it('is the mean of the types’ percents by their weights', () => {
    expect(weightedPercent([{ type: 'half_yearly', percent: 50 }, { type: 'annual', percent: 80 }], W)).toBe(68);
    expect(weightedPercent([{ type: 'annual', percent: 80 }, { type: 'half_yearly', percent: 50 }], W)).toBe(68);
    expect(weightedPercent([{ type: 'half_yearly', percent: 100 }, { type: 'annual', percent: 100 }], W)).toBe(100);
    expect(weightedPercent([{ type: 'half_yearly', percent: 0 }, { type: 'annual', percent: 0 }], W)).toBe(0);
  });
  it('a type that is not counted has no say', () => {
    expect(weightedPercent([{ type: 'weekly', percent: 10 }, { type: 'half_yearly', percent: 50 }, { type: 'annual', percent: 80 }], W)).toBe(68);
  });
  it('a counted type with no percent yet leaves the result unknown, never a mean of some of the weights', () => {
    expect(weightedPercent([{ type: 'half_yearly', percent: 50 }, { type: 'annual', percent: null }], W)).toBeNull();
    expect(weightedPercent([{ type: 'half_yearly', percent: 50 }], W)).toBeNull();
    expect(weightedPercent([], W)).toBeNull();
  });
  it('with no weights there is nothing to weigh', () => {
    expect(weightedPercent([{ type: 'annual', percent: 80 }], [])).toBeNull();
  });
  it('never leaves 0 to 100, whatever the weights add up to in floating point', () => {
    const thirds = [{ type: 'a', weight: 33.3 }, { type: 'b', weight: 33.3 }, { type: 'c', weight: 33.4 }];
    const got = weightedPercent([{ type: 'a', percent: 100 }, { type: 'b', percent: 100 }, { type: 'c', percent: 100 }], thirds) as number;
    expect(got).toBeLessThanOrEqual(100);
    expect(got).toBeGreaterThan(99.99);
  });
  it('refuses a weight that is not above zero, and a percent outside 0 to 100', () => {
    expect(() => weightedPercent([{ type: 'a', percent: 50 }], [{ type: 'a', weight: 0 }])).toThrow(RangeError);
    expect(() => weightedPercent([{ type: 'a', percent: 101 }], [{ type: 'a', weight: 100 }])).toThrow(RangeError);
  });
});

describe('a scheme with exam types', () => {
  const ok = (examTypes: unknown) => validateScheme({ ...scheme(), ...(examTypes === undefined ? {} : { examTypes }) });
  it('keeps them, in the order given; with none it is exactly what it was', () => {
    expect(ok(W)).toEqual({ ok: true, scheme: scheme({ examTypes: W }) });
    expect(ok(undefined)).toEqual({ ok: true, scheme: scheme() });
    expect(ok([])).toEqual({ ok: true, scheme: scheme() });
    expect(ok(null)).toEqual({ ok: true, scheme: scheme() });
    expect('examTypes' in (ok([]) as { scheme: object }).scheme).toBe(false);
    expect(ok([{ type: 'annual', weight: 100 }])).toEqual({ ok: true, scheme: scheme({ examTypes: [{ type: 'annual', weight: 100 }] }) });
    expect(ok([{ type: 'a_b', weight: 33.3 }, { type: 'c_d', weight: 66.7 }])).toMatchObject({ ok: true });
    // Tenths that add up to 100 are accepted however the floating-point sum comes out.
    expect(ok([{ type: 'aa', weight: 33.3 }, { type: 'bb', weight: 33.3 }, { type: 'cc', weight: 33.4 }])).toMatchObject({ ok: true });
    expect(ok([{ type: 'aa', weight: 0.1 }, { type: 'bb', weight: 0.2 }, { type: 'cc', weight: 99.7 }])).toMatchObject({ ok: true });
  });
  it('the weights add up to 100, each above 0 and up to 100 with one decimal place, each type once and a real key', () => {
    expect(ok([{ type: 'half_yearly', weight: 40 }, { type: 'annual', weight: 50 }])).toEqual({ ok: false, problem: { code: 'exam_type_total' } });
    expect(ok([{ type: 'half_yearly', weight: 60 }, { type: 'annual', weight: 60 }])).toEqual({ ok: false, problem: { code: 'exam_type_total' } });
    expect(ok([{ type: 'half_yearly', weight: 0 }, { type: 'annual', weight: 100 }])).toEqual({ ok: false, problem: { code: 'exam_type_weight', at: 0 } });
    expect(ok([{ type: 'half_yearly', weight: 33.33 }, { type: 'annual', weight: 66.67 }])).toEqual({ ok: false, problem: { code: 'exam_type_weight', at: 0 } });
    expect(ok([{ type: 'half_yearly', weight: Number.NaN }, { type: 'annual', weight: 100 }])).toEqual({ ok: false, problem: { code: 'exam_type_weight', at: 0 } });
    expect(ok([{ type: 'annual', weight: 50 }, { type: 'annual', weight: 50 }])).toEqual({ ok: false, problem: { code: 'exam_type_duplicate', at: 1 } });
    expect(ok([{ type: 'Annual', weight: 100 }])).toEqual({ ok: false, problem: { code: 'exam_type_key', at: 0 } });
    expect(ok([{ weight: 100 }])).toEqual({ ok: false, problem: { code: 'exam_type_key', at: 0 } });
    expect(ok('annual')).toEqual({ ok: false, problem: { code: 'shape' } });
    expect(ok([5])).toEqual({ ok: false, problem: { code: 'shape', at: 0 } });
    expect(ok(Array.from({ length: 31 }, (_, i) => ({ type: `type_${i}`, weight: 1 })))).toEqual({ ok: false, problem: { code: 'too_many' } });
  });
  it('a form makes it and comes back from it; with none chosen the form leaves the scheme as it was', () => {
    const s = scheme({ examTypes: W });
    expect(formToScheme(schemeToForm(s))).toEqual(s);
    const f = schemeToForm(s);
    expect(f.examTypes).toEqual([{ type: 'half_yearly', weight: '40' }, { type: 'annual', weight: '60' }]);
    const typed = { ...f, examTypes: [{ type: 'annual', weight: '33,3' }, { type: 'half_yearly', weight: '' }] };
    expect(formToScheme(typed).examTypes).toEqual([{ type: 'annual', weight: 33.3 }, { type: 'half_yearly', weight: Number.NaN }]);
    expect(validateScheme(formToScheme(typed))).toEqual({ ok: false, problem: { code: 'exam_type_weight', at: 1 } });
    const none = schemeToForm(scheme());
    expect(none.examTypes).toEqual([]);
    expect('examTypes' in formToScheme(none)).toBe(false);
    // Control's preset form has no exam types at all.
    const { examTypes: _gone, ...old } = none;
    expect('examTypes' in formToScheme(old)).toBe(false);
  });
  it('the words for each thing it refuses are in English and in Hindi', () => {
    for (const code of ['exam_type_key', 'exam_type_duplicate', 'exam_type_weight', 'exam_type_total']) {
      const key = `gs.problem.${code}` as keyof typeof en;
      expect(en[key], key).toBeTruthy();
      expect(/[ऀ-ॿ]/.test(hi[key]), `${key} in Hindi`).toBe(true);
    }
  });
});

describe('the chooser of the types that count', () => {
  const render = (weights: { type: string; weight: string }[], types = DEFAULT_EXAM_TYPES.map((t) => ({ ...t }))) =>
    renderToStaticMarkup(h(ExamTypesEditor, { idPrefix: 'scheme', types, weights, onChange: () => undefined }));
  it('lists the school’s shown types, each with a tick; a weight is asked only of a ticked one', () => {
    const html = render([{ type: 'annual', weight: '60' }]);
    expect((html.match(/data-exam-type="/g) ?? []).length).toBe(DEFAULT_EXAM_TYPES.length);
    expect(html).toContain('Half-yearly');
    expect((html.match(/Weight, out of 100/g) ?? []).length).toBe(1);
    expect(html).toContain('Weights so far: 60 of 100.');
  });
  it('says no type is weighed when none is ticked', () => {
    expect(render([])).toContain('No exam type is weighed: every exam stands alone.');
  });
  it('a hidden type is not offered, unless it already counts, and then it says it is hidden', () => {
    const types = DEFAULT_EXAM_TYPES.map((t) => ({ ...t, hidden: t.key === 'weekly' || t.key === 'annual' }));
    const html = render([{ type: 'annual', weight: '100' }], types);
    expect(html).not.toContain('Weekly test');
    expect(html).toContain('Annual (hidden)');
  });
});

describe('weightedChildResult, with no database', () => {
  const comp = (max: number): PaperComponent[] => [{ key: 'marks', name: 'Marks', max, share: null }];
  const paper = (id: string, subjectId: string, examType: string, max: number): WeightedPaper => ({ paperId: id, subjectId, subjectName: subjectId, date: null, components: comp(max), examType });
  const sc = (n: number): Record<string, Mark> => ({ marks: { kind: 'score', score: n } });
  const none: Record<string, Mark> = {};
  const S = { bands, decimals: 0 as const };

  it('is the weights over each type’s percent: a subject’s, and the child’s overall', () => {
    const papers = [paper('p1', 'maths', 'half_yearly', 50), paper('p2', 'english', 'half_yearly', 50), paper('p3', 'maths', 'annual', 100), paper('p4', 'english', 'annual', 100)];
    const got = weightedChildResult(papers, [sc(25), sc(40), sc(80), sc(70)], W, S);
    expect(got.subjects.map((s) => [s.subjectId, s.result.percent])).toEqual([['maths', 68], ['english', 74]]);
    expect(got.types).toEqual([{ type: 'half_yearly', percent: 65 }, { type: 'annual', percent: 75 }]);
    expect(got.overall).toMatchObject({ percent: 71, rounded: 71, grade: { kind: 'grade', grade: 'B' } });
  });
  it('several exams of one type are one percent: all their marks over all their maxima', () => {
    const papers = [paper('p1', 'maths', 'half_yearly', 50), paper('p2', 'maths', 'half_yearly', 10), paper('p3', 'maths', 'annual', 100)];
    // Half-yearly: (30 + 10) / 60 = 66.666..; Annual: 90.
    const got = weightedChildResult(papers, [sc(30), sc(10), sc(90)], W, S);
    expect(got.subjects[0].types[0].percent).toBeCloseTo(66.6667, 3);
    expect(got.subjects[0].result.percent).toBeCloseTo(0.4 * 66.6667 + 0.6 * 90, 3);
  });
  it('a type with a paper not entered, or none at all, leaves the result "not entered"', () => {
    const papers = [paper('p1', 'maths', 'half_yearly', 50), paper('p3', 'maths', 'annual', 100)];
    expect(weightedChildResult(papers, [sc(25), none], W, S).overall).toMatchObject({ percent: null, grade: { kind: 'no_grade', reason: 'not_entered' } });
    expect(weightedChildResult([papers[0]], [sc(25)], W, S).subjects[0].result).toMatchObject({ percent: null, grade: { kind: 'no_grade', reason: 'not_entered' } });
  });
  it('absent in every paper of a type is no marks there, so no result; absent in one paper of several leaves the rest', () => {
    const absent: Record<string, Mark> = { marks: { kind: 'absent', score: null } };
    const papers = [paper('p1', 'maths', 'half_yearly', 50), paper('p3', 'maths', 'annual', 100), paper('p4', 'maths', 'annual', 100)];
    expect(weightedChildResult(papers, [sc(25), absent, absent], W, S).overall.percent).toBeNull();
    expect(weightedChildResult(papers, [sc(25), absent, sc(80)], W, S).overall.percent).toBe(0.4 * 50 + 0.6 * 80);
  });
  it('an exam of a type that does not count is not in it', () => {
    const papers = [paper('p1', 'maths', 'half_yearly', 50), paper('p2', 'maths', 'weekly', 10), paper('p3', 'maths', 'annual', 100)];
    expect(weightedChildResult(papers, [sc(25), sc(0), sc(80)], W, S).overall.percent).toBe(68);
  });
  it('without a scheme the percent is there and the grade says there is no scheme', () => {
    const papers = [paper('p1', 'maths', 'half_yearly', 50), paper('p3', 'maths', 'annual', 100)];
    expect(weightedChildResult(papers, [sc(25), sc(80)], W, null).overall).toMatchObject({ percent: 68, grade: { kind: 'no_grade', reason: 'no_scheme' } });
  });
});
