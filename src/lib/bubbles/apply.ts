import type { BubbleReading, ErrorType, MarkingQuestion, OptionKey, PaperSitting, SheetFlag } from '@/lib/contracts/marking';
import type { Sql } from '@/lib/jobs/types';
import { marksByRule } from '@/lib/marking/answers';
import { markingSettings } from '@/lib/marking/context';
import { questionsOf } from '@/lib/marking/setup';
import { onBubbleSheet } from './layout';

// A read bubble sheet's answers onto a script by rules (C364): each choice question's mark from the key and the paper's
// wrong marks (marksByRule), in the AI's columns of marking_marks, which a person's approval later rolls up. Nothing is
// guessed: a question with an unclear bubble, or two marks where one answer is right, gets no mark and flags the script
// for a person. Used in a person's session (an upload, a change of wrong marks) and in the school's marking job (an
// answer-book script marked after its child's sheet was read), so it reads and writes only through the session's own
// row rules and calls no model.

export type RuleOutcome = { questionId: string; attempted: boolean; marks: number | null; confidence: number; errorType: ErrorType | null; flagged: boolean };

// One sheet's rule marks for the paper's sheet questions. A choice question whose correct answer names more than one
// option takes several filled bubbles as its answer; any other with two or more is not marked. With no correct answer
// given, the question is left for the teacher to mark (no mark, not flagged by the sheet).
export function ruleMarks(questions: readonly MarkingQuestion[], reading: Pick<BubbleReading, 'answers' | 'unclear' | 'confidence'>, wrongMarks: number): RuleOutcome[] {
  return questions.filter(onBubbleSheet).map((q) => {
    const keys = (reading.answers[q.label] ?? []) as OptionKey[];
    const manyRight = !!q.correct && 'keys' in q.correct && q.correct.keys.length > 1;
    if (reading.unclear.includes(q.label) || (keys.length >= 2 && !manyRight)) {
      return { questionId: q.questionId, attempted: true, marks: null, confidence: 0, errorType: null, flagged: true };
    }
    const rule = marksByRule(q, keys.length ? { keys } : null, wrongMarks);
    if (!rule) return { questionId: q.questionId, attempted: keys.length > 0, marks: null, confidence: reading.confidence, errorType: keys.length ? null : 'not_attempted', flagged: false };
    // The kind of mistake: none for a right answer, not attempted for a blank; a wrong choice says nothing about why.
    const errorType: ErrorType | null = !rule.attempted ? 'not_attempted' : rule.right ? 'none' : null;
    return { questionId: q.questionId, attempted: rule.attempted, marks: rule.marks, confidence: reading.confidence, errorType, flagged: false };
  });
}

export async function paperSitting(db: Sql, schoolId: string, paperId: string): Promise<PaperSitting | null> {
  return ((await db.query(`select sitting from exam_papers where school_id = $1 and paper_id = $2`, [schoolId, paperId])).rows[0]?.sitting ?? null) as PaperSitting | null;
}
export async function wrongMarksOf(db: Sql, schoolId: string, paperId: string): Promise<number> {
  return Number((await db.query(`select wrong_marks from marking_setups where school_id = $1 and paper_id = $2`, [schoolId, paperId])).rows[0]?.wrong_marks ?? 0);
}

type ReadRow = { read_id: string; answers: Record<string, OptionKey[]>; unclear: string[]; multiple: string[]; confidence: unknown };
export const readingOf = (r: ReadRow): Pick<BubbleReading, 'answers' | 'unclear' | 'confidence'> => ({ answers: r.answers ?? {}, unclear: r.unclear ?? [], confidence: Number(r.confidence) });

export type Applied = { applied: boolean; flagged: boolean; changed: boolean };

