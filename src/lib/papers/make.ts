import { activePromptVersion, prepareText, type PreparedText, type SentText } from '@/lib/ai/platform';
import { writeQuestionsPrompt } from '@/lib/ai/prompts/exams.write_questions';
import { writeAuditLog } from '@/lib/audit/log';
import type { CorrectAnswer, Difficulty, MarkingStep, QuestionKind, QuestionOption } from '@/lib/contracts/marking';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { LONG_JOB_MAX_MS } from '@/lib/jobs/runner';
import { PermanentJobError, type ClaimedJob, type JobHandler, type JobQueue, type Sql } from '@/lib/jobs/types';
import type { Actor } from '@/lib/marking/context';
import { MARKING_SESSION, type AsMarkingSchool } from '@/lib/marking/pipeline';
import { indiaDate } from '@/lib/time/india';
import { pickFromBank, type BankCandidate } from './bank-pick';
import { aiWritingOn, closeStale, latestGeneration, makeRefusal, paperContext, planFor, type PaperContext } from './context';
import { parseWritten, type SlotAsk, type WrittenQuestion } from './parse';
import type { PaperPlan, PlanSlot } from './scope';
import type { GenerationView, MakeRefusal } from './types';

// Making a paper's questions (docs/36 §1.1, C362, C363): one long job a paper (papers.make, C353), in the school's own
// session as its office sees it, with no person (the 'marking.pipeline' school job, src/lib/auth/db.ts), so the row
// rules hold as for the office and the database refuses any mark written from here.
//
//   asked   A person who may mark the paper asks (the paper's screen, or "Make every paper" on the exam). The plan is
//           made then, by rules (./scope.ts), and kept with the making as it was: the job fills that plan, never another.
//   job     1. In one transaction: the making taken; the paper checked again (not published, no approved script, and
//              for a first making no questions yet); the school's kept bank questions for each slot (./bank-pick.ts,
//              never one of the class's last two papers of the subject); and the AI's requests for the other slots,
//              through the AI platform's checks (the task switched on in Control, its provider usable).
//           2. The AI writes, with no connection held, a few slots a request, side by side.
//           3. A question the answer does not give properly is dropped (./parse.ts) and asked for once more, while the
//              job has time for a second round. One still missing is left empty for the teacher: never guessed.
//           4. In the last transaction: the metering; the AI's questions kept in the bank as drafts in the name of the
//              person who asked; the paper's questions written in slot order (a "Make again" replaces the ones there,
//              and its unkept drafts are removed); the paper's internal choices; the paper no longer kept.
//
// Nothing in a request names a child, a teacher or the school: the class level, the subject, the language, the
// chapters and topics, the kinds, marks and difficulty, and the paper's other questions to avoid. Each job ends within
// the runner's long-job bound (src/lib/jobs/runner.ts): at most two rounds of the profile's time (90 s) and four short
// transactions.

export const PAPERS_MAKE_JOB = 'papers.make';
export const makeKey = (generationId: string) => `${PAPERS_MAKE_JOB}:${generationId}`;
// Tries of one making's job: a try whose every request failed is tried again later; the last one keeps what it has.
export const MAKE_ATTEMPTS = 3;
// Slots a request: a short answer, so one failure costs little and the requests go side by side.
export const SLOTS_PER_REQUEST = 8;
const PROFILE_MS = 90_000;

const JOB_ACTOR = (schoolId: string) => ({ schoolId, userId: '00000000-0000-0000-0000-000000000000', role: 'principal' as const });
const aiContext = (schoolId: string) => ({ accountId: schoolId, childFirstNames: [], day: indiaDate() });

type QuestionPlan = { slots: PlanSlot[] };

// ---- asked for -----------------------------------------------------------------------------------------------------------

export type AskResult = { ok: true; generation: GenerationView; key: string } | { ok: false; reason: MakeRefusal | 'not_found'; problems?: PaperPlan['problems']; issues?: string[] };

