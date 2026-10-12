import type { PoolClient } from 'pg';
import { isPurposeGranted, type ConsentPurpose } from '@/lib/consent/gate';
import { missingVariables, templateToSend, type TemplateLanguage, type TemplateToSend } from '@/lib/whatsapp/templates';
import { resolveProvider } from '@/lib/whatsapp/config';
import { MetaWhatsAppProvider, StandInWhatsAppProvider, type ProviderName, type WhatsAppProviderSPI } from '@/lib/whatsapp/provider';

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

// Pure: the reason a real send must wait for a verified rate, or null.
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

export async function sendWhatsAppMessage(
  client: PoolClient,
  params: SendWhatsAppMessageParams,
  options: { platformDefaultProvider?: WhatsAppProviderSPI } = {}
): Promise<SendWhatsAppMessageResult> {
  // 0. Idempotency, checked first: the same trigger firing twice (retry,
  // duplicate webhook, whatever) must not double-send. A dedupe hit
  // returns the ORIGINAL outcome untouched -- no new log row, no new
  // send attempt, regardless of what the original outcome was.
  const { rows: existingRows } = await client.query(
    `select log_id, status from communication_log where school_id = $1 and dedupe_key = $2`,
    [params.schoolId, params.dedupeKey]
  );
  if (existingRows[0]) {
    return {
      logId: existingRows[0].log_id,
      status: existingRows[0].status,
      reason: 'duplicate trigger -- returning the original attempt\'s outcome, not sending again',
      idempotent: true,
      providerUsed: null,
    };
  }

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

  // 3. Quiet hours -- config-driven (schools.quiet_hours_start/end,
  // schools.timezone), never hardcoded. The window wraps midnight by
  // default (21:00-07:00), so a plain start<=t<end check would be
  // backwards; handled generally for either shape.
  const { rows: quietRows } = await client.query(
    `select case
       when $2::time <= $3::time then (($1::timestamptz at time zone $4)::time >= $2::time and ($1::timestamptz at time zone $4)::time < $3::time)
       else (($1::timestamptz at time zone $4)::time >= $2::time or ($1::timestamptz at time zone $4)::time < $3::time)
     end as in_quiet_hours`,
    [new Date().toISOString(), school.quiet_hours_start, school.quiet_hours_end, school.timezone]
  );
  if (quietRows[0].in_quiet_hours) {
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
    const resolution = await resolveProvider(client, params.schoolId);
    // A message that really costs money is never sent at an unknown price: a
    // budget cannot limit what it cannot count. Until a verified rate is on
    // record for the category, a school's own (real) WhatsApp account does not
    // send; the platform's stand-in, which costs nothing, still does.
    const unpriced = unpricedRealSend(resolution.kind, rate);
    if (unpriced) {
      return { logId: await logAttempt(client, params, 'blocked_budget', unpriced, { category, rate }), status: 'blocked_budget', reason: unpriced, idempotent: false, providerUsed: null };
    }
    if (resolution.kind === 'school_specific') {
      providerUsed = 'school_specific';
      // The ONLY call site for this function in the whole codebase --
      // decrypting a real credential happens nowhere else.
      await client.query(`select * from whatsapp_config_get_credentials($1)`, [resolution.configId]);
      provider = new MetaWhatsAppProvider(); // not built yet -- docs/25 slice 7e
    } else {
      providerUsed = 'platform_default';
      fallbackReason = resolution.fallbackReason;
      provider = standIn();
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

  // 7. Send, then log the real outcome -- sent or failed, never silent.
  try {
    const result = await provider.send({ toPhone: params.toPhone, templateName: params.templateName, templateParams: said.filled, language: template.language, templateVersion: template.version, metaTemplateId: template.metaTemplateId });
    const status: CommStatus = result.success ? comm_status_sent : comm_status_failed;
    const reason = result.success ? null : result.errorMessage;
    const logId = await logAttempt(client, params, status, reason, { providerUsed, fallbackReason, providerMessageId: result.providerMessageId, category, rate, provider: provider.name, ...said });
    return { logId, status, reason, idempotent: false, providerUsed };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown provider error';
    const logId = await logAttempt(client, params, comm_status_failed, reason, { providerUsed, fallbackReason, category, rate, provider: provider.name, ...said });
    return { logId, status: comm_status_failed, reason, idempotent: false, providerUsed };
  }
}
