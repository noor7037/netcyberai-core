import { createHash } from 'crypto';
import { writeAuditLog } from '@/lib/audit/log';
import { receiptFormat } from '@/lib/fees/payments';
import { nextNumber } from '@/lib/frameworks/numbering';
import type { Sql } from '@/lib/jobs/types';
import type { PoolClient } from 'pg';
import type { Header, PaymentProvider, ProviderEvent } from './provider';

// Applying a provider's notice (docs/23 6f, C169). One transaction, as the
// platform role (there is no signed-in person). Three things make "applied
// once" true, each on its own:
//   1. the notice's id is unique in payment_events: the same notice again
//      is found and changes nothing;
//   2. a provider payment has at most one receipt (a unique index): the
//      same payment under another notice id cannot be credited twice;
//   3. the family is locked while money is put against its dues, the same
//      lock the counter takes, so a counter payment and a notice wait for
//      each other.
// Money that was captured is never thrown away: it goes to the dues the
// link named, as far as they are still owed, then to the family's other
// open dues, oldest first. What is left (more was paid than is owed) is
// recorded for the office to refund by hand; nothing is credited in advance.

export type Outcome = 'applied' | 'applied_in_part' | 'not_applied' | 'duplicate' | 'ignored' | 'refused' | 'noted';
export type Applied = { outcome: Outcome; reason?: string; receiptId?: string; receiptNo?: string; appliedMinor: number; unappliedMinor: number };

const done = (outcome: Outcome, reason?: string, more: Partial<Applied> = {}): Applied => ({ outcome, reason, appliedMinor: 0, unappliedMinor: 0, ...more });

// Pure: where a captured amount goes. `lines` are the link's own lines with
// what each due still owes now; `others` are the family's other open dues,
// oldest first. Whole paise; never more on a due than it still owes.
export function planCapture(amountMinor: number, lines: readonly { feeId: string; lineMinor: number; balanceMinor: number }[], others: readonly { feeId: string; balanceMinor: number }[]): { parts: { feeId: string; amountMinor: number }[]; unappliedMinor: number } {
  const parts = new Map<string, number>();
  const room = new Map<string, number>();
  let left = Math.max(0, amountMinor);
  const put = (feeId: string, want: number) => {
    const take = Math.min(left, want, room.get(feeId) ?? 0);
    if (take <= 0) return;
    parts.set(feeId, (parts.get(feeId) ?? 0) + take);
    room.set(feeId, (room.get(feeId) as number) - take);
    left -= take;
  };
  for (const l of lines) room.set(l.feeId, Math.max(0, l.balanceMinor));
  for (const o of others) if (!room.has(o.feeId)) room.set(o.feeId, Math.max(0, o.balanceMinor));
  for (const l of lines) put(l.feeId, l.lineMinor); // first, what the link was for
  for (const l of lines) put(l.feeId, Infinity); // then the rest of those same dues
  for (const o of others) put(o.feeId, Infinity); // then the family's other dues, oldest first
  return { parts: [...parts.entries()].map(([feeId, amount]) => ({ feeId, amountMinor: amount })), unappliedMinor: left };
}

// `scope`: the one school and configuration this notice may credit (a webhook address of its own, docs/24 §3.8).
// `confirmed`: what the provider itself said when asked about the payment, where the provider can be asked.
export type NoticeChecks = { scope?: { schoolId: string; configId: string }; confirmed?: { ok: true } | { ok: false; reason: string } };

