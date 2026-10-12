import { randomBytes } from 'crypto';
import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { allocateOldestFirst, openDues, type OpenDue } from './payments';
import type { PaymentProvider } from '@/lib/payments/provider';
import { FINANCE } from './structures';

// A family's dues, and one payment link per family (docs/23 6e, C168).
// Everything a family owes across its children, child by child with one
// total; and a link for an amount whose lines say, to the paisa, which due
// of which child the money is for. The lines are fixed when the link is
// made, so what a parent pays is what the office saw.

type Actor = { schoolId: string; userId: string; role: StaffRole };
export const LINK_DAYS = 7;

export type ChildDues = { studentId: string; studentName: string; dues: OpenDue[]; owedMinor: number };
export type FamilyDues = { familyCode: string | null; children: ChildDues[]; totalMinor: number };

// Pure: the dues grouped by child, in the order the children first appear (oldest due first).
export function byChild(dues: readonly OpenDue[]): ChildDues[] {
  const out: ChildDues[] = [];
  for (const d of dues) {
    let child = out.find((c) => c.studentId === d.student_id);
    if (!child) out.push((child = { studentId: d.student_id, studentName: d.student_name, dues: [], owedMinor: 0 }));
    child.dues.push(d);
    child.owedMinor += d.balance_minor;
  }
  return out;
}

export type Split = { lines: { feeId: string; studentId: string; amountMinor: number }[]; perChild: { studentId: string; amountMinor: number }[]; totalMinor: number };

// Pure: where an amount goes across a family's dues. The oldest due first,
// each filled before the next, whoever's it is; whole paise; nothing is
// rounded, so the children's shares always add up to the amount exactly.
export function splitAcrossChildren(amountMinor: number, dues: readonly OpenDue[]): Split {
  const child = new Map(dues.map((d) => [d.fee_id, d.student_id]));
  const lines = allocateOldestFirst(amountMinor, dues).map((a) => ({ feeId: a.feeId, studentId: child.get(a.feeId) as string, amountMinor: a.amountMinor }));
  const perChild: Split['perChild'] = [];
  for (const l of lines) {
    const c = perChild.find((x) => x.studentId === l.studentId);
    if (c) c.amountMinor += l.amountMinor;
    else perChild.push({ studentId: l.studentId, amountMinor: l.amountMinor });
  }
  return { lines, perChild, totalMinor: lines.reduce((t, l) => t + l.amountMinor, 0) };
}

export async function familyDues(db: PoolClient, schoolId: string, studentId: string): Promise<FamilyDues | null> {
  const student = (await db.query(`select st.family_id, f.family_code from fee_billing_students() st left join families f on f.school_id = st.school_id and f.family_id = st.family_id where st.school_id = $1 and st.student_id = $2`, [schoolId, studentId])).rows[0];
  if (!student) return null;
  const children = byChild(await openDues(db, schoolId, studentId, student.family_id ? 'family' : 'student'));
  return { familyCode: (student.family_code as string | null) ?? null, children, totalMinor: children.reduce((t, c) => t + c.owedMinor, 0) };
}

export type PaymentLink = { linkId: string; token: string; amountMinor: number; status: string; expiresAt: string; payable: boolean; lines: { feeId: string; studentId: string; studentName: string; amountMinor: number }[] };
export type LinkResult = { ok: true; link: PaymentLink; created: boolean } | { ok: false; reason: 'not_allowed' | 'unknown_student' | 'nothing_owed' | 'amount' | 'more_than_owed' | 'link_exists' | 'not_found' };

const LINK = `select k.link_id, k.token, k.amount_minor, k.status, k.expires_at, k.provider_ref is not null as payable,
         coalesce((select jsonb_agg(jsonb_build_object('feeId', n.fee_id, 'studentId', l.student_id, 'studentName', st.name, 'amountMinor', n.amount_minor) order by l.due_date, l.created_at, l.fee_id)
                     from payment_link_lines n join fees_ledger l on l.fee_id = n.fee_id join fee_billing_students() st on st.student_id = l.student_id
                    where n.link_id = k.link_id), '[]'::jsonb) as lines
    from payment_links k`;
const asLink = (r: Record<string, unknown>): PaymentLink => ({ linkId: r.link_id as string, token: r.token as string, amountMinor: Number(r.amount_minor), status: r.status as string, expiresAt: new Date(r.expires_at as string).toISOString(), payable: r.payable === true, lines: (r.lines as PaymentLink['lines']).map((l) => ({ ...l, amountMinor: Number(l.amountMinor) })) });

