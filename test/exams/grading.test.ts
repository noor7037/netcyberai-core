import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bandProblems, gapsAsInPreset, grade, passed, percent, roundPercent } from '@/lib/exams/grading';
import { componentKey, defaultLayout, emptyScheme, schemeFromPreset, validatePreset, validateScheme, type Band, type GradingScheme } from '@/lib/exams/scheme';
import { formToScheme, schemeToForm } from '@/components/exams/scheme-form';

// The one grading rule (docs/27 section 3 rule 3, C213): percent(), grade() and passed(), the builder's gaps and
// overlaps, and the rules a scheme keeps. The bands below are made up for the test, except where a test says it
// copies a board's preset (the database test reads the presets themselves).

const ROOT = path.resolve(__dirname, '../..');
const band = (from: number | null, to: number | null, g: string, meaning: string | null = null): Band => ({ from, to, grade: g, meaning });
const scheme = (over: Partial<GradingScheme> = {}): GradingScheme => ({ ...emptyScheme(), ...over });
// Made-up bands: a gap from 41 to 44 and below 33, as the CBSE document prints its table.
const PRINTED = [band(91, 100, 'P1'), band(81, 90, 'P2'), band(71, 80, 'Q1'), band(61, 70, 'Q2'), band(51, 60, 'R1'), band(45, 50, 'R2'), band(33, 40, 'S')];

describe('percent(): absent and exempt are not marks', () => {
  it('marks over maximum, leaving out absent and exempt parts entirely (never as zero)', () => {
    expect(percent([{ score: 40, max: 50 }, { score: 15, max: 25 }])).toBeCloseTo(73.333, 3);
    expect(percent([{ score: 40, max: 50 }, { score: null, max: 25, absent: true }])).toBe(80);
    expect(percent([{ score: 40, max: 50 }, { score: 0, max: 25, exempt: true }])).toBe(80);
    expect(percent([{ score: 40, max: 50 }, { score: null, max: 25 }])).toBe(80); // not entered is not a mark either
    expect(percent([{ score: null, max: 50, absent: true }, { score: null, max: 25, exempt: true }])).toBeNull();
    expect(percent([])).toBeNull();
  });

  it('weighs components by their share of the subject when every part carries one', () => {
    // A theory paper marked out of 100 that counts for 80, and internal marks out of 20 that count for 20.
    expect(percent([{ score: 50, max: 100, share: 80 }, { score: 20, max: 20, share: 20 }])).toBe(60);
    // Internal absent: the theory paper alone.
    expect(percent([{ score: 50, max: 100, share: 80 }, { score: null, max: 20, share: 20, absent: true }])).toBe(50);
  });

  it('refuses a mark that cannot be: above its maximum, below zero, or a maximum of zero', () => {
    expect(() => percent([{ score: 51, max: 50 }])).toThrow(RangeError);
    expect(() => percent([{ score: -1, max: 50 }])).toThrow(RangeError);
    expect(() => percent([{ score: 0, max: 0 }])).toThrow(RangeError);
  });
});