async function queueMaking(db: Sql, queue: JobQueue, actor: Actor, paperId: string, row: { kind: 'paper' | 'again' | 'question'; questionId: string | null; blueprint: unknown; plan: unknown }): Promise<AskResult> {
  await db.query('savepoint paper_make');
  let generationId: string;
  try {
    generationId = (
      await db.query(
        `insert into paper_generations (school_id, paper_id, kind, question_id, blueprint, plan, requested_by) values ($1, $2, $3, $4, $5, $6, $7) returning generation_id`,
        [actor.schoolId, paperId, row.kind, row.questionId, JSON.stringify(row.blueprint ?? {}), JSON.stringify(row.plan), actor.userId]
      )
    ).rows[0].generation_id as string;
    await db.query('release savepoint paper_make');
  } catch (err) {
    await db.query('rollback to savepoint paper_make');
    const code = (err as { code?: string }).code;
    if (code === '23505') return { ok: false, reason: 'busy' };
    if (code === '42501') return { ok: false, reason: 'not_allowed' };
    throw err;
  }
  const key = makeKey(generationId);
  await queue.enqueue(db, { type: PAPERS_MAKE_JOB, payload: { generationId }, idempotencyKey: key, schoolId: actor.schoolId, maxAttempts: MAKE_ATTEMPTS });
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'marking.paper_make_asked',
    targetType: 'exam_papers',
    targetId: paperId,
    afterState: { kind: row.kind, ...(row.questionId ? { questionId: row.questionId } : {}) },
  });
  const generation = await latestGeneration(db, actor.schoolId, paperId);
  return { ok: true, generation: generation!, key };
}

// "Make the paper" ({ again?, sections?, chapterMarks? }): the plan by the exam type's blueprint (or the sections the
// teacher changed for this paper) and the chapters' shares (or the teacher's marks per chapter), then one job.
export async function askToMake(db: Sql, queue: JobQueue, actor: Actor, paperId: string, raw: unknown): Promise<AskResult> {
  const ctx = await paperContext(db, actor, paperId);
  if (!ctx) return { ok: false, reason: 'not_found' };
  const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const again = body.again === true;
  await closeStale(db, actor.schoolId, paperId);
  const questions = Number((await db.query(`select count(*)::int as n from marking_questions where school_id = $1 and paper_id = $2`, [actor.schoolId, paperId])).rows[0]?.n ?? 0);
  const refusal = await makeRefusal(db, actor.schoolId, ctx.paper, { again, generation: await latestGeneration(db, actor.schoolId, paperId), questions });
  if (refusal) return { ok: false, reason: refusal };
  const { blueprint, issues, plan } = await planFor(db, actor.schoolId, ctx, { sections: body.sections, chapterMarks: body.chapterMarks });
  if (!blueprint || !plan) return { ok: false, reason: 'no_blueprint' };
  if (issues.length) return { ok: false, reason: 'blueprint', issues };
  if (plan.problems.length) return { ok: false, reason: 'plan', problems: plan.problems };
  return queueMaking(db, queue, actor, paperId, { kind: again && questions > 0 ? 'again' : 'paper', questionId: null, blueprint: plan.blueprint, plan });
}

// "Make every paper": one making a paper of the exam the person may mark, each as "Make the paper" with the exam
// type's blueprint and the chapters' shares; a paper that has questions, is being made, cannot be changed or whose plan
// has a problem is left as it is, and the answer says which and why, so nothing is forced.
export type MakeAllResult = { queued: string[]; keys: string[]; skipped: { paperId: string; reason: MakeRefusal | 'not_found' }[] };
export async function askToMakeAll(db: Sql, queue: JobQueue, actor: Actor, examId: string): Promise<MakeAllResult | null> {
  if (!isUuid(examId)) return null;
  const papers = (await db.query(`select p.paper_id from exam_papers p where p.school_id = $1 and p.exam_id = $2 order by p.created_at, p.paper_id`, [actor.schoolId, examId])).rows.map((r) => r.paper_id as string);
  if (!papers.length) return null;
  const out: MakeAllResult = { queued: [], keys: [], skipped: [] };
  for (const paperId of papers) {
    const may = (await db.query(`select public.may_mark_paper($1) as ok`, [paperId])).rows[0]?.ok === true;
    if (!may) {
      out.skipped.push({ paperId, reason: 'not_allowed' });
      continue;
    }
    const r = await askToMake(db, queue, actor, paperId, {});
    if (r.ok) {
      out.queued.push(paperId);
      out.keys.push(r.key);
    } else out.skipped.push({ paperId, reason: r.reason });
  }
  return out;
}

