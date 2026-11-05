import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { writeAuditLog } from '@/lib/audit/log';
import { withGuardianContext, withPlatformService, type FamilyClaims } from '@/lib/auth/db';
import { appSessionSecret } from '@/lib/auth/env';
import { certificateFileName } from '@/lib/documents/certificate-rules';
import { guardianRequests, refreshHolds, requestAsGuardian, type GuardianRequest, type RequestResult } from '@/lib/documents/certificate-requests';
import { storedReader } from '@/lib/documents/certificates';
import { FileStorageUnavailableError, type FileStorage } from '@/lib/storage/file-storage';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// School Link, certificate requests (W21-M7, docs/42 Documents). A family reads and writes the school's certificate
// requests only as the guardian its connect code was made for (withGuardianContext), so the school's own parent rules
// decide: the requests of that guardian's own children, a request only for their own child, and the events of those
// requests. The library in src/lib/documents/certificate-requests.ts does the work. The fee hold is re-read as the
// platform role after the guardian's transaction has committed (the guardian never reads what is owed from here).
//
// The PDF reaches the family by a SIGNED, EXPIRING link that works ONCE: the guardian asks for it (inside their own
// session and link), the server seals {request, account, link, expiry, nonce} with an HMAC keyed by the app's secret
// under its own purpose (the way the record-upload ticket is sealed), and opening it writes one 'downloaded' event
// carrying the nonce, which the database holds unique. A second open, an expired link, another account's link and a
// request that is no longer ready all answer the same: gone.

type Claims = FamilyClaims;
export type { GuardianRequest };
export type FamilyCertificateResult = RequestResult;
export const LINK_MINUTES = 10;
const PURPOSE = 'family-certificate-download:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function familyCertificatesFor(claims: Claims, linkId: string, studentId: string): Promise<GuardianRequest[]> {
  const read = () => withGuardianContext(claims, linkId, async (db, link) => ({ schoolId: link.schoolId, rows: await guardianRequests(db, link.schoolId, [studentId]) }));
  const first = await read();
  if (!first.rows.some((r) => r.stage === 'requested')) return first.rows;
  // A request waiting may have been cleared by a payment since: the platform role re-reads the dues.
  const changed = await withPlatformService((db) => refreshHolds(db, first.schoolId, studentId));
  return changed > 0 ? (await read()).rows : first.rows;
}

export async function requestFamilyCertificate(claims: Claims, linkId: string, input: { studentId: string; kind: unknown; reason: unknown }): Promise<FamilyCertificateResult> {
  const made = await withGuardianContext(claims, linkId, async (db, link) => ({ link, r: await requestAsGuardian(db, link.schoolId, input) }));
  if (!made.r.ok) return made.r;
  const r = made.r;
  await withPlatformService(async (db) => {
    await writeAuditLog(db, { schoolId: made.link.schoolId, actorUserId: null, actorRole: 'parent', eventAction: 'certificate_request.created', targetType: 'certificate_requests', targetId: r.requestId, beforeState: undefined, afterState: { via: 'app', parentId: made.link.parentId, kind: String(input.kind) } });
    await refreshHolds(db, made.link.schoolId, input.studentId);
  });
  return r;
}

// The guardian's requests that are ready (or were collected), for the notifications feed.
export async function familyCertificatesFeed(claims: Claims, linkId: string, studentIds: readonly string[]): Promise<GuardianRequest[]> {
  if (!studentIds.length) return [];
  return withGuardianContext(claims, linkId, async (db, link) => (await guardianRequests(db, link.schoolId, studentIds)).filter((r) => r.stage === 'ready'));
}

// ---- The signed, expiring, once-only link ------------------------------------------------------------------------------

type Ticket = { r: string; a: string; l: string; x: number; n: string };
const seal = (body: string): Buffer => createHmac('sha256', appSessionSecret()).update(`${PURPOSE}:${body}`).digest();
function sealTicket(t: Ticket): string {
  const body = Buffer.from(JSON.stringify(t), 'utf8').toString('base64url');
  return `${body}.${seal(body).toString('base64url')}`;
}
function openTicket(raw: unknown): Ticket | null {
  if (typeof raw !== 'string' || raw.length > 1024) return null;
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const given = Buffer.from(parts[1], 'base64url');
  const expected = seal(parts[0]);
  if (given.toString('base64url') !== parts[1] || given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const t = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Record<string, unknown>;
    const ok = typeof t.r === 'string' && UUID.test(t.r) && typeof t.a === 'string' && UUID.test(t.a) && typeof t.l === 'string' && UUID.test(t.l) && Number.isSafeInteger(t.x) && typeof t.n === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(t.n);
    return ok ? (t as unknown as Ticket) : null;
  } catch {
    return null;
  }
}

