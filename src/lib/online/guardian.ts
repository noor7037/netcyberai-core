import type { PoolClient } from 'pg';
import { SchoolLinkGoneError, withGuardianContext, type FamilyClaims } from '@/lib/auth/db';
import {
  ONLINE_TEXT_MAX,
  OPTION_KEYS,
  type FamilyOnlineQuestion,
  type FamilyOnlineSaveResult,
  type FamilyOnlineSitting,
  type FamilyOnlineStartOutcome,
  type FamilyOnlineSubmitResult,
  type FamilyOnlineTest,
  type OnlineAnswer,
  type OnlineInput,
  type OptionKey,
  type QuestionKind,
  type QuestionOption,
} from '@/lib/contracts/marking';
import { isUuid } from '@/lib/frameworks/custom-fields';

// School Link's part of online tests (C365): the Family app's child mode sits a test of the child's own class, read
// and written AS the guardian (withGuardianContext, as every School Link read), so the school's rules decide: a
// guardian session reads none of the test tables (each `<table>_no_parent`), and every step goes through the
// database's guardian functions (migration ..._aq_4_online.sql), which answer only for the session's own guardian's own
// consented child, a test of that child's class, opened, in the time the database keeps. The questions they send
// carry no correct answer, answer key or marking steps, and nothing here asks for one. A child's own phone (C342)
// reaches only its own child (withGuardianContext checks the phone's child is the one matched). The Family app reaches
// this module through src/lib/family/online-tests.ts only (check_family_boundary.py's door).

type Claims = FamilyClaims;
export { SchoolLinkGoneError };
type Sql = Pick<PoolClient, 'query'>;

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

// The child's tests: upcoming or open now, and any being sat. `state` from the database's clock.
export async function readOnlineTests(claims: Claims, linkId: string, studentId: string): Promise<FamilyOnlineTest[]> {
  if (!isUuid(studentId)) return [];
  return withGuardianContext(claims, linkId, async (db) => {
    const { rows } = await db.query(
      `select test_id, exam_name, subject_name, opens_at, closes_at, minutes, questions, attempt_state, deadline_at, server_now
         from public.guardian_online_tests() where student_id = $1`,
      [studentId]
    );
    return rows.map((r) => {
      const now = new Date(r.server_now).getTime();
      const state =
        r.attempt_state === 'open' && new Date(r.deadline_at).getTime() > now
          ? 'in_progress'
          : r.attempt_state
            ? 'done'
            : new Date(r.opens_at).getTime() > now
              ? 'upcoming'
              : 'open';
      return {
        testId: r.test_id,
        exam: r.exam_name,
        subject: r.subject_name,
        opensAt: iso(r.opens_at),
        closesAt: iso(r.closes_at),
        minutes: Number(r.minutes),
        questions: Number(r.questions),
        state,
        deadlineAt: state === 'in_progress' ? iso(r.deadline_at) : null,
        serverNow: iso(r.server_now),
      } satisfies FamilyOnlineTest;
    });
  });
}

const INPUTS: readonly OnlineInput[] = ['choice', 'number', 'text'];

async function questionsOf(db: Sql, attemptId: string, studentId: string): Promise<FamilyOnlineQuestion[]> {
  const { rows } = await db.query(
    `select question_id, n, label, section, kind, input, prompt, options, multi, max_marks, choice_group, group_count, answer, flagged, seq
       from public.guardian_online_questions($1, $2) order by n`,
    [attemptId, studentId]
  );
  // Named fields only, as the database sent them: never anything else of a question.
  return rows.map((r) => ({
    questionId: r.question_id,
    n: Number(r.n),
    label: r.label,
    section: r.section ?? null,
    kind: r.kind as QuestionKind,
    input: (INPUTS as readonly string[]).includes(r.input) ? (r.input as OnlineInput) : 'text',
    prompt: r.prompt ?? '',
    options: ((r.options ?? []) as { key: string; text: string | null }[]).map((o) => ({ key: o.key, text: o.text ?? '' }) as QuestionOption),
    multi: r.multi === true,
    maxMarks: Number(r.max_marks),
    choiceGroup: r.choice_group ?? null,
    groupCount: r.group_count === null || r.group_count === undefined ? null : Number(r.group_count),
    answer: (r.answer ?? null) as OnlineAnswer | null,
    flagged: r.flagged === true,
    seq: Number(r.seq ?? 0),
  }));
}

