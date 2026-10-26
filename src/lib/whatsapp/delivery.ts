import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import type { Sql } from '@/lib/jobs/types';
import { messageCost, rateOnSendDate, templateCategory } from './gate';
import { writtenForms } from './phone';
import type { WhatsAppNotice, WhatsAppProvider } from './provider';
import { receiveInbound, type InboundJobs } from './replies';
import { applyTemplateStatus } from './templates';

// Delivery states (docs/25 slice 7b, C183). A provider tells us afterwards
// where a message got to. Each notice is:
//   - stored once: the same body a second time changes nothing;
//   - trusted only if the provider's own check of its signature holds; one
//     that does not is recorded as such and nothing in it is used;
//   - applied forward only: sent -> delivered -> read, or sent -> failed. A
//     late or out-of-order notice never moves a message back (the database
//     refuses it too);
//   - matched by the provider's own message id AND the provider it came
//     from: a notice from one provider cannot touch another's message.
// Money follows delivery: a real account's message becomes billable when it
// is delivered, and costs nothing if it failed.

export type NoticeOutcome = { status: 200 | 401; duplicate: boolean; applied: number; stale: number; unknown: number; inbound: number; reason?: string };
export const MAX_REFUSED_KEPT_PER_HOUR = 100;
const RANK: Record<string, number> = { queued: 0, uncertain: 1, sent: 2, delivered: 3, read: 4 };

async function applyStatus(db: Sql, provider: WhatsAppProvider, n: Extract<WhatsAppNotice, { kind: 'status' }>): Promise<'applied' | 'stale' | 'unknown'> {
  let row = (await db.query(`select log_id, status::text as status from communication_log where provider_message_id = $1 and provider = $2 for update`, [n.providerMessageId, provider.name])).rows[0];
  if (!row && n.recipient && n.status !== 'failed') {
    // An interrupted send has no id of ours to be found by (C190). If this provider now reports on a message to a
    // number that has exactly ONE uncertain message from it in the day before, this is that message: it takes the
    // provider's id and moves forward. Two uncertain messages to one number are not guessed between.
    const uncertain = (await db.query(
      `select l.log_id, l.school_id, l.template_name, s.timezone from communication_log l join schools s on s.school_id = l.school_id
        where l.status = 'uncertain' and l.provider = $1 and l.provider_message_id is null and regexp_replace(l.to_phone, '[^0-9]', '', 'g') = any($2::text[])
          and l.created_at > $3::timestamptz - interval '24 hours' and l.created_at <= $3::timestamptz for update of l`,
      [provider.name, writtenForms(n.recipient), n.at]
    )).rows;
    if (uncertain.length === 1) {
      const u = uncertain[0];
      // It did go, so a real account's message is priced now, as it would have been when sent.
      const cost = provider.name === 'meta' && u.template_name ? messageCost(await templateCategory(db as PoolClient, u.school_id, u.template_name), true, await rateOnSendDate(db as PoolClient, await templateCategory(db as PoolClient, u.school_id, u.template_name), u.timezone)) : null;
      await db.query(`update communication_log set provider_message_id = $2, status = 'sent', reason = 'the send was interrupted; the provider has since said it went', est_cost_paise = coalesce($3, est_cost_paise), gst_paise = coalesce($4, gst_paise), rate_id = coalesce($5, rate_id), cost_basis = coalesce($6, cost_basis) where log_id = $1`, [u.log_id, n.providerMessageId, cost?.estCostPaise ?? null, cost?.gstPaise ?? null, cost?.rateId ?? null, cost?.costBasis ?? null]);
      row = { log_id: u.log_id, status: 'sent' };
      if (n.status === 'sent') return 'applied';
    }
  }
  if (!row) return 'unknown';
  const was = row.status as string;
  if (n.status === 'failed') {
    if (was !== 'sent' && was !== 'queued' && was !== 'uncertain') return 'stale';
    // It never arrived: it costs nothing.
    await db.query(`update communication_log set status = 'failed', failed_at = $2, failure_code = $3, reason = coalesce(reason, 'the provider could not deliver it'), billable = false, est_cost_paise = 0, gst_paise = 0, rate_id = null, cost_basis = 'not_billable' where log_id = $1`, [row.log_id, n.at, n.failureCode ?? null]);
    return 'applied';
  }
  if (!(n.status in RANK) || !(was in RANK) || RANK[n.status] <= RANK[was]) return 'stale';
  // Delivered (a "read" for a message we never heard was delivered says both). A real account's message is
  // billable from here, at the price recorded when it was sent; the stand-in's never is.
  await db.query(
    `update communication_log set status = $2::comm_status, delivered_at = coalesce(delivered_at, $3), read_at = case when $2 = 'read' then $3::timestamptz else read_at end,
            billable = (provider = 'meta')
      where log_id = $1`,
    [row.log_id, n.status, n.at]
  );
  return 'applied';
}

