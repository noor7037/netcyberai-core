import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { classLabel } from '@/lib/frameworks/class-label';
import { rupeesToMinor } from '@/lib/fees/money';
import { FINANCE, listStructures } from '@/lib/fees/structures';
import { indiaDate, isIsoDate } from '@/lib/time/india';
import { ageOf, claimFor, hasTwelveDigitRun, isEvidenceKind, isOnlyTwelveDigits, UNPAID_BUCKETS, yearFeeMinor, type AgeBucket, type Applied, type EvidenceKind, type FeeVersion } from './rules';

// The RTE claim desk (docs/28 slice 10c, C223): the state's rate for each school year, each RTE child's evidence
// file, the year's claim sheet, raising a claim, marking it paid or writing it off, and unpaid claims by age.
//
// Every function runs in the caller's own tenant transaction. Row level security lets only the principal, the
// school admin and the accountant read or write these tables; every function also refuses anyone else itself.
// Every change of money (a rate, a claim raised, paid or written off) and of evidence is audited.

type Actor = { schoolId: string; userId: string; role: StaffRole };
type Db = Pick<PoolClient, 'query'>;

export type Session = { session_id: string; label: string; start_date: string; end_date: string; is_current: boolean };
export type Rate = { rate_id: string; rate_minor: number; source: string; typed_by: string | null; typed_at: string };
export type Doc = { document_id: string; doc_type: string; uploaded_at: string };
export type Evidence = { evidence_id: string; kind: EvidenceKind; document: Doc | null; note: string | null; added_by: string | null; added_at: string };
export type ClaimState = 'raised' | 'paid' | 'written_off';
export type Claim = {
  claim_id: string;
  session_id: string;
  state: ClaimState;
  class_name: string | null;
  fee_minor: number;
  rate_minor: number;
  amount_minor: number;
  applied: Applied;
  raised_on: string;
  raised_by: string | null;
  paid_on: string | null;
  reference: string | null;
  write_off_note: string | null;
  settled_by: string | null;
  // How long it has waited since it was raised, and its bucket (the free tool's); 'paid' once nothing is due.
  days: number;
  bucket: AgeBucket;
};
// Why a child on the sheet has no claim to raise yet.
export type Blocked = 'no_rate' | 'no_class' | 'no_fee';
// Why a child of the desk is not on this year's sheet.
export type OffSheet = 'left' | 'admitted_later';
export type DeskChild = {
  student_id: string;
  name: string;
  admission_no: string | null;
  class_name: string | null;
  status: string;
  // Still marked as admitted under RTE (a child no longer marked is on the desk only for a year they were claimed in).
  rte: boolean;
  entry_class: string | null;
  admitted_on: string | null;
  evidence: Evidence[];
  documents: Doc[];
  onSheet: boolean;
  offSheet: OffSheet | null;
  claim: Claim | null;
  proposed: { fee_minor: number; rate_minor: number; amount_minor: number; applied: Applied } | null;
  blocked: Blocked | null;
};
export type AgeingYear = {
  session_id: string;
  label: string;
  claims: number;
  claimed_minor: number;
  paid_minor: number;
  written_off_minor: number;
  due_minor: number;
  buckets: { bucket: AgeBucket; minor: number; count: number }[];
  oldest_days: number | null;
};
export type Desk = {
  today: string;
  sessions: Session[];
  session: Session | null;
  rate: Rate | null;
  earlierRates: Rate[];
  children: DeskChild[];
  totals: { onSheet: number; ready: number; toRaiseMinor: number; raisedMinor: number; paidMinor: number; writtenOffMinor: number; noEvidence: number };
  ageing: AgeingYear[];
};

const ON_ROLL = ['active', 'pending_consent'];
const n = (v: unknown) => Number(v ?? 0);

// ---- reading -------------------------------------------------------------------------------------------------------

