import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { PermanentJobError, type JobHandler, type JobSpec } from '@/lib/jobs/types';
import { indiaDate, isIsoDate } from '@/lib/time/india';
import { queueWhatsAppMessage } from '@/lib/whatsapp/gate';
import { normalizePhone, writtenForms } from '@/lib/whatsapp/phone';

// Parent-teacher meetings (docs/25 slice 7k, C193).
//
//   - The office makes a meeting day for some classes: a time window and a slot length. Each class teacher of those
//     classes gets slots. Nothing is sent while it is a draft.
//   - Inviting sends ONE message a guardian and teacher: a parent with two children in a teacher's class gets one
//     message from that teacher, naming both children; a parent with children under two teachers gets one each.
//   - A parent books by replying with a time ("10:30"). A SLOT IS BOOKED ONCE: the database's unique slot is the
//     rule; whoever asks second is told the time is taken and which times are free.
//   - The day before, each booked parent is reminded. After the meeting the teacher marks who came, with a note.
//   - Every message goes through the one gate (consent, STOP, quiet hours, the budget).

type Sql = Pick<PoolClient, 'query'>;
export type PtmQueue = { enqueue: (db: Sql, spec: JobSpec) => Promise<unknown> };
type Queue = PtmQueue;
type Actor = { schoolId: string; userId: string; role: StaffRole };
const OFFICE: readonly string[] = ['principal', 'school_admin'];
export const PTM_ROLES: readonly string[] = ['principal', 'school_admin', 'teacher'];
export const PTM_REMIND_JOB = 'ptm.remind';
export const MAX_SLOTS_A_TEACHER = 60;
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const hhmm = (t: unknown) => String(t).slice(0, 5);
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
// "10:30 am": how a time is said to a parent.
export const sayTime = (t: string) => `${((Number(t.slice(0, 2)) + 11) % 12) + 1}:${t.slice(3, 5)} ${Number(t.slice(0, 2)) < 12 ? 'am' : 'pm'}`;
export const sayDate = (iso: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T00:00:00Z`));
const isoDay = (d: unknown) => (d instanceof Date ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : String(d).slice(0, 10));

// The times a parent may have meant by what they wrote: "10:30", "10.30", "1030", "2:30 pm", "10". Without am or pm
// both readings are returned and the meeting's own slots decide.
export function timesMeant(text: string): string[] {
  const m = /^\s*(?:at\s+)?([0-9]{1,2})(?:\s*[:.]?\s*([0-5][0-9]))?\s*(am|pm|a\.m\.|p\.m\.)?\s*[.!]?\s*$/i.exec(text);
  if (!m) return [];
  const h = Number(m[1]);
  const min = m[2] ?? '00';
  const half = m[3]?.toLowerCase().replace(/\./g, '');
  if (h > 23 || (half && (h < 1 || h > 12))) return [];
  if (half) return [`${String((h % 12) + (half === 'pm' ? 12 : 0)).padStart(2, '0')}:${min}`];
  return h >= 1 && h <= 11 ? [`${String(h).padStart(2, '0')}:${min}`, `${String(h + 12).padStart(2, '0')}:${min}`] : [`${String(h).padStart(2, '0')}:${min}`];
}

// withSubjectTeachers (C200): also give a row of times to every teacher who teaches one of the classes in the timetable.
export type PtmInput = { title: string; heldOn: string; startsAt: string; endsAt: string; slotMinutes: number; classIds: string[]; withSubjectTeachers?: boolean };
export type CreateResult = { ok: true; ptmId: string; teachers: number; slots: number } | { ok: false; reason: 'not_allowed' | 'title' | 'date' | 'times' | 'classes' | 'no_teacher' | 'too_many_slots'; classes?: string[] };

export async function createPtm(db: PoolClient, actor: Actor, input: PtmInput, today: string = indiaDate()): Promise<CreateResult> {
  if (!OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const title = input.title.trim();
  if (!title || title.length > 120) return { ok: false, reason: 'title' };
  if (!isIsoDate(input.heldOn) || input.heldOn < today) return { ok: false, reason: 'date' };
  if (!TIME.test(input.startsAt) || !TIME.test(input.endsAt) || !Number.isInteger(input.slotMinutes) || input.slotMinutes < 5 || input.slotMinutes > 60 || minutes(input.endsAt) - minutes(input.startsAt) < input.slotMinutes) return { ok: false, reason: 'times' };
  const starts: string[] = [];
  for (let m = minutes(input.startsAt); m + input.slotMinutes <= minutes(input.endsAt); m += input.slotMinutes) starts.push(clock(m));
  if (starts.length > MAX_SLOTS_A_TEACHER) return { ok: false, reason: 'too_many_slots' };
  const ids = [...new Set(input.classIds)];
  const classes = ids.length ? ((await db.query(`select class_id, name, class_teacher_id from classes where school_id = $1 and class_id = any($2::uuid[]) order by name`, [actor.schoolId, ids])).rows as { class_id: string; name: string; class_teacher_id: string | null }[]) : [];
  if (!ids.length || classes.length !== ids.length) return { ok: false, reason: 'classes' };
  const without = classes.filter((c) => !c.class_teacher_id).map((c) => c.name);
  if (without.length) return { ok: false, reason: 'no_teacher', classes: without };
  const ptmId = (await db.query(`insert into ptm_events (school_id, title, held_on, starts_at, ends_at, slot_minutes, class_ids, created_by, with_subject_teachers) values ($1, $2, $3, $4, $5, $6, $7::uuid[], $8, $9) returning ptm_id`, [actor.schoolId, title, input.heldOn, input.startsAt, input.endsAt, input.slotMinutes, ids, actor.userId, input.withSubjectTeachers === true])).rows[0].ptm_id as string;
  // A teacher is a user, as in the timetable: the one place the app itself records who teaches a class.
  const subjectTeachers = input.withSubjectTeachers === true
    ? (await db.query(`select distinct t.teacher_user_id from timetable_entries t join users u on u.school_id = t.school_id and u.user_id = t.teacher_user_id and u.is_active where t.school_id = $1 and t.class_id = any($2::uuid[])`, [actor.schoolId, ids])).rows.map((r) => r.teacher_user_id as string)
    : [];
  const teachers = [...new Set([...classes.map((c) => c.class_teacher_id as string), ...subjectTeachers])];
  await db.query(`insert into ptm_slots (school_id, ptm_id, teacher_id, starts_at) select $1, $2, t, s::time from unnest($3::uuid[]) t cross join unnest($4::text[]) s`, [actor.schoolId, ptmId, teachers, starts]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'ptm.created', targetType: 'ptm_events', targetId: ptmId, beforeState: undefined, afterState: { heldOn: input.heldOn, classes: ids.length, teachers: teachers.length, slots: starts.length } });
  return { ok: true, ptmId, teachers: teachers.length, slots: teachers.length * starts.length };
}

// For each teacher of the meeting, the guardians of that teacher's children in it, one row a guardian's NUMBER:
// a parent of two children in the class is one row with both names.
type Invitee = { teacher_id: string; teacher: string; parent_id: string; guardian: string; phone: string | null; student_id: string; children: string };
// `withSubject`: false for the invitation (ONE message a guardian and CLASS teacher, C193); true for who may be booked
// with whom, where a meeting that includes subject teachers adds the teachers of the class's timetable (C200).
async function invitees(db: Sql, schoolId: string, ptmId: string, withSubject = false): Promise<Invitee[]> {
  return (await db.query(
    `with pairs as (
       select c.class_teacher_id as teacher_id, c.class_id from ptm_events e join classes c on c.school_id = e.school_id and c.class_id = any(e.class_ids) and c.class_teacher_id is not null
        where e.school_id = $1 and e.ptm_id = $2
       union
       select t.teacher_user_id, t.class_id from ptm_events e join timetable_entries t on t.school_id = e.school_id and t.class_id = any(e.class_ids)
        where e.school_id = $1 and e.ptm_id = $2 and e.with_subject_teachers and $3::boolean
     )
     select x.teacher_id, u.display_name as teacher, (array_agg(p.parent_id order by p.created_at, p.parent_id))[1] as parent_id, (array_agg(p.name order by p.created_at, p.parent_id))[1] as guardian,
            (array_agg(p.phone order by p.created_at, p.parent_id))[1] as phone, (array_agg(s.student_id order by s.name, s.student_id))[1] as student_id,
            (select string_agg(n, ', ' order by n) from (select distinct unnest(array_agg(s.name)) n) d) as children
       from pairs x join users u on u.user_id = x.teacher_id
       join students s on s.school_id = $1 and s.class_id = x.class_id and s.status = 'active'
       join parent_student_map m on m.school_id = s.school_id and m.student_id = s.student_id
       join parents p on p.school_id = m.school_id and p.parent_id = m.parent_id and p.merged_into is null
      group by x.teacher_id, u.display_name, regexp_replace(p.phone, '[^0-9]', '', 'g')
      order by u.display_name, x.teacher_id, guardian`,
    [schoolId, ptmId, withSubject]
  )).rows;
}

export type InviteResult = { ok: true; queued: number; held: number; withoutNumber: number } | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_draft' | 'past' | 'nobody' };

export async function invitePtm(db: PoolClient, queue: Queue, actor: Actor, ptmId: string, now: Date = new Date()): Promise<InviteResult> {
  if (!OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const e = (await db.query(`select held_on, starts_at, ends_at, status from ptm_events where school_id = $1 and ptm_id = $2 for update`, [actor.schoolId, ptmId])).rows[0];
  if (!e) return { ok: false, reason: 'not_found' };
  if (e.status !== 'draft') return { ok: false, reason: 'not_draft' };
  const heldOn = isoDay(e.held_on);
  if (heldOn < indiaDate(now)) return { ok: false, reason: 'past' };
  const out = { queued: 0, held: 0, withoutNumber: 0 };
  for (const g of await invitees(db, actor.schoolId, ptmId)) {
    const phone = normalizePhone(String(g.phone ?? ''));
    if (!phone) {
      out.withoutNumber += 1;
      continue;
    }
    const r = await queueWhatsAppMessage(db, queue, { schoolId: actor.schoolId, studentId: g.student_id, parentId: g.parent_id, purpose: 'operational_communication', toPhone: phone, templateName: 'ptm_invitation', templateParams: { date: sayDate(heldOn), teacher: g.teacher, children: g.children, from: sayTime(hhmm(e.starts_at)), to: sayTime(hhmm(e.ends_at)) }, dedupeKey: `ptm:${ptmId}:inv:${g.teacher_id}:${phone}` });
    if (r.status === 'queued') out.queued += 1;
    else out.held += 1;
  }
  if (out.queued + out.held === 0) return { ok: false, reason: 'nobody' };
  await db.query(`update ptm_events set status = 'invited', invited_by = $3, invited_at = $4 where school_id = $1 and ptm_id = $2`, [actor.schoolId, ptmId, actor.userId, now]);
  // The reminder: 5 pm in India the day before (at once, if that has passed).
  const remindAt = new Date(new Date(`${heldOn}T17:00:00+05:30`).getTime() - 24 * 3600_000);
  await queue.enqueue(db, { type: PTM_REMIND_JOB, payload: { ptmId }, idempotencyKey: `ptm.remind:${ptmId}`, schoolId: actor.schoolId, runAt: remindAt > now ? remindAt : now });
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'ptm.invited', targetType: 'ptm_events', targetId: ptmId, beforeState: { status: 'draft' }, afterState: { status: 'invited', ...out } });
  return { ok: true, ...out };
}

export type CancelResult = { ok: true; told: number } | { ok: false; reason: 'not_allowed' | 'not_found' | 'already_cancelled' };
// Cancelling tells every parent who had booked.
export async function cancelPtm(db: PoolClient, queue: Queue, actor: Actor, ptmId: string): Promise<CancelResult> {
  if (!OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const e = (await db.query(`select held_on, status from ptm_events where school_id = $1 and ptm_id = $2 for update`, [actor.schoolId, ptmId])).rows[0];
  if (!e) return { ok: false, reason: 'not_found' };
  if (e.status === 'cancelled') return { ok: false, reason: 'already_cancelled' };
  await db.query(`update ptm_events set status = 'cancelled', cancelled_by = $3, cancelled_at = now() where school_id = $1 and ptm_id = $2`, [actor.schoolId, ptmId, actor.userId]);
  let told = 0;
  for (const b of await bookedParents(db, actor.schoolId, ptmId, false)) {
    const r = await queueWhatsAppMessage(db, queue, { schoolId: actor.schoolId, studentId: b.student_id, parentId: b.parent_id, purpose: 'operational_communication', toPhone: b.phone, templateName: 'ptm_cancelled', templateParams: { date: sayDate(isoDay(e.held_on)), teacher: b.teacher }, dedupeKey: `ptm:${ptmId}:cancelled:${b.booking_id}` });
    if (r.status === 'queued') told += 1;
  }
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'ptm.cancelled', targetType: 'ptm_events', targetId: ptmId, beforeState: { status: e.status }, afterState: { status: 'cancelled', told } });
  return { ok: true, told };
}

type Booked = { booking_id: string; parent_id: string; phone: string; student_id: string; teacher: string; time: string };
// The bookings of a meeting with what a message needs: a usable number and one of the guardian's children with that teacher.
async function bookedParents(db: Sql, schoolId: string, ptmId: string, onlyUnreminded: boolean): Promise<Booked[]> {
  const rows = (await db.query(
    `select b.booking_id, b.parent_id, p.phone, u.display_name as teacher, sl.starts_at,
            (select s.student_id from parent_student_map m join students s on s.school_id = m.school_id and s.student_id = m.student_id join classes c on c.school_id = s.school_id and c.class_id = s.class_id
              where m.school_id = b.school_id and m.parent_id = b.parent_id and c.class_id = any(e.class_ids)
                and (c.class_teacher_id = b.teacher_id or exists (select 1 from timetable_entries t where t.school_id = c.school_id and t.class_id = c.class_id and t.teacher_user_id = b.teacher_id))
              order by s.name, s.student_id limit 1) as student_id
       from ptm_bookings b join ptm_events e on e.ptm_id = b.ptm_id join ptm_slots sl on sl.slot_id = b.slot_id join parents p on p.parent_id = b.parent_id join users u on u.user_id = b.teacher_id
      where b.school_id = $1 and b.ptm_id = $2 and ($3 = false or b.reminded_at is null) order by sl.starts_at, b.booking_id`,
    [schoolId, ptmId, onlyUnreminded]
  )).rows;
  return rows.flatMap((r) => {
    const phone = normalizePhone(String(r.phone ?? ''));
    return phone && r.student_id ? [{ booking_id: r.booking_id, parent_id: r.parent_id, phone, student_id: r.student_id, teacher: r.teacher, time: hhmm(r.starts_at) }] : [];
  });
}

export type PtmRow = { ptm_id: string; title: string; held_on: string; starts_at: string; ends_at: string; slot_minutes: number; status: 'draft' | 'invited' | 'cancelled'; classes: string; slots: number; booked: number; attended: number };
export async function listPtms(db: PoolClient, schoolId: string): Promise<PtmRow[]> {
  const { rows } = await db.query(
    `select e.ptm_id, e.title, e.held_on, e.starts_at, e.ends_at, e.slot_minutes, e.status,
            coalesce((select string_agg(c.name, ', ' order by c.name) from classes c where c.school_id = e.school_id and c.class_id = any(e.class_ids)), '') as classes,
            (select count(*)::int from ptm_slots s where s.ptm_id = e.ptm_id) as slots,
            (select count(*)::int from ptm_bookings b where b.ptm_id = e.ptm_id) as booked,
            (select count(*)::int from ptm_bookings b where b.ptm_id = e.ptm_id and b.attended) as attended
       from ptm_events e where e.school_id = $1 order by e.held_on desc, e.created_at desc limit 50`,
    [schoolId]
  );
  return rows.map((r) => ({ ...r, held_on: isoDay(r.held_on), starts_at: hhmm(r.starts_at), ends_at: hhmm(r.ends_at) }));
}

export type PtmDetail = {
  ptm: PtmRow;
  teachers: { teacher_id: string; teacher: string; slots: { slot_id: string; time: string; booking: null | { booking_id: string; parent_id: string; guardian: string; children: string; via: 'reply' | 'staff'; attended: boolean | null; note: string | null } }[]; guardians: { parent_id: string; guardian: string; children: string }[] }[];
  mayManage: boolean;
  hasBegun: boolean; // the day of the meeting or later: who came can be marked
  isOver: boolean;
};
// Row level security decides what a teacher gets back: their own slots, bookings and guardians.
export async function ptmDetail(db: PoolClient, actor: Actor, ptmId: string, today: string = indiaDate()): Promise<PtmDetail | null> {
  if (!PTM_ROLES.includes(actor.role)) return null;
  const ptm = (await listPtms(db, actor.schoolId)).find((p) => p.ptm_id === ptmId);
  if (!ptm) return null;
  const slots = (await db.query(
    `select s.slot_id, s.teacher_id, u.display_name as teacher, s.starts_at, b.booking_id, b.parent_id, p.name as guardian, b.booked_via, b.attended, b.note
       from ptm_slots s join users u on u.user_id = s.teacher_id left join ptm_bookings b on b.slot_id = s.slot_id left join parents p on p.parent_id = b.parent_id
      where s.school_id = $1 and s.ptm_id = $2 order by u.display_name, s.teacher_id, s.starts_at`,
    [actor.schoolId, ptmId]
  )).rows;
  const people = await invitees(db, actor.schoolId, ptmId, true);
  const teachers: PtmDetail['teachers'] = [];
  for (const s of slots) {
    let t = teachers.find((x) => x.teacher_id === s.teacher_id);
    if (!t) teachers.push((t = { teacher_id: s.teacher_id, teacher: s.teacher, slots: [], guardians: people.filter((g) => g.teacher_id === s.teacher_id).map((g) => ({ parent_id: g.parent_id, guardian: g.guardian, children: g.children })) }));
    const who = s.booking_id ? t.guardians.find((g) => g.parent_id === s.parent_id) : undefined;
    t.slots.push({ slot_id: s.slot_id, time: hhmm(s.starts_at), booking: s.booking_id ? { booking_id: s.booking_id, parent_id: s.parent_id, guardian: s.guardian, children: who?.children ?? '', via: s.booked_via, attended: s.attended, note: s.note } : null });
  }
  return { ptm, teachers, mayManage: OFFICE.includes(actor.role), hasBegun: ptm.held_on <= today, isOver: ptm.held_on < today };
}

export type BookResult = { ok: true; bookingId: string; moved: boolean } | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_open' | 'not_invited' | 'taken' };
// Staff book for a parent who phoned or came by. The same parent with the same teacher again is moved, not doubled.
export async function bookSlot(db: PoolClient, actor: Actor, input: { slotId: string; parentId: string }): Promise<BookResult> {
  if (!PTM_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const slot = (await db.query(`select s.ptm_id, s.teacher_id, e.status from ptm_slots s join ptm_events e on e.ptm_id = s.ptm_id where s.school_id = $1 and s.slot_id = $2`, [actor.schoolId, input.slotId])).rows[0];
  if (!slot) return { ok: false, reason: 'not_found' };
  if (slot.status === 'cancelled') return { ok: false, reason: 'not_open' };
  if (!(await invitees(db, actor.schoolId, slot.ptm_id, true)).some((g) => g.teacher_id === slot.teacher_id && g.parent_id === input.parentId)) return { ok: false, reason: 'not_invited' };
  const made = await takeSlot(db, { schoolId: actor.schoolId, ptmId: slot.ptm_id, slotId: input.slotId, teacherId: slot.teacher_id, parentId: input.parentId, via: 'staff', by: actor.userId });
  if (!made) return { ok: false, reason: 'taken' };
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: made.moved ? 'ptm.booking_moved' : 'ptm.booked', targetType: 'ptm_bookings', targetId: made.bookingId, beforeState: undefined, afterState: { slotId: input.slotId, via: 'staff' } });
  return { ok: true, ...made };
}

// THE one place a slot is taken. The unique slot decides: the second to ask gets null. A savepoint keeps the
// caller's transaction usable after the refusal.
async function takeSlot(db: Sql, b: { schoolId: string; ptmId: string; slotId: string; teacherId: string; parentId: string; via: 'reply' | 'staff'; by: string | null }): Promise<{ bookingId: string; moved: boolean } | null> {
  await db.query('savepoint ptm_take');
  try {
    const had = (await db.query(`select booking_id, slot_id from ptm_bookings where ptm_id = $1 and teacher_id = $2 and parent_id = $3 for update`, [b.ptmId, b.teacherId, b.parentId])).rows[0];
    if (had?.slot_id === b.slotId) return { bookingId: had.booking_id, moved: false };
    const row = had
      ? await db.query(`update ptm_bookings set slot_id = $2, booked_via = $3, booked_by = $4, reminded_at = null where booking_id = $1 and attended is null returning booking_id`, [had.booking_id, b.slotId, b.via, b.by])
      : await db.query(`insert into ptm_bookings (school_id, ptm_id, slot_id, teacher_id, parent_id, booked_via, booked_by) values ($1, $2, $3, $4, $5, $6, $7) returning booking_id`, [b.schoolId, b.ptmId, b.slotId, b.teacherId, b.parentId, b.via, b.by]);
    await db.query('release savepoint ptm_take');
    return row.rows[0] ? { bookingId: row.rows[0].booking_id, moved: Boolean(had) } : null;
  } catch (err) {
    await db.query('rollback to savepoint ptm_take');
    if ((err as { code?: string }).code === '23505') return null;
    throw err;
  }
}

export type AttendResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'not_found' | 'too_early' | 'note' };
// After the meeting has begun: who came, with a note if there is one. A teacher marks their own; the office, any.
export async function markAttendance(db: PoolClient, actor: Actor, input: { bookingId: string; attended: boolean; note: string }, today: string = indiaDate()): Promise<AttendResult> {
  if (!PTM_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const note = input.note.trim();
  if (note.length > 500) return { ok: false, reason: 'note' };
  const b = (await db.query(`select b.booking_id, e.held_on from ptm_bookings b join ptm_events e on e.ptm_id = b.ptm_id where b.school_id = $1 and b.booking_id = $2 and e.status <> 'cancelled'`, [actor.schoolId, input.bookingId])).rows[0];
  if (!b) return { ok: false, reason: 'not_found' };
  if (isoDay(b.held_on) > today) return { ok: false, reason: 'too_early' };
  await db.query(`update ptm_bookings set attended = $2, note = $3, marked_by = $4, marked_at = now() where booking_id = $1`, [input.bookingId, input.attended, note || null, actor.userId]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'ptm.attendance_marked', targetType: 'ptm_bookings', targetId: input.bookingId, beforeState: undefined, afterState: { attended: input.attended } });
  return { ok: true };
}

// The school's switch for this module (docs/19 rule 7): off, a reply books nothing and nobody is reminded.
async function ptmIsOn(db: Sql, schoolId: string): Promise<boolean> {
  return (await db.query(`select enabled from school_module_entitlements where school_id = $1 and module_id = 'ptm'`, [schoolId])).rows[0]?.enabled === true;
}

export type PtmReply = { booked: false } | { booked: false; told: 'taken' } | { booked: true; bookingId: string; moved: boolean };
// A parent's reply with a time. As the platform role, in the webhook's transaction, after the message is in its
// thread. It is a booking only when the number was invited to a meeting that is still to come; anything else is
// just a message for a person to read.
export async function notePtmReply(db: PoolClient, queue: Queue | undefined, r: { schoolId: string; phone: string; text: string; at: string; providerMessageId: string }): Promise<PtmReply> {
  const meant = timesMeant(r.text);
  if (!meant.length || !queue) return { booked: false };
  if (!(await ptmIsOn(db, r.schoolId))) return { booked: false };
  const invited = (await db.query(
    `select l.dedupe_key, l.parent_id, l.student_id from communication_log l
      where l.school_id = $1 and l.template_name = 'ptm_invitation' and l.status::text in ('sent', 'delivered', 'read') and l.parent_id is not null
        and regexp_replace(l.to_phone, '[^0-9]', '', 'g') = any($2::text[]) order by l.created_at desc, l.log_id`,
    [r.schoolId, writtenForms(r.phone)]
  )).rows as { dedupe_key: string; parent_id: string; student_id: string }[];
  const today = indiaDate(new Date(r.at));
  // The meetings still to come this number was invited to, newest invitation first; within one, each teacher.
  const asks: { ptmId: string; teacherId: string; parentId: string; studentId: string; heldOn: string; teacher: string; has: string | null; free: string[]; slotOf: Map<string, string> }[] = [];
  for (const i of invited) {
    const m = /^ptm:([0-9a-f-]{36}):inv:([0-9a-f-]{36}):/.exec(i.dedupe_key);
    if (!m || (asks.length && asks[0].ptmId !== m[1])) continue;
    const e = (await db.query(`select e.held_on, u.display_name as teacher from ptm_events e join users u on u.user_id = $3 where e.school_id = $1 and e.ptm_id = $2 and e.status = 'invited'`, [r.schoolId, m[1], m[2]])).rows[0];
    if (!e || isoDay(e.held_on) < today) continue;
    const slots = (await db.query(`select s.slot_id, s.starts_at, b.parent_id from ptm_slots s left join ptm_bookings b on b.slot_id = s.slot_id where s.ptm_id = $1 and s.teacher_id = $2 order by s.starts_at`, [m[1], m[2]])).rows;
    asks.push({ ptmId: m[1], teacherId: m[2], parentId: i.parent_id, studentId: i.student_id, heldOn: isoDay(e.held_on), teacher: e.teacher, has: slots.find((s) => s.parent_id === i.parent_id) ? hhmm(slots.find((s) => s.parent_id === i.parent_id).starts_at) : null, free: slots.filter((s) => !s.parent_id).map((s) => hhmm(s.starts_at)), slotOf: new Map(slots.map((s) => [hhmm(s.starts_at), s.slot_id as string])) });
  }
  if (!asks.length) return { booked: false };
  const time = meant.find((t) => asks.some((a) => a.slotOf.has(t)));
  // First a teacher this parent has no slot with yet; then, to move a slot they have.
  const order = [...asks.filter((a) => !a.has), ...asks.filter((a) => a.has)];
  for (const a of time ? order : []) {
    if (!a.free.includes(time as string)) continue;
    const made = await takeSlot(db, { schoolId: r.schoolId, ptmId: a.ptmId, slotId: a.slotOf.get(time as string) as string, teacherId: a.teacherId, parentId: a.parentId, via: 'reply', by: null });
    if (!made) continue;
    await queueWhatsAppMessage(db, queue, { schoolId: r.schoolId, studentId: a.studentId, parentId: a.parentId, purpose: 'operational_communication', toPhone: r.phone, templateName: 'ptm_booked', templateParams: { date: sayDate(a.heldOn), time: sayTime(time as string), teacher: a.teacher }, dedupeKey: `ptm:${a.ptmId}:booked:${made.bookingId}:${time}` });
    return { booked: true, ...made };
  }
  // Not a time of this meeting, or taken: say which times are free with the teacher still to be booked.
  const a = order[0];
  await queueWhatsAppMessage(db, queue, { schoolId: r.schoolId, studentId: a.studentId, parentId: a.parentId, purpose: 'operational_communication', toPhone: r.phone, templateName: 'ptm_time_not_free', templateParams: { teacher: a.teacher, times: a.free.length ? a.free.slice(0, 8).map(sayTime).join(', ') : 'none left' }, dedupeKey: `ptm:${a.ptmId}:notfree:${r.providerMessageId}` });
  return { booked: false, told: 'taken' };
}

type Platform = <T>(fn: (db: PoolClient) => Promise<T>) => Promise<T>;
// The day before: each booked parent not yet reminded. A meeting cancelled or already past reminds nobody.
export function ptmRemindHandler(deps: { platform: Platform; queue: Queue; now?: () => Date }): JobHandler {
  return async (job) => {
    const ptmId = job.payload.ptmId;
    if (typeof ptmId !== 'string' || !/^[0-9a-f-]{36}$/i.test(ptmId) || !job.schoolId) throw new PermanentJobError('ptm.remind: bad payload');
    const schoolId = job.schoolId;
    await deps.platform(async (db) => {
      const e = (await db.query(`select held_on, status from ptm_events where school_id = $1 and ptm_id = $2`, [schoolId, ptmId])).rows[0];
      if (!(await ptmIsOn(db, schoolId))) return;
      if (!e || e.status !== 'invited' || isoDay(e.held_on) < indiaDate((deps.now ?? (() => new Date()))())) return;
      for (const b of await bookedParents(db, schoolId, ptmId, true)) {
        await queueWhatsAppMessage(db, deps.queue, { schoolId, studentId: b.student_id, parentId: b.parent_id, purpose: 'operational_communication', toPhone: b.phone, templateName: 'ptm_reminder', templateParams: { date: sayDate(isoDay(e.held_on)), time: sayTime(b.time), teacher: b.teacher }, dedupeKey: `ptm:${ptmId}:remind:${b.booking_id}:${b.time}` });
        await db.query(`update ptm_bookings set reminded_at = now() where booking_id = $1`, [b.booking_id]);
      }
    });
  };
}
