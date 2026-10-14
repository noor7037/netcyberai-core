import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import type { JobQueue, Sql } from '@/lib/jobs/types';
import { siteUrl } from '@/lib/site-config';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import { readUpiSettings, schoolCalendar, workingDaysBetween, type UpiSettings } from './upi';

// Telling the school that UPI payments are waiting (docs/24 §3.3 step 6, §3.5, C175). Every email goes through the
// job queue and the one email sender. They say how many payments wait and for how much; no child, no parent, no UTR.
//   - on a report: one email to the verifiers, if the school chose "each payment" and is under the day's cap;
//   - nightly: the daily digest for everything not yet told; a reminder to the verifiers after 1 working day;
//     an alert to the principal after 2. Each at most once per report.
// Nothing here decides a payment. A report is never confirmed by time passing: it only gets louder.

// "Each payment" emails per school per India day are capped by a Fees setting (default 20, at least 1): beyond it
// the night's digest carries the rest. It is the school's number, never a constant here (C176).
export async function dailyEmailCap(db: Sql, schoolId: string): Promise<number> {
  const fees = SETTINGS_SCHEMAS.find((x) => x.moduleId === 'fees');
  const v = fees ? (await readSettings(db, schoolId, fees)).effective.upi_email_cap : undefined;
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : 20;
}

type Waiting = { report_id: string; amount_minor: string; reported_on: string; notified_at: string | null; reminded_at: string | null; alerted_at: string | null };
const rupees = (minor: number) => (minor / 100).toLocaleString('en-IN', { minimumFractionDigits: minor % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });

async function addresses(db: Sql, schoolId: string, roles: readonly string[]): Promise<string[]> {
  if (roles.length === 0) return [];
  const { rows } = await db.query(
    `select distinct u.email from memberships m join users u on u.user_id = m.user_id
      where m.school_id = $1 and m.is_active and u.is_active and m.role::text = any($2::text[]) and u.email is not null and u.email <> ''`,
    [schoolId, roles]
  );
  return rows.map((r) => r.email as string);
}

async function send(db: Sql, queue: JobQueue, schoolId: string, kind: 'new' | 'digest' | 'reminder' | 'alert', key: string, to: string[], reports: readonly Waiting[]): Promise<boolean> {
  if (to.length === 0 || reports.length === 0) return false;
  const school = (await db.query(`select name from schools where school_id = $1`, [schoolId])).rows[0]?.name as string;
  const total = reports.reduce((t, r) => t + Number(r.amount_minor), 0);
  await queue.enqueue(db, { type: 'email.send', idempotencyKey: key, schoolId, maxAttempts: 4, payload: { to, template: 'upi_waiting', data: { schoolName: school, kind, count: String(reports.length), amount: rupees(total), url: `${siteUrl}/app/fees` } } });
  return true;
}

async function upiSettings(db: Sql, schoolId: string): Promise<UpiSettings> {
  return readUpiSettings((await db.query(`select settings from payment_methods where school_id = $1 and method = 'direct_upi'`, [schoolId])).rows[0]?.settings);
}

// Right after a parent reports a UTR, in the same transaction: tell the verifiers now, if that is the school's choice.
export async function notifyNewReport(db: Sql, queue: JobQueue, schoolId: string, reportId: string, today: string): Promise<'sent' | 'digest' | 'capped' | 'nobody'> {
  const settings = await upiSettings(db, schoolId);
  if (settings.notify !== 'each') return 'digest';
  const sentToday = (await db.query(`select count(*)::int as n from payment_reports where school_id = $1 and (notified_at at time zone 'Asia/Kolkata')::date = $2::date`, [schoolId, today])).rows[0].n as number;
  if (sentToday >= (await dailyEmailCap(db, schoolId))) return 'capped'; // the night's digest carries it
  const report = (await db.query(`select report_id, amount_minor, reported_at::text as reported_on, notified_at, reminded_at, alerted_at from payment_reports where school_id = $1 and report_id = $2`, [schoolId, reportId])).rows as Waiting[];
  if (!(await send(db, queue, schoolId, 'new', `upi.new:${reportId}`, await addresses(db, schoolId, settings.verifiers), report))) return 'nobody';
  await db.query(`update payment_reports set notified_at = now() where school_id = $1 and report_id = $2`, [schoolId, reportId]);
  return 'sent';
}

