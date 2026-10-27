import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import type { Block } from '@/lib/family/blocks';
import { MemoryFileStorage } from '@/lib/storage/file-storage';
import { TUTOR_FILE_MAX_BYTES, keptTutorBlocks, sniffTutorFile } from '@/lib/family/tutor-shape';

// The shared tutor window (S2, C375; docs/37 §4 Wave 2), on the real migrations:
//   1. History persists per child and subject; a sibling (same account, the other child) and another account never
//      see it, through the routes (the child is the phone's chosen one, never the request's) and the policies (own
//      account; on a child's own phone, that child only).
//   2. Files: only PNG, JPEG, WebP or PDF by their first bytes, at most 10 MB; a spoofed type, an oversized or empty
//      file is refused and taken away; only a ready file of this child is handed out, as a one-minute signed link.
//   3. The parent's clear removes the rows and the stored files; if the store cannot be reached nothing is cleared.
//   4. Homework stays hint-first: a kept answer never holds a check or practice item (their answers stay sealed).
//   5. The word "ChatGPT" appears nowhere in the product.

const ACCOUNT = 'f9000000-0000-4000-8000-0000000000a1';
const OTHER = 'f9000000-0000-4000-8000-0000000000b1';
const CHILD = 'f9000000-0000-4000-8000-0000000000c1';
const SIBLING = 'f9000000-0000-4000-8000-0000000000c2';
const OTHER_CHILD = 'f9000000-0000-4000-8000-0000000000c3';
const DEVICE = 'f9000000-0000-4000-8000-0000000000d2';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');
const noWords = async () => ({ rawText: '', words: [] });

