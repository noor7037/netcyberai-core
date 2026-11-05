import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import { feeClearance } from '@/lib/fees/clearance';
import type { JobQueue } from '@/lib/jobs/types';
import { FileStorageUnavailableError, type FileStorage } from '@/lib/storage/file-storage';
import { CERT_OFFICE, clearanceAsked, COPY_MAX_BYTES, isPdf, issueCertificates, type CertActor } from './certificates';
import { CERT_TYPES, isCertificateType, readReason, type CertificateType } from './certificate-rules';

// Certificate requests (W21-M7, docs/42 Medium: Documents): request -> fee clearance -> issue -> delivery.
//
//   - A request is made by the office, or by a linked guardian in the Family app for their own child (the School Link
//     door src/lib/school-link/certificates.ts), with a kind and a short reason (90 characters: the purpose a bonafide
//     or study certificate prints, the reason of leaving a TC prints).
//   - FEE CLEARANCE: for the kinds the school's Documents settings ask it for (the same switch the issue uses; the TC
//     is off by default, C232), a request with dues is HELD. It is released when the dues are paid or the principal's
//     override covers them, or the principal waives it with a reason, kept on the request. Holds are re-read by the
//     platform role (refreshHolds), each change an event and an audit row.
//   - ISSUE: the existing issueCertificates (numbering, signatory, the database's own clearance rule). The request then
//     points at the certificate. DELIVERY: the office's device draws the PDF (as it does today); it is stored as the
//     certificate's copy and the request becomes ready; the family is told in the feed and by email.
//   - Every step is an event (who, when); the office marks a paper copy collected.
//   - Audit rows hold ids, kinds, numbers and booleans, never a name or the words of a reason (C224).

type Sql = Pick<PoolClient, 'query'>;
export const REQUEST_REASON_MAX = 90;
export const REQUEST_STAGES = ['requested', 'issued', 'ready', 'collected'] as const;
export type RequestStage = (typeof REQUEST_STAGES)[number];
export type EventKind = 'requested' | 'held' | 'released' | 'waived' | 'issued' | 'ready' | 'downloaded' | 'collected';
export const CERTIFICATE_READY_JOB = 'family.certificate_ready';

export type RequestEvent = { kind: EventKind; actor: 'guardian' | 'office' | 'system'; by: string | null; at: string };
export type OfficeRequest = {
  requestId: string;
  studentId: string;
  studentName: string;
  className: string | null;
  kind: CertificateType;
  reason: string | null;
  via: 'office' | 'app';
  askedBy: string | null; // the guardian's or the office person's name
  stage: RequestStage;
  heldOwedMinor: number | null;
  clearanceAsked: boolean;
  waiver: { reason: string; by: string | null; on: string } | null;
  certificate: { certificateId: string; number: string } | null;
  createdAt: string;
  events: RequestEvent[];
};
export type GuardianRequest = {
  requestId: string;
  studentId: string;
  kind: CertificateType;
  reason: string | null;
  stage: RequestStage;
  held: boolean;
  waived: boolean;
  number: string | null;
  createdAt: string;
  events: { kind: EventKind; actor: 'guardian' | 'office' | 'system'; at: string }[];
};

const isOffice = (role: string) => CERT_OFFICE.includes(role);
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const clean = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

export type RequestInput = { studentId: string; kind: unknown; reason: unknown };
export type RequestResult = { ok: true; requestId: string } | { ok: false; reason: 'kind' | 'reason' | 'aadhaar' | 'not_found' | 'duplicate' | 'not_allowed' };

function readInput(input: RequestInput): { ok: true; kind: CertificateType; reason: string } | { ok: false; reason: 'kind' | 'reason' | 'aadhaar' } {
  if (!isCertificateType(input.kind)) return { ok: false, reason: 'kind' };
  const r = readReason(input.reason);
  if (!r.ok) return { ok: false, reason: r.reason };
  if (r.value.length > REQUEST_REASON_MAX) return { ok: false, reason: 'reason' };
  return { ok: true, kind: input.kind, reason: r.value };
}

async function insertRequest(db: Sql, schoolId: string, input: RequestInput): Promise<RequestResult> {
  const read = readInput(input);
  if (!read.ok) return read;
  await db.query('savepoint certificate_request');
  try {
    // Who asked (and how) is the database's: from the session's role and user (certificate_requests_write).
    const made = (await db.query(`insert into certificate_requests (school_id, student_id, cert_type, reason) values ($1, $2, $3, $4) returning cert_id`, [schoolId, input.studentId, read.kind, read.reason])).rows[0];
    await db.query('release savepoint certificate_request');
    return { ok: true, requestId: made.cert_id };
  } catch (err) {
    await db.query('rollback to savepoint certificate_request');
    const code = (err as { code?: string }).code;
    if (code === '23505') return { ok: false, reason: 'duplicate' };
    // A child that is not the guardian's own (row level security), or not in the school at all.
    if (code === '42501' || code === '23503') return { ok: false, reason: 'not_found' };
    throw err;
  }
}

