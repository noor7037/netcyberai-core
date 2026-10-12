import { randomInt } from 'crypto';
import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import type { Sql } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';
import { creditEvidence, type Applied } from './apply';

// Direct UPI to the school's own account (docs/24 §3.3, §3.4 path A, C174).
// The money goes straight from the parent's UPI app to the school's bank.
// We never see it move, so nothing a parent says is proof: the UTR they
// enter is only a key for the school to look up. A named verifier of the
// school checks the school's own bank and says "found", with the amount
// they saw; only that credits, through payment_evidence. Above the school's
// limit the principal must say so as well. Nothing is confirmed by time.

type Actor = { schoolId: string; userId: string; role: StaffRole };

// ---- The reference code and the UPI link ------------------------------------

// No look-alikes: no I, L, O, 0 or 1.
export const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newReferenceCode(): string {
  return Array.from({ length: 8 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join('');
}
export const referenceLabel = (code: string) => `NCA-${code}`;

// upi://pay with the school's UPI ID, its name, the amount, and the reference as both note and reference.
export function upiUri(p: { upiId: string; payeeName: string; amountMinor: number; referenceCode: string }): string {
  const q = new URLSearchParams({ pa: p.upiId, pn: p.payeeName, am: `${Math.floor(p.amountMinor / 100)}.${String(p.amountMinor % 100).padStart(2, '0')}`, cu: 'INR', tn: referenceLabel(p.referenceCode), tr: referenceLabel(p.referenceCode) });
  return `upi://pay?${q.toString()}`;
}

// ---- The school's set-up ------------------------------------------------------

export const VERIFIER_ROLES = ['accountant', 'principal', 'school_admin'] as const;
export type UpiSettings = { upiId: string; payeeName: string; bankName: string; accountLast4: string; ifsc: string; verifiers: string[]; principalLimitMinor: number; notify: 'each' | 'digest' };
export const UPI_DEFAULTS: UpiSettings = { upiId: '', payeeName: '', bankName: '', accountLast4: '', ifsc: '', verifiers: ['accountant', 'principal'], principalLimitMinor: 0, notify: 'digest' };

export function readUpiSettings(settings: unknown): UpiSettings {
  const s = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>;
  const text = (k: string) => (typeof s[k] === 'string' ? (s[k] as string) : '');
  const verifiers = Array.isArray(s.verifiers) ? (s.verifiers as unknown[]).filter((v): v is string => VERIFIER_ROLES.some((r) => r === v)) : [];
  return { upiId: text('upiId'), payeeName: text('payeeName'), bankName: text('bankName'), accountLast4: text('accountLast4'), ifsc: text('ifsc'), verifiers: verifiers.length > 0 ? verifiers : UPI_DEFAULTS.verifiers, principalLimitMinor: typeof s.principalLimitMinor === 'number' && Number.isSafeInteger(s.principalLimitMinor) && s.principalLimitMinor > 0 ? s.principalLimitMinor : 0, notify: s.notify === 'each' ? 'each' : 'digest' };
}
// What a school must give before direct UPI can be switched on. A UPI ID is name@handle.
export function upiSettingsProblem(s: UpiSettings): 'upi_id' | 'payee' | 'bank' | 'last4' | 'ifsc' | 'verifiers' | 'limit' | null {
  if (!/^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,63}$/.test(s.upiId)) return 'upi_id';
  if (s.payeeName.trim().length < 2 || s.payeeName.length > 80) return 'payee';
  if (s.bankName.trim().length < 2 || s.bankName.length > 60) return 'bank';
  if (!/^[0-9]{4}$/.test(s.accountLast4)) return 'last4';
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(s.ifsc)) return 'ifsc';
  if (s.verifiers.length === 0 || !s.verifiers.every((v) => VERIFIER_ROLES.some((r) => r === v))) return 'verifiers';
  if (!Number.isSafeInteger(s.principalLimitMinor) || s.principalLimitMinor < 0) return 'limit';
  return null;
}
export const upiReady = (s: UpiSettings) => upiSettingsProblem(s) === null;

