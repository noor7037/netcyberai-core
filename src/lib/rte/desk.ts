import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { classLabel } from '@/lib/frameworks/class-label';
import { planHasFeature } from '@/lib/frameworks/plans';
import { settingsSchemaFor } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import { rupeesToMinor } from '@/lib/fees/money';
import { FINANCE, listStructures } from '@/lib/fees/structures';
import { indiaDate, isIsoDate } from '@/lib/time/india';
import { ageOf, UNPAID_BUCKETS, type AgeBucket } from './ageing';
import { claimFor, dueOf, headsCounted, isEvidenceKind, isReversalReason, isRteClaimHeads, NOTE_MAX, REFERENCE_MAX, SOURCE_MAX, SOURCE_MIN, typedText, type ClaimApplied, type EvidenceKind, type HeadFacts, type ReversalReason, type RteClaimHeads } from './rules';
import { yearFeeMinor, type FeeVersion } from './year-fee';

// The RTE claim desk (docs/28 slice 10c, C223; close-out C225): the state's rate for each school year, each RTE
// child's evidence file, the year's claim sheet, raising a claim, the state's payments in parts, writing off what is
// short, reopening a written-off claim, and unpaid claims by age.
//
// Every function runs in the caller's own tenant transaction. Row level security lets only the principal, the
// school admin and the accountant read or write these tables; every function also refuses anyone else itself.
// Every change of money and of evidence is audited, with ids, amounts, dates and codes only: never a note, a reason,
// a reference or a source (C223-A answer 7).

type Actor = { schoolId: string; userId: string; role: StaffRole };
type Db = Pick<PoolClient, 'query'>;

// The desk is a part of the plan (C223-A answer 1: Growth and Compass): the page, every /api/app/fees/rte route of the
// desk and its My Day card ask this first. (Marking a child as admitted under RTE is the Fees module's own, C159: a
// fee exemption the law requires, so it is not held back by the plan.)
export const RTE_DESK_FEATURE = 'rte-claim-desk' as const;
export const deskInPlan = (db: Db, schoolId: string): Promise<boolean> => planHasFeature(db as never, schoolId, RTE_DESK_FEATURE);

// Who decides what the accountant does not: reopening a written-off claim, and the class of a past year with no
// record (C223-A answer 4).
export const RTE_DECIDERS: readonly string[] = ['principal', 'school_admin'];

