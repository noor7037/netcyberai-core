import { QUESTION_KINDS, type QuestionKind } from '@/lib/contracts/marking';

// A question paper's shape by exam type (docs/36 §1.1, C362): the Exams settings "paper_blueprints" (one row a type:
// total marks, minutes, the mix of easy, medium and hard, which chapters it covers and how they are weighed) and
// "paper_sections" (its sections A to H: the kind of question, how many, the marks each, and "answer any N" for an
// internal choice). Two flat lists, because the settings framework keeps a list as rows of plain cells (17 §1a); this
// file turns them into blueprints and holds the rules between rows. Pure: safe in the browser.
//
// The defaults below are starting points the school edits, not a board's rules: a short test covers what was taught
// since the last test of its type, a sessional or half-yearly the session so far, an annual or mock the whole
// syllabus map. Their marks and sections are only sensible first shapes.

export const SCOPE_RULES = ['since_last_of_type', 'session', 'whole_map'] as const;
export type ScopeRule = (typeof SCOPE_RULES)[number];
export const WEIGHT_RULES = ['periods', 'equal'] as const;
export type WeightRule = (typeof WEIGHT_RULES)[number];
export const SECTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export type BlueprintSection = {
  section: string; // A to H, in print order
  kind: QuestionKind;
  count: number; // questions printed
  marksEach: number;
  answerAny: number; // 0: answer every one; else answer any this many (an internal choice)
};
export type Blueprint = {
  examType: string;
  totalMarks: number;
  minutes: number;
  mix: { easy: number; medium: number; hard: number }; // out of 100
  scope: ScopeRule;
  weight: WeightRule;
  sections: BlueprintSection[];
};

// Limits of one blueprint, shared by the setting's check, the paper screen and the server.
export const BLUEPRINT_MAX_QUESTIONS = 100;
export const SECTION_MAX_COUNT = 60;
export const TOTAL_MAX = 1000;
export const MINUTES_MIN = 5;
export const MINUTES_MAX = 600;

const round1 = (n: number) => Math.round(n * 10) / 10;
const oneDecimal = (n: number) => Number.isFinite(n) && Math.abs(Math.round(n * 10) - n * 10) < 1e-9;

// The marks a section counts: every question, or the N answered of an internal choice.
export const sectionMarks = (s: Pick<BlueprintSection, 'count' | 'marksEach' | 'answerAny'>): number => round1((s.answerAny > 0 ? s.answerAny : s.count) * s.marksEach);
export const blueprintTotal = (sections: readonly Pick<BlueprintSection, 'count' | 'marksEach' | 'answerAny'>[]): number => round1(sections.reduce((n, s) => n + sectionMarks(s), 0));

// ---- the settings' rows ------------------------------------------------------------------------------------------------

export type BlueprintRow = { exam_type: string; total_marks: number; minutes: number; easy: number; medium: number; hard: number; scope: string; weight: string };
export type SectionRow = { exam_type: string; section: string; kind: string; count: number; marks_each: number; answer_any: number };

const shape = (exam_type: string, total_marks: number, minutes: number, mix: [number, number, number], scope: ScopeRule): BlueprintRow => ({
  exam_type,
  total_marks,
  minutes,
  easy: mix[0],
  medium: mix[1],
  hard: mix[2],
  scope,
  weight: 'periods',
});
const sec = (exam_type: string, section: string, kind: QuestionKind, count: number, marks_each: number, answer_any = 0): SectionRow => ({ exam_type, section, kind, count, marks_each, answer_any });
const shortTest = (type: string): SectionRow[] => [sec(type, 'A', 'objective', 10, 1), sec(type, 'B', 'short', 5, 3)];
const midTest = (type: string): SectionRow[] => [sec(type, 'A', 'objective', 10, 1), sec(type, 'B', 'short', 6, 2), sec(type, 'C', 'long', 3, 6)];
const termPaper = (type: string): SectionRow[] => [
  sec(type, 'A', 'objective', 20, 1),
  sec(type, 'B', 'short', 5, 2),
  sec(type, 'C', 'short', 6, 3),
  sec(type, 'D', 'long', 5, 5, 4),
  sec(type, 'E', 'long', 3, 4),
];

