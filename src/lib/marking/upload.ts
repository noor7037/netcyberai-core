import { createHash, randomUUID } from 'node:crypto';
import { writeAuditLog } from '@/lib/audit/log';
import { onBubbleSheet } from '@/lib/bubbles/layout';
import { MAX_FILES_PER_UPLOAD, MAX_PAGES_PER_FILE, MAX_PAGES_PER_UPLOAD, PAGE_MAX_BYTES, PAGE_MAX_EDGE, PAGE_MIN_EDGE, UPLOAD_MODES, type PageUploadResult, type UploadKind, type UploadMode } from '@/lib/contracts/marking';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { JobQueue, Sql } from '@/lib/jobs/types';
import type { FileStorage } from '@/lib/storage/file-storage';
import { aiMarkingState, markingPaper, paperRoster, type Actor } from './context';
import { queueReading } from './queue';
import { structureProblems } from './rollup';
import { questionsOf } from './setup';

// A class's answer sheets coming in (C350): an upload is started for a paper, its pages arrive a few at a time as JPEG
// pictures the browser made, and closing it starts the school's marking jobs (./queue.ts, ./pipeline.ts). Everything
// runs in the teacher's own tenant transaction, so the row rules of the migration hold here too: a teacher reaches
// only the papers they may mark, and nothing while the class is published.
//
// A page is checked before anything is kept: a JPEG by its own first bytes (never the type the browser claims), at
// most PAGE_MAX_BYTES, its width and height read from the picture's frame header, between PAGE_MIN_EDGE and
// PAGE_MAX_EDGE. It is stored under the school's folder for the paper before its row is written (the table holds the
// key to exactly that place); a row that cannot be written takes its file away with it. A page whose picture is
// already on the paper (the same SHA-256) is kept as a duplicate and never read; the same page sent twice (a retried
// request) answers with the page already there and keeps nothing new. The school's monthly pages (the plan's limit,
// C347) count every page but duplicates, and a request that would pass the limit keeps nothing.
//
// Bubble sheets (C364) come in the same way, as an upload of kind 'bubble' of a paper sat with a bubble sheet: they are
// read in the teacher's browser by rules, so they need no AI marking and none of their pages counts against its pages
// (./context.ts). Their pages come with their readings through their own route (src/lib/bubbles/server.ts), and closing
// such an upload starts no reading job.

export type StartProblem = 'not_allowed' | 'not_found' | 'closed' | 'not_sent_properly' | 'questions' | 'ai_off' | 'limit';
// child: a page of a by_child upload names no child, a child who is not a candidate of the paper, or another child than
// its file's other pages (or a page of another upload names one).
export type PagesProblem = 'not_allowed' | 'not_found' | 'closed' | 'upload_closed' | 'ai_off' | 'limit' | 'too_many' | 'storage' | 'child';
export type AiOff = { why: 'no_limit' | 'switched_off' | 'no_provider' | null };

// ---- one page picture ----------------------------------------------------------------------------------------------------

// The width and height in a JPEG's frame header (SOF0–SOF15 but the three that are not frames), read marker by marker
// with every length checked; null for anything that is not a JPEG with a frame before its image data.
export function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return null;
    // Any number of fill bytes may come before a marker.
    while (i + 1 < b.length && b[i + 1] === 0xff) i++;
    if (i + 1 >= b.length) return null;
    const marker = b[i + 1];
    i += 2;
    // Markers with no length of their own.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    // The end, or image data, before any frame: not a picture we can size.
    if (marker === 0xd9 || marker === 0xda) return null;
    if (i + 1 >= b.length) return null;
    const length = (b[i] << 8) | b[i + 1];
    if (length < 2 || i + length > b.length) return null;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (length < 8) return null;
      const height = (b[i + 3] << 8) | b[i + 4];
      const width = (b[i + 5] << 8) | b[i + 6];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    i += length;
  }
  return null;
}