describe('grade(): the band the rounded percent falls in, or no grade and why', () => {
  it('rounds half up as the scheme says, then finds the band', () => {
    expect(roundPercent(90.5, 0)).toBe(91);
    expect(roundPercent(90.49, 0)).toBe(90);
    expect(roundPercent(32.45, 1)).toBe(32.5);
    const s = scheme({ bands: PRINTED });
    expect(grade(90.5, s)).toEqual({ kind: 'grade', percent: 90.5, rounded: 91, grade: 'P1', meaning: null });
    expect(grade(90.4, s)).toMatchObject({ kind: 'grade', rounded: 90, grade: 'P2' });
    expect(grade(100, s)).toMatchObject({ grade: 'P1' });
    expect(grade(33, s)).toMatchObject({ grade: 'S' });
  });

  it('a percent in no band gets no grade, with the reason: never the nearest band', () => {
    const s = scheme({ bands: PRINTED });
    expect(grade(42, s)).toEqual({ kind: 'no_grade', reason: 'no_band', percent: 42, rounded: 42, grades: [] });
    expect(grade(32.4, s)).toMatchObject({ kind: 'no_grade', reason: 'no_band', rounded: 32 });
    // With one decimal place, 40.5 is between the printed bands too.
    expect(grade(40.5, scheme({ bands: PRINTED, decimals: 1 }))).toMatchObject({ kind: 'no_grade', reason: 'no_band', rounded: 40.5 });
    expect(grade(null, s)).toMatchObject({ kind: 'no_grade', reason: 'no_marks' });
    expect(grade(70, scheme())).toMatchObject({ kind: 'no_grade', reason: 'no_bands' });
    expect(grade(70, scheme({ bands: [band(null, null, '1'), band(null, null, '2')] }))).toMatchObject({ kind: 'no_grade', reason: 'no_ranges' });
    // Two bands that share a percent (the builder refuses to save it): no guess between them.
    expect(grade(50, scheme({ bands: [band(40, 50, 'X'), band(50, 60, 'Y')] }))).toMatchObject({ kind: 'no_grade', reason: 'two_bands', grades: ['X', 'Y'] });
    expect(() => grade(101, s)).toThrow(RangeError);
  });

  it('a band changed, the grade follows', () => {
    const before = scheme({ bands: PRINTED });
    const after = scheme({ bands: PRINTED.map((b) => (b.grade === 'P2' ? { ...b, from: 80 } : b.grade === 'Q1' ? { ...b, to: 79 } : b)) });
    expect(grade(80, before)).toMatchObject({ grade: 'Q1' });
    expect(grade(80, after)).toMatchObject({ grade: 'P2' });
  });
});

describe('passed(): the pass mark of the subject, and of each component the scheme sets one for', () => {
  const components = [
    { key: 'theory', kind: 'theory' as const, name: 'Theory', share: 80, passMark: 33, parts: [] },
    { key: 'internal', kind: 'internal' as const, name: 'Internal', share: 20, passMark: null, parts: [] },
  ];
  it('by the same rounded percent as the grade', () => {
    const s = scheme({ passMark: 33 });
    expect(passed({ percent: 32.5 }, s)).toEqual({ kind: 'passed', rounded: 33 });
    expect(passed({ percent: 32.4 }, s)).toEqual({ kind: 'not_passed', rounded: 32, below: [{ key: null, rounded: 32, passMark: 33 }] });
    expect(passed({ percent: null }, s)).toEqual({ kind: 'not_known', reason: 'no_marks' });
    expect(passed({ percent: 50 }, scheme())).toEqual({ kind: 'not_known', reason: 'no_pass_mark' });
  });

  it('a component below its own pass mark is not a pass; a component with no marks is not known', () => {
    const s = scheme({ passMark: 33, components });
    expect(passed({ percent: 60, components: { theory: 30, internal: 100 } }, s)).toEqual({ kind: 'not_passed', rounded: 60, below: [{ key: 'theory', rounded: 30, passMark: 33 }] });
    expect(passed({ percent: 60, components: { theory: 40, internal: 100 } }, s)).toEqual({ kind: 'passed', rounded: 60 });
    expect(passed({ percent: 60, components: { theory: null } }, s)).toEqual({ kind: 'not_known', reason: 'component_no_marks', key: 'theory' });
    expect(passed({ percent: 20, components: { theory: null } }, s)).toMatchObject({ kind: 'not_passed' });
  });
});