// Defaults the school edits (see the note at the top): one for each default exam type that is a written paper, the
// practical left out, and "other" so an exam of no particular type can be made too.
export const DEFAULT_BLUEPRINT_ROWS: readonly BlueprintRow[] = [
  { ...shape('weekly', 20, 40, [40, 40, 20], 'since_last_of_type') },
  shape('monthly', 25, 60, [40, 40, 20], 'since_last_of_type'),
  shape('unit', 25, 60, [40, 40, 20], 'since_last_of_type'),
  shape('periodic', 40, 90, [30, 50, 20], 'since_last_of_type'),
  shape('sessional', 40, 90, [30, 50, 20], 'session'),
  shape('half_yearly', 80, 180, [30, 50, 20], 'session'),
  shape('annual', 80, 180, [30, 50, 20], 'whole_map'),
  shape('pre_board', 80, 180, [30, 50, 20], 'whole_map'),
  shape('other', 40, 90, [30, 50, 20], 'session'),
];
export const DEFAULT_SECTION_ROWS: readonly SectionRow[] = [
  sec('weekly', 'A', 'objective', 10, 1),
  sec('weekly', 'B', 'short', 5, 2),
  ...shortTest('monthly'),
  ...shortTest('unit'),
  ...midTest('periodic'),
  ...midTest('sessional'),
  ...termPaper('half_yearly'),
  ...termPaper('annual'),
  ...termPaper('pre_board'),
  ...midTest('other'),
];

// ---- from rows to blueprints -------------------------------------------------------------------------------------------

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

// The problems of the two lists, each as the settings framework names one (the field's key and a sentence). None: the
// lists make valid blueprints.
export function blueprintProblems(blueprints: unknown, sections: unknown): { key: string; message: string }[] {
  const out: { key: string; message: string }[] = [];
  const bp = Array.isArray(blueprints) ? (blueprints as Record<string, unknown>[]) : [];
  const ss = Array.isArray(sections) ? (sections as Record<string, unknown>[]) : [];
  const types = new Set<string>();
  bp.forEach((r, i) => {
    const at = `row ${i + 1}`;
    const total = num(r.total_marks);
    const minutes = num(r.minutes);
    const mix = [num(r.easy), num(r.medium), num(r.hard)];
    types.add(str(r.exam_type));
    if (!(total > 0 && total <= TOTAL_MAX && oneDecimal(total))) out.push({ key: 'paper_blueprints', message: `${at}: total marks must be above 0 and at most ${TOTAL_MAX}, with at most one decimal place` });
    if (!(Number.isInteger(minutes) && minutes >= MINUTES_MIN && minutes <= MINUTES_MAX)) out.push({ key: 'paper_blueprints', message: `${at}: the time must be whole minutes from ${MINUTES_MIN} to ${MINUTES_MAX}` });
    if (!mix.every((m) => Number.isInteger(m) && m >= 0 && m <= 100) || mix.reduce((a, b) => a + b, 0) !== 100) out.push({ key: 'paper_blueprints', message: `${at}: easy, medium and hard must be whole numbers that add up to 100` });
  });
  const seen = new Set<string>();
  const byType = new Map<string, Record<string, unknown>[]>();
  ss.forEach((r, i) => {
    const at = `row ${i + 1}`;
    const type = str(r.exam_type);
    const count = num(r.count);
    const each = num(r.marks_each);
    const any = num(r.answer_any);
    if (!types.has(type)) out.push({ key: 'paper_sections', message: `${at}: its exam type has no row in the question paper blueprints` });
    const pair = `${type}:${str(r.section)}`;
    if (seen.has(pair)) out.push({ key: 'paper_sections', message: `${at}: the same section is listed twice for one exam type` });
    seen.add(pair);
    if (!(Number.isInteger(count) && count >= 1 && count <= SECTION_MAX_COUNT)) out.push({ key: 'paper_sections', message: `${at}: the number of questions must be a whole number from 1 to ${SECTION_MAX_COUNT}` });
    if (!(each > 0 && each <= 100 && oneDecimal(each))) out.push({ key: 'paper_sections', message: `${at}: the marks of each question must be above 0 and at most 100, with at most one decimal place` });
    if (!(Number.isInteger(any) && any >= 0 && (any === 0 || any < count))) out.push({ key: 'paper_sections', message: `${at}: "answer any" must be 0 (answer every question) or fewer than the questions in the section` });
    byType.set(type, [...(byType.get(type) ?? []), r]);
  });
  for (const r of bp) {
    const type = str(r.exam_type);
    const rows = byType.get(type) ?? [];
    if (!rows.length) {
      out.push({ key: 'paper_sections', message: `the exam type ${type} needs at least one section` });
      continue;
    }
    const sum = blueprintTotal(rows.map((s) => ({ count: num(s.count), marksEach: num(s.marks_each), answerAny: num(s.answer_any) || 0 })));
    if (Number.isFinite(sum) && sum !== num(r.total_marks)) out.push({ key: 'paper_sections', message: `the sections of ${type} add up to ${sum} marks, not its total of ${num(r.total_marks)}` });
    const questions = rows.reduce((n, s) => n + (num(s.count) || 0), 0);
    if (questions > BLUEPRINT_MAX_QUESTIONS) out.push({ key: 'paper_sections', message: `the exam type ${type} has more than ${BLUEPRINT_MAX_QUESTIONS} questions` });
  }
  return out;
}

