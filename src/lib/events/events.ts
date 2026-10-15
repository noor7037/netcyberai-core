import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { PermanentJobError, type JobHandler, type JobSpec } from '@/lib/jobs/types';
import { sayDate, sayTime } from '@/lib/ptm/ptm';
import { indiaDate, isIsoDate } from '@/lib/time/india';
import { queueWhatsAppMessage } from '@/lib/whatsapp/gate';
import { normalizePhone, writtenForms } from '@/lib/whatsapp/phone';
import { classOrderSql } from '@/lib/classes/class-order';

// School events (docs/25 slice 7l, C194).
//
//   - The office makes an event: a date, what it is, and the classes it is for (or every class). A draft sends nothing.
//   - Inviting sends it to the guardians of the INVITED CLASSES ONLY, once to each number, through the one gate.
//   - A parent answers YES or NO by reply; the latest answer is kept and the answers are counted.
//   - The day before, everyone invited who did not say NO is reminded.
//   - A CANCELLED EVENT TELLS THOSE INVITED: everyone whose invitation went, whatever they answered.

type Sql = Pick<PoolClient, 'query'>;
type Queue = { enqueue: (db: Sql, spec: JobSpec) => Promise<unknown> };
type Actor = { schoolId: string; userId: string; role: StaffRole };
const OFFICE: readonly string[] = ['principal', 'school_admin'];
export const EVENT_ROLES: readonly string[] = ['principal', 'school_admin', 'teacher'];
export const EVENT_REMIND_JOB = 'event.remind';
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const isoDay = (d: unknown) => (d instanceof Date ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : String(d).slice(0, 10));
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
const when = (heldOn: string, startsAt: unknown) => (startsAt ? `${sayDate(heldOn)} at ${sayTime(String(startsAt).slice(0, 5))}` : sayDate(heldOn));

export type EventAnswer = 'yes' | 'no';
export function eventAnswer(text: string): EventAnswer | null {
  const t = text.trim().toLowerCase().replace(/[.!।]+$/, '');
  if (['yes', 'y', 'haan', 'han', 'ha', 'हाँ', 'हां', 'जी हाँ', 'will come', 'coming'].includes(t)) return 'yes';
  if (['no', 'n', 'nahi', 'nahin', 'नहीं', 'cannot come', 'not coming'].includes(t)) return 'no';
  return null;
}

export type EventInput = { title: string; heldOn: string; startsAt: string | null; details: string; classIds: string[] };
export type CreateResult = { ok: true; eventId: string } | { ok: false; reason: 'not_allowed' | 'title' | 'date' | 'time' | 'details' | 'classes' };

export async function createEvent(db: PoolClient, actor: Actor, input: EventInput, today: string = indiaDate()): Promise<CreateResult> {
  if (!OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const title = oneLine(input.title);
  const details = oneLine(input.details);
  if (!title || title.length > 120) return { ok: false, reason: 'title' };
  if (!isIsoDate(input.heldOn) || input.heldOn < today) return { ok: false, reason: 'date' };
  if (input.startsAt !== null && !TIME.test(input.startsAt)) return { ok: false, reason: 'time' };
  if (!details || details.length > 300) return { ok: false, reason: 'details' };
  const ids = [...new Set(input.classIds)];
  if (ids.length && Number((await db.query(`select count(*)::int as n from classes where school_id = $1 and class_id = any($2::uuid[])`, [actor.schoolId, ids])).rows[0].n) !== ids.length) return { ok: false, reason: 'classes' };
  const eventId = (await db.query(`insert into school_events (school_id, title, held_on, starts_at, details, class_ids, created_by) values ($1, $2, $3, $4, $5, $6::uuid[], $7) returning event_id`, [actor.schoolId, title, input.heldOn, input.startsAt, details, ids, actor.userId])).rows[0].event_id as string;
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'event.created', targetType: 'school_events', targetId: eventId, beforeState: undefined, afterState: { heldOn: input.heldOn, classes: ids.length || 'all' } });
  return { ok: true, eventId };
}

export type InviteResult = { ok: true; queued: number; held: number; withoutNumber: number } | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_draft' | 'past' | 'nobody' };

