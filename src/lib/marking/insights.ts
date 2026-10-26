import { ERROR_TYPES, type ErrorType } from '@/lib/contracts/marking';
import type { Sql } from '@/lib/jobs/types';
import { APPROVED_SHEET, scoreSheets, wholePercent } from './approved';
import { markingPaper, markingSettings, paperRoster, type Actor } from './context';
import { markedParts, partTotals, round1 } from './rollup';
import { questionsOf } from './setup';

// A paper's class view (docs/35 section 1 step 8, C352): what the class's approved answer sheets say about one paper,
// question by question and topic by topic, and which children may need support. Worked out when it is read from the
// approved scripts (./approved.ts: the one place that says which scripts and which questions count); nothing is
// stored. Rules only: no language model is called.
//
//   - NO RANK (docs/27 section 3 rule 2, C76): no position, topper or best-to-worst list. The questions are in the
//     paper's order, the topics in the syllabus map's order, and the children in roll order. A child appears only in
//     "may need support", by the school's own line (support_below, Exams settings), and the line is returned with
//     them to be shown where it is used.
//   - WHO READS IT: whoever may open the paper (markingPaper: the office and the coordinator every class, a teacher
//     their own, never the accountant), and every number is read under the reader's own row level security.
//   - CANDIDATES ONLY: the scripts of the paper's candidates (its class's roll, less the children withdrawn from the
//     exam). A script that is not approved, or was changed after it was approved, is counted apart and left out.

export type QuestionInsight = {
  questionId: string;
  label: string;
  component: string;
  maxMarks: number;
  unitId: string | null;
  chapter: string | null;
  topic: string | null;
  counted: number; // approved scripts in which the question counts (internal choice leaves it out of the others)
  attempted: number; // of those, the scripts that attempted it
  average: number | null; // marks over the counted scripts, to one decimal place; null with no script
  mistake: { kind: ErrorType; count: number } | null; // the kind of mistake seen most often (the earlier kind on a tie)
};
export type TopicInsight = { unitId: string | null; chapter: string | null; topic: string | null; marks: number; max: number; rounded: number; answers: number; questions: { questionId: string; label: string }[] };
export type SupportChild = { studentId: string; name: string; rollNo: string | null; marks: number; max: number };

export type PaperInsights = {
  paper: { paperId: string; examId: string; examName: string; className: string; subjectName: string; date: string | null; published: boolean };
  candidates: number;
  scripts: { approved: number; notCounted: number }; // notCounted: not yet approved, or changed after approval
  supportBelow: number; // the school's line, percent
  questions: QuestionInsight[];
  topics: TopicInsight[];
  support: SupportChild[]; // in roll order
};

