import { writeAuditLog } from '@/lib/audit/log';
import { checkBlock, type Block } from '@/lib/family/blocks';
import { chapterProblem, CHAPTER_KEY, droppedIds, stabilizeIds, type Chapter, type ChapterLang } from '@/lib/family/chapters';
import type { Sql } from '@/lib/jobs/types';

// Control → Content → Studio (S3, C376; docs/37 §3 decisions 7 and 9). Chapters as database content in the one block
// schema. A person on the NetCyberAI staff:
//   - takes a request from the queue (Received -> Digitizing), which opens a draft to type or correct;
//   - saves the draft (every block is checked; ids are kept from the version before; the draft may be unfinished);
//   - marks it reviewed (the whole chapter must pass the checker in both languages), then publishes it. Nothing
//     publishes itself: the database refuses a jump from draft to published (content.chapter_contents_guard), and a
//     published version never changes. A new version is a copy that keeps the chapter key and the block ids, so a child's
//     saved place (family.chapter_reading) survives; publishing retires the one before in the same transaction.
// No textbook prose is made here: the words are the reviewer's own, from the parent's upload or from NetCyberAI's
// authoring. Digitizing with an AI adapter is not built: no adapter reads a book PDF honestly today. Run as the platform
// role in the request's own transaction, so each change and its audit row are written together; the audit holds ids
// and codes only. This file reads no family table: a request carries the class and board, never a name.

export type StudioActor = { userId: string };
export type StudioRequest = {
  requestId: string;
  board: string;
  classLevel: number;
  subject: string;
  title: string;
  source: 'parent_upload' | 'catalog';
  hasUpload: boolean;
  status: 'received' | 'digitizing' | 'ready' | 'declined';
  chapterKey: string | null;
  createdAt: string;
};
export type StudioVersionRow = { chapterKey: string; versionNo: number; status: 'draft' | 'reviewed' | 'published' | 'retired'; subject: string; titleEn: string; source: string; owned: boolean; updatedAt: string };
export type StudioVersion = StudioVersionRow & {
  titleHi: string;
  boardId: string | null;
  classLevel: number | null;
  blocks: Record<ChapterLang, unknown[]>;
  note: string | null;
  requestId: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  // The previous version's ids this one no longer has (readers who stopped there resume at the start).
  droppedIds: string[];
};
export type StudioOverview = { requests: StudioRequest[]; chapters: StudioVersionRow[] };
export type StudioReason = 'not_found' | 'bad_request' | 'wrong_state' | 'open_version' | 'exists' | 'not_ready' | `problem:${string}`;
export type StudioChange<T = object> = ({ ok: true } & T) | { ok: false; reason: StudioReason };

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECT = /^[a-z][a-z_]{1,39}$/;
const audit = (actor: StudioActor, action: string, id: string, after: unknown) => ({ schoolId: null, actorUserId: actor.userId, actorRole: 'super_admin' as const, eventAction: action, targetType: 'chapter_version', targetId: id, afterState: after });
const keyOfRequest = (requestId: string) => `nc.req.${requestId}`;

type Row = Record<string, unknown>;
const rowOf = (r: Row): StudioVersionRow => ({
  chapterKey: String(r.chapter_key),
  versionNo: Number(r.version_no),
  status: r.status as StudioVersionRow['status'],
  subject: String(r.subject),
  titleEn: String(r.title_en),
  source: String(r.source),
  owned: r.owner_account_id !== null && r.owner_account_id !== undefined,
  updatedAt: iso(r.updated_at),
});