export const DOWNLOAD_PATH = '/api/family/school/certificates/file?t=';

// A link for a ready request of the guardian's own child; null when it is not theirs, not ready, or its certificate was withdrawn.
export async function familyCertificateLink(claims: Claims, linkId: string, requestId: string, now: Date = new Date()): Promise<{ url: string; minutes: number } | null> {
  if (!UUID.test(requestId)) return null;
  const ok = await withGuardianContext(claims, linkId, async (db, link) => {
    const r = (await db.query(
      `select 1 from certificate_requests r join certificates_issued c on c.school_id = r.school_id and c.certificate_id = r.certificate_id
        where r.school_id = $1 and r.cert_id = $2 and r.stage in ('ready', 'collected') and c.withdrawn_at is null`,
      [link.schoolId, requestId]
    )).rows[0];
    return Boolean(r);
  });
  if (!ok) return null;
  const ticket: Ticket = { r: requestId, a: claims.accountId, l: linkId, x: Math.floor(now.getTime() / 1000) + LINK_MINUTES * 60, n: randomBytes(18).toString('base64url') };
  return { url: `${DOWNLOAD_PATH}${sealTicket(ticket)}`, minutes: LINK_MINUTES };
}

export type OpenedFile = { bytes: Uint8Array; fileName: string };
// Opens a link: 'bad' (not ours, changed, someone else's), 'gone' (expired, used, or no longer ready), 'unavailable'
// (the file could not be read: the link is NOT spent), or the PDF. The link is spent in the same transaction that
// reads the file, so a read that fails spends nothing.
export async function openFamilyCertificate(claims: Claims, raw: unknown, now: Date = new Date(), storage: FileStorage = supabaseFileStorage): Promise<OpenedFile | 'bad' | 'gone' | 'unavailable'> {
  const t = openTicket(raw);
  if (!t || t.a !== claims.accountId) return 'bad';
  if (now.getTime() / 1000 > t.x) return 'gone';
  // Still the guardian's own child's ready request, through a link still open.
  const link = await withGuardianContext(claims, t.l, async (db, l) => {
    const r = (await db.query(`select 1 from certificate_requests where school_id = $1 and cert_id = $2 and stage in ('ready', 'collected')`, [l.schoolId, t.r])).rows[0];
    return r ? l : null;
  }).catch(() => null);
  if (!link) return 'gone';
  try {
    return await withPlatformService(async (db) => {
      const copy = (await db.query(`select school_id, number, storage_key from public.certificate_request_copy($1)`, [t.r])).rows[0] as { school_id: string; number: string; storage_key: string } | undefined;
      if (!copy || copy.school_id !== link.schoolId) return 'gone' as const;
      const spent = await db.query(
        `insert into certificate_request_events (school_id, request_id, kind, actor, actor_parent_id, nonce) values ($1, $2, 'downloaded', 'guardian', $3, $4) on conflict (nonce) where nonce is not null do nothing returning event_id`,
        [link.schoolId, t.r, link.parentId, t.n]
      );
      if (spent.rowCount === 0) return 'gone' as const;
      const bytes = await storedReader(storage)(copy.storage_key);
      if (!bytes) throw new FileStorageUnavailableError('copy not found');
      await writeAuditLog(db, { schoolId: link.schoolId, actorUserId: null, actorRole: 'parent', eventAction: 'certificate_request.downloaded', targetType: 'certificate_requests', targetId: t.r, beforeState: undefined, afterState: { via: 'app', parentId: link.parentId } });
      return { bytes, fileName: certificateFileName(copy.number) };
    });
  } catch (e) {
    if (e instanceof FileStorageUnavailableError) return 'unavailable';
    throw e;
  }
}
