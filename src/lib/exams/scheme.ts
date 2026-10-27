import { EXAM_TYPE_KEY } from '@/lib/contracts/exam-types';

// A school's grading scheme and a board's preset (docs/27 section 3 rule 1, C213): their shapes, the rules a scheme
// must keep to be saved, and how a scheme starts from a preset or from nothing.
//
// No grade table is written here, or anywhere in the code: a board's bands are rows of board_presets, copied from
// its official document by the migration (CBSE, CISCE) or by NetCyberAI in Control (a state board). A school's
// scheme is rows of grading_schemes. The database holds the same rules for the bands and the shape
// (grading_bands_problem, grading_scheme_problem in the migration ending _p6_boards_grading.sql).

export type Band = { from: number | null; to: number | null; grade: string; meaning: string | null };

export const COMPONENT_KINDS = ['theory', 'practical', 'internal', 'other'] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];
export type ComponentPart = { name: string; share: number };
// `share`: the component's part of the subject's maximum, out of 100. Parts, when given, add up to their component.
export type SchemeComponent = { key: string; kind: ComponentKind; name: string; share: number; passMark: number | null; parts: ComponentPart[] };

export type CoScholasticGrade = { grade: string; meaning: string | null; pass: boolean };
export type CoScholastic = { areas: string[]; grades: CoScholasticGrade[] };

// What a report card shows (from 9c): each column or section on or off.
export const LAYOUT_PARTS = ['components', 'total', 'percent', 'grade', 'attendance', 'remarks', 'coScholastic'] as const;
export type LayoutPart = (typeof LAYOUT_PARTS)[number];
export type Layout = Record<LayoutPart, boolean>;

export type Term = { name: string };

// Which of the school's exam types count toward a report card, and how much each counts (C230-AJ part 2, C357): the
// type's key in the school's exam types, and its weight out of 100; the weights add up to 100. No `examTypes` on a
// scheme (or none listed) means no type is weighed: every exam stands alone, as before.
export type ExamTypeWeight = { type: string; weight: number };

// `decimals`: a percent is rounded half up to a whole number (0) or one decimal place (1) before its grade and pass
// are found. `passMark`: percent of the subject's total; empty when the school has not set one.
export type GradingScheme = {
  bands: Band[];
  decimals: 0 | 1;
  passMark: number | null;
  components: SchemeComponent[];
  terms: Term[];
  layout: Layout;
  coScholastic: CoScholastic | null;
  examTypes?: ExamTypeWeight[];
};

export const NOTE_TOPICS = ['general', 'bands', 'pass_mark', 'components', 'grades'] as const;
export type NoteTopic = (typeof NOTE_TOPICS)[number];
export type PresetNote = { about: NoteTopic; text: string };

export type BoardPreset = {
  presetId: string;
  boardId: string;
  level: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceReadOn: string; // YYYY-MM-DD
  bands: Band[];
  passMark: number | null;
  components: SchemeComponent[];
  coScholastic: CoScholastic | null;
  notes: PresetNote[];
  replacesPresetId: string | null;
  addedBy: string | null; // a name; null for the presets the migration seeded
  addedAt: string;
};

export const LIMITS = { bands: 30, components: 12, parts: 8, terms: 12, examTypes: 30, areas: 12, coGrades: 12, notes: 12, grade: 20, meaning: 120, name: 60, note: 600 } as const;

// What the report card shows when a scheme starts: everything it has words for.
export function defaultLayout(coScholastic: boolean): Layout {
  return { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic };
}

