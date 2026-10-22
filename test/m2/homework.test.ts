import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { anthropicAdapter } from '@/lib/ai/adapters/anthropic';
import { openaiAdapter } from '@/lib/ai/adapters/openai';
import { firstNumber, givesAway, newLadder, openLadder, parseRead, sameAnswer, sealLadder, step, viewOf, type HomeworkRead } from '@/lib/family/homework';

// M2-6 (C280): the Socratic homework helper. Hints never carry the answer and the steps stop before it; a hint is
// earned by an attempt; "I'm stuck" after every hint or two tries; the phone never receives the answer. The photo is
// screened before any call (an Aadhaar card never reaches the AI), counted against the day's photo questions (a failed
// read is given back), and goes only with the photo to the profile; no child's name is in the request. Photos reach the
// vendors in their own wire format. The model is scripted; the OCR screen is mocked. Made-up names only.

const ai = vi.hoisted(() => ({ reply: '', requests: [] as unknown[], prepare: 'ok' as string, sendOk: true }));
const screen = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; reason?: string }, calls: 0 }));
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async () => 'v1',
  prepareText: async (_db: unknown, _ctx: unknown, _profile: unknown, request: unknown) => {
    ai.requests.push(request);
    if (ai.prepare !== 'ok') return { ok: false, reason: ai.prepare };
    return {
      ok: true,
      text: {
        send: async () => ({
          result: ai.sendOk ? { ok: true, text: ai.reply, tokensIn: 1, tokensOut: 1, provider: 'anthropic', model: 'm' } : { ok: false, reason: 'failed' },
          record: async () => {},
        }),
      },
    };
  },
}));
vi.mock('@/lib/privacy/upload-check', () => ({
  checkUpload: async () => {
    screen.calls += 1;
    return screen.result;
  },
}));

const READ = {
  status: 'ok',
  subject: 'mathematics',
  question: 'A rope 12 m long is cut into 4 equal pieces. How long is each piece?',
  hints: ['How many pieces are there?', 'Sharing equally means dividing.', 'Each piece is 3 m long.'],
  steps: ['Total length is 12 m.', 'There are 4 equal pieces.', 'Divide 12 by 4.', '12 ÷ 4 = 3, so each piece is 3 m.'],
  answer: '3 m',
  answer_kind: 'number',
  mistakes: [{ answer: '48 m', feedback: 'You multiplied; cutting into pieces means sharing the length.' }],
};
const read: HomeworkRead = { question: 'Q?', subject: 'mathematics', hints: ['h1', 'h2', 'h3'], steps: ['s1', 's2'], answer: '3 m', kind: 'number', mistakes: [] };
const CTX = { accountId: 'f8000000-0000-4000-8000-0000000000a1', childId: 'f8000000-0000-4000-8000-0000000000a2' };

describe('reading the model', () => {
  it('drops a hint that gives the answer away and stops the steps before it', () => {
    const r = parseRead(JSON.stringify(READ), ['mathematics', 'science']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.read.hints).toEqual(['How many pieces are there?', 'Sharing equally means dividing.']);
    expect(r.read.steps).toEqual(['Total length is 12 m.', 'There are 4 equal pieces.', 'Divide 12 by 4.']);
    expect(r.read.mistakes).toHaveLength(1);
  });
  it("keeps the model's refusals, and a subject outside the class becomes other", () => {
    for (const status of ['person', 'personal_info', 'no_question']) expect(parseRead(JSON.stringify({ status }), [])).toEqual({ ok: false, reason: status });
    expect(parseRead('not json', [])).toEqual({ ok: false, reason: 'failed' });
    const r = parseRead(JSON.stringify({ ...READ, subject: 'astrology' }), ['mathematics']);
    expect(r.ok && r.read.subject).toBe('other');
  });
  it('compares answers by value, letter or words', () => {
    expect(firstNumber('१२ ÷ ४')).toBe(12);
    expect(sameAnswer('3', '3 m', 'number')).toBe(true);
    expect(sameAnswer('6/2 m', '3 m', 'number')).toBe(true);
    expect(sameAnswer('(b)', 'B', 'choice')).toBe(true);
    expect(sameAnswer('Photosynthesis.', 'photosynthesis', 'word')).toBe(true);
    expect(sameAnswer('4', '3 m', 'number')).toBe(false);
    expect(givesAway('so it is 3.0 metres', '3 m', 'number')).toBe(true);
    expect(givesAway('12 ÷ 4 = 3', '3 m', 'number')).toBe(true);
    // A number that only appears is kept: small answers must not wipe out ordinary hints.
    expect(givesAway('Look at the 3 sides of the triangle first.', '3', 'number')).toBe(false);
  });
});

