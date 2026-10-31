import { randomUUID } from 'crypto';
import { writeAuditLog } from '@/lib/audit/log';
import { EmailNotConfiguredError, type EmailSender } from '@/lib/email/sender';
import { hasDevanagari, renderEmail } from '@/lib/email/templates';
import { MAX_REPLY_BODY, type LeadReply } from '@/lib/control/leads';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { PermanentJobError, type JobHandler, type JobQueue, type Sql } from '@/lib/jobs/types';

// Replies to a website lead (W12-F), email only. Two kinds, both sent by one job type and recorded in lead_replies
// only after the email service accepted the message:
//   first_reply  queued by the public intake route two minutes after lead_received, when the switch
//                'leads.auto_reply' is on. At sending time it is sent only if the lead is still 'new', no reply was
//                recorded yet and the switch is still on; then the lead becomes 'contacted'.
//   manual       a reply a super_admin typed in Control -> Leads; its words leave the job once it is finished.

export const LEAD_REPLY_JOB = 'lead.reply';
export const AUTO_REPLY_SETTING = 'leads.auto_reply';
export const FIRST_REPLY_DELAY_MS = 2 * 60_000;
export { MAX_REPLY_BODY };

// A missing row reads as on (the migration writes 'on').
export async function autoReplyOn(db: Sql): Promise<boolean> {
  const { rows } = await db.query(`select value from control.settings where key = $1`, [AUTO_REPLY_SETTING]);
  return rows.length === 0 || rows[0].value !== 'off';
}

// One platform audit row per change, with the before and after, like ai.testing_mode.
export async function setAutoReply(db: Sql, userId: string, on: boolean): Promise<void> {
  const before = (await db.query(`select value from control.settings where key = $1`, [AUTO_REPLY_SETTING])).rows[0]?.value ?? null;
  const value = on ? 'on' : 'off';
  await db.query(
    `insert into control.settings (key, value, updated_by) values ($1, $2::jsonb, $3)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [AUTO_REPLY_SETTING, JSON.stringify(value), userId]
  );
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: userId,
    actorRole: 'super_admin',
    eventAction: 'leads.auto_reply_changed',
    targetType: 'setting',
    targetId: AUTO_REPLY_SETTING,
    beforeState: { key: AUTO_REPLY_SETTING, value: before },
    afterState: { key: AUTO_REPLY_SETTING, value },
  });
}

// As the platform role, after the lead is stored. Returns the job's key, or null when the switch is off.
export async function queueFirstReply(db: Sql, queue: Pick<JobQueue, 'enqueue'>, leadId: string, now: Date = new Date()): Promise<string | null> {
  if (!(await autoReplyOn(db))) return null;
  const key = `${LEAD_REPLY_JOB}:first_reply:${leadId}`;
  await queue.enqueue(db, { type: LEAD_REPLY_JOB, idempotencyKey: key, payload: { leadId, kind: 'first_reply' }, maxAttempts: 4, runAt: new Date(now.getTime() + FIRST_REPLY_DELAY_MS) });
  return key;
}

export function parseManualReply(body: unknown): { leadId: string; text: string } | null {
  const b = body as Record<string, unknown> | null;
  if (!b || !isUuid(b.leadId) || typeof b.body !== 'string') return null;
  const text = b.body.trim();
  if (!text || text.length > MAX_REPLY_BODY) return null;
  return { leadId: b.leadId, text };
}

// In the staff transaction. A lead without an email address cannot be answered here.
export async function queueManualReply(
  db: Sql,
  queue: Pick<JobQueue, 'enqueue'>,
  input: { leadId: string; text: string; by: string }
): Promise<{ key: string } | { error: 'not_found' | 'no_email' }> {
  const { rows } = await db.query(`select contact_email from leads where lead_id = $1`, [input.leadId]);
  if (!rows[0]) return { error: 'not_found' };
  if (!rows[0].contact_email) return { error: 'no_email' };
  const key = `${LEAD_REPLY_JOB}:manual:${randomUUID()}`;
  await queue.enqueue(db, { type: LEAD_REPLY_JOB, idempotencyKey: key, payload: { leadId: input.leadId, kind: 'manual', body: input.text, by: input.by }, maxAttempts: 4 });
  return { key };
}

export async function listReplies(db: Sql, leadId: string): Promise<LeadReply[]> {
  const { rows } = await db.query(`select reply_id, kind, channel, sent_at, body from lead_replies where lead_id = $1 order by sent_at desc, reply_id`, [leadId]);
  return rows.map((r) => ({
    replyId: r.reply_id as string,
    kind: r.kind as LeadReply['kind'],
    channel: 'email',
    sentAt: r.sent_at instanceof Date ? r.sent_at.toISOString() : String(r.sent_at),
    body: r.body as string,
  }));
}

export type LeadReplyDeps = {
  sender: () => EmailSender | null;
  platform: <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
};

type LeadRow = { status: string; school_name: string; contact_name: string; contact_email: string | null; requirements: string | null };

export function leadReplyHandler(deps: LeadReplyDeps): JobHandler {
  return async (job) => {
    const p = job.payload as Record<string, unknown>;
    const kind = p.kind;
    if (!isUuid(p.leadId) || (kind !== 'first_reply' && kind !== 'manual')) throw new PermanentJobError('lead.reply payload is invalid');
    const leadId = p.leadId;
    if (kind === 'manual' && (typeof p.body !== 'string' || !p.body || p.body.length > MAX_REPLY_BODY || !isUuid(p.by))) {
      throw new PermanentJobError('lead.reply manual payload is invalid');
    }

    const lead = await deps.platform(async (db): Promise<LeadRow | null> => {
      const { rows } = await db.query(`select status, school_name, contact_name, contact_email, requirements from leads where lead_id = $1`, [leadId]);
      const row = rows[0] as LeadRow | undefined;
      if (!row) return null;
      if (kind === 'first_reply') {
        // Read again at sending time: the founder may have replied, changed the status or switched it off meanwhile.
        if (row.status !== 'new' || !(await autoReplyOn(db))) return null;
        const { rows: had } = await db.query(`select 1 from lead_replies where lead_id = $1 limit 1`, [leadId]);
        if (had.length) return null;
      }
      return row;
    });
    if (!lead) return { redact: ['body'] };
    if (!lead.contact_email) throw new PermanentJobError('the lead has no email address');

    const rendered =
      kind === 'first_reply'
        ? renderEmail('lead_first_reply', { schoolName: lead.school_name, contactName: lead.contact_name, hindi: hasDevanagari(lead.requirements ?? '') })
        : renderEmail('lead_manual_reply', { schoolName: lead.school_name, body: p.body });
    const sender = deps.sender();
    if (!sender) throw new EmailNotConfiguredError();
    const { providerId } = await sender.send({ to: [lead.contact_email], ...rendered, idempotencyKey: job.idempotencyKey });

    await deps.platform(async (db) => {
      await db.query(
        `insert into lead_replies (lead_id, channel, kind, provider_id, body, "by") values ($1, 'email', $2, $3, $4, $5) on conflict do nothing`,
        [leadId, kind, providerId, rendered.text.slice(0, MAX_REPLY_BODY), kind === 'manual' ? p.by : null]
      );
      await db.query(`update leads set status = 'contacted', status_changed_at = now(), updated_at = now() where lead_id = $1 and status = 'new'`, [leadId]);
    });
    return { redact: ['body'] };
  };
}
