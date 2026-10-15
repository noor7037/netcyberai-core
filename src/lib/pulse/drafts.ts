import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { MAX_PULSE_BODY, pulseBodies, type PulseBodies } from './text';
import { classOrderSql } from '@/lib/classes/class-order';

// The day's Pulse drafts (docs/20 5f, C151). A draft is prepared by one tap
// "taught today" (src/lib/academics/taught.ts) and holds the lesson and the
// homework set that day for the same class and subject. A person may change
// the words and mark it ready. Nothing in this file sends anything: a
// ready message is sent by a person, in src/lib/pulse/send.ts (C189).
//
// RLS: a teacher reads and writes only their own classes' messages.

type Actor = { schoolId: string; userId: string; role: StaffRole };
const STAFF: readonly string[] = ['principal', 'school_admin', 'teacher'];

export type Draft = {
  pulse_id: string;
  class_id: string;
  class_name: string;
  subject_id: string | null;
  subject_name: string | null;
  topic: string;
  exception_state: string | null;
  sent_on: string;
  status: 'draft' | 'ready' | 'sent';
  edited: boolean;
  body_en: string;
  body_hi: string;
  body_hinglish: string;
  // Once sent (C189): how many messages went into the queue or were held, and what parents answered.
  queued: number;
  held: number;
  understood: number;
  needs_help: number;
};

const SELECT = `select m.pulse_id, m.class_id, c.name as class_name, m.subject_id, s.name as subject_name, m.topic, m.exception_state, m.sent_on::text as sent_on, m.status, m.edited, m.body_en, m.body_hi, m.body_hinglish,
         (select count(*)::int from communication_log l where l.school_id = m.school_id and l.dedupe_key like 'pulse:' || m.pulse_id || ':%' and l.status::text not like 'blocked_%' and l.status::text <> 'failed') as queued,
         (select count(*)::int from communication_log l where l.school_id = m.school_id and l.dedupe_key like 'pulse:' || m.pulse_id || ':%' and (l.status::text like 'blocked_%' or l.status::text = 'failed')) as held,
         (select count(*)::int from pulse_response_log r where r.school_id = m.school_id and r.pulse_id = m.pulse_id and r.tier = 1) as understood,
         (select count(*)::int from pulse_response_log r where r.school_id = m.school_id and r.pulse_id = m.pulse_id and r.tier = 2) as needs_help
    from pulse_messages m
    join classes c on c.school_id = m.school_id and c.class_id = m.class_id
    left join subjects s on s.school_id = m.school_id and s.subject_id = m.subject_id`;

export async function listDrafts(db: PoolClient, schoolId: string, date: string): Promise<Draft[]> {
  return (await db.query(`${SELECT} where m.school_id = $1 and m.sent_on = $2 order by ${classOrderSql('c')}, s.name`, [schoolId, date])).rows;
}

// The messages a person sent for the lessons of from..to (docs/26 slice 8d, C203): what the Daily Pulse screen
// lists on /app/pulse?show=sent&from=…&to=…, each with how many went out and what parents answered.
export const SENT_ROWS_MAX = 1000;
export async function listSent(db: PoolClient, schoolId: string, from: string, to: string, limit: number = SENT_ROWS_MAX): Promise<Draft[]> {
  return (await db.query(`${SELECT} where m.school_id = $1 and m.status = 'sent' and m.sent_on between $2::date and $3::date order by m.sent_on desc, ${classOrderSql('c')}, s.name, m.pulse_id limit $4`, [schoolId, from, to, limit])).rows;
}
// The same messages, added up (never cut short): how many were sent, how many went out to parents or were held,
// and what parents answered. One query shape with the list, so a total and its rows cannot differ.
export type SentTotals = { sent: number; queued: number; held: number; understood: number; needs_help: number };
// What is added up, and of which messages: written once, for the school's totals and for the same totals a class
// at a time, so the classes cannot add up to anything but the school's numbers.
const SENT_SUMS = `count(*) as sent, coalesce(sum(x.queued), 0) as queued, coalesce(sum(x.held), 0) as held, coalesce(sum(x.understood), 0) as understood, coalesce(sum(x.needs_help), 0) as needs_help`;
const SENT_IN = `from (${SELECT} where m.school_id = $1 and m.status = 'sent' and m.sent_on between $2::date and $3::date) x`;
const sentSums = (r: Record<string, unknown>): SentTotals => ({ sent: Number(r.sent), queued: Number(r.queued), held: Number(r.held), understood: Number(r.understood), needs_help: Number(r.needs_help) });
export async function sentTotals(db: PoolClient, schoolId: string, from: string, to: string): Promise<SentTotals> {
  return sentSums((await db.query(`select ${SENT_SUMS} ${SENT_IN}`, [schoolId, from, to])).rows[0]);
}
// The same totals, a class at a time (docs/26 slice 8h, C207): the rows of the Daily Pulse coverage report,
// counted in the database, so a busy year is never cut short. A class with no message sent for the days has no row.
export async function sentTotalsByClass(db: PoolClient, schoolId: string, from: string, to: string): Promise<(SentTotals & { class_id: string })[]> {
  const { rows } = await db.query(`select x.class_id, ${SENT_SUMS} ${SENT_IN} group by x.class_id order by x.class_id`, [schoolId, from, to]);
  return rows.map((r) => ({ class_id: r.class_id as string, ...sentSums(r) }));
}