export type AlertRun = { digest: number; reminded: number; alerted: number };

// The nightly pass for one school, inside the caller's transaction. Safe to run twice: each report is marked as it is told.
export async function runUpiAlerts(db: Sql, queue: JobQueue, schoolId: string, today: string): Promise<AlertRun> {
  const waiting = (await db.query(
    `select report_id, amount_minor, ((reported_at at time zone 'Asia/Kolkata')::date)::text as reported_on, notified_at, reminded_at, alerted_at
       from payment_reports where school_id = $1 and status in ('reported', 'awaiting_principal') order by reported_at for update`,
    [schoolId]
  )).rows as Waiting[];
  if (waiting.length === 0) return { digest: 0, reminded: 0, alerted: 0 };
  const settings = await upiSettings(db, schoolId);
  const verifiers = await addresses(db, schoolId, settings.verifiers);
  const mark = (column: 'notified_at' | 'reminded_at' | 'alerted_at', reports: readonly Waiting[]) => db.query(`update payment_reports set ${column} = now() where school_id = $1 and report_id = any($2::uuid[])`, [schoolId, reports.map((r) => r.report_id)]);

  const untold = waiting.filter((r) => r.notified_at === null);
  const digest = (await send(db, queue, schoolId, 'digest', `upi.digest:${schoolId}:${today}`, verifiers, untold)) ? untold.length : 0;
  if (digest > 0) await mark('notified_at', untold);

  const calendar = await schoolCalendar(db, schoolId);
  const age = (r: Waiting) => workingDaysBetween(r.reported_on, today, calendar);
  const late = waiting.filter((r) => r.reminded_at === null && age(r) >= 1);
  const reminded = (await send(db, queue, schoolId, 'reminder', `upi.reminder:${schoolId}:${today}`, verifiers, late)) ? late.length : 0;
  if (reminded > 0) await mark('reminded_at', late);

  const veryLate = waiting.filter((r) => r.alerted_at === null && age(r) >= 2);
  const alerted = (await send(db, queue, schoolId, 'alert', `upi.alert:${schoolId}:${today}`, await addresses(db, schoolId, ['principal']), veryLate)) ? veryLate.length : 0;
  if (alerted > 0) await mark('alerted_at', veryLate);
  return { digest, reminded, alerted };
}

// ---- Reopening a "not found" --------------------------------------------------

export type ReopenResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'reason' | 'not_found' | 'not_reopenable' | 'another_waiting' };

// The office looked again and wants to check this UTR once more (C175): a "not found" goes back to waiting. The
// principal or the accountant, with a reason, audited. The parent still cannot enter that UTR again; it is already here.
export async function reopenReport(db: Sql, actor: { schoolId: string; userId: string; role: StaffRole }, reportId: string, reasonRaw: string): Promise<ReopenResult> {
  if (actor.role !== 'principal' && actor.role !== 'accountant') return { ok: false, reason: 'not_allowed' };
  const reason = reasonRaw.trim().replace(/\s+/g, ' ');
  if (reason.length < 1 || reason.length > 300) return { ok: false, reason: 'reason' };
  const report = (await db.query(`select status, link_id from payment_reports where school_id = $1 and report_id = $2 for update`, [actor.schoolId, reportId])).rows[0];
  if (!report) return { ok: false, reason: 'not_found' };
  if (report.status !== 'not_found') return { ok: false, reason: 'not_reopenable' };
  // The parent may have entered a corrected UTR meanwhile: one waiting report per link.
  if ((await db.query(`select 1 from payment_reports where link_id = $1 and status in ('reported', 'awaiting_principal')`, [report.link_id])).rows[0]) return { ok: false, reason: 'another_waiting' };
  await db.query(`update payment_reports set status = 'reported', decided_by = null, decided_at = null, reopened_by = $3, reopened_at = now(), reopen_reason = $4 where school_id = $1 and report_id = $2`, [actor.schoolId, reportId, actor.userId, reason]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'fees.upi_reopened', targetType: 'payment_reports', targetId: reportId, beforeState: { status: 'not_found' }, afterState: { status: 'reported', reasoned: true } }); // the reason is on the report (reopen_reason) (C224)
  return { ok: true };
}
