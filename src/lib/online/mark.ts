import { prepareText, type PreparedText } from '@/lib/ai/platform';
import { ERROR_TYPES, MAX_MARKING_ATTEMPTS, type ErrorType, type MarkingLanguage, type MarkingPaper, type MarkingQuestion, type OnlineAnswer, type SheetFlag, type SheetResult } from '@/lib/contracts/marking';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { PermanentJobError, type ClaimedJob, type JobHandler, type Sql } from '@/lib/jobs/types';
import { marksByRule, ruleMarkable, type RuleAnswer } from '@/lib/marking/answers';
import { aiMarkingState, markingPaper, markingSettings } from '@/lib/marking/context';
import { parseMarking } from '@/lib/marking/parse';
import { MARKING_SESSION, type AsMarkingSchool } from '@/lib/marking/pipeline';
import { questionsOf } from '@/lib/marking/setup';
import { NEARLY_FULL } from '@/lib/marking/store';
import { indiaDate } from '@/lib/time/india';
import { TYPED_PROMPT_VERSION, typedMarkSystem, typedMarkUser, type TypedAsk } from './prompt';

// An online test's script (C365, docs/36 §1.3): what a child saved becomes one script of the paper, made and marked in
// the school's own marking session as its office sees it, with no person (MARKING_SESSION, as the page pictures' jobs),
// so the row rules hold as for the office and the database refuses any write of a mark from here: only a person's
// approval writes the paper's marks (approveSheets → saveMarks), and families see the script only at publication.
//
//   online.mark   {attemptId}  one ended attempt (submitted, or timed out: what was saved counts). In one transaction:
//                 its script (source 'online', the child known: matched_by 'online'; a child who already has a live
//                 script of the paper gets this one unmatched, flagged two_scripts, as scans do), and the marks of every
//                 choice and number question by rules (marksByRule, with the setup's wrong marks; never the AI). The
//                 questions answered in words go to the marking AI (exams.mark, through the AI platform: the task
//                 switched on, the provider cleared for children's words, the child's first name scrubbed), sent
//                 with no connection held, kept in a third transaction. With AI marking off, or no answer from it,
//                 the script is still made: those questions wait for the teacher (flag not_all_read). Taken again it
//                 changes nothing; a person's "Mark again" queues it anew (src/lib/online/tests.ts).
//   online.sweep  every two minutes (the platform): attempts past their deadline are timed out, and every ended
//                 attempt without a script is queued (public.online_attempts_sweep).
// The answers' words are a child's: they leave the server only to a provider cleared for minors. Nothing in a request
// names the child, the school or the exam. Each job ends within the runner's long-job bound (its AI call by its profile).

export const ONLINE_MARK_JOB = 'online.mark';
export const ONLINE_SWEEP_JOB = 'online.sweep';
export const ONLINE_MARK_ATTEMPTS = 3;

const JOB_ACTOR = (schoolId: string) => ({ schoolId, userId: '00000000-0000-0000-0000-000000000000', role: 'principal' as const });

export type OnlineMarkDeps = {
  asSchool: AsMarkingSchool;
  // The AI platform's first step; a test passes a stand-in that answers as a model would.
  prepare?: typeof prepareText;
};

type Setup = { language: MarkingLanguage; guidance: string; counts: Record<string, number>; wrongMarks: number };
type Written = { q: MarkingQuestion; text: string };
type Taken = { sheetId: string; paper: MarkingPaper; questions: MarkingQuestion[]; setup: Setup; written: Written[]; firstName: string; grade: string };

// A saved answer as rules read it: the keys chosen, or the number given (words that are a number count as it).
function ruleAnswerOf(a: OnlineAnswer | null): RuleAnswer {
  if (!a) return null;
  if ('keys' in a) return { keys: a.keys };
  if ('value' in a) return { value: a.value };
  const n = Number(a.text.trim());
  return a.text.trim() && Number.isFinite(n) ? { value: n } : { keys: [] };
}

// What the AI reads of an answer: the words; a choice as its options' words; a number as written.
function wordsOf(q: MarkingQuestion, a: OnlineAnswer): string {
  if ('text' in a) return a.text;
  if ('value' in a) return String(a.value);
  return a.keys.map((k) => `${k}) ${q.options.find((o) => o.key === k)?.text ?? ''}`.trim()).join('; ');
}

