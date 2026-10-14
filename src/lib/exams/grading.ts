import type { Band, GradingScheme } from './scheme';

// One rule in one place (docs/27 section 3 rule 3, C213). Every percent, grade and pass in the app comes from these
// three functions and the scheme in force: no screen, report or PDF works one out on its own.
//
//   percent(parts)          the percent of a set of marks. Absent and exempt are not marks: they are left out of
//                           both the marks and the maximum, never counted as zero. No marks at all: null.
//   grade(percent, scheme)  the band the percent falls in, after rounding it as the scheme says. A percent in no
//                           band gets "no grade" and the reason, never the nearest band.
//   passed(input, scheme)   the subject's pass mark, and each component's when the scheme sets one.
//
// Rules only: no model is called.

export type MarkPart = { score: number | null; max: number; absent?: boolean; exempt?: boolean; share?: number };

export function percent(parts: readonly MarkPart[]): number | null {
  for (const p of parts) if (!(typeof p.max === 'number' && Number.isFinite(p.max) && p.max > 0)) throw new RangeError('every maximum is above zero');
  const marked = parts.filter((p) => !p.absent && !p.exempt && p.score !== null);
  for (const p of marked) if (!(typeof p.score === 'number' && Number.isFinite(p.score) && p.score >= 0 && p.score <= p.max)) throw new RangeError('a mark lies between zero and its maximum');
  if (!marked.length) return null;
  // Components weighed by their share of the subject, when every one carries it; otherwise marks over maximum.
  if (marked.every((p) => typeof p.share === 'number' && p.share > 0)) {
    const shares = marked.reduce((s, p) => s + (p.share as number), 0);
    return (marked.reduce((s, p) => s + (p.share as number) * ((p.score as number) / p.max), 0) / shares) * 100;
  }
  return (marked.reduce((s, p) => s + (p.score as number), 0) / marked.reduce((s, p) => s + p.max, 0)) * 100;
}

// Half up, to a whole number or one decimal place. The tiny allowance keeps 32.45 (stored as 32.4499…) a half.
export function roundPercent(value: number, decimals: 0 | 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f + 1e-9) / f;
}

export type NoGradeReason = 'no_marks' | 'no_bands' | 'no_ranges' | 'no_band' | 'two_bands';
export type GradeResult =
  | { kind: 'grade'; percent: number; rounded: number; grade: string; meaning: string | null }
  | { kind: 'no_grade'; reason: NoGradeReason; percent: number | null; rounded: number | null; grades: string[] };

const inBand = (b: Band, value: number) => typeof b.from === 'number' && typeof b.to === 'number' && value >= b.from && value <= b.to;

export function grade(value: number | null, scheme: Pick<GradingScheme, 'bands' | 'decimals'>): GradeResult {
  if (value === null) return { kind: 'no_grade', reason: 'no_marks', percent: null, rounded: null, grades: [] };
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new RangeError('a percent lies within 0 to 100');
  const rounded = roundPercent(value, scheme.decimals);
  if (!scheme.bands.length) return { kind: 'no_grade', reason: 'no_bands', percent: value, rounded, grades: [] };
  if (!scheme.bands.some((b) => typeof b.from === 'number')) return { kind: 'no_grade', reason: 'no_ranges', percent: value, rounded, grades: [] };
  const found = scheme.bands.filter((b) => inBand(b, rounded));
  if (found.length === 1) return { kind: 'grade', percent: value, rounded, grade: found[0].grade, meaning: found[0].meaning };
  return { kind: 'no_grade', reason: found.length ? 'two_bands' : 'no_band', percent: value, rounded, grades: found.map((b) => b.grade) };
}

export type PassInput = { percent: number | null; components?: Readonly<Record<string, number | null>> };
export type PassResult =
  | { kind: 'passed'; rounded: number }
  | { kind: 'not_passed'; rounded: number; below: { key: string | null; rounded: number; passMark: number }[] }
  | { kind: 'not_known'; reason: 'no_pass_mark' | 'no_marks' | 'component_no_marks'; key?: string };

