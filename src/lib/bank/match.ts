import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { FINANCE } from '@/lib/fees/structures';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import { creditEvidence, type Applied } from '@/lib/payments/apply';
import { indiaDate } from '@/lib/time/india';

// Matching statement rows to payments (docs/24 §3.4 path B, §3.5, §3.6, C177).
//
// A bank row confirms a payment by itself only on one of two rules:
//   R1  the row carries a link's reference code, the link is open, and the
//       credit is dated from the day the link was made onwards;
//   R2  the row's UTR is the UTR a parent entered, the report is still
//       waiting, and the amount is the link's amount.
// NEVER on amount or date alone. When the row points two ways (its code
// says one family, its UTR another), or at something a person already
// decided ("not found"), or at a closed link, it goes to the office's list
// and waits for a person. A row is used at most once (the database holds
// that), and every credit goes through the one ledger door.
//
// A row can also simply be SEEN: it is the bank's line for a payment that
// was already credited, by "Found in bank" (path A) or at the counter
// (UPI or cheque). Then nothing is credited; the row is tied to that
// credit's evidence, which is how a confirmation is later shown to be true.

type Actor = { schoolId: string; userId: string; role: StaffRole };
type Row = { row_id: string; value_date: string; narration: string; utr: string | null; reference_code: string | null; amount_minor: number };
type Link = { link_id: string; school_id: string; family_id: string | null; student_id: string; status: string; amount_minor: string | number; made_on: string };
export type MatchRun = { credited: number; seen: number; needsPerson: number; left: number };

const LINK = `link_id, school_id, family_id, student_id, status, amount_minor, (created_at at time zone 'Asia/Kolkata')::date::text as made_on`;
const digits = (s: string) => (s.match(/[0-9]{6,}/g) ?? []).map((d) => d.replace(/^0+/, ''));

async function credit(db: PoolClient, actor: Actor, row: Row, link: Link, rule: 'R1' | 'R2' | 'manual', reason: string | null): Promise<Applied> {
  const externalId = `${actor.schoolId}:${row.row_id}`;
  const result = await creditEvidence(db, {
    source: 'bank_statement_row',
    externalId,
    amountMinor: row.amount_minor,
    link,
    rule,
    decidedBy: actor.userId,
    reason,
    via: 'school',
    receipt: { method: row.utr || row.reference_code ? 'upi' : 'netbanking', gateway: null, gatewayPaymentId: null, issuedBy: actor.userId, reference: row.utr ? `UTR ${row.utr}` : `Bank statement ${row.value_date}` },
    audit: { bankRowId: row.row_id, rule },
  });
  const evidenceId = (await db.query(`select evidence_id from payment_evidence where source = 'bank_statement_row' and external_id = $1`, [externalId])).rows[0].evidence_id as string;
  await db.query(`update bank_credit_rows set match_status = 'matched', evidence_id = $3, decided_by = $4, decided_at = now(), decision_reason = $5 where school_id = $1 and row_id = $2`, [actor.schoolId, row.row_id, evidenceId, actor.userId, reason]);
  // The parent's report of this payment, if there is one, is settled by the bank's own line: by its UTR, or because
  // its link has now been paid. It can no longer be confirmed, or reopened, a second time.
  await db.query(
    `update payment_reports set status = 'verified', decided_by = $3, decided_at = now(), amount_seen_minor = $4, evidence_id = $5
      where school_id = $1 and ((utr = $6 and status in ('reported', 'awaiting_principal', 'not_found')) or (link_id = $2 and status in ('reported', 'awaiting_principal')))`,
    [actor.schoolId, link.link_id, actor.userId, row.amount_minor, evidenceId, row.utr]
  );
  return result;
}

const seen = (db: PoolClient, schoolId: string, rowId: string, evidenceId: string) => db.query(`update bank_credit_rows set match_status = 'matched', evidence_id = $3, decided_at = now() where school_id = $1 and row_id = $2`, [schoolId, rowId, evidenceId]);
const toPerson = (db: PoolClient, schoolId: string, rowId: string) => db.query(`update bank_credit_rows set match_status = 'needs_person' where school_id = $1 and row_id = $2`, [schoolId, rowId]);

