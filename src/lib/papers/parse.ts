import { OPTION_TEXT_MAX, type CorrectAnswer, type MarkingStep, type OptionKey, type QuestionKind, type QuestionOption } from '@/lib/contracts/marking';
import { jsonObjectIn } from '@/lib/marking/parse';

// The AI's questions for a paper (exams.write_questions, C363), read as data. Pure. The answer is one JSON object,
// found even with code fences or words around it; every question is checked against its slot and the prompt's schema,
// and a question that fails any check is dropped (its slot is asked for again, or left for the teacher), never mended
// or guessed:
//   - its slot is one asked for, answered once;
//   - its words are words, of the lengths a question allows, and not a question to avoid (or one already given);
//   - a multiple choice question has exactly four options A to D and one right key among them, and its answer key
//     names that key first (it is put first when the answer does not); any other kind has no options;
//   - a numerical problem's value, when given, is a number (and its tolerance, 0 or more);
//   - it has an answer key and one to twelve marking steps whose marks add up to exactly the slot's marks.

export type SlotAsk = { slot: number; kind: QuestionKind; marks: number };
export type WrittenQuestion = { prompt: string; options: QuestionOption[]; correct: CorrectAnswer | null; answerKey: string; steps: MarkingStep[] };

const PROMPT_MAX = 4000;
const KEY_MAX = 8000;
const STEP_MAX = 300;
const STEPS_MAX = 12;
const CHOICE_KEYS: readonly OptionKey[] = ['A', 'B', 'C', 'D'];
const OPTIONS_BYTES = 3900;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o: Obj, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

// Words as given: trimmed, control characters removed, of at most `max` characters; null when empty or too long (a
// question cut short is not a question).
function words(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  return t && Array.from(t).length <= max ? t : null;
}
const oneDecimal = (v: unknown): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const tenths = Math.round(v * 10);
  return Math.abs(tenths - v * 10) < 1e-6 ? tenths / 10 : null;
};
// How two questions compare: case, spaces and punctuation do not count.
export const sameWords = (s: string) => s.toLowerCase().normalize('NFC').replace(/[\s\p{P}]+/gu, ' ').trim();

function steps(v: unknown, marks: number): MarkingStep[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > STEPS_MAX) return null;
  const out: MarkingStep[] = [];
  for (const s of v) {
    if (!isObj(s)) return null;
    const step = words(own(s, 'step'), STEP_MAX);
    const m = oneDecimal(own(s, 'marks'));
    if (!step || m === null || m <= 0) return null;
    out.push({ step, marks: m });
  }
  const sum = Math.round(out.reduce((n, s) => n + s.marks, 0) * 10) / 10;
  return sum === marks ? out : null;
}

function one(raw: Obj, ask: SlotAsk): WrittenQuestion | null {
  const prompt = words(own(raw, 'prompt'), PROMPT_MAX);
  const answer = words(own(raw, 'answer_key'), KEY_MAX - 4);
  const marking = steps(own(raw, 'steps'), ask.marks);
  if (!prompt || !answer || !marking) return null;
  const rawOptions = own(raw, 'options');
  if (ask.kind === 'objective') {
    if (!Array.isArray(rawOptions) || rawOptions.length !== CHOICE_KEYS.length) return null;
    const options: QuestionOption[] = [];
    for (let i = 0; i < CHOICE_KEYS.length; i++) {
      const o = rawOptions[i];
      const text = isObj(o) ? words(own(o, 'text'), OPTION_TEXT_MAX) : null;
      if (!isObj(o) || own(o, 'key') !== CHOICE_KEYS[i] || !text) return null;
      options.push({ key: CHOICE_KEYS[i], text });
    }
    if (new Set(options.map((o) => sameWords(o.text))).size !== options.length) return null;
    // The database keeps a question's options in at most 4000 bytes (long Hindi options can pass the characters' limit).
    if (new TextEncoder().encode(JSON.stringify(options)).length > OPTIONS_BYTES) return null;
    const c = own(raw, 'correct');
    const key = typeof c === 'string' ? c.trim().toUpperCase() : Array.isArray(c) && c.length === 1 && typeof c[0] === 'string' ? c[0].trim().toUpperCase() : null;
    if (!key || !(CHOICE_KEYS as readonly string[]).includes(key)) return null;
    // The answer key names the right option first, so the marking scheme and the AI marker read the same key.
    const answerKey = new RegExp(`^\\(?${key}\\b`).test(answer) ? answer : `${key}: ${answer}`;
    return { prompt, options, correct: { keys: [key as OptionKey] }, answerKey, steps: marking };
  }
  if (Array.isArray(rawOptions) && rawOptions.length > 0) return null;
  if (ask.kind === 'numerical') {
    const value = own(raw, 'value');
    const tolerance = own(raw, 'tolerance');
    if (value === null || value === undefined) return { prompt, options: [], correct: null, answerKey: answer, steps: marking };
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12) return null;
    const tol = tolerance === null || tolerance === undefined ? 0 : tolerance;
    if (typeof tol !== 'number' || !Number.isFinite(tol) || tol < 0 || tol > 1e12) return null;
    return { prompt, options: [], correct: { value, tolerance: tol }, answerKey: answer, steps: marking };
  }
  return { prompt, options: [], correct: null, answerKey: answer, steps: marking };
}

// The questions the answer gives, by slot; a slot with no valid question is missing from the map.
export function parseWritten(text: string, asks: readonly SlotAsk[], avoid: readonly string[]): Map<number, WrittenQuestion> {
  const out = new Map<number, WrittenQuestion>();
  const root = jsonObjectIn(text, 'questions');
  const given = root ? own(root, 'questions') : null;
  if (!Array.isArray(given)) return out;
  const bySlot = new Map(asks.map((a) => [a.slot, a]));
  const seen = new Set(avoid.map(sameWords));
  for (const raw of given.slice(0, 200)) {
    if (!isObj(raw)) continue;
    const slot = own(raw, 'slot');
    const ask = typeof slot === 'number' && Number.isInteger(slot) ? bySlot.get(slot) : undefined;
    if (!ask || out.has(ask.slot)) continue;
    const q = one(raw, ask);
    if (!q || seen.has(sameWords(q.prompt))) continue;
    seen.add(sameWords(q.prompt));
    out.set(ask.slot, q);
  }
  return out;
}
