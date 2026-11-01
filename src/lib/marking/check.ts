import { MARK_CHECKS, type MarkCheck, type QuestionResult } from '@/lib/contracts/marking';

// W14-C: the AI's marks for one question checked against its own words, before they are kept (src/lib/marking/store.ts).
// The founder's live test found reasons that called an answer "fully correct" beside 0 marks, and sure marks with no
// reason at all; such a question keeps a short check (these codes, shown beside the mark on the review screen) and its
// script goes to "Needs a look". Pure, so it is tested on its own (test/marking/check.test.ts).
//
//   says_right    0 marks for an attempted answer the reason calls correct or right
//   says_wrong    full marks while the reason calls the answer wrong, incorrect or not attempted
//   above_max     marks above the question's marks (they are not kept)
//   steps_sum     the steps awarded do not add up to the marks (by more than 0.1)
//   no_reason     an attempted answer marked with confidence 0.9 or more and no reason given
export { MARK_CHECKS, type MarkCheck };

// A word that turns the next few words around ("not correct", "isn't right", "nothing wrong").
const NEGATION = /\b(?:not|no|never|nothing|none|nor|hardly|isn't|wasn't|aren't|weren't|doesn't|didn't|cannot|can't)\b|n't\b/i;
// "is correct", "fully correct", "correctly"... but not "the correct answer is 5", which only names the key.
const SAYS_RIGHT = /\b(?:(?:is|are|was|were|fully|entirely|completely|totally|all|perfectly|absolutely)\s+(?:correct|right)|correctly)\b|पूरी तरह सही|सही है/giu;
const SAYS_WRONG = /\b(?:wrong|incorrect|incorrectly|not attempted)\b|गलत|ग़लत/giu;

// Whether a match stands on its own: no negation in the few words before it on the same clause.
function standing(text: string, re: RegExp): boolean {
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const before = text.slice(Math.max(0, m.index - 24), m.index).split(/[.;,:!?]/).pop() ?? '';
    // "not attempted" carries its own negation and is what it says.
    if (/not attempted/i.test(m[0]) || !NEGATION.test(before)) return true;
  }
  return false;
}

// The reason's own judgement, after the words it quotes from the sheet (prompt v2 begins with them in quotation marks):
// a child's "x = 5 is correct" written on the sheet is not the AI's judgement.
const unquoted = (reason: string): string => reason.replace(/"[^"]*"|“[^”]*”/g, ' ');

export function markChecks(r: Pick<QuestionResult, 'attempted' | 'marks' | 'steps' | 'reason' | 'confidence'> | undefined, maxMarks: number): MarkCheck[] {
  if (!r) return [];
  const out: MarkCheck[] = [];
  const reason = typeof r.reason === 'string' ? r.reason.trim() : '';
  const judged = unquoted(reason).replace(/[\u2018\u2019]/g, "'");
  const marks = typeof r.marks === 'number' && Number.isFinite(r.marks) ? r.marks : null;
  if (r.attempted && marks === 0 && maxMarks > 0 && standing(judged, SAYS_RIGHT)) out.push('says_right');
  if (marks !== null && maxMarks > 0 && marks === maxMarks && standing(judged, SAYS_WRONG)) out.push('says_wrong');
  if (marks !== null && marks > maxMarks) out.push('above_max');
  if (r.attempted && marks !== null && r.steps.length > 0) {
    const sum = r.steps.reduce((n, s) => n + (typeof s.awarded === 'number' && Number.isFinite(s.awarded) ? s.awarded : 0), 0);
    if (Math.abs(sum - marks) > 0.1 + 1e-9) out.push('steps_sum');
  }
  // A question left blank needs no reason.
  if (r.attempted && typeof r.confidence === 'number' && r.confidence >= 0.9 && !reason) out.push('no_reason');
  return out;
}

// The codes as kept in marking_marks.check_reason (at most 200 characters), and read back for the screen.
export const checkReasonOf = (checks: readonly MarkCheck[]): string | null => (checks.length ? checks.join(',') : null);
export const checksOf = (stored: unknown): MarkCheck[] =>
  typeof stored === 'string' ? stored.split(',').filter((c): c is MarkCheck => (MARK_CHECKS as readonly string[]).includes(c)) : [];