describe('the builder: gaps, overlaps and grades with no range', () => {
  it('shows the gaps a printed table has, on the scale the percent is rounded to', () => {
    expect(bandProblems(scheme({ bands: PRINTED }))).toEqual({ gaps: [{ from: 0, to: 32 }, { from: 41, to: 44 }], overlaps: [], unranged: [] });
    // One decimal place: between 90 and 91 is a gap of its own, and so on down the table.
    const tenths = bandProblems(scheme({ bands: PRINTED, decimals: 1 })).gaps;
    expect(tenths[0]).toEqual({ from: 0, to: 32.9 });
    expect(tenths).toContainEqual({ from: 40.1, to: 44.9 });
    expect(tenths).toContainEqual({ from: 90.1, to: 90.9 });
  });

  it('shows where two bands share percents, and which', () => {
    expect(bandProblems(scheme({ bands: [band(0, 50, 'X'), band(45, 100, 'Y')] })).overlaps).toEqual([{ from: 45, to: 50, grades: ['X', 'Y'] }]);
  });

  it('lists grades with no mark range, and finds no gap until ranges are given', () => {
    expect(bandProblems(scheme({ bands: [band(null, null, '1', 'Very good'), band(null, null, '2')] }))).toEqual({ gaps: [], overlaps: [], unranged: ['1', '2'] });
  });

  it('a gap the preset’s bands have too is marked as copied from the document', () => {
    const own = scheme({ bands: [...PRINTED.slice(0, 6), band(0, 40, 'S')] }); // the school closed the gap below 33
    expect(gapsAsInPreset(own, PRINTED)).toEqual([{ from: 41, to: 44, asInPreset: true }]);
    const moved = scheme({ bands: PRINTED.map((b) => (b.grade === 'R2' ? { ...b, from: 43 } : b)) });
    expect(gapsAsInPreset(moved, PRINTED)).toEqual([{ from: 0, to: 32, asInPreset: true }, { from: 41, to: 42, asInPreset: false }]);
    expect(gapsAsInPreset(moved, null)).toEqual([{ from: 0, to: 32, asInPreset: false }, { from: 41, to: 42, asInPreset: false }]);
  });
});