export async function inviteEvent(db: PoolClient, queue: Queue, actor: Actor, eventId: string, now: Date = new Date()): Promise<InviteResult> {
  if (!OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const e = (await db.query(`select title, held_on, starts_at, details, class_ids, status from school_events where school_id = $1 and event_id = $2 for update`, [actor.schoolId, eventId])).rows[0];
  if (!e) return { ok: false, reason: 'not_found' };
  if (e.status !== 'draft') return { ok: false, reason: 'not_draft' };
  const heldOn = isoDay(e.held_on);
  if (heldOn < indiaDate(now)) return { ok: false, reason: 'past' };
  // The guardians of the active children of the invited classes, and of no other class.
  const guardians = (await db.query(
    `select s.student_id, p.parent_id, p.phone
       from students s join parent_student_map m on m.school_id = s.school_id and m.student_id = s.student_id
       join parents p on p.school_id = m.school_id and p.parent_id = m.parent_id and p.merged_into is null
      where s.school_id = $1 and s.status = 'active' and (cardinality($2::uuid[]) = 0 or s.class_id = any($2::uuid[])) order by s.name, s.student_id, p.created_at, p.parent_id`,
    [actor.schoolId, e.class_ids]
  )).rows as { student_id: string; parent_id: string; phone: string | null }[];
  const out = { queued: 0, held: 0, withoutNumber: 0 };
  const told = new Set<string>();
  for (const g of guardians) {
    const phone = normalizePhone(String(g.phone ?? ''));
    if (!phone) {
      out.withoutNumber += 1;
      continue;
    }
    if (told.has(phone)) continue;
    told.add(phone);
    const r = await queueWhatsAppMessage(db, queue, { schoolId: actor.schoolId, studentId: g.student_id, parentId: g.parent_id, purpose: 'operational_communication', toPhone: phone, templateName: 'event_invitation', templateParams: { title: e.title, when: when(heldOn, e.starts_at), details: e.details }, dedupeKey: `event:${eventId}:inv:${phone}` });
    if (r.status === 'queued') out.queued += 1;
    else out.held += 1;
  }
  if (out.queued + out.held === 0) return { ok: false, reason: 'nobody' };
  await db.query(`update school_events set status = 'invited', invited_by = $3, invited_at = $4 where school_id = $1 and event_id = $2`, [actor.schoolId, eventId, actor.userId, now]);
  const remindAt = new Date(new Date(`${heldOn}T17:00:00+05:30`).getTime() - 24 * 3600_000);
  await queue.enqueue(db, { type: EVENT_REMIND_JOB, payload: { eventId }, idempotencyKey: `event.remind:${eventId}`, schoolId: actor.schoolId, runAt: remindAt > now ? remindAt : now });
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'event.invited', targetType: 'school_events', targetId: eventId, beforeState: { status: 'draft' }, afterState: { status: 'invited', ...out } });
  return { ok: true, ...out };
}

type Invited = { phone: string; parent_id: string; student_id: string };
// Those invited: every number an invitation went to (queued, sent, delivered or read), not those it was held back from.
async function invited(db: Sql, schoolId: string, eventId: string): Promise<Invited[]> {
  return (await db.query(
    `select l.to_phone as phone, l.parent_id, l.student_id from communication_log l
      where l.school_id = $1 and l.dedupe_key like $2 and l.status::text in ('queued', 'uncertain', 'sent', 'delivered', 'read') and l.parent_id is not null and l.student_id is not null order by l.created_at, l.log_id`,
    [schoolId, `event:${eventId}:inv:%`]
  )).rows;
}

export type CancelResult = { ok: true; told: number } | { ok: false; reason: 'not_allowed' | 'not_found' | 'already_cancelled' };
export async function cancelEvent(db: PoolClient, queue: Queue, actor: Actor, eventId: string): Promise<CancelResult> {
  if (!OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const e = (await db.query(`select title, held_on, starts_at, status from school_events where school_id = $1 and event_id = $2 for update`, [actor.schoolId, eventId])).rows[0];
  if (!e) return { ok: false, reason: 'not_found' };
  if (e.status === 'cancelled') return { ok: false, reason: 'already_cancelled' };
  await db.query(`update school_events set status = 'cancelled', cancelled_by = $3, cancelled_at = now() where school_id = $1 and event_id = $2`, [actor.schoolId, eventId, actor.userId]);
  let told = 0;
  for (const g of e.status === 'invited' ? await invited(db, actor.schoolId, eventId) : []) {
    const r = await queueWhatsAppMessage(db, queue, { schoolId: actor.schoolId, studentId: g.student_id, parentId: g.parent_id, purpose: 'operational_communication', toPhone: g.phone, templateName: 'event_cancelled', templateParams: { title: e.title, when: when(isoDay(e.held_on), e.starts_at) }, dedupeKey: `event:${eventId}:cancelled:${g.phone}` });
    if (r.status === 'queued') told += 1;
  }
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'event.cancelled', targetType: 'school_events', targetId: eventId, beforeState: { status: e.status }, afterState: { status: 'cancelled', told } });
  return { ok: true, told };
}

