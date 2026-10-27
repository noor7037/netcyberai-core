import { writeAuditLog } from '@/lib/audit/log';
import type { CorrectAnswer, MarkingStep, QuestionKind, QuestionOption } from '@/lib/contracts/marking';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import type { Actor } from '@/lib/marking/context';
import { nextLabel } from '@/lib/marking/question-form';
import { structureProblems } from '@/lib/marking/rollup';
import { questionsOf, readSetup } from '@/lib/marking/setup';
import type { SetupScreen } from '@/lib/contracts/marking';
import { aiWritingOn, examTypeOf, latestGeneration, makeRefusal, paperContext, planFor, printRefusal, running } from './context';
import type { BankList, BankQuestion, MakeScreen, PrintData, PrintRefusal } from './types';

// The paper maker's screen, keeping a paper, printing it, and the question bank (docs/36 §1.1, C362, C363), each in
// the caller's own tenant transaction: row level security and keep_paper() (the migration ending _aq_2_papers.sql)
// hold the same rules as here. A paper is the teacher's once they keep it; an AI-written question never prints unkept.

// ---- the screen ----------------------------------------------------------------------------------------------------------

export async function makeScreen(db: Sql, actor: Actor, paperId: string, opts: { sections?: unknown; chapterMarks?: unknown } = {}): Promise<MakeScreen | null> {
  const ctx = await paperContext(db, actor, paperId);
  if (!ctx) return null;
  const generation = await latestGeneration(db, actor.schoolId, paperId);
  const questions = Number((await db.query(`select count(*)::int as n from marking_questions where school_id = $1 and paper_id = $2`, [actor.schoolId, paperId])).rows[0]?.n ?? 0);
  const { blueprint, issues, plan } = await planFor(db, actor.schoolId, ctx, opts);
  const refusal = await makeRefusal(db, actor.schoolId, ctx.paper, { again: true, generation, questions });
  const why = refusal ?? (!blueprint ? 'no_blueprint' : issues.length ? 'blueprint' : plan && plan.problems.length ? 'plan' : null);
  const print = await printRefusal(db, actor.schoolId, paperId, generation);
  return {
    paperId,
    examType: await examTypeOf(db, actor.schoolId, ctx.examType),
    blueprint,
    blueprintIssues: issues,
    plan,
    generation,
    questions,
    mayMake: why === null,
    why,
    kept: print.kept,
    printable: print.why === null,
    printWhy: print.why,
    ai: await aiWritingOn(db),
  };
}

// ---- keeping ----------------------------------------------------------------------------------------------------------------

export type KeepRefusal = 'not_found' | 'not_allowed' | 'closed' | 'busy' | 'empty' | 'structure';
export type KeepResult = { ok: true; banked: number } | { ok: false; reason: KeepRefusal };

// "Keep the paper": the questions make up the paper (every part adds up) and each has its words; nothing is being made.
export async function keepPaper(db: Sql, actor: Actor, paperId: string): Promise<KeepResult> {
  const setup = await readSetup(db, actor, paperId);
  if (!setup) return { ok: false, reason: 'not_found' };
  if (setup.paper.published) return { ok: false, reason: 'closed' };
  if (!setup.paper.mayMark) return { ok: false, reason: 'not_allowed' };
  if (running(await latestGeneration(db, actor.schoolId, paperId))) return { ok: false, reason: 'busy' };
  if (!setup.questions.length || setup.questions.some((q) => !q.prompt.trim())) return { ok: false, reason: 'empty' };
  if (structureProblems(setup.paper.components, setup.questions, setup.setup.choiceCounts).length) return { ok: false, reason: 'structure' };
  await db.query('savepoint keep_paper');
  let banked = 0;
  try {
    banked = Number((await db.query(`select public.keep_paper($1) as n`, [paperId])).rows[0]?.n ?? 0);
    await db.query('release savepoint keep_paper');
  } catch (err) {
    await db.query('rollback to savepoint keep_paper');
    const code = (err as { code?: string }).code;
    if (code === '42501') return { ok: false, reason: 'not_allowed' };
    if (code === '23514') return { ok: false, reason: 'empty' };
    throw err;
  }
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'marking.paper_kept', targetType: 'exam_papers', targetId: paperId, afterState: { questions: setup.questions.length, banked } });
  return { ok: true, banked };
}

// ---- printing ---------------------------------------------------------------------------------------------------------------