describe('the rules a scheme keeps to be saved', () => {
  const ok = (s: unknown) => validateScheme(s);
  const good = (): GradingScheme => ({
    bands: [band(50, 100, 'Above'), band(0, 49, 'Below')],
    decimals: 0,
    passMark: 33,
    components: [
      { key: 'paper', kind: 'theory', name: 'Paper', share: 80, passMark: null, parts: [] },
      { key: 'internal', kind: 'internal', name: 'Internal', share: 20, passMark: 33, parts: [{ name: 'Project', share: 10 }, { name: 'Oral', share: 10 }] },
    ],
    terms: [{ name: 'Term 1' }, { name: 'Term 2' }],
    layout: defaultLayout(true),
    coScholastic: { areas: ['Art'], grades: [{ grade: 'A', meaning: null, pass: true }, { grade: 'B', meaning: null, pass: false }] },
  });
  it('a good scheme is kept, tidied', () => {
    const s = good();
    s.bands[0].grade = '  Above ';
    s.bands[1].meaning = '  ';
    const r = ok(s);
    expect(r.ok).toBe(true);
    expect((r as { scheme: GradingScheme }).scheme.bands).toEqual([band(50, 100, 'Above'), band(0, 49, 'Below')]);
    expect(ok(emptyScheme())).toEqual({ ok: true, scheme: emptyScheme() });
  });

  it('each rule, with the row it is about', () => {
    const fails = (change: (s: GradingScheme) => void) => {
      const s = good();
      change(s);
      const r = ok(s);
      return r.ok ? null : r.problem;
    };
    expect(fails((s) => (s.bands[1] = band(0, 50, 'Below')))).toEqual({ code: 'band_overlap', at: 1 });
    expect(fails((s) => (s.bands[1] = band(null, null, 'Below')))).toEqual({ code: 'band_mixed', at: 1 });
    expect(fails((s) => (s.bands[1] = band(0, null, 'Below')))).toEqual({ code: 'band_partial', at: 1 });
    expect(fails((s) => (s.bands[1] = band(60, 40, 'Below')))).toEqual({ code: 'band_range', at: 1 });
    expect(fails((s) => (s.bands[1] = band(0, 49.5, 'Below')))).toEqual({ code: 'band_decimals', at: 1 });
    expect(fails((s) => (s.bands[1] = band(0, 49, ' ')))).toEqual({ code: 'band_grade', at: 1 });
    expect(fails((s) => (s.bands[1] = band(0, 49, 'above')))).toEqual({ code: 'band_duplicate', at: 1 });
    expect(fails((s) => (s.passMark = 101))).toEqual({ code: 'pass_mark' });
    expect(fails((s) => (s.components[0].share = 70))).toEqual({ code: 'component_shares_total' });
    expect(fails((s) => (s.components[1].parts[0].share = 5))).toEqual({ code: 'component_parts', at: 1 });
    expect(fails((s) => (s.components[1].name = 'paper'))).toEqual({ code: 'component_duplicate', at: 1 });
    expect(fails((s) => (s.components[1].passMark = -1))).toEqual({ code: 'component_pass_mark', at: 1 });
    expect(fails((s) => (s.terms[1].name = 'term 1'))).toEqual({ code: 'term_duplicate', at: 1 });
    expect(fails((s) => (s.coScholastic!.grades = []))).toEqual({ code: 'co_grade', at: 0 });
    expect(fails((s) => ((s as { decimals: number }).decimals = 2))).toEqual({ code: 'decimals' });
    expect(fails((s) => (s.bands = Array.from({ length: 31 }, (_, i) => band(null, null, `G${i}`))))).toEqual({ code: 'too_many' });
  });

  it('a scheme from a preset copies its bands, pass mark, components and co-scholastic grades; terms are the school’s', () => {
    const from = schemeFromPreset({ bands: PRINTED, passMark: 33, components: good().components, coScholastic: good().coScholastic });
    expect(from).toMatchObject({ bands: PRINTED, passMark: 33, decimals: 0, terms: [], layout: { coScholastic: true } });
    from.bands[0].grade = 'changed';
    expect(PRINTED[0].grade).toBe('P1'); // a copy, never the preset itself
    expect(componentKey('Internal assessment', ['internal-assessment'])).toBe('internal-assessment-2');
  });

  it('a preset typed in Control names its source, with an https address', () => {
    const p = { boardId: 'example', level: 'Class X', sourceTitle: 'Circular', sourceUrl: 'https://example.invalid/c.pdf', sourceReadOn: '2026-10-14', bands: [band(0, 100, 'P')], passMark: 33, notes: [{ about: 'bands', text: 'No grade below 33.' }] };
    expect(validatePreset(p)).toMatchObject({ ok: true, preset: { boardId: 'example', components: [], coScholastic: null, replacesPresetId: null } });
    expect(validatePreset({ ...p, sourceUrl: 'http://example.invalid' })).toEqual({ ok: false, problem: 'source_url' });
    expect(validatePreset({ ...p, sourceReadOn: '14-10-2026' })).toEqual({ ok: false, problem: 'source_read_on' });
    expect(validatePreset({ ...p, level: '' })).toEqual({ ok: false, problem: 'level' });
    expect(validatePreset({ ...p, notes: [{ about: 'other', text: 'x' }] })).toEqual({ ok: false, problem: 'notes', at: 0 });
    expect(validatePreset({ ...p, bands: [band(0, 60, 'P'), band(50, 100, 'Q')] })).toEqual({ ok: false, problem: 'band_overlap', at: 1 });
  });
});

describe('the screen’s form', () => {
  it('turns a scheme into what is typed and back without change', () => {
    const s: GradingScheme = {
      bands: PRINTED,
      decimals: 1,
      passMark: 33,
      components: [{ key: 'internal', kind: 'internal', name: 'Internal', share: 100, passMark: null, parts: [{ name: 'Project', share: 100 }] }],
      terms: [{ name: 'Term 1' }],
      layout: defaultLayout(false),
      coScholastic: null,
    };
    expect(formToScheme(schemeToForm(s))).toEqual(s);
    // What is left empty is empty, and what is not a number is not taken as one.
    const f = schemeToForm(s);
    f.passMark = '';
    f.bands[0].from = 'abc';
    const back = formToScheme(f);
    expect(back.passMark).toBeNull();
    expect(Number.isNaN(back.bands[0].from)).toBe(true);
    expect(validateScheme(back)).toMatchObject({ ok: false, problem: { code: 'band_partial', at: 0 } });
  });
});