// The office asks for a certificate on a family's behalf.
export async function requestAsOffice(db: PoolClient, actor: CertActor, input: RequestInput): Promise<RequestResult> {
  if (!isOffice(actor.role)) return { ok: false, reason: 'not_allowed' };
  const made = await insertRequest(db, actor.schoolId, input);
  if (made.ok) await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'certificate_request.created', targetType: 'certificate_requests', targetId: made.requestId, beforeState: undefined, afterState: { via: 'office', kind: String(input.kind) } });
  return made;
}

// A linked guardian asks for a certificate for their own child. Runs inside withGuardianContext: the school's parent
// rules decide whose child it may be. The audit row follows as the platform role (the caller), not here.
export async function requestAsGuardian(db: PoolClient, schoolId: string, input: RequestInput): Promise<RequestResult> {
  return insertRequest(db, schoolId, input);
}

async function event(db: Sql, schoolId: string, requestId: string, kind: EventKind, by: { actor: 'office'; userId: string } | { actor: 'system' } | { actor: 'guardian'; parentId: string }) {
  await db.query(
    `insert into certificate_request_events (school_id, request_id, kind, actor, actor_user_id, actor_parent_id) values ($1, $2, $3, $4, $5, $6)`,
    [schoolId, requestId, kind, by.actor, by.actor === 'office' ? by.userId : null, by.actor === 'guardian' ? by.parentId : null]
  );
}

// ---- Fee clearance ---------------------------------------------------------------------------------------------------

// Re-read the dues of the school's open requests (one child's, or all), as the PLATFORM role: a request waiting for the
// fee clearance is held (with what is owed), and released when the dues are paid or covered. A waived request is
// never held again. Each change is an event and an audit row.
export async function refreshHolds(platform: PoolClient, schoolId: string, studentId: string | null = null): Promise<number> {
  const open = (await platform.query(
    `select cert_id, student_id, cert_type, held_owed_minor from certificate_requests where school_id = $1 and stage = 'requested' and waived_by is null and ($2::uuid is null or student_id = $2)`,
    [schoolId, studentId]
  )).rows as { cert_id: string; student_id: string; cert_type: CertificateType; held_owed_minor: string | null }[];
  if (open.length === 0) return 0;
  const asked = await clearanceAsked(platform, schoolId);
  let changed = 0;
  for (const r of open) {
    // The platform role reads the dues through the database's own function (the fee counter's answers staff only).
    const dues = (await platform.query(`select owed_minor, cleared from public.certificate_request_dues($1, $2)`, [schoolId, r.student_id])).rows[0] as { owed_minor: string; cleared: boolean } | undefined;
    if (!dues) continue;
    const clearance = { owedMinor: Number(dues.owed_minor), cleared: dues.cleared };
    const holdNow = asked[r.cert_type] && !clearance.cleared;
    const was = r.held_owed_minor === null ? null : Number(r.held_owed_minor);
    if (holdNow && was !== clearance.owedMinor) {
      await platform.query(`update certificate_requests set held_owed_minor = $3 where school_id = $1 and cert_id = $2`, [schoolId, r.cert_id, clearance.owedMinor]);
      if (was === null) {
        await event(platform, schoolId, r.cert_id, 'held', { actor: 'system' });
        await writeAuditLog(platform, { schoolId, actorUserId: null, actorRole: null, eventAction: 'certificate_request.held', targetType: 'certificate_requests', targetId: r.cert_id, beforeState: undefined, afterState: { kind: r.cert_type, owedMinor: clearance.owedMinor } });
      }
      changed++;
    } else if (!holdNow && was !== null) {
      await platform.query(`update certificate_requests set held_owed_minor = null where school_id = $1 and cert_id = $2`, [schoolId, r.cert_id]);
      await event(platform, schoolId, r.cert_id, 'released', { actor: 'system' });
      await writeAuditLog(platform, { schoolId, actorUserId: null, actorRole: null, eventAction: 'certificate_request.released', targetType: 'certificate_requests', targetId: r.cert_id, beforeState: undefined, afterState: { kind: r.cert_type, via: 'dues_cleared' } });
      changed++;
    }
  }
  return changed;
}

