import { evaluateEquation } from './arithmetic-check';
import { SEGMENT, TYPED_CHECK } from './check-intent';

// Check my work (W16-B2): the chapter search for the question a photo of the child's own working showed.
//
// Chapter retrieval (src/lib/ai/teaching/retrieve.ts) reads its question as a web search: every word must be in the
// chapter. A word problem read from a photo ("A force of 20 N acts on an area of 4 m2. Find the pressure.") never is, so
// the search would find nothing. This keeps the question's content words and joins them with "or": the chapter that
// holds most of them ranks first, and the open chapter and the child's own syllabus still lead (retrieve.ts). Pure.

const STOP = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'has', 'have', 'had', 'with', 'that', 'this', 'from', 'into', 'its', 'not', 'but', 'any', 'all', 'each', 'one',
  'find', 'what', 'which', 'when', 'where', 'how', 'why', 'who', 'calculate', 'write', 'give', 'given', 'show', 'solve', 'state', 'name', 'explain', 'will', 'can', 'does', 'then', 'also', 'than', 'their', 'there', 'they', 'them', 'you', 'your', 'our', 'out', 'use', 'used', 'using', 'question', 'answer',
  // the search operators, so a word can never act as one
  'or', 'near',
]);
const WORD = /[\p{L}\p{M}]+/gu;
const MAX_WORDS = 12;

// "force or area or pressure": up to MAX_WORDS distinct content words, in the order they appear. '' when there is none.
export function checkSearchQuery(question: string): string {
  const seen = new Set<string>();
  for (const raw of question.normalize('NFKC').match(WORD) ?? []) {
    const word = raw.toLowerCase();
    const latin = /^[a-z]+$/.test(word);
    if (latin ? word.length < 3 || STOP.has(word) : word.length < 2) continue;
    seen.add(word);
    if (seen.size >= MAX_WORDS) break;
  }
  return [...seen].join(' or ');
}

// W18-Q3, typed Check my work: a child who types "Check my work: 2+3×4=14" (or "is this right", "मेरा काम जाँचो",
// "क्या यह सही है") wants that working marked, not a lesson on it. Shared by the tutor window (it sends mode 'check') and
// the understand route (it accepts that mode with no photo only for text of this shape, and builds the reading itself).

const WORKING_MAX = 8;

// The working lines of a typed check, as typed: every segment after the opening words that our arithmetic can judge.
// [] when the text does not open with those words or holds no equation we can mark (it is then an ordinary question).
export function typedCheckWorking(text: string): string[] {
  const m = TYPED_CHECK.exec(text.normalize('NFC'));
  if (!m) return [];
  return text
    .normalize('NFC')
    .slice(m[0].length)
    .split(SEGMENT)
    .map((x) => x.replace(/[\s.;:!?,।]+$/u, '').trim())
    .filter((x) => x.length > 0 && evaluateEquation(x) !== null)
    .slice(0, WORKING_MAX);
}

export const typedCheckIntent = (text: string): boolean => typedCheckWorking(text).length > 0;

// The reading a photo's read would give ("Line 1: …"), built from the typed working: no photo, no vision call. null when
// the text is not a typed check.
export function typedCheckReading(text: string): string | null {
  const lines = typedCheckWorking(text);
  return lines.length > 0 ? lines.map((l, i) => `Line ${i + 1}: ${l}`).join('\n') : null;
}
