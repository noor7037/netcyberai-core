import type { PoolClient } from 'pg';
import { AiUnavailableError } from '@/lib/ai/school-provider';
import { HOME_HELP, type AIProvider, type DraftRequest } from '@/lib/ai/provider';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { copilotState } from '@/lib/copilot/copilot';
import type { JobSpec } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';
import { queueWhatsAppMessage } from '@/lib/whatsapp/gate';
import { normalizePhone } from '@/lib/whatsapp/phone';

// Parent AI v1 (docs/25 slice 7n, C196): "What can I do at home?", for one child's guardian.
//
//   - The answer is put together from two things, and cites them: what that child's CLASS was taught in the last
//     seven days, and that CHILD'S OWN homework marked not done (and whether a follow-up is open for them).
//   - WHAT A LANGUAGE MODEL IS ASKED: only for a tip about the latest topic. The request carries the class level,
//     the subject and the topic: NO child, NO guardian, NO number, and nothing of any other child. The child's own
//     work is added by fixed rules inside the app and is never sent to a model (the open decision O6: no
//     student-linked text goes to a model until a consent purpose for it exists).
//   - Without a provider, or over the school's AI limit, the tip is a fixed sentence written here. The answer says
//     whether a model helped.
//   - NOTHING SENDS UNAPPROVED: a draft is read, edited if need be, and approved by the child's teacher or the
//     office; approving is what sends it, through the one gate. A child is named by first name only.

type Sql = Pick<PoolClient, 'query'>;
type Queue = { enqueue: (db: Sql, spec: JobSpec) => Promise<unknown> };
type Actor = { schoolId: string; userId: string; role: StaffRole };
export const PARENT_AI_ROLES: readonly string[] = ['principal', 'school_admin', 'teacher'];
export const MAX_ANSWER = 700;
const isoDay = (d: unknown) => (d instanceof Date ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : String(d).slice(0, 10));
const sayDay = (iso: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(`${iso}T00:00:00Z`));
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

export type Source = { kind: 'taught'; subject: string | null; topic: string; on: string } | { kind: 'homework'; subject: string; title: string; due: string } | { kind: 'followup' };
type Facts = { firstName: string; classLevel: string; sources: Source[] };

// Everything the answer may rest on, read for THIS child only: every query is keyed by the child's own id or by the
// child's own class.
export async function factsFor(db: Sql, schoolId: string, studentId: string, today: string = indiaDate()): Promise<Facts | null> {
  const child = (await db.query(`select s.name, s.class_id, c.grade, c.name as class_name from students s left join classes c on c.school_id = s.school_id and c.class_id = s.class_id where s.school_id = $1 and s.student_id = $2 and s.status = 'active'`, [schoolId, studentId])).rows[0];
  if (!child) return null;
  const taught = child.class_id
    ? (await db.query(
        `select pm.topic, sub.name as subject, pm.sent_on from pulse_messages pm left join subjects sub on sub.subject_id = pm.subject_id
          where pm.school_id = $1 and pm.class_id = $2 and pm.status in ('ready', 'sent') and coalesce(pm.exception_state, 'taught') <> 'not_taught' and pm.sent_on > $3::date - 7 and pm.sent_on <= $3::date
          order by pm.sent_on desc, pm.created_at desc limit 4`,
        [schoolId, child.class_id, today]
      )).rows
    : [];
  const homework = (await db.query(
    `select t.title, sub.name as subject, t.due_date from homework_status hs
       join homework_targets t on t.school_id = hs.school_id and t.target_id = hs.target_id join homework h on h.school_id = t.school_id and h.homework_id = t.homework_id join subjects sub on sub.subject_id = h.subject_id
      where hs.school_id = $1 and hs.student_id = $2 and hs.done = false and t.due_date > $3::date - 14 order by t.due_date desc limit 3`,
    [schoolId, studentId, today]
  )).rows;
  const followup = (await db.query(`select 1 from pulse_followups where school_id = $1 and student_id = $2 and status = 'open' and kind in ('did_not_understand', 'homework_help') limit 1`, [schoolId, studentId])).rows[0];
  return {
    firstName: firstName(child.name),
    classLevel: String(child.grade ?? '').trim() || (String(child.class_name ?? '').match(/\d+/)?.[0] ?? ''),
    sources: [
      ...taught.map((t): Source => ({ kind: 'taught', subject: t.subject ?? null, topic: t.topic, on: isoDay(t.sent_on) })),
      ...homework.map((h): Source => ({ kind: 'homework', subject: h.subject, title: h.title, due: isoDay(h.due_date) })),
      ...(followup ? [{ kind: 'followup' } as Source] : []),
    ],
  };
}