export async function studioOverview(db: Sql): Promise<StudioOverview> {
  const requests = (
    await db.query(
      `select request_id, board_id, class_level, subject, title, source, (upload_key is not null) as has_upload, status, chapter_key, created_at
         from content.chapter_requests
        order by (status in ('received', 'digitizing')) desc, created_at desc limit 100`
    )
  ).rows as Row[];
  const chapters = (
    await db.query(
      `select chapter_key, version_no, status, subject, title_en, source, owner_account_id, updated_at
         from content.chapter_contents order by chapter_key, version_no desc limit 400`
    )
  ).rows as Row[];
  return {
    requests: requests.map((r) => ({
      requestId: String(r.request_id),
      board: String(r.board_id),
      classLevel: Number(r.class_level),
      subject: String(r.subject),
      title: String(r.title),
      source: r.source as StudioRequest['source'],
      hasUpload: r.has_upload === true,
      status: r.status as StudioRequest['status'],
      chapterKey: (r.chapter_key as string | null) ?? null,
      createdAt: iso(r.created_at),
    })),
    chapters: chapters.map(rowOf),
  };
}

const asBlocks = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export async function readVersion(db: Sql, key: string, versionNo: number): Promise<StudioVersion | null> {
  const r = (await db.query(`select * from content.chapter_contents where chapter_key = $1 and version_no = $2`, [key, versionNo])).rows[0] as Row | undefined;
  if (!r) return null;
  const blocks = (r.blocks ?? {}) as Record<string, unknown>;
  const before = (await db.query(`select blocks from content.chapter_contents where chapter_key = $1 and version_no < $2 order by version_no desc limit 1`, [key, versionNo])).rows[0] as { blocks: Record<string, unknown> } | undefined;
  const dropped = new Set<string>();
  if (before) {
    for (const l of ['en', 'hi'] as const) {
      const prev = asBlocks(before.blocks?.[l]).map(checkBlock).filter((b): b is Block => b !== null);
      const next = asBlocks(blocks[l]).map(checkBlock).filter((b): b is Block => b !== null);
      droppedIds(prev, next).forEach((id) => dropped.add(id));
    }
  }
  return {
    ...rowOf(r),
    titleHi: String(r.title_hi),
    boardId: (r.board_id as string | null) ?? null,
    classLevel: r.class_level === null ? null : Number(r.class_level),
    blocks: { en: asBlocks(blocks.en), hi: asBlocks(blocks.hi) },
    note: (r.note as string | null) ?? null,
    requestId: (r.request_id as string | null) ?? null,
    reviewedAt: r.reviewed_at ? iso(r.reviewed_at) : null,
    publishedAt: r.published_at ? iso(r.published_at) : null,
    droppedIds: [...dropped],
  };
}

// The chapter as the family reader would get it, for the preview: only a version that passes the checker.
export function previewOf(v: StudioVersion): { ok: true; chapter: Chapter } | { ok: false; problem: string } {
  const r = chapterProblem({ key: v.chapterKey, subject: v.subject, title: { en: v.titleEn, hi: v.titleHi }, blocks: v.blocks });
  return r.ok ? r : { ok: false, problem: r.problem };
}

// A new chapter, empty, as version 1 (a draft). The key is NetCyberAI's own: nc.<something>.
export async function createChapter(db: Sql, actor: StudioActor, a: { key: unknown; subject: unknown; title: unknown; board?: unknown; classLevel?: unknown }): Promise<StudioChange<{ chapterKey: string; versionNo: number }>> {
  if (typeof a.key !== 'string' || !CHAPTER_KEY.test(a.key) || typeof a.subject !== 'string' || !SUBJECT.test(a.subject)) return { ok: false, reason: 'bad_request' };
  if (typeof a.title !== 'string' || a.title.trim().length < 1 || a.title.length > 120) return { ok: false, reason: 'bad_request' };
  const board = typeof a.board === 'string' && /^[A-Z][A-Z0-9-]{1,15}$/.test(a.board) ? a.board : null;
  const cls = typeof a.classLevel === 'number' && Number.isInteger(a.classLevel) && a.classLevel >= 1 && a.classLevel <= 12 ? a.classLevel : null;
  const have = await db.query(`select 1 from content.chapter_contents where chapter_key = $1`, [a.key]);
  if (have.rows.length) return { ok: false, reason: 'exists' };
  const title = a.title.trim();
  await db.query(
    `insert into content.chapter_contents (chapter_key, version_no, subject, board_id, class_level, title_en, title_hi, blocks, source, created_by)
     values ($1, 1, $2, $3, $4, $5, $5, '{"en":[],"hi":[]}'::jsonb, 'studio', $6)`,
    [a.key, a.subject, board, cls, title, actor.userId]
  );
  await writeAuditLog(db, audit(actor, 'content.chapter.created', `${a.key}@1`, { subject: a.subject, source: 'studio' }));
  return { ok: true, chapterKey: a.key, versionNo: 1 };
}

