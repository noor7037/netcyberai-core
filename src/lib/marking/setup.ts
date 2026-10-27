import { writeAuditLog } from '@/lib/audit/log';
import { DIFFICULTIES, MARKING_LANGUAGES, MAX_QUESTIONS, QUESTION_KINDS, SECTION_PATTERN, type CorrectAnswer, type Difficulty, type MarkingLanguage, type MarkingQuestion, type MarkingSetup, type OptionKey, type QuestionKind, type QuestionOption, type SetupScreen } from '@/lib/contracts/marking';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { cleanCorrect, cleanOptions, cleanWrongMarks } from './answers';
import { markingPaper, type Actor } from './context';
import { structureProblems } from './rollup';

// A paper's questions for AI marking (C347): written once by whoever may enter the paper's marks, before its scripts
// are marked. Saving sends the whole list; the server checks it, then keeps each question by its number (so a
// question's marks already given stay with it), adds the new ones and takes away the ones no longer listed. The
// database holds the same rules (marking_questions_rules): a question's part is one of the paper's parts, its topic a
// unit of the paper's class and subject, its steps give at most its marks, and once a script is approved what a total
// is made of is fixed. A choice question's options and the correct answer a bubble sheet or online test is marked by
// (docs/36, C361) are checked by the same rules as the editor's (answers.ts), and are fixed with the rest.

export const LABEL_RE = /^[0-9A-Za-z][0-9A-Za-z().-]{0,11}$/;
export const GROUP_RE = /^[A-Z]{1,2}$/;
const PROMPT_MAX = 4000;
const KEY_MAX = 8000;
const GUIDANCE_MAX = 2000;
const STEP_MAX = 300;
const STEPS_MAX = 12;

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const oneDecimal = (n: number) => Math.round(n * 10) === n * 10;

export async function readSetup(db: Sql, actor: Actor, paperId: string): Promise<SetupScreen | null> {
  const paper = await markingPaper(db, actor, paperId);
  if (!paper) return null;
  const row = (await db.query(`select language, guidance, choice_counts, wrong_marks from marking_setups where school_id = $1 and paper_id = $2`, [actor.schoolId, paperId])).rows[0];
  const setup: MarkingSetup = row
    ? { language: row.language as MarkingLanguage, guidance: row.guidance as string, choiceCounts: (row.choice_counts ?? {}) as Record<string, number>, wrongMarks: Number(row.wrong_marks ?? 0) }
    : { language: 'en', guidance: '', choiceCounts: {}, wrongMarks: 0 };
  const questions = await questionsOf(db, actor.schoolId, paperId);
  const locked = (await db.query(`select 1 from marking_sheets where school_id = $1 and paper_id = $2 and state = 'approved' limit 1`, [actor.schoolId, paperId])).rows.length > 0;
  return { paper, setup, questions, problems: structureProblems(paper.components, questions, setup.choiceCounts), locked };
}

export async function questionsOf(db: Sql, schoolId: string, paperId: string): Promise<MarkingQuestion[]> {
  const { rows } = await db.query(
    `select question_id, position, label, component, max_marks, choice_group, unit_id, kind, prompt, answer_key, steps, options, correct, difficulty, section
       from marking_questions where school_id = $1 and paper_id = $2 order by position, question_id`,
    [schoolId, paperId]
  );
  return rows.map((r) => ({
    questionId: r.question_id,
    position: Number(r.position),
    label: r.label,
    component: r.component,
    maxMarks: Number(r.max_marks),
    choiceGroup: r.choice_group ?? null,
    unitId: r.unit_id ?? null,
    kind: r.kind as QuestionKind,
    prompt: r.prompt,
    answerKey: r.answer_key,
    steps: ((r.steps ?? []) as { step: string; marks: number }[]).map((s) => ({ step: s.step, marks: Number(s.marks) })),
    options: (r.options ?? []) as QuestionOption[],
    correct: correctOf(r.correct),
    difficulty: (r.difficulty ?? null) as Difficulty | null,
    section: r.section ?? null,
  }));
}

// A number's tolerance is kept only when it was given; the app always has one (0 when none).
function correctOf(raw: unknown): CorrectAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as { keys?: unknown; value?: unknown; tolerance?: unknown };
  if (Array.isArray(c.keys)) return { keys: c.keys as OptionKey[] };
  if (typeof c.value === 'number') return { value: c.value, tolerance: typeof c.tolerance === 'number' ? c.tolerance : 0 };
  return null;
}

export type SetupProblem = 'not_allowed' | 'not_found' | 'closed' | 'locked' | 'setup' | 'question' | 'too_many' | 'twice';
export type SaveSetupResult = { ok: true; screen: SetupScreen } | { ok: false; reason: SetupProblem; at?: number; field?: string };

type CleanQuestion = Omit<MarkingQuestion, 'questionId' | 'position'>;