export function emptyScheme(): GradingScheme {
  return { bands: [], decimals: 0, passMark: null, components: [], terms: [], layout: defaultLayout(false), coScholastic: null };
}

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// A scheme that starts from a board's preset: its bands, pass mark, components and co-scholastic grades, as the
// document has them. Terms are the school's own.
export function schemeFromPreset(p: Pick<BoardPreset, 'bands' | 'passMark' | 'components' | 'coScholastic'>): GradingScheme {
  return {
    bands: copy(p.bands),
    decimals: 0,
    passMark: p.passMark,
    components: copy(p.components).map((c) => ({ ...c, passMark: c.passMark ?? null, parts: c.parts ?? [] })),
    terms: [],
    layout: defaultLayout(p.coScholastic !== null),
    coScholastic: p.coScholastic ? copy(p.coScholastic) : null,
  };
}

// A short stable key for a component, from its name.
export function componentKey(name: string, taken: readonly string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'component';
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}-${i}`;
  return key;
}

// ---- the rules ---------------------------------------------------------------------------------------------------

export type SchemeProblem =
  | 'shape'
  | 'decimals'
  | 'band_grade'
  | 'band_meaning'
  | 'band_partial'
  | 'band_mixed'
  | 'band_range'
  | 'band_decimals'
  | 'band_duplicate'
  | 'band_overlap'
  | 'pass_mark'
  | 'component_name'
  | 'component_duplicate'
  | 'component_share'
  | 'component_shares_total'
  | 'component_pass_mark'
  | 'component_parts'
  | 'term_name'
  | 'term_duplicate'
  | 'co_area'
  | 'co_grade'
  | 'exam_type_key'
  | 'exam_type_duplicate'
  | 'exam_type_weight'
  | 'exam_type_total'
  | 'too_many';
export type Problem = { code: SchemeProblem; at?: number };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown): string | null => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : null);
const optionalText = (v: unknown): string | null | undefined => (v === null || v === undefined ? null : typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') || null : undefined);
// At most `decimals` places, allowing for how binary numbers store tenths.
export const placesOk = (n: number, decimals: 0 | 1) => Math.abs(n * 10 ** decimals - Math.round(n * 10 ** decimals)) < 1e-9;
const sum = (xs: readonly number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 1000) / 1000;
const dup = (xs: readonly string[]) => xs.findIndex((x, i) => xs.indexOf(x) !== i);

// The rules of a list of bands, as the database holds them (grading_bands_problem), plus one the app adds: a range
// is written to no more places than the percent is rounded to.
export function bandsProblem(raw: unknown, decimals: 0 | 1 | null): Problem | null {
  if (!Array.isArray(raw)) return { code: 'shape' };
  if (raw.length > LIMITS.bands) return { code: 'too_many' };
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i] as Record<string, unknown> | null;
    if (typeof b !== 'object' || b === null) return { code: 'shape', at: i };
    const g = text(b.grade);
    if (!g || g.length > LIMITS.grade) return { code: 'band_grade', at: i };
    const m = optionalText(b.meaning);
    if (m === undefined || (m && m.length > LIMITS.meaning)) return { code: 'band_meaning', at: i };
    const hasFrom = b.from !== null && b.from !== undefined;
    const hasTo = b.to !== null && b.to !== undefined;
    if ((hasFrom && !isNum(b.from)) || (hasTo && !isNum(b.to)) || hasFrom !== hasTo) return { code: 'band_partial', at: i };
    if (hasFrom && !((b.from as number) >= 0 && (b.to as number) <= 100 && (b.from as number) <= (b.to as number))) return { code: 'band_range', at: i };
    if (hasFrom && decimals !== null && !(placesOk(b.from as number, decimals) && placesOk(b.to as number, decimals))) return { code: 'band_decimals', at: i };
  }
  const bands = raw as Band[];
  const ranged = bands.filter((b) => isNum(b.from)).length;
  if (ranged !== 0 && ranged !== bands.length) return { code: 'band_mixed', at: bands.findIndex((b) => !isNum(b.from)) };
  const d = dup(bands.map((b) => (text(b.grade) ?? '').toLowerCase()));
  if (d >= 0) return { code: 'band_duplicate', at: d };
  for (let i = 0; i < bands.length; i++)
    for (let j = i + 1; j < bands.length; j++) {
      const a = bands[i];
      const b = bands[j];
      if (isNum(a.from) && isNum(b.from) && a.from <= (b.to as number) && b.from <= (a.to as number)) return { code: 'band_overlap', at: j };
    }
  return null;
}

// Checks a scheme sent to be saved, and returns it tidied (words trimmed, empty meanings as none), or the first rule
// it breaks. The screen calls the same function as the person types, so it says what to fix before saving.
export function validateScheme(raw: unknown): { ok: true; scheme: GradingScheme } | { ok: false; problem: Problem } {
  const fail = (code: SchemeProblem, at?: number) => ({ ok: false as const, problem: at === undefined ? { code } : { code, at } });
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail('shape');
  const s = raw as Record<string, unknown>;
  if (s.decimals !== 0 && s.decimals !== 1) return fail('decimals');
  const decimals = s.decimals;
  const bandsWrong = bandsProblem(s.bands, decimals);
  if (bandsWrong) return { ok: false, problem: bandsWrong };
  const bands = (s.bands as Band[]).map((b) => ({ from: isNum(b.from) ? b.from : null, to: isNum(b.to) ? b.to : null, grade: text(b.grade)!, meaning: optionalText(b.meaning) ?? null }));

  const passMark = s.passMark === null || s.passMark === undefined ? null : s.passMark;
  if (passMark !== null && !(isNum(passMark) && passMark >= 0 && passMark <= 100 && placesOk(passMark, 1))) return fail('pass_mark');

  if (!Array.isArray(s.components)) return fail('shape');
  if (s.components.length > LIMITS.components) return fail('too_many');
  const components: SchemeComponent[] = [];
  for (let i = 0; i < s.components.length; i++) {
    const c = s.components[i] as Record<string, unknown> | null;
    if (typeof c !== 'object' || c === null) return fail('shape', i);
    const name = text(c.name);
    if (!name || name.length > LIMITS.name) return fail('component_name', i);
    if (!(COMPONENT_KINDS as readonly unknown[]).includes(c.kind)) return fail('shape', i);
    if (typeof c.key !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(c.key)) return fail('shape', i);
    if (!(isNum(c.share) && c.share > 0 && c.share <= 100 && placesOk(c.share, 1))) return fail('component_share', i);
    const cPass = c.passMark === null || c.passMark === undefined ? null : c.passMark;
    if (cPass !== null && !(isNum(cPass) && cPass >= 0 && cPass <= 100 && placesOk(cPass, 1))) return fail('component_pass_mark', i);
    const rawParts = c.parts === undefined ? [] : c.parts;
    if (!Array.isArray(rawParts) || rawParts.length > LIMITS.parts) return fail('component_parts', i);
    const parts: ComponentPart[] = [];
    for (const p of rawParts as Record<string, unknown>[]) {
      const pName = typeof p === 'object' && p !== null ? text(p.name) : null;
      if (!pName || pName.length > LIMITS.name || !(isNum(p.share) && p.share > 0 && placesOk(p.share, 1))) return fail('component_parts', i);
      parts.push({ name: pName, share: p.share });
    }
    if (parts.length && sum(parts.map((p) => p.share)) !== c.share) return fail('component_parts', i);
    if (dup(parts.map((p) => p.name.toLowerCase())) >= 0) return fail('component_parts', i);
    components.push({ key: c.key, kind: c.kind as ComponentKind, name, share: c.share, passMark: cPass as number | null, parts });
  }
  const dupName = dup(components.map((c) => c.name.toLowerCase()));
  if (dupName >= 0 || dup(components.map((c) => c.key)) >= 0) return fail('component_duplicate', Math.max(dupName, 0));
  if (components.length && sum(components.map((c) => c.share)) !== 100) return fail('component_shares_total');

  if (!Array.isArray(s.terms)) return fail('shape');
  if (s.terms.length > LIMITS.terms) return fail('too_many');
  const terms: Term[] = [];
  for (let i = 0; i < s.terms.length; i++) {
    const tm = s.terms[i] as Record<string, unknown> | null;
    const name = typeof tm === 'object' && tm !== null ? text(tm.name) : null;
    if (!name || name.length > LIMITS.name) return fail('term_name', i);
    terms.push({ name });
  }
  const dupTerm = dup(terms.map((x) => x.name.toLowerCase()));
  if (dupTerm >= 0) return fail('term_duplicate', dupTerm);

  if (typeof s.layout !== 'object' || s.layout === null || Array.isArray(s.layout)) return fail('shape');
  const l = s.layout as Record<string, unknown>;
  if (!LAYOUT_PARTS.every((k) => typeof l[k] === 'boolean')) return fail('shape');
  const layout = Object.fromEntries(LAYOUT_PARTS.map((k) => [k, l[k] as boolean])) as Layout;

  let coScholastic: CoScholastic | null = null;
  if (s.coScholastic !== null && s.coScholastic !== undefined) {
    const co = s.coScholastic as Record<string, unknown>;
    if (typeof co !== 'object' || !Array.isArray(co.areas) || !Array.isArray(co.grades)) return fail('shape');
    if (co.areas.length > LIMITS.areas || co.grades.length > LIMITS.coGrades) return fail('too_many');
    const areas: string[] = [];
    for (let i = 0; i < co.areas.length; i++) {
      const a = text(co.areas[i]);
      if (!a || a.length > LIMITS.name) return fail('co_area', i);
      areas.push(a);
    }
    if (dup(areas.map((a) => a.toLowerCase())) >= 0) return fail('co_area', dup(areas.map((a) => a.toLowerCase())));
    const grades: CoScholasticGrade[] = [];
    for (let i = 0; i < co.grades.length; i++) {
      const g = co.grades[i] as Record<string, unknown> | null;
      const gName = typeof g === 'object' && g !== null ? text(g.grade) : null;
      const gMeaning = typeof g === 'object' && g !== null ? optionalText(g.meaning) : undefined;
      if (!gName || gName.length > LIMITS.grade || gMeaning === undefined || (gMeaning && gMeaning.length > LIMITS.meaning) || typeof g!.pass !== 'boolean') return fail('co_grade', i);
      grades.push({ grade: gName, meaning: gMeaning ?? null, pass: g!.pass as boolean });
    }
    if (dup(grades.map((g) => g.grade.toLowerCase())) >= 0) return fail('co_grade', dup(grades.map((g) => g.grade.toLowerCase())));
    if (areas.length || grades.length) {
      if (!areas.length) return fail('co_area', 0);
      if (!grades.length) return fail('co_grade', 0);
      coScholastic = { areas, grades };
    }
  }

  // The exam types that count toward a report card, with their weights out of 100. None listed: none is weighed.
  const examTypes: ExamTypeWeight[] = [];
  if (s.examTypes !== null && s.examTypes !== undefined) {
    if (!Array.isArray(s.examTypes)) return fail('shape');
    if (s.examTypes.length > LIMITS.examTypes) return fail('too_many');
    for (let i = 0; i < s.examTypes.length; i++) {
      const w = s.examTypes[i] as Record<string, unknown> | null;
      if (typeof w !== 'object' || w === null) return fail('shape', i);
      if (typeof w.type !== 'string' || !EXAM_TYPE_KEY.test(w.type)) return fail('exam_type_key', i);
      if (!(isNum(w.weight) && w.weight > 0 && w.weight <= 100 && placesOk(w.weight, 1))) return fail('exam_type_weight', i);
      examTypes.push({ type: w.type, weight: w.weight });
    }
    const dupType = dup(examTypes.map((x) => x.type));
    if (dupType >= 0) return fail('exam_type_duplicate', dupType);
    if (examTypes.length && sum(examTypes.map((x) => x.weight)) !== 100) return fail('exam_type_total');
  }

  return { ok: true, scheme: { bands, decimals, passMark: passMark as number | null, components, terms, layout, coScholastic, ...(examTypes.length ? { examTypes } : {}) } };
}

// ---- a preset typed in Control --------------------------------------------------------------------------------

export type PresetInput = Omit<BoardPreset, 'presetId' | 'addedBy' | 'addedAt'>;
export type PresetProblem = 'board' | 'level' | 'source_title' | 'source_url' | 'source_read_on' | 'notes' | 'replaces' | SchemeProblem;

// A preset keeps the rules of a scheme (it is one, with its source), with at least one band and the source named.
export function validatePreset(raw: Record<string, unknown>): { ok: true; preset: PresetInput } | { ok: false; problem: PresetProblem; at?: number } {
  const boardId = typeof raw.boardId === 'string' && /^[a-z][a-z0-9-]{1,39}$/.test(raw.boardId) ? raw.boardId : null;
  if (!boardId) return { ok: false, problem: 'board' };
  const level = text(raw.level);
  if (!level || level.length > 80) return { ok: false, problem: 'level' };
  const sourceTitle = text(raw.sourceTitle);
  if (!sourceTitle || sourceTitle.length > 200) return { ok: false, problem: 'source_title' };
  const sourceUrl = typeof raw.sourceUrl === 'string' ? raw.sourceUrl.trim() : '';
  if (sourceUrl.length > 500 || !/^https:\/\/[^\s]+$/.test(sourceUrl)) return { ok: false, problem: 'source_url' };
  try {
    new URL(sourceUrl);
  } catch {
    return { ok: false, problem: 'source_url' };
  }
  const sourceReadOn = typeof raw.sourceReadOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.sourceReadOn) && !Number.isNaN(Date.parse(`${raw.sourceReadOn}T00:00:00Z`)) ? raw.sourceReadOn : null;
  if (!sourceReadOn) return { ok: false, problem: 'source_read_on' };
  if (!Array.isArray(raw.bands) || raw.bands.length < 1) return { ok: false, problem: 'band_grade', at: 0 };
  // The bands, pass mark, components and co-scholastic grades are checked as a scheme's are.
  const asScheme = validateScheme({ bands: raw.bands, decimals: 1, passMark: raw.passMark ?? null, components: raw.components ?? [], terms: [], layout: defaultLayout(false), coScholastic: raw.coScholastic ?? null });
  if (!asScheme.ok) return { ok: false, problem: asScheme.problem.code, at: asScheme.problem.at };
  const rawNotes = raw.notes ?? [];
  if (!Array.isArray(rawNotes) || rawNotes.length > LIMITS.notes) return { ok: false, problem: 'notes' };
  const notes: PresetNote[] = [];
  for (let i = 0; i < rawNotes.length; i++) {
    const n = rawNotes[i] as Record<string, unknown> | null;
    const nText = typeof n === 'object' && n !== null ? text(n.text) : null;
    if (!nText || nText.length > LIMITS.note || !(NOTE_TOPICS as readonly unknown[]).includes(n!.about)) return { ok: false, problem: 'notes', at: i };
    notes.push({ about: n!.about as NoteTopic, text: nText });
  }
  const replacesPresetId = raw.replacesPresetId === null || raw.replacesPresetId === undefined ? null : raw.replacesPresetId;
  if (replacesPresetId !== null && (typeof replacesPresetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(replacesPresetId))) return { ok: false, problem: 'replaces' };
  const s = asScheme.scheme;
  return { ok: true, preset: { boardId, level, sourceTitle, sourceUrl, sourceReadOn, bands: s.bands, passMark: s.passMark, components: s.components, coScholastic: s.coScholastic, notes, replacesPresetId: replacesPresetId as string | null } };
}
