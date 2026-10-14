import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { noteEventReply } from '@/lib/events/events';
import { notePtmReply, type PtmQueue } from '@/lib/ptm/ptm';
import { notePulseReply } from '@/lib/pulse/replies';
import { HOLD_HOURS, chosenSchool, openHeld, phoneDigest, sealHeld } from './held';
import { normalizePhone, writtenForms } from './phone';
import type { ProviderName, WhatsAppNotice } from './provider';
import { TEMPLATE_REGISTRY, renderTemplate } from './templates';

// Parents' replies, threaded to the school (docs/25 slice 7f, C187).
//
// One platform number serves every school, so the first question about a
// message that arrives is whose it is. It is given to a school ONLY when
// its number is a guardian's on record there. If the number is a guardian's
// in several schools, it goes to the one that wrote to that number in the
// last 24 hours, if exactly one did. If none did, the parent is ASKED which
// school it is about (C190): the message is held for 24 hours, sealed, and
// goes to the school they choose, or is dropped. A number no school knows
// is recorded as having arrived, WITHOUT its words and without the number.
// Never by guess.
//
// STOP (or रोकें, बंद) stops WhatsApp messages from that school to that
// number, at once. WhatsApp only: the consent ledger is not touched, so
// email and everything else go on as the parent agreed. The parent is told
// once, and the office can lift it when the parent asks.

type Sql = Pick<PoolClient, 'query'>;
export const WINDOW_HOURS = 24;
export const STOP_WORDS = /^\s*(stop|unsubscribe|रोकें|रोको|बंद|बंद करें)\s*[.!।]?\s*$/i;
export const isStop = (text: string) => STOP_WORDS.test(text);

export type Received = { kind: 'threaded'; schoolId: string; threadId: string; stop: boolean; confirm?: { logId: string } } | { kind: 'held'; heldId: string } | { kind: 'unknown' } | { kind: 'duplicate' };
// How the webhook hands work to the job queue: a confirmation it has written, a question to ask, a hold to end.
export type InboundJobs = { confirm: (db: Sql, logId: string, schoolId: string) => Promise<unknown>; held: (db: Sql, heldId: string, expiresAt: Date) => Promise<unknown>; queue?: PtmQueue };
type Env = Record<string, string | undefined>;

export type Whose = { kind: 'one'; schoolId: string; parentId: string } | { kind: 'several'; schoolIds: string[] } | { kind: 'none' };
// Which school a number belongs to. One school knows it: that school. Several do: the one that wrote to the
// number in the last 24 hours, if exactly one did; otherwise it is `several`, and the parent is asked (C190).
export async function schoolOfNumber(db: Sql, e164: string, at: string = new Date().toISOString()): Promise<Whose> {
  const guardians = (await db.query(`select p.school_id, (array_agg(p.parent_id order by p.created_at, p.parent_id))[1] as parent_id from parents p where regexp_replace(p.phone, '[^0-9]', '', 'g') = any($1::text[]) group by p.school_id order by p.school_id`, [writtenForms(e164)])).rows as { school_id: string; parent_id: string }[];
  if (guardians.length === 0) return { kind: 'none' };
  if (guardians.length === 1) return { kind: 'one', schoolId: guardians[0].school_id, parentId: guardians[0].parent_id };
  const wrote = (await db.query(`select distinct school_id from communication_log where school_id = any($1::uuid[]) and regexp_replace(to_phone, '[^0-9]', '', 'g') = any($2::text[]) and status::text in ('sent', 'delivered', 'read') and created_at > $3::timestamptz - make_interval(hours => $4) and created_at <= $3::timestamptz`, [guardians.map((g) => g.school_id), writtenForms(e164), at, WINDOW_HOURS])).rows as { school_id: string }[];
  const one = wrote.length === 1 ? guardians.find((g) => g.school_id === wrote[0].school_id) : undefined;
  return one ? { kind: 'one', schoolId: one.school_id, parentId: one.parent_id } : { kind: 'several', schoolIds: guardians.map((g) => g.school_id) };
}

