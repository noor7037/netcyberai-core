import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { DRAFT_KINDS, type AIProvider, type DraftKind, type DraftRequest } from '@/lib/ai/provider';
import { loadEntitlements } from '@/lib/frameworks/entitlements';

// Teacher Copilot v1 (docs/20 5h, C154). Drafts a lesson plan, a worksheet
// or the day's message from the syllabus map. The teacher reads, changes
// and approves; nothing is kept or used until then. Each draft is metered
// per school against a monthly limit the founder sets.
//
// What reaches the model: the class level, the subject, the chapter and the
// topic. Nothing about a student, a guardian or a teacher.

const STAFF: readonly string[] = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];
export const LIMIT_KEY = 'monthly_tokens';
export const MAX_NOTE_BODY = 8000;
type Actor = { schoolId: string; userId: string; role: StaffRole };

export type CopilotState = { on: true; limit: number; used: number } | { on: false; why: 'module_off' | 'no_limit' | 'no_provider' };

// Copilot answers for a school only when all three are true: the module is
// switched on for it, the founder has set its monthly limit, and a provider
// is configured. Until then it is off, and says which is missing.
export async function copilotState(db: PoolClient, schoolId: string, provider: AIProvider | null): Promise<CopilotState> {
  const module = (await loadEntitlements(db, schoolId)).modules['teacher-copilot'];
  if (!module?.enabled) return { on: false, why: 'module_off' };
  const limit = module.limits?.[LIMIT_KEY];
  if (typeof limit !== 'number' || !(limit > 0)) return { on: false, why: 'no_limit' };
  if (!provider) return { on: false, why: 'no_provider' };
  return { on: true, limit, used: await usedThisMonth(db, schoolId) };
}

// Tokens used by the school since the first of this month in India.
export async function usedThisMonth(db: PoolClient, schoolId: string): Promise<number> {
  const { rows } = await db.query(
    `select coalesce(sum(tokens_in + tokens_out), 0)::int as used from ai_usage
      where school_id = $1 and created_at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'`,
    [schoolId]
  );
  return rows[0].used as number;
}

export type DraftInput = { kind: DraftKind; classId: string; subjectId: string; unitId: string; minutes?: number; questions?: number };
export type DraftResult =
  | { ok: true; text: string; request: DraftRequest; used: number; limit: number }
  | { ok: false; reason: 'not_allowed' | 'off' | 'over_limit' | 'unknown_topic'; why?: string };

// Builds the request from the school's own syllabus map (never from text
// the person typed), asks the provider, and records what it cost. The draft
// itself is returned and not stored.
export async function draft(db: PoolClient, provider: AIProvider | null, actor: Actor, input: DraftInput): Promise<DraftResult> {
  if (!STAFF.includes(actor.role) || !DRAFT_KINDS.includes(input.kind)) return { ok: false, reason: 'not_allowed' };
  const state = await copilotState(db, actor.schoolId, provider);
  if (!state.on) return { ok: false, reason: 'off', why: state.why };
  if (state.used >= state.limit) return { ok: false, reason: 'over_limit' };
  // RLS: a teacher finds only the map of their own classes.
  const topic = (await db.query(
    `select c.grade, c.name as class_name, s.name as subject, u.chapter, u.topic
       from syllabus_units u
       join classes c on c.school_id = u.school_id and c.class_id = u.class_id
       join subjects s on s.school_id = u.school_id and s.subject_id = u.subject_id
      where u.school_id = $1 and u.unit_id = $2 and u.class_id = $3 and u.subject_id = $4`,
    [actor.schoolId, input.unitId, input.classId, input.subjectId]
  )).rows[0];
  if (!topic) return { ok: false, reason: 'unknown_topic' };
  const within = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
  const request: DraftRequest = {
    kind: input.kind,
    // The grade if the school recorded one; otherwise the leading number of the class's name. Never the section.
    classLevel: String(topic.grade ?? '').trim() || (String(topic.class_name).match(/\d+/)?.[0] ?? ''),
    subject: topic.subject,
    chapter: topic.chapter,
    topic: topic.topic,
    ...(input.kind === 'lesson_plan' ? { minutes: within(input.minutes, 20, 90) ?? 40 } : {}),
    ...(input.kind === 'worksheet' ? { questions: within(input.questions, 3, 20) ?? 5 } : {}),
  };
  const answer = await provider!.draft(request);
  await db.query(`insert into ai_usage (school_id, user_id, kind, tokens_in, tokens_out) values ($1, $2, $3, $4, $5)`, [actor.schoolId, actor.userId, input.kind, Math.max(0, Math.round(answer.tokensIn)), Math.max(0, Math.round(answer.tokensOut))]);
  return { ok: true, text: answer.text.slice(0, MAX_NOTE_BODY), request, used: state.used + answer.tokensIn + answer.tokensOut, limit: state.limit };
}

export type Note = { note_id: string; class_name: string; subject_name: string; kind: 'lesson_plan' | 'worksheet'; title: string; body: string; ai_assisted: boolean; approved_at: string };
export async function listNotes(db: PoolClient, schoolId: string): Promise<Note[]> {
  return (await db.query(
    `select n.note_id, c.name as class_name, s.name as subject_name, n.kind, n.title, n.body, n.ai_assisted, n.approved_at
       from teaching_notes n
       join classes c on c.school_id = n.school_id and c.class_id = n.class_id
       join subjects s on s.school_id = n.school_id and s.subject_id = n.subject_id
      where n.school_id = $1 order by n.approved_at desc limit 30`,
    [schoolId]
  )).rows;
}

export type ApproveResult = { ok: true; noteId: string } | { ok: false; reason: 'not_allowed' | 'unknown_topic' | 'empty' | 'too_long' };

// The teacher's approval is what saves a lesson plan or worksheet: the words
// kept are the ones the teacher approved, under their name.
export async function approveNote(db: PoolClient, actor: Actor, input: { kind: 'lesson_plan' | 'worksheet'; classId: string; subjectId: string; unitId: string; body: string }): Promise<ApproveResult> {
  if (!STAFF.includes(actor.role) || !['lesson_plan', 'worksheet'].includes(input.kind)) return { ok: false, reason: 'not_allowed' };
  const body = input.body.trim();
  if (!body) return { ok: false, reason: 'empty' };
  if (body.length > MAX_NOTE_BODY) return { ok: false, reason: 'too_long' };
  const unit = (await db.query(`select chapter, topic from syllabus_units where school_id = $1 and unit_id = $2 and class_id = $3 and subject_id = $4`, [actor.schoolId, input.unitId, input.classId, input.subjectId])).rows[0];
  if (!unit) return { ok: false, reason: 'unknown_topic' };
  const title = (unit.chapter === unit.topic ? unit.topic : `${unit.chapter}: ${unit.topic}`).slice(0, 200);
  const made = await db.query(
    `insert into teaching_notes (school_id, class_id, subject_id, unit_id, kind, title, body, ai_assisted, approved_by) values ($1, $2, $3, $4, $5, $6, $7, true, $8) returning note_id`,
    [actor.schoolId, input.classId, input.subjectId, input.unitId, input.kind, title, body, actor.userId]
  );
  const noteId = made.rows[0].note_id as string;
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'copilot.approved', targetType: 'teaching_notes', targetId: noteId, beforeState: undefined, afterState: { kind: input.kind, unitId: input.unitId, aiAssisted: true } });
  return { ok: true, noteId };
}