// Checks one question as sent; the field that is wrong, or the question made clean.
export function checkQuestion(raw: unknown, parts: readonly string[], units: ReadonlySet<string>): { ok: true; q: CleanQuestion } | { ok: false; field: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, field: 'question' };
  const q = raw as Record<string, unknown>;
  const label = typeof q.label === 'string' ? q.label.trim() : '';
  if (!LABEL_RE.test(label)) return { ok: false, field: 'label' };
  if (typeof q.component !== 'string' || !parts.includes(q.component)) return { ok: false, field: 'component' };
  if (!isNum(q.maxMarks) || q.maxMarks <= 0 || q.maxMarks > 100 || !oneDecimal(q.maxMarks)) return { ok: false, field: 'maxMarks' };
  const group = q.choiceGroup === null || q.choiceGroup === undefined || q.choiceGroup === '' ? null : typeof q.choiceGroup === 'string' ? q.choiceGroup.trim().toUpperCase() : 0;
  if (group !== null && (typeof group !== 'string' || !GROUP_RE.test(group))) return { ok: false, field: 'choiceGroup' };
  const unit = q.unitId === null || q.unitId === undefined || q.unitId === '' ? null : q.unitId;
  if (unit !== null && (typeof unit !== 'string' || !isUuid(unit) || !units.has(unit))) return { ok: false, field: 'unitId' };
  const kind = q.kind ?? 'short';
  if (!(QUESTION_KINDS as readonly unknown[]).includes(kind)) return { ok: false, field: 'kind' };
  const prompt = typeof q.prompt === 'string' ? q.prompt.trim() : q.prompt === undefined || q.prompt === null ? '' : null;
  if (prompt === null || prompt.length > PROMPT_MAX) return { ok: false, field: 'prompt' };
  const answerKey = typeof q.answerKey === 'string' ? q.answerKey.trim() : q.answerKey === undefined || q.answerKey === null ? '' : null;
  if (answerKey === null || answerKey.length > KEY_MAX) return { ok: false, field: 'answerKey' };
  const rawSteps = q.steps ?? [];
  if (!Array.isArray(rawSteps) || rawSteps.length > STEPS_MAX) return { ok: false, field: 'steps' };
  const steps: { step: string; marks: number }[] = [];
  for (const s of rawSteps) {
    const step = typeof s?.step === 'string' ? s.step.trim() : '';
    if (!step || step.length > STEP_MAX || !isNum(s?.marks) || s.marks <= 0 || !oneDecimal(s.marks)) return { ok: false, field: 'steps' };
    steps.push({ step, marks: s.marks });
  }
  if (steps.reduce((n, s) => n + s.marks, 0) > (q.maxMarks as number) + 1e-9) return { ok: false, field: 'steps' };
  const options = cleanOptions(q.options, kind as QuestionKind);
  if (!options.ok) return { ok: false, field: 'options' };
  const correct = cleanCorrect(q.correct, kind as QuestionKind, options.options);
  if (!correct.ok) return { ok: false, field: 'correct' };
  const difficulty = q.difficulty === undefined || q.difficulty === null ? null : q.difficulty;
  if (difficulty !== null && !(DIFFICULTIES as readonly unknown[]).includes(difficulty)) return { ok: false, field: 'difficulty' };
  const section = q.section === undefined || q.section === null || q.section === '' ? null : typeof q.section === 'string' ? q.section.trim().toUpperCase() : 0;
  if (section !== null && (typeof section !== 'string' || !SECTION_PATTERN.test(section))) return { ok: false, field: 'section' };
  return {
    ok: true,
    q: { label, component: q.component, maxMarks: q.maxMarks as number, choiceGroup: group as string | null, unitId: unit as string | null, kind: kind as QuestionKind, prompt, answerKey, steps, options: options.options, correct: correct.correct, difficulty: difficulty as Difficulty | null, section: section as string | null },
  };
}

