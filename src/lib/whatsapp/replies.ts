import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { normalizePhone, writtenForms } from './phone';
import type { ProviderName, WhatsAppNotice } from './provider';
import { TEMPLATE_REGISTRY, renderTemplate } from './templates';

// Parents' replies, threaded to the school (docs/25 slice 7f, C187).
//
// One platform number serves every school, so the first question about a
// message that arrives is whose it is. It is given to a school ONLY when
// its number is a guardian's on record there. If the number is a guardian's
// in several schools, it goes to the one that last wrote to that number in
// the past 30 days, if exactly one did. Otherwise it belongs to nobody: it
// is recorded as having arrived, WITHOUT its words and without the number,
// and no school sees it. Never by guess.
//
// STOP (or रोकें, बंद) stops WhatsApp messages from that school to that
// number, at once. WhatsApp only: the consent ledger is not touched, so
// email and everything else go on as the parent agreed. The parent is told
// once, and the office can lift it when the parent asks.

type Sql = Pick<PoolClient, 'query'>;
export const WINDOW_HOURS = 24;
export const STOP_WORDS = /^\s*(stop|unsubscribe|रोकें|रोको|बंद|बंद करें)\s*[.!।]?\s*$/i;
export const isStop = (text: string) => STOP_WORDS.test(text);

export type Received = { kind: 'threaded'; schoolId: string; threadId: string; stop: boolean; confirm?: { logId: string } } | { kind: 'unknown' } | { kind: 'duplicate' };
type Enqueue = (db: Sql, logId: string, schoolId: string) => Promise<unknown>;

// Which school a number belongs to, or null. Exactly one, or none.
export async function schoolOfNumber(db: Sql, e164: string): Promise<{ schoolId: string; parentId: string } | null> {
  const guardians = (await db.query(`select p.school_id, (array_agg(p.parent_id order by p.created_at, p.parent_id))[1] as parent_id from parents p where regexp_replace(p.phone, '[^0-9]', '', 'g') = any($1::text[]) group by p.school_id`, [writtenForms(e164)])).rows as { school_id: string; parent_id: string }[];
  if (guardians.length === 0) return null;
  if (guardians.length === 1) return { schoolId: guardians[0].school_id, parentId: guardians[0].parent_id };
  const wrote = (await db.query(`select distinct school_id from communication_log where school_id = any($1::uuid[]) and regexp_replace(to_phone, '[^0-9]', '', 'g') = any($2::text[]) and status::text in ('sent', 'delivered', 'read') and created_at > now() - interval '30 days'`, [guardians.map((g) => g.school_id), writtenForms(e164)])).rows as { school_id: string }[];
  const one = wrote.length === 1 ? guardians.find((g) => g.school_id === wrote[0].school_id) : undefined;
  return one ? { schoolId: one.school_id, parentId: one.parent_id } : null;
}

// One message from a parent, as the platform role, in the webhook's transaction.
export async function receiveInbound(db: Sql, provider: ProviderName, n: Extract<WhatsAppNotice, { kind: 'inbound' }>, enqueueConfirmation?: Enqueue): Promise<Received> {
  if ((await db.query(`select 1 from inbound_messages where provider = $1 and provider_message_id = $2`, [provider, n.providerMessageId])).rows[0]) return { kind: 'duplicate' };
  const phone = normalizePhone(n.fromPhone);
  const whose = phone ? await schoolOfNumber(db, phone) : null;
  if (!phone || !whose) {
    await db.query(`insert into inbound_messages (school_id, thread_id, provider, provider_message_id, body, is_stop, received_at) values (null, null, $1, $2, null, false, $3)`, [provider, n.providerMessageId, n.at]);
    return { kind: 'unknown' };
  }
  const stop = isStop(n.text);
  const thread = (await db.query(
    `insert into message_threads (school_id, phone, parent_id, last_inbound_at, unread) values ($1, $2, $3, $4, 1)
     on conflict (school_id, phone) do update set last_inbound_at = greatest(message_threads.last_inbound_at, excluded.last_inbound_at), unread = message_threads.unread + 1 returning thread_id`,
    [whose.schoolId, phone, whose.parentId, n.at]
  )).rows[0].thread_id as string;
  await db.query(`insert into inbound_messages (school_id, thread_id, provider, provider_message_id, body, is_stop, received_at) values ($1, $2, $3, $4, $5, $6, $7)`, [whose.schoolId, thread, provider, n.providerMessageId, n.text.slice(0, 4096), stop, n.at]);
  if (!stop) return { kind: 'threaded', schoolId: whose.schoolId, threadId: thread, stop: false };
  const made = await db.query(`insert into whatsapp_opt_outs (school_id, phone, stopped_at) values ($1, $2, $3) on conflict (school_id, phone) where lifted_at is null do nothing`, [whose.schoolId, phone, n.at]);
  if (made.rowCount !== 1) return { kind: 'threaded', schoolId: whose.schoolId, threadId: thread, stop: true }; // already stopped: told once, not again
  await writeAuditLog(db, { schoolId: whose.schoolId, actorUserId: null, actorRole: null, eventAction: 'whatsapp.stopped_by_parent', targetType: 'message_threads', targetId: thread, beforeState: undefined, afterState: { threadId: thread } });
  // The parent is told once, in their own open conversation, in the words written in the code.
  const words = TEMPLATE_REGISTRY.find((t) => t.name === 'messages_stopped');
  const school = (await db.query(`select name from schools where school_id = $1`, [whose.schoolId])).rows[0]?.name as string;
  if (!words || !enqueueConfirmation) return { kind: 'threaded', schoolId: whose.schoolId, threadId: thread, stop: true };
  const logId = (await db.query(
    `insert into communication_log (school_id, to_phone, channel, billing_category, billable, est_cost_paise, gst_paise, cost_basis, status, dedupe_key, parent_id, purpose, thread_id, body, not_before)
     values ($1, $2, 'whatsapp', 'service', false, 0, 0, 'not_billable', 'queued', $3, $4, 'core_records', $5, $6, now()) returning log_id`,
    [whose.schoolId, phone, `stopped:${thread}:${n.providerMessageId}`.slice(0, 200), whose.parentId, thread, renderTemplate(words.body.en, { school })]
  )).rows[0].log_id as string;
  await enqueueConfirmation(db, logId, whose.schoolId);
  return { kind: 'threaded', schoolId: whose.schoolId, threadId: thread, stop: true, confirm: { logId } };
}

