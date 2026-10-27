import type { SchoolRole } from '@/lib/contracts/modules';
import type { Mark, PaperComponent } from '@/lib/exams/papers';
import type { Shown } from '@/lib/exams/results';
import type { GenomeTopics } from './topics';

// Learning Genome v1 (docs/27 row 9e, C217): what one child's genome is made of, and the rules that find their
// strengths and gaps. No database here: the server works the numbers out (src/lib/genome/genome.ts) and the screen
// reads these same types, so the words a screen says are about the numbers the server found.
//
//   - Computed when it is read. Nothing is stored.
//   - THE CHILD IS COMPARED ONLY WITH THEMSELVES (docs/27 section 3 rule 2): a subject against their own previous
//     exam in it, and against their own overall in the same exam; a chapter by their own parents' replies; homework
//     by their own homework. Never with another child, a class average, a rank or a position.
//   - Every line a rule uses is a setting of the module (src/lib/frameworks/settings-schemas.ts, 'learning-genome'),
//     and every finding carries the line it was held against, so the screen shows it where it is used.
//   - Rules only: no language model is called. Nothing here reaches a parent.

// Who opens it: the office, the academic coordinator, and a teacher for the children of their own classes (the
// database's own rule). Not the accountant: fees are never a learning signal and an accountant reads no mark.
export const GENOME_READERS: readonly SchoolRole[] = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];

// The school's lines, with the defaults of the settings schema.
export type GenomeSettings = {
  trendPoints: number; // a subject rose or fell by at least this many points against the child's own previous exam
  spreadPoints: number; // a subject is at least this many points above or below the child's own overall in that exam
  needsHelpReplies: number; // a chapter with at least this many "needs help" replies is a gap
  understoodReplies: number; // a chapter with at least this many "understood" replies and none "needs help" is a strength
  homeworkDoneBelow: number; // homework in a subject done on fewer than this many of every 100 checked is a gap...
  homeworkMinChecked: number; // ...once at least this many were checked
  windowDays: number; // homework and replies are counted over this many days back, today included
  mistakeMinQuestions: number; // a kind of mistake that cost marks in at least this many answers...
  mistakeMinPapers: number; // ...across at least this many papers keeps coming back (C352)
};
export const DEFAULT_GENOME_SETTINGS: GenomeSettings = { trendPoints: 10, spreadPoints: 10, needsHelpReplies: 2, understoodReplies: 3, homeworkDoneBelow: 60, homeworkMinChecked: 5, windowDays: 90, mistakeMinQuestions: 3, mistakeMinPapers: 2 };

// One exam in one subject: the child's marks in the paper, and the percent and grade worked out from them by
// percent() and grade() (src/lib/exams), as the class result shows them. A paper on which the child has a part with
// nothing entered has no percent ("not entered"); absent and exempt are not marks and are left out.
export type ExamPoint = {
  paperId: string;
  examId: string;
  examName: string;
  term: string | null;
  // The exam's type (in both languages, as the school names it) and its session's label: what kind of exam this was,
  // and when. Labels only (C230-AJ part 2); set when the genome is read.
  kind?: { key: string; en: string; hi: string };
  session?: string | null;
  date: string | null; // the paper's date, or null when it has none
  className: string;
  components: PaperComponent[];
  marks: Record<string, Mark>;
  shown: Shown;
};
// The homework checked for the child in a subject, due within the days looked back.
export type HomeworkCount = { done: number; checked: number; firstDue: string | null; lastDue: string | null };
export type SubjectGenome = { subjectId: string; subjectName: string; exams: ExamPoint[]; homework: HomeworkCount };
// One chapter of a class's syllabus map: the parents' replies about this child to the Daily Pulse of its taught units.
export type ChapterGenome = {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  chapter: string;
  needsHelp: number;
  understood: number;
  lessons: number; // the taught units' lessons ("taught today" rows) the replies answer
  firstTaught: string;
  lastTaught: string;
};
// The child's own overall in one exam: percent() over all their marks in its papers that are complete.
export type ExamOverall = { examId: string; examName: string; shown: Shown; subjects: number };

export type Finding =
  | { rule: 'rising' | 'falling'; subjectId: string; subjectName: string; before: { examName: string; rounded: number }; after: { examName: string; rounded: number }; points: number; line: number }
  | { rule: 'above_own' | 'below_own'; subjectId: string; subjectName: string; examName: string; rounded: number; overall: number; points: number; line: number }
  | { rule: 'understood' | 'needs_help'; subjectId: string; subjectName: string; chapter: string; className: string; count: number; line: number }
  | { rule: 'homework'; subjectId: string; subjectName: string; done: number; checked: number; line: number; min: number };
export type FindingRule = Finding['rule'];
export const STRENGTH_RULES: readonly FindingRule[] = ['rising', 'above_own', 'understood'];
export const GAP_RULES: readonly FindingRule[] = ['falling', 'below_own', 'needs_help', 'homework'];

export type Genome = {
  child: { studentId: string; name: string; rollNo: string | null; classId: string | null; className: string | null };
  today: string;
  window: { from: string; to: string };
  settings: GenomeSettings;
  scheme: { version: number } | null;
  subjects: SubjectGenome[];
  chapters: ChapterGenome[];
  latestOverall: ExamOverall | null;
  strengths: Finding[];
  gaps: Finding[];
  // From the child's approved answer-sheet marks (C352): topics and chapters, mistakes that keep coming back, progress
  // by chapter and what to practise. Empty until a script is approved and its exam published.
  topics: GenomeTopics;
};

