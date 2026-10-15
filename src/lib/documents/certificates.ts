import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import type { CertImage } from '@/lib/certificates/definitions';
import { feeClearance } from '@/lib/fees/clearance';
import { t, type MessageKey } from '@/lib/i18n';
import { siteUrl } from '@/lib/site-config';
import { FileStorageUnavailableError, MemoryFileStorage, sniffImageType, type FileStorage } from '@/lib/storage/file-storage';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';
import { languageFor, queueWhatsAppMessage } from '@/lib/whatsapp/gate';
import { normalizePhone } from '@/lib/whatsapp/phone';
import { templateToSend } from '@/lib/whatsapp/templates';
import type { IssuedForPrint, Marks } from './cert-doc';
import { BATCH_MAX, composePrinted, isCertificateType, readReason, readTyped, type CertificateType, type ChildRecord, type TypedProblem } from './certificate-rules';

// Documents and certificates (docs/28 row 10e, C228): certificates issued from the student record, one by one or for
// a class, into the school's issue register.
//
//   - The FEE CLEARANCE is feeClearance() (src/lib/fees/clearance.ts, C179): a child who owes nothing, or whom the
//     fee counter's override covers, is cleared. A child who owes is held; only the principal waives it, for that
//     certificate, with a reason. The database holds the same rule (certificates_issued_insert).
//   - The NUMBER, the day and the QR token are the database's, never the caller's. Numbers run per school and per
//     type with no gap; a withdrawn certificate keeps its number; nothing is deleted.
//   - NO DUPLICATE: one live TC per child; one live bonafide, character or study certificate per child, purpose and
//     day. A second is refused; a copy of the first is printed from the register instead.
//   - The principal WITHDRAWS a certificate with a reason. The public QR page then says "withdrawn".
//   - The PDF goes to the family through the send-gate only: the office's device draws it, it is kept in the app's
//     storage, and the message carries a link to it. The template waits for approval in Control and by Meta.
//   - The seal and the signature: PNG files the principal uploads, in the app's storage.
//   - Audit rows hold ids, codes, numbers, counts and booleans; never a name or the words of a reason (C224).
//   - Who: the principal and the school admin; the database says the same (row level security).

type Sql = Pick<PoolClient, 'query'>;
type Queue = Parameters<typeof queueWhatsAppMessage>[1];
export type CertActor = { schoolId: string; userId: string; role: StaffRole };
export const CERT_OFFICE: readonly string[] = ['principal', 'school_admin'];
const isOffice = (role: string) => CERT_OFFICE.includes(role);
export const CERTIFICATE_TEMPLATE = 'certificate_issued';
export const MARK_KINDS = ['seal', 'signature'] as const;
export type MarkKind = (typeof MARK_KINDS)[number];
export const isMarkKind = (v: unknown): v is MarkKind => (MARK_KINDS as readonly unknown[]).includes(v);
export const MARK_MAX_BYTES = 1_000_000;
export const COPY_MAX_BYTES = 3_500_000;
export const TOKEN_FORMAT = /^[A-Za-z0-9_-]{32}$/;
const REGISTER_MAX = 200;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
// Dates are read as text (YYYY-MM-DD): a date parsed into a Date at midnight would move a day in another time zone.
const day = (v: unknown) => String(v).slice(0, 10);

// ---- The screen --------------------------------------------------------------------------------------------------

export type CertificateHome = {
  classes: { class_id: string; name: string }[];
  year: string | null;
  marks: { seal: boolean; signature: boolean; signedBy: string | null };
  mayWaive: boolean;
  mayWithdraw: boolean;
  mayKeepMarks: boolean;
  today: string;
};
export async function certificateHome(db: Sql, actor: CertActor, today: string): Promise<CertificateHome | null> {
  if (!isOffice(actor.role)) return null;
  const classes = (await db.query(`select class_id, name from classes where school_id = $1 order by name, class_id`, [actor.schoolId])).rows;
  const year = (await db.query(`select label from academic_sessions where school_id = $1 and is_current order by start_date desc limit 1`, [actor.schoolId])).rows[0]?.label ?? null;
  const marks = (await db.query(`select m.kind, u.display_name from certificate_marks m left join users u on u.user_id = m.uploaded_by where m.school_id = $1`, [actor.schoolId])).rows as { kind: MarkKind; display_name: string | null }[];
  const signature = marks.find((m) => m.kind === 'signature');
  return {
    classes,
    year,
    marks: { seal: marks.some((m) => m.kind === 'seal'), signature: Boolean(signature), signedBy: signature?.display_name ?? null },
    mayWaive: actor.role === 'principal',
    mayWithdraw: actor.role === 'principal',
    mayKeepMarks: actor.role === 'principal',
    today,
  };
}

