import type { PoolClient } from 'pg';
import { isPurposeGranted, type ConsentPurpose } from '@/lib/consent/gate';
import { missingVariables, templateToSend, type TemplateLanguage, type TemplateToSend } from '@/lib/whatsapp/templates';
import { resolveProvider } from '@/lib/whatsapp/config';
import { openMetaCredentials } from '@/lib/whatsapp/credentials';
import { normalizePhone } from '@/lib/whatsapp/phone';
import { WINDOW_HOURS } from '@/lib/whatsapp/replies';
import { MetaWhatsAppProvider } from '@/lib/whatsapp/meta';
import { StandInWhatsAppProvider, type ProviderName, type WhatsAppProviderSPI } from '@/lib/whatsapp/provider';

// THE single WhatsApp send-gate. Exactly one module may call a real
// provider's send() function (this one), mirroring the SET ROLE choke
// point in src/lib/auth/db.ts. Every trigger in scope for this prompt
// (attendance-absence notification, and any future one) calls
// sendWhatsAppMessage -- never a provider directly.
// scripts/check_whatsapp_send_gate.py enforces this mechanically: it
// fails CI if StandInWhatsAppProvider/MetaWhatsAppProvider.send is called,
// or whatsapp_config_get_credentials is queried, from anywhere outside
// this file.

const comm_status_sent = 'sent';
const comm_status_failed = 'failed';

export type CommStatus =
  | 'queued'
  | 'sent'
  | 'failed'
  | 'blocked_pilot'
  | 'blocked_consent'
  | 'blocked_budget'
  | 'blocked_quiet_hours'
  | 'blocked_no_template';

export interface SendWhatsAppMessageParams {
  schoolId: string;
  studentId: string;
  purpose: ConsentPurpose;
  toPhone: string;
  templateName: string;
  templateParams: Record<string, string>;
  dedupeKey: string;
  // The guardian this goes to, when the caller knows (C182): kept on the log so a message can be found by family.
  parentId?: string | null;
  // The language to send in (C184). English when not given, or when the template has no approved version in it.
  language?: TemplateLanguage;
  // Set by the outbox only (C185): the queued row this send is for. Its outcome is written onto that row.
  queuedLogId?: string;
}

export interface SendWhatsAppMessageResult {
  logId: string;
  status: CommStatus;
  reason: string | null;
  idempotent: boolean;
  providerUsed: 'school_specific' | 'platform_default' | null;
}

// What a message costs (T7, C140). Nothing about money is written in this
// file: the category comes from the template (whatsapp_templates.
// billing_category) and the rate and GST from message_rate_table, the row
// in force on the day the message is sent (the school's own date). A rate
// is put in that table only once verified on Meta's official pricing page.
// With no verified rate on record the message is still logged as billable,
// with its cost left at zero and cost_basis 'rate_not_verified', so the
// gap is visible in Control and never papered over with a guess.
export type BillingCategory = 'marketing' | 'utility' | 'authentication' | 'service';
export type MessageRate = { rateId: string; ratePaise: number; gstPercent: number };
export type MessageCost = { category: BillingCategory; billable: boolean; estCostPaise: number; gstPaise: number; rateId: string | null; costBasis: 'rate_table' | 'rate_not_verified' | 'not_billable' };

// The template's category; utility when the template is not on record (the
// send is refused for that anyway, a few lines further on).
export async function templateCategory(client: PoolClient, schoolId: string, templateName: string): Promise<BillingCategory> {
  const { rows } = await client.query(
    `select billing_category from whatsapp_templates
     where template_name = $2 and (school_id = $1 or school_id is null)
     order by school_id nulls last, version desc
     limit 1`,
    [schoolId, templateName]
  );
  return (rows[0]?.billing_category as BillingCategory | undefined) ?? 'utility';
}

// The rate in force for a category on the school's own date today, or null.
export async function rateOnSendDate(client: PoolClient, category: BillingCategory, timezone: string): Promise<MessageRate | null> {
  const { rows } = await client.query(
    `select rate_id, rate_paise, gst_percent from message_rate_table
     where channel = 'whatsapp' and billing_category = $1 and effective_from <= (now() at time zone $2)::date
     order by effective_from desc, created_at desc
     limit 1`,
    [category, timezone]
  );
  return rows[0] ? { rateId: rows[0].rate_id, ratePaise: Number(rows[0].rate_paise), gstPercent: Number(rows[0].gst_percent) } : null;
}

// Pure: the reason a real send must wait for a verified rate, or null. ('school_specific' is the old name for "a real account".)
export function unpricedRealSend(providerKind: 'school_specific' | 'platform_default', rate: MessageRate | null): string | null {
  return providerKind === 'school_specific' && !rate ? 'rate not verified: no rate is on record for this message category, so its cost cannot be counted against the budget' : null;
}