export async function paperInsights(db: Sql, actor: Actor, paperId: string): Promise<PaperInsights | null> {
  const paper = await markingPaper(db, actor, paperId);
  if (!paper) return null;
  const roster = await paperRoster(db, actor.schoolId, paper);
  const onRoll = new Map(roster.map((c, i) => [c.studentId, { child: c, place: i }]));
  const settings = await markingSettings(db, actor.schoolId);
  const questions = await questionsOf(db, actor.schoolId, paperId);
  const units = new Map(paper.units.map((u) => [u.unitId, u]));

  const approved = (
    await db.query(`select s.sheet_id, s.student_id from marking_sheets s where s.school_id = $1 and s.paper_id = $2 and ${APPROVED_SHEET} and s.student_id is not null`, [actor.schoolId, paperId])
  ).rows.filter((r) => onRoll.has(r.student_id as string));
  const live = Number((await db.query(`select count(*)::int as n from marking_sheets s where s.school_id = $1 and s.paper_id = $2 and s.state <> 'set_aside'`, [actor.schoolId, paperId])).rows[0]?.n ?? 0);
  const scripts = await scoreSheets(db, actor.schoolId, approved.map((r) => ({ sheetId: r.sheet_id as string, paperId, studentId: r.student_id as string })));

  // Question by question. `sums` keeps each question's exact total, for the topics below (an average is rounded).
  const sums = new Map<string, number>();
  const out: QuestionInsight[] = questions.map((q) => {
    const rows = scripts.map((s) => s.questions.find((x) => x.questionId === q.questionId)).filter((x): x is NonNullable<typeof x> => !!x && x.counted);
    const kinds = new Map<ErrorType, number>();
    for (const r of rows) if (r.errorType && r.errorType !== 'none' && r.marks < r.maxMarks) kinds.set(r.errorType, (kinds.get(r.errorType) ?? 0) + 1);
    // The most common kind; on a tie, the one listed first in the contract.
    const top = ERROR_TYPES.map((kind) => ({ kind, count: kinds.get(kind) ?? 0 })).filter((k) => k.count > 0).sort((a, b) => b.count - a.count)[0] ?? null;
    const unit = q.unitId ? units.get(q.unitId) : undefined;
    sums.set(q.questionId, rows.reduce((sum, r) => sum + r.marks, 0));
    return {
      questionId: q.questionId,
      label: q.label,
      component: q.component,
      maxMarks: q.maxMarks,
      unitId: unit ? unit.unitId : null,
      chapter: unit?.chapter ?? null,
      topic: unit?.topic ?? null,
      counted: rows.length,
      attempted: rows.filter((r) => r.attempted !== false && r.errorType !== 'not_attempted').length,
      average: rows.length ? round1(rows.reduce((sum, r) => sum + r.marks, 0) / rows.length) : null,
      mistake: top,
    };
  });

  // Topic by topic, in the syllabus map's order: the class's marks over the counted answers whose question names the
  // unit, out of their marks possible. Questions that name no topic (or one outside the map) are counted together.
  const topics: TopicInsight[] = [];
  const inOrder = [...paper.units.map((u) => u.unitId), null];
  for (const unitId of inOrder) {
    const mine = out.filter((q) => q.unitId === unitId && q.counted > 0);
    if (!mine.length) continue;
    const marks = round1(mine.reduce((sum, q) => sum + (sums.get(q.questionId) ?? 0), 0));
    const max = round1(mine.reduce((sum, q) => sum + q.maxMarks * q.counted, 0));
    const unit = unitId ? units.get(unitId) : undefined;
    topics.push({ unitId, chapter: unit?.chapter ?? null, topic: unit?.topic ?? null, marks, max, rounded: wholePercent(marks, max), answers: mine.reduce((sum, q) => sum + q.counted, 0), questions: mine.map((q) => ({ questionId: q.questionId, label: q.label })) });
  }

  // The children who may need support: the approved total below the school's line, in roll order. Compared on the
  // marks themselves (never on a rounded percent): below 40 in every 100 is marks x 100 < 40 x maximum.
  const parts = markedParts(paper.components, questions);
  const support: SupportChild[] = [];
  for (const s of scripts) {
    const final = new Map(s.questions.map((q) => [q.questionId, q.marks]));
    const totals = partTotals(parts, questions, final, s.choiceCounts);
    const marks = round1(totals.reduce((sum, t) => sum + t.score, 0));
    const max = round1(totals.reduce((sum, t) => sum + t.max, 0));
    if (max > 0 && marks * 100 < settings.supportBelow * max) {
      const on = onRoll.get(s.studentId)!;
      support.push({ studentId: s.studentId, name: on.child.name, rollNo: on.child.rollNo, marks, max });
    }
  }
  support.sort((a, b) => onRoll.get(a.studentId)!.place - onRoll.get(b.studentId)!.place);

  return {
    paper: { paperId: paper.paperId, examId: paper.examId, examName: paper.examName, className: paper.className, subjectName: paper.subjectName, date: paper.date, published: paper.published },
    candidates: roster.length,
    scripts: { approved: scripts.length, notCounted: Math.max(0, live - scripts.length) },
    supportBelow: settings.supportBelow,
    questions: out,
    topics,
    support,
  };
}