// A parent's message goes into its school's thread: the words, STOP if that is what it says, an answer to the Pulse.
async function placeInSchool(db: Sql, provider: ProviderName, whose: { schoolId: string; parentId: string }, m: { phone: string; text: string; at: string; providerMessageId: string }, jobs?: InboundJobs): Promise<Received> {
  const stop = isStop(m.text);
  const thread = (await db.query(
    `insert into message_threads (school_id, phone, parent_id, last_inbound_at, unread) values ($1, $2, $3, $4, 1)
     on conflict (school_id, phone) do update set last_inbound_at = greatest(message_threads.last_inbound_at, excluded.last_inbound_at), unread = message_threads.unread + 1 returning thread_id`,
    [whose.schoolId, m.phone, whose.parentId, m.at]
  )).rows[0].thread_id as string;
  await db.query(`insert into inbound_messages (school_id, thread_id, provider, provider_message_id, body, is_stop, received_at) values ($1, $2, $3, $4, $5, $6, $7)`, [whose.schoolId, thread, provider, m.providerMessageId, m.text.slice(0, 4096), stop, m.at]);
  if (!stop) {
    // An answer to the day's Pulse ("1" understood, "2" needs help) is counted, when it is plain whose it is.
    const note = { schoolId: whose.schoolId, phone: m.phone, text: m.text, at: m.at, providerMessageId: m.providerMessageId };
    const pulse = await notePulseReply(db, note);
    // The same few words can only mean one thing. An answer counted for the Pulse is not also read as a meeting
    // time ("1") or an event answer ("yes"). Otherwise: a time from a parent invited to a meeting books that slot
    // (C193); YES or NO from a parent invited to one event is counted for it (C194).
    if (!pulse.recorded) {
      const ptm = await notePtmReply(db as PoolClient, jobs?.queue, note);
      if (!('told' in ptm) && !ptm.booked) await noteEventReply(db, note);
    }
    return { kind: 'threaded', schoolId: whose.schoolId, threadId: thread, stop: false };
  }
  const made = await db.query(`insert into whatsapp_opt_outs (school_id, phone, stopped_at) values ($1, $2, $3) on conflict (school_id, phone) where lifted_at is null do nothing`, [whose.schoolId, m.phone, m.at]);
  if (made.rowCount !== 1) return { kind: 'threaded', schoolId: whose.schoolId, threadId: thread, stop: true }; // already stopped: told once, not again
  await writeAuditLog(db, { schoolId: whose.schoolId, actorUserId: null, actorRole: null, eventAction: 'whatsapp.stopped_by_parent', targetType: 'message_threads', targetId: thread, beforeState: undefined, afterState: { threadId: thread } });
  // The parent is told once, in their own open conversation, in the words written in the code.
  const words = TEMPLATE_REGISTRY.find((t) => t.name === 'messages_stopped');
  const school = (await db.query(`select name from schools where school_id = $1`, [whose.schoolId])).rows[0]?.name as string;
  if (!words || !jobs) return { kind: 'threaded', schoolId: whose.schoolId, threadId: thread, stop: true };
  const logId = (await db.query(
    `insert into communication_log (school_id, to_phone, channel, billing_category, billable, est_cost_paise, gst_paise, cost_basis, status, dedupe_key, parent_id, purpose, thread_id, body, not_before)
     values ($1, $2, 'whatsapp', 'service', false, 0, 0, 'not_billable', 'queued', $3, $4, 'core_records', $5, $6, now()) returning log_id`,
    [whose.schoolId, m.phone, `stopped:${thread}:${m.providerMessageId}`.slice(0, 200), whose.parentId, thread, renderTemplate(words.body.en, { school })]
  )).rows[0].log_id as string;
  await jobs.confirm(db, logId, whose.schoolId);
  return { kind: 'threaded', schoolId: whose.schoolId, threadId: thread, stop: true, confirm: { logId } };
}

const unknown = async (db: Sql, provider: ProviderName, n: { providerMessageId: string; at: string }): Promise<Received> => {
  await db.query(`insert into inbound_messages (school_id, thread_id, provider, provider_message_id, body, is_stop, received_at) values (null, null, $1, $2, null, false, $3)`, [provider, n.providerMessageId, n.at]);
  return { kind: 'unknown' };
};