// "Write a new one": one question of the paper written anew by the AI, keeping its number, part, marks, kind, chapter
// and topic. A question with no topic has nothing to be written for.
export async function askToRewrite(db: Sql, queue: JobQueue, actor: Actor, questionId: string): Promise<AskResult> {
  if (!isUuid(questionId)) return { ok: false, reason: 'not_found' };
  const q = (
    await db.query(
      `select q.paper_id, q.label, q.kind, q.max_marks, q.unit_id, q.difficulty, q.section, q.choice_group, u.chapter, u.topic
         from marking_questions q left join syllabus_units u on u.school_id = q.school_id and u.unit_id = q.unit_id
        where q.school_id = $1 and q.question_id = $2`,
      [actor.schoolId, questionId]
    )
  ).rows[0];
  if (!q) return { ok: false, reason: 'not_found' };
  const ctx = await paperContext(db, actor, q.paper_id as string);
  if (!ctx) return { ok: false, reason: 'not_found' };
  await closeStale(db, actor.schoolId, ctx.paper.paperId);
  const refusal = await makeRefusal(db, actor.schoolId, ctx.paper, { again: true, generation: await latestGeneration(db, actor.schoolId, ctx.paper.paperId), questions: 1 });
  if (refusal) return { ok: false, reason: refusal };
  if (!q.unit_id || !q.chapter) return { ok: false, reason: 'no_topic' };
  const slot: PlanSlot = {
    n: 1,
    section: (q.section as string | null) ?? '',
    kind: q.kind as QuestionKind,
    marks: Number(q.max_marks),
    difficulty: ((q.difficulty as Difficulty | null) ?? 'medium') as Difficulty,
    chapter: String(q.chapter),
    unitId: String(q.unit_id),
    topic: String(q.topic ?? ''),
    choiceGroup: (q.choice_group as string | null) ?? null,
  };
  const plan: QuestionPlan = { slots: [slot] };
  return queueMaking(db, queue, actor, ctx.paper.paperId, { kind: 'question', questionId, blueprint: {}, plan });
}

// ---- the job -------------------------------------------------------------------------------------------------------------

export type PapersMakeDeps = {
  asSchool: AsMarkingSchool;
  // The AI platform's first step; a test passes a stand-in that answers as a model would.
  prepare?: typeof prepareText;
  now?: () => number;
};

type BankRow = { bankId: string; prompt: string; options: QuestionOption[]; correct: CorrectAnswer | null; answerKey: string; steps: MarkingStep[] };
type Ask = { slots: SlotAsk[]; text: PreparedText };
type Taken = {
  generationId: string;
  kind: 'paper' | 'again' | 'question';
  questionId: string | null;
  requestedBy: string;
  ctx: PaperContext;
  plan: { slots: PlanSlot[]; choiceCounts: Record<string, number>; partKey: string | null };
  bank: Map<number, BankRow>;
  avoid: string[];
  version: string;
};

function slotsOf(plan: unknown): PlanSlot[] {
  const raw = (plan as { slots?: unknown })?.slots;
  return Array.isArray(raw) ? (raw as PlanSlot[]).filter((s) => s && typeof s.n === 'number' && typeof s.marks === 'number' && typeof s.kind === 'string') : [];
}

// A making that ended without questions, with the word the screen says.
async function failMaking(db: Sql, schoolId: string, generationId: string, failure: string): Promise<void> {
  await db.query(`update paper_generations set state = 'failed', failure = $3, finished_at = now() where school_id = $1 and generation_id = $2 and state in ('waiting', 'working')`, [schoolId, generationId, failure]);
}