// The picture without what a camera adds (review of #318): APP1 to APP13 and APP15 (Exif with GPS and the phone,
// XMP, and the rest) are left out; JFIF (APP0), Adobe's colour marker (APP14) and comments stay, as does everything
// from the image data on. The browser's own pictures carry none of it; a picture sent another way is kept clean too.
// Null when the file is not a JPEG this can walk.
export function stripMetadata(b: Uint8Array): Uint8Array | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) {
      parts.push(b.subarray(i));
      const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let at = 0;
      for (const p of parts) {
        out.set(p, at);
        at += p.length;
      }
      return out;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 3 >= b.length) return null;
    const length = (b[i + 2] << 8) | b[i + 3];
    if (length < 2 || i + 2 + length > b.length) return null;
    const metadata = (marker >= 0xe1 && marker <= 0xed) || marker === 0xef;
    if (!metadata) parts.push(b.subarray(i, i + 2 + length));
    i += 2 + length;
  }
  return null;
}

// childId: the child the teacher chose for the page's file while scanning (a by_child upload only).
export type PagePart = { fileNo: number; pageNo: number; bytes: Uint8Array; childId?: string | null };
export type CheckedPage = PagePart & { width: number; height: number; sha256: string };
export type PageProblem = 'not_a_page' | 'too_large' | 'too_small';

export function checkPage(part: PagePart): { ok: true; page: CheckedPage } | { ok: false; reason: PageProblem } {
  if (part.bytes.length === 0) return { ok: false, reason: 'not_a_page' };
  if (part.bytes.length > PAGE_MAX_BYTES) return { ok: false, reason: 'too_large' };
  const bytes = stripMetadata(part.bytes);
  if (!bytes) return { ok: false, reason: 'not_a_page' };
  const size = jpegSize(bytes);
  if (!size) return { ok: false, reason: 'not_a_page' };
  if (size.width > PAGE_MAX_EDGE || size.height > PAGE_MAX_EDGE) return { ok: false, reason: 'too_large' };
  if (size.width < PAGE_MIN_EDGE || size.height < PAGE_MIN_EDGE) return { ok: false, reason: 'too_small' };
  return { ok: true, page: { ...part, bytes, ...size, sha256: createHash('sha256').update(bytes).digest('hex') } };
}

export const isFileNo = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_FILES_PER_UPLOAD;
export const isPageNo = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_PAGES_PER_FILE;

// Where a page picture is kept: the school's folder for the paper (the table's check holds exactly this key).
export const pageKey = (schoolId: string, paperId: string, pageId: string) => `${schoolId}/marking/${paperId}/${pageId}.jpg`;

// ---- starting an upload ----------------------------------------------------------------------------------------------------

export async function startUpload(db: Sql, actor: Actor, paperId: string, raw: unknown): Promise<{ ok: true; uploadId: string } | ({ ok: false; reason: StartProblem } & Partial<AiOff>)> {
  const r = await begin(db, actor, paperId, raw, 'scripts');
  // Answer books for a paper whose every question is on its bubble sheet (C364): there is nothing in them to mark. The
  // screens never offer it; a request that tries is not this person's to make.
  if (r.ok) return r;
  return r.reason === 'not_bubble' ? { ok: false, reason: 'not_allowed' } : { ...r, reason: r.reason };
}

// An upload of bubble sheets (C364), for a paper sat with a bubble sheet: no AI marking is needed for it, and its pages
// count against no AI pages. Its pages come with their readings (src/lib/bubbles/server.ts).
export async function startBubbleUpload(db: Sql, actor: Actor, paperId: string, raw: unknown): Promise<{ ok: true; uploadId: string } | ({ ok: false; reason: StartProblem | 'not_bubble' } & Partial<AiOff>)> {
  return begin(db, actor, paperId, raw, 'bubble');
}