// A difference of two shown percents, to one decimal place, so 66.1 - 54.2 is 11.9 and never 11.900000000000006.
export const pointsBetween = (after: number, before: number) => Math.round((after - before) * 10) / 10;

// A subject's own trend: their latest exam with a percent against their previous one with a percent.
export function trendFinding(subject: Pick<SubjectGenome, 'subjectId' | 'subjectName' | 'exams'>, s: Pick<GenomeSettings, 'trendPoints'>): Finding | null {
  const withPercent = subject.exams.filter((e) => e.shown.rounded !== null);
  if (withPercent.length < 2) return null;
  const [before, after] = withPercent.slice(-2);
  const points = pointsBetween(after.shown.rounded as number, before.shown.rounded as number);
  if (Math.abs(points) < s.trendPoints) return null;
  return {
    rule: points > 0 ? 'rising' : 'falling',
    subjectId: subject.subjectId,
    subjectName: subject.subjectName,
    before: { examName: before.examName, rounded: before.shown.rounded as number },
    after: { examName: after.examName, rounded: after.shown.rounded as number },
    points: Math.abs(points),
    line: s.trendPoints,
  };
}

// Each subject of the child's latest exam against their own overall in that exam. Only with two subjects or more:
// one subject is its own overall.
export function spreadFindings(subjects: readonly Pick<SubjectGenome, 'subjectId' | 'subjectName' | 'exams'>[], overall: ExamOverall | null, s: Pick<GenomeSettings, 'spreadPoints'>): Finding[] {
  if (!overall || overall.subjects < 2 || overall.shown.rounded === null) return [];
  const out: Finding[] = [];
  for (const subject of subjects) {
    const point = subject.exams.find((e) => e.examId === overall.examId && e.shown.rounded !== null);
    if (!point) continue;
    const points = pointsBetween(point.shown.rounded as number, overall.shown.rounded);
    if (Math.abs(points) < s.spreadPoints) continue;
    out.push({ rule: points > 0 ? 'above_own' : 'below_own', subjectId: subject.subjectId, subjectName: subject.subjectName, examName: overall.examName, rounded: point.shown.rounded as number, overall: overall.shown.rounded, points: Math.abs(points), line: s.spreadPoints });
  }
  return out;
}

// A chapter is a gap when its "needs help" replies reach the line; a strength when its "understood" replies reach
// theirs and no reply said "needs help".
export function chapterFindings(chapters: readonly ChapterGenome[], s: Pick<GenomeSettings, 'needsHelpReplies' | 'understoodReplies'>): Finding[] {
  const out: Finding[] = [];
  for (const c of chapters) {
    const base = { subjectId: c.subjectId, subjectName: c.subjectName, chapter: c.chapter, className: c.className };
    if (c.needsHelp >= s.needsHelpReplies) out.push({ rule: 'needs_help', ...base, count: c.needsHelp, line: s.needsHelpReplies });
    else if (c.needsHelp === 0 && c.understood >= s.understoodReplies) out.push({ rule: 'understood', ...base, count: c.understood, line: s.understoodReplies });
  }
  return out;
}

// Homework in a subject is a gap when, of at least the minimum checked, fewer than the line in every 100 were done.
// Compared on the counts themselves, never on a rounded rate.
export function homeworkFinding(subject: Pick<SubjectGenome, 'subjectId' | 'subjectName' | 'homework'>, s: Pick<GenomeSettings, 'homeworkDoneBelow' | 'homeworkMinChecked'>): Finding | null {
  const { done, checked } = subject.homework;
  if (checked < s.homeworkMinChecked || checked === 0) return null;
  if (done * 100 >= s.homeworkDoneBelow * checked) return null;
  return { rule: 'homework', subjectId: subject.subjectId, subjectName: subject.subjectName, done, checked, line: s.homeworkDoneBelow, min: s.homeworkMinChecked };
}

// Every finding, split into strengths and gaps, in the order of the subjects (by name) and then of the rules.
export function findings(subjects: readonly SubjectGenome[], chapters: readonly ChapterGenome[], overall: ExamOverall | null, s: GenomeSettings): { strengths: Finding[]; gaps: Finding[] } {
  const all: Finding[] = [];
  for (const subject of subjects) {
    const trend = trendFinding(subject, s);
    if (trend) all.push(trend);
    all.push(...spreadFindings([subject], overall, s));
    const homework = homeworkFinding(subject, s);
    if (homework) all.push(homework);
  }
  all.push(...chapterFindings(chapters, s));
  const order = (f: Finding) => [...STRENGTH_RULES, ...GAP_RULES].indexOf(f.rule);
  const byName = (a: Finding, b: Finding) => a.subjectName.localeCompare(b.subjectName) || a.subjectId.localeCompare(b.subjectId) || order(a) - order(b);
  return { strengths: all.filter((f) => STRENGTH_RULES.includes(f.rule)).sort(byName), gaps: all.filter((f) => GAP_RULES.includes(f.rule)).sort(byName) };
}