async function schoolUpi(db: Sql, schoolId: string): Promise<{ enabled: boolean; settings: UpiSettings }> {
  const row = (await db.query(`select enabled, settings from payment_methods where school_id = $1 and method = 'direct_upi'`, [schoolId])).rows[0];
  const settings = readUpiSettings(row?.settings);
  return { enabled: row?.enabled === true && upiReady(settings), settings };
}

// ---- The parent's side (no account: the platform role, by the link's token) ----

export type PayerUpi = { payeeName: string; upiId: string; reference: string; uri: string; report: 'none' | 'being_verified' | 'not_found' };

// What the payer's page shows for direct UPI, or null when the school does not offer it for this link.
export async function upiForPayer(db: Sql, token: string): Promise<PayerUpi | null> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  const link = (await db.query(`select link_id, school_id, amount_minor, reference_code, status, expires_at > now() as in_time from payment_links where token = $1`, [token])).rows[0];
  if (!link || !link.reference_code) return null;
  const { enabled, settings } = await schoolUpi(db, link.school_id);
  if (!enabled) return null;
  const last = (await db.query(`select status from payment_reports where link_id = $1 order by reported_at desc limit 1`, [link.link_id])).rows[0]?.status as string | undefined;
  return { payeeName: settings.payeeName, upiId: settings.upiId, reference: referenceLabel(link.reference_code), uri: upiUri({ upiId: settings.upiId, payeeName: settings.payeeName, amountMinor: Number(link.amount_minor), referenceCode: link.reference_code }), report: last === 'reported' || last === 'awaiting_principal' ? 'being_verified' : last === 'not_found' ? 'not_found' : 'none' };
}

export type ReportResult = { ok: true } | { ok: false; reason: 'utr' | 'no_such_link' | 'not_open' | 'not_offered' | 'already_reported' | 'utr_used' | 'too_many' };
const MAX_REPORTS_PER_LINK = 5;

// The parent says: I paid, and this is the UTR. Recorded as a claim. A UTR already used in this school, by
// anyone, for anything, is refused; the answer does not say whose it was.
export async function reportUtr(db: Sql, token: string, utrRaw: string, told?: (schoolId: string, reportId: string) => Promise<unknown>): Promise<ReportResult> {
  const utr = utrRaw.replace(/\s+/g, '');
  if (!/^[0-9]{12}$/.test(utr)) return { ok: false, reason: 'utr' };
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return { ok: false, reason: 'no_such_link' };
  const link = (await db.query(`select link_id, school_id, amount_minor, status, expires_at > now() as in_time from payment_links where token = $1 for update`, [token])).rows[0];
  if (!link) return { ok: false, reason: 'no_such_link' };
  if (link.status !== 'open' || !link.in_time) return { ok: false, reason: 'not_open' };
  if (!(await schoolUpi(db, link.school_id)).enabled) return { ok: false, reason: 'not_offered' };
  const mine = (await db.query(`select count(*)::int as n, count(*) filter (where status in ('reported', 'awaiting_principal'))::int as waiting from payment_reports where link_id = $1`, [link.link_id])).rows[0];
  if (mine.waiting > 0) return { ok: false, reason: 'already_reported' };
  if (mine.n >= MAX_REPORTS_PER_LINK) return { ok: false, reason: 'too_many' };
  const made = await db.query(`insert into payment_reports (school_id, link_id, utr, amount_minor) values ($1, $2, $3, $4) on conflict (school_id, utr) do nothing returning report_id`, [link.school_id, link.link_id, utr, link.amount_minor]);
  if (made.rowCount !== 1) return { ok: false, reason: 'utr_used' };
  // The verifiers are told in the same transaction (an email job, if that is the school's choice).
  await told?.(link.school_id, made.rows[0].report_id);
  await writeAuditLog(db, { schoolId: link.school_id, actorUserId: null, actorRole: null, eventAction: 'fees.upi_reported', targetType: 'payment_reports', targetId: made.rows[0].report_id, beforeState: undefined, afterState: { linkId: link.link_id, amountMinor: Number(link.amount_minor) } });
  return { ok: true };
}

