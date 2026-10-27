import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { MemoryFileStorage } from '@/lib/storage/file-storage';
import { droppedIds, resumeIndex, showcaseChapter, stabilizeIds, chapterProblem, chapterView } from '@/lib/family/chapters';
import { subjectStatus } from '@/lib/family/study-status';
import type { Block } from '@/lib/family/blocks';

// The content studio (S3, C376): a parent's PDF request becomes a published chapter the child opens, through draft ->
// reviewed -> published, a new version keeps the child's saved place, and Study's badges come from the queue.

const storage = new MemoryFileStorage();
vi.mock('@/lib/storage/supabase-file-storage', async () => ({ supabaseFileStorage: (globalThis as { __studioStorage?: unknown }).__studioStorage }));
(globalThis as { __studioStorage?: unknown }).__studioStorage = storage;

const ACCOUNT = 'f9000000-0000-4000-8000-0000000000a1';
const OTHER = 'f9000000-0000-4000-8000-0000000000b1';
const CHILD = 'f9000000-0000-4000-8000-0000000000c1';
const STAFF = 'f9000000-0000-4000-8000-0000000000e1';
// A tiny PDF: a header and some bytes. It has no text layer, so it is taken as a scan (the reviewer reads it).
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n').toString('base64');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
// Control's side: every statement runs as the platform role (nca_super), so the migration's grants are what is tested.
const staff = {
  query: async (sql: string, p?: unknown[]) => {
    await db.pg.exec('set role nca_super');
    try {
      return await db.pg.query(sql, p);
    } finally {
      await db.pg.exec('reset role');
    }
  },
} as never;
const actor = { userId: STAFF };
const fam = async <R,>(fn: (c: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<R>, account = ACCOUNT): Promise<R> =>
  (await import('@/lib/auth/db')).withFamilyContext({ accountId: account, tokenVersion: 0 }, fn as never) as Promise<R>;
const cookie = async (account = ACCOUNT, parent = true) => {
  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  const s = { accountId: account, tokenVersion: 0, sessionId: 's1' };
  return `ncf_session=${await signFamilySession(s)}${parent ? `; ncf_parent=${await signParentMode(s)}` : ''}`;
};
const call = async (path: string, method: string, body: unknown, account = ACCOUNT, parent = true) => {
  const route = await import(`@/app/api/family/${path}/route`);
  const res = await route[method](new NextRequest(`http://localhost/api/family/${path}`, { method, headers: { 'content-type': 'application/json', cookie: await cookie(account, parent) }, body: JSON.stringify(body) }));
  return { status: res.status as number, body: (await res.json()) as Record<string, unknown> };
};

const water = showcaseChapter('nc.showcase.water-cycle')!;
// The reviewer's typed blocks for the requested chapter: here NetCyberAI's own authored blocks, under the request's key.
const typed = (extra?: (b: Block[], lang: 'en' | 'hi') => Block[]) => ({
  en: (extra ?? ((b) => b))(water.blocks.en, 'en'),
  hi: (extra ?? ((b) => b))(water.blocks.hi, 'hi'),
});

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-content-studio-0123456789';
  await db.pg.exec(`
    insert into users (user_id, school_id, email, role, display_name) values ('${STAFF}', null, 'studio-staff@x.invalid', 'super_admin', 'Founder');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'studio@example.org'), ('${OTHER}', 'studio-other@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1'), ('${OTHER}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR');
  `);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

let requestId = '';
let key = '';

describe('the missing-chapter queue', () => {
  it('a parent’s PDF request is Received, kept private, and Study shows the badge', async () => {
    const made = await call('chapter-request', 'POST', { childId: CHILD, subject: 'science', title: 'Our book: how plants drink', pdf: PDF });
    expect(made.status).toBe(200);
    requestId = (made.body.request as { requestId: string }).requestId;
    const rows = await q(`select status, source, upload_key, board_id, class_level from content.chapter_requests`);
    expect(rows).toEqual([{ status: 'received', source: 'parent_upload', upload_key: `family/${ACCOUNT}/chapter-requests/${requestId}.pdf`, board_id: 'CBSE', class_level: 6 }]);
    expect(storage.files.size).toBe(1);
    const { listRequests, queueStatusOf } = await import('@/lib/family/chapter-requests');
    const list = await fam((c) => listRequests(c, ACCOUNT, CHILD));
    expect(subjectStatus('science', [], queueStatusOf(list, 'science'))).toBe('received');
    expect(subjectStatus('mathematics', [], queueStatusOf(list, 'mathematics'))).toBeNull();
  });

  it('refuses what is not a PDF, a repeat, a sibling’s child, and a child’s own phone-less parent gate', async () => {
    expect((await call('chapter-request', 'POST', { childId: CHILD, subject: 'science', title: 'Other', pdf: Buffer.from('not a pdf at all').toString('base64') })).status).toBe(400);
    expect((await call('chapter-request', 'POST', { childId: CHILD, subject: 'science', title: 'our book: HOW plants drink' })).status).toBe(409);
    expect((await call('chapter-request', 'POST', { childId: CHILD, subject: 'science', title: 'Another' }, OTHER)).status).toBe(404);
    expect((await call('chapter-request', 'POST', { childId: CHILD, subject: 'science', title: 'Another' }, ACCOUNT, false)).status).toBe(403);
  });

  it('only the owner sees the request; a family cannot move it', async () => {
    expect(await fam(async (c) => (await c.query(`select count(*)::int as n from content.chapter_requests`)).rows, OTHER)).toEqual([{ n: 0 }]);
    await expect(fam((c) => c.query(`update content.chapter_requests set status = 'ready'`))).rejects.toThrow();
    expect(await fam(async (c) => (await c.query(`delete from content.chapter_requests where status <> 'received' returning 1`)).rows)).toEqual([]);
  });

  it('Digitizing once the reviewer takes it', async () => {
    const { claimRequest } = await import('@/lib/content/chapter-studio');
    const claimed = await claimRequest(staff, actor, requestId);
    expect(claimed).toMatchObject({ ok: true, versionNo: 1 });
    key = (claimed as { chapterKey: string }).chapterKey;
    expect(await claimRequest(staff, actor, requestId)).toEqual({ ok: false, reason: 'wrong_state' });
    const { listRequests, queueStatusOf } = await import('@/lib/family/chapter-requests');
    const list = await fam((c) => listRequests(c, ACCOUNT, CHILD));
    expect(subjectStatus('science', [], queueStatusOf(list, 'science'))).toBe('digitizing');
    // A withdrawn request is only possible while Received.
    expect((await call('chapter-request', 'DELETE', { requestId })).status).toBe(404);
  });
});

describe('draft -> reviewed -> published', () => {
  it('an unfinished draft cannot be reviewed, and nothing skips a step', async () => {
    const s = await import('@/lib/content/chapter-studio');
    expect(await s.markReviewed(staff, actor, key, 1)).toMatchObject({ ok: false, reason: 'problem:blocks_en' });
    expect(await s.publishVersion(staff, actor, key, 1)).toEqual({ ok: false, reason: 'not_ready' });
    // The database refuses the jump as well.
    await expect(q(`update content.chapter_contents set status = 'published', reviewed_by = $2, reviewed_at = now(), published_by = $2, published_at = now() where chapter_key = $1`, [key, STAFF])).rejects.toThrow(/draft to published/);
  });

  it('saves typed blocks (checked), reviews, and publishes; the family sees it only then', async () => {
    const s = await import('@/lib/content/chapter-studio');
    const { readPublishedChapter } = await import('@/lib/family/chapter-store');
    expect(await s.saveDraft(staff, actor, { key, version: 1, titleEn: 'How plants drink', titleHi: 'पौधे पानी कैसे पीते हैं', blocks: { en: [{ type: 'nonsense' }], hi: [] } })).toEqual({ ok: false, reason: 'problem:block_en:1' });
    expect(await s.saveDraft(staff, actor, { key, version: 1, titleEn: 'How plants drink', titleHi: 'पौधे पानी कैसे पीते हैं', blocks: typed() })).toEqual({ ok: true });
    expect(await fam((c) => readPublishedChapter(c, key))).toBeNull();
    expect(await s.markReviewed(staff, actor, key, 1)).toEqual({ ok: true });
    // A reviewed version is published exactly as reviewed: a changed word needs a new review.
    await expect(q(`update content.chapter_contents set status = 'published', title_en = 'Changed', published_by = $2, published_at = now() where chapter_key = $1`, [key, STAFF])).rejects.toThrow(/published as it was reviewed/);
    const published = await s.publishVersion(staff, actor, key, 1);
    expect(published).toMatchObject({ ok: true, uploadKey: `family/${ACCOUNT}/chapter-requests/${requestId}.pdf` });
    // The route removes the stored file once the request has ended.
    await storage.remove((published as { uploadKey: string }).uploadKey);
    expect(storage.files.size).toBe(0);
    // The request is Ready and the parent's PDF is gone.
    expect(await q(`select status, upload_key from content.chapter_requests where request_id = $1`, [requestId])).toEqual([{ status: 'ready', upload_key: null }]);
  });

  it('opens on the child’s Study and reader, and on no other account’s', async () => {
    const { loadChapter, readableChapters } = await import('@/lib/family/chapter-store');
    const mine = await fam((c) => loadChapter(c, key));
    expect(mine?.title.hi).toBe('पौधे पानी कैसे पीते हैं');
    expect(chapterView(mine!, 'hi').title).toBe('पौधे पानी कैसे पीते हैं');
    const list = await fam((c) => readableChapters(c, { board: 'CBSE', classLevel: 6, subject: 'science', childId: CHILD }));
    expect(list.map((c) => c.key)).toContain(key);
    expect(list.find((c) => c.key === key)?.own).toBe(true);
    expect(await fam((c) => loadChapter(c, key), OTHER)).toBeNull();
    // A family cannot write a chapter.
    await expect(fam((c) => c.query(`update content.chapter_contents set status = 'retired'`))).rejects.toThrow();
    // The showcase files remain the fallback.
    expect((await fam((c) => loadChapter(c, 'nc.showcase.water-cycle')))?.key).toBe('nc.showcase.water-cycle');
  });
});

describe('versions keep the child’s place', () => {
  const place = { chapterKey: '', blockId: 'wc-clouds', sentence: 0 };
  it('the child’s place is kept in the published chapter', async () => {
    place.chapterKey = key;
    expect((await call('reading', 'POST', place)).status).toBe(200);
    expect((await call('reading', 'POST', { ...place, blockId: 'wc-states' })).status).toBe(400);
    expect((await call('reading', 'POST', { ...place, chapterKey: 'nc.req.00000000-0000-4000-8000-000000000000' })).status).toBe(400);
  });

  it('a new version is a copy with the same ids; publishing it retires the old and keeps the place', async () => {
    const s = await import('@/lib/content/chapter-studio');
    const { readPlace } = await import('@/lib/family/reading');
    const { loadChapter } = await import('@/lib/family/chapter-store');
    expect(await s.newVersion(staff, actor, key)).toEqual({ ok: true, versionNo: 2 });
    expect(await s.newVersion(staff, actor, key)).toEqual({ ok: false, reason: 'open_version' });
    const v2 = await s.readVersion(staff, key, 2);
    // The reviewer edits a sentence and removes a block; blocks typed without ids take the ids they had.
    const edited = typed((blocks) => blocks.filter((b) => b.id !== 'wc-shirt').map((b) => (b.id === 'wc-clouds' ? { ...b } : b)));
    const withoutIds = { en: edited.en.map((b) => ({ ...b, id: undefined })), hi: edited.hi.map((b) => ({ ...b, id: undefined })) };
    expect(v2?.status).toBe('draft');
    // Ids come back from the version before only at the same position and type; the studio keeps what the reviewer left.
    expect(await s.saveDraft(staff, actor, { key, version: 2, titleEn: 'How plants drink', titleHi: 'पौधे पानी कैसे पीते हैं', blocks: edited })).toEqual({ ok: true });
    const saved = await s.readVersion(staff, key, 2);
    expect(saved?.droppedIds).toEqual(['wc-shirt']);
    expect(withoutIds.en.every((b) => b.id === undefined)).toBe(true);
    expect(await s.markReviewed(staff, actor, key, 2)).toEqual({ ok: true });
    expect(await s.publishVersion(staff, actor, key, 2)).toMatchObject({ ok: true });
    expect(await q(`select version_no, status from content.chapter_contents where chapter_key = $1 order by version_no`, [key])).toEqual([
      { version_no: 1, status: 'retired' },
      { version_no: 2, status: 'published' },
    ]);
    // The child's row is untouched, and the reader resumes at the same place in the new version.
    const saved1 = await fam((c) => readPlace(c, ACCOUNT, CHILD, key));
    expect(saved1).toEqual({ blockId: 'wc-clouds', sentence: 0 });
    const chapter = (await fam((c) => loadChapter(c, key)))!;
    const view = chapterView(chapter, 'en');
    expect(view.script[resumeIndex(view.script, saved1)].blockId).toBe('wc-clouds');
  });

  it('a place in a block that is gone resumes at the start, not in error', async () => {
    const { loadChapter } = await import('@/lib/family/chapter-store');
    const chapter = (await fam((c) => loadChapter(c, key)))!;
    const view = chapterView(chapter, 'en');
    expect(resumeIndex(view.script, { blockId: 'wc-shirt', sentence: 3 })).toBe(0);
    expect(resumeIndex(view.script, null)).toBe(0);
  });

  it('a published version never changes; it can be withdrawn, and the place is kept for a later one', async () => {
    const s = await import('@/lib/content/chapter-studio');
    await expect(q(`update content.chapter_contents set blocks = '{"en":[],"hi":[]}'::jsonb where chapter_key = $1 and version_no = 2`, [key])).rejects.toThrow(/does not change/);
    expect(await s.retireChapter(staff, actor, key)).toEqual({ ok: true });
    const { loadChapter } = await import('@/lib/family/chapter-store');
    expect(await fam((c) => loadChapter(c, key))).toBeNull();
    expect(await q(`select block_id from family.chapter_reading where chapter_key = $1`, [key])).toEqual([{ block_id: 'wc-clouds' }]);
  });
});

describe('ids across versions', () => {
  const block = (id: string | undefined, text: string): Block => ({ type: 'key_points', points: [text, 'Another point.'], ...(id ? { id } : {}) }) as Block;
  it('a block without an id takes the id at its place in the version before; a new one gets its own', () => {
    const before = [block('a-one', 'First.'), block('a-two', 'Second.')];
    const next = stabilizeIds(before, [block(undefined, 'First, reworded.'), block(undefined, 'Second.'), block(undefined, 'Third.')]);
    expect(next.map((b) => b.id).slice(0, 2)).toEqual(['a-one', 'a-two']);
    expect(next[2].id).toMatch(/^key-points-[0-9a-f]{8}$/);
    expect(droppedIds(before, next)).toEqual([]);
    expect(droppedIds(before, [next[1]])).toEqual(['a-one']);
  });
  it('explains why a chapter is refused', () => {
    expect(chapterProblem({ key: 'bad key' })).toEqual({ ok: false, problem: 'bad_key' });
    expect(chapterProblem({ key: 'nc.test.one', subject: 'science', title: { en: 'T', hi: 'T' }, blocks: {} })).toEqual({ ok: false, problem: 'blocks_en' });
    expect(chapterProblem({ key: 'nc.test.one', subject: 'science', title: { en: 'T', hi: 'T' }, blocks: { en: water.blocks.en, hi: water.blocks.hi } })).toEqual({ ok: false, problem: 'title_hi' });
    expect(chapterProblem({ key: water.key, subject: water.subject, title: water.title, blocks: water.blocks }).ok).toBe(true);
  });
});

describe('the decline path and the source mode', () => {
  it('declining ends the request, shows no badge, and removes the stored file', async () => {
    const s = await import('@/lib/content/chapter-studio');
    const made = await call('chapter-request', 'POST', { childId: CHILD, subject: 'science', title: 'A page we cannot read', pdf: PDF });
    const id = (made.body.request as { requestId: string }).requestId;
    expect(storage.files.size).toBe(1);
    const out = await s.declineRequest(staff, actor, id, 'The pages are not clear enough to read.');
    expect(out).toMatchObject({ ok: true });
    await storage.remove((out as { uploadKey: string }).uploadKey);
    expect(storage.files.size).toBe(0);
    const { requestStudyStatus, listRequests } = await import('@/lib/family/chapter-requests');
    const list = await fam((c) => listRequests(c, ACCOUNT, CHILD));
    expect(requestStudyStatus(list.find((r) => r.requestId === id)!.status)).toBeNull();
  });

  it('a parent withdraws a request still Received, with its file', async () => {
    const made = await call('chapter-request', 'POST', { childId: CHILD, subject: 'science', title: 'Wrong chapter', pdf: PDF });
    const id = (made.body.request as { requestId: string }).requestId;
    expect(storage.files.size).toBe(1);
    expect((await call('chapter-request', 'DELETE', { requestId: id })).status).toBe(200);
    expect(storage.files.size).toBe(0);
    expect((await call('chapter-request', 'DELETE', { requestId: id }, OTHER)).status).toBe(404);
  });

  it('a subject’s source is the parent’s choice, own account only', async () => {
    const { readSourceModes, sourceShown } = await import('@/lib/family/chapter-requests');
    expect((await call('subject-source', 'POST', { childId: CHILD, subject: 'science', mode: 'parent' })).status).toBe(200);
    const modes = await fam((c) => readSourceModes(c, ACCOUNT, CHILD));
    expect(modes).toEqual({ science: 'parent' });
    expect(sourceShown(modes.science, 'parent')).toBe(true);
    expect(sourceShown(modes.science, 'catalog')).toBe(false);
    expect(sourceShown(modes.mathematics, 'catalog')).toBe(true);
    expect((await call('subject-source', 'POST', { childId: CHILD, subject: 'science', mode: 'nonsense' })).status).toBe(400);
    expect((await call('subject-source', 'POST', { childId: CHILD, subject: 'science', mode: 'school' }, OTHER)).status).toBe(404);
    expect((await call('subject-source', 'POST', { childId: CHILD, subject: 'science', mode: null })).status).toBe(200);
    expect(await fam((c) => readSourceModes(c, ACCOUNT, CHILD))).toEqual({});
  });
});