describe('the ladder', () => {
  it('earns each hint with an attempt, opens the steps when stuck, and never shows the answer', () => {
    let l = newLadder(read, CTX);
    expect(viewOf(l)).toMatchObject({ hints: [], canHint: true, canStuck: false, steps: null });
    let r = step(l, 'hint');
    expect(r.ok).toBe(true);
    l = (r as { ladder: typeof l }).ladder;
    expect(step(l, 'hint')).toEqual({ ok: false, reason: 'not_yet' });
    r = step(l, 'attempt', '5');
    l = (r as { ladder: typeof l }).ladder;
    expect((r as { result: unknown }).result).toEqual({ correct: false, feedback: null });
    l = (step(l, 'hint') as { ladder: typeof l }).ladder;
    l = (step(l, 'attempt', '6') as { ladder: typeof l }).ladder;
    expect(viewOf(l).canStuck).toBe(true);
    l = (step(l, 'stuck') as { ladder: typeof l }).ladder;
    expect(viewOf(l)).toMatchObject({ steps: ['s1', 's2'], hints: ['h1', 'h2', 'h3'] });
    expect(JSON.stringify(viewOf(l))).not.toContain('3 m');
    l = (step(l, 'attempt', '3') as { ladder: typeof l }).ladder;
    expect(viewOf(l).solved).toBe(true);
  });
  it('stops taking attempts after ten, so the answer cannot be found by trying them all', () => {
    let l = newLadder(read, CTX);
    for (let i = 0; i < 10; i++) l = (step(l, 'attempt', String(100 + i)) as { ladder: typeof l }).ladder;
    expect(step(l, 'attempt', '3')).toEqual({ ok: false, reason: 'not_yet' });
  });
  it("is sealed to one account's child and a day", () => {
    const token = sealLadder(newLadder(read, CTX));
    expect(openLadder(token, CTX)?.answer).toBe('3 m');
    expect(openLadder(token, { ...CTX, childId: 'f8000000-0000-4000-8000-0000000000b2' })).toBeNull();
    expect(openLadder(token, CTX, Date.now() + 2 * 24 * 3600 * 1000)).toBeNull();
    expect(token).not.toContain('3 m');
  });
});

describe('photos reach the vendors in their wire format', () => {
  const capture = async (adapter: typeof anthropicAdapter) => {
    let sent: unknown = null;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      sent = JSON.parse(String((init as RequestInit).body));
      return new Response('', { status: 500 });
    });
    await adapter.streamText({ apiKey: 'k', model: 'm', system: 's', maxTokens: 10, messages: [{ role: 'user', content: 'read', images: [{ mediaType: 'image/jpeg', base64: 'QUJD' }] }] }, () => {});
    fetchMock.mockRestore();
    return JSON.stringify(sent);
  };
  it('as an image block (Anthropic) and an image_url (OpenAI)', async () => {
    expect(await capture(anthropicAdapter)).toContain('"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":"QUJD"}');
    expect(await capture(openaiAdapter)).toContain('"image_url":{"url":"data:image/jpeg;base64,QUJD"}');
  });
});

// ---- the routes, on the real migrations ------------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const ACCOUNT = CTX.accountId;
const CHILD = CTX.childId;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64');
let cookie = '';

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-homework-tests-0123456789';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'homework@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Zoya', 6, 'CBSE', 'en', 'en', 'IN-MH');
  `);
  const { signFamilySession } = await import('@/lib/family/session');
  cookie = `ncf_session=${await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' })}; ncf_child=${CHILD}`;
}, 90_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});
beforeEach(() => {
  ai.reply = JSON.stringify(READ);
  ai.requests = [];
  ai.prepare = 'ok';
  ai.sendOk = true;
  screen.result = { ok: true };
  screen.calls = 0;
});