async function begin(db: Sql, actor: Actor, paperId: string, raw: unknown, kind: UploadKind): Promise<{ ok: true; uploadId: string } | ({ ok: false; reason: StartProblem | 'not_bubble' } & Partial<AiOff>)> {
  const body = (typeof raw === 'object' && raw !== null ? raw : {}) as { mode?: unknown; files?: unknown; kind?: unknown };
  if (!(UPLOAD_MODES as readonly unknown[]).includes(body.mode) || !isFileNo(body.files) || (body.kind !== undefined && body.kind !== kind)) return { ok: false, reason: 'not_sent_properly' };
  // Bubble sheets name their child by their own printed number: never scanned child by child.
  if (kind === 'bubble' && body.mode === 'by_child') return { ok: false, reason: 'not_sent_properly' };
  const paper = await markingPaper(db, actor, paperId);
  if (!paper) return { ok: false, reason: 'not_found' };
  if (paper.published) return { ok: false, reason: 'closed' };
  if (!paper.mayMark) return { ok: false, reason: 'not_allowed' };
  const counts = ((await db.query(`select choice_counts from marking_setups where school_id = $1 and paper_id = $2`, [actor.schoolId, paperId])).rows[0]?.choice_counts ?? {}) as Record<string, number>;
  const questions = await questionsOf(db, actor.schoolId, paperId);
  if (structureProblems(paper.components, questions, counts).length) return { ok: false, reason: 'questions' };
  const sitting = (await db.query(`select sitting from exam_papers where school_id = $1 and paper_id = $2`, [actor.schoolId, paperId])).rows[0]?.sitting;
  if (kind === 'bubble') {
    if (sitting !== 'bubble') return { ok: false, reason: 'not_bubble' };
  } else {
    if (sitting === 'bubble' && questions.every(onBubbleSheet)) return { ok: false, reason: 'not_bubble' };
    const ai = await aiMarkingState(db, actor.schoolId);
    if (!ai.on) return { ok: false, reason: 'ai_off', why: ai.why };
    if (ai.limit !== null && ai.pagesThisMonth >= ai.limit) return { ok: false, reason: 'limit' };
  }
  const uploadId = (
    await db.query(`insert into marking_uploads (school_id, paper_id, mode, kind, created_by) values ($1, $2, $3, $4, $5) returning upload_id`, [actor.schoolId, paperId, body.mode as UploadMode, kind, actor.userId])
  ).rows[0].upload_id as string;
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'marking.upload_started', targetType: 'marking_uploads', targetId: uploadId, afterState: { paper_id: paperId, mode: body.mode, kind, files: body.files } });
  return { ok: true, uploadId };
}

// ---- an upload as the person may change it -------------------------------------------------------------------------------

type OpenUpload = { uploadId: string; paperId: string; closed: boolean; mode: UploadMode; kind: UploadKind; createdBy: string };

// The upload read under the person's own row rules, then its paper: not found, published or not theirs to mark says
// why; locked only once it is theirs to change (a row the update rules refuse cannot be locked).
async function loadUpload(db: Sql, actor: Actor, uploadId: string): Promise<{ ok: true; upload: OpenUpload } | { ok: false; reason: 'not_found' | 'closed' | 'not_allowed' }> {
  if (!isUuid(uploadId)) return { ok: false, reason: 'not_found' };
  const read = async (lock: boolean) =>
    (await db.query(`select upload_id, paper_id, mode, kind, created_by, closed_at from marking_uploads where school_id = $1 and upload_id = $2${lock ? ' for update' : ''}`, [actor.schoolId, uploadId])).rows[0];
  const row = await read(false);
  if (!row) return { ok: false, reason: 'not_found' };
  const paper = await markingPaper(db, actor, row.paper_id as string);
  if (!paper) return { ok: false, reason: 'not_found' };
  if (paper.published) return { ok: false, reason: 'closed' };
  if (!paper.mayMark) return { ok: false, reason: 'not_allowed' };
  const locked = await read(true);
  if (!locked) return { ok: false, reason: 'closed' };
  return { ok: true, upload: { uploadId, paperId: locked.paper_id as string, closed: locked.closed_at !== null, mode: locked.mode as UploadMode, kind: (locked.kind ?? 'scripts') as UploadKind, createdBy: locked.created_by as string } };
}

// ---- pages ------------------------------------------------------------------------------------------------------------------