// Pure: what is recorded for one attempt.
export function messageCost(category: BillingCategory, billable: boolean, rate: MessageRate | null): MessageCost {
  if (!billable) return { category, billable: false, estCostPaise: 0, gstPaise: 0, rateId: null, costBasis: 'not_billable' };
  if (!rate) return { category, billable: true, estCostPaise: 0, gstPaise: 0, rateId: null, costBasis: 'rate_not_verified' };
  return { category, billable: true, estCostPaise: rate.ratePaise, gstPaise: Math.round((rate.ratePaise * rate.gstPercent) / 100), rateId: rate.rateId, costBasis: 'rate_table' };
}

interface SchoolGateContext {
  is_pilot: boolean;
  pilot_allow_outbound: boolean;
  monthly_budget_paise: string | null; // bigint comes back as string from pg
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
  is_test_fixture: boolean;
  name: string;
}

async function logAttempt(
  client: PoolClient,
  params: SendWhatsAppMessageParams,
  status: CommStatus,
  reason: string | null,
  extra: { providerUsed?: 'school_specific' | 'platform_default'; fallbackReason?: string | null; providerMessageId?: string | null; category?: BillingCategory; rate?: MessageRate | null; provider?: ProviderName; template?: TemplateToSend | null; filled?: Record<string, string> } = {}
): Promise<string> {
  // Only a message a real provider sent can cost anything: the stand-in
  // reaches no phone and is never billable. A real account's message is
  // priced here, at sending, and becomes billable when the provider says it
  // was delivered (src/lib/whatsapp/delivery.ts); until then its price is
  // held against the budget as money on its way out.
  const priced = messageCost(extra.category ?? (await templateCategory(client, params.schoolId, params.templateName)), status === comm_status_sent && extra.provider !== 'stand-in', extra.rate ?? null);
  const cost = { ...priced, billable: false };
  if (cost.costBasis === 'rate_not_verified') {
    console.warn('[send-gate] rate not verified: no rate on record for this category and date; cost recorded as zero', cost.category);
  }
  if (params.queuedLogId) {
    // The outbox: the row was written when the message was queued; its outcome is written onto it. Only a
    // queued row is ever touched, so an outcome is recorded once.
    await client.query(
      `update communication_log
          set billing_category = $2, billable = $3, est_cost_paise = $4, gst_paise = $5, rate_id = $6, cost_basis = $7, status = $8::comm_status, provider_message_id = $9,
              provider_used = $10, fallback_reason = $11, reason = $12, provider = $13, template_version = $14, language = $15, template_params = coalesce($16::jsonb, template_params), sending_at = null
        where log_id = $1 and status = 'queued'`,
      [params.queuedLogId, cost.category, cost.billable, cost.estCostPaise, cost.gstPaise, cost.rateId, cost.costBasis, status, extra.providerMessageId ?? null, extra.providerUsed ?? null, extra.fallbackReason ?? null, reason, extra.provider ?? null,
        extra.template?.version ?? null, extra.template?.language ?? null, extra.template && extra.filled ? JSON.stringify(extra.filled) : null]
    );
    return params.queuedLogId;
  }
  const { rows } = await client.query(
    `insert into communication_log
       (school_id, to_phone, channel, template_name, billing_category, billable, est_cost_paise, gst_paise, rate_id, cost_basis,
        status, provider_message_id, dedupe_key, provider_used, fallback_reason, reason, student_id, parent_id, purpose, provider, template_version, language, template_params)
     values ($1, $2, 'whatsapp', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
     returning log_id`,
    [
      params.schoolId,
      params.toPhone,
      params.templateName,
      cost.category,
      cost.billable,
      cost.estCostPaise,
      cost.gstPaise,
      cost.rateId,
      cost.costBasis,
      status,
      extra.providerMessageId ?? null,
      params.dedupeKey,
      extra.providerUsed ?? null,
      extra.fallbackReason ?? null,
      reason,
      params.studentId,
      params.parentId ?? null,
      params.purpose,
      extra.provider ?? null,
      extra.template?.version ?? null,
      extra.template?.language ?? null,
      extra.template && extra.filled ? JSON.stringify(extra.filled) : null,
    ]
  );
  return rows[0].log_id;
}

type Ready = { ready: true; testSchool: boolean; provider: WhatsAppProviderSPI; providerUsed: 'school_specific' | 'platform_default'; fallbackReason: string | null; category: BillingCategory; rate: MessageRate | null; said: { template: TemplateToSend; filled: Record<string, string> } };
type Wait = { wait: true; until: Date };
type Passed = { passed: true };
type GateOptions = { platformDefaultProvider?: WhatsAppProviderSPI };
export const DEFAULT_STALE_MINUTES = 720;

