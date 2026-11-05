import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { decideNotice } from '@/lib/communication/notices';
import type { JobQueue } from '@/lib/jobs/types';
import { classLabel } from '@/lib/frameworks/class-label';
import { classOrderSql } from '@/lib/classes/class-order';
import { CHRONIC, chronicAbsence, reasonText, type ChronicReason, type DayStatus, type SchoolDay } from '@/lib/early-warning/chronic-absence';

// The chronic absence list and "Tell the family" (W20-B, docs/42 H2). The rule is src/lib/early-warning/chronic-absence.ts.
// Row level security decides whose students come back (a teacher: own classes; the office: all). Telling the family is the
// principal's tap: it writes a notice for that one child's guardians and approves it in the same step, so it goes by the
// same three ways as every notice (Family app, email, WhatsApp through the one gate when the school has it).

type Actor = { schoolId: string; userId: string; role: StaffRole };
export const LIST_ROLES: readonly string[] = ['principal', 'school_admin', 'teacher'];
export const TELL_ROLES: readonly string[] = ['principal'];
// Calendar days read back to find the class's last 30 school days (holidays and weekends included).
const LOOKBACK_DAYS = 90;

export type ChronicRow = {
  studentId: string;
  name: string;
  classId: string;
  className: string;
  reasons: ChronicReason[];
  // India's date the family was last told about this child, and the days since; null when never.
  toldOn: string | null;
  daysSinceTold: number | null;
  // Told within the last 7 days: the button is off until this date.
  tellAgainOn: string | null;
};

export async function chronicList(db: PoolClient, schoolId: string, today: string): Promise<ChronicRow[]> {
  const from = (await db.query(`select ($1::date - $2::int)::text as d`, [today, LOOKBACK_DAYS])).rows[0].d as string;
  // The class's school days: dates on which any of its students has a mark.
  const classDays = new Map<string, string[]>();
  for (const r of (await db.query(`select a.class_id, a.date::text as d from attendance a where a.school_id = $1 and a.date between $2::date and $3::date group by a.class_id, a.date order by a.class_id, a.date desc`, [schoolId, from, today])).rows) {
    const list = classDays.get(r.class_id) ?? [];
    if (list.length < CHRONIC.rateDays) list.push(r.d);
    classDays.set(r.class_id, list);
  }
  // Students with at least 3 absences since then (every part of the rule needs that many); then their marks.
  const marks = (await db.query(
    `select s.student_id, s.name, s.class_id, c.name as class_name, c.section, a.date::text as d, a.status
       from students s join classes c on c.school_id = s.school_id and c.class_id = s.class_id
       join attendance a on a.school_id = s.school_id and a.student_id = s.student_id and a.date between $2::date and $3::date
      where s.school_id = $1 and s.status in ('active', 'pending_consent')
        and s.student_id in (select x.student_id from attendance x where x.school_id = $1 and x.date between $2::date and $3::date and x.status = 'absent' group by x.student_id having count(*) >= $4)
      order by ${classOrderSql('c')}, s.name, s.student_id`,
    [schoolId, from, today, CHRONIC.recentAbsences]
  )).rows as { student_id: string; name: string; class_id: string; class_name: string | null; section: string | null; d: string; status: DayStatus }[];
  const byStudent = new Map<string, { name: string; classId: string; className: string; marks: Map<string, DayStatus> }>();
  for (const m of marks) {
    const e = byStudent.get(m.student_id) ?? { name: m.name, classId: m.class_id, className: classLabel(m.class_name, m.section) ?? '', marks: new Map() };
    e.marks.set(m.d, m.status);
    byStudent.set(m.student_id, e);
  }
  const told = new Map<string, string>();
  for (const r of (await db.query(`select student_id, (max(decided_at) at time zone 'Asia/Kolkata')::date::text as d from class_notices where school_id = $1 and kind = 'chronic_absence' and status = 'sent' group by student_id`, [schoolId])).rows) told.set(r.student_id, r.d);
  const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
  const out: ChronicRow[] = [];
  for (const [studentId, e] of byStudent) {
    const school: SchoolDay[] = (classDays.get(e.classId) ?? []).map((date) => ({ date, status: e.marks.get(date) ?? null }));
    const result = chronicAbsence(school);
    if (!result.chronic) continue;
    const toldOn = told.get(studentId) ?? null;
    const since = toldOn ? days(today, toldOn) : null;
    out.push({
      studentId,
      name: e.name,
      classId: e.classId,
      className: e.className,
      reasons: result.reasons,
      toldOn,
      daysSinceTold: since,
      tellAgainOn: toldOn && since !== null && since < CHRONIC.tellOnceInDays ? new Date(Date.parse(toldOn) + CHRONIC.tellOnceInDays * 86_400_000).toISOString().slice(0, 10) : null,
    });
  }
  return out;
}

