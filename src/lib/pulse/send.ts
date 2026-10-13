import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import type { JobQueue } from '@/lib/jobs/types';
import { queueWhatsAppMessage } from '@/lib/whatsapp/gate';
import { normalizePhone } from '@/lib/whatsapp/phone';

// Sending the day's Pulse (docs/25 slice 7h, C189).
//
// Only a message a person has marked READY can be sent, and only by a
// person pressing send: nothing a machine wrote reaches a parent unread
// (C116). It goes to the guardians of the class's children, each through the
// one gate, under the consent purpose `daily_pulse`: a family that has not
// agreed to the Pulse is held, and shown as held.
//
// The words are the school's own for that day, carried in one template
// ("<School>: <the day's update> Reply 1 … or 2 …"). English for now: the
// app does not yet know which language each family reads.

type Actor = { schoolId: string; userId: string; role: StaffRole };
const STAFF: readonly string[] = ['principal', 'school_admin', 'teacher'];
// A template value is one line: Meta refuses new lines, tabs and long runs of spaces inside one.
export const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

export type SendPulseResult = { ok: true; queued: number; held: number; withoutNumber: number } | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_ready' | 'already_sent' | 'nobody' };

export async function sendPulse(db: PoolClient, queue: JobQueue, actor: Actor, pulseId: string): Promise<SendPulseResult> {
  if (!STAFF.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  // Row level security shows a teacher only their own classes' messages.
  const pulse = (await db.query(`select class_id, status, body_en from pulse_messages where school_id = $1 and pulse_id = $2 for update`, [actor.schoolId, pulseId])).rows[0];
  if (!pulse) return { ok: false, reason: 'not_found' };
  if (pulse.status === 'sent') return { ok: false, reason: 'already_sent' };
  if (pulse.status !== 'ready' || !oneLine(pulse.body_en)) return { ok: false, reason: 'not_ready' };
  const guardians = (await db.query(
    `select s.student_id, p.parent_id, p.phone
       from students s join parent_student_map m on m.school_id = s.school_id and m.student_id = s.student_id
       join parents p on p.school_id = m.school_id and p.parent_id = m.parent_id
      where s.school_id = $1 and s.class_id = $2 and s.status = 'active' order by s.name, s.student_id, p.created_at, p.parent_id`,
    [actor.schoolId, pulse.class_id]
  )).rows as { student_id: string; parent_id: string; phone: string | null }[];
  const out = { queued: 0, held: 0, withoutNumber: 0 };
  const told = new Set<string>();
  for (const g of guardians) {
    const phone = normalizePhone(String(g.phone ?? ''));
    if (!phone) {
      out.withoutNumber += 1;
      continue;
    }
    // One message per child and number, however many guardian rows share the number.
    if (told.has(`${g.student_id}:${phone}`)) continue;
    told.add(`${g.student_id}:${phone}`);
    const r = await queueWhatsAppMessage(db, queue, { schoolId: actor.schoolId, studentId: g.student_id, parentId: g.parent_id, purpose: 'daily_pulse', toPhone: phone, templateName: 'daily_pulse', templateParams: { update: oneLine(pulse.body_en) }, dedupeKey: `pulse:${pulseId}:${g.student_id}:${g.parent_id}` });
    if (r.status === 'queued') out.queued += 1;
    else out.held += 1;
  }
  if (out.queued + out.held === 0) return { ok: false, reason: 'nobody' };
  await db.query(`update pulse_messages set status = 'sent', sent_by = $3, sent_at = now() where school_id = $1 and pulse_id = $2`, [actor.schoolId, pulseId, actor.userId]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'pulse.sent', targetType: 'pulse_messages', targetId: pulseId, beforeState: { status: 'ready' }, afterState: { status: 'sent', ...out } });
  return { ok: true, ...out };
}