export async function printData(db: Sql, actor: Actor, paperId: string): Promise<{ ok: true; data: PrintData } | { ok: false; reason: 'not_found' | PrintRefusal }> {
  const setup = await readSetup(db, actor, paperId);
  if (!setup) return { ok: false, reason: 'not_found' };
  const state = await printRefusal(db, actor.schoolId, paperId, await latestGeneration(db, actor.schoolId, paperId));
  if (state.why) return { ok: false, reason: state.why };
  const r = (
    await db.query(
      `select s.name as school_name,
              (select g.blueprint ->> 'minutes' from paper_generations g where g.school_id = $1 and g.paper_id = $2 and g.state = 'done' and g.kind <> 'question' order by g.created_at desc limit 1) as minutes
         from schools s where s.school_id = $1`,
      [actor.schoolId, paperId]
    )
  ).rows[0];
  const ctx = await paperContext(db, actor, paperId);
  let minutes = r?.minutes ? Number(r.minutes) : null;
  if (minutes === null && ctx) minutes = (await planFor(db, actor.schoolId, ctx)).blueprint?.minutes ?? null;
  const marked = new Set(setup.questions.map((q) => q.component));
  return {
    ok: true,
    data: {
      schoolName: (r?.school_name as string | undefined) ?? '',
      examName: setup.paper.examName,
      className: setup.paper.className,
      subjectName: setup.paper.subjectName,
      date: setup.paper.date,
      minutes: Number.isFinite(minutes) ? minutes : null,
      maxMarks: setup.paper.components.filter((c) => marked.has(c.key)).reduce((n, c) => n + c.max, 0),
      language: setup.setup.language,
      choiceCounts: setup.setup.choiceCounts,
      questions: setup.questions.map((q) => ({ label: q.label, section: q.section, choiceGroup: q.choiceGroup, maxMarks: q.maxMarks, kind: q.kind, prompt: q.prompt, options: q.options, correct: q.correct, answerKey: q.answerKey, steps: q.steps })),
    },
  };
}

// ---- the bank ---------------------------------------------------------------------------------------------------------------

export type BankRefusal = 'not_found' | 'not_allowed' | 'closed' | 'locked' | 'busy' | 'twice' | 'too_many' | 'gone';

const bankQuestion = (r: Record<string, unknown>): BankQuestion => ({
  bankId: r.bank_id as string,
  chapter: r.chapter as string,
  topic: r.topic as string,
  kind: r.kind as QuestionKind,
  maxMarks: Number(r.max_marks),
  prompt: r.prompt as string,
  options: (r.options ?? []) as QuestionOption[],
  correct: (r.correct ?? null) as CorrectAnswer | null,
  answerKey: r.answer_key as string,
  steps: ((r.steps ?? []) as MarkingStep[]).map((s) => ({ step: s.step, marks: Number(s.marks) })),
  difficulty: (r.difficulty ?? null) as BankQuestion['difficulty'],
  source: r.source as BankQuestion['source'],
  usedCount: Number(r.used_count),
});

// The kept bank questions a paper may use: its class's grade and subject, in its language, by chapter (and kind and
// marks when asked); never one already on it. One the class had in its last two papers of the subject is left out, and
// counted (`skipped`), so the teacher sees why.
export async function bankFor(db: Sql, actor: Actor, paperId: string, filter: { chapter?: string | null; kind?: string | null; marks?: number | null; ids?: readonly string[] }): Promise<BankList | null> {
  const ctx = await paperContext(db, actor, paperId);
  if (!ctx) return null;
  const chapters = [...new Set(ctx.paper.units.map((u) => u.chapter.trim()))];
  const { rows } = await db.query(
    `with recent as (
       select distinct q.bank_id from marking_questions q
        where q.school_id = $1 and q.bank_id is not null
          and q.paper_id in (select p.paper_id from exam_papers p
                              where p.school_id = $1 and p.class_id = $5 and p.subject_id = $2 and p.paper_id <> $6
                                and exists (select 1 from marking_questions x where x.school_id = p.school_id and x.paper_id = p.paper_id)
                              order by p.paper_date desc nulls last, p.created_at desc limit 2))
     select b.*, (b.bank_id in (select bank_id from recent)) as recent
       from question_bank b
      where b.school_id = $1 and b.subject_id = $2 and b.grade = $3 and b.language = $4 and b.state = 'kept'
        and not exists (select 1 from marking_questions q where q.school_id = b.school_id and q.paper_id = $6 and q.bank_id = b.bank_id)
        and ($7::text is null or b.chapter = $7) and ($8::text is null or b.kind = $8) and ($9::numeric is null or b.max_marks = $9)
        and ($10::uuid[] is null or b.bank_id = any($10::uuid[]))
      order by b.chapter, b.topic, b.used_count, b.created_at, b.bank_id
      limit 200`,
    [actor.schoolId, ctx.paper.subjectId, ctx.grade, ctx.language, ctx.paper.classId, paperId, filter.chapter ?? null, filter.kind ?? null, filter.marks ?? null, filter.ids ? [...filter.ids] : null]
  );
  return { questions: rows.filter((r) => !r.recent).map(bankQuestion), skipped: rows.filter((r) => r.recent).length, chapters };
}

// Checks shared by replacing a question and picking questions: the paper may be changed by hand now.
async function mayChangeByHand(db: Sql, actor: Actor, paperId: string): Promise<BankRefusal | null> {
  const ctx = await paperContext(db, actor, paperId);
  if (!ctx) return 'not_found';
  const refusal = await makeRefusal(db, actor.schoolId, ctx.paper, { again: true, generation: await latestGeneration(db, actor.schoolId, paperId), questions: 0 });
  return refusal === 'not_allowed' || refusal === 'closed' || refusal === 'locked' || refusal === 'busy' ? refusal : null;
}

