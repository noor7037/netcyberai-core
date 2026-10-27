import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { checkBlock, narrationScript, type Block } from '@/lib/family/blocks';
import { chapterView, showcaseChapter } from '@/lib/family/chapters';
import { SOLID_KINDS, SOLID_INPUTS, modelView, solidMesh, solidSurface, solidVolume } from '@/lib/family/solids';
import { MemoryFileStorage } from '@/lib/storage/file-storage';

// Interactive sliders, lazy WebGL with a 2D fallback, chapter tests and chapter videos (S5, C378; docs/37 §4 Wave 2):
//   1. The data-saver forces the 2D view; no WebGL means 2D; 3D only on the child's tap; the WebGL code is never imported
//      statically (so never in the first load).
//   2. A chapter test records real attempts only: nothing pre-filled, no invented score, no row for a refused send.
//   3. A multiple-choice answer never reaches the phone (sealed), and the check route refuses a test token.
//   4. Narration never reads the new blocks.

const ACCOUNT = 'f9500000-0000-4000-8000-0000000000a1';
const OTHER = 'f9500000-0000-4000-8000-0000000000b1';
const CHILD = 'f9500000-0000-4000-8000-0000000000c1';
const SIBLING = 'f9500000-0000-4000-8000-0000000000c2';
const OTHER_CHILD = 'f9500000-0000-4000-8000-0000000000c3';
const DEVICE = 'f9500000-0000-4000-8000-0000000000d2';
const KEY = 'nc.showcase.equal-fractions';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const noWords = async () => ({ rawText: '', words: [] });

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

// The public blocks a given child's page would send, and the test's block.
async function sealedTest(childId = CHILD, account = ACCOUNT) {
  const { readerBlocks } = await import('@/lib/family/chapter-tests');
  const view = chapterView(showcaseChapter(KEY)!, 'en');
  const blocks = readerBlocks(view.blocks, { accountId: account, childId, chapterKey: KEY, subject: 'mathematics' });
  const at = view.ids.indexOf('ef-test');
  const test = blocks[at] as { items: { kind: string; id: string; token?: string }[] };
  return { blocks, test, blockId: 'ef-test', json: JSON.stringify(blocks) };
}
const send = async (answers: unknown, opts: { child?: string; account?: string; chapterKey?: string; blockId?: string } = {}) => {
  const { POST } = await import('@/app/api/family/chapter-test/route');
  const res = await POST(
    new NextRequest('http://localhost/api/family/chapter-test', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await cookies(opts.account ?? ACCOUNT, opts.child ?? CHILD) },
      body: JSON.stringify({ chapterKey: opts.chapterKey ?? KEY, blockId: opts.blockId ?? 'ef-test', answers }),
    })
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const attempts = async () => (await q(`select count(*)::int as n from family.chapter_test_attempts`))[0].n as number;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-chapter-tests-0123456789';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 's5@example.org'), ('${OTHER}', 'other-s5@example.org');
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