export type ThreadRow = { thread_id: string; guardian: string; children: string | null; phone_last4: string; last_inbound_at: string; unread: number; last_text: string | null; window_open: boolean; stopped: boolean };
export type ThreadMessage = { id: string; direction: 'in' | 'out'; at: string; text: string | null; template_name: string | null; status: string | null; by: string | null };
const iso = (v: unknown) => new Date(v as string).toISOString();

// The caller's own tenant transaction: row level security decides which threads a person sees.
export async function listThreads(db: Sql, schoolId: string): Promise<ThreadRow[]> {
  const { rows } = await db.query(
    `select t.thread_id, p.name as guardian, right(t.phone, 4) as phone_last4, t.last_inbound_at, t.unread,
            (select string_agg(s.name, ', ' order by s.name) from parent_student_map m join students s on s.school_id = m.school_id and s.student_id = m.student_id where m.school_id = t.school_id and m.parent_id = t.parent_id) as children,
            (select left(i.body, 140) from inbound_messages i where i.thread_id = t.thread_id order by i.received_at desc limit 1) as last_text,
            t.last_inbound_at > now() - make_interval(hours => $2) as window_open,
            exists (select 1 from whatsapp_opt_outs o where o.school_id = t.school_id and o.phone = t.phone and o.lifted_at is null) as stopped
       from message_threads t join parents p on p.school_id = t.school_id and p.parent_id = t.parent_id
      where t.school_id = $1 order by (t.unread > 0) desc, t.last_inbound_at desc limit 200`,
    [schoolId, WINDOW_HOURS]
  );
  return rows.map((r) => ({ ...r, last_inbound_at: iso(r.last_inbound_at) })) as ThreadRow[];
}

// A thread's messages, oldest first: what the parent wrote, and everything the school sent that number.
export async function threadMessages(db: Sql, schoolId: string, threadId: string): Promise<{ thread: ThreadRow; messages: ThreadMessage[] } | null> {
  const thread = (await listThreads(db, schoolId)).find((t) => t.thread_id === threadId);
  if (!thread) return null;
  const { rows } = await db.query(
    `select * from (
       select i.message_id::text as id, 'in' as direction, i.received_at as at, i.body as text, null::text as template_name, null::text as status, null::text as by
         from inbound_messages i where i.school_id = $1 and i.thread_id = $2
       union all
       select l.log_id::text, 'out', l.created_at, l.body, l.template_name, l.status::text, u.display_name
         from communication_log l join message_threads t on t.school_id = l.school_id and t.thread_id = $2 left join users u on u.user_id = l.sent_by
        where l.school_id = $1 and l.channel = 'whatsapp' and (l.thread_id = $2 or regexp_replace(l.to_phone, '[^0-9]', '', 'g') = any($3::text[]))
     ) m order by at desc limit 200`,
    [schoolId, threadId, writtenForms((await db.query(`select phone from message_threads where school_id = $1 and thread_id = $2`, [schoolId, threadId])).rows[0].phone as string)]
  );
  return { thread, messages: rows.reverse().map((r) => ({ ...r, at: iso(r.at) })) as ThreadMessage[] };
}

export async function markThreadRead(db: Sql, schoolId: string, threadId: string): Promise<void> {
  await db.query(`update message_threads set unread = 0 where school_id = $1 and thread_id = $2 and unread > 0`, [schoolId, threadId]);
}

export type LiftResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'reason' | 'not_found' };
// The parent has asked the office to start messages again. A named person, a reason, audited.
export async function liftOptOut(db: Sql, actor: { schoolId: string; userId: string; role: StaffRole }, threadId: string, reasonRaw: string): Promise<LiftResult> {
  if (actor.role !== 'principal' && actor.role !== 'school_admin') return { ok: false, reason: 'not_allowed' };
  const reason = reasonRaw.trim().replace(/\s+/g, ' ').slice(0, 300);
  if (!reason) return { ok: false, reason: 'reason' };
  const done = await db.query(`update whatsapp_opt_outs o set lifted_at = now(), lifted_by = $3, lift_reason = $4 from message_threads t where t.school_id = $1 and t.thread_id = $2 and o.school_id = t.school_id and o.phone = t.phone and o.lifted_at is null`, [actor.schoolId, threadId, actor.userId, reason]);
  if (done.rowCount !== 1) return { ok: false, reason: 'not_found' };
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'whatsapp.stop_lifted', targetType: 'message_threads', targetId: threadId, beforeState: undefined, afterState: { reason } });
  return { ok: true };
}

// Messages from numbers no school knows, for the founder: how many, never what or from whom.
export async function unknownSenders(db: Sql): Promise<number> {
  return Number((await db.query(`select count(*) as n from inbound_messages where school_id is null and received_at > now() - interval '30 days'`)).rows[0].n);
}
