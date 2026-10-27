import { OPTION_KEYS, type BubbleReading, type OptionKey } from '@/lib/contracts/marking';
import { LAYOUT_KEY_RE, SHEET_NO_MAX, type SheetLayout } from './layout';

// A bubble reading as the browser sends it with its page (C364), checked strictly on the server before anything is kept:
// the sheet's own answer grid (the same fingerprint as today's questions), numbers in range, every question one of the
// sheet's, every option one of that question's, and the lists consistent with the answers (a question with two filled
// options is `multiple` unless it is `unclear`). Pure: the route checks the shape before it takes a connection, and the
// library checks it against the paper's layout in its transaction.

export const READING_MAX_CHARS = 16_000;
const FIELDS = new Set(['layout', 'sheetNo', 'roll', 'rollUnclear', 'answers', 'unclear', 'multiple', 'confidence']);
const isKey = (k: unknown): k is OptionKey => typeof k === 'string' && (OPTION_KEYS as readonly string[]).includes(k);

export type ReadingProblem = { ok: false; field: string };

// The shape alone (no paper needed): a JSON object with only the known fields, of the right types and sizes.
export function readingShape(text: unknown): { ok: true; raw: Record<string, unknown> } | ReadingProblem {
  if (typeof text !== 'string' || text.length === 0 || text.length > READING_MAX_CHARS) return { ok: false, field: 'reading' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, field: 'reading' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, field: 'reading' };
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) if (!FIELDS.has(k)) return { ok: false, field: k };
  if (typeof r.layout !== 'string' || !LAYOUT_KEY_RE.test(r.layout)) return { ok: false, field: 'layout' };
  return { ok: true, raw: r };
}

// The reading checked against the paper's layout; the answer lists sorted and made plain.
export function cleanReading(raw: Record<string, unknown>, layout: SheetLayout): { ok: true; reading: BubbleReading } | ReadingProblem {
  if (raw.layout !== layout.key) return { ok: false, field: 'layout' };
  const sheetNo = raw.sheetNo ?? null;
  if (sheetNo !== null && (typeof sheetNo !== 'number' || !Number.isInteger(sheetNo) || sheetNo < 1 || sheetNo > SHEET_NO_MAX)) return { ok: false, field: 'sheetNo' };
  const roll = raw.roll ?? null;
  if (roll !== null && (typeof roll !== 'string' || !/^[0-9]{1,4}$/.test(roll))) return { ok: false, field: 'roll' };
  const rollUnclear = raw.rollUnclear ?? false;
  if (typeof rollUnclear !== 'boolean' || (rollUnclear && roll !== null)) return { ok: false, field: 'rollUnclear' };
  const confidence = raw.confidence;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return { ok: false, field: 'confidence' };
  const byLabel = new Map(layout.questions.map((q) => [q.label, q]));
  const labels = (v: unknown): string[] | null => {
    if (!Array.isArray(v) || v.length > layout.questions.length) return null;
    if (!v.every((l) => typeof l === 'string' && byLabel.has(l)) || new Set(v).size !== v.length) return null;
    return [...(v as string[])].sort((a, b) => layout.questions.findIndex((q) => q.label === a) - layout.questions.findIndex((q) => q.label === b));
  };
  const unclear = labels(raw.unclear ?? []);
  if (!unclear) return { ok: false, field: 'unclear' };
  const multiple = labels(raw.multiple ?? []);
  if (!multiple) return { ok: false, field: 'multiple' };
  const given = raw.answers ?? {};
  if (typeof given !== 'object' || given === null || Array.isArray(given)) return { ok: false, field: 'answers' };
  const answers: Record<string, OptionKey[]> = {};
  for (const [label, keys] of Object.entries(given as Record<string, unknown>)) {
    const q = byLabel.get(label);
    if (!q || !Array.isArray(keys) || keys.length === 0 || keys.length > q.keys.length || new Set(keys).size !== keys.length) return { ok: false, field: 'answers' };
    if (!keys.every((k) => isKey(k) && q.keys.includes(k))) return { ok: false, field: 'answers' };
    answers[label] = [...(keys as OptionKey[])].sort();
  }
  // Two marks or more, and not unclear: `multiple`, and nothing else is.
  for (const q of layout.questions) {
    const two = (answers[q.label]?.length ?? 0) >= 2 && !unclear.includes(q.label);
    if (two !== multiple.includes(q.label)) return { ok: false, field: 'multiple' };
  }
  return { ok: true, reading: { layout: layout.key, sheetNo: sheetNo as number | null, roll: roll as string | null, rollUnclear, answers, unclear, multiple, confidence: Math.round(confidence * 100) / 100 } };
}