describe('3D with a 2D fallback (C378)', () => {
  it('the data-saver forces 2D, whatever else holds', () => {
    expect(modelView({ dataSaver: true, webgl: true, requested: true })).toBe('2d');
    expect(modelView({ dataSaver: true, webgl: true, requested: false })).toBe('2d');
  });
  it('no WebGL, or no tap, is 2D; 3D only with all three', () => {
    expect(modelView({ dataSaver: false, webgl: false, requested: true })).toBe('2d');
    expect(modelView({ dataSaver: false, webgl: true, requested: false })).toBe('2d');
    expect(modelView({ dataSaver: false, webgl: true, requested: true })).toBe('3d');
  });
  it('the WebGL code is only ever a dynamic import, and the model itself is a lazy chunk of the reader', () => {
    const model = readFileSync('src/components/family/blocks/Model3DView.tsx', 'utf8');
    const reader = readFileSync('src/components/family/reader/ChapterReader.tsx', 'utf8');
    expect(model).not.toMatch(/^import .*webgl-solid/m);
    expect(model).toMatch(/import\('\.\/webgl-solid'\)/);
    expect(reader).not.toMatch(/^import .*(Model3DView|ChapterTestView|webgl-solid|InteractiveViews)/m);
    expect(reader).toMatch(/import\('\.\.\/blocks\/Model3DView'\)/);
  });
  it('with the data-saver on, the block is drawn as 2D with the reason and no 3D button', async () => {
    vi.resetModules();
    vi.doMock('@/components/family/useDataSaver', () => ({ useDataSaver: () => ({ state: { on: true, source: 'chosen' }, ready: true, set: () => undefined }) }));
    const { Model3DView } = await import('@/components/family/blocks/Model3DView');
    const { familyWords } = await import('@/lib/family/words');
    const { READER_KEYS } = await import('@/lib/family/reader-words');
    const b = checkBlock({ type: 'model_3d', title: 'Cake', solid: 'cylinder', dims: { r: 10, h: 6 }, alt: 'A round cake.', unit: 'cm' }) as Block & { type: 'model_3d' };
    const html = renderToStaticMarkup(createElement(Model3DView, { b, w: familyWords('en', READER_KEYS), tone: 'mathematics' }));
    expect(html).toContain('data-model-view="2d"');
    expect(html).toContain('data-model-2d');
    expect(html).toContain('Data saver is on');
    expect(html).not.toContain('data-model-3d-ask');
    expect(html).not.toContain('<canvas');
    vi.doUnmock('@/components/family/useDataSaver');
  });
  it('computes the shape and its numbers in code, one mesh for both views', () => {
    expect(solidVolume('cube', { a: 2 })).toBe(8);
    expect(solidVolume('sphere', { r: 3 })).toBeCloseTo((4 / 3) * Math.PI * 27, 6);
    expect(solidSurface('cuboid', { l: 1, b: 2, h: 3 })).toBe(22);
    for (const kind of SOLID_KINDS) {
      const dims = Object.fromEntries(Object.entries(SOLID_INPUTS[kind]).map(([k, r]) => [k, r.min + 1]));
      const m = solidMesh(kind, dims);
      expect(m.triangles.length).toBeGreaterThan(3);
      for (const t of m.triangles) for (const i of t) expect(m.vertices[i]).toBeDefined();
      for (const e of m.edges) for (const i of e) expect(m.vertices[i]).toBeDefined();
    }
  });
});

describe('slider and test block shapes (C378)', () => {
  const slider = { type: 'slider', title: 'T', label: 'L', min: 0, max: 10, step: 1, start: 2, readouts: [{ label: 'Double', expression: 'x*2', places: 1 }] };
  it('accepts a slider whose readouts are numbers across the whole range, and refuses one that is not', () => {
    expect(checkBlock(slider)).not.toBeNull();
    expect(checkBlock({ ...slider, readouts: [{ label: 'Bad', expression: '1/(x-5)', places: 1 }] })).toBeNull();
    expect(checkBlock({ ...slider, readouts: [{ label: 'Bad', expression: 'alert(1)', places: 1 }] })).toBeNull();
    expect(checkBlock({ ...slider, start: 99 })).toBeNull();
    expect(checkBlock({ ...slider, readouts: [] })).toBeNull();
  });
  it('a fraction slider is the numerator, in whole steps from 0 to d', () => {
    expect(checkBlock({ ...slider, readouts: [], max: 8, start: 4, fraction: { d: 8, shape: 'bar' } })).not.toBeNull();
    expect(checkBlock({ ...slider, readouts: [], max: 8, step: 2, start: 4, fraction: { d: 8, shape: 'bar' } })).toBeNull();
  });
  it('refuses a model out of range and a test with a key that points nowhere or a repeated id', () => {
    expect(checkBlock({ type: 'model_3d', title: 'x', solid: 'cube', dims: { a: 5000 }, alt: 'a cube' })).toBeNull();
    expect(checkBlock({ type: 'model_3d', title: 'x', solid: 'cube', dims: { a: 2 } })).toBeNull();
    const mcq = { kind: 'mcq', id: 'a', question: 'Q?', options: ['x', 'y'], answer: 0, why: 'because' };
    expect(checkBlock({ type: 'chapter_test', title: 'T', items: [mcq] })).not.toBeNull();
    expect(checkBlock({ type: 'chapter_test', title: 'T', items: [{ ...mcq, answer: 5 }] })).toBeNull();
    expect(checkBlock({ type: 'chapter_test', title: 'T', items: [mcq, mcq] })).toBeNull();
    expect(checkBlock({ type: 'chapter_test', title: 'T', items: [{ kind: 'written', id: 'w', question: 'Q?', rubric: [] }] })).toBeNull();
  });
  it('narration of the showcase chapter never reads them, in either language', () => {
    for (const lang of ['en', 'hi'] as const) {
      const v = chapterView(showcaseChapter(KEY)!, lang);
      const types = new Map(v.blocks.map((b, i) => [v.ids[i], b.type]));
      expect(['slider', 'model_3d', 'chapter_test'].every((t) => [...types.values()].includes(t as never))).toBe(true);
      for (const l of narrationScript(v.blocks)) expect(['slider', 'model_3d', 'chapter_test']).not.toContain(types.get(l.blockId));
    }
  });
});