// ---- The school's side --------------------------------------------------------

export type WaitingReport = { working_days_waiting: number; report_id: string; payer: string; class_name: string | null; utr: string; reference: string | null; amount_minor: number; reported_at: string; status: 'reported' | 'awaiting_principal'; amount_seen_minor: number | null; checked_by_name: string | null };

export async function waitingReports(db: PoolClient, schoolId: string): Promise<WaitingReport[]> {
  const { rows } = await db.query(
    `select r.report_id, coalesce(f.family_code || ' · ', '') || st.name as payer, c.name as class_name, r.utr, k.reference_code as reference, r.amount_minor, r.reported_at, r.status, r.amount_seen_minor, u.display_name as checked_by_name
       from payment_reports r
       join payment_links k on k.school_id = r.school_id and k.link_id = r.link_id
       join fee_billing_students() st on st.school_id = k.school_id and st.student_id = k.student_id
       left join classes c on c.school_id = st.school_id and c.class_id = st.class_id
       left join families f on f.school_id = k.school_id and f.family_id = k.family_id
       left join users u on u.user_id = r.checked_by
      where r.school_id = $1 and r.status in ('reported', 'awaiting_principal')
      order by r.reported_at`,
    [schoolId]
  );
  const today = indiaDate();
  return rows.map((r) => ({ ...r, working_days_waiting: workingDaysBetween(indiaDate(new Date(r.reported_at)), today), reference: r.reference ? referenceLabel(r.reference) : null, amount_minor: Number(r.amount_minor), amount_seen_minor: r.amount_seen_minor === null ? null : Number(r.amount_seen_minor), reported_at: new Date(r.reported_at).toISOString() }));
}

export type VerifyInput = { action: 'found'; amountSeenMinor: number; checked: boolean } | { action: 'not_found' };
export type VerifyResult =
  | { ok: true; state: 'verified'; credit: Applied }
  | { ok: true; state: 'awaiting_principal' | 'not_found' }
  | { ok: false; reason: 'not_allowed' | 'not_found' | 'already_decided' | 'not_checked' | 'amount' | 'needs_principal' | 'own_check' };

