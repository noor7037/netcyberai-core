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
