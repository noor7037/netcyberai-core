import type { SchoolCheckedPaper, SchoolMarkedQuestion, SchoolMistake } from '@/lib/contracts/school-link';
import { markedParts, partTotals, countedQuestions, round1 } from './rollup';

// A checked paper as a family reads it (C351): the child's own approved script of a published paper, question by
// question, its parts' totals by the one roll-up (rollup.ts, internal choice counted), the teacher's words and the
// pages. One builder for School Link (the linked family, read as the guardian) and the private report link (read
// through marking_report*), so the two never disagree. Rules only: nothing here calls a model, and nothing ranks or
// compares one child with another.

export type ViewPart = { key: string; name: string; max: number };
export type ViewQuestion = {
  questionId: string;
  label: string;
  prompt: string | null;
  component: string;
  maxMarks: number;
  choiceGroup: string | null;
  chapter: string | null;
  topic: string | null;
  // The script's mark for it: final (the teacher's when changed, else the AI's), the note for the child likewise.
  marks: number | null;
  note: string | null;
  errorType: string | null;
  pageId: string | null;
  yFrom: number | null;
  yTo: number | null;
};
export type ViewInput = {
  paperId: string;
  exam: string;
  term: string | null;
  subject: string;
  publishedOn: string;
  parts: readonly ViewPart[];
  choiceCounts: Readonly<Record<string, number>>;
  questions: readonly ViewQuestion[];
  strengths: string | null;
  improve: string | null;
  practice: readonly { text: string; chapter: string | null; topic: string | null }[];
  pages: readonly { pageId: string; width: number; height: number }[];
};

const MISTAKES: readonly SchoolMistake[] = ['none', 'concept', 'calculation', 'incomplete', 'presentation', 'language', 'misread', 'not_attempted'];
const mistakeOf = (v: string | null): SchoolMistake | null => (v && (MISTAKES as readonly string[]).includes(v) ? (v as SchoolMistake) : null);

export function checkedPaper(v: ViewInput): SchoolCheckedPaper {
  const finals = new Map(v.questions.map((q) => [q.questionId, q.marks]));
  const counted = countedQuestions(v.questions, finals, v.choiceCounts);
  const pageIds = new Set(v.pages.map((p) => p.pageId));
  const parts = markedParts(v.parts, v.questions);
  const questions: SchoolMarkedQuestion[] = v.questions.map((q) => ({
    label: q.label,
    question: q.prompt && q.prompt.trim() ? q.prompt : null,
    marks: q.marks,
    max: q.maxMarks,
    counted: counted.has(q.questionId),
    note: q.note && q.note.trim() ? q.note : null,
    mistake: mistakeOf(q.errorType),
    chapter: q.chapter,
    topic: q.topic,
    // A place on a page of this script only: a mark is never drawn on a page the family is not shown.
    place: q.pageId && pageIds.has(q.pageId) && q.yFrom !== null && q.yTo !== null ? { pageId: q.pageId, yFrom: q.yFrom, yTo: q.yTo } : null,
  }));
  return {
    paperId: v.paperId,
    exam: v.exam,
    term: v.term,
    subject: v.subject,
    publishedOn: v.publishedOn,
    parts: partTotals(parts, v.questions, finals, v.choiceCounts).map((t) => ({ ...t, name: parts.find((p) => p.key === t.component)?.name ?? t.component })),
    questions,
    strengths: v.strengths && v.strengths.trim() ? v.strengths : null,
    improve: v.improve && v.improve.trim() ? v.improve : null,
    practice: v.practice.filter((p) => p.text.trim()),
    pages: v.pages.map((p) => ({ pageId: p.pageId, width: p.width, height: p.height })),
  };
}

type Q = Pick<ViewQuestion, 'questionId' | 'component' | 'maxMarks' | 'choiceGroup' | 'marks'>;
const MAX_TRIES = 4096;

// The internal-choice counts a paper's questions imply, for a reader who cannot read the paper's setup row (a guardian's
// session reads no setup: it also holds the teacher's guidance to the AI). Marking starts only when every marked part's
// counted marks equal its maximum (structureProblems), so for each part the counts of its groups are the ones that make
// it add up; with one group in a part that answer is unique. When two choices both add up, the one that gives the
// part's published score is taken; if still more than one, the first, in the questions' order.
export function impliedChoiceCounts(parts: readonly ViewPart[], questions: readonly Q[], published: Readonly<Record<string, number | null>> = {}): Record<string, number> {
  const counts: Record<string, number> = {};
  const finals = new Map(questions.map((q) => [q.questionId, q.marks]));
  for (const part of markedParts(parts, questions)) {
    const own = questions.filter((q) => q.component === part.key);
    const groups = [...new Set(own.filter((q) => q.choiceGroup).map((q) => q.choiceGroup as string))];
    if (!groups.length) continue;
    const fixed = round1(own.filter((q) => !q.choiceGroup).reduce((s, q) => s + q.maxMarks, 0));
    const sizes = groups.map((g) => own.filter((q) => q.choiceGroup === g).length);
    const tops = groups.map((g) => {
      const m = own.filter((q) => q.choiceGroup === g).map((q) => q.maxMarks).sort((a, b) => b - a);
      return m.map((_, i) => round1(m.slice(0, i + 1).reduce((s, x) => s + x, 0)));
    });
    // Past this many choices the counts are not guessed at all (every question counts, the part capped at its maximum):
    // a guess from a part of the choices could be wrong. No real paper comes near it.
    if (sizes.reduce((p, n) => p * n, 1) > MAX_TRIES) continue;
    const matches: number[][] = [];
    const combo = sizes.map(() => 1);
    for (let tries = 0; tries < MAX_TRIES; tries++) {
      if (round1(fixed + combo.reduce((s, c, i) => s + tops[i][c - 1], 0)) === part.max) matches.push([...combo]);
      let i = 0;
      while (i < combo.length && combo[i] === sizes[i]) combo[i++] = 1;
      if (i === combo.length) break;
      combo[i] += 1;
    }
    if (!matches.length) continue;
    const score = published[part.key];
    const agree = typeof score === 'number'
      ? matches.filter((m) => {
          const c = Object.fromEntries(groups.map((g, i) => [g, m[i]]));
          return partTotals([part], own, finals, c)[0].score === score;
        })
      : [];
    const chosen = (agree.length ? agree : matches)[0];
    groups.forEach((g, i) => (counts[g] = chosen[i]));
  }
  return counts;
}