// One webhook body, as the platform role, in the caller's transaction.
// `jobs`: how a confirmation (a parent wrote STOP) or a question (which school?) is handed to the job queue; the send-gate gives it.
export async function applyNotices(db: Sql, provider: WhatsAppProvider, rawBody: string, signature: string | null, jobs?: InboundJobs): Promise<NoticeOutcome> {
  const hash = createHash('sha256').update(`${provider.name}\n${rawBody}`).digest('hex');
  if ((await db.query(`select 1 from webhook_events where payload_hash = $1`, [hash])).rows[0]) return { status: 200, duplicate: true, applied: 0, stale: 0, unknown: 0, inbound: 0 };
  const read = provider.readNotice(rawBody, signature);
  const record = (ok: boolean, outcome: string, payload: unknown, schoolId: string | null) =>
    db.query(`insert into webhook_events (school_id, provider, payload_hash, payload, signature_ok, outcome, processed_at) values ($1, 'whatsapp', $2, $3, $4, $5, now())`, [schoolId, hash, JSON.stringify(payload), ok, outcome.slice(0, 200)]);
  if (!read.ok) {
    // Not trusted: only that it came, from which provider and how long it was. Nothing in it is kept or used.
    // And only so many an hour: the address is public, and strangers must not be able to fill the table.
    const lately = Number((await db.query(`select count(*) as n from webhook_events where provider = 'whatsapp' and signature_ok = false and created_at > now() - interval '1 hour'`)).rows[0].n);
    if (lately < MAX_REFUSED_KEPT_PER_HOUR) await record(false, `refused: ${read.reason}`, { provider: provider.name, bytes: rawBody.length }, null);
    return { status: 401, duplicate: false, applied: 0, stale: 0, unknown: 0, inbound: 0, reason: read.reason };
  }
  const out = { applied: 0, stale: 0, unknown: 0, inbound: 0 };
  for (const n of read.notices) {
    if (n.kind === 'inbound') {
      // A parent's own words go to their school's thread (replies.ts), never into this table.
      if ((await receiveInbound(db, provider.name, n, jobs)).kind !== 'duplicate') out.inbound += 1;
    } else if (n.kind === 'template_status') {
      // Meta's review of one of our templates moved (C345): only Meta's own notices speak of that.
      if (provider.name === 'meta') out[await applyTemplateStatus(db, n)] += 1;
    } else out[await applyStatus(db, provider, n)] += 1;
  }
  const ids = read.notices.filter((n) => n.kind === 'status').map((n) => n.providerMessageId);
  const schools = ids.length === 0 ? [] : (await db.query(`select distinct school_id from communication_log where provider = $1 and provider_message_id = any($2::text[])`, [provider.name, ids])).rows;
  // What is kept here is which message moved where. A parent's reply is counted; its words are in the school's
  // own thread (slice 7f), and this table is not where a family's words belong.
  const kept = read.notices.map((n) =>
    n.kind === 'status'
      ? { kind: n.kind, id: n.providerMessageId, status: n.status, at: n.at, ...(n.failureCode ? { code: n.failureCode } : {}) }
      : n.kind === 'template_status'
        ? { kind: n.kind, id: n.metaTemplateId, event: n.event, category: n.category }
        : { kind: n.kind, id: n.providerMessageId, at: n.at }
  );
  await record(true, `applied ${out.applied}, stale ${out.stale}, unknown ${out.unknown}, replies ${out.inbound}`, { provider: provider.name, notices: kept }, schools.length === 1 ? (schools[0].school_id as string) : null);
  return { status: 200, duplicate: false, ...out };
}