async function sessionsOf(db: Db, schoolId: string): Promise<Session[]> {
  return (await db.query(`select session_id, label, start_date::text as start_date, end_date::text as end_date, is_current from academic_sessions where school_id = $1 order by start_date desc`, [schoolId])).rows;
}

// The year asked for; else the current one; else the one today falls in; else the latest.
function chooseSession(sessions: Session[], asked: string | null, today: string): Session | null {
  return sessions.find((s) => s.session_id === asked) ?? sessions.find((s) => s.is_current) ?? sessions.find((s) => s.start_date <= today && today <= s.end_date) ?? sessions[0] ?? null;
}

// Every rate typed for a year, the one in force (the latest typed) first.
async function ratesOf(db: Db, schoolId: string, sessionId: string): Promise<Rate[]> {
  const { rows } = await db.query(
    `select r.rate_id, r.rate_minor, r.source, u.display_name as typed_by, r.typed_at
       from rte_rates r left join users u on u.school_id = r.school_id and u.user_id = r.typed_by
      where r.school_id = $1 and r.session_id = $2 order by r.typed_at desc`,
    [schoolId, sessionId]
  );
  return rows.map((r) => ({ ...r, rate_minor: n(r.rate_minor), typed_at: new Date(r.typed_at).toISOString() }));
}

// The year's fee for each class with a fee structure in that year, in the heads RTE covers.
async function feesOf(db: Db, schoolId: string, session: Session): Promise<Map<string, number | null>> {
  const covered = new Set(((await db.query(`select head_id from fee_heads where school_id = $1 and rte_covered`, [schoolId])).rows as { head_id: string }[]).map((r) => r.head_id));
  const byClass = new Map<string, FeeVersion[]>();
  for (const s of await listStructures(db as PoolClient, schoolId)) {
    if (s.session_id !== session.session_id) continue;
    byClass.set(s.class_id, [...(byClass.get(s.class_id) ?? []), { effective_from: s.effective_from, items: s.items }]);
  }
  return new Map([...byClass].map(([classId, versions]) => [classId, yearFeeMinor(versions, covered, session)]));
}

type ChildRow = { student_id: string; name: string; admission_no: string | null; class_id: string | null; class_name: string | null; status: string; rte_admission: boolean; rte_entry_class: string | null; rte_admitted_on: string | null };

async function childrenOf(db: Db, schoolId: string): Promise<ChildRow[]> {
  const { rows } = await db.query(
    `select c.student_id, c.name, c.admission_no, c.class_id, k.name as k_name, k.section as k_section, c.status, c.rte_admission, c.rte_entry_class, c.rte_admitted_on::text as rte_admitted_on
       from public.rte_claim_children() c
       left join classes k on k.school_id = $1 and k.class_id = c.class_id
      order by k.name nulls last, k.section nulls last, c.name, c.student_id`,
    [schoolId]
  );
  return rows.map((r) => ({ ...r, class_name: classLabel(r.k_name, r.k_section) }));
}

type ClaimRow = Omit<Claim, 'applied' | 'days' | 'bucket'> & { student_id: string };

async function claimsOf(db: Db, schoolId: string): Promise<ClaimRow[]> {
  const { rows } = await db.query(
    `select c.claim_id, c.student_id, c.session_id, c.state, k.name as k_name, k.section as k_section, c.fee_minor, c.rate_minor, c.amount_minor, c.raised_on::text as raised_on,
            r.display_name as raised_by, c.paid_on::text as paid_on, c.reference, c.write_off_note, s.display_name as settled_by
       from rte_claims c
       left join classes k on k.school_id = c.school_id and k.class_id = c.class_id
       left join users r on r.school_id = c.school_id and r.user_id = c.raised_by
       left join users s on s.school_id = c.school_id and s.user_id = c.settled_by
      where c.school_id = $1 order by c.raised_on, c.claim_id`,
    [schoolId]
  );
  return rows.map((r) => ({
    claim_id: r.claim_id,
    student_id: r.student_id,
    session_id: r.session_id,
    state: r.state,
    class_name: classLabel(r.k_name, r.k_section),
    fee_minor: n(r.fee_minor),
    rate_minor: n(r.rate_minor),
    amount_minor: n(r.amount_minor),
    raised_on: r.raised_on,
    raised_by: r.raised_by,
    paid_on: r.paid_on,
    reference: r.reference,
    write_off_note: r.write_off_note,
    settled_by: r.settled_by,
  }));
}