export type Session = { session_id: string; label: string; start_date: string; end_date: string; is_current: boolean };
export type Rate = { rate_id: string; rate_minor: number; source: string; typed_by: string | null; typed_at: string };
export type Doc = { document_id: string; doc_type: string; uploaded_at: string };
export type Evidence = { evidence_id: string; kind: EvidenceKind; document: Doc | null; note: string | null; added_by: string | null; added_at: string };
export type ClaimState = 'raised' | 'paid' | 'written_off';
export type ClassSource = 'current' | 'dues' | 'chosen';
export type Receipt = {
  receipt_id: string;
  amount_minor: number;
  received_on: string;
  reference: string | null;
  // A reversal: the receipt it takes back, and why (a code).
  reverses: string | null;
  reversal_reason: ReversalReason | null;
  // A receipt taken back by a later reversal.
  reversed: boolean;
  recorded_by: string | null;
};
export type Claim = {
  claim_id: string;
  session_id: string;
  state: ClaimState;
  class_name: string | null;
  class_source: ClassSource;
  fee_minor: number;
  rate_minor: number;
  amount_minor: number;
  applied: ClaimApplied;
  raised_on: string;
  raised_by: string | null;
  paid_on: string | null;
  reference: string | null;
  write_off_note: string | null;
  settled_by: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
  // What the state has paid (reversals counted), and what is still due (nothing once paid or written off).
  received_minor: number;
  due_minor: number;
  receipts: Receipt[];
  // How long it has waited since it was raised, and its bucket (the free tool's); 'paid' once nothing is due.
  days: number;
  bucket: AgeBucket;
};
// Why a child on the sheet has no claim to raise yet. 'choose_class': a year that is over, and no dues of the child
// that year say the class: the principal or the school admin chooses it.
export type Blocked = 'no_rate' | 'no_class' | 'no_fee' | 'choose_class';
// Why a child of the desk is not on this year's sheet.
export type OffSheet = 'left' | 'admitted_later';
export type DeskChild = {
  student_id: string;
  name: string;
  admission_no: string | null;
  // The class of the year shown: the claim's, else the year's dues' for a year that is over, else the class now.
  class_name: string | null;
  class_source: ClassSource | null;
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
  proposed: { fee_minor: number; rate_minor: number; amount_minor: number; applied: ClaimApplied } | null;
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
  // The person may reopen a written-off claim and choose a past year's class.
  mayDecide: boolean;
  // Which heads count in a claim: the school's setting, and the heads it names today.
  counting: { choice: RteClaimHeads; heads: string[] };
  // Every class of the school, for choosing a past year's class.
  classes: { class_id: string; name: string }[];
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

// The school's setting fees.rte_claim_heads (C225), read through the settings engine, and the heads it counts today.
async function countingOf(db: Db, schoolId: string): Promise<{ choice: RteClaimHeads; counted: Set<string>; names: string[] }> {
  const schema = settingsSchemaFor('fees');
  const value = schema ? (await readSettings(db as never, schoolId, schema)).effective.rte_claim_heads : undefined;
  const choice: RteClaimHeads = isRteClaimHeads(value) ? value : 'rte_covered';
  const heads = (await db.query(`select head_id, name, rte_covered, is_mandatory from fee_heads where school_id = $1 and is_active order by lower(name), head_id`, [schoolId])).rows as (HeadFacts & { name: string })[];
  const counted = headsCounted(heads, choice);
  // The names shown are the counted heads the school charges as a recurring fee somewhere: a head only ever charged
  // once (an admission fee) never counts, so it is not named.
  const recurring = new Set(((await db.query(`select distinct head_id from fee_structure_items where school_id = $1 and frequency <> 'one_time'`, [schoolId])).rows as { head_id: string }[]).map((r) => r.head_id));
  return { choice, counted, names: heads.filter((h) => counted.has(h.head_id) && recurring.has(h.head_id)).map((h) => h.name) };
}

// The year's fee for each class with a fee structure in that year, in the heads that count.
async function feesOf(db: Db, schoolId: string, session: Session, counted: ReadonlySet<string>): Promise<Map<string, number | null>> {
  const byClass = new Map<string, FeeVersion[]>();
  for (const s of await listStructures(db as PoolClient, schoolId)) {
    if (s.session_id !== session.session_id) continue;
    byClass.set(s.class_id, [...(byClass.get(s.class_id) ?? []), { effective_from: s.effective_from, items: s.items }]);
  }
  return new Map([...byClass].map(([classId, versions]) => [classId, yearFeeMinor(versions, counted, session)]));
}

// The class each child was charged in during a year, from the dues raised that year (the class of the fee structure
// they were raised on), the latest when there are two. There is no class history: this is the record a past year
// keeps (C225).
async function duesClassesOf(db: Db, schoolId: string, sessionId: string): Promise<Map<string, string>> {
  const { rows } = await db.query(
    `select distinct on (l.student_id) l.student_id, f.class_id
       from fees_ledger l join fee_structures f on f.school_id = l.school_id and f.structure_id = l.structure_id
      where l.school_id = $1 and f.session_id = $2 and f.class_id is not null
      order by l.student_id, l.due_date desc, f.class_id`,
    [schoolId, sessionId]
  );
  return new Map(rows.map((r) => [r.student_id as string, r.class_id as string]));
}

async function classesOf(db: Db, schoolId: string): Promise<{ class_id: string; name: string }[]> {
  const { rows } = await db.query(`select class_id, name, section from classes where school_id = $1 order by name, section nulls first, class_id`, [schoolId]);
  return rows.map((r) => ({ class_id: r.class_id, name: classLabel(r.name, r.section) ?? r.name }));
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

type ClaimRow = Omit<Claim, 'applied' | 'days' | 'bucket' | 'due_minor' | 'receipts'> & { student_id: string };

async function claimsOf(db: Db, schoolId: string): Promise<ClaimRow[]> {
  const { rows } = await db.query(
    `select c.claim_id, c.student_id, c.session_id, c.state, k.name as k_name, k.section as k_section, c.class_source, c.fee_minor, c.rate_minor, c.amount_minor,
            c.raised_on::text as raised_on, r.display_name as raised_by, c.paid_on::text as paid_on, c.reference, c.write_off_note, s.display_name as settled_by,
            o.display_name as reopened_by, c.reopened_at, c.reopen_reason,
            coalesce((select sum(x.amount_minor) from rte_claim_receipts x where x.school_id = c.school_id and x.claim_id = c.claim_id), 0) as received_minor
       from rte_claims c
       left join classes k on k.school_id = c.school_id and k.class_id = c.class_id
       left join users r on r.school_id = c.school_id and r.user_id = c.raised_by
       left join users s on s.school_id = c.school_id and s.user_id = c.settled_by
       left join users o on o.school_id = c.school_id and o.user_id = c.reopened_by
      where c.school_id = $1 order by c.raised_on, c.claim_id`,
    [schoolId]
  );
  return rows.map((r) => ({
    claim_id: r.claim_id,
    student_id: r.student_id,
    session_id: r.session_id,
    state: r.state,
    class_name: classLabel(r.k_name, r.k_section),
    class_source: r.class_source,
    fee_minor: n(r.fee_minor),
    rate_minor: n(r.rate_minor),
    amount_minor: n(r.amount_minor),
    raised_on: r.raised_on,
    raised_by: r.raised_by,
    paid_on: r.paid_on,
    reference: r.reference,
    write_off_note: r.write_off_note,
    settled_by: r.settled_by,
    reopened_by: r.reopened_by,
    reopened_at: r.reopened_at ? new Date(r.reopened_at).toISOString() : null,
    reopen_reason: r.reopen_reason,
    // A paid claim was received in full (an older one may have been marked paid before receipts were kept).
    received_minor: r.state === 'paid' ? n(r.amount_minor) : n(r.received_minor),
  }));
}

async function receiptsOf(db: Db, schoolId: string, claimIds: readonly string[]): Promise<Map<string, Receipt[]>> {
  const out = new Map<string, Receipt[]>();
  if (claimIds.length === 0) return out;
  const { rows } = await db.query(
    `select r.receipt_id, r.claim_id, r.amount_minor, r.received_on::text as received_on, r.reference, r.reverses, r.reversal_reason, u.display_name as recorded_by,
            exists (select 1 from rte_claim_receipts x where x.school_id = r.school_id and x.reverses = r.receipt_id) as reversed
       from rte_claim_receipts r left join users u on u.school_id = r.school_id and u.user_id = r.recorded_by
      where r.school_id = $1 and r.claim_id = any($2::uuid[]) order by r.recorded_at, r.receipt_id`,
    [schoolId, claimIds]
  );
  for (const r of rows) {
    const list = out.get(r.claim_id) ?? [];
    list.push({ receipt_id: r.receipt_id, amount_minor: n(r.amount_minor), received_on: r.received_on, reference: r.reference, reverses: r.reverses, reversal_reason: r.reversal_reason, reversed: r.reversed === true, recorded_by: r.recorded_by });
    out.set(r.claim_id, list);
  }
  return out;
}

function withAge(c: ClaimRow, today: string, receipts: Receipt[]): Claim {
  const { student_id: _child, ...rest } = c;
  const due = dueOf(c.state, c.amount_minor, c.received_minor);
  return { ...rest, applied: claimFor(c.rate_minor, c.fee_minor).applied, due_minor: due, receipts, ...ageOf(c.raised_on, today, due) };
}

// The year's sheet: who is on it, and for each child the claim raised, or the claim the rule gives and why it
// cannot be raised yet. One function for the screen, the CSV and raising, so they cannot disagree.
type SheetRow = Omit<DeskChild, 'evidence' | 'documents' | 'claim'> & { class_id: string | null; claim: ClaimRow | null };
type Sheet = { session: Session; rate: Rate | null; earlierRates: Rate[]; counting: Awaited<ReturnType<typeof countingOf>>; fees: Map<string, number | null>; classes: { class_id: string; name: string }[]; rows: SheetRow[]; claims: ClaimRow[] };

async function sheetOf(db: Db, schoolId: string, session: Session, today: string): Promise<Sheet> {
  const counting = await countingOf(db, schoolId);
  const rates = await ratesOf(db, schoolId, session.session_id);
  const fees = await feesOf(db, schoolId, session, counting.counted);
  const children = await childrenOf(db, schoolId);
  const claims = await claimsOf(db, schoolId);
  const classes = await classesOf(db, schoolId);
  const rate = rates[0] ?? null;
  const thisYear = new Map(claims.filter((c) => c.session_id === session.session_id).map((c) => [c.student_id, c]));
  // A year that is over keeps its class in that year's dues: the class now may be a later one (C223-A answer 4).
  const yearOver = session.end_date < today;
  const duesClass = yearOver ? await duesClassesOf(db, schoolId, session.session_id) : new Map<string, string>();
  const className = new Map(classes.map((k) => [k.class_id, k.name]));
  const rows: SheetRow[] = [];
  for (const c of children) {
    const claim = thisYear.get(c.student_id) ?? null;
    // A child no longer tagged RTE is on the desk only for a year they were claimed in.
    if (!c.rte_admission && !claim) continue;
    const admittedLater = c.rte_admitted_on !== null && c.rte_admitted_on > session.end_date;
    // Without the day a child left, a child who has left is on the sheet of a year that is over, never on this
    // year's or a later one.
    const left = !ON_ROLL.includes(c.status) && !yearOver;
    const offSheet: OffSheet | null = claim ? null : admittedLater ? 'admitted_later' : left ? 'left' : null;
    const yearClass = claim ? null : yearOver ? (duesClass.get(c.student_id) ?? null) : c.class_id;
    const classSource: ClassSource | null = claim ? claim.class_source : yearOver ? (yearClass ? 'dues' : null) : 'current';
    const fee = yearClass ? (fees.get(yearClass) ?? null) : null;
    const blocked: Blocked | null = claim || offSheet ? null : !rate ? 'no_rate' : !yearClass ? (yearOver ? 'choose_class' : 'no_class') : fee === null || fee <= 0 ? 'no_fee' : null;
    let proposed: DeskChild['proposed'] = null;
    if (!claim && !offSheet && !blocked && rate && fee) {
      const rule = claimFor(rate.rate_minor, fee);
      proposed = { fee_minor: fee, rate_minor: rate.rate_minor, amount_minor: rule.amountMinor, applied: rule.applied };
    }
    rows.push({
      student_id: c.student_id,
      name: c.name,
      admission_no: c.admission_no,
      class_id: yearClass,
      class_name: claim ? claim.class_name : yearClass ? (className.get(yearClass) ?? null) : yearOver ? null : c.class_name,
      class_source: classSource,
      status: c.status,
      rte: c.rte_admission,
      entry_class: c.rte_entry_class,
      admitted_on: c.rte_admitted_on,
      onSheet: offSheet === null,
      offSheet,
      claim,
      proposed,
      blocked,
    });
  }
  return { session, rate, earlierRates: rates.slice(1), counting, fees, classes, rows, claims };
}

function ageingOf(claims: ClaimRow[], sessions: Session[], today: string): AgeingYear[] {
  const label = new Map(sessions.map((s) => [s.session_id, s]));
  const years = new Map<string, AgeingYear>();
  for (const c of claims) {
    const s = label.get(c.session_id);
    const y = years.get(c.session_id) ?? { session_id: c.session_id, label: s?.label ?? '', claims: 0, claimed_minor: 0, paid_minor: 0, written_off_minor: 0, due_minor: 0, buckets: UNPAID_BUCKETS.map((bucket) => ({ bucket, minor: 0, count: 0 })), oldest_days: null };
    y.claims += 1;
    y.claimed_minor += c.amount_minor;
    y.paid_minor += c.received_minor;
    if (c.state === 'written_off') y.written_off_minor += c.amount_minor - c.received_minor;
    const due = dueOf(c.state, c.amount_minor, c.received_minor);
    if (due > 0) {
      const age = ageOf(c.raised_on, today, due);
      y.due_minor += due;
      const b = y.buckets.find((x) => x.bucket === age.bucket);
      if (b) {
        b.minor += due;
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
  const mayDecide = RTE_DECIDERS.includes(actor.role);
  const empty = { onSheet: 0, ready: 0, toRaiseMinor: 0, raisedMinor: 0, paidMinor: 0, writtenOffMinor: 0, noEvidence: 0 };
  if (!session) {
    const counting = await countingOf(db, actor.schoolId);
    return { today, sessions, session: null, mayDecide, counting: { choice: counting.choice, heads: counting.names }, classes: [], rate: null, earlierRates: [], children: [], totals: empty, ageing: [] };
  }
  const sheet = await sheetOf(db, actor.schoolId, session, today);
  const ids = sheet.rows.map((r) => r.student_id);
  const receipts = await receiptsOf(db, actor.schoolId, sheet.rows.flatMap((r) => (r.claim ? [r.claim.claim_id] : [])));
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
  const children: DeskChild[] = sheet.rows.map(({ class_id: _class, claim, ...row }) => ({
    ...row,
    claim: claim ? withAge(claim, today, receipts.get(claim.claim_id) ?? []) : null,
    evidence: evidence
      .filter((e) => e.student_id === row.student_id)
      .map((e) => ({ evidence_id: e.evidence_id, kind: e.kind, document: e.document_id ? { document_id: e.document_id, doc_type: e.doc_type, uploaded_at: iso(e.uploaded_at) } : null, note: e.note, added_by: e.added_by, added_at: iso(e.added_at) })),
    documents: documents.filter((d) => d.student_id === row.student_id).map((d) => ({ document_id: d.document_id, doc_type: d.doc_type, uploaded_at: iso(d.uploaded_at) })),
  }));
  const on = children.filter((c) => c.onSheet);
  const sum = (f: (c: Claim) => number) => on.reduce((t, c) => t + (c.claim ? f(c.claim) : 0), 0);
  return {
    today,
    sessions,
    session,
    mayDecide,
    counting: { choice: sheet.counting.choice, heads: sheet.counting.names },
    classes: sheet.classes,
    rate: sheet.rate,
    earlierRates: sheet.earlierRates,
    children,
    totals: {
      onSheet: on.length,
      ready: on.filter((c) => c.proposed).length,
      toRaiseMinor: on.reduce((t, c) => t + (c.proposed?.amount_minor ?? 0), 0),
      raisedMinor: sum((c) => c.due_minor),
      paidMinor: sum((c) => c.received_minor),
      writtenOffMinor: sum((c) => (c.state === 'written_off' ? c.amount_minor - c.received_minor : 0)),
      noEvidence: on.filter((c) => c.evidence.length === 0).length,
    },
    ageing: ageingOf(sheet.claims, sessions, today),
  };
}

// My Day (C223): claims raised and still unpaid past the free tool's first age bucket. A raised claim always has
// something due (the receipt that covers it marks it paid), so its state says it.
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
  const source = typedText(input.source, SOURCE_MIN, SOURCE_MAX);
  if (!source.ok) return { ok: false, reason: source.reason === 'aadhaar' ? 'aadhaar' : 'source' };
  // One change at a time for a year: a rate and a claim raised at once wait for each other.
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`rte:${actor.schoolId}:${input.sessionId}`]);
  const before = (await ratesOf(db, actor.schoolId, input.sessionId))[0] ?? null;
  const made = await db.query(`insert into rte_rates (school_id, session_id, rate_minor, source, typed_by) values ($1, $2, $3, $4, $5) returning rate_id`, [actor.schoolId, input.sessionId, rateMinor, source.text, actor.userId]);
  const rateId = made.rows[0].rate_id as string;
  // The source sentence stays on the rate row, which is never changed; the audit row holds the figures and ids.
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'rte.rate_typed', targetType: 'rte_rates', targetId: rateId, beforeState: before ? { rateId: before.rate_id, rateMinor: before.rate_minor } : undefined, afterState: { session: session.label, rateMinor } });
  return { ok: true, rateId };
}

