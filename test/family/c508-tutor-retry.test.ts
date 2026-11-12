import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// C508 (founder, 12 Nov, a Class 1 child): a tutor question whose answer failed on our side is kept with "No answer
// yet" and Try again (after a reload too), a retry that succeeds leaves one question row, a safety refusal keeps
// nothing; a fresh answer for a child in Class 3 or below is read aloud by itself, never a Class 6 answer or a reload;
// a photo that does not load takes its card away. The model and the safety check are scripted.

const ai = vi.hoisted(() => ({ lines: [] as string[], fail: false, throws: false, unsafe: false }));
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async () => 'v1',
  prepareModeration: async () => ({ ok: true, moderation: { check: async () => ({ safe: !ai.unsafe, categories: [] }), record: async () => {} } }),
  prepareText: async () => ({
    ok: true,
    text: {
      send: async (onDelta: (t: string) => void) => {
        // A provider that fails (or times out) with nothing sent, or a call that throws.
        if (ai.throws) throw new Error('timed out');
        if (ai.fail) return { result: { ok: false, reason: 'failed' }, record: async () => {} };
        for (const l of ai.lines) onDelta(`${l}\n`);
        return { result: { ok: true, text: ai.lines.join('\n'), tokensIn: 10, tokensOut: 20, provider: 'anthropic', model: 'test-model' }, record: async () => {} };
      },
    },
  }),
}));
vi.mock('next/dynamic', () => ({ default: () => (props: { messageId?: string; auto?: boolean }) => h('i', { 'data-lazy-speaker': props.messageId ?? '', 'data-auto': String(props.auto === true) }) }));

const ANSWER = [
  JSON.stringify({ type: 'subject', subject: 'mathematics' }),
  JSON.stringify({ type: 'explanation', title: 'Adding', idea: 'Adding puts groups together.', example: 'Two rotis and three rotis make five rotis.', steps: ['Count the first group', 'Count on'], terms: [] }),
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: Record<string, any>;
const ACCOUNT = 'f5080000-0000-4000-8000-0000000000a1';
const YOUNG = 'f5080000-0000-4000-8000-0000000000a2';
const OLDER = 'f5080000-0000-4000-8000-0000000000a3';
let young: Record<string, string>;
let older: Record<string, string>;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-c508-retry-tests-0123456789';
  await db.pg.exec(`
    update control.settings set value = '[]'::jsonb where key in ('family.open_subjects', 'family.reviewed_only_subjects');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'c508@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${YOUNG}', '${ACCOUNT}', 'Anu', 1, 'CBSE', 'en', 'en', 'IN-UP'), ('${OLDER}', '${ACCOUNT}', 'Dev', 6, 'CBSE', 'en', 'en', 'IN-UP');
  `);
  const { signFamilySession } = await import('@/lib/family/session');
  const s = await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' });
  young = { ncf_session: s, ncf_child: YOUNG };
  older = { ncf_session: s, ncf_child: OLDER };
  R = { understand: await import('@/app/api/family/understand/route'), tutor: await import('@/app/api/family/tutor/route') };
}, 90_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

const cookie = (j: Record<string, string>) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join('; ');
const ask = async (j: Record<string, string>, text: string, tutor: Record<string, unknown> = {}) => {
  const res = await R.understand.POST(new NextRequest('http://localhost/api/family/understand', { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookie(j) }, body: JSON.stringify({ kind: 'question', text, tutor: { subject: 'mathematics', ...tutor } }) }));
  if (res.status !== 200) return { status: res.status, ev: [] as Record<string, unknown>[] };
  return { status: 200, ev: (await res.text()).trim().split('\n').map((l: string) => JSON.parse(l)) as Record<string, unknown>[] };
};
const rows = async (child: string) => (await db.pg.query(`select message_id, role, body from family.tutor_messages where child_id = $1 order by created_at, role`, [child])).rows;
const feed = async (j: Record<string, string>) => {
  const res = await R.tutor.GET(new NextRequest('http://localhost/api/family/tutor?subject=mathematics', { headers: { cookie: cookie(j) } }));
  return ((await res.json()) as { turns: import('@/lib/family/tutor-shape').FeedTurn[] }).turns;
};
const reset = () => Object.assign(ai, { lines: ANSWER, fail: false, throws: false, unsafe: false });