export type EventRow = { event_id: string; title: string; held_on: string; starts_at: string | null; details: string; status: 'draft' | 'invited' | 'cancelled'; classes: string | null; invited: number; yes: number; no: number };
// Row level security decides which events a teacher gets, and which answers are counted for them.
// `comingFrom` (India's date; docs/26 slice 8d, C203): only the events dated that day or later that are not
// cancelled, the nearest first. It is what /app/events?show=coming lists and what the dashboard's number counts.
export const EVENT_ROWS_MAX = 500;
export async function listEvents(db: PoolClient, schoolId: string, comingFrom?: string): Promise<EventRow[]> {
  const which = comingFrom
    ? `where e.school_id = $1 and e.status <> 'cancelled' and e.held_on >= $2::date order by e.held_on, e.created_at, e.event_id limit ${EVENT_ROWS_MAX}`
    : `where e.school_id = $1 order by e.held_on desc, e.created_at desc limit 50`;
  const { rows } = await db.query(
    `select e.event_id, e.title, e.held_on, e.starts_at, e.details, e.status,
            case when cardinality(e.class_ids) = 0 then null else (select string_agg(c.name, ', ' order by ${classOrderSql('c')}) from classes c where c.school_id = e.school_id and c.class_id = any(e.class_ids)) end as classes,
            (select count(*)::int from communication_log l where l.school_id = e.school_id and l.dedupe_key like 'event:' || e.event_id || ':inv:%' and l.status::text in ('queued', 'uncertain', 'sent', 'delivered', 'read')) as invited,
            (select count(*)::int from event_replies r where r.event_id = e.event_id and r.answer = 'yes') as yes,
            (select count(*)::int from event_replies r where r.event_id = e.event_id and r.answer = 'no') as no
       from school_events e ${which}`,
    comingFrom ? [schoolId, comingFrom] : [schoolId]
  );
  return rows.map((r) => ({ ...r, held_on: isoDay(r.held_on), starts_at: r.starts_at ? String(r.starts_at).slice(0, 5) : null }));
}

async function eventsAreOn(db: Sql, schoolId: string): Promise<boolean> {
  return (await db.query(`select enabled from school_module_entitlements where school_id = $1 and module_id = 'events'`, [schoolId])).rows[0]?.enabled === true;
}

export type EventReply = { recorded: false } | { recorded: true; eventId: string; answer: EventAnswer };
// A parent's YES or NO. As the platform role, in the webhook's transaction. It is an answer only when it is plain
// which event it is about: the number was invited to exactly ONE event that is still to come.
export async function noteEventReply(db: Sql, r: { schoolId: string; phone: string; text: string; at: string }): Promise<EventReply> {
  const answer = eventAnswer(r.text);
  if (!answer || !(await eventsAreOn(db, r.schoolId))) return { recorded: false };
  const open = (await db.query(
    `select distinct e.event_id, l.parent_id from communication_log l join school_events e on e.school_id = l.school_id and l.dedupe_key like 'event:' || e.event_id || ':inv:%'
      where l.school_id = $1 and l.template_name = 'event_invitation' and l.status::text in ('sent', 'delivered', 'read') and l.parent_id is not null
        and regexp_replace(l.to_phone, '[^0-9]', '', 'g') = any($2::text[]) and e.status = 'invited' and e.held_on >= $3::date`,
    [r.schoolId, writtenForms(r.phone), indiaDate(new Date(r.at))]
  )).rows as { event_id: string; parent_id: string }[];
  if (open.length !== 1) return { recorded: false };
  await db.query(
    `insert into event_replies (school_id, event_id, parent_id, answer, replied_at) values ($1, $2, $3, $4, $5)
     on conflict (event_id, parent_id) do update set answer = excluded.answer, replied_at = excluded.replied_at where event_replies.replied_at <= excluded.replied_at`,
    [r.schoolId, open[0].event_id, open[0].parent_id, answer, r.at]
  );
  return { recorded: true, eventId: open[0].event_id, answer };
}

type Platform = <T>(fn: (db: PoolClient) => Promise<T>) => Promise<T>;
// The day before: everyone invited who did not say NO. Cancelled, past or switched off: nobody.
export function eventRemindHandler(deps: { platform: Platform; queue: Queue; now?: () => Date }): JobHandler {
  return async (job) => {
    const eventId = job.payload.eventId;
    if (typeof eventId !== 'string' || !/^[0-9a-f-]{36}$/i.test(eventId) || !job.schoolId) throw new PermanentJobError('event.remind: bad payload');
    const schoolId = job.schoolId;
    await deps.platform(async (db) => {
      if (!(await eventsAreOn(db, schoolId))) return;
      const e = (await db.query(`select title, held_on, starts_at, status from school_events where school_id = $1 and event_id = $2`, [schoolId, eventId])).rows[0];
      if (!e || e.status !== 'invited' || isoDay(e.held_on) < indiaDate((deps.now ?? (() => new Date()))())) return;
      const saidNo = new Set((await db.query(`select parent_id from event_replies where event_id = $1 and answer = 'no'`, [eventId])).rows.map((x) => x.parent_id as string));
      for (const g of await invited(db, schoolId, eventId)) {
        if (saidNo.has(g.parent_id)) continue;
        await queueWhatsAppMessage(db, deps.queue, { schoolId, studentId: g.student_id, parentId: g.parent_id, purpose: 'operational_communication', toPhone: g.phone, templateName: 'event_reminder', templateParams: { title: e.title, when: when(isoDay(e.held_on), e.starts_at) }, dedupeKey: `event:${eventId}:remind:${g.phone}` });
      }
    });
  };
}