export type RosterChild = {
  student_id: string;
  name: string;
  admission_no: string | null;
  roll_no: string | null;
  status: string;
  owed_minor: number;
  cleared: boolean;
  cleared_by: 'nothing_owed' | 'fee_override' | null;
  latest: { certificate_id: string; number: string; issued_on: string } | null; // the newest live certificate of the type
};

// The children of a class for a type: what each owes and whether they are cleared (feeClearance, the one rule), and
// the newest live certificate of that type each already has. Roll order.
export async function certificateRoster(db: PoolClient, actor: CertActor, classId: string, type: CertificateType): Promise<RosterChild[] | null> {
  if (!isOffice(actor.role)) return null;
  const kids = (await db.query(
    `select s.student_id, s.name, s.admission_no, s.roll_no, s.status::text as status,
            (select json_build_object('certificate_id', c.certificate_id, 'number', c.number, 'issued_on', c.issued_on)
               from certificates_issued c where c.school_id = s.school_id and c.student_id = s.student_id and c.cert_type = $3 and c.withdrawn_at is null
              order by c.issued_at desc limit 1) as latest
       from students s where s.school_id = $1 and s.class_id = $2
      order by nullif(regexp_replace(coalesce(s.roll_no, ''), '[^0-9]', '', 'g'), '')::numeric nulls last, s.roll_no, s.name, s.student_id`,
    [actor.schoolId, classId, type]
  )).rows;
  const out: RosterChild[] = [];
  for (const k of kids) {
    const c = await feeClearance(db, actor.schoolId, k.student_id);
    const owed = c?.owedMinor ?? 0;
    out.push({
      student_id: k.student_id,
      name: k.name,
      admission_no: k.admission_no,
      roll_no: k.roll_no,
      status: k.status,
      owed_minor: Math.max(owed, 0),
      cleared: c?.cleared ?? false,
      cleared_by: !c?.cleared ? null : owed <= 0 ? 'nothing_owed' : 'fee_override',
      latest: k.latest ? { certificate_id: k.latest.certificate_id, number: k.latest.number, issued_on: day(k.latest.issued_on) } : null,
    });
  }
  return out;
}

// ---- Issuing -----------------------------------------------------------------------------------------------------

export type IssueInput = { type: CertificateType; studentIds: string[]; typed: Record<string, unknown>; waivers: Record<string, unknown> };
export type IssueOutcome = {
  issued: { studentId: string; certificateId: string; number: string }[];
  held: { studentId: string; owedMinor: number }[]; // fees owed, and no waiver given
  duplicates: { studentId: string; number: string | null }[]; // a live certificate of the kind already stands
  incomplete: { studentId: string; fields: string[] }[]; // the record lacks what the certificate must print
  aadhaar: string[]; // the record holds an Aadhaar-shaped number (an admission number written as one): never printed
  notFound: string[];
};
export type IssueResult = ({ ok: true } & IssueOutcome) | { ok: false; reason: 'not_allowed' | 'type' | 'no_children' | 'too_many' | 'waiver_not_principal' | 'waiver_reason' | 'aadhaar'; field?: string } | { ok: false; reason: TypedProblem; field: string };

async function childRecord(db: Sql, schoolId: string, studentId: string): Promise<(ChildRecord & { classId: string | null }) | null> {
  const s = (await db.query(
    `select s.name, s.admission_no, s.dob::text as dob, s.gender, s.status::text as status, s.class_id, c.name as class_name
       from students s left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
      where s.school_id = $1 and s.student_id = $2`,
    [schoolId, studentId]
  )).rows[0];
  if (!s) return null;
  const guardians = (await db.query(
    `select p.name, p.relation from parent_student_map m join parents p on p.school_id = m.school_id and p.parent_id = m.parent_id
      where m.school_id = $1 and m.student_id = $2 and p.merged_into is null and m.verification_status::text <> 'tombstoned'
      order by p.name, p.parent_id`,
    [schoolId, studentId]
  )).rows;
  return { name: s.name, admissionNo: s.admission_no, dob: s.dob, gender: s.gender, status: s.status, className: s.class_name, classId: s.class_id, guardians };
}