const EXPLANATION: Block = { type: 'explanation', title: 'Equal fractions', idea: 'Same part of the whole.', example: '1/2 = 2/4', steps: ['Multiply top and bottom by 2.', 'Compare the shaded parts.'], terms: [] };
const CHECK: Block = { type: 'check', items: [{ id: 'c1', question: 'Is 1/2 = 2/4?', options: ['Yes', 'No'], answer: 0, hint: 'Draw it.', why: 'Same part.', wrong: ['', 'Look again.'] }] };
const PRACTICE: Block = { type: 'practice', items: [{ id: 'p1', question: '3/6 = ?', options: ['1/2', '1/3'], answer: 0, hint: 'Divide.', why: 'Both by 3.', wrong: ['', 'No.'] }] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
type Client = { query: (s: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };
const fam = async <R,>(fn: (c: Client) => Promise<R>, account = ACCOUNT, device: { deviceId: string; childId: string } | null = null): Promise<R> =>
  (await import('@/lib/auth/db')).withFamilyContext({ accountId: account, tokenVersion: 0, device }, fn as never) as Promise<R>;

const cookies = async (account: string, child?: string, parent = false) => {
  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  const s = { accountId: account, tokenVersion: 0, sessionId: 's1' };
  const parts = [`ncf_session=${await signFamilySession(s)}`];
  if (child) parts.push(`ncf_child=${child}`);
  if (parent) parts.push(`ncf_parent=${await signParentMode(s)}`);
  return parts.join('; ');
};
const history = async (subject: string, account: string, child?: string) => {
  const { GET } = await import('@/app/api/family/tutor/route');
  const res = await GET(new NextRequest(`http://localhost/api/family/tutor?subject=${subject}`, { headers: { cookie: await cookies(account, child) } }));
  return { status: res.status, body: (await res.json()) as { turns?: { role: string; text?: string; blocks?: Block[] }[] } };
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-tutor-window-0123456789';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'tutor@example.org'), ('${OTHER}', 'other-tutor@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values
      ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1'), ('${ACCOUNT}', 'photo_input', true, 'parent_tap', 'v1'),
      ('${OTHER}', 'study_core', true, 'parent_tap', 'v1'), ('${OTHER}', 'photo_input', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CHILD}', '${ACCOUNT}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${SIBLING}', '${ACCOUNT}', 'Meera', 7, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${OTHER_CHILD}', '${OTHER}', 'Kabir', 6, 'CBSE', 'en', 'en', 'IN-HR');
    insert into family.child_devices (device_id, account_id, child_id) values ('${DEVICE}', '${ACCOUNT}', '${SIBLING}');
  `);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('the migration (C375)', () => {
  it('makes a private bucket of 10 MB for photos and PDFs only', async () => {
    expect(await q(`select public, file_size_limit::int as size, allowed_mime_types from storage.buckets where id = 'family-tutor'`)).toEqual([
      { public: false, size: 10485760, allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] },
    ]);
  });
  it('keeps a turn inside its own child’s conversation', async () => {
    const { conversationFor } = await import('@/lib/family/tutor');
    const conv = await fam((c) => conversationFor(c, ACCOUNT, CHILD, 'mathematics'));
    await expect(q(`insert into family.tutor_messages (conversation_id, account_id, child_id, role, body) values ($1, $2, $3, 'child', 'x?')`, [conv, ACCOUNT, SIBLING])).rejects.toThrow(/foreign key/);
  });
});

describe('history per child and subject (C375)', () => {
  it('keeps a question and its answer, without any check or practice item', async () => {
    const { saveTurn } = await import('@/lib/family/tutor');
    await fam((c) => saveTurn(c, { accountId: ACCOUNT, childId: CHILD, subject: 'mathematics', text: 'Why is 1/2 the same as 2/4?', chapterKey: 'nc.showcase.equal-fractions', blockId: 'ef-intro', files: [], blocks: [EXPLANATION, CHECK, PRACTICE] }));
    const { status, body } = await history('mathematics', ACCOUNT, CHILD);
    expect(status).toBe(200);
    expect(body.turns!.map((t) => t.role)).toEqual(['child', 'tutor']);
    expect(body.turns![0].text).toBe('Why is 1/2 the same as 2/4?');
    expect(body.turns![1].blocks!.map((b) => b.type)).toEqual(['explanation']);
    // Hint-first stays: no answer of a quiz item is ever kept or read back.
    expect(JSON.stringify(await q(`select blocks from family.tutor_messages where role = 'tutor'`))).not.toMatch(/"type":"(check|practice)"|"options"/);
  });
  it('a subject keeps its own history', async () => {
    expect((await history('science', ACCOUNT, CHILD)).body.turns).toEqual([]);
  });
  it('a sibling on the same account never sees it, whatever the request says', async () => {
    expect((await history('mathematics', ACCOUNT, SIBLING)).body.turns).toEqual([]);
    const { readTurns } = await import('@/lib/family/tutor');
    // On the sibling's own phone, even a read naming the other child finds nothing.
    expect(await fam((c) => readTurns(c, ACCOUNT, CHILD, 'mathematics'), ACCOUNT, { deviceId: DEVICE, childId: SIBLING })).toEqual([]);
    expect(await fam(async (c) => (await c.query(`select count(*)::int as n from family.tutor_messages`)).rows, ACCOUNT, { deviceId: DEVICE, childId: SIBLING })).toEqual([{ n: 0 }]);
  });
  it('another account never sees or changes it', async () => {
    expect((await history('mathematics', OTHER, CHILD)).body.turns).toEqual([]);
    for (const t of ['tutor_conversations', 'tutor_messages', 'tutor_attachments']) {
      expect(await fam(async (c) => (await c.query(`select count(*)::int as n from family.${t}`)).rows, OTHER)).toEqual([{ n: 0 }]);
    }
    expect(await fam(async (c) => (await c.query(`delete from family.tutor_messages returning 1`)).rows, OTHER)).toEqual([]);
    expect((await q(`select count(*)::int as n from family.tutor_messages`))[0].n).toBe(2);
  });
  it('without a session, or for a subject that is not one, nothing is read', async () => {
    const { GET } = await import('@/app/api/family/tutor/route');
    expect((await GET(new NextRequest('http://localhost/api/family/tutor?subject=mathematics'))).status).toBe(401);
    expect((await history('cooking', ACCOUNT, CHILD)).status).toBe(400);
  });
});

describe('the reader’s context (C375)', () => {
  it('is NetCyber’s own chapter of the window’s subject and one of its blocks, or nothing', async () => {
    const { readerContext } = await import('@/lib/family/tutor');
    const { chapterView, showcaseChapter } = await import('@/lib/family/chapters');
    const v = chapterView(showcaseChapter('nc.showcase.equal-fractions')!, 'en');
    const ok = readerContext('mathematics', 'nc.showcase.equal-fractions', v.ids[0], 'hi');
    expect(ok?.about.startsWith(v.title)).toBe(true);
    expect(readerContext('science', 'nc.showcase.equal-fractions', v.ids[0], 'en')).toBeNull();
    expect(readerContext('mathematics', 'nc.showcase.equal-fractions', 'no-such-block', 'en')).toBeNull();
    expect(readerContext('mathematics', 'nc.showcase.unknown', v.ids[0], 'en')).toBeNull();
  });
});

describe('files (C375)', () => {
  const who = { accountId: ACCOUNT, childId: CHILD };
  const ask = async (storage: MemoryFileStorage, mime: string, size: number, subject = 'mathematics') => {
    const { askTutorUpload } = await import('@/lib/family/tutor');
    return fam((c) => askTutorUpload(c, storage, who, { subject, mime, size, name: 'question.png' }));
  };
  const confirm = async (storage: MemoryFileStorage, id: string) => {
    const t = await import('@/lib/family/tutor');
    const row = await fam((c) => t.pendingUpload(c, who, id));
    const arrival = await t.readTutorArrival(storage, row!, Date.now, noWords);
    return fam((c) => t.finishTutorUpload(c, storage, who, id, arrival));
  };

  it('reads a file by its first bytes', () => {
    expect(sniffTutorFile(PNG)).toBe('image/png');
    expect(sniffTutorFile(PDF)).toBe('application/pdf');
    expect(sniffTutorFile(HTML)).toBeNull();
    expect(sniffTutorFile(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull();
  });
  it('refuses an oversized, empty or wrong-type file before giving a link', async () => {
    const s = new MemoryFileStorage();
    expect(await ask(s, 'image/png', TUTOR_FILE_MAX_BYTES + 1)).toEqual({ ok: false, reason: 'file_too_large' });
    expect(await ask(s, 'image/png', 0)).toEqual({ ok: false, reason: 'file_empty' });
    expect(await ask(s, 'image/gif', 100)).toEqual({ ok: false, reason: 'file_type' });
    expect(await ask(s, 'text/html', 100)).toEqual({ ok: false, reason: 'file_type' });
    expect(s.uploadLinks.size).toBe(0);
  });
  it('refuses a file whose bytes are not the type declared, and takes it away', async () => {
    const s = new MemoryFileStorage();
    const a = await ask(s, 'image/png', HTML.length);
    if (!a.ok) throw new Error(a.reason);
    await s.receive(a.uploadUrl, HTML, 'image/png');
    expect(await confirm(s, a.attachmentId)).toEqual({ ok: false, reason: 'file_type' });
    expect(s.files.size).toBe(0);
    expect(await q(`select 1 from family.tutor_attachments where attachment_id = $1`, [a.attachmentId])).toEqual([]);
  });
  it('refuses a file bigger than declared once it arrives (the real size is read)', async () => {
    const s = new MemoryFileStorage();
    const a = await ask(s, 'image/png', 100);
    if (!a.ok) throw new Error(a.reason);
    const big = new Uint8Array(TUTOR_FILE_MAX_BYTES + 1);
    big.set(PNG);
    await s.receive(a.uploadUrl, big, 'image/png');
    expect(await confirm(s, a.attachmentId)).toEqual({ ok: false, reason: 'file_too_large' });
    expect(s.files.size).toBe(0);
  });
  it('keeps a real photo at its own key, ready only for this child, as a one-minute link', async () => {
    const t = await import('@/lib/family/tutor');
    const s = new MemoryFileStorage();
    const a = await ask(s, 'image/png', PNG.length);
    if (!a.ok) throw new Error(a.reason);
    expect(a.uploadUrl).toContain(`pending/${ACCOUNT}/`);
    await s.receive(a.uploadUrl, PNG, 'image/png');
    expect(await confirm(s, a.attachmentId)).toEqual({ ok: true });
    expect([...s.files.keys()]).toEqual([`${ACCOUNT}/${CHILD}/${a.attachmentId}.png`]);
    expect(await fam((c) => t.signedTutorFile(c, s, ACCOUNT, CHILD, a.attachmentId))).toBe(`memory://${ACCOUNT}/${CHILD}/${a.attachmentId}.png?ttl=60`);
    expect(await fam((c) => t.signedTutorFile(c, s, ACCOUNT, SIBLING, a.attachmentId))).toBeNull();
    expect(await fam((c) => t.signedTutorFile(c, s, OTHER, null, a.attachmentId), OTHER)).toBeNull();
    // The parent (no child named) may open any child's file of their own account.
    expect(await fam((c) => t.signedTutorFile(c, s, ACCOUNT, null, a.attachmentId))).not.toBeNull();
    // Only this child may send it with a question in this subject.
    expect(await fam((c) => t.sendableFiles(c, ACCOUNT, CHILD, 'mathematics', [a.attachmentId]))).toEqual([a.attachmentId]);
    expect(await fam((c) => t.sendableFiles(c, ACCOUNT, SIBLING, 'mathematics', [a.attachmentId]))).toBeNull();
    expect(await fam((c) => t.sendableFiles(c, ACCOUNT, CHILD, 'science', [a.attachmentId]))).toBeNull();
    // Sent with a question, it is listed with that question.
    await fam((c) => t.saveTurn(c, { accountId: ACCOUNT, childId: CHILD, subject: 'mathematics', text: 'What does this show?', chapterKey: null, blockId: null, files: [a.attachmentId], blocks: [EXPLANATION] }));
    const turns = (await history('mathematics', ACCOUNT, CHILD)).body.turns as { files?: { id: string }[] }[];
    expect(turns.at(-2)!.files).toEqual([{ id: a.attachmentId, mime: 'image/png' }]);
  });
  it('the file route never hands a sibling’s or a missing file, and never names a public address', async () => {
    const { GET } = await import('@/app/api/family/tutor/files/[attachmentId]/route');
    const [{ attachment_id: id }] = await q(`select attachment_id from family.tutor_attachments where status = 'ready' limit 1`);
    const res = await GET(new NextRequest(`http://localhost/api/family/tutor/files/${id}`, { headers: { cookie: await cookies(ACCOUNT, SIBLING) } }), { params: { attachmentId: id } });
    expect(res.status).toBe(404);
    const bad = await GET(new NextRequest('http://localhost/api/family/tutor/files/x', { headers: { cookie: await cookies(ACCOUNT, CHILD) } }), { params: { attachmentId: '../../etc' } });
    expect(bad.status).toBe(404);
  });
  it('accepts a PDF; at most three unsent files a question', async () => {
    const s = new MemoryFileStorage();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const a = await ask(s, 'application/pdf', PDF.length, 'science');
      if (!a.ok) throw new Error(a.reason);
      await s.receive(a.uploadUrl, PDF, 'application/pdf');
      expect(await confirm(s, a.attachmentId)).toEqual({ ok: true });
      ids.push(a.attachmentId);
    }
    expect(await ask(s, 'application/pdf', PDF.length, 'science')).toEqual({ ok: false, reason: 'too_many_files' });
    const { removeUnsentFile } = await import('@/lib/family/tutor');
    expect(await fam((c) => removeUnsentFile(c, s, { accountId: ACCOUNT, childId: SIBLING }, ids[0]))).toBe(false);
    expect(await fam((c) => removeUnsentFile(c, s, who, ids[0]))).toBe(true);
    expect(s.files.size).toBe(2);
  });
});