// The blueprints the lists make, sections in letter order. A type whose rows do not make a valid blueprint is left out
// (the setting's check refuses saving one; this guards a value saved before a rule existed).
export function blueprintsFrom(blueprints: unknown, sections: unknown): Blueprint[] {
  const bp = Array.isArray(blueprints) ? (blueprints as Record<string, unknown>[]) : [];
  const ss = Array.isArray(sections) ? (sections as Record<string, unknown>[]) : [];
  const out: Blueprint[] = [];
  for (const r of bp) {
    const examType = str(r.exam_type);
    if (!examType || out.some((b) => b.examType === examType)) continue;
    const scope = str(r.scope) as ScopeRule;
    const weight = str(r.weight) as WeightRule;
    if (!(SCOPE_RULES as readonly string[]).includes(scope) || !(WEIGHT_RULES as readonly string[]).includes(weight)) continue;
    const rows = ss
      .filter((s) => str(s.exam_type) === examType)
      .map((s) => ({ section: str(s.section), kind: str(s.kind) as QuestionKind, count: num(s.count), marksEach: num(s.marks_each), answerAny: num(s.answer_any) || 0 }))
      .sort((a, b) => a.section.localeCompare(b.section));
    const candidate: Blueprint = { examType, totalMarks: num(r.total_marks), minutes: num(r.minutes), mix: { easy: num(r.easy), medium: num(r.medium), hard: num(r.hard) }, scope, weight, sections: rows };
    if (blueprintCheck(candidate).length === 0) out.push(candidate);
  }
  return out;
}

export type BlueprintIssue = 'sections' | 'section' | 'kind' | 'count' | 'marks' | 'answer_any' | 'total' | 'minutes' | 'mix' | 'too_many' | 'twice';

// One blueprint's own rules: the setting's, and a teacher's change to the sections for one paper (C362).
export function blueprintCheck(b: Blueprint): BlueprintIssue[] {
  const issues = new Set<BlueprintIssue>();
  if (!b.sections.length || b.sections.length > SECTION_LETTERS.length) issues.add('sections');
  const letters = new Set<string>();
  for (const s of b.sections) {
    if (!(SECTION_LETTERS as readonly string[]).includes(s.section)) issues.add('section');
    if (letters.has(s.section)) issues.add('twice');
    letters.add(s.section);
    if (!(QUESTION_KINDS as readonly string[]).includes(s.kind)) issues.add('kind');
    if (!(Number.isInteger(s.count) && s.count >= 1 && s.count <= SECTION_MAX_COUNT)) issues.add('count');
    if (!(s.marksEach > 0 && s.marksEach <= 100 && oneDecimal(s.marksEach))) issues.add('marks');
    if (!(Number.isInteger(s.answerAny) && s.answerAny >= 0 && (s.answerAny === 0 || s.answerAny < s.count))) issues.add('answer_any');
  }
  if (b.sections.reduce((n, s) => n + (Number.isFinite(s.count) ? s.count : 0), 0) > BLUEPRINT_MAX_QUESTIONS) issues.add('too_many');
  if (!(b.totalMarks > 0 && b.totalMarks <= TOTAL_MAX && oneDecimal(b.totalMarks)) || blueprintTotal(b.sections) !== b.totalMarks) issues.add('total');
  if (!(Number.isInteger(b.minutes) && b.minutes >= MINUTES_MIN && b.minutes <= MINUTES_MAX)) issues.add('minutes');
  const mix = [b.mix.easy, b.mix.medium, b.mix.hard];
  if (!mix.every((m) => Number.isInteger(m) && m >= 0 && m <= 100) || mix.reduce((x, y) => x + y, 0) !== 100) issues.add('mix');
  return [...issues];
}

// A teacher's sections for one paper, as sent: the type's blueprint with these sections instead (total from them).
// Null when they are not sections at all.
export function withSections(base: Blueprint, raw: unknown): Blueprint | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > SECTION_LETTERS.length) return null;
  const sections: BlueprintSection[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) return null;
    const s = r as Record<string, unknown>;
    sections.push({ section: str(s.section).toUpperCase(), kind: str(s.kind) as QuestionKind, count: num(s.count), marksEach: num(s.marksEach), answerAny: s.answerAny === undefined || s.answerAny === null ? 0 : num(s.answerAny) });
  }
  sections.sort((a, b) => a.section.localeCompare(b.section));
  return { ...base, sections, totalMarks: blueprintTotal(sections) };
}

export function blueprintOf(blueprints: readonly Blueprint[], examType: string): Blueprint | null {
  return blueprints.find((b) => b.examType === examType) ?? null;
}