// ---- claims ------------------------------------------------------------------------------------------------------

export type RaiseRefusal = 'not_rte' | 'claimed' | 'not_on_sheet' | 'no_class' | 'no_fee' | 'choose_class';
export type RaiseResult =
  | { ok: true; raised: { claimId: string; studentId: string; amountMinor: number }[]; skipped: { studentId: string; reason: RaiseRefusal }[] }
  | { ok: false; reason: 'not_allowed' | 'unknown_session' | 'raised_on' | 'no_rate' | 'no_children' | 'class' | RaiseRefusal };

// Raise the year's claim for each child asked for that the sheet says is ready: the amount is the free tool's rule
// on the rate in force and the child's fee for the class of that year. A child already claimed for the year, or not
// ready, is skipped and said why. Nothing is raised without the year's rate. For a year that is over with no dues
// of the child, the principal or the school admin raises one child at a time with the class they choose (`classId`),
// audited as chosen.
export async function raiseClaims(db: Db, actor: Actor, input: { sessionId: string; studentIds: readonly string[]; raisedOn: string; classId?: string | null }, today: string = indiaDate()): Promise<RaiseResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const ids = [...new Set(input.studentIds)];
  if (ids.length === 0 || ids.length > 500) return { ok: false, reason: 'no_children' };
  const chosen = input.classId ?? null;
  if (chosen !== null && !RTE_DECIDERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (chosen !== null && ids.length !== 1) return { ok: false, reason: 'class' };
  const session = (await sessionsOf(db, actor.schoolId)).find((s) => s.session_id === input.sessionId);
  if (!session) return { ok: false, reason: 'unknown_session' };
  if (!isIsoDate(input.raisedOn) || input.raisedOn > today || input.raisedOn < session.start_date) return { ok: false, reason: 'raised_on' };
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`rte:${actor.schoolId}:${session.session_id}`]);
  const sheet = await sheetOf(db, actor.schoolId, session, today);
  if (!sheet.rate) return { ok: false, reason: 'no_rate' };
  if (chosen !== null && !sheet.classes.some((k) => k.class_id === chosen)) return { ok: false, reason: 'class' };
  const rows = new Map(sheet.rows.map((r) => [r.student_id, r]));
  const raised: { claimId: string; studentId: string; amountMinor: number }[] = [];
  const skipped: { studentId: string; reason: RaiseRefusal }[] = [];
  for (const studentId of ids) {
    const row = rows.get(studentId);
    let reason: RaiseRefusal | null = !row || !row.rte ? 'not_rte' : row.claim ? 'claimed' : !row.onSheet ? 'not_on_sheet' : null;
    let classId = row?.class_id ?? null;
    let source: ClassSource | null = row?.class_source ?? null;
    let figures = row?.proposed ?? null;
    if (!reason && row) {
      if (chosen !== null) {
        // Only where there is no record of the year's class.
        if (row.blocked !== 'choose_class') reason = row.blocked === 'no_rate' ? 'no_fee' : 'not_on_sheet';
        else {
          const fee = sheet.fees.get(chosen) ?? null;
          if (fee === null || fee <= 0) reason = 'no_fee';
          else {
            const rule = claimFor(sheet.rate.rate_minor, fee);
            figures = { fee_minor: fee, rate_minor: sheet.rate.rate_minor, amount_minor: rule.amountMinor, applied: rule.applied };
            classId = chosen;
            source = 'chosen';
          }
        }
      } else if (row.blocked === 'choose_class') reason = 'choose_class';
      else if (row.blocked === 'no_class') reason = 'no_class';
      else if (!row.proposed) reason = 'no_fee';
    }
    if (reason || !figures || !classId || !source) {
      skipped.push({ studentId, reason: reason ?? 'no_fee' });
      continue;
    }
    const made = await db.query(
      `insert into rte_claims (school_id, student_id, session_id, class_id, class_source, rate_id, rate_minor, fee_minor, amount_minor, raised_on, raised_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning claim_id`,
      [actor.schoolId, studentId, session.session_id, classId, source, sheet.rate.rate_id, figures.rate_minor, figures.fee_minor, figures.amount_minor, input.raisedOn, actor.userId]
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
      afterState: { studentId, session: session.label, classId, classSource: source, heads: sheet.counting.choice, rateId: sheet.rate.rate_id, rateMinor: figures.rate_minor, feeMinor: figures.fee_minor, amountMinor: figures.amount_minor, claimedAt: figures.applied, raisedOn: input.raisedOn, rule: 'RTE Act s.12(2): the lower of the state rate and the fee' },
    });
    raised.push({ claimId, studentId, amountMinor: figures.amount_minor });
  }
  if (raised.length === 0) return { ok: false, reason: skipped[0]?.reason ?? 'no_children' };
  return { ok: true, raised, skipped };
}

