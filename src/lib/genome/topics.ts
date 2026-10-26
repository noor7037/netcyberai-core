import { ERROR_TYPES, type ErrorType } from '@/lib/contracts/marking';
import { wholePercent } from '@/lib/marking/approved';
import { pointsBetween } from './rules';

// The Learning Genome by topic (docs/35 section 1 step 8, C352): what one child's approved answer-sheet marks say
// about each chapter and topic of the class's syllabus map. No database here: the server reads the child's counted
// answers (src/lib/genome/genome.ts) and these rules do the rest, so the screen shows what the rules found.
//
//   - A COUNTED ANSWER is a question of a paper, with the child's final mark on it (the teacher's when they changed
//     it, else the AI's): only of an approved script, of a paper whose exam is published and in force, and only of
//     the questions that count (internal choice leaves the other questions of a group out: src/lib/marking/rollup.ts).
//   - A TOPIC is a unit of the syllabus map. Its marks are the child's marks over the counted answers whose question
//     names that unit, out of their marks possible. A chapter is its topics together. Every figure carries the
//     answers it is made of (exam, question label, marks), so each can be opened at its paper.
//   - PROGRESS is a chapter across exams, against the child's own previous exam in it, by the same line as a
//     subject's trend (trend_points). Listed in the order of the exams.
//   - A MISTAKE THAT KEEPS COMING BACK is a kind of mistake that cost the child marks in at least the school's line
//     of answers, across at least the school's line of papers (mistake_min_questions, mistake_min_papers).
//   - PRACTISE NEXT is the practice list on the child's latest approved script in each subject.
//   - The child is compared only with themselves (docs/27 section 3 rule 2): never with another child, a class
//     average, a rank or a position. Everything is in syllabus order or in the order of the exams, never by marks.
//   - Rules only: no language model is called, nothing is stored, and nothing here reaches a parent.

export type TopicSettings = { trendPoints: number; mistakeMinQuestions: number; mistakeMinPapers: number };

// One counted answer of the child's approved scripts, with where it comes from. `marks` is the final mark, held
// between 0 and `max`.
export type CountedAnswer = {
  paperId: string;
  examId: string;
  examName: string;
  date: string | null; // the paper's date, or the day the exam was made when the paper has none
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  questionId: string;
  label: string;
  position: number;
  unitId: string | null;
  marks: number;
  max: number;
  errorType: ErrorType | null;
};

// A unit of a class's syllabus map.
export type UnitInfo = { unitId: string; classId: string; subjectId: string; position: number; chapter: string; topic: string };

// An answer as evidence: enough to find it again at its paper.
export type AnswerEvidence = { paperId: string; examId: string; examName: string; date: string | null; label: string; marks: number; max: number };

export type TopicGenome = { unitId: string; topic: string; marks: number; max: number; rounded: number; questions: number; evidence: AnswerEvidence[] };
// A chapter's marks in one paper.
export type ChapterPoint = { paperId: string; examId: string; examName: string; date: string | null; marks: number; max: number; rounded: number; questions: number };
export type ChapterChange = { direction: 'up' | 'down' | 'steady'; points: number; from: ChapterPoint; to: ChapterPoint; line: number };
export type ChapterTopics = {
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  chapter: string;
  marks: number;
  max: number;
  rounded: number;
  questions: number;
  topics: TopicGenome[];
  // The chapter in each paper that has it, oldest first; `change` only with two papers or more.
  points: ChapterPoint[];
  change: ChapterChange | null;
};
export type MistakeGenome = { kind: ErrorType; questions: number; papers: number; evidence: AnswerEvidence[] };
export type PracticeItem = { text: string; chapter: string | null; topic: string | null };
export type PracticeGroup = { subjectId: string; subjectName: string; paperId: string; examId: string; examName: string; date: string | null; className: string; items: PracticeItem[] };

export type GenomeTopics = {
  scripts: number; // approved scripts counted
  answers: number; // counted answers in them
  unlinked: number; // counted answers whose question names no topic: in no chapter above
  chapters: ChapterTopics[];
  mistakes: MistakeGenome[];
  practice: PracticeGroup[];
};

export const EMPTY_TOPICS: GenomeTopics = { scripts: 0, answers: 0, unlinked: 0, chapters: [], mistakes: [], practice: [] };

const round1 = (n: number) => Math.round(n * 10) / 10;
const evidenceOf = (a: CountedAnswer): AnswerEvidence => ({ paperId: a.paperId, examId: a.examId, examName: a.examName, date: a.date, label: a.label, marks: a.marks, max: a.max });