describe('a failed tutor answer keeps its question, with Try again (C508)', () => {
  it('a failed answer keeps the question alone; after a reload it is the one with no answer yet', async () => {
    reset();
    ai.fail = true;
    const { ev } = await ask(young, 'What is two and three?');
    const last = ev.at(-1)!;
    expect(last).toMatchObject({ t: 'refused', reason: 'failed', unanswered: expect.any(String) });
    expect((await rows(YOUNG)).map((r: { role: string; body: string }) => [r.role, r.body])).toEqual([['child', 'What is two and three?']]);
    const { unansweredIds } = await import('@/components/family/tutor/TutorWindow');
    const turns = await feed(young);
    expect(turns.map((t) => t.role)).toEqual(['child']);
    expect([...unansweredIds(turns)]).toEqual([last.unanswered]);
    // A call that throws (a timeout) the same way; a failed Try again keeps nothing new.
    ai.fail = false;
    ai.throws = true;
    const again = await ask(young, 'ignored: the kept words are asked', { retryOf: last.unanswered });
    expect(again.ev.at(-1)).toMatchObject({ t: 'refused', reason: 'failed', unanswered: last.unanswered });
    expect((await rows(YOUNG)).length).toBe(1);
  });

  it('a Try again that is answered leaves one question row, next to its answer; it cannot be asked twice', async () => {
    reset();
    const [kept] = await rows(YOUNG);
    const { ev } = await ask(young, 'ignored', { retryOf: kept.message_id });
    expect(ev.at(-1)).toMatchObject({ t: 'done', messageId: expect.any(String) });
    const now = await rows(YOUNG);
    expect(now.map((r: { role: string; body: string | null }) => [r.role, r.body])).toEqual([['child', 'What is two and three?'], ['tutor', null]]);
    const { unansweredIds } = await import('@/components/family/tutor/TutorWindow');
    expect(unansweredIds(await feed(young)).size).toBe(0);
    expect((await ask(young, 'ignored', { retryOf: kept.message_id })).status).toBe(404);
    // Try again is only for a plain typed question.
    expect((await ask(young, 'Check my work: 2+3=5', { retryOf: kept.message_id, mode: 'check' })).status).toBe(400);
  });

  it('a safety refusal keeps nothing, and neither does an answer the model refused as not school study', async () => {
    reset();
    const before = (await rows(OLDER)).length;
    ai.unsafe = true;
    const { ev } = await ask(older, 'Something not safe to ask');
    expect(ev.at(-1)).toMatchObject({ t: 'refused', reason: 'unsafe' });
    expect(ev.at(-1)).not.toHaveProperty('unanswered');
    ai.unsafe = false;
    ai.lines = ['{"type":"refuse"}'];
    const off = await ask(older, 'Tell me a joke about cricket');
    expect(off.ev.at(-1)).toMatchObject({ t: 'refused', reason: 'not_school_study' });
    expect((await rows(OLDER)).length).toBe(before);
  });

  it('an answer that ends with nothing shown is a failure too: the question is kept with no answer yet', async () => {
    reset();
    ai.lines = [ANSWER[0]];
    const { ev } = await ask(older, 'What is a half?');
    expect(ev.at(-1)).toMatchObject({ t: 'refused', reason: 'failed', unanswered: expect.any(String) });
    expect((await rows(OLDER)).at(-1)).toMatchObject({ role: 'child', body: 'What is a half?' });
  });
});

describe('a young child hears a fresh answer (C508)', () => {
  it('Class 1: the done line says autoRead; Class 6: it does not', async () => {
    reset();
    expect((await ask(young, 'Why is six and six twelve?')).ev.at(-1)).toMatchObject({ t: 'done', autoRead: true, messageId: expect.any(String) });
    expect((await ask(older, 'Why is six and six twelve?')).ev.at(-1)).not.toHaveProperty('autoRead');
  });

  it('starts only when asked, read aloud is on, there is something to say and no other voice is reading', async () => {
    const { startsByItself } = await import('@/components/family/voice/AnswerSpeaker');
    expect(startsByItself({ auto: true, readAloud: true, sentences: 3, busy: false })).toBe(true);
    expect(startsByItself({ auto: false, readAloud: true, sentences: 3, busy: false })).toBe(false);
    expect(startsByItself({ auto: true, readAloud: false, sentences: 3, busy: false })).toBe(false);
    expect(startsByItself({ auto: true, readAloud: true, sentences: 3, busy: true })).toBe(false);
    expect(startsByItself({ auto: true, readAloud: true, sentences: 0, busy: false })).toBe(false);
  });

  it('a kept answer read back after a reload never starts by itself', async () => {
    const { KeptAnswer } = await import('@/components/family/tutor/TutorWindow');
    const { familyWords } = await import('@/lib/family/words');
    const { TUTOR_KEYS } = await import('@/lib/family/tutor-words');
    const { UNDERSTAND_KEYS } = await import('@/lib/family/understand-words');
    const w = familyWords('en', [...TUTOR_KEYS, ...UNDERSTAND_KEYS]);
    const b = [{ type: 'explanation', title: 'Adding', idea: 'Adding puts groups together.', example: 'Two and three make five.', steps: ['Count', 'Count on'], terms: [] }];
    const html = renderToStaticMarkup(h(KeptAnswer, { b: b as never, w, tone: 'mathematics', lang: 'en', speak: { id: 'f5080000-0000-4000-8000-0000000000f1', serverVoice: true } }));
    expect(html).toContain('data-lazy-speaker');
    expect(html).not.toContain('data-auto="true"');
  });
});

describe('a photo that does not load is never a broken card (C508)', () => {
  it('a photo marked broken, or one with no address, draws no card', async () => {
    const { ImageView, photoShown } = await import('@/components/family/blocks/ImageView');
    const { familyWords } = await import('@/lib/family/words');
    const { UNDERSTAND_KEYS } = await import('@/lib/family/understand-words');
    const photo = { type: 'image', query: 'banyan tree', caption: 'A banyan tree', url: 'https://upload.wikimedia.org/a.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:A.jpg', credit: 'Someone', licence: 'CC BY 4.0' };
    expect(photoShown(photo as never, false)).toBe(true);
    expect(photoShown(photo as never, true)).toBe(false);
    expect(photoShown({ type: 'image', query: 'banyan tree', caption: 'A banyan tree' } as never, false)).toBe(false);
    expect(renderToStaticMarkup(h(ImageView, { b: photo as never, w: familyWords('en', UNDERSTAND_KEYS), tone: 'science' }))).toContain('data-photo');
  });
});
