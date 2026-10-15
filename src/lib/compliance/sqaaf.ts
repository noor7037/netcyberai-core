import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { hasAadhaarNumber } from '@/lib/privacy/aadhaar';
import { checkUpload, type UploadProblem, type UploadRead } from '@/lib/privacy/upload-check';
import { FileStorageUnavailableError, sniffImageType, type FileStorage } from '@/lib/storage/file-storage';
import { DESK_ROLES } from './register-rules';

// SQAAF evidence (docs/28 row 10d, C227): CBSE's School Quality Assessment and Assurance Framework is DATA
// (sqaaf_standards, copied word for word from the document named on each row, with its URL and the day it was read:
// see supabase/migrations/*_p7_compliance_desk.sql). The school tags evidence to ONE standard of that list: a typed
// note, or a photo or PDF the office uploads (kept in the private bucket under "<school>/sqaaf/", handed out only as a
// short-lived link after the row was read under row level security), or both. Never an Aadhaar number in a note or a
// file's name (the one rule, C225); never a scan of an Aadhaar card: what a file says is read and checked before it is
// stored (src/lib/privacy/upload-check.ts, C232 part A). A wrong piece is removed (audited); none is changed. The
// office only.

type Actor = { schoolId: string; userId: string; role: StaffRole };
type Db = Pick<PoolClient, 'query'>;

export const NOTE_MAX = 600;
export const FILE_MAX_BYTES = 8 * 1024 * 1024;
export const PER_STANDARD_MAX = 20;
const SIGNED_LINK_SECONDS = 300;

export type Evidence = { evidence_id: string; note: string | null; file_name: string | null; mime_type: string | null; size_bytes: number | null; added_by: string | null; added_at: string };
export type Standard = { code: string; statement: string; evidence: Evidence[] };
export type SubDomain = { code: string; name: string; standards: Standard[] };
export type Domain = { no: number; name: string; standards: number; withEvidence: number; subDomains: SubDomain[] };
export type Sqaaf = { source: { title: string; url: string; readOn: string } | null; domains: Domain[]; totals: { standards: number; withEvidence: number; pieces: number } };

export async function loadSqaaf(db: Db, actor: Actor): Promise<Sqaaf | null> {
  if (!DESK_ROLES.includes(actor.role)) return null;
  const standards = (await db.query(`select code, domain_no, domain, sub_domain_code, sub_domain, statement, source_title, source_url, source_read_on::text as source_read_on from sqaaf_standards order by position`)).rows;
  const pieces = (
    await db.query(
      `select e.evidence_id, e.standard_code, e.note, e.file_name, e.mime_type, e.size_bytes, u.display_name as added_by, e.added_at
         from sqaaf_evidence e left join users u on u.school_id = e.school_id and u.user_id = e.added_by
        where e.school_id = $1 order by e.added_at, e.evidence_id`,
      [actor.schoolId]
    )
  ).rows;
  const byStandard = new Map<string, Evidence[]>();
  for (const p of pieces) byStandard.set(p.standard_code, [...(byStandard.get(p.standard_code) ?? []), { evidence_id: p.evidence_id, note: p.note, file_name: p.file_name, mime_type: p.mime_type, size_bytes: p.size_bytes, added_by: p.added_by, added_at: new Date(p.added_at).toISOString() }]);
  const domains: Domain[] = [];
  for (const s of standards) {
    let d = domains.find((x) => x.no === s.domain_no);
    if (!d) domains.push((d = { no: s.domain_no, name: s.domain, standards: 0, withEvidence: 0, subDomains: [] }));
    let sub = d.subDomains.find((x) => x.code === s.sub_domain_code);
    if (!sub) d.subDomains.push((sub = { code: s.sub_domain_code, name: s.sub_domain, standards: [] }));
    const evidence = byStandard.get(s.code) ?? [];
    sub.standards.push({ code: s.code, statement: s.statement, evidence });
    d.standards += 1;
    if (evidence.length) d.withEvidence += 1;
  }
  const first = standards[0];
  return {
    source: first ? { title: first.source_title, url: first.source_url, readOn: first.source_read_on } : null,
    domains,
    totals: { standards: standards.length, withEvidence: domains.reduce((n, d) => n + d.withEvidence, 0), pieces: pieces.length },
  };
}

