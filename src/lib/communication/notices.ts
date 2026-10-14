import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import type { JobQueue } from '@/lib/jobs/types';
import { queueWhatsAppMessage } from '@/lib/whatsapp/gate';
import { normalizePhone } from '@/lib/whatsapp/phone';

// Notices to parents (docs/25 slice 7i, C191).
//
//   - Written by staff: a teacher for their own classes, the office for any
//     class or for the whole school. Row level security holds that.
//   - NOTHING SENDS UNAPPROVED. A notice waits for the principal; approving
//     it is what sends it, to the guardians of that class's children, each
//     through the one gate (consent, STOP, quiet hours, the budget).
//   - A notice's words never change. A wrong one is rejected, with a reason
//     the writer sees, and written again.
//   - Who received and who read it is counted from the message log.

type Actor = { schoolId: string; userId: string; role: StaffRole };
const STAFF: readonly string[] = ['principal', 'school_admin', 'teacher'];
export const MAX_NOTICE = 600;
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

export type Notice = { notice_id: string; class_id: string | null; class_name: string | null; body: string; status: 'waiting' | 'sent' | 'rejected'; written_by_name: string | null; written_at: string; decided_by_name: string | null; reject_reason: string | null; on_its_way: number; delivered: number; read: number; held: number };
// The counts are read in one pass over the school's notice messages (their key is "notice:<id>:<child>:<guardian>").
const SELECT = `select n.notice_id, n.class_id, c.name as class_name, n.body, n.status, w.display_name as written_by_name, n.written_at, d.display_name as decided_by_name, n.reject_reason,
         coalesce(k.on_its_way, 0) as on_its_way, coalesce(k.delivered, 0) as delivered, coalesce(k.read, 0) as read, coalesce(k.held, 0) as held
    from class_notices n
    left join classes c on c.school_id = n.school_id and c.class_id = n.class_id
    left join users w on w.user_id = n.written_by
    left join users d on d.user_id = n.decided_by
    left join (select l.school_id, split_part(l.dedupe_key, ':', 2) as notice_id,
                      (count(*) filter (where l.status::text in ('queued', 'sent', 'uncertain')))::int as on_its_way,
                      (count(*) filter (where l.status::text in ('delivered', 'read')))::int as delivered,
                      (count(*) filter (where l.status::text = 'read'))::int as read,
                      (count(*) filter (where l.status::text like 'blocked_%' or l.status::text = 'failed'))::int as held
                 from communication_log l where l.dedupe_key like 'notice:%' group by 1, 2) k on k.school_id = n.school_id and k.notice_id = n.notice_id::text`;
const shape = (r: Record<string, unknown>): Notice => ({ ...(r as unknown as Notice), written_at: new Date(r.written_at as string).toISOString() });

// `only: 'waiting'` (docs/26 slice 8d, C203): the notices that still wait for the principal, the oldest first.
// It is what /app/communication?show=notices lists and what the dashboard's number counts, so the two are the
// same rows.
export const NOTICE_ROWS_MAX = 500;
export async function listNotices(db: PoolClient, schoolId: string, only?: 'waiting'): Promise<Notice[]> {
  if (only === 'waiting') return (await db.query(`${SELECT} where n.school_id = $1 and n.status = 'waiting' order by n.written_at, n.notice_id limit ${NOTICE_ROWS_MAX}`, [schoolId])).rows.map(shape);
  return (await db.query(`${SELECT} where n.school_id = $1 order by (n.status = 'waiting') desc, n.written_at desc limit 100`, [schoolId])).rows.map(shape);
}

// The classes a person may write a notice for: a teacher's own; for the office, all.
export async function noticeClasses(db: PoolClient, actor: Actor): Promise<{ class_id: string; name: string }[]> {
  if (!STAFF.includes(actor.role)) return [];
  return (await db.query(`select class_id, name from classes where school_id = $1 and ($2 <> 'teacher' or class_id in (select unnest(public.teacher_own_class_ids()))) order by name`, [actor.schoolId, actor.role])).rows;
}