// ---- what the code holds ------------------------------------------------------------------------------------------

const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? files(path.join(dir, n)) : [path.join(dir, n)]));
const source = files(path.join(ROOT, 'src')).filter((f) => /\.(tsx?|mjs|js|json|sql)$/.test(f));
const rel = (f: string) => path.relative(ROOT, f);

describe('no grade table in the code', () => {
  // A grade table: objects with a grade and a numeric bound, a scale written as "grade:lowest" pairs, the CBSE
  // grade codes as values, or the CISCE meanings. The presets are rows of the database, seeded by the migration.
  const TABLE = [
    /\{[^{}]*\b(?:from|to|min|max|lowest|lower|upper)\s*:\s*\d[^{}]*\bgrade\s*:\s*['"`]|\{[^{}]*\bgrade\s*:\s*['"`][^{}]*\b(?:from|to|min|max|lowest|lower|upper)\s*:\s*\d/,
    /\b[A-E][12]?\s*:\s*\d{1,3}\s*,\s*[A-E][12]?\s*:\s*\d{1,3}/,
    /['"`](?:A1|A2|B1|B2|C1|C2)['"`][\s\S]*['"`](?:A1|A2|B1|B2|C1|C2)['"`]/,
    /pass with credit/i,
  ];
  // Known, and outside the app: the public website's free tools (Marks Analyzer and the Certificate Studio's
  // marksheet) start from a scale the visitor can change, and src/demo-fixture holds the website's illustrative
  // examples for them. They grade nothing in the school app, and the founder's rule keeps this slice off the public
  // website (C213 reports them). Any other file with a grade table fails this test.
  const WEBSITE_FREE_TOOLS = ['src/components/free-tools/MarksAnalyzerTool.tsx', 'src/content/free-tools.ts', 'src/demo-fixture/certificate-examples.ts', 'src/demo-fixture/free-tool-examples.ts', 'src/lib/certificates/render.ts', 'src/lib/free-tools/marks.ts', 'src/lib/free-tools/specs/specs.test.ts'];

  it('the app’s code has none: only the public website’s free tools hold a scale, and nothing in the app imports one', () => {
    const found = source.filter((f) => TABLE.some((re) => re.test(readFileSync(f, 'utf8')))).map(rel).sort();
    expect(found).toEqual(WEBSITE_FREE_TOOLS);
    const app = source.filter((f) => /src\/(app\/\((school|admin)\)|app\/api|components\/(exams|control)|lib\/exams|lib\/today)\//.test(f));
    for (const f of app) expect(readFileSync(f, 'utf8'), rel(f)).not.toMatch(/free-tools\/marks|certificates\/render|demo-fixture/);
  });

  it('the scheme screen and the grading rule read bands from the scheme, never from a constant', () => {
    for (const f of source.filter((x) => /src\/(lib\/exams|components\/exams)\//.test(x))) {
      const text = readFileSync(f, 'utf8');
      expect(text, rel(f)).not.toMatch(/https:\/\/(cbseacademic|cisce)/); // the documents' addresses live in the rows
      expect(text, rel(f)).not.toMatch(/\bpassMark\s*:\s*3[35]\b/);
    }
  });

  it('rules only: no language model in grading', () => {
    for (const f of source.filter((x) => /src\/(lib\/exams|components\/exams|app\/api\/app\/exams)\//.test(x))) expect(readFileSync(f, 'utf8'), rel(f)).not.toMatch(/@\/lib\/(ai|copilot|parent-ai)\b|anthropic|openai/i);
  });
});