const post = async (path: string, body: unknown) => {
  const mod = path.endsWith('/step') ? await import('@/app/api/family/homework/step/route') : await import('@/app/api/family/homework/route');
  const res = await mod.POST(new NextRequest(`http://localhost${path}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};
const count = async () => Number((await db.pg.query(`select coalesce(sum(photo_questions), 0)::int as n from family.day_counts where child_id = $1`, [CHILD])).rows[0].n);

describe('the photo route', () => {
  it('needs its module switched on', async () => {
    expect((await post('/api/family/homework', { photo: JPEG })).body.error).toBe('off');
    await db.pg.query(`insert into control.app_flags (app, module, enabled, reason) values ('family', 'homework', true, 'test')`);
  });

  it('a photo with an Aadhaar number or card is refused before any AI call or count', async () => {
    screen.result = { ok: false, reason: 'upload_aadhaar_card' };
    expect(await post('/api/family/homework', { photo: JPEG })).toEqual({ status: 422, body: { error: 'personal_info' } });
    expect([ai.requests.length, await count()]).toEqual([0, 0]);
    expect((await post('/api/family/homework', { photo: Buffer.from('not an image').toString('base64') })).body.error).toBe('not_a_photo');
  });

  it("returns the ladder's first view and a token, never the answer; the photo goes once, with no child's name", async () => {
    const r = await post('/api/family/homework', { photo: JPEG });
    expect(r.status).toBe(200);
    expect(r.body.view).toMatchObject({ hints: [], canHint: true, steps: null, subject: 'mathematics' });
    expect(JSON.stringify(r.body.view)).not.toContain('3 m');
    const req = ai.requests[0] as { system: string; messages: { content: string; images: { mediaType: string; base64: string }[] }[] };
    expect(req.messages[0].images).toEqual([{ mediaType: 'image/jpeg', base64: JPEG }]);
    expect(JSON.stringify({ system: req.system, text: req.messages[0].content })).not.toMatch(/Zoya/);
    expect(await count()).toBe(1);

    const hint = await post('/api/family/homework/step', { token: r.body.token, action: 'hint' });
    expect(hint.body.view.hints).toEqual(['How many pieces are there?']);
    expect((await post('/api/family/homework/step', { token: hint.body.token, action: 'hint' })).status).toBe(409);
    const wrong = await post('/api/family/homework/step', { token: hint.body.token, action: 'attempt', answer: '48' });
    expect(wrong.body.result).toEqual({ correct: false, feedback: 'You multiplied; cutting into pieces means sharing the length.' });
    const right = await post('/api/family/homework/step', { token: wrong.body.token, action: 'attempt', answer: '3 metres' });
    expect(right.body.result.correct).toBe(true);
    expect(right.body.view.solved).toBe(true);
  });

  it("a failed read is given back; the model's own refusal is counted; the day's limit holds", async () => {
    ai.sendOk = false;
    expect((await post('/api/family/homework', { photo: JPEG })).body.error).toBe('ai_failed');
    expect(await count()).toBe(1);
    ai.sendOk = true;
    ai.reply = JSON.stringify({ status: 'person' });
    expect((await post('/api/family/homework', { photo: JPEG })).body.error).toBe('person');
    expect(await count()).toBe(2);
    ai.reply = JSON.stringify(READ);
    expect((await post('/api/family/homework', { photo: JPEG })).status).toBe(200);
    expect(await post('/api/family/homework', { photo: JPEG })).toEqual({ status: 429, body: { error: 'photo_cap', limit: 3 } });
    expect(await count()).toBe(3);
  });

  it("the platform's refusal is passed on and not counted", async () => {
    await db.pg.query(`delete from family.day_counts where child_id = $1`, [CHILD]);
    ai.prepare = 'not_cleared_for_minors';
    expect((await post('/api/family/homework', { photo: JPEG })).body.error).toBe('ai_not_cleared_for_minors');
    expect(await count()).toBe(0);
  });

  it("a question the model cannot place is answered only before a free subject is claimed", async () => {
    await db.pg.query(`delete from family.day_counts where child_id = $1`, [CHILD]);
    ai.prepare = 'ok';
    ai.reply = JSON.stringify({ ...READ, subject: 'astrology' });
    expect((await post('/api/family/homework', { photo: JPEG })).body.error).toBe('not_open');
    expect(await count()).toBe(0);
  });

  it('a refused request never runs the OCR', async () => {
    await db.pg.query(`update control.app_flags set enabled = false where app = 'family' and module = 'homework'`);
    expect((await post('/api/family/homework', { photo: JPEG })).body.error).toBe('off');
    expect(screen.calls).toBe(0);
    await db.pg.query(`update control.app_flags set enabled = true where app = 'family' and module = 'homework'`);
  });

  it("another child's token is refused", async () => {
    const other = sealLadder(newLadder(read, { accountId: ACCOUNT, childId: 'f8000000-0000-4000-8000-0000000000b2' }));
    expect((await post('/api/family/homework/step', { token: other, action: 'hint' })).status).toBe(404);
  });
});
