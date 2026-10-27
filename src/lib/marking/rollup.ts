import type { MarkingQuestion, StructureProblem } from '@/lib/contracts/marking';

// From question marks to a paper's marks (C347): one rule, used by approval, the review screen, the family's view and
// the report link, so they never disagree.
//   - A question's mark is the teacher's when they changed it, else the AI's.
//   - Internal choice: of a group's questions, the best `count` count (choiceCounts), the rest are left out.
//   - A part's score is the sum of its counted questions, to one decimal place, never above the part's maximum and
//     never below 0 (a wrong choice answer may take marks off its question when the school says so, C361).
// Rules only: nothing here calls a model.

type Q = Pick<MarkingQuestion, 'questionId' | 'component' | 'maxMarks' | 'choiceGroup'>;
type Part = { key: string; name?: string; max: number };

export const round1 = (n: number) => Math.round(n * 10) / 10;

// The questions that count, given each one's mark (a missing mark counts as nothing for choosing).
export function countedQuestions(questions: readonly Q[], marks: ReadonlyMap<string, number | null>, choiceCounts: Readonly<Record<string, number>>): Set<string> {
  const counted = new Set<string>();
  const groups = new Map<string, Q[]>();
  for (const q of questions) {
    if (!q.choiceGroup) counted.add(q.questionId);
    else groups.set(q.choiceGroup, [...(groups.get(q.choiceGroup) ?? []), q]);
  }
  for (const [group, qs] of groups) {
    const take = Math.max(0, Math.min(qs.length, Math.floor(choiceCounts[group] ?? qs.length)));
    // Best marks first; on a tie, the question listed first.
    const order = qs.map((q, i) => ({ q, i, m: marks.get(q.questionId) ?? 0 })).sort((a, b) => b.m - a.m || a.i - b.i);
    for (const x of order.slice(0, take)) counted.add(x.q.questionId);
  }
  return counted;
}

// Each part's score and maximum. `marks`: each question's final mark (null or missing: none).
export function partTotals(parts: readonly Part[], questions: readonly Q[], marks: ReadonlyMap<string, number | null>, choiceCounts: Readonly<Record<string, number>>): { component: string; score: number; max: number }[] {
  const counted = countedQuestions(questions, marks, choiceCounts);
  return parts.map((p) => {
    let sum = 0;
    for (const q of questions) if (q.component === p.key && counted.has(q.questionId)) sum += marks.get(q.questionId) ?? 0;
    return { component: p.key, score: Math.max(0, Math.min(round1(sum), p.max)), max: p.max };
  });
}

// The most a group can give: its `count` largest maxima.
function groupMax(qs: readonly Q[], count: number): number {
  return [...qs].map((q) => q.maxMarks).sort((a, b) => b - a).slice(0, count).reduce((s, m) => s + m, 0);
}

// The parts the script marks: those with at least one question. A part with none (an internal assessment, a
// practical) is not on the script: its marks are typed as before, and approval leaves them as they are.
export function markedParts<P extends Part>(parts: readonly P[], questions: readonly Q[]): P[] {
  return parts.filter((p) => questions.some((q) => q.component === p.key));
}

// Whether the questions make up the paper: every marked part's counted marks equal its maximum, every group counts
// within one part and has a count no larger than its questions. Marking starts only with no problem.
export function structureProblems(parts: readonly Part[], questions: readonly Q[], choiceCounts: Readonly<Record<string, number>>): StructureProblem[] {
  if (questions.length === 0) return [{ kind: 'no_questions' }];
  parts = markedParts(parts, questions);
  const problems: StructureProblem[] = [];
  const groups = new Map<string, Q[]>();
  for (const q of questions) if (q.choiceGroup) groups.set(q.choiceGroup, [...(groups.get(q.choiceGroup) ?? []), q]);
  for (const [group, qs] of groups) {
    const count = choiceCounts[group];
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > qs.length) problems.push({ kind: 'group_count', group });
    if (new Set(qs.map((q) => q.component)).size > 1) problems.push({ kind: 'group_parts', group });
  }
  for (const part of parts) {
    let counted = 0;
    for (const q of questions) if (q.component === part.key && !q.choiceGroup) counted += q.maxMarks;
    for (const [group, qs] of groups) {
      if (qs[0].component !== part.key) continue;
      const count = choiceCounts[group];
      counted += groupMax(qs, typeof count === 'number' && count >= 1 ? Math.min(Math.floor(count), qs.length) : qs.length);
    }
    counted = round1(counted);
    if (counted !== part.max) problems.push({ kind: 'part_total', component: part.key, counted, max: part.max });
  }
  return problems;
}