// Received -> Digitizing: opens version 1 of a chapter for the request, owned by the requesting account and child.
export async function claimRequest(db: Sql, actor: StudioActor, requestId: unknown): Promise<StudioChange<{ chapterKey: string; versionNo: number }>> {
  if (typeof requestId !== 'string' || !UUID.test(requestId)) return { ok: false, reason: 'bad_request' };
  const r = (await db.query(`select * from content.chapter_requests where request_id = $1 for update`, [requestId])).rows[0] as Row | undefined;
  if (!r) return { ok: false, reason: 'not_found' };
  if (r.status !== 'received') return { ok: false, reason: 'wrong_state' };
  const key = keyOfRequest(requestId);
  await db.query(`update content.chapter_requests set status = 'digitizing', chapter_key = $2, claimed_by = $3, updated_at = now() where request_id = $1`, [requestId, key, actor.userId]);
  const title = String(r.title).slice(0, 120);
  await db.query(
    `insert into content.chapter_contents (chapter_key, version_no, subject, board_id, class_level, title_en, title_hi, blocks, source, request_id, owner_account_id, child_id, created_by)
     values ($1, 1, $2, $3, $4, $5, $5, '{"en":[],"hi":[]}'::jsonb, $6, $7, $8, $9, $10)`,
    [key, r.subject, r.board_id, r.class_level, title, r.source === 'catalog' ? 'catalog' : 'parent_upload', requestId, r.account_id, r.child_id, actor.userId]
  );
  await writeAuditLog(db, audit(actor, 'content.request.claimed', requestId, { chapterKey: key, source: r.source }));
  return { ok: true, chapterKey: key, versionNo: 1 };
}

// Declined: the family's request ends here with a reason it is shown. Returns the stored upload to remove.
export async function declineRequest(db: Sql, actor: StudioActor, requestId: unknown, reason: unknown): Promise<StudioChange<{ uploadKey: string | null }>> {
  if (typeof requestId !== 'string' || !UUID.test(requestId) || typeof reason !== 'string' || reason.trim().length < 1 || reason.length > 300) return { ok: false, reason: 'bad_request' };
  const r = (await db.query(`select status, upload_key from content.chapter_requests where request_id = $1 for update`, [requestId])).rows[0] as { status: string; upload_key: string | null } | undefined;
  if (!r) return { ok: false, reason: 'not_found' };
  if (r.status !== 'received' && r.status !== 'digitizing') return { ok: false, reason: 'wrong_state' };
  await db.query(`update content.chapter_requests set status = 'declined', decline_reason = $2, upload_key = null, updated_at = now() where request_id = $1`, [requestId, reason.trim()]);
  await writeAuditLog(db, audit(actor, 'content.request.declined', requestId, { from: r.status }));
  return { ok: true, uploadKey: r.upload_key };
}

// What a reviewer typed: a list of blocks per language, each checked. An unfinished list (empty) is fine in a draft.
export function checkedBlocks(raw: unknown): { ok: true; blocks: Block[] } | { ok: false; at: number } {
  const list = asBlocks(raw);
  if (list.length > 40) return { ok: false, at: 41 };
  const out: Block[] = [];
  for (let i = 0; i < list.length; i++) {
    const b = checkBlock(list[i]);
    if (!b) return { ok: false, at: i + 1 };
    out.push(b);
  }
  return { ok: true, blocks: out };
}