// The words for one lesson, from the classwork log row and the homework
// given that day to the same class in the same subject.
async function wordsFor(db: PoolClient, schoolId: string, progressId: string): Promise<{ bodies: PulseBodies | null; classId: string; subjectId: string; date: string; topic: string; status: string } | null> {
  const log = (await db.query(
    `select p.class_id, p.subject_id, p.date::text as date, p.topic, p.status, c.name as class_name, s.name as subject_name
       from syllabus_progress p
       join classes c on c.school_id = p.school_id and c.class_id = p.class_id
       join subjects s on s.school_id = p.school_id and s.subject_id = p.subject_id
      where p.school_id = $1 and p.progress_id = $2`,
    [schoolId, progressId]
  )).rows[0];
  if (!log) return null;
  const homework = (await db.query(
    `select t.title, t.due_date::text as due_date
       from homework_targets t join homework h on h.school_id = t.school_id and h.homework_id = t.homework_id
      where t.school_id = $1 and t.class_id = $2 and h.subject_id = $3 and (t.assigned_at at time zone 'Asia/Kolkata')::date = $4::date
      order by t.assigned_at`,
    [schoolId, log.class_id, log.subject_id, log.date]
  )).rows as { title: string; due_date: string }[];
  return { bodies: pulseBodies({ className: log.class_name, subjectName: log.subject_name, topic: log.topic, status: log.status, homework: homework.map((h) => ({ title: h.title, dueDate: h.due_date })) }), classId: log.class_id, subjectId: log.subject_id, date: log.date, topic: log.topic, status: log.status };
}

// After a tap "taught today": the lesson's one draft follows the log. A
// lesson not taught has no draft. A message already sent is history.
export async function prepareDraft(db: PoolClient, actor: { schoolId: string; userId: string }, progressId: string): Promise<string | null> {
  const words = await wordsFor(db, actor.schoolId, progressId);
  if (!words) return null;
  if (!words.bodies) {
    await db.query(`delete from pulse_messages where school_id = $1 and source_progress_id = $2 and status <> 'sent'`, [actor.schoolId, progressId]);
    return null;
  }
  const saved = await db.query(
    `insert into pulse_messages (school_id, class_id, subject_id, topic, exception_state, sent_on, status, created_by, source_progress_id, body_en, body_hi, body_hinglish, edited)
     values ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9, $10, $11, false)
     on conflict on constraint pulse_messages_one_per_log_row
     do update set topic = excluded.topic, exception_state = excluded.exception_state, status = 'draft', body_en = excluded.body_en, body_hi = excluded.body_hi, body_hinglish = excluded.body_hinglish, edited = false
       where pulse_messages.status <> 'sent'
     returning pulse_id`,
    [actor.schoolId, words.classId, words.subjectId, words.topic, words.status, words.date, actor.userId, progressId, words.bodies.en, words.bodies.hi, words.bodies.hinglish]
  );
  return (saved.rows[0]?.pulse_id ?? (await db.query(`select pulse_id from pulse_messages where school_id = $1 and source_progress_id = $2`, [actor.schoolId, progressId])).rows[0]?.pulse_id ?? null) as string | null;
}

