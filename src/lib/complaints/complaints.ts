import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { PermanentJobError, type JobHandler, type JobSpec } from '@/lib/jobs/types';
import { sayDate } from '@/lib/ptm/ptm';
import { indiaDate } from '@/lib/time/india';
import { queueWhatsAppMessage } from '@/lib/whatsapp/gate';
import { normalizePhone } from '@/lib/whatsapp/phone';

// Complaints from parents (docs/25 slice 7m, C195).
//
//   - A parent's complaint, taken from their conversation or by the office, has an OWNER and a time it is DUE by.
//   - The parent is told at each step: that it was noted and by when; if it is passed to the principal; and, when
//     it is closed, what was done. Every message goes through the one gate.
//   - NOTHING CLOSES WITHOUT A NOTE. The note is what the parent reads.
//   - Past its due time and still open, it is passed to the PRINCIPAL, who becomes its owner and sees it on My Day.
//   - NOBODY BUT THE PRINCIPAL sees a complaint about themselves until the principal has seen it. That is the
//     database's rule (the complaints_staff policy); this file never works around it.
//   - NOBODY CHANGES a complaint about themselves, the principal included (C200): one about the principal is
//     recorded and looked into by the school admin, and overdue it passes to the school admin.

type Sql = Pick<PoolClient, 'query'>;
type Queue = { enqueue: (db: Sql, spec: JobSpec) => Promise<unknown> };
type Actor = { schoolId: string; userId: string; role: StaffRole };
const OFFICE: readonly string[] = ['principal', 'school_admin'];
export const COMPLAINT_ROLES: readonly string[] = ['principal', 'school_admin', 'teacher'];
export const COMPLAINT_ESCALATE_JOB = 'complaint.escalate';
export const DUE_HOURS = [24, 48, 72] as const;
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
export const reference = (complaintId: string) => complaintId.slice(0, 8).toUpperCase();

// Tell the parent, if they can be told: a usable number and a child to hold the consent against. Returns whether a
// message was queued; a held or impossible message is recorded as "not told" on the step.
async function tellParent(db: PoolClient, queue: Queue, c: { schoolId: string; complaintId: string; parentId: string; studentId: string | null }, step: 'received' | 'escalated' | 'escalated_office' | 'closed', params: Record<string, string>): Promise<boolean> {
  const p = (await db.query(
    `select p.phone, coalesce($3::uuid, (select m.student_id from parent_student_map m join students s on s.school_id = m.school_id and s.student_id = m.student_id where m.school_id = p.school_id and m.parent_id = p.parent_id order by s.name, s.student_id limit 1)) as student_id
       from parents p where p.school_id = $1 and p.parent_id = $2`,
    [c.schoolId, c.parentId, c.studentId]
  )).rows[0];
  const phone = normalizePhone(String(p?.phone ?? ''));
  if (!phone || !p?.student_id) return false;
  const r = await queueWhatsAppMessage(db, queue, { schoolId: c.schoolId, studentId: p.student_id, parentId: c.parentId, purpose: 'operational_communication', toPhone: phone, templateName: `complaint_${step}`, templateParams: { ref: reference(c.complaintId), ...params }, dedupeKey: `complaint:${c.complaintId}:${step}` });
  return r.status === 'queued';
}

export type OpenInput = { parentId: string; studentId: string | null; aboutUserId: string | null; ownerId: string; summary: string; dueHours: number; source: 'thread' | 'office' };
export type OpenResult = { ok: true; complaintId: string; parentTold: boolean } | { ok: false; reason: 'not_allowed' | 'summary' | 'due' | 'guardian' | 'child' | 'owner' | 'about' | 'owner_is_about' | 'for_the_office' };