export type WriteResult = { ok: true; noticeId: string } | { ok: false; reason: 'not_allowed' | 'words' | 'class' | 'whole_school' };
export async function writeNotice(db: PoolClient, actor: Actor, input: { classId: string | null; body: string }): Promise<WriteResult> {
  if (!STAFF.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const body = input.body.trim();
  if (!body || body.length > MAX_NOTICE) return { ok: false, reason: 'words' };
  if (input.classId === null && actor.role === 'teacher') return { ok: false, reason: 'whole_school' };
  if (input.classId !== null && !(await noticeClasses(db, actor)).some((c) => c.class_id === input.classId)) return { ok: false, reason: 'class' };
  const id = (await db.query(`insert into class_notices (school_id, class_id, body, written_by) values ($1, $2, $3, $4) returning notice_id`, [actor.schoolId, input.classId, body, actor.userId])).rows[0].notice_id as string;
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'notice.written', targetType: 'class_notices', targetId: id, beforeState: undefined, afterState: { classId: input.classId, length: body.length } });
  return { ok: true, noticeId: id };
}

export type DecideResult = { ok: true; queued: number; held: number; withoutNumber: number } | { ok: false; reason: 'not_allowed' | 'not_found' | 'already_decided' | 'reason' | 'nobody' };

// The principal approves: that is what sends it. Or rejects, with a reason for the writer.
export async function decideNotice(db: PoolClient, queue: JobQueue, actor: Actor, noticeId: string, decision: { approve: true } | { approve: false; reason: string }): Promise<DecideResult> {
  if (actor.role !== 'principal') return { ok: false, reason: 'not_allowed' };
  const notice = (await db.query(`select n.class_id, n.body, n.status, c.name as class_name from class_notices n left join classes c on c.school_id = n.school_id and c.class_id = n.class_id where n.school_id = $1 and n.notice_id = $2 for update of n`, [actor.schoolId, noticeId])).rows[0];
  if (!notice) return { ok: false, reason: 'not_found' };
  if (notice.status !== 'waiting') return { ok: false, reason: 'already_decided' };
  if (!decision.approve) {
    const reason = decision.reason.trim().replace(/\s+/g, ' ').slice(0, 300);
    if (!reason) return { ok: false, reason: 'reason' };
    await db.query(`update class_notices set status = 'rejected', decided_by = $3, decided_at = now(), reject_reason = $4 where school_id = $1 and notice_id = $2`, [actor.schoolId, noticeId, actor.userId, reason]);
    await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'notice.rejected', targetType: 'class_notices', targetId: noticeId, beforeState: { status: 'waiting' }, afterState: { status: 'rejected' } });
    return { ok: true, queued: 0, held: 0, withoutNumber: 0 };
  }
  const guardians = (await db.query(
    `select s.student_id, p.parent_id, p.phone
       from students s join parent_student_map m on m.school_id = s.school_id and m.student_id = s.student_id
       join parents p on p.school_id = m.school_id and p.parent_id = m.parent_id
      where s.school_id = $1 and s.status = 'active' and ($2::uuid is null or s.class_id = $2) order by s.name, s.student_id, p.created_at, p.parent_id`,
    [actor.schoolId, notice.class_id]
  )).rows as { student_id: string; parent_id: string; phone: string | null }[];
  const out = { queued: 0, held: 0, withoutNumber: 0 };
  // A parent of two children in the class (or the school) gets the notice once.
  const told = new Set<string>();
  for (const g of guardians) {
    const phone = normalizePhone(String(g.phone ?? ''));
    if (!phone) {
      out.withoutNumber += 1;
      continue;
    }
    if (told.has(phone)) continue;
    told.add(phone);
    const r = await queueWhatsAppMessage(db, queue, { schoolId: actor.schoolId, studentId: g.student_id, parentId: g.parent_id, purpose: 'operational_communication', toPhone: phone, templateName: 'class_notice', templateParams: { class: notice.class_name ?? 'All classes', notice: oneLine(notice.body) }, dedupeKey: `notice:${noticeId}:${g.student_id}:${g.parent_id}` });
    if (r.status === 'queued') out.queued += 1;
    else out.held += 1;
  }
  if (out.queued + out.held === 0) return { ok: false, reason: 'nobody' };
  await db.query(`update class_notices set status = 'sent', decided_by = $3, decided_at = now() where school_id = $1 and notice_id = $2`, [actor.schoolId, noticeId, actor.userId]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'notice.approved_and_sent', targetType: 'class_notices', targetId: noticeId, beforeState: { status: 'waiting' }, afterState: { status: 'sent', ...out } });
  return { ok: true, ...out };
}