export async function verifyReport(db: PoolClient, actor: Actor, reportId: string, input: VerifyInput): Promise<VerifyResult> {
  const { settings } = await schoolUpi(db, actor.schoolId);
  if (!settings.verifiers.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const report = (await db.query(`select report_id, link_id, utr, status, checked_by, amount_seen_minor from payment_reports where school_id = $1 and report_id = $2 for update`, [actor.schoolId, reportId])).rows[0];
  if (!report) return { ok: false, reason: 'not_found' };
  if (report.status !== 'reported' && report.status !== 'awaiting_principal') return { ok: false, reason: 'already_decided' };

  // Once the accountant has checked an amount above the limit, the decision is the principal's, either way.
  if (report.status === 'awaiting_principal' && actor.role !== 'principal') return { ok: false, reason: 'needs_principal' };
  if (input.action === 'not_found') {
    await db.query(`update payment_reports set status = 'not_found', decided_by = $3, decided_at = now() where school_id = $1 and report_id = $2`, [actor.schoolId, reportId, actor.userId]);
    await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'fees.upi_not_found', targetType: 'payment_reports', targetId: reportId, beforeState: { status: report.status }, afterState: { status: 'not_found' } });
    return { ok: true, state: 'not_found' };
  }

  // "Found in bank": the verifier has looked at the school's own bank account and says what they saw there.
  if (input.checked !== true) return { ok: false, reason: 'not_checked' };
  if (!Number.isSafeInteger(input.amountSeenMinor) || input.amountSeenMinor <= 0) return { ok: false, reason: 'amount' };
  const overLimit = settings.principalLimitMinor > 0 && input.amountSeenMinor > settings.principalLimitMinor;
  if (report.status === 'reported' && overLimit && actor.role !== 'principal') {
    await db.query(`update payment_reports set status = 'awaiting_principal', checked_by = $3, checked_at = now(), amount_seen_minor = $4 where school_id = $1 and report_id = $2`, [actor.schoolId, reportId, actor.userId, input.amountSeenMinor]);
    await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'fees.upi_checked', targetType: 'payment_reports', targetId: reportId, beforeState: { status: 'reported' }, afterState: { status: 'awaiting_principal', amountSeenMinor: input.amountSeenMinor, limitMinor: settings.principalLimitMinor } });
    return { ok: true, state: 'awaiting_principal' };
  }

  const link = (await db.query(`select link_id, school_id, family_id, student_id, status, amount_minor from payment_links where school_id = $1 and link_id = $2 for update`, [actor.schoolId, report.link_id])).rows[0];
  const externalId = `${actor.schoolId}:${report.utr}`;
  const credit = await creditEvidence(db, {
    source: 'school_confirmed',
    externalId,
    amountMinor: input.amountSeenMinor,
    link,
    rule: 'A',
    decidedBy: actor.userId,
    via: 'school',
    receipt: { method: 'upi', gateway: null, gatewayPaymentId: null, issuedBy: actor.userId, reference: `UTR ${report.utr}` },
    audit: { reportId, alsoCheckedBy: report.checked_by ?? null },
  });
  if (credit.outcome === 'duplicate') return { ok: false, reason: 'already_decided' };
  const evidenceId = (await db.query(`select evidence_id from payment_evidence where source = 'school_confirmed' and external_id = $1`, [externalId])).rows[0].evidence_id as string;
  await db.query(`update payment_reports set status = 'verified', decided_by = $3, decided_at = now(), amount_seen_minor = $4, evidence_id = $5 where school_id = $1 and report_id = $2`, [actor.schoolId, reportId, actor.userId, input.amountSeenMinor, evidenceId]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'fees.upi_found_in_bank', targetType: 'payment_reports', targetId: reportId, beforeState: { status: report.status }, afterState: { status: 'verified', amountSeenMinor: input.amountSeenMinor, evidenceId, alsoCheckedBy: report.checked_by ?? null, outcome: credit.outcome, unappliedMinor: credit.unappliedMinor } });
  return { ok: true, state: 'verified', credit };
}

// Counted here and in the alerts: every day after `from` up to `to`, Sundays left out.
export function workingDaysBetween(from: string, to: string): number {
  let n = 0;
  for (let d = Date.parse(`${from}T00:00:00Z`) + 86_400_000; d <= Date.parse(`${to}T00:00:00Z`); d += 86_400_000) if (new Date(d).getUTCDay() !== 0) n += 1;
  return n;
}

export type NotFoundReport = { report_id: string; payer: string; utr: string; amount_minor: number; decided_at: string };
// Reports marked "not found" in the last 60 days: the office may look again and reopen one.
export async function recentNotFound(db: PoolClient, schoolId: string): Promise<NotFoundReport[]> {
  const { rows } = await db.query(
    `select r.report_id, coalesce(f.family_code || ' · ', '') || st.name as payer, r.utr, r.amount_minor, r.decided_at
       from payment_reports r join payment_links k on k.school_id = r.school_id and k.link_id = r.link_id
       join fee_billing_students() st on st.school_id = k.school_id and st.student_id = k.student_id
       left join families f on f.school_id = k.school_id and f.family_id = k.family_id
      where r.school_id = $1 and r.status = 'not_found' and r.decided_at > now() - interval '60 days' order by r.decided_at desc limit 50`,
    [schoolId]
  );
  return rows.map((r) => ({ ...r, amount_minor: Number(r.amount_minor), decided_at: new Date(r.decided_at).toISOString() }));
}
