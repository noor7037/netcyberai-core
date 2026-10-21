import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { calc, checkBlock, completeResponse, parseBlockLine, plain, allowedSource, type Block } from '@/lib/family/blocks';

// M1-5 (C251): Understand. The blocks are data checked against their shapes (script in every field is taken out,
// arithmetic is recomputed, links come from the allowlist); answers never reach the phone; a topic's complete response
// is kept in the shared library and served from it next time; a typed question is never kept; the request carries no
// child's name. The model is replaced by a scripted stream: the AI platform itself is tested in test/ai.

const ai = vi.hoisted(() => ({ lines: [] as string[], calls: [] as { system: string; user: string }[], refuse: null as null | string, duringCall: null as null | (() => Promise<void>) }));
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async () => 'v1',
  prepareText: async (_db: unknown, _ctx: unknown, _p: unknown, req: { system: string; messages: { content: string }[] }) => {
    ai.calls.push({ system: req.system, user: req.messages[0].content });
    if (ai.refuse) return { ok: false, reason: ai.refuse };
    const lines = [...ai.lines];
    return {
      ok: true,
      text: {
        send: async (onDelta: (t: string) => void) => {
          // Something another request does while this call is out (no connection is held now).
          if (ai.duringCall) await ai.duringCall();
          for (const l of lines) onDelta(`${l}\n`);
          return { result: { ok: true, text: lines.join('\n'), tokensIn: 10, tokensOut: 20, provider: 'anthropic', model: 'test-model' }, record: async () => {} };
        },
      },
    };
  },
}));
// The line a typed question's answer starts with: the subject the model names (prompt v2, F1-3).
const named = (subject: string) => JSON.stringify({ type: 'subject', subject });

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
    ai.lines = [named('mathematics'), ...GOOD.map((g) => JSON.stringify(g))];
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
    ai.lines = [named('mathematics'), ...GOOD.map((g) => JSON.stringify(g))];
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

  it('Nursery to UKG: nothing is explained, the plain note is shown, the AI is not asked (C263)', async () => {
    const tiny = 'f5000000-0000-4000-8000-0000000000a3';
    await db.pg.query(`insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ($1, $2, 'Tiya', -1, 'CBSE', 'en', 'en', 'IN-UP')`, [tiny, ACCOUNT]);
    const before = ai.calls.length;
    const ev = await events(await R.understand.POST(post('/api/family/understand', { kind: 'question', text: 'What is a circle?' }, { ...jar, ncf_child: tiny })));
    expect(ev).toEqual([{ t: 'refused', reason: 'not_found', message: expect.stringMatching(/Nursery, LKG and UKG/) }]);
    expect(ai.calls.length).toBe(before);
    await db.pg.query(`delete from family.children where child_id = $1`, [tiny]);
  });

  it('"our state\u2019s board" reads that state\u2019s own syllabus (ST-<state>), and names the state board to the AI (C263)', async () => {
    const kid = 'f5000000-0000-4000-8000-0000000000a4';
    const v = 'f5000000-0000-4000-8000-0000000000c9';
    await db.pg.exec(`
      insert into content.boards (board_id, name_en) values ('ST-MH', 'Maharashtra board (test)');
      insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
        values ('${v}', 'ST-MH', 9, 'mathematics', '2026-27', 1, 'published', 'everyone', 'repository', 'test', 'f5000000-0000-4000-8000-0000000000f1', now());
      insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, source_url, source_page, checked_on)
        values ('f5000000-0000-4000-8000-0000000000d9', '${v}', 'st-mh.c9.mathematics.ch01', 1, 'Sets', 'https://example.org/', '1', '2026-10-22');
      insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code, free_subject)
        values ('${kid}', '${ACCOUNT}', 'Sai', 9, 'STATE', 'en', 'en', 'IN-MH', 'mathematics');
    `);
    ai.lines = GOOD.map((g) => JSON.stringify(g));
    const ev = await events(await R.understand.POST(post('/api/family/understand', { kind: 'chapter', key: 'st-mh.c9.mathematics.ch01' }, { ...jar, ncf_child: kid })));
    expect(ev[0]).toMatchObject({ t: 'meta', title: 'Sets' });
    expect(ai.calls.at(-1)!.system).toContain('Maharashtra state board');
    // The same chapter is not found for a CBSE child.
    const cbse = await events(await R.understand.POST(post('/api/family/understand', { kind: 'chapter', key: 'st-mh.c9.mathematics.ch01' }, jar)));
    expect(cbse[0]).toMatchObject({ t: 'refused', reason: 'not_found' });
    await db.pg.query(`delete from family.children where child_id = $1`, [kid]);
  });
});