// Every rule, in order, up to the moment of sending. It returns the outcome
// if a rule stopped the message (already written to the log), or what to
// send and through whom. For a queued message (`outbox`) quiet hours do not
// stop it: it waits until they end, unless by then it would be too old.
async function prepare(client: PoolClient, params: SendWhatsAppMessageParams, options: GateOptions, outbox?: { createdAt: Date; now: Date; queueing?: boolean }): Promise<SendWhatsAppMessageResult | Ready | Wait | Passed> {
  const { rows: schoolRows } = await client.query<SchoolGateContext>(
    `select is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end, timezone, is_test_fixture, name
     from schools where school_id = $1`,
    [params.schoolId]
  );
  const school = schoolRows[0];

  // 1. Pilot check (docs/08_EXECUTION_BIBLE.md: "every school row is
  // created with pilot_allow_outbound = false... the send gate blocks
  // and logs as blocked_pilot" -- not named explicitly in this
  // prompt's own checklist, but unmistakably part of the SAME single
  // send gate those docs describe; skipping it would silently reopen
  // a gap Prompt A already closed once).
  if (school.is_pilot && !school.pilot_allow_outbound) {
    const reason = 'school is in pilot mode; outbound sending has not been approved yet';
    return { logId: await logAttempt(client, params, 'blocked_pilot', reason), status: 'blocked_pilot', reason, idempotent: false, providerUsed: null };
  }

  // 2. Consent -- live, not cached.
  const granted = await isPurposeGranted(client, params.schoolId, params.studentId, params.purpose);
  if (!granted) {
    const reason = `consent for purpose "${params.purpose}" is not currently granted`;
    return { logId: await logAttempt(client, params, 'blocked_consent', reason), status: 'blocked_consent', reason, idempotent: false, providerUsed: null };
  }

  // 2b. The parent wrote STOP (C187): no WhatsApp message from this school to that number until the office
  // lifts it at the parent's asking. WhatsApp only; the consent ledger is as the parent left it.
  const toNumber = normalizePhone(params.toPhone);
  if (toNumber && (await client.query(`select 1 from whatsapp_opt_outs where school_id = $1 and phone = $2 and lifted_at is null`, [params.schoolId, toNumber])).rows[0]) {
    const reason = 'this number asked to stop WhatsApp messages from the school';
    return { logId: await logAttempt(client, params, 'blocked_consent', reason), status: 'blocked_consent', reason, idempotent: false, providerUsed: null };
  }

  // 3. Quiet hours -- config-driven (schools.quiet_hours_start/end,
  // schools.timezone), never hardcoded. The window wraps midnight by
  // default (21:00-07:00), so a plain start<=t<end check would be
  // backwards; handled generally for either shape.
  const at = outbox?.now ?? new Date();
  const { rows: quietRows } = await client.query(
    `select q.in_quiet_hours,
            ((($1::timestamptz at time zone $4)::date + case when $2::time > $3::time and ($1::timestamptz at time zone $4)::time >= $2::time then 1 else 0 end) + $3::time) at time zone $4 as ends_at
       from (select case
         when $2::time <= $3::time then (($1::timestamptz at time zone $4)::time >= $2::time and ($1::timestamptz at time zone $4)::time < $3::time)
         else (($1::timestamptz at time zone $4)::time >= $2::time or ($1::timestamptz at time zone $4)::time < $3::time)
       end as in_quiet_hours) q`,
    [at.toISOString(), school.quiet_hours_start, school.quiet_hours_end, school.timezone]
  );
  if (quietRows[0].in_quiet_hours) {
    if (outbox) {
      // Held, not dropped (docs/25 rule 4): it goes when quiet hours end, unless it would be stale by then.
      const until = new Date(quietRows[0].ends_at as string);
      const staleMinutes = (await templateToSend(client, params.schoolId, params.templateName, params.language ?? 'en', false))?.staleAfterMinutes ?? DEFAULT_STALE_MINUTES;
      if (until.getTime() <= outbox.createdAt.getTime() + staleMinutes * 60_000) return { wait: true, until };
      const reason = `held for the school's quiet hours (${school.quiet_hours_start}-${school.quiet_hours_end} ${school.timezone}); by the time they end it would be too old to be worth sending`;
      return { logId: await logAttempt(client, params, 'blocked_quiet_hours', reason), status: 'blocked_quiet_hours', reason, idempotent: false, providerUsed: null };
    }
    const reason = `current time falls within this school's quiet hours (${school.quiet_hours_start}-${school.quiet_hours_end} ${school.timezone})`;
    return { logId: await logAttempt(client, params, 'blocked_quiet_hours', reason), status: 'blocked_quiet_hours', reason, idempotent: false, providerUsed: null };
  }

  // 4. Budget -- monthly_budget_paise is nullable; NULL means "not
  // configured", never treated as unlimited (docs/08_EXECUTION_BIBLE.md,
  // Decision Log C15 -- a real-money footgun otherwise).
  if (school.monthly_budget_paise === null) {
    const reason = 'monthly WhatsApp budget is not configured for this school';
    return { logId: await logAttempt(client, params, 'blocked_budget', reason), status: 'blocked_budget', reason, idempotent: false, providerUsed: null };
  }
  const { rows: spendRows } = await client.query(
    `select coalesce(sum(est_cost_paise + gst_paise), 0) as spend
     from communication_log
     where school_id = $1 and cost_basis = 'rate_table' and (billable = true or status = 'sent')
       and date_trunc('month', created_at at time zone $2) = date_trunc('month', now() at time zone $2)`,
    [params.schoolId, school.timezone]
  );
  const monthSpend = Number(spendRows[0].spend);
  const budget = Number(school.monthly_budget_paise);
  // What this message would cost, from the rate table. With no verified
  // rate its cost is not known and counts as zero here; the budget still
  // has to be set, and still stops a school that has already spent it.
  const category = await templateCategory(client, params.schoolId, params.templateName);
  const rate = await rateOnSendDate(client, category, school.timezone);
  const next = messageCost(category, true, rate);
  if (monthSpend + next.estCostPaise + next.gstPaise > budget || monthSpend >= budget) {
    const reason = `this month's WhatsApp spend (${monthSpend} paise) has reached, or with this message would pass, the configured budget (${budget} paise)`;
    return { logId: await logAttempt(client, params, 'blocked_budget', reason), status: 'blocked_budget', reason, idempotent: false, providerUsed: null };
  }

  // 5. The template (C184): the newest version WE approved, in the language
  // asked for. Refuse rather than attempt-and-hope. The school's own name is
  // put in here, from its own row: every message's first line names the
  // school, and no caller can leave it out or put another in. Every variable
  // the version needs must have a value before any provider is asked.
  const language = params.language ?? 'en';
  let template = await templateToSend(client, params.schoolId, params.templateName, language, false);
  if (!template) {
    const reason = `template "${params.templateName}" is not an approved template for this school`;
    return { logId: await logAttempt(client, params, 'blocked_no_template', reason), status: 'blocked_no_template', reason, idempotent: false, providerUsed: null };
  }
  const filled = { ...params.templateParams, school: school.name };
  const missing = missingVariables(template, filled);
  if (missing.length > 0) {
    const reason = `template "${params.templateName}" needs a value for: ${missing.join(', ')}`;
    return { logId: await logAttempt(client, params, 'blocked_no_template', reason, { template }), status: 'blocked_no_template', reason, idempotent: false, providerUsed: null };
  }

  // Queueing stops here: the rules a person would want to hear about at once have passed. The provider is
  // chosen, and every rule read again, when the message is sent.
  if (outbox?.queueing) return { passed: true };

  // 6. Provider resolution. A TEST SCHOOL always gets the stand-in (docs/25
  // rule 2, C182): its guardians' numbers are never written to through a
  // real account, whatever configuration or credentials exist; its own
  // config is not even read. Otherwise a school-specific config that isn't
  // `active` falls back to the platform default, logged with why.
  let provider: WhatsAppProviderSPI;
  let providerUsed: 'school_specific' | 'platform_default';
  let fallbackReason: string | null = null;
  const standIn = () => options.platformDefaultProvider ?? new StandInWhatsAppProvider();

  if (school.is_test_fixture) {
    providerUsed = 'platform_default';
    fallbackReason = 'test school: the stand-in only, never a real number';
    provider = standIn();
    if (provider.name !== 'stand-in') {
      const reason = 'a test school never sends through a real account';
      return { logId: await logAttempt(client, params, comm_status_failed, reason, { category, rate, fallbackReason }), status: comm_status_failed, reason, idempotent: false, providerUsed: null };
    }
  } else {
    // One platform number serves every school (docs/25 §5, C186). A school's own number
    // (school_whatsapp_configs) stays in the schema and is not used: its credentials are never read.
    const own = await resolveProvider(client, params.schoolId);
    providerUsed = 'platform_default';
    fallbackReason = own.kind === 'school_specific' ? 'a school\'s own number is not in use; the platform number serves every school' : own.fallbackReason;
    // The platform's real account, only if its credentials are saved, tested and switched on in Control, and
    // this server holds the key. Read as the platform role: a school session cannot see that table at all, so a
    // message sent from one falls to the stand-in, and real sends go through the outbox (the job runner).
    const asPlatform = options.platformDefaultProvider ? false : (await client.query(`select current_user = 'nca_super' as yes`)).rows[0].yes === true;
    const account = asPlatform ? await openMetaCredentials(client, true) : null;
    provider = options.platformDefaultProvider ?? (account ? new MetaWhatsAppProvider(account) : new StandInWhatsAppProvider());
    // A message that really costs money is never sent at an unknown price: a
    // budget cannot limit what it cannot count. Until a verified rate is on
    // record for the category, a real account does not send; the stand-in,
    // which costs nothing, still does.
    const unpriced = provider.name === 'meta' ? unpricedRealSend('school_specific', rate) : null;
    if (unpriced) {
      return { logId: await logAttempt(client, params, 'blocked_budget', unpriced, { category, rate }), status: 'blocked_budget', reason: unpriced, idempotent: false, providerUsed: null };
    }
  }

  // A real account sends only a version Meta has approved as well.
  if (provider.name === 'meta') {
    template = await templateToSend(client, params.schoolId, params.templateName, language, true);
    if (!template || missingVariables(template, filled).length > 0) {
      const reason = `template "${params.templateName}" has no version approved by Meta yet`;
      return { logId: await logAttempt(client, params, 'blocked_no_template', reason, { category, rate }), status: 'blocked_no_template', reason, idempotent: false, providerUsed: null };
    }
  }
  const said = { template, filled: Object.fromEntries(template.variables.map((v) => [v, filled[v as keyof typeof filled] as string])) };

  return { ready: true, testSchool: school.is_test_fixture, provider, providerUsed, fallbackReason, category, rate, said };
}