export type WaiveResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_held' | 'reason' | 'aadhaar' };
// The principal lets a held request through, with a reason kept on the request.
export async function waiveRequest(db: PoolClient, actor: CertActor, requestId: string, reasonRaw: unknown): Promise<WaiveResult> {
  if (actor.role !== 'principal') return { ok: false, reason: 'not_allowed' };
  const why = readReason(reasonRaw);
  if (!why.ok) return why;
  const r = (await db.query(`select stage, held_owed_minor, waived_by from certificate_requests where school_id = $1 and cert_id = $2 for update`, [actor.schoolId, requestId])).rows[0];
  if (!r) return { ok: false, reason: 'not_found' };
  if (r.stage !== 'requested' || r.held_owed_minor === null || r.waived_by) return { ok: false, reason: 'not_held' };
  await db.query(`update certificate_requests set waiver_reason = $3, waived_by = $4, held_owed_minor = null where school_id = $1 and cert_id = $2`, [actor.schoolId, requestId, why.value, actor.userId]);
  await event(db, actor.schoolId, requestId, 'waived', { actor: 'office', userId: actor.userId });
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'certificate_request.waived', targetType: 'certificate_requests', targetId: requestId, beforeState: undefined, afterState: { owedMinor: Number(r.held_owed_minor), reasonGiven: true } }); // the words stay on the request (C224)
  return { ok: true };
}

// ---- Issue -----------------------------------------------------------------------------------------------------------

export type IssueRequestResult =
  | { ok: true; certificateId: string; number: string }
  | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_open' | 'held' | 'duplicate' | 'incomplete' | 'aadhaar' | 'refused'; number?: string | null; fields?: string[]; field?: string };

// The office issues the certificate for an open request, with the typed words the kind needs beyond the family's reason
// (a character certificate's period and conduct). A held request is refused; a waiver on the request is the principal's
// and is passed to the issue as it stands (only while dues are still owed).
export async function issueRequest(db: PoolClient, actor: CertActor, requestId: string, typedRaw: Record<string, unknown>, today: string): Promise<IssueRequestResult> {
  if (!isOffice(actor.role)) return { ok: false, reason: 'not_allowed' };
  const r = (await db.query(`select cert_id, student_id, cert_type, reason, stage, waiver_reason from certificate_requests where school_id = $1 and cert_id = $2 for update`, [actor.schoolId, requestId])).rows[0];
  if (!r) return { ok: false, reason: 'not_found' };
  if (r.stage !== 'requested') return { ok: false, reason: 'not_open' };
  const kind = r.cert_type as CertificateType;
  const clearance = await feeClearance(db, actor.schoolId, r.student_id);
  if (!clearance) return { ok: false, reason: 'not_found' };
  const cleared = !(await clearanceAsked(db, actor.schoolId))[kind] || clearance.cleared;
  if (!cleared && !r.waiver_reason) return { ok: false, reason: 'held' };
  // The family's reason fills the field the kind prints it in, unless the office typed its own.
  const typed: Record<string, unknown> = { ...typedRaw };
  const field = kind === 'transfer' ? 'reason' : 'purpose';
  if (!clean(typed[field]) && r.reason) typed[field] = r.reason;
  const made = await issueCertificates(db, actor, { type: kind, studentIds: [r.student_id], typed, waivers: !cleared && r.waiver_reason ? { [r.student_id]: r.waiver_reason } : {} }, today);
  if (!made.ok) {
    if (made.reason === 'aadhaar') return { ok: false, reason: 'aadhaar', field: made.field };
    return { ok: false, reason: 'refused', field: 'field' in made ? made.field : undefined };
  }
  if (made.duplicates[0]) return { ok: false, reason: 'duplicate', number: made.duplicates[0].number };
  if (made.incomplete[0]) return { ok: false, reason: 'incomplete', fields: made.incomplete[0].fields };
  if (made.aadhaar[0]) return { ok: false, reason: 'aadhaar' };
  if (made.held[0]) return { ok: false, reason: 'held' };
  const issued = made.issued[0];
  if (!issued) return { ok: false, reason: 'not_found' };
  await db.query(`update certificate_requests set stage = 'issued', certificate_id = $3, held_owed_minor = null where school_id = $1 and cert_id = $2`, [actor.schoolId, requestId, issued.certificateId]);
  await event(db, actor.schoolId, requestId, 'issued', { actor: 'office', userId: actor.userId });
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'certificate_request.issued', targetType: 'certificate_requests', targetId: requestId, beforeState: undefined, afterState: { certificateId: issued.certificateId, number: issued.number, kind } });
  return { ok: true, certificateId: issued.certificateId, number: issued.number };
}