export type ClaimAction =
  | { action: 'receipt'; amount: unknown; receivedOn: unknown; reference: unknown }
  | { action: 'write_off'; note: unknown }
  | { action: 'reopen'; reason: unknown }
  | { action: 'reverse'; receiptId: string; reason: unknown };
export type ClaimActionResult =
  | { ok: true; state: ClaimState; dueMinor: number }
  | { ok: false; reason: 'not_allowed' | 'not_found' | 'settled' | 'not_written_off' | 'amount' | 'over' | 'received_on' | 'reference' | 'note' | 'reason' | 'aadhaar' | 'receipt' };

type Before = { state: ClaimState; student_id: string; amount_minor: number; raised_on: string; received_minor: number };

// What happens to a raised claim (C223, C225):
//   receipt    the state paid some or all of what is still due, on a day, with its reference. The receipt that
//              covers the claim marks it paid (the database writes that last receipt as the claim is marked paid).
//   write_off  what is still due will not come: written off with a note. The receipts stay.
//   reopen     a written-off claim is raised again with a reason, by the principal or the school admin only.
//   reverse    a receipt typed wrongly is taken back by a reversing row, while the claim is still raised.
export async function actOnClaim(db: Db, actor: Actor, claimId: string, input: ClaimAction, today: string = indiaDate()): Promise<ClaimActionResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (input.action === 'reopen' && !RTE_DECIDERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const row = (await db.query(`select state, student_id, amount_minor, raised_on::text as raised_on from rte_claims where school_id = $1 and claim_id = $2 for update`, [actor.schoolId, claimId])).rows[0];
  if (!row) return { ok: false, reason: 'not_found' };
  const received = n((await db.query(`select coalesce(sum(amount_minor), 0) as received from rte_claim_receipts where school_id = $1 and claim_id = $2`, [actor.schoolId, claimId])).rows[0]?.received);
  const before: Before = { state: row.state, student_id: row.student_id, amount_minor: n(row.amount_minor), raised_on: row.raised_on, received_minor: received };
  const common = { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, targetType: 'rte_claims', targetId: claimId };
  const was = { state: before.state, amountMinor: before.amount_minor, receivedMinor: before.received_minor };

  if (input.action === 'reopen') {
    if (before.state !== 'written_off') return { ok: false, reason: 'not_written_off' };
    const reason = typedText(input.reason, 1, NOTE_MAX, false);
    if (!reason.ok) return { ok: false, reason: reason.reason === 'aadhaar' ? 'aadhaar' : 'reason' };
    await db.query(`update rte_claims set state = 'raised', reopen_reason = $3, reopened_by = $4 where school_id = $1 and claim_id = $2`, [actor.schoolId, claimId, reason.text, actor.userId]);
    const due = dueOf('raised', before.amount_minor, before.received_minor);
    await writeAuditLog(db, { ...common, eventAction: 'rte.claim_reopened', beforeState: was, afterState: { state: 'raised', studentId: before.student_id, amountMinor: before.amount_minor, receivedMinor: before.received_minor, dueMinor: due, reasonGiven: true } });
    return { ok: true, state: 'raised', dueMinor: due };
  }

  if (before.state !== 'raised') return { ok: false, reason: 'settled' };
  const due = dueOf('raised', before.amount_minor, before.received_minor);

  if (input.action === 'write_off') {
    const note = typedText(input.note, 1, NOTE_MAX, false);
    if (!note.ok) return { ok: false, reason: note.reason === 'aadhaar' ? 'aadhaar' : 'note' };
    await db.query(`update rte_claims set state = 'written_off', write_off_note = $3, settled_by = $4 where school_id = $1 and claim_id = $2`, [actor.schoolId, claimId, note.text, actor.userId]);
    // The note's words stay on the claim, where an erasure can clear them; the audit row says only that there was one.
    await writeAuditLog(db, { ...common, eventAction: 'rte.claim_written_off', beforeState: was, afterState: { state: 'written_off', studentId: before.student_id, amountMinor: before.amount_minor, receivedMinor: before.received_minor, writtenOffMinor: due, noted: true } });
    return { ok: true, state: 'written_off', dueMinor: 0 };
  }

  if (input.action === 'reverse') {
    const reason = input.reason;
    if (!isReversalReason(reason)) return { ok: false, reason: 'reason' };
    const target = (
      await db.query(
        `select r.amount_minor, r.reverses, exists (select 1 from rte_claim_receipts x where x.school_id = r.school_id and x.reverses = r.receipt_id) as reversed
           from rte_claim_receipts r where r.school_id = $1 and r.claim_id = $2 and r.receipt_id = $3`,
        [actor.schoolId, claimId, input.receiptId]
      )
    ).rows[0];
    if (!target || target.reverses !== null || target.reversed === true) return { ok: false, reason: 'receipt' };
    const amount = -n(target.amount_minor);
    const made = await db.query(
      `insert into rte_claim_receipts (school_id, claim_id, amount_minor, received_on, reverses, reversal_reason, recorded_by) values ($1, $2, $3, $4, $5, $6, $7) returning receipt_id`,
      [actor.schoolId, claimId, amount, today, input.receiptId, reason, actor.userId]
    );
    const after = before.received_minor + amount;
    await writeAuditLog(db, { ...common, eventAction: 'rte.receipt_reversed', beforeState: was, afterState: { studentId: before.student_id, receiptId: made.rows[0].receipt_id, reverses: input.receiptId, amountMinor: amount, reversalCode: reason, receivedMinor: after, dueMinor: before.amount_minor - after } });
    return { ok: true, state: 'raised', dueMinor: before.amount_minor - after };
  }

  const amount = rupeesToMinor(input.amount);
  if (amount === null || amount <= 0) return { ok: false, reason: 'amount' };
  if (amount > due) return { ok: false, reason: 'over' };
  const receivedOn = input.receivedOn;
  if (!isIsoDate(receivedOn) || receivedOn < before.raised_on || receivedOn > today) return { ok: false, reason: 'received_on' };
  const reference = typedText(input.reference, 1, REFERENCE_MAX);
  if (!reference.ok) return { ok: false, reason: reference.reason === 'aadhaar' ? 'aadhaar' : 'reference' };
  if (amount === due) {
    // The last of the money: the claim is paid, and the database writes this receipt with it.
    await db.query(`update rte_claims set state = 'paid', paid_on = $3, reference = $4, settled_by = $5 where school_id = $1 and claim_id = $2`, [actor.schoolId, claimId, receivedOn, reference.text, actor.userId]);
    const receipt = (await db.query(`select receipt_id from rte_claim_receipts where school_id = $1 and claim_id = $2 and reverses is null and amount_minor = $3 and received_on = $4 order by recorded_at desc, receipt_id limit 1`, [actor.schoolId, claimId, amount, receivedOn])).rows[0];
    await writeAuditLog(db, { ...common, eventAction: 'rte.claim_paid', beforeState: was, afterState: { state: 'paid', studentId: before.student_id, receiptId: receipt?.receipt_id ?? null, amountMinor: amount, receivedOn, claimMinor: before.amount_minor, receivedMinor: before.amount_minor } });
    return { ok: true, state: 'paid', dueMinor: 0 };
  }
  const made = await db.query(
    `insert into rte_claim_receipts (school_id, claim_id, amount_minor, received_on, reference, recorded_by) values ($1, $2, $3, $4, $5, $6) returning receipt_id`,
    [actor.schoolId, claimId, amount, receivedOn, reference.text, actor.userId]
  );
  await writeAuditLog(db, { ...common, eventAction: 'rte.receipt_recorded', beforeState: was, afterState: { studentId: before.student_id, receiptId: made.rows[0].receipt_id, amountMinor: amount, receivedOn, receivedMinor: before.received_minor + amount, dueMinor: due - amount } });
  return { ok: true, state: 'raised', dueMinor: due - amount };
}

// ---- evidence ----------------------------------------------------------------------------------------------------

export type EvidenceResult = { ok: true; evidenceId: string } | { ok: false; reason: 'not_allowed' | 'kind' | 'nothing' | 'note' | 'aadhaar' | 'not_rte' | 'document' };

// One of the child's own captured documents, or a typed note, or both, with what it proves.
export async function addEvidence(db: Db, actor: Actor, input: { studentId: string; kind: unknown; documentId: string | null; note: unknown }): Promise<EvidenceResult> {
  if (!FINANCE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!isEvidenceKind(input.kind)) return { ok: false, reason: 'kind' };
  const typed = typeof input.note === 'string' && input.note.trim() ? typedText(input.note, 1, NOTE_MAX, false) : null;
  if (!typed && !input.documentId) return { ok: false, reason: 'nothing' };
  if (typed && !typed.ok) return { ok: false, reason: typed.reason === 'aadhaar' ? 'aadhaar' : 'note' };
  const note = typed?.ok ? typed.text : null;
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