export async function applyProviderEvent(db: Sql, provider: string, event: ProviderEvent, checks: NoticeChecks = {}): Promise<Applied> {
  // 1. The notice itself, once.
  const noted = await db.query(
    `insert into payment_events (provider, event_id, kind, provider_ref, gateway_payment_id, amount_minor, outcome) values ($1, $2, $3, $4, $5, $6, 'received')
     on conflict (provider, event_id) do nothing returning event_pk`,
    [provider, event.eventId, event.type, event.providerRef, event.paymentId, event.amountMinor]
  );
  if (noted.rowCount !== 1) return done('duplicate', 'same_notice');
  const eventPk = noted.rows[0].event_pk as string;
  const finish = async (result: Applied, link?: { school_id: string; link_id: string }): Promise<Applied> => {
    await db.query(`update payment_events set outcome = $2, reason = $3, applied_minor = $4, unapplied_minor = $5, school_id = $6, link_id = $7, receipt_id = $8 where event_pk = $1`, [eventPk, result.outcome, result.reason ?? null, result.appliedMinor, result.unappliedMinor, link?.school_id ?? null, link?.link_id ?? null, result.receiptId ?? null]);
    return result;
  };

  // The link: by the provider's own reference, or by our id when the provider hands our note back.
  const ours = event.ourLinkId && /^[0-9a-f-]{36}$/i.test(event.ourLinkId) ? event.ourLinkId : null;
  const link = (await db.query(
    `select k.link_id, k.school_id, k.family_id, k.student_id, k.status, k.amount_minor, k.config_id,
            (select s.is_test_fixture from schools s where s.school_id = k.school_id) as test_school,
            (select c.mode from payment_credentials c where c.config_id = k.config_id) as config_mode
       from payment_links k
      where k.provider = $1 and ((k.provider_ref = $2 and $2 <> '') or ($3::uuid is not null and k.link_id = $3)) for update of k`,
    [provider, event.providerRef, ours]
  )).rows[0] as { link_id: string; school_id: string; family_id: string | null; student_id: string; status: string; amount_minor: string; config_id: string | null; test_school: boolean; config_mode: string | null } | undefined;
  if (!link) return finish(done('refused', 'unknown_link'));
  // A notice that came to one school's address can credit only that school, and only a link opened with that configuration.
  if (checks.scope && link.school_id !== checks.scope.schoolId) return finish(done('refused', 'other_school'));
  if (checks.scope && link.config_id !== checks.scope.configId) return finish(done('refused', 'other_configuration'), link);
  // TEST MONEY IS NOT MONEY (C173). The stand-in, and a gateway's test keys, move nothing. For a real school such a
  // notice is recorded and flagged, never credited, whatever it says. Only a test-fixture school takes test payments.
  const mode: 'test' | 'live' = provider === 'stand-in' || link.config_mode !== 'live' ? 'test' : 'live';
  if (mode === 'test' && link.test_school !== true) {
    await writeAuditLog(db, { schoolId: link.school_id, actorUserId: null, actorRole: null, eventAction: 'fees.online_payment_flagged', targetType: 'payment_links', targetId: link.link_id, beforeState: undefined, afterState: { provider, paymentId: event.paymentId, noticeMinor: event.amountMinor, reason: 'test_mode_for_a_real_school' } });
    return finish(done('refused', 'test_mode_for_a_real_school'), link);
  }

  // 2. This payment, once: whatever notice id it comes under.
  const already = (await db.query(`select receipt_id, receipt_no from receipts where gateway = $1 and gateway_payment_id = $2`, [provider, event.paymentId])).rows[0];
  if (event.type === 'failed') {
    // A failure that arrives after the same payment was captured is stale: the capture stands.
    return finish(already ? done('ignored', 'already_captured') : done('noted', 'payment_failed'), link);
  }
  if (already) return finish(done('duplicate', 'same_payment', { receiptId: already.receipt_id, receiptNo: already.receipt_no }), link);
  if (event.amountMinor <= 0) return finish(done('refused', 'no_amount'), link);
  // The provider, asked directly, does not agree with the notice: nothing is credited, and the notice stays on record as refused.
  if (checks.confirmed && !checks.confirmed.ok) {
    await writeAuditLog(db, { schoolId: link.school_id, actorUserId: null, actorRole: null, eventAction: 'fees.online_payment_flagged', targetType: 'payment_links', targetId: link.link_id, beforeState: undefined, afterState: { provider, paymentId: event.paymentId, noticeMinor: event.amountMinor, reason: checks.confirmed.reason } });
    return finish(done('refused', `provider_fetch_disagrees:${checks.confirmed.reason}`.slice(0, 200)), link);
  }

  const credited = await creditEvidence(db, {
    source: 'gateway_notice',
    externalId: `${provider}:${event.paymentId}`,
    amountMinor: event.amountMinor,
    mode,
    link,
    receipt: { method: 'online', gateway: provider, gatewayPaymentId: event.paymentId, issuedBy: null, reference: event.paymentId },
    audit: { provider, paymentId: event.paymentId },
  });
  return finish(credited, link);
}

export type LinkToCredit = { link_id: string; school_id: string; family_id: string | null; student_id: string; status: string; amount_minor: string | number };
export type Evidence = {
  source: 'gateway_notice' | 'school_confirmed' | 'bank_statement_row' | 'network_notice';
  externalId: string; // unique with the source, for ever: the provider's payment id, the school's UTR, the bank's row
  amountMinor: number;
  mode?: 'test' | 'live'; // test money (a provider's test keys, the stand-in): the database refuses it for a real school
  link: LinkToCredit;
  rule?: 'A' | 'R1' | 'R2' | 'manual';
  decidedBy?: string | null;
  reason?: string | null;
  receipt: { method: 'online' | 'upi' | 'netbanking' | 'cheque'; gateway: string | null; gatewayPaymentId: string | null; issuedBy: string | null; reference: string };
  audit?: Record<string, unknown>;
};