const MARK_COLUMNS = `insert into marking_marks (school_id, sheet_id, paper_id, question_id, attempted, ai_marks, ai_steps, ai_note, ai_reason, error_type, confidence, page_id, y_from, y_to)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, null, null, null)
  on conflict (school_id, sheet_id, question_id) do update set attempted = excluded.attempted, ai_marks = excluded.ai_marks, ai_steps = excluded.ai_steps,
    ai_note = excluded.ai_note, ai_reason = excluded.ai_reason, error_type = excluded.error_type, confidence = excluded.confidence,
    page_id = null, y_from = null, y_to = null`;

// 1. The script taken (made the first time), and the rule marks kept. Null when there is nothing to mark: the attempt
// has not ended or was voided, its class is published, or its script is approved, set aside or out of the AI's tries.
export async function takeOnlineScript(db: Sql, schoolId: string, attemptId: string): Promise<Taken | null> {
  const a = (await db.query(`select paper_id, student_id, state, sheet_id from online_attempts where school_id = $1 and attempt_id = $2 for update`, [schoolId, attemptId])).rows[0];
  if (!a || !['submitted', 'timed_out'].includes(a.state)) return null;
  const paper = await markingPaper(db, JOB_ACTOR(schoolId), a.paper_id as string);
  if (!paper || paper.published || !paper.mayMark) return null;
  const questions = await questionsOf(db, schoolId, paper.paperId);
  if (!questions.length) return null;
  const s = (await db.query(`select language, guidance, choice_counts, wrong_marks from marking_setups where school_id = $1 and paper_id = $2`, [schoolId, paper.paperId])).rows[0];
  const setup: Setup = { language: (s?.language ?? 'en') as MarkingLanguage, guidance: (s?.guidance ?? '') as string, counts: (s?.choice_counts ?? {}) as Record<string, number>, wrongMarks: Number(s?.wrong_marks ?? 0) };
  let sheetId = a.sheet_id as string | null;
  if (!sheetId) {
    // One live script per child and paper: a child who already has one (sat on paper as well) gets this one unmatched,
    // for the teacher to settle, as two scanned scripts of one child are.
    const other = (await db.query(`select 1 from marking_sheets where school_id = $1 and paper_id = $2 and student_id = $3 and state <> 'set_aside'`, [schoolId, paper.paperId, a.student_id])).rows[0];
    sheetId = (
      await db.query(
        `insert into marking_sheets (school_id, paper_id, upload_id, source, student_id, matched_by, match_note, state, attempts, flags)
         values ($1, $2, null, 'online', $3, $4, $5::jsonb, 'marking', 1, $6) returning sheet_id`,
        [schoolId, paper.paperId, other ? null : a.student_id, other ? 'none' : 'online', JSON.stringify(other ? { candidates: [a.student_id] } : {}), other ? ['two_scripts'] : []]
      )
    ).rows[0].sheet_id as string;
    await db.query(`update online_attempts set sheet_id = $3 where school_id = $1 and attempt_id = $2`, [schoolId, attemptId, sheetId]);
  } else {
    const sheet = (await db.query(`select state, attempts from marking_sheets where school_id = $1 and sheet_id = $2 for update`, [schoolId, sheetId])).rows[0];
    if (!sheet || !['waiting', 'marking', 'failed'].includes(sheet.state) || Number(sheet.attempts) >= MAX_MARKING_ATTEMPTS) return null;
    await db.query(`update marking_sheets set state = 'marking', failure = null, attempts = attempts + 1 where school_id = $1 and sheet_id = $2`, [schoolId, sheetId]);
  }
  const answers = new Map(
    ((await db.query(`select question_id, answer from online_answers where school_id = $1 and attempt_id = $2`, [schoolId, attemptId])).rows as { question_id: string; answer: OnlineAnswer | null }[]).map((r) => [r.question_id, r.answer])
  );
  const written: Written[] = [];
  for (const q of questions) {
    const given = answers.get(q.questionId) ?? null;
    const keep = (attempted: boolean, marks: number, error: ErrorType | null) => db.query(MARK_COLUMNS, [schoolId, sheetId, paper.paperId, q.questionId, attempted, marks, '[]', null, null, error, null]);
    if (ruleMarkable(q)) {
      const r = marksByRule(q, ruleAnswerOf(given), setup.wrongMarks);
      if (r) await keep(r.attempted, r.marks, !r.attempted ? 'not_attempted' : r.right ? 'none' : null);
    } else if (!given) {
      await keep(false, 0, 'not_attempted');
    } else {
      written.push({ q, text: wordsOf(q, given) });
    }
  }
  const student = (await db.query(`select name from students where school_id = $1 and student_id = $2`, [schoolId, a.student_id])).rows[0];
  const grade = (await db.query(`select grade from classes where school_id = $1 and class_id = $2`, [schoolId, paper.classId])).rows[0]?.grade;
  return {
    sheetId,
    paper,
    questions,
    setup,
    written,
    firstName: String(student?.name ?? '').trim().split(/\s+/)[0] ?? '',
    grade: typeof grade === 'string' && grade.trim() ? grade.trim() : '',
  };
}