function withAge(c: ClaimRow, today: string): Claim {
  const { student_id: _child, ...rest } = c;
  return { ...rest, applied: claimFor(c.rate_minor, c.fee_minor).applied, ...ageOf(c.raised_on, today, c.state === 'raised' ? c.amount_minor : 0) };
}

// The year's sheet: who is on it, and for each child the claim raised, or the claim the rule gives and why it
// cannot be raised yet. One function for the screen, the CSV and raising, so they cannot disagree.
type Sheet = { session: Session; rate: Rate | null; earlierRates: Rate[]; rows: (Omit<DeskChild, 'evidence' | 'documents'> & { class_id: string | null })[]; claims: ClaimRow[] };

async function sheetOf(db: Db, schoolId: string, session: Session, today: string): Promise<Sheet> {
  const [rates, fees, children, claims] = [await ratesOf(db, schoolId, session.session_id), await feesOf(db, schoolId, session), await childrenOf(db, schoolId), await claimsOf(db, schoolId)];
  const rate = rates[0] ?? null;
  const thisYear = new Map(claims.filter((c) => c.session_id === session.session_id).map((c) => [c.student_id, c]));
  const yearOver = session.end_date < today;
  const rows: Sheet['rows'] = [];
  for (const c of children) {
    const claim = thisYear.get(c.student_id);
    // A child no longer tagged RTE is on the desk only for a year they were claimed in.
    if (!c.rte_admission && !claim) continue;
    const admittedLater = c.rte_admitted_on !== null && c.rte_admitted_on > session.end_date;
    // Without the day a child left, a child who has left is on the sheet of a year that is over, never on this
    // year's or a later one.
    const left = !ON_ROLL.includes(c.status) && !yearOver;
    const offSheet: OffSheet | null = claim ? null : admittedLater ? 'admitted_later' : left ? 'left' : null;
    const fee = c.class_id ? (fees.get(c.class_id) ?? null) : null;
    const blocked: Blocked | null = claim || offSheet ? null : !rate ? 'no_rate' : !c.class_id ? 'no_class' : fee === null || fee <= 0 ? 'no_fee' : null;
    let proposed: DeskChild['proposed'] = null;
    if (!claim && !offSheet && !blocked && rate && fee) {
      const rule = claimFor(rate.rate_minor, fee);
      proposed = { fee_minor: fee, rate_minor: rate.rate_minor, amount_minor: rule.amountMinor, applied: rule.applied };
    }
    rows.push({
      student_id: c.student_id,
      name: c.name,
      admission_no: c.admission_no,
      class_id: c.class_id,
      class_name: c.class_name,
      status: c.status,
      rte: c.rte_admission,
      entry_class: c.rte_entry_class,
      admitted_on: c.rte_admitted_on,
      onSheet: offSheet === null,
      offSheet,
      claim: claim ? withAge(claim, today) : null,
      proposed,
      blocked,
    });
  }
  return { session, rate, earlierRates: rates.slice(1), rows, claims };
}

