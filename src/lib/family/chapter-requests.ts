import { type ChapterRequest, type RequestStatus, type SourceMode } from './chapter-request-types';
import { guarded } from './chapter-store';
import { cleanTitle } from './child-syllabus';
import { syllabusBoardOf } from './children';
import type { FileStorage } from '@/lib/storage/file-storage';

// The missing-chapter queue, the family's side (S3, C376): a parent asks for a chapter the catalog does not have, with
// the book's chapter as a PDF (kept private, seen only by the NetCyberAI reviewer, removed when the request is ready or
// declined) or by its name alone. The request is Received; the content studio moves it to Digitizing and then Ready
// (shown to the family as Published). A parent may withdraw a request while it is still Received. Also the per-student
// assignment mode: which source a child's subject reads. Parent mode only (the routes use requireParent).

export { SOURCE_MODES, queueStatusOf, requestStudyStatus, sourceShown, type ChapterRequest, type RequestStatus, type SourceMode } from './chapter-request-types';

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

export const REQUEST_PDF_MAX_BYTES = 3 * 1024 * 1024;
export const MAX_OPEN_REQUESTS = 12; // per account

export const isPdf = (bytes: Uint8Array) => bytes.length > 8 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;

const COLUMNS = `request_id, child_id, subject, title, source, status, decline_reason, created_at`;
const toRequest = (r: Record<string, unknown>): ChapterRequest => ({
  requestId: String(r.request_id),
  childId: String(r.child_id),
  subject: String(r.subject),
  title: String(r.title),
  source: r.source as ChapterRequest['source'],
  status: r.status as RequestStatus,
  declineReason: (r.decline_reason as string | null) ?? null,
  createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
});

export function listRequests(db: Db, accountId: string, childId?: string): Promise<ChapterRequest[]> {
  return guarded(
    db,
    'chapter_requests',
    async () =>
      (
        await db.query(
          `select ${COLUMNS} from content.chapter_requests where account_id = $1 ${childId ? 'and child_id = $2' : ''} order by created_at desc limit 60`,
          childId ? [accountId, childId] : [accountId]
        )
      ).rows.map((r) => toRequest(r as Record<string, unknown>)),
    []
  );
}

export type RequestResult = { ok: true; request: ChapterRequest } | { ok: false; reason: 'bad_request' | 'not_found' | 'duplicate' | 'too_many' | 'not_ready' | 'storage_unavailable' };

// Adds a request for the child's subject. `pdf` (checked by the route: a real PDF, in the size limit, no Aadhaar number)
// is stored privately first; if the row is then refused, the file is removed again.
export async function createRequest(
  db: Db,
  storage: FileStorage,
  accountId: string,
  a: { childId: string; subject: string; title: unknown; pdf: Uint8Array | null }
): Promise<RequestResult> {
  const title = cleanTitle(a.title);
  if (!title) return { ok: false, reason: 'bad_request' };
  const child = (await db.query(`select board_id, class_level, state_code from family.children where account_id = $1 and child_id = $2`, [accountId, a.childId])).rows[0] as { board_id: string; class_level: number; state_code: string } | undefined;
  if (!child || child.class_level < 1) return { ok: false, reason: 'not_found' };
  const outcome = await guarded<RequestResult>(
    db,
    'chapter_request_add',
    async () => {
      const open = (await db.query(`select count(*)::int as n from content.chapter_requests where account_id = $1 and status in ('received', 'digitizing')`, [accountId])).rows[0] as { n: number };
      if (open.n >= MAX_OPEN_REQUESTS) return { ok: false, reason: 'too_many' };
      const same = await db.query(`select 1 from content.chapter_requests where child_id = $1 and subject = $2 and lower(title) = lower($3) and status in ('received', 'digitizing')`, [a.childId, a.subject, title]);
      if (same.rows.length) return { ok: false, reason: 'duplicate' };
      const requestId = globalThis.crypto.randomUUID();
      const key = a.pdf ? `family/${accountId}/chapter-requests/${requestId}.pdf` : null;
      if (key && a.pdf) {
        try {
          await storage.put(key, a.pdf, 'application/pdf');
        } catch {
          return { ok: false, reason: 'storage_unavailable' };
        }
      }
      await db.query('savepoint chapter_request_row');
      try {
        const { rows } = await db.query(
          `insert into content.chapter_requests (request_id, account_id, child_id, board_id, class_level, subject, title, source, upload_key)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning ${COLUMNS}`,
          [requestId, accountId, a.childId, syllabusBoardOf({ board: child.board_id, stateCode: child.state_code }), child.class_level, a.subject, title, key ? 'parent_upload' : 'catalog', key]
        );
        await db.query('release savepoint chapter_request_row');
        return { ok: true, request: toRequest(rows[0] as Record<string, unknown>) };
      } catch (err) {
        await db.query('rollback to savepoint chapter_request_row');
        if (key) await storage.remove(key).catch(() => undefined);
        if ((err as { code?: string }).code === '23505') return { ok: false, reason: 'duplicate' };
        throw err;
      }
    },
    { ok: false, reason: 'not_ready' }
  );
  return outcome;
}

// Withdraws a request that is still Received (and its stored file). true when one was removed.
export async function cancelRequest(db: Db, storage: FileStorage, accountId: string, requestId: string): Promise<boolean> {
  const gone = await guarded<{ upload_key: string | null } | null>(
    db,
    'chapter_request_cancel',
    async () => ((await db.query(`delete from content.chapter_requests where request_id = $1 and account_id = $2 and status = 'received' returning upload_key`, [requestId, accountId])).rows[0] as { upload_key: string | null } | undefined) ?? null,
    null
  );
  if (!gone) return false;
  if (gone.upload_key) await storage.remove(gone.upload_key).catch(() => undefined);
  return true;
}

// ---- the per-student assignment mode ----------------------------------------------------------------------------

// Which source a child's subject reads: none set means every source the child has is shown, as before.
export function readSourceModes(db: Db, accountId: string, childId: string): Promise<Record<string, SourceMode>> {
  return guarded(
    db,
    'child_subject_source',
    async () => {
      const { rows } = await db.query(`select subject, mode from family.child_subject_source where account_id = $1 and child_id = $2`, [accountId, childId]);
      return Object.fromEntries((rows as { subject: string; mode: SourceMode }[]).map((r) => [r.subject, r.mode]));
    },
    {}
  );
}

// mode null clears the choice. false when the child is not this account's, or the table is not there yet.
export async function setSourceMode(db: Db, accountId: string, childId: string, subject: string, mode: SourceMode | null): Promise<boolean> {
  if (!(await db.query(`select 1 from family.children where account_id = $1 and child_id = $2`, [accountId, childId])).rows.length) return false;
  return guarded(
    db,
    'child_subject_source_set',
    async () => {
      if (mode === null) await db.query(`delete from family.child_subject_source where account_id = $1 and child_id = $2 and subject = $3`, [accountId, childId, subject]);
      else
        await db.query(
          `insert into family.child_subject_source (account_id, child_id, subject, mode) values ($1, $2, $3, $4)
           on conflict (child_id, subject) do update set mode = excluded.mode, updated_at = now() where family.child_subject_source.account_id = excluded.account_id`,
          [accountId, childId, subject, mode]
        );
      return true;
    },
    false
  );
}