// The newest live certificate that a new one of this kind would duplicate, or null.
async function duplicateOf(db: Sql, schoolId: string, studentId: string, type: CertificateType, purpose: string | null): Promise<{ number: string } | null> {
  const r = (await db.query(
    type === 'transfer'
      ? `select number from certificates_issued where school_id = $1 and student_id = $2 and cert_type = 'transfer' and withdrawn_at is null and erased_at is null limit 1`
      : `select number from certificates_issued where school_id = $1 and student_id = $2 and cert_type = $3 and withdrawn_at is null and erased_at is null
           and lower(btrim(coalesce(purpose, ''))) = lower(btrim(coalesce($4::text, ''))) and issued_on = (now() at time zone 'Asia/Kolkata')::date limit 1`,
    type === 'transfer' ? [schoolId, studentId] : [schoolId, studentId, type, purpose]
  )).rows[0];
  return r ? { number: r.number } : null;
}

// Issue one certificate per child named, of one type, with the batch's typed words. Children who owe and have no
// waiver are held; the rest are issued, each in its own savepoint, so one refused child never undoes the others.
export async function issueCertificates(db: PoolClient, actor: CertActor, input: IssueInput, today: string): Promise<IssueResult> {
  if (!isOffice(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!isCertificateType(input.type)) return { ok: false, reason: 'type' };
  const ids = [...new Set(input.studentIds)];
  if (ids.length === 0) return { ok: false, reason: 'no_children' };
  if (ids.length > BATCH_MAX) return { ok: false, reason: 'too_many' };
  const typed = readTyped(input.type, input.typed, today);
  if (!typed.ok) return typed;
  const waivers: Record<string, string> = {};
  for (const [studentId, raw] of Object.entries(input.waivers)) {
    if (!ids.includes(studentId)) continue;
    if (actor.role !== 'principal') return { ok: false, reason: 'waiver_not_principal' };
    const r = readReason(raw);
    if (!r.ok) return { ok: false, reason: r.reason === 'aadhaar' ? 'aadhaar' : 'waiver_reason', field: 'waiver' };
    waivers[studentId] = r.value;
  }

  const school = (await db.query(`select name, address from schools where school_id = $1`, [actor.schoolId])).rows[0];
  const year = (await db.query(`select label from academic_sessions where school_id = $1 and is_current order by start_date desc limit 1`, [actor.schoolId])).rows[0]?.label ?? null;
  const signName = (await db.query(`select u.display_name from certificate_marks m join users u on u.user_id = m.uploaded_by where m.school_id = $1 and m.kind = 'signature'`, [actor.schoolId])).rows[0]?.display_name ?? null;
  const purpose = typed.values.purpose ?? null;
  const out: IssueOutcome = { issued: [], held: [], duplicates: [], incomplete: [], aadhaar: [], notFound: [] };

  for (const studentId of ids) {
    const child = await childRecord(db, actor.schoolId, studentId);
    const clearance = child ? await feeClearance(db, actor.schoolId, studentId) : null;
    if (!child || !clearance) {
      out.notFound.push(studentId);
      continue;
    }
    // A waiver is for a child who is held; one the clearance no longer needs is not recorded.
    const waiver = clearance.cleared ? null : (waivers[studentId] ?? null);
    if (!clearance.cleared && !waiver) {
      out.held.push({ studentId, owedMinor: clearance.owedMinor });
      continue;
    }
    const dup = await duplicateOf(db, actor.schoolId, studentId, input.type, purpose);
    if (dup) {
      out.duplicates.push({ studentId, number: dup.number });
      continue;
    }
    const composed = composePrinted(input.type, child, typed.values, { schoolName: school.name, address: school.address, year, signName, owesNothing: clearance.owedMinor <= 0 });
    if (!composed.ok) {
      // Reported per child, like the rest: the children issued before this one in the batch stay issued.
      if (composed.reason === 'aadhaar') out.aadhaar.push(studentId);
      else out.incomplete.push({ studentId, fields: composed.fields });
      continue;
    }
    await db.query('savepoint certificate_issue');
    try {
      const made = (await db.query(
        // The number, the day, the token and how the fee clearance passed are the database's (certificates_issued_insert).
        `insert into certificates_issued (school_id, cert_type, student_id, issued_by, purpose, printed, waiver_reason)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning certificate_id, number, clearance, owed_minor`,
        [actor.schoolId, input.type, studentId, actor.userId, input.type === 'transfer' ? null : purpose, JSON.stringify(composed.printed), waiver]
      )).rows[0];
      await writeAuditLog(db, {
        schoolId: actor.schoolId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        eventAction: 'certificate.issued',
        targetType: 'certificates_issued',
        targetId: made.certificate_id,
        beforeState: undefined,
        // The waiver's words stay on the certificate's own row (C224).
        afterState: { studentId, type: input.type, number: made.number, clearance: made.clearance, owedMinor: Number(made.owed_minor), reasonGiven: made.clearance === 'waived' },
      });
      // The certificate and its audit row stand or fall together.
      await db.query('release savepoint certificate_issue');
      out.issued.push({ studentId, certificateId: made.certificate_id, number: made.number });
    } catch (err) {
      await db.query('rollback to savepoint certificate_issue');
      const code = (err as { code?: string }).code;
      // Two people at once: the database's own rules decide, and the child is reported as it now stands.
      if (code === '23505') out.duplicates.push({ studentId, number: (await duplicateOf(db, actor.schoolId, studentId, input.type, purpose))?.number ?? null });
      else if (code === '23514' && /fees are owed/.test(String((err as Error).message))) out.held.push({ studentId, owedMinor: clearance.owedMinor });
      else throw err;
    }
  }
  return { ok: true, ...out };
}

// ---- The register ------------------------------------------------------------------------------------------------

export type RegisterRow = {
  certificate_id: string;
  number: string;
  cert_type: CertificateType;
  student_id: string;
  child: string | null; // as printed; null once erased
  admission_no: string | null;
  class_name: string | null;
  purpose: string | null;
  issued_on: string;
  issued_by: string | null;
  clearance: 'nothing_owed' | 'fee_override' | 'waived';
  owed_minor: number;
  waiver_reason: string | null;
  waived_by: string | null;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  withdraw_reason: string | null;
  erased: boolean;
  sent: string | null; // the send-gate's state of the latest message to the family
};

export async function certificateRegister(db: Sql, actor: CertActor, filter: { type?: CertificateType | null; classId?: string | null }): Promise<RegisterRow[] | null> {
  if (!isOffice(actor.role)) return null;
  const { rows } = await db.query(
    `select c.certificate_id, c.number, c.cert_type, c.student_id, c.printed ->> 'studentName' as child, c.printed ->> 'admissionNo' as admission_no, k.name as class_name,
            c.purpose, c.issued_on::text as issued_on, i.display_name as issued_by, c.clearance, c.owed_minor, c.waiver_reason, w.display_name as waived_by,
            c.withdrawn_at, x.display_name as withdrawn_by, c.withdraw_reason, c.erased_at is not null as erased,
            (select l.status::text from communication_log l where l.school_id = c.school_id and l.student_id = c.student_id and l.dedupe_key like 'certificate:' || c.certificate_id::text || ':%'
              order by l.created_at desc limit 1) as sent
       from certificates_issued c
       left join classes k on k.school_id = c.school_id and k.class_id = c.class_id
       left join users i on i.user_id = c.issued_by
       left join users w on w.user_id = c.waived_by
       left join users x on x.user_id = c.withdrawn_by
      where c.school_id = $1 and ($2::text is null or c.cert_type = $2) and ($3::uuid is null or c.class_id = $3)
      order by c.issued_at desc, c.seq desc
      limit $4`,
    [actor.schoolId, filter.type ?? null, filter.classId ?? null, REGISTER_MAX]
  );
  return rows.map((r) => ({ ...r, issued_on: day(r.issued_on), owed_minor: Number(r.owed_minor), withdrawn_at: iso(r.withdrawn_at) }));
}

// ---- Withdrawing -------------------------------------------------------------------------------------------------

export type WithdrawResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'not_found' | 'withdrawn' | 'reason' | 'aadhaar' };
export async function withdrawCertificate(db: Sql, actor: CertActor, certificateId: string, reasonRaw: unknown): Promise<WithdrawResult> {
  if (actor.role !== 'principal') return { ok: false, reason: 'not_allowed' };
  const reason = readReason(reasonRaw);
  if (!reason.ok) return reason;
  const c = (await db.query(`select cert_type, number, withdrawn_at from certificates_issued where school_id = $1 and certificate_id = $2 for update`, [actor.schoolId, certificateId])).rows[0];
  if (!c) return { ok: false, reason: 'not_found' };
  if (c.withdrawn_at) return { ok: false, reason: 'withdrawn' };
  // A certificate whose child's details were erased is still withdrawn when the principal says so; the words are not
  // kept on it, as nothing else about the child is.
  await db.query(`update certificates_issued set withdrawn_at = now(), withdrawn_by = $3, withdraw_reason = case when erased_at is null then $4 end where school_id = $1 and certificate_id = $2`, [actor.schoolId, certificateId, actor.userId, reason.value]);
  // The reason stays on the certificate's own row (C224).
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'certificate.withdrawn', targetType: 'certificates_issued', targetId: certificateId, beforeState: undefined, afterState: { type: c.cert_type, number: c.number, reasonGiven: true } });
  return { ok: true };
}