async function usableBank(db: Sql, actor: Actor, paperId: string, bankIds: readonly string[]) {
  const list = await bankFor(db, actor, paperId, { ids: bankIds });
  const byId = new Map((list?.questions ?? []).map((q) => [q.bankId, q]));
  return bankIds.map((id) => byId.get(id) ?? null);
}

// The unit of the paper's class map for a bank question: its chapter and topic, else the chapter's first topic.
function unitFor(units: readonly { unitId: string; chapter: string; topic: string }[], q: Pick<BankQuestion, 'chapter' | 'topic'>): string | null {
  return (units.find((u) => u.chapter.trim() === q.chapter && u.topic.trim() === q.topic) ?? units.find((u) => u.chapter.trim() === q.chapter))?.unitId ?? null;
}

// "Replace" with a bank question: the paper's question keeps its number, part, marks, group and section, and takes the
// bank question's words, options, answer and steps.
export async function replaceFromBank(db: Sql, actor: Actor, questionId: string, bankId: string): Promise<{ ok: true; screen: SetupScreen } | { ok: false; reason: BankRefusal }> {
  if (!isUuid(questionId) || !isUuid(bankId)) return { ok: false, reason: 'not_found' };
  const q = (await db.query(`select paper_id, max_marks, kind from marking_questions where school_id = $1 and question_id = $2`, [actor.schoolId, questionId])).rows[0];
  if (!q) return { ok: false, reason: 'not_found' };
  const paperId = q.paper_id as string;
  const refusal = await mayChangeByHand(db, actor, paperId);
  if (refusal) return { ok: false, reason: refusal };
  const [b] = await usableBank(db, actor, paperId, [bankId]);
  if (!b || b.maxMarks !== Number(q.max_marks)) return { ok: false, reason: 'gone' };
  const ctx = await paperContext(db, actor, paperId);
  await db.query(
    `update marking_questions set kind = $3, prompt = $4, options = $5, correct = $6, answer_key = $7, steps = $8, difficulty = $9, unit_id = coalesce($10, unit_id), bank_id = $11
      where school_id = $1 and question_id = $2`,
    [actor.schoolId, questionId, b.kind, b.prompt, JSON.stringify(b.options), b.correct ? JSON.stringify(b.correct) : null, b.answerKey, JSON.stringify(b.steps), b.difficulty, unitFor(ctx?.paper.units ?? [], b), b.bankId]
  );
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'marking.question_from_bank', targetType: 'exam_papers', targetId: paperId, afterState: { questionId, bankId } });
  const screen = await readSetup(db, actor, paperId);
  return screen ? { ok: true, screen } : { ok: false, reason: 'not_found' };
}

// "Pick from the bank": the chosen bank questions added at the end of the paper, numbered on, counting to the paper's
// first part that has questions (else its first part). The teacher then fits the marks, as for any question added.
export async function pickIntoPaper(db: Sql, actor: Actor, paperId: string, bankIds: unknown): Promise<{ ok: true; screen: SetupScreen } | { ok: false; reason: BankRefusal }> {
  if (!Array.isArray(bankIds) || !bankIds.length || !bankIds.every(isUuid)) return { ok: false, reason: 'not_found' };
  if (bankIds.length > 50) return { ok: false, reason: 'too_many' };
  if (new Set(bankIds).size !== bankIds.length) return { ok: false, reason: 'twice' };
  const refusal = await mayChangeByHand(db, actor, paperId);
  if (refusal) return { ok: false, reason: refusal };
  const picked = await usableBank(db, actor, paperId, bankIds as string[]);
  if (picked.some((b) => !b)) return { ok: false, reason: 'gone' };
  const ctx = await paperContext(db, actor, paperId);
  const existing = await questionsOf(db, actor.schoolId, paperId);
  if (existing.length + picked.length > 200) return { ok: false, reason: 'too_many' };
  const part = existing[0]?.component ?? ctx?.paper.components[0]?.key;
  if (!part || !ctx) return { ok: false, reason: 'not_found' };
  const labels = existing.map((q) => q.label);
  let position = existing.reduce((m, q) => Math.max(m, q.position), 0);
  for (const b of picked as BankQuestion[]) {
    let label = nextLabel(labels);
    while (labels.some((l) => l.toLowerCase() === label.toLowerCase())) label = nextLabel([...labels, label]);
    labels.push(label);
    position += 1;
    await db.query(
      `insert into marking_questions (school_id, paper_id, label, component, max_marks, unit_id, kind, prompt, answer_key, steps, position, options, correct, difficulty, bank_id, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [actor.schoolId, paperId, label, part, b.maxMarks, unitFor(ctx.paper.units, b), b.kind, b.prompt, b.answerKey, JSON.stringify(b.steps), position, JSON.stringify(b.options), b.correct ? JSON.stringify(b.correct) : null, b.difficulty, b.bankId, actor.userId]
    );
  }
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'marking.questions_from_bank', targetType: 'exam_papers', targetId: paperId, afterState: { added: picked.length } });
  const screen = await readSetup(db, actor, paperId);
  return screen ? { ok: true, screen } : { ok: false, reason: 'not_found' };
}