// F1-3: the server decides a typed question's subject. The model names it on its first line (prompt v2); nothing is
// shown before that line, and only a subject the child may use is answered. The screen's `subject` is never read.
describe('a typed question’s subject, decided on the server', () => {
  const answer = (subject: string) => [named(subject), ...GOOD.map((g) => JSON.stringify(g))];
  const ask = async (text: string, j: Record<string, string>, screenSubject: string) => events(await R.understand.POST(post('/api/family/understand', { kind: 'question', text, subject: screenSubject }, j)));
  const freeSubject = async (child: string) => (await db.pg.query(`select free_subject from family.children where child_id = $1`, [child])).rows[0].free_subject;

  it('the prompt names the subject first under the latest version (v3), whatever Control chose; a topic keeps v1, word for word', async () => {
    const { resolverPrompt } = await import('@/lib/ai/prompts/family.resolver');
    const v1 = await import('@/lib/ai/prompts/family.resolver/v1');
    expect(resolverPrompt('v1', true).version).toBe('v3');
    expect(resolverPrompt('v1', false).version).toBe('v1');
    expect(resolverPrompt('v2', true).version).toBe('v2');
    expect(resolverPrompt('v9', false).version).toBe('v3');
    expect(resolverPrompt(null, true).version).toBe('v3');
    const topic = { board: 'CBSE', classLevel: 9, subject: 'mathematics', openSubjects: ['mathematics'], classSubjects: ['mathematics', 'science'], chapter: 'Number System', topic: 'Rational numbers', question: null, language: 'en' as const, style: 'en' as const, followUp: null, misconception: null };
    expect(resolverPrompt('v2', false).system(topic)).toBe(v1.resolverSystem({ ...topic, subject: 'mathematics' }));
    expect(resolverPrompt('v3', false).user(topic)).toBe(v1.resolverUser({ ...topic, subject: 'mathematics' }));
    expect(() => resolverPrompt('v1', false).system({ ...topic, subject: null })).toThrow();
    // v3 names the subject from the class's own list (C264).
    const question = { ...topic, subject: null, topic: null, chapter: null, question: 'Who wrote the Ramayana?', classSubjects: ['mathematics', 'science', 'social_science', 'english', 'hindi'] };
    expect(resolverPrompt('v3', true).system(question)).toContain('one of mathematics, science, social_science, english, hindi');
  });

  it('reads the subject line only when it is one', async () => {
    const { namedSubject } = await import('@/lib/family/resolver');
    expect(namedSubject('{"type":"subject","subject":"science"}')).toBe('science');
    // A subject the app knows is read as itself (whether it is in the child's class is checked later); anything else is "other".
    expect(namedSubject(' {"type": "subject", "subject": "history"} ')).toBe('history');
    expect(namedSubject('{"type":"subject","subject":"astrology"}')).toBe('other');
    expect(namedSubject('{"type":"explanation","subject":"science"}')).toBeNull();
    expect(namedSubject('{"type":"subject","subject":"science"')).toBeNull();
    expect(namedSubject('{"type":"subject","subject":7}')).toBeNull();
  });

  it('a known subject outside the child\u2019s class is "another subject" (C264): Physics for a Class 9 child', async () => {
    ai.lines = answer('physics');
    const ev = await ask('What is momentum?', jar, 'mathematics');
    expect(ev).toEqual([{ t: 'refused', reason: 'other_subject', message: expect.any(String) }]);
  });

  it('answers in the detected subject, not the one the screen sent', async () => {
    ai.lines = answer('mathematics');
    const ev = await ask('Why is 6 + 6 twelve?', jar, 'science');
    expect(ev[0]).toMatchObject({ t: 'meta', subject: 'mathematics', topicKey: null });
    expect(ev.at(-1)).toEqual({ t: 'done', complete: true });
    const call = ai.calls.at(-1)!;
    expect(call.system).toContain('{"type":"subject"');
    expect(call.system).toContain('may be answered only in: mathematics.');
    expect(call.user).not.toMatch(/science|mathematics/);
    // The sealed items are kept against the detected subject.
    const token = ev.find((e) => e.t === 'block' && e.block.type === 'check').block.items[0].token;
    const { openItem } = await import('@/lib/family/items');
    expect(openItem(token, { accountId: ACCOUNT, childId: CHILD })).toMatchObject({ s: 'mathematics', k: 'cbse.c9.mathematics.question' });
  });

  it('a question in a subject the child may not use is refused plainly, with a link to that subject: no block, no claim', async () => {
    expect(await freeSubject(CHILD)).toBe('mathematics');
    ai.lines = answer('science');
    const ev = await ask('Why does ice float?', jar, 'mathematics');
    expect(ev).toEqual([
      { t: 'refused', reason: 'not_open', message: 'This question is about Science. Science opens with Family Plus, which is not ready yet.', goTo: { subject: 'science', label: 'Go to Science' } },
    ]);
    expect(await freeSubject(CHILD)).toBe('mathematics');
  });

  it('another school subject, not school study, or no subject named: said plainly, nothing shown', async () => {
    const { en } = await import('@/lib/i18n/messages/en');
    ai.lines = [named('history'), ...GOOD.map((g) => JSON.stringify(g))];
    expect(await ask('Who built the Red Fort?', jar, 'mathematics')).toEqual([{ t: 'refused', reason: 'other_subject', message: en['fam.understand.otherSubject'] }]);
    ai.lines = ['{"type":"refuse"}'];
    expect(await ask('Tell me a joke about cricket', jar, 'mathematics')).toEqual([{ t: 'refused', reason: 'not_school_study', message: en['fam.understand.notStudy'] }]);
    // Blocks without the subject line first are never shown.
    ai.lines = GOOD.map((g) => JSON.stringify(g));
    expect(await ask('What is 6 + 6?', jar, 'mathematics')).toEqual([{ t: 'refused', reason: 'failed', message: en['ai.failed'] }]);
  });

  it('a child with no free subject claims the subject detected, never the screen’s; a refused question claims nothing (in Hindi)', async () => {
    const { hi } = await import('@/lib/i18n/messages/hi');
    await db.pg.query(`update family.children set language = 'hi' where child_id = $1`, [OTHER_CHILD]);
    expect(await freeSubject(OTHER_CHILD)).toBeNull();
    ai.lines = [named('other')];
    expect(await ask('Ramayana kisne likhi?', otherJar, 'mathematics')).toEqual([{ t: 'refused', reason: 'other_subject', message: hi['fam.understand.otherSubject'] }]);
    // Before a free subject is claimed, every subject of the class is open (C264: Class 9's school subjects).
    expect(ai.calls.at(-1)!.system).toContain('may be answered only in: mathematics or science or social_science or english or hindi.');
    expect(await freeSubject(OTHER_CHILD)).toBeNull();
    ai.lines = answer('science');
    const ev = await ask('Barf paani par kyon tairti hai?', otherJar, 'mathematics');
    expect(ev[0]).toMatchObject({ t: 'meta', subject: 'science' });
    expect(await freeSubject(OTHER_CHILD)).toBe('science');
    ai.lines = answer('mathematics');
    expect(await ask('6 aur 6 kitne hote hain?', otherJar, 'science')).toEqual([
      { t: 'refused', reason: 'not_open', message: 'यह सवाल गणित का है। गणित Family Plus के साथ खुलेगा, जो अभी तैयार नहीं है।', goTo: { subject: 'mathematics', label: 'गणित पर जाएँ' } },
    ]);
    expect(await freeSubject(OTHER_CHILD)).toBe('science');
  });

  it('two first questions at once: the subject claimed first stands, and the other answer is refused, not shown', async () => {
    await db.pg.query(`update family.children set free_subject = null, free_subject_set_at = null, language = 'en' where child_id = $1`, [OTHER_CHILD]);
    ai.lines = answer('mathematics');
    // While this mathematics question is with the model, another request claims science for the same child.
    ai.duringCall = async () => {
      await db.pg.query(`update family.children set free_subject = 'science', free_subject_set_at = now() where child_id = $1`, [OTHER_CHILD]);
    };
    try {
      expect(await ask('What is 6 + 6?', otherJar, 'mathematics')).toEqual([
        { t: 'refused', reason: 'not_open', message: 'This question is about Mathematics. Mathematics opens with Family Plus, which is not ready yet.', goTo: { subject: 'mathematics', label: 'Go to Mathematics' } },
      ]);
    } finally {
      ai.duringCall = null;
    }
    expect(await freeSubject(OTHER_CHILD)).toBe('science');
  });
});
