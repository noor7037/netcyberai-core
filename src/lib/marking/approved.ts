import type { ErrorType } from '@/lib/contracts/marking';
import { percent, roundPercent } from '@/lib/exams/grading';
import type { Sql } from '@/lib/jobs/types';
import { countedQuestions, markedParts, partTotals, round1 } from './rollup';

// Approved question marks, read for learning intelligence (docs/35 section 1 step 8, C352): the Learning Genome by
// topic and a paper's class view both stand on this one reading, so they never disagree about what a script scored.
//
//   - WHICH SCRIPTS COUNT (APPROVED_SHEET): a person approved it, and it has not been changed since. An approved
//     script the teacher changed waits to be approved again (flag `changed`); the paper's marks stay as approved
//     until then, and its question marks no longer match them, so it is left out until it is approved again.
//   - A QUESTION'S MARK is the teacher's when they changed it, else the AI's (one rule, as the review screen and the
//     roll-up use it). A question with neither counts as nothing.
//   - WHICH QUESTIONS COUNT: internal choice, by countedQuestions (./rollup.ts), the same code approval uses.
//   - Every read is under the reader's own row level security, in their own tenant transaction: a teacher reads the
//     scripts of their own classes' papers, the office every class, and no one else reads any.
// Reads only; no language model is called.

// As SQL on marking_sheets s.
export const APPROVED_SHEET = `s.state = 'approved' and not ('changed' = any (s.flags))`;

// A question's final mark: the teacher's when changed, else the AI's, else none.
export const finalMark = (row: { marks: unknown; ai_marks: unknown }): number | null =>
  row.marks !== null && row.marks !== undefined ? Number(row.marks) : row.ai_marks !== null && row.ai_marks !== undefined ? Number(row.ai_marks) : null;

// Marks over marks possible as a whole percent, by percent() and roundPercent() (docs/27 section 3 rule 3): the one
// way a topic's figure is turned into a percent, for a child's topic and a class's. Held between 0 and the maximum.
export const wholePercent = (marks: number, max: number): number => roundPercent(percent([{ score: Math.min(max, Math.max(0, marks)), max }]) ?? 0, 0);

export type SheetRef = { sheetId: string; paperId: string; studentId: string };

export type ScoredQuestion = {
  questionId: string;
  label: string;
  position: number;
  component: string;
  choiceGroup: string | null;
  unitId: string | null;
  maxMarks: number;
  attempted: boolean | null;
  marks: number; // the final mark, between 0 and maxMarks (a question with none counts as nothing)
  errorType: ErrorType | null;
  counted: boolean; // false: left out by internal choice
};

export type ScoredScript = SheetRef & {
  questions: ScoredQuestion[]; // in the paper's order
  choiceCounts: Record<string, number>; // the paper's internal choice counts, for partTotals
};

type QuestionRow = { questionId: string; paperId: string; label: string; position: number; component: string; maxMarks: number; choiceGroup: string | null; unitId: string | null };