// ---- Drawing: what the PDF prints, and the seal and signature ------------------------------------------------------

// Reads a stored file's bytes, or null when the storage cannot give them now.
export type ReadStored = (key: string) => Promise<Uint8Array | null>;
export function storedReader(storage: FileStorage): ReadStored {
  return async (key) => {
    try {
      if (storage instanceof MemoryFileStorage) return storage.files.get(key)?.bytes ?? null;
      const res = await fetch(await storage.signedUrl(key, 60), { cache: 'no-store' });
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    } catch {
      return null;
    }
  };
}

export type MarkImages = Marks & { unavailable: MarkKind[] };
export async function markImages(db: Sql, schoolId: string, read: ReadStored): Promise<MarkImages> {
  const rows = (await db.query(`select kind, storage_key, aspect from certificate_marks where school_id = $1`, [schoolId])).rows as { kind: MarkKind; storage_key: string; aspect: string }[];
  const out: MarkImages = { unavailable: [] };
  for (const r of rows) {
    const bytes = await read(r.storage_key);
    if (!bytes || sniffImageType(bytes) !== 'image/png') {
      out.unavailable.push(r.kind);
      continue;
    }
    const image: CertImage = { src: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`, aspect: Number(r.aspect) };
    if (r.kind === 'seal') out.seal = image;
    else out.signature = image;
  }
  return out;
}

// The certificates asked for, as they print, in the order asked (the screen asks in roll order). A withdrawn or
// erased certificate is not printed again.
export async function certificatesToPrint(db: Sql, actor: CertActor, ids: readonly string[]): Promise<IssuedForPrint[] | null> {
  if (!isOffice(actor.role)) return null;
  const rows = (await db.query(
    `select certificate_id, cert_type, number, issued_on::text as issued_on, verify_token, printed from certificates_issued
      where school_id = $1 and certificate_id = any($2::uuid[]) and withdrawn_at is null and erased_at is null`,
    [actor.schoolId, ids]
  )).rows;
  const byId = new Map(rows.map((r) => [r.certificate_id as string, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [{ certificateId: r.certificate_id, type: r.cert_type, number: r.number, issuedOn: day(r.issued_on), token: r.verify_token, printed: r.printed }] : [];
  });
}

// PNG width and height from its header, so the shape drawn is the file's own, never what a browser claims.
export function pngAspect(bytes: Uint8Array): number | null {
  if (sniffImageType(bytes) !== 'image/png' || bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const w = view.getUint32(16);
  const h = view.getUint32(20);
  return w > 0 && h > 0 ? w / h : null;
}

export type MarkResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'kind' | 'not_a_png' | 'too_large' | 'shape' | 'storage_unavailable' | 'not_found' };
export async function saveMark(db: Sql, storage: FileStorage, actor: CertActor, kind: unknown, bytes: Uint8Array, newId: () => string = () => randomUUID()): Promise<MarkResult> {
  if (actor.role !== 'principal') return { ok: false, reason: 'not_allowed' };
  if (!isMarkKind(kind)) return { ok: false, reason: 'kind' };
  if (bytes.length === 0 || bytes.length > MARK_MAX_BYTES) return { ok: false, reason: 'too_large' };
  const aspect = pngAspect(bytes);
  if (aspect === null) return { ok: false, reason: 'not_a_png' };
  if (aspect <= 0.05 || aspect >= 20) return { ok: false, reason: 'shape' };
  // The key starts with the school of the verified session.
  const key = `${actor.schoolId}/certificate-marks/${kind}/${newId()}.png`;
  try {
    await storage.put(key, bytes, 'image/png');
  } catch (err) {
    if (err instanceof FileStorageUnavailableError) return { ok: false, reason: 'storage_unavailable' };
    throw err;
  }
  try {
    const before = (await db.query(`select storage_key from certificate_marks where school_id = $1 and kind = $2`, [actor.schoolId, kind])).rows[0]?.storage_key as string | undefined;
    await db.query(
      `insert into certificate_marks (school_id, kind, storage_key, size_bytes, aspect, uploaded_by) values ($1, $2, $3, $4, $5, $6)
       on conflict (school_id, kind) do update set storage_key = excluded.storage_key, size_bytes = excluded.size_bytes, aspect = excluded.aspect, uploaded_by = excluded.uploaded_by`,
      [actor.schoolId, kind, key, bytes.length, aspect, actor.userId]
    );
    await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'certificate.mark_saved', targetType: 'certificate_marks', targetId: kind, beforeState: undefined, afterState: { kind, sizeBytes: bytes.length, replaced: Boolean(before) } });
    if (before) await storage.remove(before).catch(() => undefined);
    return { ok: true };
  } catch (err) {
    await storage.remove(key).catch(() => undefined);
    throw err;
  }
}

export async function removeMark(db: Sql, storage: FileStorage, actor: CertActor, kind: unknown): Promise<MarkResult> {
  if (actor.role !== 'principal') return { ok: false, reason: 'not_allowed' };
  if (!isMarkKind(kind)) return { ok: false, reason: 'kind' };
  const gone = (await db.query(`delete from certificate_marks where school_id = $1 and kind = $2 returning storage_key`, [actor.schoolId, kind])).rows[0];
  if (!gone) return { ok: false, reason: 'not_found' };
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'certificate.mark_removed', targetType: 'certificate_marks', targetId: kind, beforeState: undefined, afterState: { kind } });
  await storage.remove(gone.storage_key).catch(() => undefined);
  return { ok: true };
}

// ---- Sending to the family -----------------------------------------------------------------------------------------

export const isPdf = (b: Uint8Array) => b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d;
export type SendResult = { ok: true; status: string; last4: string } | { ok: false; reason: 'not_allowed' | 'not_found' | 'withdrawn' | 'not_a_pdf' | 'too_large' | 'no_number' | 'storage_unavailable' };

// The certificate's PDF, drawn on the office's device, kept in the app's storage under the school's own prefix; the
// message goes to the child's first guardian with a WhatsApp number, ONLY through the send-gate (consent, quiet hours,
// budget and approved words, read again when it goes). Each press is its own message.
export async function sendCertificate(db: PoolClient, queue: Queue, storage: FileStorage, actor: CertActor, certificateId: string, pdf: Uint8Array, newId: () => string = () => randomUUID()): Promise<SendResult> {
  if (!isOffice(actor.role)) return { ok: false, reason: 'not_allowed' };
  const c = (await db.query(`select student_id, cert_type, number, printed ->> 'studentName' as child, withdrawn_at, erased_at from certificates_issued where school_id = $1 and certificate_id = $2`, [actor.schoolId, certificateId])).rows[0];
  if (!c) return { ok: false, reason: 'not_found' };
  if (c.withdrawn_at || c.erased_at) return { ok: false, reason: 'withdrawn' };
  if (pdf.length === 0 || pdf.length > COPY_MAX_BYTES) return { ok: false, reason: 'too_large' };
  if (!isPdf(pdf)) return { ok: false, reason: 'not_a_pdf' };
  const guardians = (await db.query(
    `select p.parent_id, p.phone from parent_student_map m join parents p on p.school_id = m.school_id and p.parent_id = m.parent_id
      where m.school_id = $1 and m.student_id = $2 and p.merged_into is null and m.verification_status::text <> 'tombstoned'
      order by p.name, p.parent_id`,
    [actor.schoolId, c.student_id]
  )).rows as { parent_id: string; phone: string }[];
  const guardian = guardians.map((g) => ({ ...g, phone: normalizePhone(String(g.phone ?? '')) })).find((g) => g.phone);
  if (!guardian?.phone) return { ok: false, reason: 'no_number' };

  const id = newId();
  const key = `${actor.schoolId}/certificates/${certificateId}/${id}.pdf`;
  try {
    await storage.put(key, pdf, 'application/pdf');
  } catch (err) {
    if (err instanceof FileStorageUnavailableError) return { ok: false, reason: 'storage_unavailable' };
    throw err;
  }
  try {
    const copy = (await db.query(
      `insert into certificate_copies (school_id, certificate_id, storage_key, size_bytes, made_by) values ($1, $2, $3, $4, $5) returning copy_id, copy_key`,
      [actor.schoolId, certificateId, key, pdf.length, actor.userId]
    )).rows[0];
    // The words go in the language they will be sent in: the guardian's, or the school's, where those words are approved.
    const wanted = await languageFor(db, actor.schoolId, guardian.parent_id);
    const lang = (await templateToSend(db, actor.schoolId, CERTIFICATE_TEMPLATE, wanted, false))?.language ?? wanted;
    const sent = await queueWhatsAppMessage(db, queue, {
      schoolId: actor.schoolId,
      studentId: c.student_id,
      parentId: guardian.parent_id,
      purpose: 'operational_communication',
      toPhone: guardian.phone,
      templateName: CERTIFICATE_TEMPLATE,
      templateParams: { child: c.child ?? '', certificate: t(lang, `crt.type.${c.cert_type}` as MessageKey), number: c.number, link: `${siteUrl}/api/public/certificates/copy/${copy.copy_key}` },
      dedupeKey: `certificate:${certificateId}:${id}`,
      language: lang,
    });
    await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'certificate.sent', targetType: 'certificates_issued', targetId: certificateId, beforeState: undefined, afterState: { copyId: copy.copy_id, parentId: guardian.parent_id, sendState: sent.status } });
    return { ok: true, status: sent.status, last4: guardian.phone.slice(-4) };
  } catch (err) {
    await storage.remove(key).catch(() => undefined);
    throw err;
  }
}

// ---- The public side (the platform role, through the two definer functions only) ----------------------------------

export type VerifyView = { state: 'valid' | 'withdrawn'; type: CertificateType; schoolName: string; issuedOn: string; number: string; nameShown: string | null };
export async function verifyCertificate(db: Sql, token: string): Promise<VerifyView | null> {
  if (!TOKEN_FORMAT.test(token)) return null;
  const r = (await db.query(`select state, cert_type, school_name, issued_on::text as issued_on, number, name_shown from public.certificate_verify($1)`, [token])).rows[0];
  return r ? { state: r.state, type: r.cert_type, schoolName: r.school_name, issuedOn: day(r.issued_on), number: r.number, nameShown: r.name_shown ?? null } : null;
}

export async function familyCopy(db: Sql, key: string): Promise<{ storageKey: string; number: string } | null> {
  if (!TOKEN_FORMAT.test(key)) return null;
  const r = (await db.query(`select storage_key, number from public.certificate_copy($1)`, [key])).rows[0];
  return r ? { storageKey: r.storage_key, number: r.number } : null;
}

// ---- A child's erasure (src/lib/consent/dsr.ts) ------------------------------------------------------------------

// The register keeps each number, type, day and state; what was printed and every word typed about the child go, and
// so do the family copies, their files removed from storage (best effort, as the erasure removes captured documents).
export async function eraseCertificatesOf(db: Sql, studentId: string, storage: FileStorage = supabaseFileStorage): Promise<number> {
  const r = (await db.query(`select certificates, copy_paths from public.erase_student_certificates($1)`, [studentId])).rows[0];
  for (const path of (r?.copy_paths ?? []) as string[]) await storage.remove(path).catch(() => undefined);
  return Number(r?.certificates ?? 0) + ((r?.copy_paths ?? []) as string[]).length;
}