// Every row not yet matched is looked at again. Run after each upload, and by "Check again".
export async function matchStatementRows(db: PoolClient, actor: Actor): Promise<MatchRun | { notAllowed: true }> {
  if (!FINANCE.includes(actor.role)) return { notAllowed: true };
  const run: MatchRun = { credited: 0, seen: 0, needsPerson: 0, left: 0 };
  const today = indiaDate();
  const rows = (await db.query(`select row_id, value_date::text as value_date, narration, utr, reference_code, amount_minor from bank_credit_rows where school_id = $1 and match_status = 'unmatched' order by value_date, row_id limit 5000 for update`, [actor.schoolId])).rows.map((r) => ({ ...r, amount_minor: Number(r.amount_minor) })) as Row[];
  for (const row of rows) {
    const report = row.utr ? (await db.query(`select r.report_id, r.link_id, r.status, r.amount_seen_minor, r.evidence_id, v.source from payment_reports r left join payment_evidence v on v.evidence_id = r.evidence_id where r.school_id = $1 and r.utr = $2 for update of r`, [actor.schoolId, row.utr])).rows[0] : undefined;
    const coded = row.reference_code ? ((await db.query(`select ${LINK} from payment_links where school_id = $1 and reference_code = $2 for update`, [actor.schoolId, row.reference_code])).rows[0] as Link | undefined) : undefined;
    const used = async (evidenceId: string) => !!(await db.query(`select 1 from bank_credit_rows where school_id = $1 and evidence_id = $2`, [actor.schoolId, evidenceId])).rows[0];

    if (report?.status === 'verified') {
      // Path B checks path A: this is the bank's line for a payment someone confirmed by hand.
      if (Number(report.amount_seen_minor) === row.amount_minor && !(await used(report.evidence_id))) {
        await seen(db, actor.schoolId, row.row_id, report.evidence_id);
        run.seen += 1;
      } else {
        await toPerson(db, actor.schoolId, row.row_id);
        run.needsPerson += 1;
      }
      continue;
    }
    if (report?.status === 'not_found') {
      // "Marked not found — but in the bank": a person said no; only a person says yes.
      await toPerson(db, actor.schoolId, row.row_id);
      run.needsPerson += 1;
      continue;
    }
    if (report && (report.status === 'reported' || report.status === 'awaiting_principal')) {
      const link = (await db.query(`select ${LINK} from payment_links where school_id = $1 and link_id = $2 for update`, [actor.schoolId, report.link_id])).rows[0] as Link;
      const sameFamily = !coded || coded.link_id === link.link_id;
      // R2 needs the link's amount; the same link's own code on the row (R1) carries another amount too.
      if (sameFamily && (Number(link.amount_minor) === row.amount_minor || coded)) {
        await credit(db, actor, row, link, Number(link.amount_minor) === row.amount_minor ? 'R2' : 'R1', null);
        run.credited += 1;
      } else {
        await toPerson(db, actor.schoolId, row.row_id);
        run.needsPerson += 1;
      }
      continue;
    }
    if (coded) {
      // A waiting report on this link with another UTR than the row's own: two stories about one link.
      const other = row.utr ? (await db.query(`select 1 from payment_reports where school_id = $1 and link_id = $2 and status in ('reported', 'awaiting_principal') and utr <> $3`, [actor.schoolId, coded.link_id, row.utr])).rows[0] : undefined;
      if (coded.status === 'open' && row.value_date >= coded.made_on && row.value_date <= today && !other) {
        await credit(db, actor, row, coded, 'R1', null);
        run.credited += 1;
      } else {
        await toPerson(db, actor.schoolId, row.row_id);
        run.needsPerson += 1;
      }
      continue;
    }
    // A payment taken at the counter by UPI or cheque: the same amount, and the UTR or cheque number the desk typed.
    const wanted = row.utr ? [row.utr.replace(/^0+/, '')] : digits(row.narration);
    const counter = wanted.length === 0 ? [] : (await db.query(
      `select r.evidence_id, r.reference from receipts r
        where r.school_id = $1 and r.reversed_at is null and r.payment_link_id is null and r.method in ('upi', 'cheque', 'netbanking') and r.total_minor = $2 and r.reference is not null
          and r.issued_at > now() - interval '120 days' and r.evidence_id is not null and not exists (select 1 from bank_credit_rows b where b.school_id = r.school_id and b.evidence_id = r.evidence_id)`,
      [actor.schoolId, row.amount_minor]
    )).rows.filter((r) => digits(r.reference as string).some((d) => wanted.includes(d)));
    if (counter.length === 1) {
      await seen(db, actor.schoolId, row.row_id, counter[0].evidence_id);
      run.seen += 1;
    } else run.left += 1;
  }
  if (run.credited + run.seen + run.needsPerson > 0) await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'bank.rows_matched', targetType: 'bank_credit_rows', targetId: actor.schoolId, beforeState: undefined, afterState: { ...run } });
  return run;
}

export type HandResult = { ok: true; credit?: Applied } | { ok: false; reason: 'not_allowed' | 'reason' | 'no_row' | 'already_decided' | 'no_link' | 'reported_for_another' | 'already_credited' };
const cleanReason = (raw: string) => raw.trim().replace(/\s+/g, ' ').slice(0, 300);