export type EvidenceProblem = 'unknown_standard' | 'note' | 'aadhaar' | 'nothing' | 'too_many' | 'not_a_photo_or_pdf' | 'too_large' | 'storage_unavailable' | UploadProblem;
export type EvidenceResult = { ok: true; evidenceId: string } | { ok: false; reason: 'not_allowed' | 'not_found' | EvidenceProblem };

// A note as typed: trimmed, at most NOTE_MAX characters, never an Aadhaar number; '' or null is no note.
function readNote(note: unknown): { ok: true; note: string | null } | { ok: false; reason: 'note' | 'aadhaar' } {
  if (note === null || note === undefined) return { ok: true, note: null };
  if (typeof note !== 'string' || note.trim().length > NOTE_MAX) return { ok: false, reason: 'note' };
  if (hasAadhaarNumber(note)) return { ok: false, reason: 'aadhaar' };
  return { ok: true, note: note.trim() || null };
}

async function checkStandard(db: Db, schoolId: string, code: unknown): Promise<EvidenceProblem | null> {
  if (typeof code !== 'string' || !/^[1-7]\.[0-9]{1,2}\.[0-9]{1,2}$/.test(code) || !(await db.query(`select 1 from sqaaf_standards where code = $1`, [code])).rows[0]) return 'unknown_standard';
  const { rows } = await db.query(`select count(*)::int as n from sqaaf_evidence where school_id = $1 and standard_code = $2`, [schoolId, code]);
  return rows[0].n >= PER_STANDARD_MAX ? 'too_many' : null;
}

// The audit row: the evidence's id, its standard and what kind it is (a code), never the note or the file's name.
type EvidenceKind = 'note' | 'file' | 'file_and_note';
// For a file, also how the Aadhaar check read it (a code: image_text, pdf_text or name_only).
async function audited(db: Db, actor: Actor, evidenceId: string, standardCode: string, kind: EvidenceKind, read?: UploadRead) {
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'compliance_desk.sqaaf_evidence_added', targetType: 'sqaaf_evidence', targetId: evidenceId, beforeState: undefined, afterState: { standardCode, kind, ...(read ? { uploadCheck: read } : {}) } });
}