// What a model is asked, built from the latest topic alone. Exported so a test can hold that no person is in it.
export function tipRequest(facts: Facts): DraftRequest | null {
  const latest = facts.sources.find((s): s is Extract<Source, { kind: 'taught' }> => s.kind === 'taught');
  return latest ? { kind: HOME_HELP, classLevel: facts.classLevel, subject: latest.subject ?? 'General', chapter: latest.topic, topic: latest.topic } : null;
}

// The answer's words, from the facts and a tip. Fixed sentences; the child's own work is said here and nowhere else.
export function composeAnswer(facts: Facts, tip: string | null): string {
  const taught = facts.sources.filter((s): s is Extract<Source, { kind: 'taught' }> => s.kind === 'taught');
  const homework = facts.sources.filter((s): s is Extract<Source, { kind: 'homework' }> => s.kind === 'homework');
  const parts: string[] = [];
  if (taught.length) parts.push(`This week the class learned: ${taught.map((t) => (t.subject ? `${t.topic} (${t.subject})` : t.topic)).join('; ')}.`);
  if (taught.length) parts.push(tip ?? `Ask ${facts.firstName} to explain “${taught[0].topic}” to you in their own words for five minutes.`);
  if (homework.length) parts.push(`Homework still to finish: ${homework.map((h) => `${h.title} (${h.subject}, due ${sayDay(h.due)})`).join('; ')}.`);
  if (facts.sources.some((s) => s.kind === 'followup')) parts.push(`${facts.firstName}’s teacher will also give some extra help in class.`);
  return oneLine(parts.join(' ')).slice(0, MAX_ANSWER);
}

export type DraftResult = { ok: true; answerId: string; body: string; sources: Source[]; aiAssisted: boolean } | { ok: false; reason: 'not_allowed' | 'child' | 'guardian' | 'nothing_to_go_on' };

export async function draftAnswer(db: PoolClient, provider: AIProvider | null, actor: Actor, input: { studentId: string; parentId: string }, today: string = indiaDate()): Promise<DraftResult> {
  if (!PARENT_AI_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  // The child and the guardian as this person's own session sees them: a teacher, only their own classes'.
  if (!(await db.query(`select 1 from parent_student_map where school_id = $1 and student_id = $2 and parent_id = $3`, [actor.schoolId, input.studentId, input.parentId])).rows[0]) return { ok: false, reason: 'guardian' };
  const facts = await factsFor(db, actor.schoolId, input.studentId, today);
  if (!facts) return { ok: false, reason: 'child' };
  // Nothing taught on record and no homework of the child's: there is nothing true to say, so nothing is drafted.
  if (!facts.sources.some((s) => s.kind !== 'followup')) return { ok: false, reason: 'nothing_to_go_on' };
  let tip: string | null = null;
  const request = tipRequest(facts);
  const state = request ? await copilotState(db, actor.schoolId, provider) : null;
  if (request && provider && state?.on && state.used < state.limit) {
    // The AI platform may refuse (switched off, no key, a provider down): the fixed sentence is used, and nothing counted.
    const answer = await provider.draft(request).catch((err) => {
      if (err instanceof AiUnavailableError) return null;
      throw err;
    });
    if (answer) {
      await db.query(`insert into ai_usage (school_id, user_id, kind, tokens_in, tokens_out) values ($1, $2, $3, $4, $5)`, [actor.schoolId, actor.userId, HOME_HELP, Math.max(0, Math.round(answer.tokensIn)), Math.max(0, Math.round(answer.tokensOut))]);
      tip = oneLine(answer.text).slice(0, 300) || null;
    }
  }
  const body = composeAnswer(facts, tip);
  const answerId = (await db.query(`insert into parent_ai_answers (school_id, student_id, parent_id, body, sources, ai_assisted, drafted_by) values ($1, $2, $3, $4, $5::jsonb, $6, $7) returning answer_id`, [actor.schoolId, input.studentId, input.parentId, body, JSON.stringify(facts.sources), tip !== null, actor.userId])).rows[0].answer_id as string;
  return { ok: true, answerId, body, sources: facts.sources, aiAssisted: tip !== null };
}

export type ApproveResult = { ok: true; status: 'queued' | 'held' } | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_a_draft' | 'words' | 'no_number' };

// A person has read it. Their words (edited or not) are what goes; approving is what sends it.
export async function approveAnswer(db: PoolClient, queue: Queue, actor: Actor, answerId: string, words: string): Promise<ApproveResult> {
  if (!PARENT_AI_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const body = oneLine(words);
  if (!body || body.length > MAX_ANSWER) return { ok: false, reason: 'words' };
  const a = (await db.query(`select a.student_id, a.parent_id, a.status, s.name as child, p.phone from parent_ai_answers a join students s on s.student_id = a.student_id join parents p on p.parent_id = a.parent_id where a.school_id = $1 and a.answer_id = $2 for update of a`, [actor.schoolId, answerId])).rows[0];
  if (!a) return { ok: false, reason: 'not_found' };
  if (a.status !== 'draft') return { ok: false, reason: 'not_a_draft' };
  const phone = normalizePhone(String(a.phone ?? ''));
  if (!phone) return { ok: false, reason: 'no_number' };
  await db.query(`update parent_ai_answers set body = $3, status = 'sent', approved_by = $4, approved_at = now() where school_id = $1 and answer_id = $2`, [actor.schoolId, answerId, body, actor.userId]);
  const r = await queueWhatsAppMessage(db, queue, { schoolId: actor.schoolId, studentId: a.student_id, parentId: a.parent_id, purpose: 'operational_communication', toPhone: phone, templateName: 'home_help', templateParams: { child: firstName(a.child), answer: body }, dedupeKey: `parent-ai:${answerId}` });
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'parent_ai.approved_and_sent', targetType: 'parent_ai_answers', targetId: answerId, beforeState: { status: 'draft' }, afterState: { status: 'sent', message: r.status } });
  return { ok: true, status: r.status === 'queued' ? 'queued' : 'held' };
}