// Rounded as the grade is, so a child's grade and pass never disagree about the same percent.
export function passed(input: PassInput, scheme: Pick<GradingScheme, 'passMark' | 'components' | 'decimals'>): PassResult {
  const withMark = scheme.components.filter((c) => c.passMark !== null);
  if (scheme.passMark === null && !withMark.length) return { kind: 'not_known', reason: 'no_pass_mark' };
  if (input.percent === null) return { kind: 'not_known', reason: 'no_marks' };
  const rounded = roundPercent(input.percent, scheme.decimals);
  const below: { key: string | null; rounded: number; passMark: number }[] = [];
  if (scheme.passMark !== null && rounded < scheme.passMark) below.push({ key: null, rounded, passMark: scheme.passMark });
  let unknown: string | null = null;
  for (const c of withMark) {
    const v = input.components?.[c.key];
    if (v === null || v === undefined) {
      unknown ??= c.key;
      continue;
    }
    const r = roundPercent(v, scheme.decimals);
    if (r < (c.passMark as number)) below.push({ key: c.key, rounded: r, passMark: c.passMark as number });
  }
  if (below.length) return { kind: 'not_passed', rounded, below };
  if (unknown !== null) return { kind: 'not_known', reason: 'component_no_marks', key: unknown };
  return { kind: 'passed', rounded };
}

// ---- what the scheme builder shows -------------------------------------------------------------------------------

export type Span = { from: number; to: number };
export type BandProblems = {
  gaps: Span[]; // percents, as rounded, that fall in no band
  overlaps: (Span & { grades: string[] })[]; // percents in more than one band
  unranged: string[]; // grades with no mark range
};

// On the scale of rounded percents (0, 1, … 100, or 0, 0.1, … 100), which values no band covers and which two
// bands share. A scheme whose bands all lack ranges has no gaps to show: it has unranged grades instead.
export function bandProblems(scheme: Pick<GradingScheme, 'bands' | 'decimals'>): BandProblems {
  const f = 10 ** scheme.decimals;
  const unranged = scheme.bands.filter((b) => typeof b.from !== 'number' || typeof b.to !== 'number').map((b) => b.grade);
  const ranged = scheme.bands.filter((b) => typeof b.from === 'number' && typeof b.to === 'number' && b.from <= b.to);
  if (!ranged.length) return { gaps: [], overlaps: [], unranged };
  // Each band as the steps it covers: from its start rounded up to its end rounded down.
  const steps = ranged.map((b) => ({ grade: b.grade, lo: Math.ceil((b.from as number) * f - 1e-9), hi: Math.floor((b.to as number) * f + 1e-9) }));
  const gaps: Span[] = [];
  const overlaps: (Span & { grades: string[] })[] = [];
  let gapFrom: number | null = null;
  let over: { from: number; grades: string } | null = null;
  const top = 100 * f;
  for (let i = 0; i <= top + 1; i++) {
    const here = i <= top ? steps.filter((s) => i >= s.lo && i <= s.hi).map((s) => s.grade) : null;
    const isGap = here !== null && here.length === 0;
    if (isGap && gapFrom === null) gapFrom = i;
    if (!isGap && gapFrom !== null) {
      gaps.push({ from: gapFrom / f, to: (i - 1) / f });
      gapFrom = null;
    }
    const key = here && here.length > 1 ? here.join('|') : null;
    if (over && over.grades !== key) {
      overlaps.push({ from: over.from / f, to: (i - 1) / f, grades: over.grades.split('|') });
      over = null;
    }
    if (key && !over) over = { from: i, grades: key };
  }
  return { gaps, overlaps, unranged };
}

// A gap of the school's scheme that its preset's bands have too: copied from the board's document as printed.
export function gapsAsInPreset(scheme: Pick<GradingScheme, 'bands' | 'decimals'>, presetBands: readonly Band[] | null): (Span & { asInPreset: boolean })[] {
  const own = bandProblems(scheme).gaps;
  const theirs = presetBands ? bandProblems({ bands: [...presetBands], decimals: scheme.decimals }).gaps : [];
  return own.map((g) => ({ ...g, asInPreset: theirs.some((p) => p.from === g.from && p.to === g.to) }));
}