const SEND_ARGS = (params: SendWhatsAppMessageParams, r: Ready) => ({ testSchool: r.testSchool, toPhone: normalizePhone(params.toPhone) ?? params.toPhone, templateName: params.templateName, templateParams: r.said.filled, language: r.said.template.language, templateVersion: r.said.template.version, metaTemplateId: r.said.template.metaTemplateId });
const LOGGED = (r: Ready) => ({ providerUsed: r.providerUsed, fallbackReason: r.fallbackReason, category: r.category, rate: r.rate, provider: r.provider.name, ...r.said });

// Send now, in the caller's own transaction: every rule, the provider, the
// log row. A message blocked by quiet hours is NOT sent later on this path;
// callers that want it held use queueWhatsAppMessage (the outbox).
export async function sendWhatsAppMessage(client: PoolClient, params: SendWhatsAppMessageParams, options: GateOptions = {}): Promise<SendWhatsAppMessageResult> {
  // 0. Idempotency, checked first: the same trigger firing twice (retry,
  // duplicate webhook, whatever) must not double-send. A dedupe hit
  // returns the ORIGINAL outcome untouched -- no new log row, no new
  // send attempt, regardless of what the original outcome was.
  const { rows: existingRows } = await client.query(`select log_id, status from communication_log where school_id = $1 and dedupe_key = $2`, [params.schoolId, params.dedupeKey]);
  if (existingRows[0]) {
    return { logId: existingRows[0].log_id, status: existingRows[0].status, reason: 'duplicate trigger -- returning the original attempt\'s outcome, not sending again', idempotent: true, providerUsed: null };
  }
  const r = await prepare(client, params, options);
  if ('wait' in r || 'passed' in r) throw new Error('unreachable: only a queued message waits');
  if (!('ready' in r)) return r;
  // 7. Send, then log the real outcome -- sent or failed, never silent.
  try {
    const result = await r.provider.send(SEND_ARGS(params, r));
    const status: CommStatus = result.success ? comm_status_sent : comm_status_failed;
    const reason = result.success ? null : result.errorMessage;
    const logId = await logAttempt(client, params, status, reason, { ...LOGGED(r), providerMessageId: result.providerMessageId });
    return { logId, status, reason, idempotent: false, providerUsed: r.providerUsed };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown provider error';
    const logId = await logAttempt(client, params, comm_status_failed, reason, LOGGED(r));
    return { logId, status: comm_status_failed, reason, idempotent: false, providerUsed: r.providerUsed };
  }
}