export async function saveDraft(
  db: Sql,
  actor: StudioActor,
  a: { key: unknown; version: unknown; titleEn: unknown; titleHi: unknown; blocks: unknown; note?: unknown }
): Promise<StudioChange> {
  if (typeof a.key !== 'string' || !CHAPTER_KEY.test(a.key) || typeof a.version !== 'number' || !Number.isInteger(a.version) || a.version < 1) return { ok: false, reason: 'bad_request' };
  if (typeof a.titleEn !== 'string' || typeof a.titleHi !== 'string') return { ok: false, reason: 'bad_request' };
  const titleEn = a.titleEn.trim();
  const titleHi = a.titleHi.trim();
  if (titleEn.length < 1 || titleEn.length > 120 || titleHi.length < 1 || titleHi.length > 120) return { ok: false, reason: 'bad_request' };
  const note = typeof a.note === 'string' && a.note.trim() ? a.note.trim().slice(0, 500) : null;
  const sent = (a.blocks ?? {}) as Record<string, unknown>;
  const row = (await db.query(`select status from content.chapter_contents where chapter_key = $1 and version_no = $2 for update`, [a.key, a.version])).rows[0] as { status: string } | undefined;
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status !== 'draft' && row.status !== 'reviewed') return { ok: false, reason: 'wrong_state' };
  const before = (await db.query(`select blocks from content.chapter_contents where chapter_key = $1 and version_no < $2 order by version_no desc limit 1`, [a.key, a.version])).rows[0] as { blocks: Record<string, unknown> } | undefined;
  const kept: Record<ChapterLang, Block[]> = { en: [], hi: [] };
  for (const l of ['en', 'hi'] as const) {
    const c = checkedBlocks(sent[l]);
    if (!c.ok) return { ok: false, reason: `problem:block_${l}:${c.at}` };
    const prev = asBlocks(before?.blocks?.[l]).map(checkBlock).filter((b): b is Block => b !== null);
    kept[l] = stabilizeIds(prev, c.blocks);
  }
  await db.query(
    `update content.chapter_contents set title_en = $3, title_hi = $4, blocks = $5::jsonb, note = $6, status = 'draft', reviewed_by = null, reviewed_at = null
      where chapter_key = $1 and version_no = $2`,
    [a.key, a.version, titleEn, titleHi, JSON.stringify(kept), note]
  );
  await writeAuditLog(db, audit(actor, 'content.chapter.saved', `${a.key}@${a.version}`, { blocksEn: kept.en.length, blocksHi: kept.hi.length }));
  return { ok: true };
}

// A copy of the newest version as the next draft: same key, same block ids. One open version at a time.
export async function newVersion(db: Sql, actor: StudioActor, key: unknown): Promise<StudioChange<{ versionNo: number }>> {
  if (typeof key !== 'string' || !CHAPTER_KEY.test(key)) return { ok: false, reason: 'bad_request' };
  const rows = (await db.query(`select * from content.chapter_contents where chapter_key = $1 order by version_no desc for update`, [key])).rows as Row[];
  if (!rows.length) return { ok: false, reason: 'not_found' };
  if (rows.some((r) => r.status === 'draft' || r.status === 'reviewed')) return { ok: false, reason: 'open_version' };
  const last = rows[0];
  const next = Number(last.version_no) + 1;
  await db.query(
    `insert into content.chapter_contents (chapter_key, version_no, subject, board_id, class_level, title_en, title_hi, blocks, source, request_id, owner_account_id, child_id, created_by)
     select chapter_key, $2, subject, board_id, class_level, title_en, title_hi, blocks, source, request_id, owner_account_id, child_id, $3
       from content.chapter_contents where chapter_key = $1 and version_no = $4`,
    [key, next, actor.userId, last.version_no]
  );
  await writeAuditLog(db, audit(actor, 'content.chapter.new_version', `${key}@${next}`, { from: Number(last.version_no) }));
  return { ok: true, versionNo: next };
}