// Chapters and topics from the counted answers, in syllabus order within each subject: the answers are grouped by
// subject, class and chapter, and a chapter by its first unit's place in the map.
export function chaptersOf(answers: readonly CountedAnswer[], units: ReadonlyMap<string, UnitInfo>, s: Pick<TopicSettings, 'trendPoints'>): { chapters: ChapterTopics[]; unlinked: number } {
  type Group = { first: number; chapter: ChapterTopics; byUnit: Map<string, { position: number; topic: TopicGenome }>; byPaper: Map<string, ChapterPoint> };
  const groups = new Map<string, Group>();
  let unlinked = 0;
  for (const a of answers) {
    const unit = a.unitId ? units.get(a.unitId) : undefined;
    if (!unit) {
      unlinked += 1;
      continue;
    }
    const key = `${a.subjectId}|${a.classId}|${unit.chapter}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        first: unit.position,
        chapter: { subjectId: a.subjectId, subjectName: a.subjectName, classId: a.classId, className: a.className, chapter: unit.chapter, marks: 0, max: 0, rounded: 0, questions: 0, topics: [], points: [], change: null },
        byUnit: new Map(),
        byPaper: new Map(),
      };
      groups.set(key, g);
    }
    g.first = Math.min(g.first, unit.position);
    g.chapter.marks += a.marks;
    g.chapter.max += a.max;
    g.chapter.questions += 1;
    let t = g.byUnit.get(unit.unitId);
    if (!t) {
      t = { position: unit.position, topic: { unitId: unit.unitId, topic: unit.topic, marks: 0, max: 0, rounded: 0, questions: 0, evidence: [] } };
      g.byUnit.set(unit.unitId, t);
    }
    t.topic.marks += a.marks;
    t.topic.max += a.max;
    t.topic.questions += 1;
    t.topic.evidence.push(evidenceOf(a));
    const p = g.byPaper.get(a.paperId) ?? { paperId: a.paperId, examId: a.examId, examName: a.examName, date: a.date, marks: 0, max: 0, rounded: 0, questions: 0 };
    p.marks += a.marks;
    p.max += a.max;
    p.questions += 1;
    g.byPaper.set(a.paperId, p);
  }
  const chapters: ChapterTopics[] = [];
  for (const g of [...groups.values()].sort((a, b) => a.chapter.subjectName.localeCompare(b.chapter.subjectName) || a.chapter.subjectId.localeCompare(b.chapter.subjectId) || a.chapter.className.localeCompare(b.chapter.className) || a.chapter.classId.localeCompare(b.chapter.classId) || a.first - b.first || a.chapter.chapter.localeCompare(b.chapter.chapter))) {
    const c = g.chapter;
    c.marks = round1(c.marks);
    c.max = round1(c.max);
    c.rounded = wholePercent(c.marks, c.max);
    c.topics = [...g.byUnit.values()]
      .sort((a, b) => a.position - b.position || a.topic.unitId.localeCompare(b.topic.unitId))
      .map(({ topic }) => ({ ...topic, marks: round1(topic.marks), max: round1(topic.max), rounded: wholePercent(round1(topic.marks), round1(topic.max)) }));
    c.points = [...g.byPaper.values()].map((p) => ({ ...p, marks: round1(p.marks), max: round1(p.max), rounded: wholePercent(round1(p.marks), round1(p.max)) }));
    if (c.points.length >= 2) {
      const [from, to] = c.points.slice(-2);
      const diff = pointsBetween(to.rounded, from.rounded);
      c.change = { direction: Math.abs(diff) < s.trendPoints ? 'steady' : diff > 0 ? 'up' : 'down', points: Math.abs(diff), from, to, line: s.trendPoints };
    }
    chapters.push(c);
  }
  return { chapters, unlinked };
}

// The kinds of mistake that keep coming back: a counted answer that lost marks and was given a kind other than
// "none" counts for its kind. A kind is listed when it reaches both lines. In the order of the kinds in the contract.
export function mistakesOf(answers: readonly CountedAnswer[], s: Pick<TopicSettings, 'mistakeMinQuestions' | 'mistakeMinPapers'>): MistakeGenome[] {
  const out: MistakeGenome[] = [];
  for (const kind of ERROR_TYPES) {
    if (kind === 'none') continue;
    const mine = answers.filter((a) => a.errorType === kind && a.marks < a.max);
    const papers = new Set(mine.map((a) => a.paperId)).size;
    if (mine.length >= s.mistakeMinQuestions && papers >= s.mistakeMinPapers) out.push({ kind, questions: mine.length, papers, evidence: mine.map(evidenceOf) });
  }
  return out;
}

// What to practise next: the practice list on the child's latest approved script in each subject (the scripts are
// given oldest first), with the topic each item names. The same words listed twice are listed once.
export type ScriptPractice = { subjectId: string; subjectName: string; paperId: string; examId: string; examName: string; date: string | null; className: string; practice: { unitId: string | null; text: string }[] };
export function practiceOf(scripts: readonly ScriptPractice[], units: ReadonlyMap<string, UnitInfo>): PracticeGroup[] {
  const latest = new Map<string, ScriptPractice>();
  for (const sc of scripts) if (sc.practice.length) latest.set(sc.subjectId, sc);
  return [...latest.values()]
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName) || a.subjectId.localeCompare(b.subjectId))
    .map((sc) => {
      const seen = new Set<string>();
      const items: PracticeItem[] = [];
      for (const p of sc.practice) {
        if (seen.has(p.text)) continue;
        seen.add(p.text);
        const unit = p.unitId ? units.get(p.unitId) : undefined;
        items.push({ text: p.text, chapter: unit?.chapter ?? null, topic: unit?.topic ?? null });
      }
      return { subjectId: sc.subjectId, subjectName: sc.subjectName, paperId: sc.paperId, examId: sc.examId, examName: sc.examName, date: sc.date, className: sc.className, items };
    });
}