// --- The outbox (docs/25 slice 7d, C185) --------------------------------------------------------------------
//
// A message is QUEUED in the caller's transaction (one row, one job) and
// sent by the job runner, where every rule is read again at that moment:
// consent as it stands then, the budget then, the template then.
//   - Quiet hours hold a queued message; they do not drop it. It goes when
//     they end, unless by then it would be too old (each template says how
//     long it stays worth sending).
//   - A provider failure is tried again, a few times, minutes apart.
//   - Never twice: the row is marked "sending" and committed BEFORE the
//     provider is asked, and the provider is asked outside any transaction.
//     If the process dies in between, nobody knows whether the message
//     went, so it is NOT sent again: it is recorded as failed, saying so.

export const WHATSAPP_SEND_JOB = 'whatsapp.send';
export const MAX_SEND_ATTEMPTS = 3;
const RETRY_AFTER_MINUTES = [2, 10];
type QueueLike = { enqueue: (db: Pick<PoolClient, 'query'>, spec: { type: string; payload: Record<string, unknown>; idempotencyKey: string; schoolId?: string | null; maxAttempts?: number; runAt?: Date }) => Promise<unknown> };
const jobKey = (logId: string, n: number) => `${WHATSAPP_SEND_JOB}:${logId}:${n}`;

