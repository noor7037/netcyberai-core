import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import type { Block } from '@/lib/family/blocks';
import type { FeedTurn } from '@/lib/family/tutor-shape';
import { answered, followHref, withoutCarried, type FeedAsk } from '@/components/family/tutor/TutorWindow';
import { familyWords } from '@/lib/family/words';
import { TUTOR_KEYS } from '@/lib/family/tutor-words';
import { fill } from '@/lib/family/fill';

// W10-4 (C413; docs/39 §5 "Chat, final rule"): the Study chat as one feed per subject, on the real migrations.
//   1. The feed keeps a subject's last 30 child turns: the 31st deletes the oldest, with its answer and its file (the
//      file removed from the bucket too), and an archived chat left empty goes with it.
//   2. The feed reads every turn of the subject's chats, oldest first, each with its chat and the chat's subject; the
//      route answers with it and with the newest open chat, which a new question continues.
//   3. A question the server keeps in another subject is said in the feed ("Moved to Science", in Hindi too), and on
//      Study the subject tab follows it; the feed read for the new subject does not draw that turn twice.
// Made-up children and words only.

const ACCOUNT = 'f1040000-0000-4000-8000-0000000000a1';
const CHILD = 'f1040000-0000-4000-8000-0000000000c1';
const FILE = 'f1040000-0000-4000-8000-0000000000f1';

const explanation = (n: number): Block => ({ type: 'explanation', title: `Idea ${n}`, idea: `The idea ${n}.`, paragraphs: [`Paragraph ${n} one.`, `Paragraph ${n} two.`], example: `Example ${n}`, steps: ['a', 'b'], terms: [] });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
type Client = { query: (s: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };
const fam = async <R,>(fn: (c: Client) => Promise<R>): Promise<R> =>
  (await import('@/lib/auth/db')).withFamilyContext({ accountId: ACCOUNT, tokenVersion: 0, device: null }, fn as never) as Promise<R>;
const turn = (chatId: string, n: number, subject: string, storage: { remove: (k: string) => Promise<void> } | null = null) => ({
  accountId: ACCOUNT,
  childId: CHILD,
  chatId,
  subject,
  text: `Question ${n}?`,
  chapterKey: null,
  blockId: null,
  files: [],
  blocks: [explanation(n)],
  storage: storage as never,
});

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-w10-4-feed-0123456789';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'feed@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CHILD}', '${ACCOUNT}', 'Ishaan', 8, 'CBSE', 'en', 'en', 'IN-HR');
  `);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('the rolling feed (W10-4)', () => {
  it('the 31st child turn in a subject deletes the oldest, with its answer and its file; an archived chat left empty goes', async () => {
    const t = await import('@/lib/family/tutor');
    // Turn 1 in an older chat (archived later), with a file; turns 2 to 30 in the newest chat.
    const older = await fam((c) => t.newChat(c, ACCOUNT, CHILD, 'english'));
    await fam((c) => t.appendTurn(c, turn(older, 1, 'english')));
    const [first] = await q(`select message_id from family.tutor_messages where conversation_id = $1 and role = 'child'`, [older]);
    await q(
      `insert into family.tutor_attachments (attachment_id, conversation_id, account_id, child_id, message_id, status, mime, size_bytes, storage_key)
       values ($6, $1, $2, $3, $4, 'ready', 'image/png', 1000, $5)`,
      [older, ACCOUNT, CHILD, first.message_id, `${ACCOUNT}/${CHILD}/${FILE}.png`, FILE]
    );
    await q(`update family.tutor_conversations set status = 'archived' where conversation_id = $1`, [older]);
    const newest = await fam((c) => t.newChat(c, ACCOUNT, CHILD, 'english'));
    await fam(async (c) => {
      for (let n = 2; n <= 30; n++) await t.appendTurn(c, turn(newest, n, 'english'));
    });
    const count = async () => (await q(`select count(*)::int as n from family.tutor_messages m join family.tutor_conversations c using (conversation_id) where c.child_id = $1 and c.subject = 'english' and m.role = 'child'`, [CHILD]))[0].n;
    expect(await count()).toBe(30);
    // Nothing went at 30, and no chat is full.
    expect(await q(`select status from family.tutor_conversations where conversation_id = $1`, [newest])).toEqual([{ status: 'open' }]);

    const removed: string[] = [];
    const kept = await fam((c) => t.appendTurn(c, turn(newest, 31, 'english', { remove: async (k) => void removed.push(k) })));
    expect(kept).toEqual({ ok: true, turnCount: 30, subject: 'english' });
    expect(await count()).toBe(30);
    // The oldest question and its answer are gone, the archived chat with them, and the file left the bucket.
    expect(await q(`select 1 from family.tutor_conversations where conversation_id = $1`, [older])).toEqual([]);
    expect(await q(`select count(*)::int as n from family.tutor_messages where body = 'Question 1?'`)).toEqual([{ n: 0 }]);
    expect(await q(`select count(*)::int as n from family.tutor_attachments where attachment_id = $1`, [FILE])).toEqual([{ n: 0 }]);
    expect(removed).toContain(`${ACCOUNT}/${CHILD}/${FILE}.png`);
    const feed = await fam((c) => t.readFeed(c, ACCOUNT, CHILD, 'english'));
    expect(feed).toHaveLength(60);
    expect(feed[0]).toMatchObject({ role: 'child', text: 'Question 2?' });
    expect(feed[1]).toMatchObject({ role: 'tutor', blocks: [explanation(2)] });

    // The 32nd: the oldest of the open chat now (question 2 and its answer), nothing else.
    await fam((c) => t.appendTurn(c, turn(newest, 32, 'english')));
    const after = await fam((c) => t.readFeed(c, ACCOUNT, CHILD, 'english'));
    expect(after).toHaveLength(60);
    expect(after[0]).toMatchObject({ role: 'child', text: 'Question 3?' });
    expect(after.at(-2)).toMatchObject({ role: 'child', text: 'Question 32?' });
    // Another subject's turns are never counted with these.
    expect(await fam((c) => t.readFeed(c, ACCOUNT, CHILD, 'science'))).toEqual([]);
  });

  it('reads every turn of the subject across its chats, in order, each with its chat and subject; the route answers with it', async () => {
    const t = await import('@/lib/family/tutor');
    const a = await fam((c) => t.newChat(c, ACCOUNT, CHILD, 'science'));
    await fam((c) => t.appendTurn(c, turn(a, 101, 'science')));
    const b = await fam((c) => t.newChat(c, ACCOUNT, CHILD, 'science'));
    await fam((c) => t.appendTurn(c, turn(b, 102, 'science')));
    await fam((c) => t.appendTurn(c, turn(a, 103, 'science')));
    const feed = await fam((c) => t.readFeed(c, ACCOUNT, CHILD, 'science'));
    expect(feed.map((x: FeedTurn) => [x.role, x.role === 'child' ? x.text : x.blocks[0].type, x.chatId, x.subject])).toEqual([
      ['child', 'Question 101?', a, 'science'],
      ['tutor', 'explanation', a, 'science'],
      ['child', 'Question 102?', b, 'science'],
      ['tutor', 'explanation', b, 'science'],
      ['child', 'Question 103?', a, 'science'],
      ['tutor', 'explanation', a, 'science'],
    ]);

    const { signFamilySession } = await import('@/lib/family/session');
    const cookie = `ncf_session=${await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' })}; ncf_child=${CHILD}`;
    const { GET } = await import('@/app/api/family/tutor/route');
    const res = await GET(new NextRequest('http://localhost/api/family/tutor?subject=science', { headers: { cookie } }));
    const body = (await res.json()) as { chatId: string; turns: FeedTurn[] };
    // The chat a new question continues: the newest open one (the one answered in last).
    expect(body.chatId).toBe(a);
    expect(body.turns.map((x) => x.id)).toEqual(feed.map((x: FeedTurn) => x.id));
  });
});