// A typed note tagged to a standard.
export async function addSqaafNote(db: Db, actor: Actor, input: { standardCode: unknown; note: unknown }): Promise<EvidenceResult> {
  if (!DESK_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const problem = await checkStandard(db, actor.schoolId, input.standardCode);
  if (problem) return { ok: false, reason: problem };
  const note = readNote(input.note);
  if (!note.ok) return { ok: false, reason: note.reason };
  if (!note.note) return { ok: false, reason: 'nothing' };
  const made = await db.query(`insert into sqaaf_evidence (school_id, standard_code, note, added_by) values ($1, $2, $3, $4) returning evidence_id`, [actor.schoolId, input.standardCode, note.note, actor.userId]);
  const id = made.rows[0].evidence_id as string;
  await audited(db, actor, id, input.standardCode as string, 'note');
  return { ok: true, evidenceId: id };
}

// What a file really is, from its first bytes: a photo, or a PDF (never the name or the type the browser claims).
export function sniffEvidenceFile(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf' | null {
  const image = sniffImageType(bytes);
  if (image) return image;
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d ? 'application/pdf' : null;
}
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' } as const;

// The name the browser sent, kept only as a label: letters, digits, spaces, dots, dashes and underscores; a name that
// holds an Aadhaar number (or nothing usable) becomes a plain one.
export function fileLabel(name: string, mime: keyof typeof EXT): string {
  const label = name.replace(/[^\p{L}\p{M}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return label && !hasAadhaarNumber(label) ? label : `evidence.${EXT[mime]}`;
}

// A photo or a PDF tagged to a standard, with a note or none. What the file says is checked first (an Aadhaar number or
// card, or words that cannot be read, are refused and never stored); the file is then stored under the school's own
// folder (the key starts with the school of the verified session; never anything the browser sent), then its row; a
// row that cannot be written takes the file away again.
export async function addSqaafFile(db: Db, storage: FileStorage, actor: Actor, input: { standardCode: unknown; note: unknown; name: string; bytes: Uint8Array }, newId: () => string = () => crypto.randomUUID()): Promise<EvidenceResult> {
  if (!DESK_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const problem = await checkStandard(db, actor.schoolId, input.standardCode);
  if (problem) return { ok: false, reason: problem };
  const note = readNote(input.note);
  if (!note.ok) return { ok: false, reason: note.reason };
  if (input.bytes.length === 0 || input.bytes.length > FILE_MAX_BYTES) return { ok: false, reason: 'too_large' };
  const mime = sniffEvidenceFile(input.bytes);
  if (!mime) return { ok: false, reason: 'not_a_photo_or_pdf' };
  const screen = await checkUpload({ bytes: input.bytes, name: input.name });
  if (!screen.ok) return { ok: false, reason: screen.reason };
  const key = `${actor.schoolId}/sqaaf/${newId()}.${EXT[mime]}`;
  try {
    await storage.put(key, input.bytes, mime);
  } catch (err) {
    if (err instanceof FileStorageUnavailableError) return { ok: false, reason: 'storage_unavailable' };
    throw err;
  }
  try {
    const made = await db.query(
      `insert into sqaaf_evidence (school_id, standard_code, note, storage_key, file_name, mime_type, size_bytes, added_by) values ($1, $2, $3, $4, $5, $6, $7, $8) returning evidence_id`,
      [actor.schoolId, input.standardCode, note.note, key, fileLabel(input.name, mime), mime, input.bytes.length, actor.userId]
    );
    const id = made.rows[0].evidence_id as string;
    await audited(db, actor, id, input.standardCode as string, note.note === null ? 'file' : 'file_and_note', screen.read);
    return { ok: true, evidenceId: id };
  } catch (err) {
    await storage.remove(key).catch(() => undefined);
    throw err;
  }
}

// Removes a piece of evidence (audited with its id and standard), then its file, if it has one.
export async function removeSqaafEvidence(db: Db, storage: FileStorage, actor: Actor, evidenceId: string): Promise<EvidenceResult> {
  if (!DESK_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const gone = (await db.query(`delete from sqaaf_evidence where school_id = $1 and evidence_id = $2 returning standard_code, storage_key`, [actor.schoolId, evidenceId])).rows[0];
  if (!gone) return { ok: false, reason: 'not_found' };
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'compliance_desk.sqaaf_evidence_removed', targetType: 'sqaaf_evidence', targetId: evidenceId, beforeState: undefined, afterState: { standardCode: gone.standard_code as string, withFile: gone.storage_key !== null } });
  if (gone.storage_key) await storage.remove(gone.storage_key).catch(() => undefined);
  return { ok: true, evidenceId };
}

// A short-lived link to an evidence file, only after its row was read under row level security.
export async function sqaafFileUrl(db: Db, storage: FileStorage, actor: Actor, evidenceId: string): Promise<string | null> {
  if (!DESK_ROLES.includes(actor.role)) return null;
  const row = (await db.query(`select storage_key from sqaaf_evidence where school_id = $1 and evidence_id = $2 and storage_key is not null`, [actor.schoolId, evidenceId])).rows[0];
  return row ? storage.signedUrl(row.storage_key, SIGNED_LINK_SECONDS) : null;
}