describe('a chapter test records real attempts only (C378)', () => {
  it('starts empty: opening the page or the parent list writes and shows nothing', async () => {
    const { listAttempts } = await import('@/lib/family/chapter-tests');
    await sealedTest();
    expect(await attempts()).toBe(0);
    expect(await fam((c) => listAttempts(c, ACCOUNT))).toEqual([]);
  });

  it('sealed: the page carries no answer and no reason, and the check route refuses a test token', async () => {
    const s = await sealedTest();
    const testJson = JSON.stringify(s.test);
    expect(testJson).not.toContain('"answer"');
    expect(testJson).not.toContain('"why"');
    expect(s.json).not.toContain('Multiply the top and the bottom of 1/2 by 2');
    expect(s.json).not.toContain('Divide the top and the bottom of 2/8');
    const tokens = s.test.items.filter((i) => i.kind === 'mcq').map((i) => i.token!);
    expect(tokens.length).toBe(2);
    const { POST } = await import('@/app/api/family/check/route');
    const res = await POST(new NextRequest('http://localhost/api/family/check', { method: 'POST', headers: { 'content-type': 'application/json', cookie: await cookies(ACCOUNT, CHILD) }, body: JSON.stringify({ token: tokens[0], choice: 0 }) }));
    expect(res.status).toBe(404);
    expect(await attempts()).toBe(0);
    // The understand route's retry must not open a test token either: every choice, right or wrong, gets the same
    // refusal, so nothing tells the right answer from a wrong one.
    const { POST: understand } = await import('@/app/api/family/understand/route');
    const answers = await Promise.all(
      [0, 1, 2, 3].map(async (choice) => {
        const r = await understand(new NextRequest('http://localhost/api/family/understand', { method: 'POST', headers: { 'content-type': 'application/json', cookie: await cookies(ACCOUNT, CHILD) }, body: JSON.stringify({ retry: { token: tokens[0], choice } }) }));
        return `${r.status} ${await r.text()}`;
      })
    );
    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).toContain('not_found');
  });

  it('a refused send leaves no row: incomplete, forged, another child’s token, empty, unknown test', async () => {
    const s = await sealedTest();
    const [t1, t2] = s.test.items.filter((i) => i.kind === 'mcq');
    expect((await send([{ itemId: 'q1', token: t1.token, choice: 0 }])).status).toBe(422);
    expect((await send([{ itemId: 'q1', token: t1.token, choice: 9 }, { itemId: 'q2', token: t2.token, choice: 0 }])).status).toBe(400);
    expect((await send([{ itemId: 'q1', token: t1.token + 'x', choice: 0 }, { itemId: 'q2', token: t2.token, choice: 0 }])).status).toBe(410);
    const sib = await sealedTest(SIBLING);
    const [s1, s2] = sib.test.items.filter((i) => i.kind === 'mcq');
    expect((await send([{ itemId: 'q1', token: s1.token, choice: 0 }, { itemId: 'q2', token: s2.token, choice: 0 }])).status).toBe(410);
    expect((await send([])).status).toBe(400);
    expect((await send([{ itemId: 'q1', token: t1.token, choice: 0 }], { blockId: 'ef-intro' })).status).toBe(404);
    expect((await send([{ itemId: 'q1', token: t1.token, choice: 0 }], { chapterKey: 'nc.showcase.nothing' })).status).toBe(404);
    expect(await attempts()).toBe(0);
  });

  it('records the attempt as the server found it, with written text and no score for it', async () => {
    const s = await sealedTest();
    const [t1, t2] = s.test.items.filter((i) => i.kind === 'mcq');
    const r = await send([
      { itemId: 'q1', token: t1.token, choice: 0 },
      { itemId: 'q2', token: t2.token, choice: 1 },
      { itemId: 'q3', text: 'The parts get smaller but there are more of them.' },
    ]);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ mcqTotal: 2, mcqCorrect: 1 });
    expect(JSON.stringify(r.body)).not.toContain('"answer"');
    const rows = await q(`select a.mcq_total, a.mcq_correct, x.item_id, x.kind, x.correct, x.body, x.choice from family.chapter_test_attempts a join family.chapter_test_answers x using (attempt_id) order by x.item_id`);
    expect(rows).toEqual([
      { mcq_total: 2, mcq_correct: 1, item_id: 'q1', kind: 'mcq', correct: true, body: null, choice: 0 },
      { mcq_total: 2, mcq_correct: 1, item_id: 'q2', kind: 'mcq', correct: false, body: null, choice: 1 },
      { mcq_total: 2, mcq_correct: 1, item_id: 'q3', kind: 'written', correct: null, body: 'The parts get smaller but there are more of them.', choice: null },
    ]);
    expect((await q(`select rubric from family.chapter_test_answers where item_id = 'q3'`))[0].rubric).toHaveLength(3);
  });

  it('a written answer holding an Aadhaar number is refused, and the database refuses an invented score', async () => {
    const s = await sealedTest();
    const [t1, t2] = s.test.items.filter((i) => i.kind === 'mcq');
    const r = await send([{ itemId: 'q1', token: t1.token, choice: 0 }, { itemId: 'q2', token: t2.token, choice: 0 }, { itemId: 'q3', text: 'My number is 2345 6789 0123' }]);
    expect(r.status).toBe(422);
    expect(await attempts()).toBe(1);
    await expect(q(`insert into family.chapter_test_attempts (account_id, child_id, chapter_key, block_id, mcq_total, mcq_correct) values ($1, $2, $3, 'ef-test', 2, 3)`, [ACCOUNT, CHILD, KEY])).rejects.toThrow(/check/);
    await expect(q(`insert into family.chapter_test_answers (attempt_id, account_id, child_id, item_id, kind, question, body, rubric) select attempt_id, account_id, child_id, 'zz', 'written', 'Q', 'x', '["r"]'::jsonb from family.chapter_test_attempts limit 1`).then(() => q(`select 1`))).resolves.toBeDefined();
  });

  it('a photo answer reuses the tutor’s private file door; it is kept for the test, once, for this child only', async () => {
    const t = await import('@/lib/family/tutor');
    const store = new MemoryFileStorage();
    const mk = async (childId: string) => {
      const who = { accountId: ACCOUNT, childId };
      const a = await fam((c) => t.askTutorUpload(c, store, who, { subject: 'mathematics', mime: 'image/png', size: PNG.length, name: 'bars.png' }));
      if (!a.ok) throw new Error(a.reason);
      await store.receive(a.uploadUrl, PNG, 'image/png');
      const row = await fam((c) => t.pendingUpload(c, who, a.attachmentId));
      const arrival = await t.readTutorArrival(store, row!, Date.now, noWords);
      expect(await fam((c) => t.finishTutorUpload(c, store, who, a.attachmentId, arrival))).toEqual({ ok: true });
      return a.attachmentId;
    };
    const mine = await mk(CHILD);
    const theirs = await mk(SIBLING);
    const s = await sealedTest();
    const [t1, t2] = s.test.items.filter((i) => i.kind === 'mcq');
    const base = [{ itemId: 'q1', token: t1.token, choice: 0 }, { itemId: 'q2', token: t2.token, choice: 0 }];
    const before = await attempts();
    expect((await send([...base, { itemId: 'q4', attachmentId: theirs }])).status).toBe(409);
    expect(await attempts()).toBe(before);
    expect((await send([...base, { itemId: 'q4', attachmentId: mine }])).status).toBe(200);
    expect((await q(`select kept_for from family.tutor_attachments where attachment_id = $1`, [mine]))[0].kept_for).toBe('test');
    expect((await q(`select attachment_id from family.chapter_test_answers where kind = 'photo'`))[0].attachment_id).toBe(mine);
    // The same file is not used twice, and it is no longer an unsent tutor file.
    expect((await send([...base, { itemId: 'q4', attachmentId: mine }])).status).toBe(409);
    expect(await fam((c) => t.sendableFiles(c, ACCOUNT, CHILD, 'mathematics', [mine]))).toBeNull();
  });

  it('the parent reads the attempts behind the PIN; a sibling, a child’s own phone and another account never do', async () => {
    const { listAttempts } = await import('@/lib/family/chapter-tests');
    const { GET } = await import('@/app/api/family/chapter-test/route');
    const asChild = await GET(new NextRequest('http://localhost/api/family/chapter-test', { headers: { cookie: await cookies(ACCOUNT, CHILD) } }));
    expect(asChild.status).not.toBe(200);
    const asParent = await GET(new NextRequest('http://localhost/api/family/chapter-test', { headers: { cookie: await cookies(ACCOUNT, undefined, true) } }));
    expect(asParent.status).toBe(200);
    const body = (await asParent.json()) as { attempts: { childId: string; mcqTotal: number; answers: { kind: string; correct: boolean | null }[] }[] };
    expect(body.attempts.length).toBe(2);
    expect(body.attempts.every((a) => a.childId === CHILD)).toBe(true);
    expect((await fam((c) => listAttempts(c, OTHER), OTHER))).toEqual([]);
    expect(await fam((c) => listAttempts(c, ACCOUNT), ACCOUNT, { deviceId: DEVICE, childId: SIBLING })).toEqual([]);
    // Another account cannot send as this child either.
    const s = await sealedTest();
    const [t1, t2] = s.test.items.filter((i) => i.kind === 'mcq');
    expect((await send([{ itemId: 'q1', token: t1.token, choice: 0 }, { itemId: 'q2', token: t2.token, choice: 0 }], { account: OTHER, child: OTHER_CHILD })).status).toBe(410);
  });
});