// ---- Delivery --------------------------------------------------------------------------------------------------------

export type DeliverResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_issued' | 'withdrawn' | 'not_a_pdf' | 'too_large' | 'storage_unavailable' };
// The certificate's PDF (drawn on the office's device) is kept as the family's copy and the request becomes READY. The
// family is told in its feed and by email (the job family.certificate_ready, read on the family's side).
export async function deliverRequest(db: PoolClient, queue: Pick<JobQueue, 'enqueue'>, storage: FileStorage, actor: CertActor, requestId: string, pdf: Uint8Array, newId: () => string = () => randomUUID()): Promise<DeliverResult> {
  if (!isOffice(actor.role)) return { ok: false, reason: 'not_allowed' };
  const r = (await db.query(
    `select r.student_id, r.stage, r.certificate_id, c.number, c.cert_type, c.withdrawn_at, c.erased_at from certificate_requests r left join certificates_issued c on c.school_id = r.school_id and c.certificate_id = r.certificate_id
      where r.school_id = $1 and r.cert_id = $2 for update of r`,
    [actor.schoolId, requestId]
  )).rows[0];
  if (!r) return { ok: false, reason: 'not_found' };
  if (!r.certificate_id || r.stage === 'requested') return { ok: false, reason: 'not_issued' };
  if (r.withdrawn_at || r.erased_at) return { ok: false, reason: 'withdrawn' };
  if (pdf.length === 0 || pdf.length > COPY_MAX_BYTES) return { ok: false, reason: 'too_large' };
  if (!isPdf(pdf)) return { ok: false, reason: 'not_a_pdf' };
  const key = `${actor.schoolId}/certificates/${r.certificate_id}/${newId()}.pdf`;
  try {
    await storage.put(key, pdf, 'application/pdf');
  } catch (err) {
    if (err instanceof FileStorageUnavailableError) return { ok: false, reason: 'storage_unavailable' };
    throw err;
  }
  try {
    await db.query(`insert into certificate_copies (school_id, certificate_id, storage_key, size_bytes, made_by) values ($1, $2, $3, $4, $5)`, [actor.schoolId, r.certificate_id, key, pdf.length, actor.userId]);
    if (r.stage === 'issued') {
      await db.query(`update certificate_requests set stage = 'ready' where school_id = $1 and cert_id = $2`, [actor.schoolId, requestId]);
      await event(db, actor.schoolId, requestId, 'ready', { actor: 'office', userId: actor.userId });
      await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'certificate_request.ready', targetType: 'certificate_requests', targetId: requestId, beforeState: undefined, afterState: { certificateId: r.certificate_id, number: r.number } });
      // The notice carries no name: the kind and the number only.
      await queue.enqueue(db, { type: CERTIFICATE_READY_JOB, idempotencyKey: `${CERTIFICATE_READY_JOB}:${requestId}`, schoolId: actor.schoolId, maxAttempts: 4, payload: { requestId, studentId: r.student_id, kind: r.cert_type, number: r.number } });
    }
    return { ok: true };
  } catch (err) {
    await storage.remove(key).catch(() => undefined);
    throw err;
  }
}

export type CollectResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_issued' };
// The office marks the paper copy collected.
export async function markCollected(db: PoolClient, actor: CertActor, requestId: string): Promise<CollectResult> {
  if (!isOffice(actor.role)) return { ok: false, reason: 'not_allowed' };
  const r = (await db.query(`select stage from certificate_requests where school_id = $1 and cert_id = $2 for update`, [actor.schoolId, requestId])).rows[0];
  if (!r) return { ok: false, reason: 'not_found' };
  if (r.stage !== 'issued' && r.stage !== 'ready') return { ok: false, reason: 'not_issued' };
  await db.query(`update certificate_requests set stage = 'collected', collected_by = $3 where school_id = $1 and cert_id = $2`, [actor.schoolId, requestId, actor.userId]);
  await event(db, actor.schoolId, requestId, 'collected', { actor: 'office', userId: actor.userId });
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'certificate_request.collected', targetType: 'certificate_requests', targetId: requestId, beforeState: undefined, afterState: {} });
  return { ok: true };
}

// ---- Reading ---------------------------------------------------------------------------------------------------------

