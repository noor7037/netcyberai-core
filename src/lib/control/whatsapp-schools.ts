import { writeAuditLog } from '@/lib/audit/log';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { QueueLike } from '@/lib/whatsapp/gate';
import { WHATSAPP_SEND_JOB } from '@/lib/whatsapp/gate';
import type { Sql } from '@/lib/jobs/types';

// Control → WhatsApp, per school (W21-M6): each school's number and its status, and today's sends, failures and
// messages the gate stopped, from the delivery log (communication_log, India's day). Below it, the held queue: the
// queued messages not yet sent, with no number, no name and no words (a template, a purpose and times only).
//
// "Release" puts a held message's send job back now. It is offered only where the gate allows it: the message is
// still queued, not being sent, not held by the school's quiet hours (the gate sends it when they end), and its school
// is not in pilot. Every rule is read again when it goes (src/lib/whatsapp/gate.ts deliverQueued), so a release never
// sends what the gate would refuse. Each release needs a reason and writes one platform audit row.

export type SchoolWhatsApp = {
  schoolId: string;
  schoolName: string;
  isFixture: boolean;
  pilotNoOutbound: boolean;
  // The school's own number (its display form) when it has its own account; null: the platform's number.
  number: string | null;
  status: string; // the school account's status, or 'platform_default'
  sentToday: number;
  failedToday: number;
  stoppedToday: number;
  queued: number;
};
export type HeldMessage = { logId: string; schoolId: string; schoolName: string; template: string; purpose: string | null; createdAt: string; notBefore: string | null; attempts: number; releasable: boolean; heldBy: 'quiet_hours' | 'pilot' | 'sending' | null };

const TODAY = `(c.created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date`;
const SENT = `('sent', 'delivered', 'read')`;
const FAILED = `('failed', 'uncertain')`;

export async function loadWhatsAppSchools(db: Sql): Promise<{ schools: SchoolWhatsApp[]; held: HeldMessage[] }> {
  const { rows } = await db.query(
    `select s.school_id, s.name, s.is_test_fixture, (s.is_pilot and not s.pilot_allow_outbound) as pilot_no_outbound,
            w.phone_number_display, w.status::text as config_status,
            count(c.log_id) filter (where ${TODAY} and c.status::text in ${SENT})::int as sent_today,
            count(c.log_id) filter (where ${TODAY} and c.status::text in ${FAILED})::int as failed_today,
            count(c.log_id) filter (where ${TODAY} and c.status::text like 'blocked\\_%')::int as stopped_today,
            count(c.log_id) filter (where c.status::text = 'queued')::int as queued
       from schools s
       left join school_whatsapp_configs w on w.school_id = s.school_id
       left join communication_log c on c.school_id = s.school_id and c.channel = 'whatsapp'
      group by s.school_id, s.name, s.is_test_fixture, s.is_pilot, s.pilot_allow_outbound, w.phone_number_display, w.status
      order by s.name`
  );
  const schools = rows.map((r: Record<string, unknown>) => ({
    schoolId: String(r.school_id),
    schoolName: String(r.name),
    isFixture: Boolean(r.is_test_fixture),
    pilotNoOutbound: Boolean(r.pilot_no_outbound),
    number: r.config_status === 'active' ? ((r.phone_number_display as string | null) ?? null) : null,
    status: (r.config_status as string | null) ?? 'platform_default',
    sentToday: Number(r.sent_today),
    failedToday: Number(r.failed_today),
    stoppedToday: Number(r.stopped_today),
    queued: Number(r.queued),
  }));
  const held = (
    await db.query(
      `select c.log_id::text, c.school_id, s.name as school_name, c.template_name, c.purpose::text as purpose, c.created_at, c.not_before, c.attempts, c.sending_at,
              (s.is_pilot and not s.pilot_allow_outbound) as pilot_no_outbound, coalesce(c.not_before > now(), false) as waiting
         from communication_log c join schools s on s.school_id = c.school_id
        where c.status::text = 'queued' and c.channel = 'whatsapp'
        order by c.created_at
        limit 200`
    )
  ).rows.map((r: Record<string, unknown>): HeldMessage => {
    const heldBy = r.sending_at ? 'sending' : r.pilot_no_outbound ? 'pilot' : r.waiting ? 'quiet_hours' : null;
    return {
      logId: String(r.log_id),
      schoolId: String(r.school_id),
      schoolName: String(r.school_name),
      template: String(r.template_name),
      purpose: (r.purpose as string | null) ?? null,
      createdAt: new Date(r.created_at as string).toISOString(),
      notBefore: r.not_before ? new Date(r.not_before as string).toISOString() : null,
      attempts: Number(r.attempts ?? 0),
      releasable: heldBy === null,
      heldBy,
    };
  });
  return { schools, held };
}

export type ReleaseResult = { ok: true } | { ok: false; code: 'not_found' | 'reason_required' | 'quiet_hours' | 'pilot' | 'sending' };

// One held message's send job, put back now, where the gate allows it (see the top of this file).
export async function releaseHeld(db: Sql, queue: QueueLike, by: { userId: string }, raw: { logId?: unknown; reason?: unknown }, now: Date = new Date()): Promise<ReleaseResult> {
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (reason.length < 3 || reason.length > 200) return { ok: false, code: 'reason_required' };
  if (!isUuid(raw.logId)) return { ok: false, code: 'not_found' };
  const logId = raw.logId as string;
  const r = (
    await db.query(
      `select c.school_id, c.attempts, c.sending_at, c.not_before, (s.is_pilot and not s.pilot_allow_outbound) as pilot_no_outbound
         from communication_log c join schools s on s.school_id = c.school_id
        where c.log_id = $1::uuid and c.status::text = 'queued' and c.channel = 'whatsapp' for update of c`,
      [logId]
    )
  ).rows[0];
  if (!r) return { ok: false, code: 'not_found' };
  if (r.sending_at) return { ok: false, code: 'sending' };
  if (r.pilot_no_outbound) return { ok: false, code: 'pilot' };
  if (r.not_before && new Date(r.not_before).getTime() > now.getTime()) return { ok: false, code: 'quiet_hours' };
  await db.query(`update communication_log set not_before = $2 where log_id = $1::uuid and status::text = 'queued'`, [logId, now.toISOString()]);
  await queue.enqueue(db, { type: WHATSAPP_SEND_JOB, idempotencyKey: `${WHATSAPP_SEND_JOB}:${logId}:release:${now.getTime()}`, schoolId: r.school_id, maxAttempts: 3, payload: { logId, attempt: Number(r.attempts ?? 0) } });
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: by.userId,
    actorRole: 'super_admin',
    eventAction: 'whatsapp.held_released',
    targetType: 'communication_log',
    targetId: logId,
    afterState: { school_id: r.school_id, attempts: Number(r.attempts ?? 0), change_reason: reason },
  });
  return { ok: true };
}