// One message from a parent, as the platform role, in the webhook's transaction.
export async function receiveInbound(db: Sql, provider: ProviderName, n: Extract<WhatsAppNotice, { kind: 'inbound' }>, jobs?: InboundJobs, env: Env = process.env): Promise<Received> {
  if ((await db.query(`select 1 from inbound_messages where provider = $1 and provider_message_id = $2 union all select 1 from held_inbound where provider = $1 and provider_message_id = $2`, [provider, n.providerMessageId])).rows[0]) return { kind: 'duplicate' };
  const phone = normalizePhone(n.fromPhone);
  if (!phone) return unknown(db, provider, n);

  // 1. Is this the answer to "Which school is this about?" (C190)
  const digest = phoneDigest(phone, env);
  const open = digest ? (await db.query(`select held_id, provider_message_id, school_ids, ciphertext, iv, tag, key_version, received_at from held_inbound where phone_digest = $1 and status = 'held' and expires_at > $2::timestamptz for update`, [digest, n.at])).rows[0] : undefined;
  if (open) {
    const schoolId = chosenSchool(open.school_ids as string[], n);
    // Anything else from this number while the question is open is counted and not kept; the question is not asked twice.
    if (!schoolId) return unknown(db, provider, n);
    const held = openHeld(open.provider_message_id, open, env);
    const parentId = (await db.query(`select parent_id from parents where school_id = $1 and regexp_replace(phone, '[^0-9]', '', 'g') = any($2::text[]) order by created_at, parent_id limit 1`, [schoolId, writtenForms(phone)])).rows[0]?.parent_id as string | undefined;
    if (!parentId) {
      await db.query(`update held_inbound set status = 'dropped', reason = 'the school chosen no longer has this number on record', ciphertext = null, iv = null, tag = null, key_version = null, decided_at = now() where held_id = $1`, [open.held_id]);
      return unknown(db, provider, n);
    }
    await db.query(`update held_inbound set status = 'delivered', chosen_school_id = $2, ciphertext = null, iv = null, tag = null, key_version = null, decided_at = now() where held_id = $1`, [open.held_id, schoolId]);
    // The message they first wrote is what the school receives, as and when it was written.
    return placeInSchool(db, provider, { schoolId, parentId }, { phone, text: held.text, at: new Date(open.received_at).toISOString(), providerMessageId: open.provider_message_id }, jobs);
  }

  // 2. Whose is it?
  const whose = await schoolOfNumber(db, phone, n.at);
  if (whose.kind === 'one') return placeInSchool(db, provider, whose, { phone, text: n.text, at: n.at, providerMessageId: n.providerMessageId }, jobs);
  if (whose.kind === 'none') return unknown(db, provider, n);

  // 3. Several schools, and none wrote in the last 24 hours: hold it, sealed, and ask. Without the server's key
  // nothing can be held, so it is counted and not kept, as a number no school knows is.
  const sealed = sealHeld(n.providerMessageId, { phone, text: n.text.slice(0, 4096) }, env);
  if (!sealed || !digest || !jobs) return unknown(db, provider, n);
  const expires = new Date(new Date(n.at).getTime() + HOLD_HOURS * 3_600_000);
  const heldId = (await db.query(
    `insert into held_inbound (provider, provider_message_id, phone_digest, school_ids, ciphertext, iv, tag, key_version, received_at, expires_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning held_id`,
    [provider, n.providerMessageId, digest, whose.schoolIds.slice(0, 10), sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyVersion, n.at, expires.toISOString()]
  )).rows[0].held_id as string;
  await jobs.held(db, heldId, expires);
  return { kind: 'held', heldId };
}

export type ThreadRow = { thread_id: string; parent_id: string; guardian: string; children: string | null; phone_last4: string; last_inbound_at: string; unread: number; last_text: string | null; window_open: boolean; stopped: boolean };
export type ThreadMessage = { id: string; direction: 'in' | 'out'; at: string; text: string | null; template_name: string | null; status: string | null; by: string | null };
const iso = (v: unknown) => new Date(v as string).toISOString();

// The caller's own tenant transaction: row level security decides which threads a person sees.
export async function listThreads(db: Sql, schoolId: string): Promise<ThreadRow[]> {
  const { rows } = await db.query(
    `select t.thread_id, t.parent_id, p.name as guardian, right(t.phone, 4) as phone_last4, t.last_inbound_at, t.unread,
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
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'whatsapp.stop_lifted', targetType: 'message_threads', targetId: threadId, beforeState: undefined, afterState: { reasoned: true } }); // the reason is on the opt-out (lift_reason) (C224)
  return { ok: true };
}

// Messages from numbers no school knows, for the founder: how many, never what or from whom.
export async function unknownSenders(db: Sql): Promise<number> {
  return Number((await db.query(`select count(*) as n from inbound_messages where school_id is null and received_at > now() - interval '30 days'`)).rows[0].n);
}