function ageingOf(claims: ClaimRow[], sessions: Session[], today: string): AgeingYear[] {
  const label = new Map(sessions.map((s) => [s.session_id, s]));
  const years = new Map<string, AgeingYear>();
  for (const c of claims) {
    const s = label.get(c.session_id);
    const y = years.get(c.session_id) ?? { session_id: c.session_id, label: s?.label ?? '', claims: 0, claimed_minor: 0, paid_minor: 0, written_off_minor: 0, due_minor: 0, buckets: UNPAID_BUCKETS.map((bucket) => ({ bucket, minor: 0, count: 0 })), oldest_days: null };
    y.claims += 1;
    y.claimed_minor += c.amount_minor;
    if (c.state === 'paid') y.paid_minor += c.amount_minor;
    if (c.state === 'written_off') y.written_off_minor += c.amount_minor;
    if (c.state === 'raised') {
      const age = ageOf(c.raised_on, today, c.amount_minor);
      y.due_minor += c.amount_minor;
      const b = y.buckets.find((x) => x.bucket === age.bucket);
      if (b) {
        b.minor += c.amount_minor;
        b.count += 1;
      }
      y.oldest_days = Math.max(y.oldest_days ?? 0, age.days);
    }
    years.set(c.session_id, y);
  }
  // The oldest school year first.
  return [...years.values()].sort((a, b) => (label.get(a.session_id)?.start_date ?? '').localeCompare(label.get(b.session_id)?.start_date ?? ''));
}

export async function loadDesk(db: Db, actor: Actor, asked: { sessionId?: string | null; today?: string } = {}): Promise<Desk | null> {
  if (!FINANCE.includes(actor.role)) return null;
  const today = asked.today ?? indiaDate();
  const sessions = await sessionsOf(db, actor.schoolId);
  const session = chooseSession(sessions, asked.sessionId ?? null, today);
  const empty = { onSheet: 0, ready: 0, toRaiseMinor: 0, raisedMinor: 0, paidMinor: 0, writtenOffMinor: 0, noEvidence: 0 };
  if (!session) return { today, sessions, session: null, rate: null, earlierRates: [], children: [], totals: empty, ageing: [] };
  const sheet = await sheetOf(db, actor.schoolId, session, today);
  const ids = sheet.rows.map((r) => r.student_id);
  const evidence = (
    await db.query(
      `select e.evidence_id, e.student_id, e.kind, e.document_id, d.doc_type, d.uploaded_at, e.note, u.display_name as added_by, e.added_at
         from rte_evidence e
         left join captured_documents d on d.school_id = e.school_id and d.document_id = e.document_id
         left join users u on u.school_id = e.school_id and u.user_id = e.added_by
        where e.school_id = $1 and e.student_id = any($2::uuid[]) order by e.added_at, e.evidence_id`,
      [actor.schoolId, ids]
    )
  ).rows;
  const documents = (
    await db.query(
      `select document_id, student_id, doc_type, uploaded_at from captured_documents
        where school_id = $1 and student_id = any($2::uuid[]) and doc_type <> 'guardian_id' and storage_path not like 'discarded:%' order by uploaded_at desc, document_id`,
      [actor.schoolId, ids]
    )
  ).rows;
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : '');
  const children: DeskChild[] = sheet.rows.map(({ class_id: _class, ...row }) => ({
    ...row,
    evidence: evidence
      .filter((e) => e.student_id === row.student_id)
      .map((e) => ({ evidence_id: e.evidence_id, kind: e.kind, document: e.document_id ? { document_id: e.document_id, doc_type: e.doc_type, uploaded_at: iso(e.uploaded_at) } : null, note: e.note, added_by: e.added_by, added_at: iso(e.added_at) })),
    documents: documents.filter((d) => d.student_id === row.student_id).map((d) => ({ document_id: d.document_id, doc_type: d.doc_type, uploaded_at: iso(d.uploaded_at) })),
  }));
  const on = children.filter((c) => c.onSheet);
  const sum = (state: ClaimState) => on.reduce((t, c) => t + (c.claim?.state === state ? c.claim.amount_minor : 0), 0);
  return {
    today,
    sessions,
    session,
    rate: sheet.rate,
    earlierRates: sheet.earlierRates,
    children,
    totals: {
      onSheet: on.length,
      ready: on.filter((c) => c.proposed).length,
      toRaiseMinor: on.reduce((t, c) => t + (c.proposed?.amount_minor ?? 0), 0),
      raisedMinor: sum('raised'),
      paidMinor: sum('paid'),
      writtenOffMinor: sum('written_off'),
      noEvidence: on.filter((c) => c.evidence.length === 0).length,
    },
    ageing: ageingOf(sheet.claims, sessions, today),
  };
}