export async function queueWhatsAppMessage(client: PoolClient, queue: QueueLike, params: SendWhatsAppMessageParams, at: () => Date = () => new Date()): Promise<SendWhatsAppMessageResult & { jobKey: string | null }> {
  const { rows: existing } = await client.query(`select log_id, status from communication_log where school_id = $1 and dedupe_key = $2`, [params.schoolId, params.dedupeKey]);
  if (existing[0]) return { logId: existing[0].log_id, status: existing[0].status, reason: 'duplicate trigger -- returning the original attempt\'s outcome, not sending again', idempotent: true, providerUsed: null, jobKey: null };
  // The rules a person would want to hear about at once are read now: a school in pilot, no consent, no budget,
  // no approved words, a missing value. Such a message is recorded as held and never queued. Everything is read
  // again when it is sent.
  const now = at();
  const r = await prepare(client, params, {}, { createdAt: now, now, queueing: true });
  if ('logId' in r) return { ...r, jobKey: null };
  const notBefore = 'wait' in r ? r.until : now;
  const { rows } = await client.query(
    `insert into communication_log (school_id, to_phone, channel, template_name, billing_category, billable, est_cost_paise, gst_paise, cost_basis, status, dedupe_key, student_id, parent_id, purpose, language, template_params, not_before, created_at)
     values ($1, $2, 'whatsapp', $3, $4, false, 0, 0, 'not_billable', 'queued', $5, $6, $7, $8, $9, $10, $11, $12) returning log_id`,
    [params.schoolId, params.toPhone, params.templateName, await templateCategory(client, params.schoolId, params.templateName), params.dedupeKey, params.studentId, params.parentId ?? null, params.purpose, params.language ?? 'en', JSON.stringify(params.templateParams), notBefore.toISOString(), now.toISOString()]
  );
  const logId = rows[0].log_id as string;
  await queue.enqueue(client, { type: WHATSAPP_SEND_JOB, idempotencyKey: jobKey(logId, 0), schoolId: params.schoolId, maxAttempts: 3, payload: { logId }, ...('wait' in r ? { runAt: r.until } : {}) });
  return { logId, status: 'queued', reason: null, idempotent: false, providerUsed: null, jobKey: jobKey(logId, 0) };
}

export type ReplyResult = { ok: true; logId: string; jobKey: string } | { ok: false; reason: 'text' | 'no_thread' | 'window_closed' | 'stopped' | 'pilot' };
// A member of staff answers a parent, in free text, inside the 24 hours the parent's own message opened
// (docs/25 rule 6). The caller's own tenant transaction: row level security has already decided whether this
// person may see the thread at all. Queued like every other message, and every rule is read again when it goes.
export async function queueThreadReply(client: PoolClient, queue: QueueLike, by: { schoolId: string; userId: string }, threadId: string, textRaw: string, at: () => Date = () => new Date()): Promise<ReplyResult> {
  const text = textRaw.trim();
  if (text.length === 0 || text.length > 4096) return { ok: false, reason: 'text' };
  const now = at();
  const t = (await client.query(
    `select t.phone, t.parent_id, t.last_inbound_at > $3::timestamptz - make_interval(hours => $4) as open, s.is_pilot and not s.pilot_allow_outbound as pilot,
            exists (select 1 from whatsapp_opt_outs o where o.school_id = t.school_id and o.phone = t.phone and o.lifted_at is null) as stopped
       from message_threads t join schools s on s.school_id = t.school_id where t.school_id = $1 and t.thread_id = $2`,
    [by.schoolId, threadId, now.toISOString(), WINDOW_HOURS]
  )).rows[0];
  if (!t) return { ok: false, reason: 'no_thread' };
  if (t.pilot) return { ok: false, reason: 'pilot' };
  if (t.stopped) return { ok: false, reason: 'stopped' };
  if (!t.open) return { ok: false, reason: 'window_closed' };
  const logId = (await client.query(
    `insert into communication_log (school_id, to_phone, channel, billing_category, billable, est_cost_paise, gst_paise, cost_basis, status, dedupe_key, parent_id, purpose, thread_id, body, sent_by, not_before, created_at)
     values ($1, $2, 'whatsapp', 'service', false, 0, 0, 'not_billable', 'queued', $3, $4, 'operational_communication', $5, $6, $7, $8, $8) returning log_id`,
    [by.schoolId, t.phone, `reply:${threadId}:${now.getTime()}:${by.userId}`, t.parent_id, threadId, text, by.userId, now.toISOString()]
  )).rows[0].log_id as string;
  await queue.enqueue(client, { type: WHATSAPP_SEND_JOB, idempotencyKey: jobKey(logId, 0), schoolId: by.schoolId, maxAttempts: 3, payload: { logId } });
  return { ok: true, logId, jobKey: jobKey(logId, 0) };
}
// How the webhook hands the job queue a confirmation it has just written (a parent wrote STOP).
export const enqueueQueued = (queue: QueueLike) => (db: Pick<PoolClient, 'query'>, logId: string, schoolId: string) => queue.enqueue(db, { type: WHATSAPP_SEND_JOB, idempotencyKey: jobKey(logId, 0), schoolId, maxAttempts: 3, payload: { logId } });