describe('a question moved to another subject (W10-4)', () => {
  const ask = (n: number, text: string): FeedAsk => ({ n, subject: 'mathematics', text, input: { kind: 'question', text }, moved: null, chatId: null });

  it('says "Moved to Science" in the feed, in English and in Hindi', () => {
    const asks = answered([ask(1, 'How many halves make one?'), ask(2, 'What is photosynthesis?')], 2, { chatId: 'chat-s', subject: 'science' });
    expect(asks[0].moved).toBeNull();
    expect(asks[1]).toMatchObject({ moved: 'science', chatId: 'chat-s' });
    // A question kept in the tab's own subject is not said to move.
    expect(answered(asks, 1, { chatId: 'chat-m', subject: 'mathematics' })[0].moved).toBeNull();
    const en = familyWords('en', TUTOR_KEYS);
    const hi = familyWords('hi', TUTOR_KEYS);
    expect(fill(en['fam.chat.moved'], { subject: en['fam.subject.science'] })).toBe('Moved to Science');
    expect(fill(hi['fam.chat.moved'], { subject: hi['fam.subject.science'] })).toMatch(/[ऀ-ॿ]/);
    expect(hi['fam.chat.moved']).not.toBe(en['fam.chat.moved']);
  });

  it('the subject tab follows it on Study (not in the reader’s drawer), and its turn is not drawn twice', () => {
    const moved = answered([ask(1, 'What is photosynthesis?')], 1, { chatId: 'chat-s', subject: 'science' })[0];
    expect(followHref(moved, true)).toBe('/family/study?subject=science');
    expect(followHref(moved, false)).toBeNull();
    expect(followHref({ ...moved, moved: null }, true)).toBeNull();
    // The Science feed read after the tab followed already holds the moved turn: it is drawn once, live.
    const feed: FeedTurn[] = [
      { id: 'm1', role: 'child', lang: 'en', text: 'What is light?', chapterKey: null, blockId: null, files: [], at: '2026-10-30T10:00:00.000Z', chatId: 'chat-s', subject: 'science' },
      { id: 'm2', role: 'tutor', lang: 'en', blocks: [explanation(1)], at: '2026-10-30T10:00:01.000Z', chatId: 'chat-s', subject: 'science' },
      { id: 'm3', role: 'child', lang: 'en', text: 'What is photosynthesis?', chapterKey: null, blockId: null, files: [], at: '2026-10-30T10:05:00.000Z', chatId: 'chat-s', subject: 'science' },
      { id: 'm4', role: 'tutor', lang: 'en', blocks: [explanation(2)], at: '2026-10-30T10:05:01.000Z', chatId: 'chat-s', subject: 'science' },
    ];
    expect(withoutCarried(feed, moved).map((x) => x.id)).toEqual(['m1', 'm2']);
    expect(withoutCarried(feed, null).map((x) => x.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });
});