// My Day (C223): claims raised and still unpaid past the free tool's first age bucket.
export async function unpaidPastFirstBucket(db: Db, schoolId: string, today: string = indiaDate()): Promise<number> {
  const { rows } = await db.query(`select raised_on::text as raised_on, amount_minor from rte_claims where school_id = $1 and state = 'raised'`, [schoolId]);
  return rows.filter((r) => {
    const { bucket } = ageOf(r.raised_on, today, n(r.amount_minor));
    return bucket !== 'paid' && bucket !== 'upTo90';
  }).length;
}

// ---- the state's rate --------------------------------------------------------------------------------------------

export type RateResult = { ok: true; rateId: string } | { ok: false; reason: 'not_allowed' | 'unknown_session' | 'rate' | 'source' | 'aadhaar' };

// A new rate for a year, typed from the state's notification with where it comes from. It replaces the year's
// rate by being the latest; claims already raised keep the rate they were raised with.
export async function typeRate(db: Db, actor: Actor, input: { sessionId: string; rate: unknown; source: unknown }): Promise<RateResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const session = (await db.query(`select label from academic_sessions where school_id = $1 and session_id = $2`, [actor.schoolId, input.sessionId])).rows[0];
  if (!session) return { ok: false, reason: 'unknown_session' };
  const rateMinor = rupeesToMinor(input.rate);
  if (rateMinor === null || rateMinor <= 0) return { ok: false, reason: 'rate' };
  const source = typeof input.source === 'string' ? input.source.trim().replace(/\s+/g, ' ') : '';
  if (source.length < 5 || source.length > 300) return { ok: false, reason: 'source' };
  if (isOnlyTwelveDigits(source)) return { ok: false, reason: 'aadhaar' };
  // One change at a time for a year: a rate and a claim raised at once wait for each other.
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`rte:${actor.schoolId}:${input.sessionId}`]);
  const before = (await ratesOf(db, actor.schoolId, input.sessionId))[0] ?? null;
  const made = await db.query(`insert into rte_rates (school_id, session_id, rate_minor, source, typed_by) values ($1, $2, $3, $4, $5) returning rate_id`, [actor.schoolId, input.sessionId, rateMinor, source, actor.userId]);
  const rateId = made.rows[0].rate_id as string;
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'rte.rate_typed', targetType: 'rte_rates', targetId: rateId, beforeState: before ? { rateMinor: before.rate_minor, source: before.source } : undefined, afterState: { session: session.label, rateMinor, source } });
  return { ok: true, rateId };
}

// ---- claims ------------------------------------------------------------------------------------------------------

export type RaiseRefusal = 'not_rte' | 'claimed' | 'not_on_sheet' | 'no_class' | 'no_fee';
export type RaiseResult =
  | { ok: true; raised: { claimId: string; studentId: string; amountMinor: number }[]; skipped: { studentId: string; reason: RaiseRefusal }[] }
  | { ok: false; reason: 'not_allowed' | 'unknown_session' | 'raised_on' | 'no_rate' | 'no_children' | RaiseRefusal };