// The class's bank questions for the paper's chapters, of its grade, subject and language, kept, and not on the class's
// last two other papers of the subject that have questions.
async function bankCandidates(db: Sql, schoolId: string, ctx: PaperContext, chapters: readonly string[]): Promise<BankCandidate[]> {
  if (!chapters.length) return [];
  const { rows } = await db.query(
    `select b.bank_id, b.chapter, b.topic, b.kind, b.max_marks, b.difficulty, b.used_count, b.last_used_at::text as last_used_at, b.created_at::text as created_at
       from question_bank b
      where b.school_id = $1 and b.subject_id = $2 and b.grade = $3 and b.language = $4 and b.state = 'kept' and b.chapter = any($5::text[])
        and not exists (
          select 1 from marking_questions q
           where q.school_id = b.school_id and q.bank_id = b.bank_id
             and q.paper_id in (select p.paper_id from exam_papers p
                                 where p.school_id = $1 and p.class_id = $6 and p.subject_id = $2 and p.paper_id <> $7
                                   and exists (select 1 from marking_questions x where x.school_id = p.school_id and x.paper_id = p.paper_id)
                                 order by p.paper_date desc nulls last, p.created_at desc limit 2))`,
    [schoolId, ctx.paper.subjectId, ctx.grade, ctx.language, [...chapters], ctx.paper.classId, ctx.paper.paperId]
  );
  return rows.map((r) => ({
    bankId: r.bank_id,
    chapter: r.chapter,
    topic: r.topic,
    kind: r.kind,
    maxMarks: Number(r.max_marks),
    difficulty: r.difficulty ?? null,
    usedCount: Number(r.used_count),
    lastUsedAt: r.last_used_at ?? null,
    createdAt: r.created_at,
  }));
}

async function bankRows(db: Sql, schoolId: string, ids: readonly string[]): Promise<Map<string, BankRow>> {
  if (!ids.length) return new Map();
  const { rows } = await db.query(`select bank_id, prompt, options, correct, answer_key, steps from question_bank where school_id = $1 and bank_id = any($2::uuid[])`, [schoolId, [...ids]]);
  return new Map(
    rows.map((r) => [
      r.bank_id as string,
      {
        bankId: r.bank_id,
        prompt: r.prompt,
        options: (r.options ?? []) as QuestionOption[],
        correct: (r.correct ?? null) as CorrectAnswer | null,
        answerKey: r.answer_key,
        steps: ((r.steps ?? []) as MarkingStep[]).map((s) => ({ step: s.step, marks: Number(s.marks) })),
      },
    ])
  );
}

// The AI's requests for the slots, a few a request, through the platform's checks. None when the task is off.
async function prepareAsks(db: Sql, prepare: typeof prepareText, schoolId: string, t: Pick<Taken, 'ctx' | 'avoid'>, slots: readonly PlanSlot[], version: string | null): Promise<{ asks: Ask[]; off: boolean; version: string }> {
  const prompt = writeQuestionsPrompt(version);
  const asks: Ask[] = [];
  for (let i = 0; i < slots.length; i += SLOTS_PER_REQUEST) {
    const chunk = slots.slice(i, i + SLOTS_PER_REQUEST);
    const ask = {
      grade: t.ctx.grade,
      subject: t.ctx.paper.subjectName,
      language: t.ctx.language,
      slots: chunk.map((s) => ({ slot: s.n, chapter: s.chapter, topic: s.topic, kind: s.kind, marks: s.marks, difficulty: s.difficulty })),
      avoid: t.avoid.slice(0, 120),
    };
    const p = await prepare(db, aiContext(schoolId), 'exams.write_questions', {
      system: prompt.system(ask),
      messages: [{ role: 'user', content: prompt.user(ask) }],
      responseFormat: 'json',
      maxTokens: 6000,
    });
    if (!p.ok) return { asks: [], off: p.reason !== 'failed', version: prompt.version };
    asks.push({ slots: chunk.map((s) => ({ slot: s.n, kind: s.kind, marks: s.marks })), text: p.text });
  }
  return { asks, off: false, version: prompt.version };
}

async function sendAll(asks: readonly Ask[], avoid: readonly string[]): Promise<{ written: Map<number, WrittenQuestion>; sent: SentText[]; answered: number }> {
  const sent = await Promise.all(asks.map((a) => a.text.send()));
  const written = new Map<number, WrittenQuestion>();
  const seen = [...avoid];
  let answered = 0;
  sent.forEach((s, i) => {
    if (!s.result.ok) return;
    answered++;
    for (const [n, q] of parseWritten(s.result.text, asks[i].slots, seen)) {
      written.set(n, q);
      seen.push(q.prompt);
    }
  });
  return { written, sent, answered };
}

