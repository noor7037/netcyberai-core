import { computeRecognition, logitDelta } from '@/lib/recognition';
import { percent } from './grading';
import { markParts, type Mark, type PaperComponent } from './papers';

// Personal Best and Most Improved on a report card (docs/27 row 9c and section 5, C215). Each child is compared only
// with themselves: this file is given one child's own percents and nothing about any other child, so no other
// child's marks can change what it says.
//
//   Personal Best   a subject where the child's percent in this exam beats their own best percent in that subject in
//                   their earlier published exams by the constitution's noise floor. The floor is not copied here:
//                   computeRecognition() in src/lib/recognition.ts (locked) decides it. Each subject is handed to the
//                   engine as one point of this child, keyed by the subject. The engine's reliability guard is met
//                   honestly: a published exam is a whole graded assessment, so the window counts the exams the
//                   comparison rests on (this one and the earlier ones with a percent in that subject: two or more
//                   whenever there is an earlier one), and a percent exists only for marks the child sat (absent and
//                   exempt are not marks), so the child was present for both. Only the engine's personal_best events
//                   are used; its banded tier, which sets children against each other, is never read (C211).
//   Most Improved   the child's own subject with the largest logitDelta() (src/lib/recognition.ts) against their
//                   previous published exam, when that is above zero. It picks among the child's own subjects; ties
//                   go to the subject listed first.
//   A child with no earlier published exam with a percent gets neither line: the card says this is their first.
//
// Percents are compared as the card prints them: rounded as the kept grading scheme says.

export type SubjectPercent = { subjectId: string; percent: number | null };
// One earlier published exam of the child: oldest first, the previous one last.
export type EarlierExam = { examId: string; subjects: SubjectPercent[] };
export type OwnRecognition =
  | { first: true }
  | {
      first: false;
      personalBest: { subjectId: string; now: number; best: number }[];
      mostImproved: { subjectId: string; now: number; before: number; examId: string } | null;
    };

export function ownRecognition(current: readonly SubjectPercent[], earlier: readonly EarlierExam[]): OwnRecognition {
  const sat = earlier.filter((e) => e.subjects.some((s) => s.percent !== null));
  if (!sat.length) return { first: true };
  const earlierOf = (subjectId: string) =>
    sat.map((e) => e.subjects.find((s) => s.subjectId === subjectId)?.percent).filter((p): p is number => typeof p === 'number');

  const points = current.flatMap((c) => {
    if (c.percent === null) return [];
    const before = earlierOf(c.subjectId);
    return before.length ? [{ subjectId: c.subjectId, now: c.percent, best: Math.max(...before), exams: before.length + 1 }] : [];
  });
  const events = computeRecognition({
    fortnightId: 'own-published-exams',
    current: points.map((p) => ({ studentId: p.subjectId, classId: 'own', score: p.now, attendanceInWindow: 1, assessmentCount: p.exams })),
    baseline: points.map((p) => ({ studentId: p.subjectId, classId: 'own', score: p.best, attendanceInWindow: 1, assessmentCount: p.exams })),
  });
  const beaten = new Set(events.filter((e) => e.type === 'personal_best').map((e) => e.studentId));
  const personalBest = points.filter((p) => beaten.has(p.subjectId)).map(({ subjectId, now, best }) => ({ subjectId, now, best }));

  const previous = sat[sat.length - 1];
  let mostImproved: { subjectId: string; now: number; before: number; examId: string; delta: number } | null = null;
  for (const c of current) {
    const before = previous.subjects.find((s) => s.subjectId === c.subjectId)?.percent;
    if (c.percent === null || typeof before !== 'number') continue;
    const delta = logitDelta(before, c.percent);
    if (delta > 0 && (mostImproved === null || delta > mostImproved.delta)) mostImproved = { subjectId: c.subjectId, now: c.percent, before, examId: previous.examId, delta };
  }
  return { first: false, personalBest, mostImproved: mostImproved && { subjectId: mostImproved.subjectId, now: mostImproved.now, before: mostImproved.before, examId: mostImproved.examId } };
}

// A subject's percent in one paper, as the class result has it: none until every component has a mark, absent or
// exempt; absent and exempt left out (percent()).
export function paperPercent(components: readonly PaperComponent[], marks: Readonly<Record<string, Mark | undefined>>): number | null {
  if (!components.every((c) => marks[c.key])) return null;
  return percent(markParts(components, marks));
}