// THE ONE LEDGER DOOR (docs/24 §3.1, C171). Every credit that does not come
// from the counter's own form ends here, fed evidence and never a claim.
// The evidence row is written first and is unique on (source, external id):
// the same notice, bank row or confirmation a second time finds it and
// credits nothing. Then one allocation rule, one receipt series, one audit
// row. The caller holds the link's row lock.
export async function creditEvidence(db: Sql, e: Evidence): Promise<Applied> {
  const link = e.link;
  const noted = await db.query(
    `insert into payment_evidence (school_id, source, external_id, amount_minor, link_id, rule, decided_by, reason, mode) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (source, external_id) do nothing returning evidence_id`,
    [link.school_id, e.source, e.externalId, e.amountMinor, link.link_id, e.rule ?? null, e.decidedBy ?? null, e.reason ?? null, e.mode ?? 'live']
  );
  if (noted.rowCount !== 1) {
    const before = (await db.query(`select r.receipt_id, r.receipt_no from payment_evidence v left join receipts r on r.receipt_id = v.receipt_id where v.source = $1 and v.external_id = $2`, [e.source, e.externalId])).rows[0];
    return done('duplicate', 'same_evidence', { receiptId: before?.receipt_id ?? undefined, receiptNo: before?.receipt_no ?? undefined });
  }
  const evidenceId = noted.rows[0].evidence_id as string;
  const settle = (receiptId: string | null, appliedMinor: number, unappliedMinor: number) => db.query(`update payment_evidence set receipt_id = $2, applied_minor = $3, unapplied_minor = $4 where evidence_id = $1`, [evidenceId, receiptId, appliedMinor, unappliedMinor]);

  // The family is locked: the same lock the counter takes.
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`pay:${link.school_id}:${link.family_id ?? link.student_id}`]);
  const open = (await db.query(
    `select l.fee_id, (l.amount_minor - coalesce((select sum(p.amount_minor) from payments p where p.fee_id = l.fee_id), 0))::bigint as balance, n.amount_minor as line_minor
       from fees_ledger l
       join students st on st.school_id = l.school_id and st.student_id = l.student_id
       left join payment_link_lines n on n.link_id = $3 and n.fee_id = l.fee_id
      where l.school_id = $1 and (l.student_id = $2 or ($4::uuid is not null and st.family_id = $4))
      order by l.due_date, l.created_at, l.fee_id`,
    [link.school_id, link.student_id, link.link_id, link.family_id]
  )).rows as { fee_id: string; balance: string; line_minor: string | null }[];
  const plan = planCapture(
    e.amountMinor,
    open.filter((d) => d.line_minor !== null).map((d) => ({ feeId: d.fee_id, lineMinor: Number(d.line_minor), balanceMinor: Number(d.balance) })),
    open.filter((d) => Number(d.balance) > 0).map((d) => ({ feeId: d.fee_id, balanceMinor: Number(d.balance) }))
  );
  const applied = plan.parts.reduce((t, p) => t + p.amountMinor, 0);
  const actor = { actorUserId: e.decidedBy ?? null, actorRole: null };
  if (applied === 0) {
    // Nothing is owed any more (the family paid at the counter meanwhile): the whole amount is to be refunded,
    // and the link is closed so that it cannot be paid again.
    await db.query(`update payment_links set status = 'cancelled', closed_at = now() where school_id = $1 and link_id = $2 and status = 'open'`, [link.school_id, link.link_id]);
    await settle(null, 0, plan.unappliedMinor);
    await writeAuditLog(db, { schoolId: link.school_id, ...actor, eventAction: 'fees.online_payment_not_applied', targetType: 'payment_links', targetId: link.link_id, beforeState: undefined, afterState: { evidenceId, source: e.source, amountMinor: e.amountMinor, ...e.audit } });
    return done('not_applied', 'nothing_owed', { unappliedMinor: plan.unappliedMinor });
  }

  const receiptNo = await nextNumber(db, link.school_id, 'receipt', await receiptFormat(db as PoolClient, link.school_id));
  const receiptId = (await db.query(
    `insert into receipts (school_id, receipt_no, student_id, family_id, total_minor, method, reference, allocation, payment_link_id, gateway, gateway_payment_id, issued_by, evidence_id)
     values ($1, $2, $3, $4, $5, $6, $7, 'oldest_first', $8, $9, $10, $11, $12) returning receipt_id`,
    [link.school_id, receiptNo, link.student_id, link.family_id, applied, e.receipt.method, e.receipt.reference.slice(0, 80), link.link_id, e.receipt.gateway, e.receipt.gatewayPaymentId, e.receipt.issuedBy, evidenceId]
  )).rows[0].receipt_id as string;
  await db.query(
    `insert into payments (school_id, fee_id, amount_minor, method, receipt_id, gateway, gateway_payment_id, received_by)
     select $1, n.fee_id, n.amount_minor, $2, $3, $4, $5, $6 from unnest($7::uuid[], $8::bigint[]) as n(fee_id, amount_minor)`,
    [link.school_id, e.receipt.method, receiptId, e.receipt.gateway ?? e.source, e.receipt.gatewayPaymentId, e.receipt.issuedBy, plan.parts.map((p) => p.feeId), plan.parts.map((p) => p.amountMinor)]
  );
  await db.query(`update payment_links set status = 'paid', closed_at = coalesce(closed_at, now()), receipt_id = coalesce(receipt_id, $3) where school_id = $1 and link_id = $2 and status <> 'paid'`, [link.school_id, link.link_id, receiptId]);
  await settle(receiptId, applied, plan.unappliedMinor);
  const partly = plan.unappliedMinor > 0;
  const short = e.amountMinor < Number(link.amount_minor);
  await writeAuditLog(db, { schoolId: link.school_id, ...actor, eventAction: 'fees.online_payment_applied', targetType: 'receipts', targetId: receiptId, beforeState: undefined, afterState: { receiptNo, evidenceId, source: e.source, rule: e.rule ?? null, capturedMinor: e.amountMinor, appliedMinor: applied, unappliedMinor: plan.unappliedMinor, dues: plan.parts.length, ...e.audit } });
  return { outcome: partly ? 'applied_in_part' : 'applied', reason: partly ? 'more_than_owed' : short ? 'less_than_the_link' : link.status !== 'open' ? `link_was_${link.status}` : undefined, receiptId, receiptNo, appliedMinor: applied, unappliedMinor: plan.unappliedMinor };
}