export function papersMakeHandler(deps: PapersMakeDeps): JobHandler {
  const prepare = deps.prepare ?? prepareText;
  const now = deps.now ?? Date.now;
  return async (job: ClaimedJob) => {
    const started = now();
    if (!job.schoolId || !isUuid(job.schoolId)) throw new PermanentJobError('papers.make: no school');
    const schoolId = job.schoolId;
    const asked = (job.payload as { generationId?: unknown }).generationId;
    if (typeof asked !== 'string' || !isUuid(asked)) throw new PermanentJobError('papers.make: bad payload');
    const generationId: string = asked;
    const last = job.attempts >= job.maxAttempts;
    try {
      await run();
    } catch (err) {
      if (!last || err instanceof PermanentJobError) throw err;
      // The last try: the making ends as failed rather than staying "working".
      await deps.asSchool(schoolId, MARKING_SESSION, (db) => failMaking(db, schoolId, generationId, 'error'));
    }

    async function run() {
      // 1. The making, the paper checked again, the bank's questions and the AI's requests.
      let firstAsks: Ask[] = [];
      let aiOff = false;
      const taken = await deps.asSchool(schoolId, MARKING_SESSION, async (db): Promise<Taken | null> => {
        const g = (
          await db.query(
            `update paper_generations set state = 'working', attempts = attempts + 1, started_at = coalesce(started_at, now())
              where school_id = $1 and generation_id = $2 and state in ('waiting', 'working')
              returning paper_id, kind, question_id, requested_by, plan`,
            [schoolId, generationId]
          )
        ).rows[0];
        if (!g) return null;
        const ctx = await paperContext(db, JOB_ACTOR(schoolId), g.paper_id as string);
        if (!ctx) {
          await failMaking(db, schoolId, generationId, 'closed');
          return null;
        }
        const questions = (await db.query(`select question_id, prompt from marking_questions where school_id = $1 and paper_id = $2 order by position`, [schoolId, ctx.paper.paperId])).rows;
        const refusal = await makeRefusal(db, schoolId, ctx.paper, { again: g.kind !== 'paper', generation: null, questions: questions.length });
        if (refusal) {
          await failMaking(db, schoolId, generationId, refusal === 'not_allowed' ? 'closed' : refusal);
          return null;
        }
        if (g.kind === 'question' && !questions.some((q) => q.question_id === g.question_id)) {
          await failMaking(db, schoolId, generationId, 'closed');
          return null;
        }
        const units = new Set(ctx.paper.units.map((u) => u.unitId));
        const slots = slotsOf(g.plan).map((s) => ({ ...s, unitId: units.has(s.unitId) ? s.unitId : '' }));
        const plan = g.plan as Partial<PaperPlan>;
        // The paper's other questions are avoided by a new one; a whole paper made again starts afresh.
        const avoid = g.kind === 'question' ? questions.map((q) => String(q.prompt)).filter(Boolean) : [];
        const bank = new Map<number, BankRow>();
        if (g.kind !== 'question') {
          const picks = pickFromBank(slots, await bankCandidates(db, schoolId, ctx, [...new Set(slots.map((s) => s.chapter))]));
          const rows = await bankRows(db, schoolId, [...picks.values()]);
          for (const [n, id] of picks) {
            const row = rows.get(id);
            if (row) {
              bank.set(n, row);
              avoid.push(row.prompt);
            }
          }
        }
        const t: Taken = {
          generationId,
          kind: g.kind,
          questionId: g.question_id ?? null,
          requestedBy: g.requested_by,
          ctx,
          plan: { slots, choiceCounts: (plan.choiceCounts ?? {}) as Record<string, number>, partKey: plan.part?.key ?? null },
          bank,
          avoid,
          version: '',
        };
        const open = slots.filter((s) => !bank.has(s.n) && s.unitId);
        const version = await activePromptVersion(db, 'exams.write_questions');
        if (open.length) {
          const p = await prepareAsks(db, prepare, schoolId, t, open, version);
          firstAsks = p.asks;
          aiOff = p.off;
          t.version = p.version;
        }
        return t;
      });
      if (!taken) return;

      // 2–3. The AI writes, with no connection held; what it did not give is asked for once more while there is time.
      const sent: SentText[] = [];
      const written = new Map<number, WrittenQuestion>();
      let answered = 0;
      if (firstAsks.length) {
        const r = await sendAll(firstAsks, taken.avoid);
        sent.push(...r.sent);
        answered += r.answered;
        for (const [n, q] of r.written) written.set(n, q);
      }
      const missing = () => taken.plan.slots.filter((s) => !taken.bank.has(s.n) && !written.has(s.n) && s.unitId);
      if (firstAsks.length && missing().length && now() - started < LONG_JOB_MAX_MS - PROFILE_MS - 20_000) {
        const again = await deps.asSchool(schoolId, MARKING_SESSION, async (db) => {
          for (const s of sent.splice(0)) await s.record(db);
          const avoid = [...taken.avoid, ...[...written.values()].map((q) => q.prompt)];
          return prepareAsks(db, prepare, schoolId, { ...taken, avoid }, missing(), taken.version);
        });
        if (again.asks.length) {
          const r = await sendAll(again.asks, [...taken.avoid, ...[...written.values()].map((q) => q.prompt)]);
          sent.push(...r.sent);
          answered += r.answered;
          for (const [n, q] of r.written) written.set(n, q);
        }
      }
      // Every request failed (the provider did not answer): tried again later, unless this is the last try.
      const tried = sent.length > 0 || firstAsks.length > 0;
      if (tried && answered === 0 && written.size === 0 && !last) {
        await deps.asSchool(schoolId, MARKING_SESSION, async (db) => {
          for (const s of sent) await s.record(db);
        });
        throw new Error('papers.make: the AI gave no answer');
      }

      // 4. Kept.
      const provider = sent.find((s) => s.result.ok)?.result;
      await deps.asSchool(schoolId, MARKING_SESSION, async (db) => {
        for (const s of sent) await s.record(db);
        const g = (await db.query(`select state from paper_generations where school_id = $1 and generation_id = $2 for update`, [schoolId, generationId])).rows[0];
        if (!g || g.state !== 'working') return;
        const ai = provider && provider.ok ? { provider: provider.provider, model: provider.model } : null;
        const result = await writePaper(db, schoolId, taken, written, aiOff);
        await db.query(
          `update paper_generations set state = $3, failure = $4, result = $5, ai_provider = $6, ai_model = $7, prompt_version = $8, finished_at = now()
            where school_id = $1 and generation_id = $2`,
          [
            schoolId,
            generationId,
            result.ok ? 'done' : 'failed',
            result.ok ? null : result.failure,
            JSON.stringify({ bank: taken.bank.size, ai: written.size, empty: result.ok ? result.empty : 0, aiOff }),
            ai?.provider ?? null,
            ai?.model ?? null,
            ai ? taken.version || null : null,
          ]
        );
      });
    }
  };
}

