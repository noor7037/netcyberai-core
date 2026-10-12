import { createHash } from 'crypto';
import type { Sql } from '@/lib/jobs/types';
import type { WhatsAppNotice, WhatsAppProvider } from './provider';

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
const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3 };

async function applyStatus(db: Sql, provider: WhatsAppProvider, n: Extract<WhatsAppNotice, { kind: 'status' }>): Promise<'applied' | 'stale' | 'unknown'> {
  const row = (await db.query(`select log_id, status::text as status from communication_log where provider_message_id = $1 and provider = $2 for update`, [n.providerMessageId, provider.name])).rows[0];
  if (!row) return 'unknown';
  const was = row.status as string;
  if (n.status === 'failed') {
    if (was !== 'sent' && was !== 'queued') return 'stale';
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
export async function applyNotices(db: Sql, provider: WhatsAppProvider, rawBody: string, signature: string | null): Promise<NoticeOutcome> {
  const hash = createHash('sha256').update(`${provider.name}\n${rawBody}`).digest('hex');
  if ((await db.query(`select 1 from webhook_events where payload_hash = $1`, [hash])).rows[0]) return { status: 200, duplicate: true, applied: 0, stale: 0, unknown: 0, inbound: 0 };
  const read = provider.readNotice(rawBody, signature);
  const record = (ok: boolean, outcome: string, payload: unknown, schoolId: string | null) =>
    db.query(`insert into webhook_events (school_id, provider, payload_hash, payload, signature_ok, outcome, processed_at) values ($1, 'whatsapp', $2, $3, $4, $5, now())`, [schoolId, hash, JSON.stringify(payload), ok, outcome.slice(0, 200)]);
  if (!read.ok) {
    // Not trusted: only that it came, from which provider and how long it was. Nothing in it is kept or used.
    await record(false, `refused: ${read.reason}`, { provider: provider.name, bytes: rawBody.length }, null);
    return { status: 401, duplicate: false, applied: 0, stale: 0, unknown: 0, inbound: 0, reason: read.reason };
  }
  const out = { applied: 0, stale: 0, unknown: 0, inbound: 0 };
  for (const n of read.notices) {
    if (n.kind === 'inbound') out.inbound += 1;
    else out[await applyStatus(db, provider, n)] += 1;
  }
  const ids = read.notices.filter((n) => n.kind === 'status').map((n) => n.providerMessageId);
  const schools = ids.length === 0 ? [] : (await db.query(`select distinct school_id from communication_log where provider = $1 and provider_message_id = any($2::text[])`, [provider.name, ids])).rows;
  // What is kept is which message moved where. A parent's reply is counted here and not kept: it has no home
  // until replies are threaded (slice 7f), and this table is not where a family's words belong.
  const kept = read.notices.map((n) => (n.kind === 'status' ? { kind: n.kind, id: n.providerMessageId, status: n.status, at: n.at, ...(n.failureCode ? { code: n.failureCode } : {}) } : { kind: n.kind, id: n.providerMessageId, at: n.at }));
  await record(true, `applied ${out.applied}, stale ${out.stale}, unknown ${out.unknown}, replies ${out.inbound}`, { provider: provider.name, notices: kept }, schools.length === 1 ? (schools[0].school_id as string) : null);
  return { status: 200, duplicate: false, ...out };
}

export type MessageRow = { log_id: string; created_at: string; child: string | null; guardian: string | null; phone_last4: string | null; template_name: string | null; status: string; reason: string | null; provider: string | null; delivered_at: string | null; read_at: string | null; failed_at: string | null };
export type MessageList = { messages: MessageRow[]; counts: Record<string, number>; days: number };
export const MESSAGE_STATES = ['sent', 'delivered', 'read', 'failed', 'held'] as const;
const HELD = `status::text like 'blocked_%'`;

// The school's own messages of the last 14 days, newest first: who, what, and where each got to. The caller's
// own tenant transaction; row level security keeps it to this school.
export async function listMessages(db: Sql, schoolId: string, state: string | null): Promise<MessageList> {
  const days = 14;
  const counts = Object.fromEntries(
    (await db.query(`select case when ${HELD} then 'held' else status::text end as state, count(*)::int as n from communication_log where school_id = $1 and channel = 'whatsapp' and created_at > now() - make_interval(days => $2) group by 1`, [schoolId, days])).rows.map((r) => [r.state as string, r.n as number])
  );
  const want = state && (MESSAGE_STATES as readonly string[]).includes(state) ? state : null;
  const { rows } = await db.query(
    `select l.log_id, l.created_at, s.name as child, p.name as guardian, right(l.to_phone, 4) as phone_last4, l.template_name, l.status::text as status, l.reason, l.provider, l.delivered_at, l.read_at, l.failed_at
       from communication_log l
       left join students s on s.school_id = l.school_id and s.student_id = l.student_id
       left join parents p on p.school_id = l.school_id and p.parent_id = l.parent_id
      where l.school_id = $1 and l.channel = 'whatsapp' and l.created_at > now() - make_interval(days => $2)
        and ($3::text is null or case when ${HELD.replace('status', 'l.status')} then 'held' else l.status::text end = $3)
      order by l.created_at desc, l.log_id limit 200`,
    [schoolId, days, want]
  );
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return { messages: rows.map((r) => ({ ...r, created_at: iso(r.created_at), delivered_at: iso(r.delivered_at), read_at: iso(r.read_at), failed_at: iso(r.failed_at) })) as MessageRow[], counts, days };
}