export type MessageRow = { log_id: string; created_at: string; child: string | null; guardian: string | null; phone_last4: string | null; template_name: string | null; status: string; reason: string | null; provider: string | null; delivered_at: string | null; read_at: string | null; failed_at: string | null };
export type MessageRange = { from: string; to: string };
// `inState`: how many messages the chosen state holds over the same days (every state when none is chosen). It
// is never cut short. When it is more than `messages` has rows, the list was cut at its limit and the screen says so.
export type MessageList = { messages: MessageRow[]; counts: Record<string, number>; days: number; range?: MessageRange; inState: number };
export const MESSAGE_STATES = ['queued', 'uncertain', 'sent', 'delivered', 'read', 'failed', 'held'] as const;
export type MessageState = (typeof MESSAGE_STATES)[number];
export const isMessageState = (v: unknown): v is MessageState => typeof v === 'string' && (MESSAGE_STATES as readonly string[]).includes(v);
const HELD = `status::text like 'blocked_%'`;
// The most rows one list shows. The last-14-days list keeps a short page. A list opened on a range of days (a
// dashboard number's rows) shows as many as the other "rows behind a number" lists do.
export const MESSAGE_ROWS_RECENT = 200;
export const MESSAGE_ROWS_MAX = 2000;

const RECENT_DAYS = 14;
// The range's first midnight and the midnight after its last day, in India (no summer time: always +05:30).
// With no range both are empty and the database's own clock decides: the last 14 days.
const nextDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const between = (range?: MessageRange): (string | null)[] => (range ? [`${range.from}T00:00:00+05:30`, `${nextDay(range.to)}T00:00:00+05:30`] : [null, null]);
// Which messages: this school's WhatsApp messages of those days. The counts and the list both ask with this one
// condition, so they are about the same messages. They are the school's whole log, so the database answers them only
// to the people who read the whole log (reads_school_message_totals(), C219: the principal and the school admin); a
// teacher's own screens read their own classes' messages by other queries, and get nothing here.
const OF_THE_DAYS = (alias = '') => `where ${alias}school_id = $1 and ${alias}channel = 'whatsapp' and ${alias}created_at >= coalesce($2::timestamptz, now() - make_interval(days => ${RECENT_DAYS})) and ($3::timestamptz is null or ${alias}created_at < $3::timestamptz) and public.reads_school_message_totals()`;

// How many of the school's WhatsApp messages are in each state over those days: the numbers on the list's own
// buttons, and the numbers the school facts say (src/lib/insights). Whole, never cut at a list's limit.
export async function countMessages(db: Sql, schoolId: string, range?: MessageRange): Promise<Record<string, number>> {
  const { rows } = await db.query(`select case when ${HELD} then 'held' else status::text end as state, count(*)::int as n from communication_log ${OF_THE_DAYS()} group by 1`, [schoolId, ...between(range)]);
  return Object.fromEntries(rows.map((r) => [r.state as string, r.n as number]));
}
export const messagesInAll = (counts: Record<string, number>): number => MESSAGE_STATES.reduce((a, s) => a + (counts[s] ?? 0), 0);

// The school's own messages, newest first: who, what, and where each got to. Without a range, the last 14 days.
// With one (docs/26 slice 8d, C203: /app/communication?state=…&from=…&to=…), the messages written on those days
// by India's date. `counts` says how many are in each state over the same days, so a number and the rows under
// it are the same messages; the counts are whole, the rows stop at `limit` and `inState` says how many there are.
// The caller's own tenant transaction; row level security keeps it to this school.
export async function listMessages(db: Sql, schoolId: string, state: string | null, range?: MessageRange, limit: number = range ? MESSAGE_ROWS_MAX : MESSAGE_ROWS_RECENT): Promise<MessageList> {
  const counts = await countMessages(db, schoolId, range);
  const want = isMessageState(state) ? state : null;
  const { rows } = await db.query(
    `select l.log_id, l.created_at, s.name as child, p.name as guardian, right(l.to_phone, 4) as phone_last4, l.template_name, l.status::text as status, l.reason, l.provider, l.delivered_at, l.read_at, l.failed_at
       from communication_log l
       left join students s on s.school_id = l.school_id and s.student_id = l.student_id
       left join parents p on p.school_id = l.school_id and p.parent_id = l.parent_id
      ${OF_THE_DAYS('l.')}
        and ($4::text is null or case when ${HELD.replace('status', 'l.status')} then 'held' else l.status::text end = $4)
      order by l.created_at desc, l.log_id limit $5`,
    [schoolId, ...between(range), want, limit]
  );
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return { messages: rows.map((r) => ({ ...r, created_at: iso(r.created_at), delivered_at: iso(r.delivered_at), read_at: iso(r.read_at), failed_at: iso(r.failed_at) })) as MessageRow[], counts, days: RECENT_DAYS, ...(range ? { range } : {}), inState: want ? (counts[want] ?? 0) : messagesInAll(counts) };
}