// A person ties a bank row to a family's payment link. The bank row is the proof; the person and the reason are kept.
export async function matchByHand(db: PoolClient, actor: Actor, rowId: string, linkId: string, reasonRaw: string): Promise<HandResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const reason = cleanReason(reasonRaw);
  if (!reason) return { ok: false, reason: 'reason' };
  const row = (await db.query(`select row_id, value_date::text as value_date, narration, utr, reference_code, amount_minor, match_status from bank_credit_rows where school_id = $1 and row_id = $2 for update`, [actor.schoolId, rowId])).rows[0];
  if (!row) return { ok: false, reason: 'no_row' };
  if (row.match_status !== 'unmatched' && row.match_status !== 'needs_person') return { ok: false, reason: 'already_decided' };
  const link = (await db.query(`select ${LINK} from payment_links where school_id = $1 and link_id = $2 for update`, [actor.schoolId, linkId])).rows[0] as Link | undefined;
  if (!link) return { ok: false, reason: 'no_link' };
  const report = row.utr ? (await db.query(`select link_id, status, evidence_id from payment_reports where school_id = $1 and utr = $2 and status <> 'withdrawn' for update`, [actor.schoolId, row.utr])).rows[0] : undefined;
  // A parent entered this UTR for a family: the money is that family's, or the report is wrong and is dealt with first.
  if (report && report.link_id !== linkId) return { ok: false, reason: 'reported_for_another' };
  if (report?.status === 'verified') {
    // Already credited by "Found in bank". The row is not credited again: it is tied to that confirmation as the
    // bank's line for it (the amounts differ, which is why a person is looking), with the person's reason.
    const tied = await db.query(`update bank_credit_rows b set match_status = 'matched', evidence_id = $3, decided_by = $4, decided_at = now(), decision_reason = $5 where b.school_id = $1 and b.row_id = $2 and not exists (select 1 from bank_credit_rows o where o.school_id = b.school_id and o.evidence_id = $3)`, [actor.schoolId, rowId, report.evidence_id, actor.userId, reason]);
    if (tied.rowCount !== 1) return { ok: false, reason: 'already_credited' };
    await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'bank.row_matched_by_hand', targetType: 'bank_credit_rows', targetId: rowId, beforeState: { status: row.match_status }, afterState: { status: 'matched', linkId, reasoned: true, outcome: 'seen_not_credited' } });
    return { ok: true };
  }
  const result = await credit(db, actor, { ...row, amount_minor: Number(row.amount_minor) }, link, 'manual', reason);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'bank.row_matched_by_hand', targetType: 'bank_credit_rows', targetId: rowId, beforeState: { status: row.match_status }, afterState: { status: 'matched', linkId, reasoned: true, outcome: result.outcome, unappliedMinor: result.unappliedMinor } });
  return { ok: true, credit: result };
}

// A credit that is not a fee (a donation, a refund from a supplier): set aside with a reason, never credited.
export async function markNotAFee(db: PoolClient, actor: Actor, rowId: string, reasonRaw: string): Promise<HandResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const reason = cleanReason(reasonRaw);
  if (!reason) return { ok: false, reason: 'reason' };
  const done = await db.query(`update bank_credit_rows set match_status = 'not_a_fee', decided_by = $3, decided_at = now(), decision_reason = $4 where school_id = $1 and row_id = $2 and match_status in ('unmatched', 'needs_person')`, [actor.schoolId, rowId, actor.userId, reason]);
  if (done.rowCount !== 1) return { ok: false, reason: (await db.query(`select 1 from bank_credit_rows where school_id = $1 and row_id = $2`, [actor.schoolId, rowId])).rows[0] ? 'already_decided' : 'no_row' };
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'bank.row_not_a_fee', targetType: 'bank_credit_rows', targetId: rowId, beforeState: undefined, afterState: { status: 'not_a_fee', reasoned: true } }); // the reason is on the row (decision_reason) (C224)
  return { ok: true };
}

export type ListedRow = { row_id: string; value_date: string; narration: string; utr: string | null; amount_minor: number; needs_person: boolean; marked_not_found: boolean; candidate_link_id: string | null; candidate: string | null };
export type BankLists = {
  rows: ListedRow[]; // credits waiting for a person: first those that need one, then those that matched nothing
  unmatchedCount: number;
  unmatchedMinor: number;
  missing: { report_id: string; payer: string; utr: string; amount_minor: number; confirmed_by: string | null; confirmed_on: string }[]; // red, the principal's
  counterUnseen: { receipt_no: string; method: string; reference: string | null; total_minor: number; issued_on: string; days: number }[];
  unseenAfterDays: number;
  links: { link_id: string; label: string }[]; // open payment links, to match a credit to by hand
};
const PAYER = `coalesce(f.family_code || ' · ', '') || st.name`;