// The family's open link, if it has one. A link past its date is closed first, so it is never offered.
export async function openLink(db: PoolClient, schoolId: string, studentId: string): Promise<PaymentLink | null> {
  await db.query(`update payment_links set status = 'expired', closed_at = now() where school_id = $1 and status = 'open' and expires_at <= now()`, [schoolId]);
  const { rows } = await db.query(
    `${LINK} where k.school_id = $1 and k.status = 'open'
        and ((k.family_id is not null and k.family_id = (select family_id from fee_billing_students() where school_id = $1 and student_id = $2)) or (k.family_id is null and k.student_id = $2))`,
    [schoolId, studentId]
  );
  return rows[0] ? asLink(rows[0]) : null;
}

// One open link per family. Asking again for the same amount gives the same
// link; for another amount the office cancels the old one first.
// `amountMinor` null means everything the family owes today. With a payment
// provider, a checkout is opened for the link and its reference kept; without
// one the link is a record that cannot be paid online.
export async function createPaymentLink(db: PoolClient, actor: Actor, input: { studentId: string; amountMinor: number | null }, provider: PaymentProvider | null = null, configId: string | null = null): Promise<LinkResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const student = (await db.query(`select family_id from fee_billing_students() where school_id = $1 and student_id = $2`, [actor.schoolId, input.studentId])).rows[0];
  if (!student) return { ok: false, reason: 'unknown_student' };
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`paylink:${actor.schoolId}:${student.family_id ?? input.studentId}`]);
  const dues = await openDues(db, actor.schoolId, input.studentId, student.family_id ? 'family' : 'student');
  const owed = dues.reduce((t, d) => t + d.balance_minor, 0);
  if (owed === 0) return { ok: false, reason: 'nothing_owed' };
  const amount = input.amountMinor ?? owed;
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: 'amount' };
  if (amount > owed) return { ok: false, reason: 'more_than_owed' };
  const existing = await openLink(db, actor.schoolId, input.studentId);
  if (existing) return existing.amountMinor === amount ? { ok: true, link: existing, created: false } : { ok: false, reason: 'link_exists' };

  const split = splitAcrossChildren(amount, dues);
  const made = await db.query(
    `insert into payment_links (school_id, family_id, student_id, token, amount_minor, created_by, expires_at) values ($1, $2, $3, $4, $5, $6, now() + make_interval(days => $7)) returning link_id`,
    [actor.schoolId, student.family_id, input.studentId, randomBytes(32).toString('base64url'), amount, actor.userId, LINK_DAYS]
  );
  const linkId = made.rows[0].link_id as string;
  await db.query(`insert into payment_link_lines (school_id, link_id, fee_id, amount_minor) select $1, $2, n.fee_id, n.amount from unnest($3::uuid[], $4::bigint[]) as n(fee_id, amount)`, [actor.schoolId, linkId, split.lines.map((l) => l.feeId), split.lines.map((l) => l.amountMinor)]);
  if (provider) {
    const row = (await db.query(`select token, expires_at from payment_links where link_id = $1`, [linkId])).rows[0];
    // If the provider cannot open a checkout this throws, and the link is not made at all.
    const checkout = await provider.createCheckout({ linkId, token: row.token as string, amountMinor: amount, expiresAt: new Date(row.expires_at as string) });
    await db.query(`update payment_links set provider = $3, provider_ref = $4, checkout_url = $5, config_id = $6 where school_id = $1 and link_id = $2`, [actor.schoolId, linkId, provider.name, checkout.providerRef, checkout.checkoutUrl, configId]);
  }
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'fees.payment_link_created', targetType: 'payment_links', targetId: linkId, beforeState: undefined, afterState: { amountMinor: amount, lines: split.lines.length, children: split.perChild.length } });
  return { ok: true, link: (await openLink(db, actor.schoolId, input.studentId)) as PaymentLink, created: true };
}

export async function cancelPaymentLink(db: PoolClient, actor: Actor, linkId: string): Promise<LinkResult | { ok: true; cancelled: true }> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const done = await db.query(`update payment_links set status = 'cancelled', closed_at = now() where school_id = $1 and link_id = $2 and status = 'open'`, [actor.schoolId, linkId]);
  if (done.rowCount !== 1) return { ok: false, reason: 'not_found' };
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'fees.payment_link_cancelled', targetType: 'payment_links', targetId: linkId, beforeState: { status: 'open' }, afterState: { status: 'cancelled' } });
  return { ok: true, cancelled: true };
}