type Platform = <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;

// The whole webhook, apart from HTTP: check the signature, then apply. A
// notice that cannot be trusted is recorded once (by a digest of its body,
// so a replay of the same bytes is one row) and nothing else happens.
export async function handleNotice(platform: Platform, provider: PaymentProvider, rawBody: string, header: Header, checks: Pick<NoticeChecks, 'scope'> = {}): Promise<{ status: 200 | 401; result: Applied }> {
  const event = provider.readNotice(rawBody, header);
  if (!event) {
    const digest = createHash('sha256').update(rawBody).digest('hex').slice(0, 40);
    // Anyone can send this endpoint rubbish, so the record of it is bounded: at most 200 such rows an hour.
    await platform((db) =>
      db.query(
        `insert into payment_events (provider, event_id, kind, outcome, reason, school_id)
         select $1, $2, 'unreadable', 'refused', 'bad_signature_or_shape', $3::uuid
          where (select count(*) from payment_events where kind = 'unreadable' and received_at > now() - interval '1 hour') < 200
         on conflict (provider, event_id) do nothing`,
        [provider.name, `unsigned:${digest}`, checks.scope?.schoolId ?? null]
      )
    );
    return { status: 401, result: done('refused', 'bad_signature_or_shape') };
  }
  if ('ignored' in event) return { status: 200, result: done('ignored', event.ignored.slice(0, 100)) };
  // Before any credit, the provider is asked about the payment itself. If it cannot be reached this throws,
  // the answer is an error, and the provider sends the notice again later: nothing is credited on the notice alone.
  const confirmed = event.type === 'captured' && provider.confirmCapture ? await provider.confirmCapture(event) : undefined;
  return { status: 200, result: await platform((db) => applyProviderEvent(db, provider.name, event, { ...checks, confirmed })) };
}

// What a payer's page may know about a link, by its token: the school's
// name, the amount and where it stands. No child, no due, no person.
export type PayerView = { schoolName: string; amountMinor: number; state: 'open' | 'paid' | 'closed'; receiptNo: string | null; provider: string | null; providerRef: string | null; checkoutUrl: string | null; testMode: boolean };
export async function linkForPayer(db: Sql, token: string): Promise<PayerView | null> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  const r = (await db.query(
    `select s.name as school_name, k.amount_minor, k.status, k.expires_at > now() as in_time, k.provider, k.provider_ref, k.checkout_url, c.mode, r.receipt_no
       from payment_links k join schools s on s.school_id = k.school_id left join receipts r on r.receipt_id = k.receipt_id left join payment_credentials c on c.config_id = k.config_id
      where k.token = $1`,
    [token]
  )).rows[0];
  if (!r) return null;
  return { schoolName: r.school_name as string, amountMinor: Number(r.amount_minor), state: r.status === 'paid' ? 'paid' : r.status === 'open' && r.in_time ? 'open' : 'closed', receiptNo: (r.receipt_no as string | null) ?? null, provider: (r.provider as string | null) ?? null, providerRef: (r.provider_ref as string | null) ?? null, checkoutUrl: (r.checkout_url as string | null) ?? null, testMode: r.mode === 'test' || r.provider === 'stand-in' };
}