// The questions, choice counts and marks of the given scripts, and what each question scored and whether it counts.
// A script of a paper with no questions comes back with none.
export async function scoreSheets(db: Sql, schoolId: string, sheets: readonly SheetRef[]): Promise<ScoredScript[]> {
  if (!sheets.length) return [];
  const paperIds = [...new Set(sheets.map((s) => s.paperId))];
  const sheetIds = sheets.map((s) => s.sheetId);
  const questionRows = (
    await db.query(
      `select question_id, paper_id, label, position, component, max_marks, choice_group, unit_id
         from marking_questions where school_id = $1 and paper_id = any ($2::uuid[]) order by paper_id, position, question_id`,
      [schoolId, paperIds]
    )
  ).rows;
  const questionsByPaper = new Map<string, QuestionRow[]>();
  for (const r of questionRows) {
    const q: QuestionRow = { questionId: r.question_id, paperId: r.paper_id, label: r.label, position: Number(r.position), component: r.component, maxMarks: Number(r.max_marks), choiceGroup: r.choice_group ?? null, unitId: r.unit_id ?? null };
    questionsByPaper.set(q.paperId, [...(questionsByPaper.get(q.paperId) ?? []), q]);
  }
  const counts = new Map<string, Record<string, number>>(
    (await db.query(`select paper_id, choice_counts from marking_setups where school_id = $1 and paper_id = any ($2::uuid[])`, [schoolId, paperIds])).rows.map((r) => [r.paper_id as string, (r.choice_counts ?? {}) as Record<string, number>])
  );
  const markRows = (
    await db.query(`select sheet_id, question_id, attempted, ai_marks, marks, error_type from marking_marks where school_id = $1 and sheet_id = any ($2::uuid[])`, [schoolId, sheetIds])
  ).rows;
  const marksBySheet = new Map<string, typeof markRows>();
  for (const m of markRows) marksBySheet.set(m.sheet_id, [...(marksBySheet.get(m.sheet_id) ?? []), m]);

  return sheets.map((sheet) => {
    const questions = questionsByPaper.get(sheet.paperId) ?? [];
    const rows = new Map((marksBySheet.get(sheet.sheetId) ?? []).map((m) => [m.question_id as string, m]));
    const final = new Map<string, number | null>(questions.map((q) => [q.questionId, rows.has(q.questionId) ? finalMark(rows.get(q.questionId)!) : null]));
    const counted = countedQuestions(questions, final, counts.get(sheet.paperId) ?? {});
    return {
      ...sheet,
      choiceCounts: counts.get(sheet.paperId) ?? {},
      questions: questions.map((q) => {
        const row = rows.get(q.questionId);
        return {
          questionId: q.questionId,
          label: q.label,
          position: q.position,
          component: q.component,
          choiceGroup: q.choiceGroup,
          unitId: q.unitId,
          maxMarks: q.maxMarks,
          attempted: row ? (row.attempted ?? null) : null,
          marks: round1(Math.min(q.maxMarks, Math.max(0, final.get(q.questionId) ?? 0))),
          errorType: (row?.error_type ?? null) as ErrorType | null,
          counted: counted.has(q.questionId),
        };
      }),
    };
  });
}

// What marks entry offers from the paper's AI marking (W14-D): each child's approved script as a score for every part the
// script marks (the same parts, rules and rounding approval saves), and how many marked scripts still wait for a person.
// Null when the paper has no script. Reads under the caller's own row level security.
export type EntryAiMarks = { approved: { studentId: string; scores: Record<string, number> }[]; waiting: number };

export async function aiMarksForEntry(db: Sql, schoolId: string, paperId: string, components: readonly { key: string; max: number }[]): Promise<EntryAiMarks | null> {
  const rows = (
    await db.query(`select sheet_id, student_id, state, flags from marking_sheets s where s.school_id = $1 and s.paper_id = $2 and s.state <> 'set_aside'`, [schoolId, paperId])
  ).rows;
  if (!rows.length) return null;
  const changed = (r: { flags: unknown }) => ((r.flags ?? []) as string[]).includes('changed');
  const waiting = rows.filter((r) => r.state === 'marked' || (r.state === 'approved' && changed(r))).length;
  const done = rows.filter((r) => r.state === 'approved' && !changed(r) && r.student_id);
  const scored = await scoreSheets(db, schoolId, done.map((r) => ({ sheetId: r.sheet_id as string, paperId, studentId: r.student_id as string })));
  const approved = scored.map((sc) => {
    const marks = new Map<string, number | null>(sc.questions.map((q) => [q.questionId, q.marks]));
    const parts = markedParts(components, sc.questions);
    return { studentId: sc.studentId, scores: Object.fromEntries(partTotals(parts, sc.questions, marks, sc.choiceCounts).map((t) => [t.component, t.score])) };
  });
  return { approved: approved.filter((a) => Object.keys(a.scores).length > 0), waiting };
}