// After homework is set or changed: the day's drafts for those classes take
// it in. Words a person has changed are left alone, and so is anything ready
// or sent.
export async function refreshDraftsForHomework(db: PoolClient, schoolId: string, subjectId: string, classIds: readonly string[], date: string): Promise<number> {
  const drafts = (await db.query(`select pulse_id, source_progress_id from pulse_messages where school_id = $1 and subject_id = $2 and class_id = any($3::uuid[]) and sent_on = $4 and status = 'draft' and not edited and source_progress_id is not null`, [schoolId, subjectId, classIds, date])).rows as { pulse_id: string; source_progress_id: string }[];
  let changed = 0;
  for (const d of drafts) {
    const words = await wordsFor(db, schoolId, d.source_progress_id);
    if (!words?.bodies) continue;
    await db.query(`update pulse_messages set body_en = $3, body_hi = $4, body_hinglish = $5 where school_id = $1 and pulse_id = $2 and status = 'draft' and not edited`, [schoolId, d.pulse_id, words.bodies.en, words.bodies.hi, words.bodies.hinglish]);
    changed += 1;
  }
  return changed;
}

export type DraftChange = { bodies?: Partial<PulseBodies>; status?: 'draft' | 'ready' };
export type ChangeResult = { ok: true; draft: Draft } | { ok: false; reason: 'not_allowed' | 'not_found' | 'already_sent' | 'words_missing' | 'too_long' };

// Change the words, mark ready, or take back to draft. Never sends.
export async function changeDraft(db: PoolClient, actor: Actor, pulseId: string, change: DraftChange): Promise<ChangeResult> {
  if (!STAFF.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const before = (await db.query(`select status, body_en, body_hi, body_hinglish, edited from pulse_messages where school_id = $1 and pulse_id = $2 for update`, [actor.schoolId, pulseId])).rows[0];
  if (!before) return { ok: false, reason: 'not_found' };
  if (before.status === 'sent') return { ok: false, reason: 'already_sent' };
  const next = {
    en: (change.bodies?.en ?? before.body_en).trim(),
    hi: (change.bodies?.hi ?? before.body_hi).trim(),
    hinglish: (change.bodies?.hinglish ?? before.body_hinglish).trim(),
  };
  if (Object.values(next).some((b) => b.length > MAX_PULSE_BODY)) return { ok: false, reason: 'too_long' };
  const wordsChanged = next.en !== before.body_en || next.hi !== before.body_hi || next.hinglish !== before.body_hinglish;
  // Changing the words of a ready message takes it back to draft unless it is marked ready again in the same step.
  // Only draft or ready can be asked for; nothing here can mark a message sent.
  const wanted = change.status === 'ready' || change.status === 'draft' ? change.status : undefined;
  const status = wanted ?? (wordsChanged ? 'draft' : before.status);
  if (status === 'ready' && Object.values(next).some((b) => !b)) return { ok: false, reason: 'words_missing' };
  // Nothing asked for that is not already so: nothing is written or logged.
  if (!wordsChanged && status === before.status) return { ok: true, draft: (await db.query(`${SELECT} where m.school_id = $1 and m.pulse_id = $2`, [actor.schoolId, pulseId])).rows[0] };
  await db.query(`update pulse_messages set body_en = $3, body_hi = $4, body_hinglish = $5, status = $6, edited = $7 where school_id = $1 and pulse_id = $2`, [actor.schoolId, pulseId, next.en, next.hi, next.hinglish, status, before.edited || wordsChanged]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: status !== before.status ? `pulse.${status}` : 'pulse.edited', targetType: 'pulse_messages', targetId: pulseId, beforeState: { status: before.status }, afterState: { status, wordsChanged } });
  return { ok: true, draft: (await db.query(`${SELECT} where m.school_id = $1 and m.pulse_id = $2`, [actor.schoolId, pulseId])).rows[0] };
}
