// Maths tutoring (§8, 18 Nov 2026): a sum is SOLVED first. A Class 3 child asked the thief-and-policeman sum and got a
// story, a wrong simulation and videos, with no working. For a maths question with quantities to find, the answer now
// opens with one worked_example block in its solution form (Given, To find, each step with its reason, the final answer,
// a quick check), then the "Did you understand?" quick replies; the elaboration, pictures, a simulation and videos may
// follow, never instead of it, and a simulation or video that is not about the sum is left out.
// Everything here is deterministic: the request line (the live prompt may still prefer the elaboration), the order, and
// the attachment guards. No model, no network.

const DIGITS = /[0-9०-९]+(?:[.,][0-9०-९]+)?/g;
// What a word problem asks for (English and Hindi), or a sum written out.
const FIND_CUE =
  /\b(how\s+(many|much|long|far|fast|old)|after\s+how|find|calculate|work\s+out|solve|evaluate|simplify|what\s+is\s+the\s+(total|sum|difference|product|value|speed|distance|time|area|perimeter|cost|price|profit|loss|average)|total\s+(distance|cost|time)|when\s+(will|do|does|would)|where\s+(will|do|does|would)|at\s+what\s+(time|speed|distance)|catch(es)?\s+(up|the)|overtake|meet)\b|कितन|ज्ञात|हल\s*कर|निकाल|गणना|कब\s|कहाँ|पकड़|मिलेंग|मिलेगा/i;
const EXPRESSION = /[0-9०-९]\s*[-+×x*/÷^=]\s*[0-9०-९]/;

// A sum: a mathematics question with a number and something to find (or a sum written out), or, in any subject, a word
// problem with two quantities and something to find.
export function isMathsSum(subject: string | null | undefined, text: string): boolean {
  const t = text.slice(0, 2000);
  const numbers = (t.match(DIGITS) ?? []).length;
  // A "why is 1/2 the same as 2/4" is a concept to explain, not a sum to solve, unless it also asks to find something.
  const concept = /^\s*(why|how\s+does|how\s+do\s+we\s+know|explain|क्यों|समझा)/i.test(t);
  const asks = FIND_CUE.test(t) || (EXPRESSION.test(t) && !concept);
  if (subject === 'mathematics') return numbers >= 1 && asks;
  return numbers >= 2 && FIND_CUE.test(t);
}

// The request line added to the live prompt's system text for a sum (before its closing rules), in code, so the
// solution is asked for whatever the prompt version in Control says. The founder's copy for Control:
// docs/family-app/prompts/MATHS_SOLVE_ADDENDUM.md.
export const MATHS_SOLVE_LINE =
  'THIS QUESTION IS A MATHS SUM: SOLVE IT FIRST. Before any other block (after the subject line), write ONE JSON line, the solution, of this shape: ' +
  '{"type":"worked_example","problem":"the sum in one or two short lines","given":["each fact given, with its unit"],"find":["each quantity asked for"],' +
  '"steps":[{"text":"what this step does","why":"why we do it","expression":"plain arithmetic, for example 100 + 110 + 120","result":"its value"}],' +
  '"table":{"columns":["Minute","Thief (m)","Policeman (m)"],"rows":[["1","100","0"]]},' +
  '"answer":"the final answer to EVERY part asked, with units","check":{"text":"a quick check that the answer is right","expression":"plain arithmetic","result":"its value"}}. ' +
  'Every expression is numbers with + - × ÷ ( ) only, and its result is exactly right: one wrong step drops the whole solution. ' +
  'Give 2 to 8 steps a child of this class can follow. Use "table" (optional, at most 12 rows) when a quantity changes step by step, such as a speed that grows each minute. ' +
  'When two things are asked, the answer gives both. The check shows the answer works (for example, both distances are equal at the catch). ' +
  'Only after the solution line, write the rest of the answer; its numbers agree with the solution, and a story or picture never replaces the working.';

export function withMathsSolve(system: string, solve: boolean): string {
  if (!solve) return system;
  const at = system.indexOf('\nRules: ');
  return at < 0 ? `${system}\n${MATHS_SOLVE_LINE}` : `${system.slice(0, at)}\n${MATHS_SOLVE_LINE}${system.slice(at)}`;
}

// ---- attachment guards ----------------------------------------------------------------------------------------------

// Words that say nothing about what a sum is about.
const GENERIC = new Set([
  'introduction', 'intro', 'basics', 'basic', 'explained', 'explain', 'explanation', 'lesson', 'class', 'grade', 'maths', 'math',
  'mathematics', 'problem', 'problems', 'question', 'questions', 'word', 'solve', 'solving', 'solved', 'example', 'examples',
  'video', 'learn', 'learning', 'easy', 'tutorial', 'part', 'chapter', 'total', 'each', 'with', 'from', 'that', 'this', 'what',
  'will', 'after', 'have', 'they', 'their', 'your', 'into', 'about', 'every', 'many', 'much', 'find', 'lab', 'simulation', 'game',
  'kids', 'children', 'concept', 'concepts', 'trick', 'tricks', 'tips', 'full', 'hindi', 'english',
]);
const contentWords = (s: string): string[] =>
  (s.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? []).filter((x) => x.length >= 4 && !GENERIC.has(x));
const same = (a: string, b: string): boolean => a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));

// A simulation or video whose title shares a real word with the sum (an area model under a speed-and-distance sum shares none).
export function fitsSum(title: string, question: string): boolean {
  const asked = contentWords(question);
  return contentWords(title).some((t) => asked.some((q) => same(t, q)));
}

// A video made for another class: a grade, class or year far from the child's, or an exam course above the child's class.
export function gradeFits(title: string, classLevel: number): boolean {
  if (classLevel < 9 && /\b(gcse|igcse|a[\s-]?level|sat|jee|neet|ks[34]|key\s+stage\s+[34])\b/i.test(title)) return false;
  for (const m of title.matchAll(/\b(?:grade|class|year|std|standard)\s*(\d{1,2})\b/gi)) if (Math.abs(Number(m[1]) - classLevel) > 1) return false;
  return true;
}

// ---- order ----------------------------------------------------------------------------------------------------------

// The solution leads an answer that has one: every worked example before the elaboration and anything else (the videos
// keep their own place, last, wherever the caller puts them).
export function solutionFirst<B extends { type: string }>(list: readonly B[]): B[] {
  const solved = list.filter((b) => b.type === 'worked_example');
  if (solved.length === 0 || list[0]?.type === 'worked_example' || !list.some((b) => b.type === 'elaboration')) return [...list];
  return [...solved, ...list.filter((b) => b.type !== 'worked_example')];
}

// ---- the quick replies under a solution ---------------------------------------------------------------------------

export const SOLVE_REPLIES = ['yes', 'differently', 'simpler', 'similar'] as const;
export type SolveReply = (typeof SOLVE_REPLIES)[number];
// The question each button sends into the same chat: the sum itself goes with it (cut to fit a tutor question).
export const SOLVE_PROBLEM_MAX = 300;
export const replyProblem = (problem: string): string => (problem.length > SOLVE_PROBLEM_MAX ? `${problem.slice(0, SOLVE_PROBLEM_MAX - 1).trimEnd()}…` : problem);
