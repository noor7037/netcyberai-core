import { ERROR_TYPES, type ErrorType, type MarkingQuestion, type MarkingUnit, type PageReading, type QuestionResult, type SheetResult } from '@/lib/contracts/marking';

// The AI's answers for AI marking, read as data (C347, C349): exams.read_pages (what each page shows) and exams.mark
// (one script's marks). Pure. The answer is one JSON object, found even with code fences or a few words around it;
// every field is checked against the schema the prompt gives (src/lib/ai/prompts/exams.*), and anything else is
// dropped: an unknown field, a label the paper does not have, a page or topic number out of range, a mark above the
// question's marks. What is kept is checked again when it is written (src/lib/marking/store.ts), so a mistake here
// cannot reach the database either.

// The longest words kept, as the tables allow them.
const NAME_MAX = 120;
const NUMBER_MAX = 24;
const NOTE_MAX = 1000;
const REASON_MAX = 1500;
const STEP_MAX = 300;
const STEPS_MAX = 12;
const PRACTICE_MAX = 8;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o: Obj, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

// Words as given, trimmed and of at most `max` characters (cut, never half a character); null for anything else.
function words(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!t) return null;
  return Array.from(t).slice(0, max).join('').trim() || null;
}

// A number with at most one decimal place, between `min` and `max`; null otherwise.
function oneDecimal(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const tenths = Math.round(v * 10);
  if (Math.abs(tenths - v * 10) > 1e-6) return null;
  const n = tenths / 10;
  return n >= min && n <= max ? n : null;
}

const fraction = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);
const wholeIn = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null);

// How many opening braces are tried before an answer is given up: each try reads the rest of the answer once, so a
// hostile answer made of braces costs at most this many readings.
const STARTS_TRIED = 64;

// The one JSON object in an answer: the first balanced {...} that parses and has the key `want`, so code fences and
// words around it do not matter; null when there is none (a cut-off answer has no closing brace).
export function jsonObjectIn(text: string, want: string): Obj | null {
  if (typeof text !== 'string') return null;
  let tried = 0;
  for (let start = text.indexOf('{'); start >= 0 && tried < STARTS_TRIED; start = text.indexOf('{', start + 1), tried++) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try {
          const parsed: unknown = JSON.parse(text.slice(start, i + 1));
          if (isObj(parsed) && Object.prototype.hasOwnProperty.call(parsed, want)) return parsed;
        } catch {
          // Not JSON from this brace: try the next one.
        }
        break;
      }
    }
  }
  return null;
}

// ---- exams.read_pages ------------------------------------------------------------------------------------------------

// What the AI read on each of the `pageCount` pages sent, in order; null for a page it gave no valid entry for. A page's
// entry needs its place ("page", 1 to pageCount) and true or false for blank and legible; a name or number that is not
// words is left out (null), never guessed.
export function parseReading(text: string, pageCount: number): (PageReading | null)[] {
  const out: (PageReading | null)[] = Array.from({ length: Math.max(0, Math.floor(pageCount)) }, () => null);
  const root = jsonObjectIn(text, 'pages');
  const pages = root ? own(root, 'pages') : null;
  if (!Array.isArray(pages)) return out;
  for (const raw of pages.slice(0, 200)) {
    if (!isObj(raw)) continue;
    const at = wholeIn(own(raw, 'page'), 1, out.length);
    if (at === null || out[at - 1] !== null) continue;
    const blank = own(raw, 'blank');
    const legible = own(raw, 'legible');
    if (typeof blank !== 'boolean' || typeof legible !== 'boolean') continue;
    out[at - 1] = {
      firstPage: own(raw, 'first_page') === true,
      name: words(own(raw, 'name'), NAME_MAX),
      rollNo: words(own(raw, 'roll_no'), NUMBER_MAX),
      seatNo: words(own(raw, 'exam_no'), NUMBER_MAX),
      classSection: words(own(raw, 'class_section'), NUMBER_MAX),
      pageNumber: wholeIn(own(raw, 'page_number'), 1, 999),
      blank,
      legible,
    };
  }
  return out;
}