// The children the pages name (C230-AJ), before anything is kept: on a by_child upload every page names a candidate of
// the paper, and every page of one file the same child as the file's pages already kept; on any other upload none
// names one. The database holds the same (marking_pages_claim), so a page sent any other way cannot pass either.
async function claimsHold(db: Sql, actor: Actor, upload: OpenUpload, pages: readonly CheckedPage[]): Promise<boolean> {
  if (upload.mode !== 'by_child') return pages.every((p) => !p.childId);
  if (!pages.every((p) => typeof p.childId === 'string' && isUuid(p.childId))) return false;
  const paper = await markingPaper(db, actor, upload.paperId);
  if (!paper) return false;
  const candidates = new Set((await paperRoster(db, actor.schoolId, paper)).map((c) => c.studentId));
  if (!pages.every((p) => candidates.has(p.childId as string))) return false;
  const fileChild = new Map<number, string>(
    (
      await db.query(`select distinct file_no, claimed_student_id from marking_pages where school_id = $1 and upload_id = $2 and file_no = any($3::int[])`, [
        actor.schoolId,
        upload.uploadId,
        [...new Set(pages.map((p) => p.fileNo))],
      ])
    ).rows.map((r) => [Number(r.file_no), r.claimed_student_id as string])
  );
  for (const p of pages) {
    const was = fileChild.get(p.fileNo);
    if (was !== undefined && was !== p.childId) return false;
    fileChild.set(p.fileNo, p.childId as string);
  }
  return true;
}

