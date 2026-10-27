import { OPTION_KEYS, OPTION_TEXT_MAX, OPTIONS_MAX, OPTIONS_MIN, WRONG_MARKS_MAX, type CorrectAnswer, type MarkingQuestion, type OptionKey, type QuestionKind, type QuestionOption } from '@/lib/contracts/marking';

// Marking by rules (docs/36, C361): a choice or number answer against the question's correct answer, for the bubble
// sheet (C364) and the online test (C365). Never the AI's. A wrong answer takes off the paper's wrong marks as a mark
// below nothing on that question, and a part's score never goes below 0 (rollup.ts), so every view that adds question
// marks up agrees. The checks on options and correct answers live here too, so the questions editor (in the browser)
// and the server name the same mistake. Pure: safe in the browser.

type RuleQuestion = Pick<MarkingQuestion, 'kind' | 'maxMarks' | 'options' | 'correct'>;

// A child's answer to a rule-marked question: the option keys shaded or chosen, or the number given. Null: none.
export type RuleAnswer = { keys: OptionKey[] } | { value: number } | null;
export type RuleMark = { attempted: boolean; right: boolean; marks: number };

const round1 = (n: number) => Math.round(n * 10) / 10;
const isKey = (k: unknown): k is OptionKey => typeof k === 'string' && (OPTION_KEYS as readonly string[]).includes(k);

// Whether rules can mark the question: a choice question with options and its right keys, or a number question with
// its value.
export function ruleMarkable(q: Pick<MarkingQuestion, 'kind' | 'options' | 'correct'>): boolean {
  if (!q.correct) return false;
  if (q.kind === 'objective') return q.options.length > 0 && 'keys' in q.correct && q.correct.keys.length > 0;
  if (q.kind === 'numerical') return 'value' in q.correct;
  return false;
}

// The mark for one answer. Right: the question's marks. Wrong: minus the wrong marks (0 when the school sets none).
// Not answered: 0. A choice question is right only when exactly its right keys are chosen. Null: rules do not mark it.
export function marksByRule(q: RuleQuestion, answer: RuleAnswer, wrongMarks: number): RuleMark | null {
  if (!ruleMarkable(q) || !q.correct) return null;
  const off = round1(Math.min(Math.max(wrongMarks, 0), WRONG_MARKS_MAX));
  const wrong: RuleMark = { attempted: true, right: false, marks: off > 0 ? -off : 0 };
  const right: RuleMark = { attempted: true, right: true, marks: q.maxMarks };
  if (answer === null) return { attempted: false, right: false, marks: 0 };
  if ('keys' in q.correct) {
    if (!('keys' in answer) || answer.keys.length === 0) return 'keys' in answer ? { attempted: false, right: false, marks: 0 } : wrong;
    const given = new Set(answer.keys);
    const want = new Set(q.correct.keys);
    return given.size === want.size && [...want].every((k) => given.has(k)) ? right : wrong;
  }
  if (!('value' in answer) || !Number.isFinite(answer.value)) return wrong;
  return Math.abs(answer.value - q.correct.value) <= q.correct.tolerance + 1e-9 ? right : wrong;
}

// The range a teacher may give a question: below nothing only where rules mark it and the school takes marks off.
export function markRange(q: Pick<MarkingQuestion, 'kind' | 'maxMarks' | 'options' | 'correct'>, wrongMarks: number): { min: number; max: number } {
  return { min: ruleMarkable(q) && wrongMarks > 0 ? -round1(Math.min(wrongMarks, WRONG_MARKS_MAX)) : 0, max: q.maxMarks };
}

export type AnswerFieldProblem = 'options' | 'correct';

// A question's options as sent: none, or 2 to 6, keyed A, B, C… in order, each a few words. Only a choice question
// has them.
export function cleanOptions(raw: unknown, kind: QuestionKind): { ok: true; options: QuestionOption[] } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, options: [] };
  if (!Array.isArray(raw)) return { ok: false };
  if (raw.length === 0) return { ok: true, options: [] };
  if (kind !== 'objective' || raw.length < OPTIONS_MIN || raw.length > OPTIONS_MAX) return { ok: false };
  const options: QuestionOption[] = [];
  for (let i = 0; i < raw.length; i++) {
    const o = raw[i] as { key?: unknown; text?: unknown } | null;
    const text = typeof o?.text === 'string' ? o.text.trim() : '';
    if (o?.key !== OPTION_KEYS[i] || !text || text.length > OPTION_TEXT_MAX) return { ok: false };
    options.push({ key: OPTION_KEYS[i], text });
  }
  return { ok: true, options };
}

// A question's correct answer as sent: none; the right keys of a choice question (among its options); or a number
// question's value and tolerance (0 when not given).
export function cleanCorrect(raw: unknown, kind: QuestionKind, options: readonly QuestionOption[]): { ok: true; correct: CorrectAnswer | null } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, correct: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  const c = raw as { keys?: unknown; value?: unknown; tolerance?: unknown };
  if (kind === 'objective') {
    if (!options.length || !Array.isArray(c.keys) || c.keys.length === 0 || c.keys.length > options.length) return { ok: false };
    const keys = [...new Set(c.keys)];
    if (keys.length !== c.keys.length || !keys.every((k) => isKey(k) && options.some((o) => o.key === k))) return { ok: false };
    return { ok: true, correct: { keys: [...(keys as OptionKey[])].sort() } };
  }
  if (kind === 'numerical') {
    const tolerance = c.tolerance === undefined || c.tolerance === null ? 0 : c.tolerance;
    if (typeof c.value !== 'number' || !Number.isFinite(c.value) || Math.abs(c.value) > 1e12) return { ok: false };
    if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1e12) return { ok: false };
    return { ok: true, correct: { value: c.value, tolerance } };
  }
  return { ok: false };
}

// The wrong marks as sent: 0 to 10, one decimal place (none: 0).
export function cleanWrongMarks(raw: unknown): number | null {
  if (raw === null) return 0;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > WRONG_MARKS_MAX || Math.round(raw * 10) !== raw * 10) return null;
  return raw;
}