export async function openComplaint(db: PoolClient, queue: Queue, actor: Actor, input: OpenInput, now: Date = new Date()): Promise<OpenResult> {
  if (!COMPLAINT_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const summary = input.summary.trim();
  if (!summary || summary.length > 600) return { ok: false, reason: 'summary' };
  if (!(DUE_HOURS as readonly number[]).includes(input.dueHours)) return { ok: false, reason: 'due' };
  // A teacher takes a complaint for themselves to look into; one about a member of staff is for the office to record.
  if (actor.role === 'teacher' && (input.ownerId !== actor.userId || input.aboutUserId)) return { ok: false, reason: 'for_the_office' };
  if (input.aboutUserId && input.aboutUserId === input.ownerId) return { ok: false, reason: 'owner_is_about' };
  // A complaint about the person at the keyboard is recorded by someone else: they may not see it until the principal has.
  if (input.aboutUserId === actor.userId) return { ok: false, reason: 'about' };
  // The guardian and the child, as this person's own session may see them (a teacher: their own classes').
  if (!(await db.query(`select 1 from parents where school_id = $1 and parent_id = $2 and merged_into is null`, [actor.schoolId, input.parentId])).rows[0]) return { ok: false, reason: 'guardian' };
  if (input.studentId && !(await db.query(`select 1 from parent_student_map where school_id = $1 and parent_id = $2 and student_id = $3`, [actor.schoolId, input.parentId, input.studentId])).rows[0]) return { ok: false, reason: 'child' };
  const staff = (await db.query(`select user_id, display_name, role::text as role from users where school_id = $1 and user_id = any($2::uuid[]) and is_active`, [actor.schoolId, [input.ownerId, input.aboutUserId].filter(Boolean)])).rows as { user_id: string; display_name: string; role: string }[];
  const owner = staff.find((s) => s.user_id === input.ownerId);
  if (!owner || !COMPLAINT_ROLES.includes(owner.role)) return { ok: false, reason: 'owner' };
  if (input.aboutUserId && !staff.some((s) => s.user_id === input.aboutUserId)) return { ok: false, reason: 'about' };
  const dueAt = new Date(now.getTime() + input.dueHours * 3600_000);
  const complaintId = (await db.query(
    `insert into complaints (school_id, parent_id, student_id, about_user_id, source, summary, owner_id, due_at, created_by, created_at, principal_seen_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, case when $11 then $10::timestamptz end) returning complaint_id`,
    [actor.schoolId, input.parentId, input.studentId, input.aboutUserId, input.source, summary, input.ownerId, dueAt, actor.userId, now, actor.role === 'principal']
  )).rows[0].complaint_id as string;
  const parentTold = await tellParent(db, queue, { schoolId: actor.schoolId, complaintId, parentId: input.parentId, studentId: input.studentId }, 'received', { owner: owner.display_name, due: sayDate(indiaDate(dueAt)) });
  await db.query(`insert into complaint_events (school_id, complaint_id, kind, by_user, parent_told, at) values ($1, $2, 'opened', $3, $4, $5)`, [actor.schoolId, complaintId, actor.userId, parentTold, now]);
  await queue.enqueue(db, { type: COMPLAINT_ESCALATE_JOB, payload: { complaintId }, idempotencyKey: `complaint.escalate:${complaintId}`, schoolId: actor.schoolId, runAt: dueAt });
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'complaint.opened', targetType: 'complaints', targetId: complaintId, beforeState: undefined, afterState: { source: input.source, ownerId: input.ownerId, dueAt: dueAt.toISOString(), about: Boolean(input.aboutUserId) } });
  return { ok: true, complaintId, parentTold };
}

export type StepResult = { ok: true; parentTold?: boolean } | { ok: false; reason: 'not_allowed' | 'not_found' | 'closed' | 'note' | 'owner' | 'owner_is_about' };
// The complaint as this session may see it and change it: its owner, or the office.
async function mine(db: PoolClient, actor: Actor, complaintId: string) {
  // Nobody notes, reassigns or closes a complaint about themselves: the principal neither (C200). Read first without
  // a lock: the database refuses that person the row for a change, and they should hear why, not "not found".
  const seen = (await db.query(`select about_user_id from complaints where school_id = $1 and complaint_id = $2`, [actor.schoolId, complaintId])).rows[0] as { about_user_id: string | null } | undefined;
  if (seen && seen.about_user_id === actor.userId) return { ok: false as const, reason: 'not_allowed' as const };
  const c = (await db.query(`select complaint_id, parent_id, student_id, about_user_id, owner_id, status from complaints where school_id = $1 and complaint_id = $2 for update`, [actor.schoolId, complaintId])).rows[0] as { complaint_id: string; parent_id: string; student_id: string | null; about_user_id: string | null; owner_id: string; status: string } | undefined;
  if (!c) return { ok: false as const, reason: 'not_found' as const };
  if (!OFFICE.includes(actor.role) && c.owner_id !== actor.userId) return { ok: false as const, reason: 'not_allowed' as const };
  if (c.status === 'closed') return { ok: false as const, reason: 'closed' as const };
  return { ok: true as const, c };
}