// The paper's questions, as the making made them. A first making or "Make again": every slot in order, from the bank,
// the AI (a draft in the bank, in the name of the person who asked) or empty for the teacher; one question anew: its
// words only. The paper is no longer kept.
async function writePaper(db: Sql, schoolId: string, t: Taken, written: ReadonlyMap<number, WrittenQuestion>, aiOff: boolean): Promise<{ ok: true; empty: number } | { ok: false; failure: string }> {
  const paperId = t.ctx.paper.paperId;
  const draft = async (s: PlanSlot, q: WrittenQuestion): Promise<string> =>
    (
      await db.query(
        `insert into question_bank (school_id, grade, subject_id, chapter, topic, kind, max_marks, prompt, options, correct, answer_key, steps, difficulty, language, source, state, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'ai', 'draft', $15) returning bank_id`,
        [schoolId, t.ctx.grade, t.ctx.paper.subjectId, s.chapter.slice(0, 120), s.topic.slice(0, 200), s.kind, s.marks, q.prompt, JSON.stringify(q.options), q.correct ? JSON.stringify(q.correct) : null, q.answerKey, JSON.stringify(q.steps), s.difficulty, t.ctx.language, t.requestedBy]
      )
    ).rows[0].bank_id as string;
  const before = (await db.query(`select bank_id from marking_questions where school_id = $1 and paper_id = $2 and bank_id is not null`, [schoolId, paperId])).rows.map((r) => r.bank_id as string);

  if (t.kind === 'question') {
    const s = t.plan.slots[0];
    const q = s ? written.get(s.n) : undefined;
    if (!s || !q || !t.questionId) return { ok: false, failure: aiOff ? 'ai_off' : 'no_answer' };
    const bankId = await draft(s, q);
    await db.query(
      `update marking_questions set prompt = $3, options = $4, correct = $5, answer_key = $6, steps = $7, bank_id = $8, updated_by = $9 where school_id = $1 and question_id = $2`,
      [schoolId, t.questionId, q.prompt, JSON.stringify(q.options), q.correct ? JSON.stringify(q.correct) : null, q.answerKey, JSON.stringify(q.steps), bankId, t.requestedBy]
    );
  } else {
    if (!t.plan.partKey || !t.plan.slots.length) return { ok: false, failure: 'closed' };
    if (t.kind === 'again') await db.query(`delete from marking_questions where school_id = $1 and paper_id = $2`, [schoolId, paperId]);
    else if ((await db.query(`select 1 from marking_questions where school_id = $1 and paper_id = $2 limit 1`, [schoolId, paperId])).rows.length) return { ok: false, failure: 'has_questions' };
    let empty = 0;
    for (const s of t.plan.slots) {
      const fromBank = t.bank.get(s.n);
      const fromAi = written.get(s.n);
      const q = fromBank ?? fromAi ?? null;
      if (!q) empty++;
      const bankId = fromBank ? fromBank.bankId : fromAi ? await draft(s, fromAi) : null;
      await db.query(
        `insert into marking_questions (school_id, paper_id, label, component, max_marks, choice_group, unit_id, kind, prompt, answer_key, steps, position, options, correct, difficulty, section, bank_id, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          schoolId,
          paperId,
          String(s.n),
          t.plan.partKey,
          s.marks,
          s.choiceGroup,
          s.unitId || null,
          s.kind,
          q?.prompt ?? '',
          q?.answerKey ?? '',
          JSON.stringify(q?.steps ?? []),
          s.n,
          JSON.stringify(q?.options ?? []),
          q?.correct ? JSON.stringify(q.correct) : null,
          s.difficulty,
          /^[A-H]$/.test(s.section) ? s.section : null,
          bankId,
          t.requestedBy,
        ]
      );
    }
    await db.query(
      `insert into marking_setups (school_id, paper_id, language, choice_counts, updated_by) values ($1, $2, $3, $4, $5)
       on conflict (school_id, paper_id) do update set choice_counts = excluded.choice_counts, updated_by = excluded.updated_by, updated_at = now()`,
      [schoolId, paperId, t.ctx.language, JSON.stringify(t.plan.choiceCounts), t.requestedBy]
    );
    await db.query('set constraints marking_questions_school_id_paper_id_position_key immediate');
    await unkeep(db, schoolId, paperId, before);
    return { ok: true, empty };
  }
  await unkeep(db, schoolId, paperId, before);
  return { ok: true, empty: 0 };
}

// The paper changed: it is kept again before it prints; the AI drafts it no longer uses are removed.
async function unkeep(db: Sql, schoolId: string, paperId: string, before: readonly string[]): Promise<void> {
  await db.query(`update marking_setups set kept_at = null, kept_by = null where school_id = $1 and paper_id = $2 and kept_at is not null`, [schoolId, paperId]);
  if (!before.length) return;
  await db.query(
    `delete from question_bank b where b.school_id = $1 and b.bank_id = any($2::uuid[]) and b.state = 'draft'
        and not exists (select 1 from marking_questions q where q.school_id = b.school_id and q.bank_id = b.bank_id)`,
    [schoolId, [...before]]
  );
}

export async function aiState(db: Sql): Promise<boolean> {
  return aiWritingOn(db);
}