const short = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? Array.from(v.trim()).slice(0, max).join('') : null);

// 3. The script marked: the AI's marks for the written questions (when it answered), then its flags. A question with no
// mark waits for the teacher (not_all_read); a written question the AI was unsure of, or written answers given nearly
// full marks by the AI alone, flag it for a person (unsure), as scans are. Rule marks never flag a script.
export async function finishOnlineScript(db: Sql, schoolId: string, taken: Taken, ai: { result: SheetResult; provider: string; model: string } | null): Promise<void> {
  const sheet = (await db.query(`select state, flags from marking_sheets where school_id = $1 and sheet_id = $2 for update`, [schoolId, taken.sheetId])).rows[0];
  if (!sheet || sheet.state !== 'marking') return;
  const settings = await markingSettings(db, schoolId);
  const units = new Set(taken.paper.units.map((u) => u.unitId));
  const written = new Set(taken.written.map((w) => w.q.questionId));
  let least: number | null = null;
  let unsure = false;
  if (ai) {
    for (const r of ai.result.questions) {
      const q = taken.questions.find((x) => x.questionId === r.questionId);
      if (!q || !written.has(q.questionId)) continue;
      let marks = r.attempted ? r.marks : 0;
      if (marks !== null && (!Number.isFinite(marks) || marks < 0 || marks > q.maxMarks || Math.round(marks * 10) !== marks * 10)) marks = null;
      const confidence = typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1 ? r.confidence : null;
      if (confidence !== null) {
        least = least === null ? confidence : Math.min(least, confidence);
        if (confidence < settings.reviewBelow) unsure = true;
      }
      const errorType: ErrorType | null = r.errorType && (ERROR_TYPES as readonly string[]).includes(r.errorType) ? r.errorType : r.attempted ? null : 'not_attempted';
      const steps = r.steps.slice(0, 12).map((s) => ({ step: short(s.step, 300) ?? '', awarded: Math.max(0, Math.round(s.awarded * 10) / 10), note: short(s.note, 300) })).filter((s) => s.step);
      await db.query(MARK_COLUMNS, [schoolId, taken.sheetId, taken.paper.paperId, q.questionId, r.attempted, marks, JSON.stringify(steps), short(r.note, 1000), short(r.reason, 1500), errorType, confidence]);
    }
  }
  const finals = new Map(
    ((await db.query(`select question_id, ai_marks from marking_marks where school_id = $1 and sheet_id = $2`, [schoolId, taken.sheetId])).rows as { question_id: string; ai_marks: unknown }[]).map((m) => [
      m.question_id,
      m.ai_marks === null ? null : Number(m.ai_marks),
    ])
  );
  const notAll = taken.questions.some((q) => finals.get(q.questionId) === null || finals.get(q.questionId) === undefined);
  // Full marks, or nearly, from the AI alone on the written answers: words that ask for marks never reach the paper
  // through "approve every script with no flag".
  const aiMax = taken.written.reduce((n, w) => n + w.q.maxMarks, 0);
  const aiSum = taken.written.reduce((n, w) => n + (finals.get(w.q.questionId) ?? 0), 0);
  if (ai && aiMax > 0 && aiSum >= NEARLY_FULL * aiMax) unsure = true;
  const kept = ((sheet.flags ?? []) as SheetFlag[]).filter((f) => f === 'identity' || f === 'two_scripts' || f === 'check_child' || f === 'mismatch');
  const flags: SheetFlag[] = [...kept, ...(notAll ? (['not_all_read'] as const) : []), ...(unsure ? (['unsure'] as const) : [])];
  const practice = (ai?.result.practice ?? [])
    .filter((p) => short(p.text, 300))
    .slice(0, 8)
    .map((p) => ({ unitId: p.unitId && units.has(p.unitId) ? p.unitId : null, text: short(p.text, 300) as string }));
  await db.query(
    `update marking_sheets set state = 'marked', flags = $3, failure = null, ai_provider = $4, ai_model = $5, prompt_version = $6, marked_at = now(), ai_confidence = $7,
            strengths = $8, improve = $9, practice = $10
      where school_id = $1 and sheet_id = $2`,
    [
      schoolId,
      taken.sheetId,
      flags,
      ai ? ai.provider.slice(0, 40) : null,
      ai ? ai.model.slice(0, 80) : null,
      ai ? TYPED_PROMPT_VERSION : null,
      least === null ? null : Math.round(least * 100) / 100,
      short(ai?.result.strengths, 1000),
      short(ai?.result.improve, 1000),
      JSON.stringify(practice),
    ]
  );
}

