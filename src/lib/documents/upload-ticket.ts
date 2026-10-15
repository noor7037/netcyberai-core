import { createHmac, timingSafeEqual } from 'crypto';
import { appSessionSecret } from '@/lib/auth/env';
import { isRecordFileType, type RecordFileType } from '@/lib/contracts/record-documents';

// The pending upload of a paper on a record (C235-D2), kept in the ticket the browser holds rather than in a table:
// who asked (school and person), for which record (and which paper, or a new one with its kind and name), the key the
// server chose for the file, the file's declared name, size and type, and when the ticket stops working (ten minutes
// after it is given). The browser cannot change any of it: the ticket is sealed with an HMAC-SHA256 keyed by the app's
// session secret under its own purpose ("record-upload-ticket:v1"), the way the application form's digests are
// (src/lib/onboarding/intake.ts), and is compared in constant time. It mints nothing: the purpose prefix (which no
// session token's signing input can contain) keeps it apart from every session token. Only the person who asked
// can confirm it (src/lib/documents/record-direct-upload.ts), once: a key a version row already uses is refused.
//
// Not secret from the person who holds it (it carries what they sent, and nothing more), only unforgeable.

const PURPOSE = 'record-upload-ticket:v1';
const MAX_TICKET = 4096;

export type UploadTicket = {
  schoolId: string;
  userId: string;
  record: 'staff' | 'student';
  recordId: string;
  documentId: string;
  newPaper: boolean;
  kind: string | null;
  title: string | null;
  fileName: string;
  mime: RecordFileType;
  sizeBytes: number;
  key: string;
  expiresAt: number; // seconds since 1970
};

const seal = (body: string): Buffer => createHmac('sha256', appSessionSecret()).update(`${PURPOSE}:${body}`).digest();

export function sealTicket(ticket: UploadTicket): string {
  const body = Buffer.from(JSON.stringify(ticket), 'utf8').toString('base64url');
  return `${body}.${seal(body).toString('base64url')}`;
}

const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const strOrNull = (v: unknown, max: number): v is string | null => v === null || str(v, max);

// The ticket as it was given, or null when it was not given by this server, was changed, or is not one at all.
export function openTicket(raw: unknown): UploadTicket | null {
  if (typeof raw !== 'string' || raw.length > MAX_TICKET) return null;
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, mac] = parts;
  const given = Buffer.from(mac, 'base64url');
  const expected = seal(body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let t: Record<string, unknown>;
  try {
    t = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof t !== 'object' || t === null) return null;
  const ok =
    str(t.schoolId, 64) &&
    str(t.userId, 64) &&
    (t.record === 'staff' || t.record === 'student') &&
    str(t.recordId, 64) &&
    str(t.documentId, 64) &&
    typeof t.newPaper === 'boolean' &&
    strOrNull(t.kind, 64) &&
    strOrNull(t.title, 400) &&
    str(t.fileName, 400) &&
    isRecordFileType(t.mime) &&
    Number.isSafeInteger(t.sizeBytes) &&
    str(t.key, 400) &&
    Number.isSafeInteger(t.expiresAt);
  return ok ? (t as UploadTicket) : null;
}