// The read's rule marks written onto the script, and the read linked to it. `changed`: a question's mark as it stands
// (the teacher's when they gave one, else this) is not what it was.
export async function applyRead(db: Sql, schoolId: string, paperId: string, readId: string, sheetId: string): Promise<Applied> {
  const read = (await db.query(`select read_id, answers, unclear, multiple, confidence from bubble_reads where school_id = $1 and read_id = $2 and paper_id = $3`, [schoolId, readId, paperId])).rows[0] as ReadRow | undefined;
  if (!read) return { applied: false, flagged: false, changed: false };
  const questions = await questionsOf(db, schoolId, paperId);
  const outcomes = ruleMarks(questions, readingOf(read), await wrongMarksOf(db, schoolId, paperId));
  const before = new Map(
    (await db.query(`select question_id, ai_marks, marks from marking_marks where school_id = $1 and sheet_id = $2`, [schoolId, sheetId])).rows.map((m) => [
      m.question_id as string,
      { ai: m.ai_marks === null ? null : Number(m.ai_marks), teacher: m.marks === null ? null : Number(m.marks) },
    ])
  );
  let changed = false;
  for (const o of outcomes) {
    const was = before.get(o.questionId);
    if (!was || (was.teacher === null && was.ai !== o.marks)) changed = true;
    await db.query(
      `insert into marking_marks (school_id, sheet_id, paper_id, question_id, attempted, ai_marks, ai_steps, ai_note, ai_reason, error_type, confidence, page_id, y_from, y_to)
       values ($1, $2, $3, $4, $5, $6, '[]'::jsonb, null, null, $7, $8, null, null, null)
       on conflict (school_id, sheet_id, question_id) do update set attempted = excluded.attempted, ai_marks = excluded.ai_marks, ai_steps = excluded.ai_steps,
         ai_note = null, ai_reason = null, error_type = excluded.error_type, confidence = excluded.confidence, page_id = null, y_from = null, y_to = null`,
      [schoolId, sheetId, paperId, o.questionId, o.attempted, o.marks, o.errorType, o.confidence]
    );
  }
  await db.query(`update bubble_reads set sheet_id = $3 where school_id = $1 and read_id = $2 and sheet_id is distinct from $3`, [schoolId, readId, sheetId]);
  return { applied: true, flagged: outcomes.some((o) => o.flagged), changed };
}

// The script's own flags made true again after rule marks changed: 'not_all_read' while a question has no mark,
// 'unsure' while a question is less sure than the school's line (or, on an answer-book script, as the AI's marking left
// it), 'changed' when an approved script's marks moved. The other flags (who it is, its pages) are a person's and stay.
export async function refreshFlags(db: Sql, schoolId: string, sheetId: string, opts: { changed?: boolean } = {}): Promise<SheetFlag[] | null> {
  const s = (await db.query(`select paper_id, state, flags, source from marking_sheets where school_id = $1 and sheet_id = $2`, [schoolId, sheetId])).rows[0];
  if (!s) return null;
  const questions = await questionsOf(db, schoolId, s.paper_id as string);
  const rows = new Map(
    (await db.query(`select question_id, ai_marks, marks, confidence from marking_marks where school_id = $1 and sheet_id = $2`, [schoolId, sheetId])).rows.map((m) => [m.question_id as string, m])
  );
  const line = (await markingSettings(db, schoolId)).reviewBelow;
  const final = (id: string) => {
    const m = rows.get(id);
    return m ? (m.marks ?? m.ai_marks) : null;
  };
  const notAll = questions.some((q) => final(q.questionId) === null || final(q.questionId) === undefined);
  const unsureNow = questions.some((q) => {
    const c = rows.get(q.questionId)?.confidence;
    return c !== null && c !== undefined && Number(c) < line;
  });
  const had = (s.flags ?? []) as SheetFlag[];
  // An answer-book script's 'unsure' may be the AI's own (a total nearly full): it stays until approval.
  const unsure = unsureNow || (s.source === 'scan' && had.includes('unsure'));
  const flags: SheetFlag[] = [
    ...had.filter((f) => f !== 'not_all_read' && f !== 'unsure' && f !== 'changed'),
    ...(notAll ? (['not_all_read'] as const) : []),
    ...(unsure ? (['unsure'] as const) : []),
    ...((had.includes('changed') || (opts.changed && s.state === 'approved')) ? (['changed'] as const) : []),
  ];
  await db.query(`update marking_sheets set flags = $3 where school_id = $1 and sheet_id = $2 and flags is distinct from $3::text[]`, [schoolId, sheetId, flags]);
  return flags;
}

// An answer-book script of a paper sat with a bubble sheet, as the marking job keeps the AI's marks (C364): its child's
// live read, if one is in, fills the sheet questions by rules. Nothing else is written here; the caller sets the flags.
export async function applyChildRead(db: Sql, schoolId: string, sheetId: string): Promise<Applied> {
  const s = (await db.query(`select paper_id, student_id from marking_sheets where school_id = $1 and sheet_id = $2`, [schoolId, sheetId])).rows[0];
  if (!s?.student_id) return { applied: false, flagged: false, changed: false };
  const read = (
    await db.query(`select read_id from bubble_reads where school_id = $1 and paper_id = $2 and student_id = $3 and state = 'live'`, [schoolId, s.paper_id, s.student_id])
  ).rows[0];
  if (!read) return { applied: false, flagged: false, changed: false };
  return applyRead(db, schoolId, s.paper_id as string, read.read_id as string, sheetId);
}