// The office's list: open requests and those collected in the last 60 days, newest first, each with its timeline.
export async function officeRequests(db: Sql, actor: CertActor): Promise<OfficeRequest[] | null> {
  if (!isOffice(actor.role)) return null;
  const rows = (await db.query(
    `select r.cert_id, r.student_id, s.name as student_name, c.name as class_name, r.cert_type, r.reason, r.requested_via, r.stage, r.held_owed_minor, r.waiver_reason, wu.display_name as waived_by_name,
            (r.waived_at at time zone 'Asia/Kolkata')::date::text as waived_on, r.certificate_id, ci.number, r.created_at,
            coalesce(pa.name, qu.display_name) as asked_by
       from certificate_requests r
       join students s on s.school_id = r.school_id and s.student_id = r.student_id
       left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
       left join users wu on wu.school_id = r.school_id and wu.user_id = r.waived_by
       left join users qu on qu.school_id = r.school_id and qu.user_id = r.requested_by_user_id
       left join parents pa on pa.school_id = r.school_id and pa.parent_id = r.requested_by_parent_id
       left join certificates_issued ci on ci.school_id = r.school_id and ci.certificate_id = r.certificate_id
      where r.school_id = $1 and r.cert_type in ('transfer', 'bonafide', 'character', 'study') and (r.stage <> 'collected' or r.collected_at > now() - interval '60 days')
      order by r.created_at desc, r.cert_id limit 200`,
    [actor.schoolId]
  )).rows;
  if (rows.length === 0) return [];
  const events = (await db.query(
    `select e.request_id, e.kind, e.actor, coalesce(u.display_name, p.name) as by, e.at from certificate_request_events e
       left join users u on u.school_id = e.school_id and u.user_id = e.actor_user_id
       left join parents p on p.school_id = e.school_id and p.parent_id = e.actor_parent_id
      where e.school_id = $1 and e.request_id = any ($2::uuid[]) order by e.at, e.event_id`,
    [actor.schoolId, rows.map((r) => r.cert_id)]
  )).rows;
  const asked = await clearanceAsked(db, actor.schoolId);
  return rows.map((r) => ({
    requestId: r.cert_id,
    studentId: r.student_id,
    studentName: r.student_name,
    className: r.class_name ?? null,
    kind: r.cert_type,
    reason: r.reason ?? null,
    via: r.requested_via,
    askedBy: r.asked_by ?? null,
    stage: r.stage,
    heldOwedMinor: r.held_owed_minor === null ? null : Number(r.held_owed_minor),
    clearanceAsked: asked[r.cert_type as CertificateType],
    waiver: r.waiver_reason ? { reason: r.waiver_reason, by: r.waived_by_name ?? null, on: r.waived_on } : null,
    certificate: r.certificate_id ? { certificateId: r.certificate_id, number: r.number } : null,
    createdAt: iso(r.created_at),
    events: events.filter((e) => e.request_id === r.cert_id).map((e) => ({ kind: e.kind, actor: e.actor, by: e.by ?? null, at: iso(e.at) })),
  }));
}

// A guardian's view of their child's requests (in withGuardianContext: the school's parent rules decide which). Words
// only: no names, no amounts, no reasons of a waiver.
export async function guardianRequests(db: Sql, schoolId: string, studentIds: readonly string[]): Promise<GuardianRequest[]> {
  if (studentIds.length === 0) return [];
  const rows = (await db.query(
    `select r.cert_id, r.student_id, r.cert_type, r.reason, r.stage, r.held_owed_minor is not null as held, r.waived_by is not null as waived, ci.number, r.created_at
       from certificate_requests r left join certificates_issued ci on ci.school_id = r.school_id and ci.certificate_id = r.certificate_id and ci.withdrawn_at is null
      where r.school_id = $1 and r.student_id = any ($2::uuid[]) and (r.stage <> 'collected' or r.collected_at > now() - interval '60 days')
      order by r.created_at desc, r.cert_id limit 50`,
    [schoolId, studentIds]
  )).rows;
  if (rows.length === 0) return [];
  const events = (await db.query(`select e.request_id, e.kind, e.actor, e.at from certificate_request_events e where e.school_id = $1 and e.request_id = any ($2::uuid[]) order by e.at, e.event_id`, [schoolId, rows.map((r) => r.cert_id)])).rows;
  return rows.map((r) => ({
    requestId: r.cert_id,
    studentId: r.student_id,
    kind: r.cert_type,
    reason: r.reason ?? null,
    stage: r.stage,
    held: r.held,
    waived: r.waived,
    number: r.number ?? null,
    createdAt: iso(r.created_at),
    events: events.filter((e) => e.request_id === r.cert_id).map((e) => ({ kind: e.kind, actor: e.actor, at: iso(e.at) })),
  }));
}

export const REQUEST_KINDS = CERT_TYPES;