export async function bankLists(db: PoolClient, schoolId: string, role: StaffRole): Promise<BankLists> {
  const n = Number;
  const rows = (await db.query(
    `select b.row_id, b.value_date::text as value_date, b.narration, b.utr, b.amount_minor, b.match_status = 'needs_person' as needs_person, coalesce(r.status = 'not_found', false) as marked_not_found,
            coalesce(r.link_id, k.link_id) as candidate_link_id,
            (select ${PAYER} from payment_links c join fee_billing_students() st on st.school_id = c.school_id and st.student_id = c.student_id left join families f on f.school_id = c.school_id and f.family_id = c.family_id
              where c.school_id = b.school_id and c.link_id = coalesce(r.link_id, k.link_id)) as candidate
       from bank_credit_rows b
       left join payment_reports r on r.school_id = b.school_id and r.utr = b.utr
       left join payment_links k on k.school_id = b.school_id and k.reference_code = b.reference_code
      where b.school_id = $1 and b.match_status in ('needs_person', 'unmatched')
      order by (b.match_status = 'needs_person') desc, b.value_date desc, b.row_id limit 100`,
    [schoolId]
  )).rows.map((r) => ({ ...r, amount_minor: n(r.amount_minor) })) as ListedRow[];
  const totals = (await db.query(`select count(*)::int as c, coalesce(sum(amount_minor), 0) as minor from bank_credit_rows where school_id = $1 and match_status = 'unmatched'`, [schoolId])).rows[0];
  // Confirmed one by one ("Found in bank"), and a statement that covers that day and the next has since come in, yet
  // no line of any statement carries it. For the principal: a mistaken or a false confirmation shows here.
  const missing = role !== 'principal' ? [] : (await db.query(
    `select r.report_id, ${PAYER} as payer, r.utr, r.amount_seen_minor as amount_minor, u.display_name as confirmed_by, (r.decided_at at time zone 'Asia/Kolkata')::date::text as confirmed_on
       from payment_reports r join payment_evidence v on v.evidence_id = r.evidence_id and v.source = 'school_confirmed'
       join payment_links k on k.school_id = r.school_id and k.link_id = r.link_id
       join fee_billing_students() st on st.school_id = k.school_id and st.student_id = k.student_id
       left join families f on f.school_id = k.school_id and f.family_id = k.family_id
       left join users u on u.user_id = r.decided_by
      where r.school_id = $1 and r.status = 'verified' and not exists (select 1 from bank_credit_rows b where b.school_id = r.school_id and b.evidence_id = r.evidence_id)
        and exists (select 1 from bank_statement_imports i where i.school_id = r.school_id and i.period_from <= (r.reported_at at time zone 'Asia/Kolkata')::date and i.period_to > (r.reported_at at time zone 'Asia/Kolkata')::date)
      order by r.decided_at limit 100`,
    [schoolId]
  )).rows.map((r) => ({ ...r, amount_minor: n(r.amount_minor) }));
  const fees = SETTINGS_SCHEMAS.find((x) => x.moduleId === 'fees');
  const setting = fees ? (await readSettings(db, schoolId, fees)).effective.bank_unseen_days : undefined;
  const unseenAfterDays = typeof setting === 'number' && Number.isInteger(setting) && setting >= 1 ? setting : 3;
  // Counter UPI and cheques are expected in the bank too (§3.6). Only once the school gives statements at all.
  const counterUnseen = (await db.query(
    `select r.receipt_no, r.method, r.reference, r.total_minor, (r.issued_at at time zone 'Asia/Kolkata')::date::text as issued_on, ((now() at time zone 'Asia/Kolkata')::date - (r.issued_at at time zone 'Asia/Kolkata')::date)::int as days
       from receipts r
      where r.school_id = $1 and r.reversed_at is null and r.payment_link_id is null and r.method in ('upi', 'cheque', 'netbanking') and r.issued_at > now() - interval '120 days'
        and (now() at time zone 'Asia/Kolkata')::date - (r.issued_at at time zone 'Asia/Kolkata')::date > $2
        and exists (select 1 from bank_statement_imports i where i.school_id = r.school_id)
        and not exists (select 1 from bank_credit_rows b where b.school_id = r.school_id and b.evidence_id = r.evidence_id)
      order by r.issued_at limit 100`,
    [schoolId, unseenAfterDays]
  )).rows.map((r) => ({ ...r, total_minor: n(r.total_minor) }));
  const links = rows.length === 0 ? [] : (await db.query(
    `select k.link_id, ${PAYER} || ' · ₹' || trim(to_char(k.amount_minor / 100.0, 'FM99999999990.00')) as label
       from payment_links k join fee_billing_students() st on st.school_id = k.school_id and st.student_id = k.student_id left join families f on f.school_id = k.school_id and f.family_id = k.family_id
      where k.school_id = $1 and k.status = 'open' order by 2 limit 300`,
    [schoolId]
  )).rows;
  return { rows, unmatchedCount: totals.c, unmatchedMinor: n(totals.minor), missing, counterUnseen, unseenAfterDays, links };
}
