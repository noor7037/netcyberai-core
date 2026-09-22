import type { PoolClient } from 'pg';
import { isPurposeGranted, type ConsentPurpose } from '@/lib/consent/gate';
import { isTemplateApproved } from '@/lib/whatsapp/templates';
import { resolveProvider } from '@/lib/whatsapp/config';
import { MetaWhatsAppProvider, MockWhatsAppProvider, type WhatsAppProviderSPI } from '@/lib/whatsapp/provider';

// THE single WhatsApp send-gate. Exactly one module may call a real
// provider's send() function (this one), mirroring the SET ROLE choke
// point in src/lib/auth/db.ts. Every trigger in scope for this prompt
// (attendance-absence notification, and any future one) calls
// sendWhatsAppMessage -- never a provider directly.
// scripts/check_whatsapp_send_gate.py enforces this mechanically: it
// fails CI if MockWhatsAppProvider/MetaWhatsAppProvider.send is called,
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
}

export interface SendWhatsAppMessageResult {
  logId: string;
  status: CommStatus;
  reason: string | null;
  idempotent: boolean;
  providerUsed: 'school_specific' | 'platform_default' | null;
}

// Real WhatsApp Business API pricing is not known -- no real
// credentials or Meta Business Manager account exist yet (Task 0). A
// small nominal placeholder so the budget check has something
// non-zero to actually gate on; replace once real per-message cost
// data exists (Prompt H/L, alongside the real provider adapter).
const PLACEHOLDER_EST_COST_PAISE = 50;

interface SchoolGateContext {
  is_pilot: boolean;
  pilot_allow_outbound: boolean;
  monthly_budget_paise: string | null; // bigint comes back as string from pg
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
}

async function logAttempt(
  client: PoolClient,
  params: SendWhatsAppMessageParams,
  status: CommStatus,
  reason: string | null,
  extra: { providerUsed?: 'school_specific' | 'platform_default'; fallbackReason?: string | null; providerMessageId?: string | null } = {}
): Promise<string> {
  const billable = status === comm_status_sent;
  const { rows } = await client.query(
    `insert into communication_log
       (school_id, to_phone, channel, template_name, billing_category, billable, est_cost_paise, gst_paise,
        status, provider_message_id, dedupe_key, provider_used, fallback_reason)
     values ($1, $2, 'whatsapp', $3, 'utility', $4, $5, 0, $6, $7, $8, $9, $10)
     returning log_id`,
    [
      params.schoolId,
      params.toPhone,
      params.templateName,
      billable,
      billable ? PLACEHOLDER_EST_COST_PAISE : 0,
      status,
      extra.providerMessageId ?? null,
      params.dedupeKey,
      extra.providerUsed ?? null,
      extra.fallbackReason ?? null,
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
    `select is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end, timezone
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
     where school_id = $1 and billable = true
       and date_trunc('month', created_at at time zone $2) = date_trunc('month', now() at time zone $2)`,
    [params.schoolId, school.timezone]
  );
  const monthSpend = Number(spendRows[0].spend);
  const budget = Number(school.monthly_budget_paise);
  if (monthSpend + PLACEHOLDER_EST_COST_PAISE > budget) {
    const reason = `this month's WhatsApp spend (${monthSpend} paise) plus this message would exceed the configured budget (${budget} paise)`;
    return { logId: await logAttempt(client, params, 'blocked_budget', reason), status: 'blocked_budget', reason, idempotent: false, providerUsed: null };
  }

  // 5. Template approval -- refuse rather than attempt-and-hope.
  const approved = await isTemplateApproved(client, params.schoolId, params.templateName);
  if (!approved) {
    const reason = `template "${params.templateName}" is not an approved template for this school`;
    return { logId: await logAttempt(client, params, 'blocked_no_template', reason), status: 'blocked_no_template', reason, idempotent: false, providerUsed: null };
  }

  // 6. Provider resolution. A school-specific config that isn't
  // `active` falls back to the platform default, logged with why.
  const resolution = await resolveProvider(client, params.schoolId);
  let provider: WhatsAppProviderSPI;
  let providerUsed: 'school_specific' | 'platform_default';
  let fallbackReason: string | null = null;

  if (resolution.kind === 'school_specific') {
    providerUsed = 'school_specific';
    // The ONLY call site for this function in the whole codebase --
    // decrypting a real credential happens nowhere else.
    await client.query(`select * from whatsapp_config_get_credentials($1)`, [resolution.configId]);
    provider = new MetaWhatsAppProvider(); // unimplemented -- see provider.ts's own TODO
  } else {
    providerUsed = 'platform_default';
    fallbackReason = resolution.fallbackReason;
    provider = options.platformDefaultProvider ?? new MockWhatsAppProvider();
  }

  // 7. Send, then log the real outcome -- sent or failed, never silent.
  try {
    const result = await provider.send({ toPhone: params.toPhone, templateName: params.templateName, templateParams: params.templateParams });
    const status: CommStatus = result.success ? comm_status_sent : comm_status_failed;
    const reason = result.success ? null : result.errorMessage;
    const logId = await logAttempt(client, params, status, reason, { providerUsed, fallbackReason, providerMessageId: result.providerMessageId });
    return { logId, status, reason, idempotent: false, providerUsed };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown provider error';
    const logId = await logAttempt(client, params, comm_status_failed, reason, { providerUsed, fallbackReason });
    return { logId, status: comm_status_failed, reason, idempotent: false, providerUsed };
  }
}
