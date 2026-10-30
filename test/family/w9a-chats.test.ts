import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import type { Block } from '@/lib/family/blocks';

// W9-A (C406; docs/39 §3 "Chat", §4): chats with memory, on the real migrations.
//   1. A subject keeps at most 15 listed chats: a 16th archives the least recently used.
//   2. A chat takes 30 child turns, then it is full: the 31st is refused with chat_full (nothing written), and the route
//      refuses a new question in a full chat with 409 before the tutor is asked.
//   3. memoryFor gives the running summary and the last 6 turns: the child's words and the tutor's explanation
//      paragraphs only (no other block).
//   4. The route sends that memory to the tutor: a third follow-up is asked with the earlier questions in its prompt;
//      every fifth child turn the summary is rewritten through the family.summary workload.
//   5. A sibling never reads or asks in another child's chat (the routes and the policies).
// The model is replaced by a scripted stream, as in test/family/understand.test.ts.

const ai = vi.hoisted(() => ({ lines: [] as string[], calls: [] as { profile: string; system: string; user: string }[], summary: 'The student asked about fractions and was shown 1/2 = 2/4.' }));
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async () => 'v1',
  prepareModeration: async () => ({ ok: true, moderation: { check: async () => ({ safe: true, categories: [] }), record: async () => {} } }),
  prepareText: async (_db: unknown, _ctx: unknown, profile: string, req: { system: string; messages: { content: string }[] }) => {
    ai.calls.push({ profile, system: req.system, user: req.messages[0].content });
    const lines = profile === 'family.summary' ? [ai.summary] : [...ai.lines];
    return {
      ok: true,
      text: {
        send: async (onDelta: (t: string) => void = () => {}) => {
          for (const l of lines) onDelta(`${l}\n`);
          return { result: { ok: true, text: lines.join('\n'), tokensIn: 10, tokensOut: 20, provider: 'anthropic', model: 'test-model' }, record: async () => {} };
        },
      },
    };
  },
}));

const ACCOUNT = 'f9a00000-0000-4000-8000-0000000000a1';
const CHILD = 'f9a00000-0000-4000-8000-0000000000c1';
const SIBLING = 'f9a00000-0000-4000-8000-0000000000c2';
const DEVICE = 'f9a00000-0000-4000-8000-0000000000d2';
const VERSION = 'f9a00000-0000-4000-8000-0000000000e1';

const explanation = (n: number): Block => ({ type: 'explanation', title: `Idea ${n}`, idea: `The idea ${n}.`, paragraphs: [`Paragraph ${n} one.`, `Paragraph ${n} two.`], example: `Example ${n}`, steps: ['a', 'b'], terms: [] });
const KEY_POINTS: Block = { type: 'key_points', points: ['A key point that is never remembered.'] };