describe('the Learning Vault (C375)', () => {
  it('lists each child’s conversations for the parent', async () => {
    const { vaultConversations } = await import('@/lib/family/tutor');
    const v = await fam((c) => vaultConversations(c, ACCOUNT));
    expect(v.map((x) => [x.childId, x.subject]).sort()).toEqual([
      [CHILD, 'mathematics'],
      [CHILD, 'science'],
    ]);
    expect(await fam((c) => vaultConversations(c, OTHER), OTHER)).toEqual([]);
  });
  it('clears only in parent mode', async () => {
    const { DELETE } = await import('@/app/api/family/tutor/vault/route');
    const [{ conversation_id: conv }] = await q(`select conversation_id from family.tutor_conversations where subject = 'mathematics'`);
    const res = await DELETE(new NextRequest('http://localhost/api/family/tutor/vault', { method: 'DELETE', headers: { cookie: await cookies(ACCOUNT, CHILD), 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: conv }) }));
    expect(res.status).toBe(403);
    // Another account's parent finds nothing to clear.
    const other = await DELETE(new NextRequest('http://localhost/api/family/tutor/vault', { method: 'DELETE', headers: { cookie: await cookies(OTHER, undefined, true), 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: conv }) }));
    expect(other.status).toBe(404);
  });
  it('a clear that cannot reach the store clears nothing', async () => {
    const t = await import('@/lib/family/tutor');
    class Down extends MemoryFileStorage {
      async remove(): Promise<void> {
        throw new Error('down');
      }
    }
    const [{ conversation_id: conv }] = await q(`select conversation_id from family.tutor_conversations where subject = 'mathematics'`);
    await expect(fam((c) => t.clearConversation(c, new Down(), ACCOUNT, conv))).rejects.toBeInstanceOf(t.TutorStorageError);
    expect((await q(`select count(*)::int as n from family.tutor_messages where conversation_id = $1`, [conv]))[0].n).toBe(4);
  });
  it('the parent’s clear removes the rows and the stored files', async () => {
    const t = await import('@/lib/family/tutor');
    const s = new MemoryFileStorage();
    const [{ conversation_id: conv }] = await q(`select conversation_id from family.tutor_conversations where subject = 'mathematics'`);
    const [{ storage_key: key }] = await q(`select storage_key from family.tutor_attachments where conversation_id = $1`, [conv]);
    await s.put(key, PNG, 'image/png');
    await s.put('keep/other.png', PNG, 'image/png');
    expect(await fam((c) => t.clearConversation(c, s, ACCOUNT, conv))).toBe(true);
    expect([...s.files.keys()]).toEqual(['keep/other.png']);
    for (const table of ['tutor_conversations', 'tutor_messages', 'tutor_attachments']) {
      expect((await q(`select count(*)::int as n from family.${table} where conversation_id = $1`, [conv]))[0].n).toBe(0);
    }
    expect((await history('mathematics', ACCOUNT, CHILD)).body.turns).toEqual([]);
  });
  it('removing a child removes their files from the store first', async () => {
    const t = await import('@/lib/family/tutor');
    const s = new MemoryFileStorage();
    const keys = (await q(`select storage_key from family.tutor_attachments where child_id = $1`, [CHILD])).map((r: { storage_key: string }) => r.storage_key);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) await s.put(k, PDF, 'application/pdf');
    expect(await fam((c) => t.removeTutorFilesOf(c, s, ACCOUNT, CHILD))).toBe(keys.length);
    expect(s.files.size).toBe(0);
  });
});

describe('the word (C375)', () => {
  // The one exception is a crawler's own user-agent name in robots.txt, which names that crawler to keep it out of the
  // school pages; it is never shown to a person.
  const ALLOWED = new Set(['src/app/robots.ts']);
  it('"ChatGPT" appears nowhere in the product: screens, messages or code', () => {
    const root = path.resolve(__dirname, '../..');
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|mjs|js|json|css|md)$/.test(name) && /chat\s*-?\s*gpt/i.test(readFileSync(p, 'utf8'))) found.push(path.relative(root, p));
      }
    };
    walk(path.join(root, 'src'));
    expect(found.filter((f) => !ALLOWED.has(f))).toEqual([]);
  });
  it('the kept part of an answer drops every quiz block', () => {
    expect(keptTutorBlocks([CHECK, EXPLANATION, PRACTICE]).map((b) => b.type)).toEqual(['explanation']);
  });
});
