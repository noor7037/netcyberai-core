import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { calc, checkBlock, completeResponse, parseBlockLine, plain, allowedSource, type Block } from '@/lib/family/blocks';

// M1-5 (C251): Understand. The blocks are data checked against their shapes (script in every field is taken out,
// arithmetic is recomputed, links come from the allowlist); answers never reach the phone; a topic's complete response
// is kept in the shared library and served from it next time; a typed question is never kept; the request carries no
// child's name. The model is replaced by a scripted stream: the AI platform itself is tested in test/ai.

const ai = vi.hoisted(() => ({ lines: [] as string[], calls: [] as { system: string; user: string }[], refuse: null as null | string }));
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async () => 'v1',
  streamText: async (_db: unknown, _ctx: unknown, _p: unknown, req: { system: string; messages: { content: string }[] }, onDelta: (t: string) => void) => {
    ai.calls.push({ system: req.system, user: req.messages[0].content });
    if (ai.refuse) return { ok: false, reason: ai.refuse };
    for (const l of ai.lines) onDelta(`${l}\n`);
    return { ok: true, text: ai.lines.join('\n'), tokensIn: 10, tokensOut: 20, provider: 'anthropic', model: 'test-model' };
  },
}));

const item = (id: string, extra: Record<string, unknown> = {}) => ({ id, question: `Question ${id}?`, options: ['10', '12', '14', '16'], answer: 1, hint: 'Think of pairs.', why: 'Because 6 + 6 = 12.', wrong: ['Counted one pair', '', 'Added two', 'Doubled twice'], ...extra });
const GOOD = [
  { type: 'explanation', title: 'Adding', idea: 'Adding puts groups together.', example: 'Two rotis and three rotis make five rotis.', steps: ['Count the first group', 'Count on'], terms: [{ en: 'sum', local: 'jod' }] },
  { type: 'worked_example', problem: 'What is 6 + 6?', steps: [{ text: 'Add', expression: '6+6', result: '12' }], answer: '12' },
  { type: 'check', items: [item('c1'), item('c2')] },
  { type: 'practice', items: [item('p1', { expression: '3*4' })] },
  { type: 'english_moment', words: [{ en: 'sum', meaning: 'jod' }], sentence: 'The sum is twelve.', pattern: 'The sum of A and B is C.', sayIt: 'The sum is twelve.' },
];