type Platform = <T>(fn: (db: PoolClient) => Promise<T>) => Promise<T>;
export type DeliverOutcome = { status: CommStatus | 'gone'; retryAt?: Date; reason?: string | null };

// One queued message, by the job runner, as the platform role.
export async function deliverQueued(deps: { platform: Platform; queue: QueueLike; now?: () => Date; provider?: WhatsAppProviderSPI }, logId: string): Promise<DeliverOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const later = async (db: PoolClient, schoolId: string, at: Date, attempts: number) => {
    await db.query(`update communication_log set not_before = $2, sending_at = null where log_id = $1 and status = 'queued'`, [logId, at.toISOString()]);
    await deps.queue.enqueue(db, { type: WHATSAPP_SEND_JOB, idempotencyKey: jobKey(logId, at.getTime()), schoolId, maxAttempts: 3, payload: { logId, attempt: attempts }, runAt: at });
  };
  // 1. Decide, and mark it as being sent. Committed before the provider is asked.
  const first = await deps.platform(async (db): Promise<{ done: DeliverOutcome } | { params: SendWhatsAppMessageParams; ready: Ready; attempts: number; schoolId: string; text?: string }> => {
    const row = (await db.query(`select school_id, student_id, parent_id, purpose, to_phone, template_name, language, template_params, dedupe_key, status::text as status, created_at, attempts, sending_at, not_before, thread_id, body from communication_log where log_id = $1 for update`, [logId])).rows[0];
    if (!row || row.status !== 'queued') return { done: { status: (row?.status ?? 'gone') as CommStatus | 'gone' } };
    if (row.not_before && new Date(row.not_before).getTime() > now.getTime()) return { done: { status: 'queued' as const, retryAt: new Date(row.not_before) } }; // an earlier job for a message since put off
    const params: SendWhatsAppMessageParams = { schoolId: row.school_id, studentId: row.student_id, parentId: row.parent_id, purpose: row.purpose, toPhone: row.to_phone, templateName: row.template_name, templateParams: row.template_params ?? {}, dedupeKey: row.dedupe_key, language: row.language ?? 'en', queuedLogId: logId };
    if (row.sending_at) {
      const reason = 'the send was interrupted and nobody knows whether it went; it is not sent again, so that a parent is never messaged twice';
      await logAttempt(db, params, comm_status_failed, reason);
      return { done: { status: comm_status_failed, reason } };
    }
    if (row.body !== null) {
      // A free-text reply (C187): only inside the 24 hours the parent's own message opened, read again now.
      const stopped = (reason: string) => db.query(`update communication_log set status = 'failed', reason = $2, sending_at = null where log_id = $1 and status = 'queued'`, [logId, reason]).then(() => ({ done: { status: comm_status_failed as CommStatus, reason } }));
      const t = (await db.query(`select t.last_inbound_at > $2::timestamptz - make_interval(hours => $3) as open, s.is_test_fixture, s.is_pilot and not s.pilot_allow_outbound as pilot from message_threads t join schools s on s.school_id = t.school_id where t.thread_id = $1`, [row.thread_id, now.toISOString(), WINDOW_HOURS])).rows[0];
      if (!t) return stopped('the conversation no longer exists');
      if (t.pilot) return stopped('school is in pilot mode; outbound sending has not been approved yet');
      if (!t.open) return stopped(`more than ${WINDOW_HOURS} hours have passed since the parent last wrote; free text can no longer be sent`);
      // After STOP nothing goes but the one confirmation the system itself wrote.
      if (row.purpose !== 'core_records' && (await db.query(`select 1 from whatsapp_opt_outs where school_id = $1 and phone = $2 and lifted_at is null`, [row.school_id, row.to_phone])).rows[0]) return stopped('this number asked to stop WhatsApp messages from the school');
      const account = t.is_test_fixture || deps.provider ? null : await openMetaCredentials(db, true);
      const provider: WhatsAppProviderSPI = deps.provider ?? (account ? new MetaWhatsAppProvider(account) : new StandInWhatsAppProvider());
      if (t.is_test_fixture && provider.name !== 'stand-in') return stopped('a test school never sends through a real account');
      await db.query(`update communication_log set sending_at = $2, attempts = attempts + 1 where log_id = $1`, [logId, now.toISOString()]);
      const ready = { ready: true, testSchool: t.is_test_fixture as boolean, provider, providerUsed: 'platform_default', fallbackReason: null, category: 'service', rate: null, said: { template: null as never, filled: {} } } satisfies Ready;
      return { params, ready, attempts: row.attempts + 1, schoolId: row.school_id as string, text: row.body as string };
    }
    const r = await prepare(db, params, { platformDefaultProvider: deps.provider }, { createdAt: new Date(row.created_at), now });
    if ('passed' in r) throw new Error('unreachable');
    if ('wait' in r) {
      await later(db, row.school_id, r.until, row.attempts);
      return { done: { status: 'queued' as const, retryAt: r.until } };
    }
    if (!('ready' in r)) return { done: { status: r.status, reason: r.reason } };
    const stale = r.said.template.staleAfterMinutes ?? DEFAULT_STALE_MINUTES;
    if (now.getTime() > new Date(row.created_at).getTime() + stale * 60_000) {
      const reason = `too old to be worth sending: it was written more than ${stale} minutes ago`;
      await logAttempt(db, params, comm_status_failed, reason, LOGGED(r));
      return { done: { status: comm_status_failed, reason } };
    }
    await db.query(`update communication_log set sending_at = $2, attempts = attempts + 1 where log_id = $1`, [logId, now.toISOString()]);
    return { params, ready: r, attempts: row.attempts + 1, schoolId: row.school_id as string };
  });
  if ('done' in first) return first.done;

  // 2. Ask the provider. No transaction is open.
  let result: { success: boolean; providerMessageId: string | null; errorMessage: string | null };
  try {
    result = first.text !== undefined ? await first.ready.provider.sendText({ toPhone: first.params.toPhone, text: first.text, testSchool: first.ready.testSchool }) : await first.ready.provider.send(SEND_ARGS(first.params, first.ready));
  } catch (err) {
    result = { success: false, providerMessageId: null, errorMessage: err instanceof Error ? err.message : 'unknown provider error' };
  }

  // 3. Record what happened; on a failure, try again later, a few times.
  return deps.platform(async (db): Promise<DeliverOutcome> => {
    if (first.text !== undefined) {
      // A reply inside the parent's own conversation costs nothing; it is sent once, or said to have failed.
      await db.query(`update communication_log set status = $2::comm_status, provider_message_id = $3, provider = $4, provider_used = 'platform_default', reason = $5, sending_at = null where log_id = $1 and status = 'queued'`, [logId, result.success ? 'sent' : 'failed', result.providerMessageId, first.ready.provider.name, result.success ? null : result.errorMessage]);
      if (result.success) await db.query(`update message_threads set last_outbound_at = $2 where thread_id = (select thread_id from communication_log where log_id = $1)`, [logId, now.toISOString()]);
      return { status: result.success ? comm_status_sent : comm_status_failed, reason: result.success ? null : result.errorMessage };
    }
    if (result.success) {
      await logAttempt(db, first.params, comm_status_sent, null, { ...LOGGED(first.ready), providerMessageId: result.providerMessageId });
      return { status: comm_status_sent };
    }
    if (first.attempts < MAX_SEND_ATTEMPTS) {
      const at = new Date(now.getTime() + RETRY_AFTER_MINUTES[Math.min(first.attempts - 1, RETRY_AFTER_MINUTES.length - 1)] * 60_000);
      await later(db, first.schoolId, at, first.attempts);
      return { status: 'queued' as const, retryAt: at, reason: result.errorMessage };
    }
    await logAttempt(db, first.params, comm_status_failed, result.errorMessage, LOGGED(first.ready));
    return { status: comm_status_failed, reason: result.errorMessage };
  });
}

// The job: one queued message. Whatever the rules decide is an outcome, not an error; the job itself only fails
// (and is retried by the queue) when the database or the code does.
export function whatsappSendHandler(deps: { platform: Platform; queue: QueueLike; now?: () => Date; provider?: WhatsAppProviderSPI }) {
  return async (job: { payload: Record<string, unknown> }): Promise<void> => {
    const logId = job.payload.logId;
    if (typeof logId !== 'string' || !/^[0-9a-f-]{36}$/.test(logId)) throw new Error('whatsapp.send: bad payload');
    await deliverQueued(deps, logId);
  };
}