// `bubble`: the pages come with their readings through the bubble sheets' own route (src/lib/bubbles/server.ts). A bubble
// upload takes pages only that way, and a scripts upload never: an unread bubble page would wait for a reading forever.
export async function addPages(db: Sql, actor: Actor, storage: Pick<FileStorage, 'put' | 'remove'>, uploadId: string, pages: readonly CheckedPage[], opts: { bubble?: boolean } = {}): Promise<{ ok: true; pages: PageUploadResult['pages'] } | ({ ok: false; reason: PagesProblem } & Partial<AiOff>)> {
  const loaded = await loadUpload(db, actor, uploadId);
  if (!loaded.ok) return loaded;
  const { upload } = loaded;
  if ((upload.kind === 'bubble') !== (opts.bubble === true)) return { ok: false, reason: 'not_found' };
  if (upload.closed) return { ok: false, reason: 'upload_closed' };
  // A phone scan's pages come from the person who started it, and no one else (its outbox is theirs: a page left on a
  // shared phone is never sent under another person's session).
  if (upload.mode === 'by_child' && upload.createdBy !== actor.userId) return { ok: false, reason: 'not_allowed' };
  if (!(await claimsHold(db, actor, upload, pages))) return { ok: false, reason: 'child' };

  // The same page sent again (a retried request): the page already there answers, and nothing new is kept.
  const there = new Map(
    (
      await db.query(
        `select file_no, page_no, page_id, state from marking_pages
          where school_id = $1 and upload_id = $2 and (file_no, page_no) in (select * from unnest($3::int[], $4::int[]))`,
        [actor.schoolId, uploadId, pages.map((p) => p.fileNo), pages.map((p) => p.pageNo)]
      )
    ).rows.map((r) => [`${r.file_no}:${r.page_no}`, { pageId: r.page_id as string, duplicate: r.state === 'duplicate' }])
  );
  const fresh = pages.filter((p) => !there.has(`${p.fileNo}:${p.pageNo}`));
  const made = new Map<string, { pageId: string; duplicate: boolean }>();
  if (fresh.length) {
    // One school's pages are counted and compared one request at a time, so two at once can neither pass the month's
    // limit together nor keep the same picture twice (review of #318).
    await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`marking-pages:${actor.schoolId}`]);
    // Bubble pages are read by rules: no AI marking is needed, and none counts against its month's pages (C364).
    const ai = upload.kind === 'bubble' ? { on: true, why: null, pagesThisMonth: 0, limit: null } : await aiMarkingState(db, actor.schoolId);
    if (!ai.on) return { ok: false, reason: 'ai_off', why: ai.why };
    const inUpload = Number((await db.query(`select count(*)::int as n from marking_pages where school_id = $1 and upload_id = $2`, [actor.schoolId, uploadId])).rows[0]?.n ?? 0);
    if (inUpload + fresh.length > MAX_PAGES_PER_UPLOAD) return { ok: false, reason: 'too_many' };
    // A picture already on the paper, or twice in this request, is a duplicate: kept, never read, never counted.
    const seen = new Set(
      (
        await db.query(`select distinct sha256 from marking_pages where school_id = $1 and paper_id = $2 and sha256 = any($3::text[])`, [actor.schoolId, upload.paperId, fresh.map((p) => p.sha256)])
      ).rows.map((r) => r.sha256 as string)
    );
    const planned = fresh.map((p) => {
      const duplicate = seen.has(p.sha256);
      seen.add(p.sha256);
      return { page: p, pageId: randomUUID(), duplicate };
    });
    const counted = planned.filter((p) => !p.duplicate).length;
    if (ai.limit !== null && ai.pagesThisMonth + counted > ai.limit) return { ok: false, reason: 'limit' };

    const stored: string[] = [];
    const removeStored = async () => {
      for (const key of stored) await storage.remove(key).catch(() => undefined);
    };
    for (const p of planned) {
      const key = pageKey(actor.schoolId, upload.paperId, p.pageId);
      try {
        await storage.put(key, p.page.bytes, 'image/jpeg');
      } catch {
        await removeStored();
        return { ok: false, reason: 'storage' };
      }
      stored.push(key);
    }
    try {
      for (const p of planned) {
        await db.query(
          `insert into marking_pages (school_id, page_id, upload_id, paper_id, file_no, page_no, storage_key, sha256, bytes, width, height, state, claimed_student_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [actor.schoolId, p.pageId, uploadId, upload.paperId, p.page.fileNo, p.page.pageNo, pageKey(actor.schoolId, upload.paperId, p.pageId), p.page.sha256, p.page.bytes.length, p.page.width, p.page.height, p.duplicate ? 'duplicate' : 'new', upload.mode === 'by_child' ? p.page.childId : null]
        );
        made.set(`${p.page.fileNo}:${p.page.pageNo}`, { pageId: p.pageId, duplicate: p.duplicate });
      }
    } catch (err) {
      // The transaction is lost: the files kept for it go with it.
      await removeStored();
      throw err;
    }
  }
  return {
    ok: true,
    pages: pages.map((p) => {
      const key = `${p.fileNo}:${p.pageNo}`;
      const page = (there.get(key) ?? made.get(key)) as { pageId: string; duplicate: boolean };
      return { fileNo: p.fileNo, pageNo: p.pageNo, pageId: page.pageId, duplicate: page.duplicate };
    }),
  };
}

// ---- closing an upload ------------------------------------------------------------------------------------------------------

// No more pages: the upload is closed and its pages are queued for reading (./queue.ts). Closing again queues nothing
// new. While the school cannot use AI marking it stays open, so it can be closed once AI marking is on.
export async function closeUpload(db: Sql, actor: Actor, queue: JobQueue, uploadId: string): Promise<{ ok: true; runs: number } | ({ ok: false; reason: 'not_allowed' | 'not_found' | 'closed' | 'ai_off' } & Partial<AiOff>)> {
  const loaded = await loadUpload(db, actor, uploadId);
  if (!loaded.ok) return loaded;
  // A bubble upload's pages were read as they came (C364): closing it says only that no more are coming. No AI, no job.
  const bubble = loaded.upload.kind === 'bubble';
  if (!bubble) {
    const ai = await aiMarkingState(db, actor.schoolId);
    if (!ai.on) return { ok: false, reason: 'ai_off', why: ai.why };
  }
  if (!loaded.upload.closed) {
    await db.query(`update marking_uploads set closed_at = now() where school_id = $1 and upload_id = $2 and closed_at is null`, [actor.schoolId, uploadId]);
    const pages = Number((await db.query(`select count(*)::int as n from marking_pages where school_id = $1 and upload_id = $2`, [actor.schoolId, uploadId])).rows[0]?.n ?? 0);
    await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'marking.upload_closed', targetType: 'marking_uploads', targetId: uploadId, afterState: { paper_id: loaded.upload.paperId, pages, ...(bubble ? { kind: 'bubble' } : {}) } });
  }
  if (bubble) return { ok: true, runs: 0 };
  // Closed more than ten minutes ago with pages still unread: their reading stopped (for example while AI marking was
  // off), so only those go again. A second press soon after closing queues nothing more.
  const stuck = loaded.upload.closed && (await db.query(`select closed_at < now() - interval '10 minutes' as old from marking_uploads where school_id = $1 and upload_id = $2`, [actor.schoolId, uploadId])).rows[0]?.old === true;
  const { runs } = await queueReading(db, queue, actor.schoolId, uploadId, { again: stuck });
  return { ok: true, runs };
}