// Plain words to the family, in English and Hindi: the child by first name only, the days as a fact, no marks and no judgement.
export function familyNoticeBody(firstName: string, reason: ChronicReason): string {
  const en = reason.kind === 'consecutive'
    ? `${firstName} has not been in school for the last ${reason.days} school days.`
    : `${firstName} has been absent on ${reason.absent} of the last ${reason.of} school days.`;
  const hi = reason.kind === 'consecutive'
    ? `${firstName} पिछले ${reason.days} स्कूली दिनों से स्कूल नहीं आया/आई है।`
    : `${firstName} पिछले ${reason.of} स्कूली दिनों में से ${reason.absent} दिन अनुपस्थित रहा/रही है।`;
  return `${en} Please tell the school office how ${firstName} is, and if there is anything we can do to help.\n\n${hi} कृपया स्कूल कार्यालय को बताइए कि ${firstName} कैसा/कैसी है, और हम किस तरह मदद कर सकते हैं।`;
}

export type TellResult =
  | { ok: true; noticeId: string; queued: number; held: number; inApp: number; byEmail: number }
  | { ok: false; reason: 'not_allowed' | 'not_chronic' | 'told_recently' | 'nobody'; tellAgainOn?: string };

export async function tellFamily(db: PoolClient, queue: JobQueue, actor: Actor, studentId: string, today: string, opts: { whatsappLive?: boolean } = {}): Promise<TellResult> {
  if (!TELL_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  // One tell at a time for one student, so two taps cannot both pass the 7-day check.
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`chronic:${studentId}`]);
  const row = (await chronicList(db, actor.schoolId, today)).find((r) => r.studentId === studentId);
  if (!row) return { ok: false, reason: 'not_chronic' };
  if (row.tellAgainOn) return { ok: false, reason: 'told_recently', tellAgainOn: row.tellAgainOn };
  const first = row.name.trim().split(/\s+/)[0] ?? row.name;
  const body = familyNoticeBody(first, row.reasons[0]);
  await db.query('savepoint chronic_tell');
  const noticeId = (await db.query(
    `insert into class_notices (school_id, class_id, student_id, kind, body, written_by) values ($1, $2, $3, 'chronic_absence', $4, $5) returning notice_id`,
    [actor.schoolId, row.classId, studentId, body, actor.userId]
  )).rows[0].notice_id as string;
  const sent = await decideNotice(db, queue, actor, noticeId, { approve: true }, opts);
  // Nobody to tell (no linked app, no address, no number): the notice is not left waiting.
  if (!sent.ok) {
    await db.query('rollback to savepoint chronic_tell');
    return { ok: false, reason: 'nobody' };
  }
  await writeAuditLog(db, {
    schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'attendance.chronic_told', targetType: 'students', targetId: studentId,
    beforeState: undefined, afterState: { noticeId, reasons: row.reasons.map(reasonText), inApp: sent.inApp, byEmail: sent.byEmail, whatsappQueued: sent.queued },
  });
  return { ok: true, noticeId, queued: sent.queued, held: sent.held, inApp: sent.inApp, byEmail: sent.byEmail };
}