describe('chapter videos (C378)', () => {
  const VID = (n: number) => `abcdefghij${n}`;
  it('shows only a reviewer’s pinned picks for the chapter, never an automatic or rejected one, and no picture loads', async () => {
    const { readChapterVideos } = await import('@/lib/family/videos');
    const { pinChapterVideo } = await import('@/lib/content/video-picks');
    const actor = { userId: 'f9500000-0000-4000-8000-0000000000e1' };
    await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Reviewer')`, [actor.userId]);
    const sql = { query: (s: string, p?: unknown[]) => db.pg.query(s, p) };
    await q(`insert into content.video_picks (topic_key, language, video_id, channel_id, channel_title, title, duration_s, captions, score, status) values ($1, 'en', $2, 'UCauto12345', 'Auto', 'Auto pick', 300, true, 90, 'auto')`, [KEY, VID(1)]);
    expect(await fam((c) => readChapterVideos(c, KEY, 'en'))).toEqual([]);
    expect(await pinChapterVideo(sql as never, actor, { chapterKey: KEY, language: 'en', videoId: VID(2), channelId: 'UCreview1234', channelTitle: 'Reviewed', title: 'Equal fractions', durationS: 400, startS: 0 })).toEqual({ ok: true });
    expect(await pinChapterVideo(sql as never, actor, { chapterKey: KEY, language: 'en', videoId: 'short', channelId: 'UCreview1234', channelTitle: 'R', title: 'x', durationS: 400, startS: 0 })).toEqual({ ok: false, reason: 'bad_request' });
    const picks = await fam((c) => readChapterVideos(c, KEY, 'en'));
    expect(picks.map((p) => p.videoId)).toEqual([VID(2)]);
    expect(await fam((c) => readChapterVideos(c, KEY, 'hi'))).toEqual([]);
    const { VideoList } = await import('@/components/family/VideoPicks');
    const { familyWords } = await import('@/lib/family/words');
    const { READER_KEYS } = await import('@/lib/family/reader-words');
    const { UNDERSTAND_KEYS } = await import('@/lib/family/understand-words');
    const html = renderToStaticMarkup(createElement(VideoList, { w: familyWords('en', [...UNDERSTAND_KEYS, ...READER_KEYS]), videos: picks, saver: true }));
    expect(html).toContain('data-video-saver');
    expect(html).not.toMatch(/<img|ytimg|<iframe|autoplay/i);
  });
});