export async function saveSetup(db: Sql, actor: Actor, paperId: string, raw: unknown): Promise<SaveSetupResult> {
  const paper = await markingPaper(db, actor, paperId);
  if (!paper) return { ok: false, reason: 'not_found' };
  if (paper.published) return { ok: false, reason: 'closed' };
  if (!paper.mayMark) return { ok: false, reason: 'not_allowed' };
  const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const s = (typeof body.setup === 'object' && body.setup !== null ? body.setup : {}) as Record<string, unknown>;
  const language = s.language ?? 'en';
  const guidance = typeof s.guidance === 'string' ? s.guidance.trim() : s.guidance === undefined ? '' : null;
  const counts = s.choiceCounts ?? {};
  // Not sent (a screen that does not show it): the saved wrong marks stay.
  const wrongMarks = s.wrongMarks === undefined ? undefined : cleanWrongMarks(s.wrongMarks);
  if (!(MARKING_LANGUAGES as readonly unknown[]).includes(language) || guidance === null || guidance.length > GUIDANCE_MAX || wrongMarks === null) return { ok: false, reason: 'setup' };
  if (typeof counts !== 'object' || counts === null || Array.isArray(counts)) return { ok: false, reason: 'setup' };
  const choiceCounts: Record<string, number> = {};
  for (const [g, n] of Object.entries(counts as Record<string, unknown>)) {
    if (!GROUP_RE.test(g) || !isNum(n) || !Number.isInteger(n) || n < 1 || n > MAX_QUESTIONS) return { ok: false, reason: 'setup', field: g };
    choiceCounts[g] = n;
  }
  const list = body.questions;
  if (!Array.isArray(list)) return { ok: false, reason: 'question' };
  if (list.length > MAX_QUESTIONS) return { ok: false, reason: 'too_many' };
  const parts = paper.components.map((c) => c.key);
  const units = new Set(paper.units.map((u) => u.unitId));
  const clean: CleanQuestion[] = [];
  const labels = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const checked = checkQuestion(list[i], parts, units);
    if (!checked.ok) return { ok: false, reason: 'question', at: i, field: checked.field };
    const key = checked.q.label.toLowerCase();
    if (labels.has(key)) return { ok: false, reason: 'twice', at: i };
    labels.add(key);
    clean.push(checked.q);
  }
  // Only the groups the questions use are kept.
  for (const g of Object.keys(choiceCounts)) if (!clean.some((q) => q.choiceGroup === g)) delete choiceCounts[g];

  const before = await questionsOf(db, actor.schoolId, paperId);
  const byLabel = new Map(before.map((q) => [q.label.toLowerCase(), q]));
  const locked = (await db.query(`select 1 from marking_sheets where school_id = $1 and paper_id = $2 and state = 'approved' limit 1`, [actor.schoolId, paperId])).rows.length > 0;
  if (locked) {
    // Once a script is approved, only the words may change: the same numbers, parts, marks, groups, order, options
    // and correct answers (rule marks were given by them).
    const same =
      before.length === clean.length &&
      clean.every((q, i) => {
        const b = before[i];
        return (
          b && b.label === q.label && b.component === q.component && b.maxMarks === q.maxMarks && b.choiceGroup === q.choiceGroup &&
          b.options.length === q.options.length && JSON.stringify(b.correct) === JSON.stringify(q.correct)
        );
      });
    if (!same) return { ok: false, reason: 'locked' };
  }

  await db.query('savepoint marking_setup');
  try {
    await db.query(
      `insert into marking_setups (school_id, paper_id, language, guidance, choice_counts, wrong_marks, updated_by) values ($1, $2, $3, $4, $5, coalesce($6::numeric, 0), $7)
       on conflict (school_id, paper_id) do update set language = excluded.language, guidance = excluded.guidance, choice_counts = excluded.choice_counts,
         wrong_marks = coalesce($6::numeric, marking_setups.wrong_marks), updated_by = excluded.updated_by, updated_at = now()`,
      [actor.schoolId, paperId, language, guidance, JSON.stringify(choiceCounts), wrongMarks ?? null, actor.userId]
    );
    const keep = new Set(clean.map((q) => q.label.toLowerCase()));
    const gone = before.filter((q) => !keep.has(q.label.toLowerCase())).map((q) => q.questionId);
    if (gone.length) await db.query(`delete from marking_questions where school_id = $1 and question_id = any ($2::uuid[])`, [actor.schoolId, gone]);
    // Positions are unique on a paper only at the end of the transaction (deferred), so questions may change places.
    for (let i = 0; i < clean.length; i++) {
      const q = clean[i];
      const old = byLabel.get(q.label.toLowerCase());
      const values = [q.label, q.component, q.maxMarks, q.choiceGroup, q.unitId, q.kind, q.prompt, q.answerKey, JSON.stringify(q.steps), i + 1, JSON.stringify(q.options), q.correct ? JSON.stringify(q.correct) : null, q.difficulty, q.section];
      if (old) {
        await db.query(
          `update marking_questions set label = $3, component = $4, max_marks = $5, choice_group = $6, unit_id = $7, kind = $8, prompt = $9, answer_key = $10, steps = $11, position = $12,
                  options = $13, correct = $14, difficulty = $15, section = $16, updated_by = $17
            where school_id = $1 and question_id = $2`,
          [actor.schoolId, old.questionId, ...values, actor.userId]
        );
      } else {
        await db.query(
          `insert into marking_questions (school_id, paper_id, label, component, max_marks, choice_group, unit_id, kind, prompt, answer_key, steps, position, options, correct, difficulty, section, updated_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [actor.schoolId, paperId, ...values, actor.userId]
        );
      }
    }
    await db.query('set constraints marking_questions_school_id_paper_id_position_key immediate');
    await db.query('release savepoint marking_setup');
  } catch (err) {
    await db.query('rollback to savepoint marking_setup');
    const code = (err as { code?: string }).code;
    if (code === '42501') return { ok: false, reason: 'not_allowed' };
    if (code === '23514' || code === '23505' || code === '23503') return { ok: false, reason: 'question' };
    throw err;
  }
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'marking.questions_saved',
    targetType: 'exam_papers',
    targetId: paperId,
    afterState: { questions: clean.length, removed: before.length - clean.filter((q) => byLabel.has(q.label.toLowerCase())).length },
  });
  const screen = await readSetup(db, actor, paperId);
  return screen ? { ok: true, screen } : { ok: false, reason: 'not_found' };
}