describe('blocks', () => {
  it('takes markup out of every text field, and drops unknown types', () => {
    const evil = '<script>alert(1)</script>**bold** <img src=x onerror=alert(1)>';
    const b = checkBlock({ ...GOOD[0], title: evil, idea: evil, example: evil, steps: [evil, evil], terms: [{ en: evil, local: evil }] }) as Extract<Block, { type: 'explanation' }>;
    expect(JSON.stringify(b)).not.toMatch(/<|>|\*\*/);
    expect(checkBlock({ type: 'html', html: '<b>x</b>' })).toBeNull();
    expect(checkBlock({ type: 'code', code: 'alert(1)' })).toBeNull();
    expect(plain('# Heading\n`code` [link](https://x)', 100)).toBe('Heading code link');
  });

  it('recomputes arithmetic: one wrong step drops the worked example; a wrong key drops the item', () => {
    expect(checkBlock(GOOD[1])).not.toBeNull();
    expect(checkBlock({ ...GOOD[1], steps: [{ text: 'Add', expression: '6+6', result: '13' }] })).toBeNull();
    expect(checkBlock({ type: 'check', items: [item('c1', { expression: '5*3' })] })).toBeNull();
    expect(calc('(12+8)*3')).toBe(60);
    expect(calc('2^3+10%')).toBeCloseTo(8.1);
    expect(calc('1/0')).toBeNull();
    expect(calc('process.exit(1)')).toBeNull();
    expect(calc('alert(1)')).toBeNull();
  });

  it('keeps links only to official https pages', () => {
    expect(allowedSource('https://ncert.nic.in/textbook.php')).toBe(true);
    expect(allowedSource('http://ncert.nic.in/')).toBe(false);
    expect(allowedSource('https://ncert.nic.in.evil.example/')).toBe(false);
    expect(allowedSource('javascript:alert(1)')).toBe(false);
    expect(checkBlock({ type: 'sources', links: [{ label: 'x', url: 'https://example.org/' }] })).toBeNull();
  });

  it('a response needs an explanation, a check and practice', () => {
    const parsed = GOOD.map((g) => parseBlockLine(JSON.stringify(g))).filter((b): b is Block => b !== null);
    expect(completeResponse(parsed)?.map((b) => b.type)).toEqual(['explanation', 'worked_example', 'check', 'practice', 'english_moment']);
    expect(completeResponse(parsed.filter((b) => b.type !== 'practice'))).toBeNull();
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: Record<string, any>;
const ACCOUNT = 'f5000000-0000-4000-8000-0000000000a1';
const OTHER = 'f5000000-0000-4000-8000-0000000000b1';
const CHILD = 'f5000000-0000-4000-8000-0000000000a2';
const OTHER_CHILD = 'f5000000-0000-4000-8000-0000000000b2';
const VERSION = 'f5000000-0000-4000-8000-0000000000c1';
const TOPIC = 'cbse.c9.mathematics.u1.ch01.t01';
let jar: Record<string, string>;
let otherJar: Record<string, string>;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-understand-tests-0123456789';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'understand@example.org'), ('${OTHER}', 'other@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1'), ('${OTHER}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CHILD}', '${ACCOUNT}', 'Meera', 9, 'CBSE', 'en', 'hinglish', 'IN-UP'), ('${OTHER_CHILD}', '${OTHER}', 'Ravi', 9, 'CBSE', 'en', 'en', 'IN-HR');
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
      values ('${VERSION}', 'CBSE', 9, 'mathematics', '2026-27', 1, 'published', 'everyone', 'repository', 'test', 'f5000000-0000-4000-8000-0000000000f1', now());
    insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, source_url, source_page, checked_on)
      values ('f5000000-0000-4000-8000-0000000000d1', '${VERSION}', 'cbse.c9.mathematics.u1.ch01', 1, 'Number System', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
    insert into content.topics (version_id, chapter_id, topic_key, position, title_en, source_url, source_page, checked_on)
      values ('${VERSION}', 'f5000000-0000-4000-8000-0000000000d1', '${TOPIC}', 1, 'Rational numbers', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
  `);
  const { signFamilySession } = await import('@/lib/family/session');
  jar = { ncf_session: await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' }), ncf_child: CHILD };
  otherJar = { ncf_session: await signFamilySession({ accountId: OTHER, tokenVersion: 0, sessionId: 's2' }), ncf_child: OTHER_CHILD };
  R = { understand: await import('@/app/api/family/understand/route'), check: await import('@/app/api/family/check/route') };
}, 90_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

const post = (path: string, body: unknown, j: Record<string, string>) =>
  new NextRequest(`http://localhost${path}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: Object.entries(j).map(([k, v]) => `${k}=${v}`).join('; ') }, body: JSON.stringify(body) });
const events = async (res: Response) => (await res.text()).trim().split('\n').map((l) => JSON.parse(l));

describe('Understand, end to end', () => {
  it('streams checked blocks, never an answer, and keeps a complete topic response as AI-made', async () => {
    ai.lines = [...GOOD.map((g) => JSON.stringify(g)), '{"type":"explanation","title":"second","idea":"x","example":"y","steps":["a","b"],"terms":[]}', 'not json', '{"type":"html","html":"<b>"}'];
    const ev = await events(await R.understand.POST(post('/api/family/understand', { kind: 'topic', key: TOPIC }, jar)));
    expect(ev[0]).toMatchObject({ t: 'meta', label: 'ai_made', cached: false });
    const blocks = ev.filter((e) => e.t === 'block').map((e) => e.block);
    expect(blocks.map((b) => b.type)).toEqual(['explanation', 'worked_example', 'check', 'practice', 'english_moment']);
    const check = blocks.find((b) => b.type === 'check');
    expect(Object.keys(check.items[0]).sort()).toEqual(['id', 'options', 'question', 'token']);
    expect(JSON.stringify(blocks)).not.toContain('Think of pairs');
    expect(ev.at(-1)).toEqual({ t: 'done', complete: true });
    const kept = (await db.pg.query(`select status, topic_key, language, style, prompt_version from content.responses`)).rows;
    expect(kept).toEqual([{ status: 'ai_made', topic_key: TOPIC, language: 'en', style: 'hinglish', prompt_version: 'v1' }]);
    // The request names no child, and asks in the child's explanation style.
    expect(JSON.stringify(ai.calls)).not.toContain('Meera');
    expect(ai.calls[0].system).toMatch(/Hinglish/);
  });

  it('serves the same topic from the library next time, without asking the AI', async () => {
    const before = ai.calls.length;
    const ev = await events(await R.understand.POST(post('/api/family/understand', { kind: 'topic', key: TOPIC }, jar)));
    expect(ev[0]).toMatchObject({ t: 'meta', cached: true, label: 'ai_made' });
    expect(ai.calls.length).toBe(before);
    await db.pg.query(`update content.responses set status = 'checked', checked_by = 'f5000000-0000-4000-8000-0000000000f1', checked_at = now()`);
    const checked = await events(await R.understand.POST(post('/api/family/understand', { kind: 'topic', key: TOPIC }, jar)));
    expect(checked[0]).toMatchObject({ t: 'meta', label: 'checked' });
  });

  it('the page draws a library response only for the child’s free subject, sealed, without asking the AI (C255)', async () => {
    const { libraryResponse, syllabusLine } = await import('@/lib/family/resolver');
    const { withFamilyContext } = await import('@/lib/family/db');
    const { listChildren } = await import('@/lib/family/children');
    const before = ai.calls.length;
    await withFamilyContext({ accountId: ACCOUNT, tokenVersion: 0 }, async (c) => {
      const child = (await listChildren(c, ACCOUNT)).find((x) => x.childId === CHILD)!;
      const line = (await syllabusLine(c, child, { kind: 'topic', key: TOPIC }))!;
      const ev = (await libraryResponse(c, { accountId: ACCOUNT, child }, line))!;
      expect(ev[0]).toMatchObject({ t: 'meta', cached: true });
      expect(ev.at(-1)).toEqual({ t: 'done', complete: true });
      expect(JSON.stringify(ev)).not.toContain('Think of pairs');
      // A subject not yet claimed (drawing a page never claims one), another subject, or another style: the phone asks.
      expect(await libraryResponse(c, { accountId: ACCOUNT, child: { ...child, freeSubject: null } }, line)).toBeNull();
      expect(await libraryResponse(c, { accountId: ACCOUNT, child: { ...child, freeSubject: 'science' } }, line)).toBeNull();
      expect(await libraryResponse(c, { accountId: ACCOUNT, child: { ...child, style: 'en' } }, line)).toBeNull();
    });
    expect(ai.calls.length).toBe(before);
  });

  it('a typed question and a follow-up are never kept in the library', async () => {
    ai.lines = GOOD.map((g) => JSON.stringify(g));
    await events(await R.understand.POST(post('/api/family/understand', { kind: 'question', text: 'Meera asks: why is 6+6 twelve?', subject: 'mathematics' }, jar)));
    await events(await R.understand.POST(post('/api/family/understand', { kind: 'topic', key: TOPIC, followUp: 'simpler' }, jar)));
    expect((await db.pg.query(`select count(*)::int n from content.responses`)).rows[0].n).toBe(1);
    expect(ai.calls.at(-1)!.system).toMatch(/SIMPLER/);
  });

  it('says plainly when explanations are not switched on', async () => {
    ai.refuse = 'not_switched_on';
    const ev = await events(await R.understand.POST(post('/api/family/understand', { kind: 'question', text: 'What is a prime number?', subject: 'mathematics' }, jar)));
    ai.refuse = null;
    expect(ev).toEqual([{ t: 'refused', reason: 'not_switched_on', message: 'Explanations are not switched on yet' }]);
  });

  it('checks answers on the server: hint first, then why or the exact misunderstanding; another child’s token is refused', async () => {
    ai.lines = GOOD.map((g) => JSON.stringify(g));
    const ev = await events(await R.understand.POST(post('/api/family/understand', { kind: 'question', text: 'What is 6 + 6?', subject: 'mathematics' }, jar)));
    const token = ev.find((e) => e.t === 'block' && e.block.type === 'check').block.items[0].token;
    expect(await (await R.check.POST(post('/api/family/check', { token, hint: true }, jar))).json()).toEqual({ hint: 'Think of pairs.' });
    expect(await (await R.check.POST(post('/api/family/check', { token, choice: 0 }, jar))).json()).toEqual({ correct: false, explanation: 'Counted one pair', answer: null });
    expect(await (await R.check.POST(post('/api/family/check', { token, choice: 1 }, jar))).json()).toEqual({ correct: true, explanation: 'Because 6 + 6 = 12.', answer: 1 });
    expect((await R.check.POST(post('/api/family/check', { token, choice: 1 }, otherJar))).status).toBe(404);
    expect((await R.check.POST(post('/api/family/check', { token: token.slice(0, -2) + 'AA', choice: 1 }, jar))).status).toBe(404);
  });

  it('a wrong answer brings a different explanation of that exact misunderstanding', async () => {
    ai.lines = GOOD.map((g) => JSON.stringify(g));
    const ev = await events(await R.understand.POST(post('/api/family/understand', { kind: 'topic', key: TOPIC, followUp: 'practise_more' }, jar)));
    const token = ev.find((e) => e.t === 'block' && e.block.type === 'check').block.items[0].token;
    await events(await R.understand.POST(post('/api/family/understand', { retry: { token, choice: 3 } }, jar)));
    expect(ai.calls.at(-1)!.system).toContain('Doubled twice');
    expect(ai.calls.at(-1)!.user).toContain('Rational numbers');
  });
});