export async function addNote(db: PoolClient, actor: Actor, complaintId: string, text: string): Promise<StepResult> {
  if (!COMPLAINT_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const note = text.trim();
  if (!note || note.length > 600) return { ok: false, reason: 'note' };
  const got = await mine(db, actor, complaintId);
  if (!got.ok) return got;
  await db.query(`insert into complaint_events (school_id, complaint_id, kind, note, by_user) values ($1, $2, 'note', $3, $4)`, [actor.schoolId, complaintId, note, actor.userId]);
  return { ok: true };
}

// The office gives it to someone else to look into: never to the person it is about.
export async function assignComplaint(db: PoolClient, actor: Actor, complaintId: string, ownerId: string): Promise<StepResult> {
  if (!OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const got = await mine(db, actor, complaintId);
  if (!got.ok) return got;
  if (got.c.about_user_id === ownerId) return { ok: false, reason: 'owner_is_about' };
  const owner = (await db.query(`select display_name, role::text as role from users where school_id = $1 and user_id = $2 and is_active`, [actor.schoolId, ownerId])).rows[0];
  if (!owner || !COMPLAINT_ROLES.includes(owner.role)) return { ok: false, reason: 'owner' };
  await db.query(`update complaints set owner_id = $3 where school_id = $1 and complaint_id = $2`, [actor.schoolId, complaintId, ownerId]);
  await db.query(`insert into complaint_events (school_id, complaint_id, kind, note, by_user) values ($1, $2, 'assigned', $3, $4)`, [actor.schoolId, complaintId, owner.display_name, actor.userId]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'complaint.assigned', targetType: 'complaints', targetId: complaintId, beforeState: { ownerId: got.c.owner_id }, afterState: { ownerId } });
  return { ok: true };
}

// Closing needs a note, and the note is what the parent is told.
export async function closeComplaint(db: PoolClient, queue: Queue, actor: Actor, complaintId: string, text: string): Promise<StepResult> {
  if (!COMPLAINT_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const note = oneLine(text);
  if (!note || note.length > 600) return { ok: false, reason: 'note' };
  const got = await mine(db, actor, complaintId);
  if (!got.ok) return got;
  await db.query(`update complaints set status = 'closed', closed_by = $3, closed_at = now(), closing_note = $4 where school_id = $1 and complaint_id = $2`, [actor.schoolId, complaintId, actor.userId, note]);
  const parentTold = await tellParent(db, queue, { schoolId: actor.schoolId, complaintId, parentId: got.c.parent_id, studentId: got.c.student_id }, 'closed', { note });
  await db.query(`insert into complaint_events (school_id, complaint_id, kind, note, by_user, parent_told) values ($1, $2, 'closed', $3, $4, $5)`, [actor.schoolId, complaintId, note, actor.userId, parentTold]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'complaint.closed', targetType: 'complaints', targetId: complaintId, beforeState: { status: 'open' }, afterState: { status: 'closed', parentTold } });
  return { ok: true, parentTold };
}

// `guardian` and `child` are null when this session may not read that guardian or child: a teacher is given a
// complaint she owns whatever class the child is in, and the guardians and children of her own classes only.
export type ComplaintRow = {
  complaint_id: string; ref: string; guardian: string | null; child: string | null; about: string | null; owner_id: string; owner: string; source: 'thread' | 'office'; summary: string; status: 'open' | 'closed';
  due_at: string; overdue: boolean; escalated: boolean; created_at: string; closing_note: string | null; mayChange: boolean; aboutYou: boolean;
  events: { kind: string; note: string | null; by: string | null; parent_told: boolean; at: string }[];
};
const iso = (v: unknown) => new Date(v as string).toISOString();

// "Past its due time", for a complaint that is still open: its due time has come. SAID ONCE, HERE, for the two
// lists below: the Complaints screen's own list (listComplaints) and the rows a dashboard number opens
// (complaintsShown), which are drawn one above the other on the same screen and so must badge the same
// complaints. (My Day's card in src/lib/today/cards.ts counts with the same rule, written in SQL: due_at <= now().)
export const isOverdue = (dueAt: unknown, now: Date): boolean => new Date(dueAt as string) <= now;

// Row level security decides what comes back. When it is the principal who looks, every complaint not yet seen by
// the principal is marked seen: from then on the person it is about may see it too.
//
// The guardian is joined loosely, like the child (C203): a complaint this session may see is listed even when
// the guardian's name is not this session's to read. Joined strictly, a complaint the office gave a teacher about
// a child of another class dropped out of her list, and she could not read, note or close what she owns (the
// database lets her; mine() below lets her). The screen says "a guardian from another class" for the name.
export async function listComplaints(db: PoolClient, actor: Actor, now: Date = new Date()): Promise<ComplaintRow[]> {
  if (!COMPLAINT_ROLES.includes(actor.role)) return [];
  if (actor.role === 'principal') await db.query(`update complaints set principal_seen_at = $2 where school_id = $1 and principal_seen_at is null`, [actor.schoolId, now]);
  const { rows } = await db.query(
    `select c.complaint_id, p.name as guardian, s.name as child, a.display_name as about, c.about_user_id, c.owner_id, o.display_name as owner, c.source, c.summary, c.status, c.due_at, c.escalated_at, c.created_at, c.closing_note,
            coalesce((select json_agg(json_build_object('kind', e.kind, 'note', e.note, 'by', u.display_name, 'parent_told', e.parent_told, 'at', e.at) order by e.at, e.event_id)
                        from complaint_events e left join users u on u.user_id = e.by_user where e.complaint_id = c.complaint_id), '[]'::json) as events
       from complaints c left join parents p on p.parent_id = c.parent_id left join students s on s.student_id = c.student_id
       left join users a on a.user_id = c.about_user_id join users o on o.user_id = c.owner_id
      where c.school_id = $1 order by (c.status = 'open') desc, c.due_at limit 100`,
    [actor.schoolId]
  );
  return rows.map((r) => ({
    complaint_id: r.complaint_id, ref: reference(r.complaint_id), guardian: r.guardian, child: r.child, about: r.about, owner_id: r.owner_id, owner: r.owner, source: r.source, summary: r.summary, status: r.status,
    due_at: iso(r.due_at), overdue: r.status === 'open' && isOverdue(r.due_at, now), escalated: Boolean(r.escalated_at), created_at: iso(r.created_at), closing_note: r.closing_note,
    mayChange: r.status === 'open' && r.about_user_id !== actor.userId && (OFFICE.includes(actor.role) || r.owner_id === actor.userId), aboutYou: r.about_user_id === actor.userId,
    events: (r.events as { kind: string; note: string | null; by: string | null; parent_told: boolean; at: string }[]).map((e) => ({ ...e, at: iso(e.at) })),
  }));
}

// The two lists a dashboard number opens (docs/26 slice 8d, C203): /app/complaints?show=open | overdue.
export const COMPLAINT_SHOWS = ['open', 'overdue'] as const;
export type ComplaintShow = (typeof COMPLAINT_SHOWS)[number];
export const isComplaintShow = (v: unknown): v is ComplaintShow => typeof v === 'string' && (COMPLAINT_SHOWS as readonly string[]).includes(v);
export const COMPLAINT_ROWS_MAX = 500;
export type ComplaintShown = { complaint_id: string; ref: string; guardian: string | null; child: string | null; owner: string | null; due_at: string; overdue: boolean; escalated: boolean };

// The complaints not yet closed ('open'), or those of them whose due time has passed ('overdue'), as this session
// may see them (row level security: the complaints_staff policy), the one due soonest first. It is what
// /app/complaints?show=… lists and what the dashboard's two numbers count, so the number is the rows.
//
// READ ONLY: NOTHING IS MARKED AS SEEN BY THE PRINCIPAL HERE. A number on a dashboard, and the short list a number
// opens, are not the principal reading a complaint. The Complaints screen's own list (listComplaints above) is
// what marks them, when the principal's browser loads it. Not the complaint's words either: those are read there.
//
// The open list and the overdue list are one reading, the second a part of the first, by the one rule for "past
// its due time" (isOverdue above, which the Complaints screen's own list badges by too). The guardian and the
// child are joined loosely, as they are in listComplaints, so a complaint this session may see is never dropped
// because a name is not this session's to read: an open complaint listed here is in that list too.
export async function complaintsShown(db: Sql, schoolId: string, show: ComplaintShow, now: Date = new Date()): Promise<ComplaintShown[]> {
  const { rows } = await db.query(
    `select c.complaint_id, p.name as guardian, s.name as child, o.display_name as owner, c.due_at, c.escalated_at
       from complaints c left join parents p on p.parent_id = c.parent_id left join students s on s.student_id = c.student_id left join users o on o.user_id = c.owner_id
      where c.school_id = $1 and c.status = 'open' order by c.due_at, c.complaint_id limit ${COMPLAINT_ROWS_MAX}`,
    [schoolId]
  );
  const open = rows.map((r): ComplaintShown => ({ complaint_id: r.complaint_id, ref: reference(r.complaint_id), guardian: r.guardian, child: r.child, owner: r.owner, due_at: iso(r.due_at), overdue: isOverdue(r.due_at, now), escalated: Boolean(r.escalated_at) }));
  return show === 'overdue' ? open.filter((c) => c.overdue) : open;
}

// The staff a complaint can be given to, or be about: for the office's form.
export async function complaintStaff(db: PoolClient, schoolId: string): Promise<{ user_id: string; name: string; role: string }[]> {
  return (await db.query(`select user_id, display_name as name, role::text as role from users where school_id = $1 and is_active and role::text = any($2::text[]) order by display_name`, [schoolId, [...COMPLAINT_ROLES]])).rows;
}

type Platform = <T>(fn: (db: PoolClient) => Promise<T>) => Promise<T>;
// At its due time: still open, it is passed to the principal, and the parent is told. A complaint about the
// principal has nobody above it in the school: it stays with its owner and is marked overdue.
export function complaintEscalateHandler(deps: { platform: Platform; queue: Queue; now?: () => Date }): JobHandler {
  return async (job) => {
    const complaintId = job.payload.complaintId;
    if (typeof complaintId !== 'string' || !/^[0-9a-f-]{36}$/i.test(complaintId) || !job.schoolId) throw new PermanentJobError('complaint.escalate: bad payload');
    const schoolId = job.schoolId;
    const now = (deps.now ?? (() => new Date()))();
    await deps.platform(async (db) => {
      const c = (await db.query(`select parent_id, student_id, about_user_id, owner_id, status, due_at, escalated_at from complaints where school_id = $1 and complaint_id = $2 for update`, [schoolId, complaintId])).rows[0];
      if (!c || c.status !== 'open' || c.escalated_at) return;
      if (new Date(c.due_at) > now) throw new Error('complaint.escalate: not due yet');
      // Who it passes to. Usually the principal. A complaint ABOUT the principal goes to the school admin (C200),
      // or to another principal if the school has no admin. Never to the person it is about.
      const staff = (await db.query(`select user_id, role::text as role, display_name from users where school_id = $1 and role::text in ('principal', 'school_admin') and is_active and user_id is distinct from $2 order by created_at, user_id`, [schoolId, c.about_user_id])).rows as { user_id: string; role: string; display_name: string }[];
      const aboutPrincipal = c.about_user_id ? (await db.query(`select 1 from users where school_id = $1 and user_id = $2 and role = 'principal'`, [schoolId, c.about_user_id])).rows.length === 1 : false;
      const order = aboutPrincipal ? ['school_admin', 'principal'] : ['principal'];
      const next = order.map((role) => staff.find((s) => s.role === role)).find(Boolean);
      // Already with someone of that role (another school admin, say): it stays where it is. Only a change of level
      // is a passing on, and only that is told to the parent.
      const ownerRole = staff.find((s) => s.user_id === c.owner_id)?.role;
      const passes = Boolean(next) && next!.user_id !== c.owner_id && ownerRole !== next!.role;
      await db.query(`update complaints set escalated_at = $3, owner_id = coalesce($4, owner_id) where school_id = $1 and complaint_id = $2`, [schoolId, complaintId, now, passes ? next!.user_id : null]);
      // The parent is told only when it really changes hands, in words that say to whom.
      const parentTold = passes ? await tellParent(db, deps.queue, { schoolId, complaintId, parentId: c.parent_id, studentId: c.student_id }, next!.role === 'principal' ? 'escalated' : 'escalated_office', {}) : false;
      await db.query(`insert into complaint_events (school_id, complaint_id, kind, note, parent_told, at) values ($1, $2, 'escalated', $3, $4, $5)`, [schoolId, complaintId, passes ? next!.display_name : null, parentTold, now]);
    });
  };
}