// Starts the child's one attempt (or gives back the one being sat) and, while it is being sat, its questions in its own
// order with the child's saved answers.
export async function startOnlineTest(claims: Claims, linkId: string, studentId: string, testId: string): Promise<FamilyOnlineSitting> {
  if (!isUuid(studentId) || !isUuid(testId)) return { outcome: 'not_found', attemptId: null, deadlineAt: null, serverNow: new Date().toISOString(), questions: [] };
  return withGuardianContext(claims, linkId, async (db) => {
    const r = (await db.query(`select outcome, attempt_id, deadline_at, server_now from public.guardian_online_start($1, $2)`, [testId, studentId])).rows[0];
    const outcome = (r?.outcome ?? 'not_found') as FamilyOnlineStartOutcome;
    const sitting = outcome === 'started' || outcome === 'open';
    return {
      outcome,
      attemptId: sitting ? r.attempt_id : null,
      deadlineAt: sitting ? iso(r.deadline_at) : null,
      serverNow: iso(r?.server_now ?? new Date()),
      questions: sitting ? await questionsOf(db, r.attempt_id, studentId) : [],
    };
  });
}

// An answer as the phone sent it, shaped for the database (which checks it against the question again): the option
// keys, a number, or words; null clears it. 'bad' for anything else.
export function answerFrom(raw: unknown): OnlineAnswer | null | 'bad' {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'bad';
  const o = raw as Record<string, unknown>;
  const fields = Object.keys(o);
  if (fields.length !== 1) return 'bad';
  if (fields[0] === 'keys') {
    const keys = o.keys;
    if (!Array.isArray(keys) || keys.length > OPTION_KEYS.length || !keys.every((k) => typeof k === 'string' && (OPTION_KEYS as readonly string[]).includes(k))) return 'bad';
    return keys.length ? { keys: keys as OptionKey[] } : null;
  }
  if (fields[0] === 'value') return typeof o.value === 'number' && Number.isFinite(o.value) && Math.abs(o.value) <= 1e12 ? { value: o.value } : 'bad';
  if (fields[0] === 'text') {
    if (typeof o.text !== 'string' || o.text.length > ONLINE_TEXT_MAX) return 'bad';
    return o.text.trim() ? { text: o.text } : null;
  }
  return 'bad';
}

export async function saveOnlineAnswer(
  claims: Claims,
  linkId: string,
  studentId: string,
  input: { attemptId: string; questionId: string; answer: OnlineAnswer | null; flagged: boolean; seq: number }
): Promise<FamilyOnlineSaveResult> {
  if (!isUuid(studentId) || !isUuid(input.attemptId) || !isUuid(input.questionId)) return 'not_found';
  return withGuardianContext(claims, linkId, async (db) => {
    const r = (
      await db.query(`select public.guardian_online_save($1, $2, $3, $4::jsonb, $5, $6) as r`, [
        input.attemptId,
        studentId,
        input.questionId,
        input.answer === null ? null : JSON.stringify(input.answer),
        input.flagged,
        input.seq,
      ])
    ).rows[0]?.r as FamilyOnlineSaveResult | undefined;
    return r ?? 'not_found';
  });
}

export async function submitOnlineTest(claims: Claims, linkId: string, studentId: string, attemptId: string): Promise<FamilyOnlineSubmitResult> {
  if (!isUuid(studentId) || !isUuid(attemptId)) return 'not_found';
  return withGuardianContext(claims, linkId, async (db) => ((await db.query(`select public.guardian_online_submit($1, $2) as r`, [attemptId, studentId])).rows[0]?.r ?? 'not_found') as FamilyOnlineSubmitResult);
}

export async function noteOnlineLeave(claims: Claims, linkId: string, studentId: string, attemptId: string): Promise<'noted' | 'closed' | 'not_found'> {
  if (!isUuid(studentId) || !isUuid(attemptId)) return 'not_found';
  return withGuardianContext(claims, linkId, async (db) => ((await db.query(`select public.guardian_online_left($1, $2) as r`, [attemptId, studentId])).rows[0]?.r ?? 'not_found') as 'noted' | 'closed' | 'not_found');
}