// ---- exams.mark ------------------------------------------------------------------------------------------------------

// A label as printed, for matching: case and spaces do not count ("2 (A)" is "2(a)").
export const labelKey = (label: string) => label.replace(/\s+/g, '').toLowerCase();

// One script's marks, from the AI's answer: each entry matched to a question of the paper by its label, a page number
// (1 is the script's first page) to its page, and a practice topic's number (1 is the first of `units`) to its unit.
// Null when the answer has no usable question at all: then the script fails on its own, and the class goes on.
export function parseMarking(text: string, questions: readonly Pick<MarkingQuestion, 'questionId' | 'label' | 'maxMarks'>[], pageIds: readonly string[], units: readonly Pick<MarkingUnit, 'unitId'>[]): SheetResult | null {
  const root = jsonObjectIn(text, 'questions');
  const given = root ? own(root, 'questions') : null;
  if (!Array.isArray(given)) return null;
  const byLabel = new Map(questions.map((q) => [labelKey(q.label), q]));
  const seen = new Set<string>();
  const results: QuestionResult[] = [];
  for (const raw of given.slice(0, 400)) {
    if (!isObj(raw)) continue;
    const label = own(raw, 'label');
    const q = typeof label === 'string' || typeof label === 'number' ? byLabel.get(labelKey(String(label))) : undefined;
    if (!q || seen.has(q.questionId)) continue;
    const attempted = own(raw, 'attempted');
    if (typeof attempted !== 'boolean') continue;
    seen.add(q.questionId);
    const steps = (Array.isArray(own(raw, 'steps')) ? (own(raw, 'steps') as unknown[]) : [])
      .filter(isObj)
      .map((s) => ({ step: words(own(s, 'step'), STEP_MAX), awarded: oneDecimal(own(s, 'awarded'), 0, q.maxMarks), note: words(own(s, 'note'), STEP_MAX) }))
      .filter((s): s is { step: string; awarded: number; note: string | null } => s.step !== null && s.awarded !== null)
      .slice(0, STEPS_MAX);
    const errorType = own(raw, 'error_type');
    const page = wholeIn(own(raw, 'page'), 1, pageIds.length);
    const yFrom = fraction(own(raw, 'y_from'));
    const yTo = fraction(own(raw, 'y_to'));
    const placed = page !== null && yFrom !== null && yTo !== null;
    results.push({
      questionId: q.questionId,
      attempted,
      // Not attempted: nothing, whatever was sent.
      marks: attempted ? oneDecimal(own(raw, 'marks'), 0, q.maxMarks) : 0,
      steps: attempted ? steps : [],
      note: words(own(raw, 'note'), NOTE_MAX),
      reason: words(own(raw, 'reason'), REASON_MAX),
      errorType: typeof errorType === 'string' && (ERROR_TYPES as readonly string[]).includes(errorType) ? (errorType as ErrorType) : attempted ? null : 'not_attempted',
      confidence: fraction(own(raw, 'confidence')),
      pageId: placed ? pageIds[page - 1] : null,
      yFrom: placed ? Math.min(yFrom, yTo) : null,
      yTo: placed ? Math.max(yFrom, yTo) : null,
    });
  }
  if (results.length === 0) return null;
  const practice = (Array.isArray(own(root!, 'practice')) ? (own(root!, 'practice') as unknown[]) : [])
    .filter(isObj)
    .map((p) => {
      const topic = wholeIn(own(p, 'topic'), 1, units.length);
      return { unitId: topic === null ? null : units[topic - 1].unitId, text: words(own(p, 'text'), STEP_MAX) };
    })
    .filter((p): p is { unitId: string | null; text: string } => p.text !== null)
    .slice(0, PRACTICE_MAX);
  return { questions: results, strengths: words(own(root!, 'strengths'), NOTE_MAX), improve: words(own(root!, 'improve'), NOTE_MAX), practice };
}