const item = (id: string) => ({ id, question: `Question ${id}?`, options: ['10', '12', '14', '16'], answer: 1, hint: 'Think of pairs.', why: 'Because 6 + 6 = 12.', wrong: ['Counted one pair', '', 'Added two', 'Doubled twice'] });
const ANSWER = [
  JSON.stringify({ type: 'subject', subject: 'mathematics' }),
  JSON.stringify({ type: 'explanation', title: 'Equal parts', idea: 'Equal fractions name the same part.', paragraphs: ['Half of a roti is the same as two quarters.'], example: '1/2 = 2/4', steps: ['Multiply', 'Compare'], terms: [] }),
  JSON.stringify({ type: 'check', items: [item('c1'), item('c2')] }),
  JSON.stringify({ type: 'practice', items: [item('p1')] }),
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
type Client = { query: (s: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };
const fam = async <R,>(fn: (c: Client) => Promise<R>, device: { deviceId: string; childId: string } | null = null): Promise<R> =>
  (await import('@/lib/auth/db')).withFamilyContext({ accountId: ACCOUNT, tokenVersion: 0, device }, fn as never) as Promise<R>;
const cookie = async (child: string) => {
  const { signFamilySession } = await import('@/lib/family/session');
  return `ncf_session=${await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' })}; ncf_child=${child}`;
};
const ask = async (child: string, text: string, tutor: Record<string, unknown>) => {
  const { POST } = await import('@/app/api/family/understand/route');
  return POST(new NextRequest('http://localhost/api/family/understand', { method: 'POST', headers: { 'content-type': 'application/json', cookie: await cookie(child) }, body: JSON.stringify({ kind: 'question', text, tutor }) }));
};
const events = async (res: Response) => (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
const turnInput = (chatId: string, n: number, subject = 'science') => ({ accountId: ACCOUNT, childId: CHILD, chatId, subject, text: `Question ${n}?`, chapterKey: null, blockId: null, files: [], blocks: [explanation(n), KEY_POINTS] });

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-w9a-chats-0123456789';
  await db.pg.exec(`
    update control.settings set value = '[]'::jsonb where key in ('family.open_subjects', 'family.reviewed_only_subjects');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'chats@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CHILD}', '${ACCOUNT}', 'Aarav', 9, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${SIBLING}', '${ACCOUNT}', 'Meera', 9, 'CBSE', 'en', 'en', 'IN-HR');
    insert into family.child_devices (device_id, account_id, child_id) values ('${DEVICE}', '${ACCOUNT}', '${SIBLING}');
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
      values ('${VERSION}', 'CBSE', 9, 'mathematics', '2026-27', 1, 'published', 'everyone', 'repository', 'test', 'f9a00000-0000-4000-8000-0000000000f1', now());
  `);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('the migration (C406)', () => {
  it('lets a child keep several chats in one subject, and adds the summary workload with no provider', async () => {
    expect(await q(`select conname from pg_constraint where conname = 'tutor_conversations_child_id_subject_key'`)).toEqual([]);
    expect(await q(`select carries_child_words, provider_id, prompt_version, max_output_tokens from control.ai_profiles where profile_id = 'family.summary'`)).toEqual([
      { carries_child_words: true, provider_id: null, prompt_version: 'v1', max_output_tokens: 400 },
    ]);
    await expect(q(`insert into family.tutor_conversations (account_id, child_id, subject, status) values ($1, $2, 'english', 'closed')`, [ACCOUNT, CHILD])).rejects.toThrow(/check/);
  });
});

describe('chats (C406)', () => {
  it('a 16th chat in a subject archives the least recently used', async () => {
    const t = await import('@/lib/family/tutor');
    const made: string[] = [];
    for (let i = 0; i < 16; i++) made.push(await fam((c) => t.newChat(c, ACCOUNT, CHILD, 'english')));
    const listed = await fam((c) => t.listChats(c, ACCOUNT, CHILD, 'english'));
    expect(listed).toHaveLength(15);
    expect(listed[0].chatId).toBe(made[15]);
    expect(listed.map((c) => c.chatId)).not.toContain(made[0]);
    expect(await q(`select status from family.tutor_conversations where conversation_id = $1`, [made[0]])).toEqual([{ status: 'archived' }]);
    // openChat answers with the newest open chat; an archived one is never answered in.
    expect(await fam((c) => t.openChat(c, ACCOUNT, CHILD, 'english'))).toBe(made[15]);
    expect(await fam((c) => t.appendTurn(c, { ...turnInput(made[0], 1), subject: 'english' }))).toEqual({ ok: false, error: 'not_found' });
  });

  it('the 31st child turn is refused with chat_full, and nothing of it is written', async () => {
    const t = await import('@/lib/family/tutor');
    const chat = await fam((c) => t.newChat(c, ACCOUNT, CHILD, 'science'));
    await fam(async (c) => {
      for (let n = 1; n <= 30; n++) expect(await t.appendTurn(c, turnInput(chat, n))).toEqual({ ok: true, turnCount: n, subject: 'science' });
    });
    expect(await q(`select title, turn_count, status from family.tutor_conversations where conversation_id = $1`, [chat])).toEqual([{ title: 'Question 1?', turn_count: 30, status: 'full' }]);
    expect(await fam((c) => t.appendTurn(c, turnInput(chat, 31)))).toEqual({ ok: false, error: 'chat_full' });
    expect(await q(`select count(*)::int as n from family.tutor_messages where conversation_id = $1`, [chat])).toEqual([{ n: 60 }]);
    // saveTurn, as the route keeps an answer, moves on to a new open chat instead of dropping it.
    const kept = await fam((c) => t.saveTurn(c, turnInput(chat, 31)));
    expect(kept?.chatId).not.toBe(chat);
    expect(kept?.turnCount).toBe(1);
  });

  it('memoryFor gives the summary and the last 6 turns, with the tutor’s explanation paragraphs only', async () => {
    const t = await import('@/lib/family/tutor');
    const chat = await fam((c) => t.newChat(c, ACCOUNT, CHILD, 'hindi'));
    await fam(async (c) => {
      for (let n = 1; n <= 4; n++) await t.appendTurn(c, { ...turnInput(chat, n), subject: 'hindi' });
    });
    await q(`update family.tutor_conversations set summary = 'Earlier: questions one and two.' where conversation_id = $1`, [chat]);
    const memory = await fam((c) => t.memoryFor(c, chat));
    expect(memory.summary).toBe('Earlier: questions one and two.');
    expect(memory.turns).toEqual([
      { role: 'child', text: 'Question 2?' },
      { role: 'tutor', text: 'Paragraph 2 one. Paragraph 2 two.' },
      { role: 'child', text: 'Question 3?' },
      { role: 'tutor', text: 'Paragraph 3 one. Paragraph 3 two.' },
      { role: 'child', text: 'Question 4?' },
      { role: 'tutor', text: 'Paragraph 4 one. Paragraph 4 two.' },
    ]);
    expect(JSON.stringify(memory)).not.toContain('key point');
    // Each remembered turn is at most 600 characters.
    await fam((c) => t.appendTurn(c, { ...turnInput(chat, 5), subject: 'hindi', text: 'x'.repeat(500), blocks: [{ ...(explanation(5) as Extract<Block, { type: 'explanation' }>), paragraphs: ['y'.repeat(900)] }] }));
    const longer = await fam((c) => t.memoryFor(c, chat));
    expect(Math.max(...longer.turns.map((x) => x.text.length))).toBeLessThanOrEqual(600);
  });
});

describe('the route sends the chat to the tutor (C406)', () => {
  it('a third question is asked with the earlier turns in its prompt, and the summary is rewritten at the fifth', async () => {
    ai.lines = ANSWER;
    const first = await events(await ask(CHILD, 'Why is 1/2 the same as 2/4?', { subject: 'mathematics' }));
    expect(first.at(-1)).toEqual({ t: 'done', complete: true, missing: [], cut: false, chat: { chatId: expect.any(String), subject: 'mathematics' } });
    const [chat] = await q(`select conversation_id from family.tutor_conversations where child_id = $1 and subject = 'mathematics'`, [CHILD]);
    const chatId = String(chat.conversation_id);
    await events(await ask(CHILD, 'Can you show it with a roti?', { subject: 'mathematics', chatId }));
    await events(await ask(CHILD, 'and why is that?', { subject: 'mathematics', chatId }));
    const third = ai.calls.filter((c) => c.profile === 'family.resolver').at(-1)!;
    expect(third.system + '\n' + third.user).toContain('Earlier in this chat');
    expect(third.system + '\n' + third.user).toContain('Why is 1/2 the same as 2/4?');
    expect(third.system + '\n' + third.user).toContain('Can you show it with a roti?');
    expect(third.system + '\n' + third.user).toContain('Half of a roti is the same as two quarters.');
    expect(third.system + '\n' + third.user).toContain('refer back to what was already explained');
    // The check and practice items never reach the memory.
    expect(third.system + '\n' + third.user).not.toContain('Think of pairs');
    expect(ai.calls.some((c) => c.profile === 'family.summary')).toBe(false);
    await events(await ask(CHILD, 'What about 3/6?', { subject: 'mathematics', chatId }));
    await events(await ask(CHILD, 'And 4/8?', { subject: 'mathematics', chatId }));
    const summary = ai.calls.filter((c) => c.profile === 'family.summary');
    expect(summary).toHaveLength(1);
    expect(summary[0].user).toContain('Why is 1/2 the same as 2/4?');
    expect(await q(`select turn_count, summary, summary_turns from family.tutor_conversations where conversation_id = $1`, [chatId])).toEqual([{ turn_count: 5, summary: ai.summary, summary_turns: 5 }]);
    // The next question sees the summary.
    await events(await ask(CHILD, 'So is 5/10 a half too?', { subject: 'mathematics', chatId }));
    { const last = ai.calls.filter((c) => c.profile === 'family.resolver').at(-1)!; expect(last.system + '\n' + last.user).toContain(ai.summary.replace(/\.$/, '')); }
  });

  it('a new question in a full chat is refused with 409 chat_full before the tutor is asked', async () => {
    const [chat] = await q(`select conversation_id from family.tutor_conversations where child_id = $1 and subject = 'mathematics' and status = 'open'`, [CHILD]);
    await q(`update family.tutor_conversations set turn_count = 30, status = 'full' where conversation_id = $1`, [chat.conversation_id]);
    const before = ai.calls.length;
    const res = await ask(CHILD, 'One more question?', { subject: 'mathematics', chatId: chat.conversation_id });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'chat_full' });
    expect(ai.calls.length).toBe(before);
  });
});

describe('a sibling never reads another child’s chat (C406)', () => {
  it('through the routes and the policies', async () => {
    const [chat] = await q(`select conversation_id from family.tutor_conversations where child_id = $1 and subject = 'mathematics' order by last_at desc limit 1`, [CHILD]);
    const chatId = String(chat.conversation_id);
    // The chat list and its turns, asked for by the sibling's phone naming the other child's chat.
    const { GET } = await import('@/app/api/family/tutor/route');
    const res = await GET(new NextRequest(`http://localhost/api/family/tutor?subject=mathematics&chat=${chatId}`, { headers: { cookie: await cookie(SIBLING) } }));
    expect(await res.json()).toEqual({ chats: [], chatId: null, turns: [] });
    // A question naming the other child's chat is asked without its memory and kept in the sibling's own chat.
    ai.lines = ANSWER;
    await events(await ask(SIBLING, 'What is a fraction?', { subject: 'mathematics', chatId }));
    const asked = ai.calls.filter((c) => c.profile === 'family.resolver').at(-1)!;
    expect(asked.system + '\n' + asked.user).not.toContain('Earlier in this chat');
    expect(asked.system + '\n' + asked.user).not.toContain('Why is 1/2 the same as 2/4?');
    expect(await q(`select count(*)::int as n from family.tutor_messages where conversation_id = $1 and child_id = $2`, [chatId, SIBLING])).toEqual([{ n: 0 }]);
    // On the sibling's own phone the policies show none of the other child's chats or turns, whatever is named.
    const t = await import('@/lib/family/tutor');
    const device = { deviceId: DEVICE, childId: SIBLING };
    expect(await fam((c) => t.listChats(c, ACCOUNT, CHILD, 'mathematics'), device)).toEqual([]);
    expect(await fam((c) => t.memoryFor(c, chatId), device)).toEqual({ summary: null, turns: [] });
    expect(await fam((c) => t.resolveChat(c, ACCOUNT, CHILD, 'mathematics', chatId), device)).toBeNull();
  });
});

describe('the chat keeps its subject and the follow-up stays in it (W10, C411)', () => {
  const SCIENCE = [
    JSON.stringify({ type: 'subject', subject: 'science' }),
    JSON.stringify({ type: 'explanation', title: 'Plants make food', idea: 'Leaves make food from light.', paragraphs: ['Green leaves use sunlight, water and air to make sugar.'], example: 'A leaf in the sun', steps: ['Light', 'Sugar'], terms: [] }),
    JSON.stringify({ type: 'check', items: [item('s1')] }),
    JSON.stringify({ type: 'practice', items: [item('s2')] }),
  ];

  it('a chat opened from the Mathematics tab whose first question is about photosynthesis becomes a Science chat; the follow-up stays in it with its memory', async () => {
    await q(`update control.settings set value = '["science"]'::jsonb where key = 'family.open_subjects'`);
    const t = await import('@/lib/family/tutor');
    const chatId = await fam((c) => t.newChat(c, ACCOUNT, CHILD, 'mathematics'));
    ai.lines = SCIENCE;
    const first = await events(await ask(CHILD, 'What is photosynthesis?', { subject: 'mathematics', chatId }));
    // The answer names the chat and its new subject, so the window lists it under Science.
    expect(first.at(-1)).toEqual({ t: 'done', complete: true, missing: [], cut: false, chat: { chatId, subject: 'science' } });
    expect(await q(`select subject, turn_count from family.tutor_conversations where conversation_id = $1`, [chatId])).toEqual([{ subject: 'science', turn_count: 1 }]);

    // The follow-up typed with the Mathematics tab still selected goes to that chat, with its turns in the prompt, and
    // the subject line is decided from the question and the earlier turns together.
    await events(await ask(CHILD, 'can you show it with an example?', { subject: 'mathematics', chatId }));
    const follow = ai.calls.filter((c) => c.profile === 'family.resolver').at(-1)!;
    expect(follow.system).toContain('Earlier in this chat');
    expect(follow.system).toContain('Student: What is photosynthesis?');
    expect(follow.system).toContain('decided from the question and the earlier turns of this chat together');
    expect(await q(`select subject, turn_count from family.tutor_conversations where conversation_id = $1`, [chatId])).toEqual([{ subject: 'science', turn_count: 2 }]);

    // A later turn decided in another subject stays in the chat; the chat keeps its subject.
    ai.lines = ANSWER;
    const later = await events(await ask(CHILD, 'and how many halves make one?', { subject: 'mathematics', chatId }));
    expect(later.at(-1)).toMatchObject({ t: 'done', chat: { chatId, subject: 'science' } });
    expect(await q(`select subject, turn_count from family.tutor_conversations where conversation_id = $1`, [chatId])).toEqual([{ subject: 'science', turn_count: 3 }]);
    await q(`update control.settings set value = '[]'::jsonb where key = 'family.open_subjects'`);
  });
});