export async function markReviewed(db: Sql, actor: StudioActor, key: unknown, version: unknown): Promise<StudioChange> {
  if (typeof key !== 'string' || !CHAPTER_KEY.test(key) || typeof version !== 'number' || !Number.isInteger(version)) return { ok: false, reason: 'bad_request' };
  const v = await readVersion(db, key, version);
  if (!v) return { ok: false, reason: 'not_found' };
  if (v.status !== 'draft') return { ok: false, reason: 'wrong_state' };
  const check = previewOf(v);
  if (!check.ok) return { ok: false, reason: `problem:${check.problem}` };
  await db.query(`update content.chapter_contents set status = 'reviewed', reviewed_by = $3, reviewed_at = now() where chapter_key = $1 and version_no = $2`, [key, version, actor.userId]);
  await writeAuditLog(db, audit(actor, 'content.chapter.reviewed', `${key}@${version}`, {}));
  return { ok: true };
}

// Reviewed -> Published. The one published version before is retired in the same transaction; when the chapter was made
// for a request, the request becomes Ready (shown as Published to the family). Returns the stored upload to remove.
export async function publishVersion(db: Sql, actor: StudioActor, key: unknown, version: unknown): Promise<StudioChange<{ uploadKey: string | null }>> {
  if (typeof key !== 'string' || !CHAPTER_KEY.test(key) || typeof version !== 'number' || !Number.isInteger(version)) return { ok: false, reason: 'bad_request' };
  const v = await readVersion(db, key, version);
  if (!v) return { ok: false, reason: 'not_found' };
  if (v.status !== 'reviewed') return { ok: false, reason: 'not_ready' };
  const check = previewOf(v);
  if (!check.ok) return { ok: false, reason: `problem:${check.problem}` };
  await db.query(`update content.chapter_contents set status = 'retired', retired_at = now() where chapter_key = $1 and status = 'published'`, [key]);
  await db.query(`update content.chapter_contents set status = 'published', published_by = $3, published_at = now() where chapter_key = $1 and version_no = $2`, [key, version, actor.userId]);
  let uploadKey: string | null = null;
  if (v.requestId) {
    uploadKey = ((await db.query(`select upload_key from content.chapter_requests where request_id = $1`, [v.requestId])).rows[0] as { upload_key: string | null } | undefined)?.upload_key ?? null;
    await db.query(`update content.chapter_requests set status = 'ready', chapter_key = $2, upload_key = null, updated_at = now() where request_id = $1 and status = 'digitizing'`, [v.requestId, key]);
  }
  await writeAuditLog(db, audit(actor, 'content.chapter.published', `${key}@${version}`, { source: v.source, droppedIds: v.droppedIds.length }));
  return { ok: true, uploadKey };
}

// Published -> withdrawn: families stop seeing the chapter; a child's saved place is kept for a later version.
export async function retireChapter(db: Sql, actor: StudioActor, key: unknown): Promise<StudioChange> {
  if (typeof key !== 'string' || !CHAPTER_KEY.test(key)) return { ok: false, reason: 'bad_request' };
  const res = await db.query(`update content.chapter_contents set status = 'retired', retired_at = now() where chapter_key = $1 and status = 'published' returning version_no`, [key]);
  if (!res.rows.length) return { ok: false, reason: 'not_found' };
  await writeAuditLog(db, audit(actor, 'content.chapter.retired', `${key}@${(res.rows[0] as { version_no: number }).version_no}`, {}));
  return { ok: true };
}

// The stored upload of a request, for a short signed link to the reviewer.
export async function requestUpload(db: Sql, requestId: unknown): Promise<string | null> {
  if (typeof requestId !== 'string' || !UUID.test(requestId)) return null;
  const r = (await db.query(`select upload_key from content.chapter_requests where request_id = $1 and status in ('received', 'digitizing')`, [requestId])).rows[0] as { upload_key: string | null } | undefined;
  return r?.upload_key ?? null;
}