// Raise the year's claim for each child asked for that the sheet says is ready: the amount is the free tool's rule
// on the rate in force and the child's fee. A child already claimed for the year, or not ready, is skipped and
// said why. Nothing is raised without the year's rate.
export async function raiseClaims(db: Db, actor: Actor, input: { sessionId: string; studentIds: readonly string[]; raisedOn: string }, today: string = indiaDate()): Promise<RaiseResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const ids = [...new Set(input.studentIds)];
  if (ids.length === 0 || ids.length > 500) return { ok: false, reason: 'no_children' };
  const session = (await sessionsOf(db, actor.schoolId)).find((s) => s.session_id === input.sessionId);
  if (!session) return { ok: false, reason: 'unknown_session' };
  if (!isIsoDate(input.raisedOn) || input.raisedOn > today || input.raisedOn < session.start_date) return { ok: false, reason: 'raised_on' };
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`rte:${actor.schoolId}:${session.session_id}`]);
  const sheet = await sheetOf(db, actor.schoolId, session, today);
  if (!sheet.rate) return { ok: false, reason: 'no_rate' };
  const rows = new Map(sheet.rows.map((r) => [r.student_id, r]));
  const raised: { claimId: string; studentId: string; amountMinor: number }[] = [];
  const skipped: { studentId: string; reason: RaiseRefusal }[] = [];
  for (const studentId of ids) {
    const row = rows.get(studentId);
    const reason: RaiseRefusal | null = !row || !row.rte ? 'not_rte' : row.claim ? 'claimed' : !row.onSheet ? 'not_on_sheet' : row.blocked === 'no_class' ? 'no_class' : !row.proposed ? 'no_fee' : null;
    if (reason || !row?.proposed || !row.class_id) {
      skipped.push({ studentId, reason: reason ?? 'no_fee' });
      continue;
    }
    const p = row.proposed;
    const made = await db.query(
      `insert into rte_claims (school_id, student_id, session_id, class_id, rate_id, rate_minor, fee_minor, amount_minor, raised_on, raised_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning claim_id`,
      [actor.schoolId, studentId, session.session_id, row.class_id, sheet.rate.rate_id, p.rate_minor, p.fee_minor, p.amount_minor, input.raisedOn, actor.userId]
    );
    const claimId = made.rows[0].claim_id as string;
    await writeAuditLog(db, {
      schoolId: actor.schoolId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      eventAction: 'rte.claim_raised',
      targetType: 'rte_claims',
      targetId: claimId,
      beforeState: undefined,
      afterState: { studentId, session: session.label, classId: row.class_id, rateId: sheet.rate.rate_id, rateMinor: p.rate_minor, feeMinor: p.fee_minor, amountMinor: p.amount_minor, claimedAt: p.applied, raisedOn: input.raisedOn, rule: 'RTE Act s.12(2): the lower of the state rate and the fee' },
    });
    raised.push({ claimId, studentId, amountMinor: p.amount_minor });
  }
  if (raised.length === 0) return { ok: false, reason: skipped[0]?.reason ?? 'no_children' };
  return { ok: true, raised, skipped };
}

export type SettleInput = { action: 'paid'; paidOn: unknown; reference: unknown } | { action: 'write_off'; note: unknown };
export type SettleResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'not_found' | 'settled' | 'paid_on' | 'reference' | 'note' | 'aadhaar' };

// A raised claim is paid (the day the state's money came, and its reference) or written off (why). Either is final.
export async function settleClaim(db: Db, actor: Actor, claimId: string, input: SettleInput, today: string = indiaDate()): Promise<SettleResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const before = (await db.query(`select state, student_id, amount_minor, raised_on::text as raised_on from rte_claims where school_id = $1 and claim_id = $2 for update`, [actor.schoolId, claimId])).rows[0];
  if (!before) return { ok: false, reason: 'not_found' };
  if (before.state !== 'raised') return { ok: false, reason: 'settled' };
  const common = { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, targetType: 'rte_claims', targetId: claimId, beforeState: { state: before.state, amountMinor: n(before.amount_minor) } };
  if (input.action === 'paid') {
    const paidOn = input.paidOn;
    if (!isIsoDate(paidOn) || paidOn < before.raised_on || paidOn > today) return { ok: false, reason: 'paid_on' };
    const reference = typeof input.reference === 'string' ? input.reference.trim().replace(/\s+/g, ' ') : '';
    if (!reference || reference.length > 80) return { ok: false, reason: 'reference' };
    if (isOnlyTwelveDigits(reference)) return { ok: false, reason: 'aadhaar' };
    await db.query(`update rte_claims set state = 'paid', paid_on = $3, reference = $4, settled_by = $5 where school_id = $1 and claim_id = $2`, [actor.schoolId, claimId, paidOn, reference, actor.userId]);
    await writeAuditLog(db, { ...common, eventAction: 'rte.claim_paid', afterState: { state: 'paid', studentId: before.student_id, amountMinor: n(before.amount_minor), paidOn, reference } });
    return { ok: true };
  }
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (!note || note.length > 300) return { ok: false, reason: 'note' };
  if (hasTwelveDigitRun(note)) return { ok: false, reason: 'aadhaar' };
  await db.query(`update rte_claims set state = 'written_off', write_off_note = $3, settled_by = $4 where school_id = $1 and claim_id = $2`, [actor.schoolId, claimId, note, actor.userId]);
  await writeAuditLog(db, { ...common, eventAction: 'rte.claim_written_off', afterState: { state: 'written_off', studentId: before.student_id, amountMinor: n(before.amount_minor), noted: true } });
  return { ok: true };
}