export async function discardAnswer(db: PoolClient, actor: Actor, answerId: string): Promise<{ ok: true } | { ok: false; reason: 'not_allowed' | 'not_found' }> {
  if (!PARENT_AI_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const done = await db.query(`update parent_ai_answers set status = 'discarded' where school_id = $1 and answer_id = $2 and status = 'draft'`, [actor.schoolId, answerId]);
  return done.rowCount === 1 ? { ok: true } : { ok: false, reason: 'not_found' };
}

export type AnswerRow = { answer_id: string; child: string; guardian: string; body: string; sources: Source[]; ai_assisted: boolean; status: 'draft' | 'sent' | 'discarded'; drafted_by: string | null; drafted_at: string; approved_by: string | null; message: string | null };
// Row level security decides which answers a teacher gets: those for children of their own classes.
// `only: 'draft'` (docs/26 slice 8d, C203): the drafts no person has yet approved or discarded, the oldest first.
// It is what /app/parent-ai?show=drafts lists and what the dashboard's number counts.
export const ANSWER_ROWS_MAX = 500;
export async function listAnswers(db: PoolClient, schoolId: string, only?: 'draft'): Promise<AnswerRow[]> {
  const { rows } = await db.query(
    `select a.answer_id, s.name as child, p.name as guardian, a.body, a.sources, a.ai_assisted, a.status, d.display_name as drafted_by, a.drafted_at, ap.display_name as approved_by,
            (select l.status::text from communication_log l where l.school_id = a.school_id and l.dedupe_key = 'parent-ai:' || a.answer_id) as message
       from parent_ai_answers a join students s on s.student_id = a.student_id join parents p on p.parent_id = a.parent_id left join users d on d.user_id = a.drafted_by left join users ap on ap.user_id = a.approved_by
      where a.school_id = $1 and ${only === 'draft' ? `a.status = 'draft' order by a.drafted_at, a.answer_id limit ${ANSWER_ROWS_MAX}` : `a.status <> 'discarded' order by (a.status = 'draft') desc, a.drafted_at desc limit 50`}`,
    [schoolId]
  );
  return rows.map((r) => ({ ...r, drafted_at: new Date(r.drafted_at).toISOString() })) as AnswerRow[];
}