function payloadOf(job: ClaimedJob): { schoolId: string; attemptId: string } {
  if (!job.schoolId || !isUuid(job.schoolId)) throw new PermanentJobError(`${job.type}: no school`);
  const attemptId = (job.payload as { attemptId?: unknown }).attemptId;
  if (!isUuid(attemptId)) throw new PermanentJobError(`${job.type}: bad payload`);
  return { schoolId: job.schoolId, attemptId };
}

export function onlineMarkHandler(deps: OnlineMarkDeps): JobHandler {
  const prepare = deps.prepare ?? prepareText;
  return async (job) => {
    const { schoolId, attemptId } = payloadOf(job);
    const last = job.attempts >= job.maxAttempts;

    // 1. The script and its rule marks, in one transaction.
    const taken = await deps.asSchool(schoolId, MARKING_SESSION, (db) => takeOnlineScript(db, schoolId, attemptId));
    if (!taken) return;
    const done = (ai: Parameters<typeof finishOnlineScript>[3]) => deps.asSchool(schoolId, MARKING_SESSION, (db) => finishOnlineScript(db, schoolId, taken, ai));
    if (!taken.written.length) return done(null);

    // 2. The written answers' request, through the AI platform's checks, in one short transaction. AI marking off, or
    // no provider cleared for children's words: the written answers wait for the teacher.
    const units = new Map(taken.paper.units.map((u) => [u.unitId, u]));
    const prepared = await deps.asSchool(schoolId, MARKING_SESSION, async (db): Promise<PreparedText | null> => {
      if (!(await aiMarkingState(db, schoolId)).on) return null;
      const ask: TypedAsk = {
        grade: taken.grade,
        subject: taken.paper.subjectName,
        language: taken.setup.language,
        guidance: taken.setup.guidance,
        questions: taken.written.map(({ q }) => ({
          label: q.label,
          maxMarks: q.maxMarks,
          kind: q.kind,
          prompt: q.prompt,
          answerKey: q.answerKey,
          steps: q.steps,
          chapter: q.unitId ? units.get(q.unitId)?.chapter ?? null : null,
          topic: q.unitId ? units.get(q.unitId)?.topic ?? null : null,
        })),
        topics: taken.paper.units.map((u) => ({ chapter: u.chapter, topic: u.topic })),
        answers: taken.written.map((w) => ({ label: w.q.label, answer: w.text })),
      };
      const p = await prepare(db, { accountId: schoolId, childFirstNames: taken.firstName ? [taken.firstName] : [], day: indiaDate() }, 'exams.mark', {
        system: typedMarkSystem(ask),
        messages: [{ role: 'user', content: typedMarkUser(ask) }],
        responseFormat: 'json',
        maxTokens: 12000,
      });
      return p.ok ? p.text : null;
    });
    if (!prepared) return done(null);

    // 3. The AI marks the written answers, with no connection held.
    const sent = await prepared.send();

    // 4. Kept (checked again against the paper), or tried again; after the last try the written answers wait for the
    // teacher. The metering is kept either way.
    const again = await deps.asSchool(schoolId, MARKING_SESSION, async (db) => {
      await sent.record(db);
      if (!sent.result.ok && !last) return true;
      const result = sent.result.ok
        ? parseMarking(
            sent.result.text,
            taken.written.map((w) => w.q),
            [],
            taken.paper.units
          )
        : null;
      await db.query('savepoint keep_marks');
      try {
        await finishOnlineScript(db, schoolId, taken, result && sent.result.ok ? { result, provider: sent.result.provider, model: sent.result.model } : null);
        await db.query('release savepoint keep_marks');
      } catch {
        await db.query('rollback to savepoint keep_marks');
        await finishOnlineScript(db, schoolId, taken, null);
      }
      return false;
    });
    if (again) throw new Error('online.mark: the AI gave no answer');
  };
}

// The sweep: as the platform, through the database's own function (the platform role holds nothing on the tables).
export function onlineSweepHandler(deps: { platform: <T>(fn: (db: Sql) => Promise<T>) => Promise<T> }): JobHandler {
  return async () => {
    await deps.platform((db) => db.query(`select timed_out, queued from public.online_attempts_sweep()`));
  };
}