// ---- evidence ----------------------------------------------------------------------------------------------------

export type EvidenceResult = { ok: true; evidenceId: string } | { ok: false; reason: 'not_allowed' | 'kind' | 'nothing' | 'note' | 'aadhaar' | 'not_rte' | 'document' };

// One of the child's own captured documents, or a typed note, or both, with what it proves.
export async function addEvidence(db: Db, actor: Actor, input: { studentId: string; kind: unknown; documentId: string | null; note: unknown }): Promise<EvidenceResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!isEvidenceKind(input.kind)) return { ok: false, reason: 'kind' };
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null;
  if (!note && !input.documentId) return { ok: false, reason: 'nothing' };
  if (note && note.length > 300) return { ok: false, reason: 'note' };
  if (note && hasTwelveDigitRun(note)) return { ok: false, reason: 'aadhaar' };
  if (!(await db.query(`select 1 from public.rte_claim_children() where student_id = $1 and rte_admission`, [input.studentId])).rows[0]) return { ok: false, reason: 'not_rte' };
  if (input.documentId) {
    const doc = (await db.query(`select 1 from captured_documents where school_id = $1 and document_id = $2 and student_id = $3 and doc_type <> 'guardian_id' and storage_path not like 'discarded:%'`, [actor.schoolId, input.documentId, input.studentId])).rows[0];
    if (!doc) return { ok: false, reason: 'document' };
  }
  const made = await db.query(`insert into rte_evidence (school_id, student_id, kind, document_id, note, added_by) values ($1, $2, $3, $4, $5, $6) returning evidence_id`, [actor.schoolId, input.studentId, input.kind, input.documentId, note, actor.userId]);
  const evidenceId = made.rows[0].evidence_id as string;
  // The note's words stay on the evidence, which can be removed; the append-only audit trail says only that there was one.
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'rte.evidence_added', targetType: 'rte_evidence', targetId: evidenceId, beforeState: undefined, afterState: { studentId: input.studentId, kind: input.kind, documentId: input.documentId, withNote: note !== null } });
  return { ok: true, evidenceId };
}

export async function removeEvidence(db: Db, actor: Actor, evidenceId: string): Promise<{ ok: true } | { ok: false; reason: 'not_allowed' | 'not_found' }> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const gone = (await db.query(`delete from rte_evidence where school_id = $1 and evidence_id = $2 returning student_id, kind, document_id, note is not null as with_note`, [actor.schoolId, evidenceId])).rows[0];
  if (!gone) return { ok: false, reason: 'not_found' };
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'rte.evidence_removed', targetType: 'rte_evidence', targetId: evidenceId, beforeState: { studentId: gone.student_id, kind: gone.kind, documentId: gone.document_id, withNote: gone.with_note }, afterState: undefined });
  return { ok: true };
}
