import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { BLOCK_TYPES, READ_ALOUD_TYPES, blockIds, checkBlock, narrationScript, parseBlockLine, sentences, type Block } from '@/lib/family/blocks';
import { chapterView, checkChapter, isNarrationPlace, resumeIndex, showcaseChapter, showcaseChapters } from '@/lib/family/chapters';
import { occurrence, progressPercent, rateOf, wordAt } from '@/components/family/reader/narration';
import waterCycle from '@/lib/family/showcase/water-cycle.json';

// The chapter reader (S1, C374; docs/37 §4 Wave 2):
//   1. Narration reads only teaching text: a diagram, a table, an interactive (simulation, graph, number line, fraction
//      model, geometry), a check, practice, sources or an English moment is never in the script, whatever its flag.
//   2. Blocks carry stable ids; content without ids stays valid and gets the same id on every load.
//   3. The two showcase chapters load in English and Hindi and play end to end (a script over their readable blocks).
//   4. The child's place is kept per child per chapter, only a real place, own account only.

const MARK = (t: string) => `ZZ${t.replace(/_/g, '')}ZZ`;
// One block of every type, each carrying a marker word in every text it has.
const EVERY: Record<string, unknown> = {
  explanation: { type: 'explanation', title: `${MARK('explanation')} title.`, idea: 'An idea.', example: 'An example.', steps: ['One.', 'Two.'], terms: [] },
  worked_example: { type: 'worked_example', problem: `${MARK('worked_example')} problem.`, steps: [{ text: 'Add them.', expression: '2+3', result: '5' }], answer: '5' },
  key_points: { type: 'key_points', points: [`${MARK('key_points')} one.`, 'Point two.'] },
  diagram: { type: 'diagram', title: MARK('diagram'), kind: 'flow', nodes: [{ id: 'a', label: MARK('diagram') }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b', label: MARK('diagram') }] },
  check: { type: 'check', items: [{ id: 'c1', question: MARK('check'), options: ['A', 'B'], answer: 0, hint: MARK('check'), why: MARK('check') }] },
  practice: { type: 'practice', items: [{ id: 'p1', question: MARK('practice'), options: ['A', 'B'], answer: 1, hint: MARK('practice'), why: MARK('practice') }] },
  english_moment: { type: 'english_moment', words: [{ en: 'cloud', meaning: MARK('english_moment') }], sentence: MARK('english_moment'), pattern: MARK('english_moment'), sayIt: MARK('english_moment') },
  sources: { type: 'sources', links: [{ label: MARK('sources'), url: 'https://ncert.nic.in/textbook.php' }] },
  table: { type: 'table', title: MARK('table'), columns: [MARK('table'), 'B'], rows: [[MARK('table'), 'x.']] },
  graph: { type: 'graph', title: MARK('graph'), fn: 'linear', params: { m: 1, c: 0 } },
  number_line: { type: 'number_line', title: MARK('number_line'), from: 0, to: 1, step: 0.25, marks: [{ value: 0.5, label: 'half' }] },
  fraction_model: { type: 'fraction_model', title: MARK('fraction_model'), shape: 'bar', fractions: [{ n: 1, d: 2 }] },
  geometry: { type: 'geometry', title: MARK('geometry'), shape: { kind: 'angle', degrees: 40 } },
  simulation: { type: 'simulation', title: MARK('simulation'), sim: 'pendulum', values: { length: 1 } },
};

describe('narration reads only teaching text (C374)', () => {
  const all = BLOCK_TYPES.map((t) => checkBlock(EVERY[t]));
  it('every block type has a sample here, and each passes its shape', () => {
    expect(Object.keys(EVERY).sort()).toEqual([...BLOCK_TYPES].sort());
    expect(all.every((b) => b !== null)).toBe(true);
  });

  it('never reads a diagram, table, simulation or any other picture-like or quiz block', () => {
    const text = narrationScript(all as Block[]).map((l) => l.text).join('\n');
    for (const t of BLOCK_TYPES) {
      if (READ_ALOUD_TYPES.includes(t)) expect(text, t).toContain(MARK(t));
      else expect(text, t).not.toContain(MARK(t));
    }
    for (const t of ['diagram', 'table', 'simulation', 'graph', 'number_line', 'fraction_model', 'geometry']) expect(text).not.toContain(MARK(t));
  });

  it('a flag cannot make a silent block readable, and silences a readable one', () => {
    const loud = BLOCK_TYPES.map((t) => checkBlock({ ...(EVERY[t] as object), tts_read_aloud: true })) as Block[];
    const text = narrationScript(loud).map((l) => l.text).join('\n');
    for (const t of ['diagram', 'table', 'simulation', 'english_moment', 'check']) expect(text).not.toContain(MARK(t));
    const quiet = checkBlock({ ...(EVERY.explanation as object), tts_read_aloud: false }) as Block;
    expect(narrationScript([quiet])).toEqual([]);
  });

  it('never reads a worked step’s formula, only its words', () => {
    const lines = narrationScript([checkBlock(EVERY.worked_example) as Block]).map((l) => l.text);
    expect(lines).toEqual([`${MARK('worked_example')} problem.`, 'Add them.', '5']);
    expect(lines.join(' ')).not.toContain('2+3');
  });

  it('cuts sentences at . ! ? and the danda, not inside a number', () => {
    expect(sentences('It is 3.5 cm long. Is it? Yes! Done')).toEqual(['It is 3.5 cm long.', 'Is it?', 'Yes!', 'Done']);
    expect(sentences('पानी गर्म होता है। फिर भाप बनता है।')).toEqual(['पानी गर्म होता है।', 'फिर भाप बनता है।']);
    expect(sentences('  ')).toEqual([]);
  });
});

describe('stable block ids (C374)', () => {
  const a = checkBlock(EVERY.key_points) as Block;
  const b = checkBlock(EVERY.diagram) as Block;
  it('keeps content without ids valid, and derives the same id every time, whatever the order', () => {
    expect(checkBlock(EVERY.key_points)).toEqual(EVERY.key_points);
    const [ia, ib] = blockIds([a, b]);
    expect(ia).toMatch(/^key-points-[0-9a-f]{8}$/);
    expect(blockIds([b, a])).toEqual([ib, ia]);
    expect(blockIds([a, a])).toEqual([ia, `${ia}-2`]);
  });
  it('keeps a valid given id and drops a bad one', () => {
    expect(checkBlock({ ...(EVERY.key_points as object), id: 'kp-1' })).toMatchObject({ id: 'kp-1' });
    expect(checkBlock({ ...(EVERY.key_points as object), id: '<b>x</b>' })).not.toHaveProperty('id');
    expect(blockIds([checkBlock({ ...(EVERY.key_points as object), id: 'kp-1' }) as Block])).toEqual(['kp-1']);
  });
  it('a table is chapter content only: the model’s stream never accepts one', () => {
    expect(parseBlockLine(JSON.stringify(EVERY.table))).toBeNull();
    expect(parseBlockLine(JSON.stringify(EVERY.key_points))).not.toBeNull();
    expect(checkBlock({ ...(EVERY.table as object), rows: [['only one cell']] })).toBeNull();
  });
});

describe('the showcase chapters (C374)', () => {
  it('both load, in English and Hindi', () => {
    expect(showcaseChapters().map((c) => c.key)).toEqual(['nc.showcase.water-cycle', 'nc.showcase.equal-fractions']);
  });
  for (const key of ['nc.showcase.water-cycle', 'nc.showcase.equal-fractions']) {
    for (const lang of ['en', 'hi'] as const) {
      it(`${key} (${lang}) plays end to end over its readable blocks only`, () => {
        const v = chapterView(showcaseChapter(key)!, lang);
        expect(v.lang).toBe(lang);
        expect(v.script.length).toBeGreaterThan(10);
        const kind = new Map(v.blocks.map((b, i) => [v.ids[i], b.type]));
        const silent = v.blocks.filter((b) => !READ_ALOUD_TYPES.includes(b.type));
        expect(silent.map((b) => b.type)).toEqual(expect.arrayContaining(['table']));
        expect(silent.some((b) => b.type === 'diagram' || b.type === 'fraction_model')).toBe(true);
        for (const line of v.script) expect(READ_ALOUD_TYPES).toContain(kind.get(line.blockId));
        // Every readable block is reached, in page order.
        const readable = v.ids.filter((id) => READ_ALOUD_TYPES.includes(kind.get(id)!));
        expect([...new Set(v.script.map((l) => l.blockId))]).toEqual(readable);
        if (lang === 'hi') expect(v.script.every((l) => /[ऀ-ॿ]/.test(l.text) || /^[\d\s/=.]+$/.test(l.text))).toBe(true);
      });
    }
  }
  it('a chapter with a broken block, a missing id or a Hindi version without Devanagari is refused', () => {
    const raw = JSON.parse(JSON.stringify(waterCycle));
    expect(checkChapter(raw)).not.toBeNull();
    expect(checkChapter({ ...raw, blocks: { ...raw.blocks, en: [...raw.blocks.en, { type: 'html', html: '<b>' }] } })).toBeNull();
    expect(checkChapter({ ...raw, blocks: { ...raw.blocks, en: raw.blocks.en.map((b: object) => ({ ...b, id: undefined })) } })).toBeNull();
    expect(checkChapter({ ...raw, title: { ...raw.title, hi: 'The water cycle' } })).toBeNull();
  });
  it('resumes at the saved sentence, or the start of its block, or the beginning', () => {
    const v = chapterView(showcaseChapter('nc.showcase.water-cycle')!, 'en');
    const at = v.script.findIndex((l) => l.blockId === 'wc-clouds');
    expect(resumeIndex(v.script, { blockId: 'wc-clouds', sentence: 2 })).toBe(at + 2);
    expect(resumeIndex(v.script, { blockId: 'wc-clouds', sentence: 99 })).toBe(at);
    expect(resumeIndex(v.script, { blockId: 'gone', sentence: 0 })).toBe(0);
    expect(resumeIndex(v.script, null)).toBe(0);
    expect(isNarrationPlace(showcaseChapter('nc.showcase.water-cycle')!, 'wc-states', 0)).toBe(false);
  });
});

describe('the reader’s narration helpers (C374)', () => {
  it('a word only from a real boundary index', () => {
    expect(wordAt('The water rises.', 4)).toEqual({ start: 4, end: 9 });
    expect(wordAt('The water rises.', 10)).toEqual({ start: 10, end: 16 });
    expect(wordAt('The water rises.', 3)).toBeNull();
    expect(wordAt('The water rises.', 99)).toBeNull();
  });
  it('counts a repeated sentence in the same block, and the progress and rate', () => {
    const s = [{ blockId: 'a', sentence: 0, text: 'Yes.' }, { blockId: 'b', sentence: 0, text: 'Yes.' }, { blockId: 'a', sentence: 1, text: 'Yes.' }];
    expect([0, 1, 2].map((i) => occurrence(s, i))).toEqual([0, 0, 1]);
    expect(progressPercent(0, 4)).toBe(25);
    expect(progressPercent(3, 4)).toBe(100);
    expect(rateOf(1)).toBe(0.9);
    expect(rateOf(1.5)).toBe(1.35);
  });
});

// ---- the saved place, on the real schema ---------------------------------------------------------------------------

const ACCOUNT = 'f8000000-0000-4000-8000-0000000000a1';
const OTHER = 'f8000000-0000-4000-8000-0000000000b1';
const CHILD = 'f8000000-0000-4000-8000-0000000000c1';
const KEY = 'nc.showcase.water-cycle';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
const post = async (body: unknown, account = ACCOUNT) => {
  const { signFamilySession } = await import('@/lib/family/session');
  const { POST } = await import('@/app/api/family/reading/route');
  const cookie = `ncf_session=${await signFamilySession({ accountId: account, tokenVersion: 0, sessionId: 's1' })}`;
  const res = await POST(new NextRequest('http://localhost/api/family/reading', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) }));
  return res.status;
};
const fam = async <R,>(fn: (c: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<R>, account = ACCOUNT): Promise<R> =>
  (await import('@/lib/auth/db')).withFamilyContext({ accountId: account, tokenVersion: 0 }, fn as never) as Promise<R>;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-chapter-reader-0123456789';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'reader@example.org'), ('${OTHER}', 'other@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1'), ('${OTHER}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR');
  `);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('the child’s place in a chapter (C374)', () => {
  it('keeps a real place for the child using the app, and moves it', async () => {
    expect(await post({ chapterKey: KEY, blockId: 'wc-clouds', sentence: 2 })).toBe(200);
    expect(await post({ chapterKey: KEY, blockId: 'wc-points', sentence: 1 })).toBe(200);
    expect(await q(`select child_id, chapter_key, block_id, sentence from family.chapter_reading`)).toEqual([{ child_id: CHILD, chapter_key: KEY, block_id: 'wc-points', sentence: 1 }]);
    const { readPlace } = await import('@/lib/family/reading');
    expect(await fam((c) => readPlace(c, ACCOUNT, CHILD, KEY))).toEqual({ blockId: 'wc-points', sentence: 1 });
  });
  it('refuses a place that is not in the narration: a table, a diagram, an unknown chapter or sentence', async () => {
    for (const body of [
      { chapterKey: KEY, blockId: 'wc-states', sentence: 0 },
      { chapterKey: KEY, blockId: 'wc-cycle', sentence: 0 },
      { chapterKey: 'nc.showcase.unknown', blockId: 'wc-clouds', sentence: 0 },
      { chapterKey: KEY, blockId: 'wc-clouds', sentence: 999 },
      { chapterKey: KEY, blockId: 'wc-clouds', sentence: '1' },
    ]) expect(await post(body)).toBe(400);
  });
  it('another account has no child here and sees no place', async () => {
    expect(await post({ chapterKey: KEY, blockId: 'wc-clouds', sentence: 0 }, OTHER)).toBe(404);
    expect(await fam(async (c) => (await c.query(`select count(*)::int as n from family.chapter_reading`)).rows, OTHER)).toEqual([{ n: 0 }]);
    expect(await fam(async (c) => (await c.query(`update family.chapter_reading set sentence = 0 returning 1`)).rows, OTHER)).toEqual([]);
  });
  it('without a session, nothing is kept', async () => {
    const { POST } = await import('@/app/api/family/reading/route');
    const res = await POST(new NextRequest('http://localhost/api/family/reading', { method: 'POST', body: JSON.stringify({ chapterKey: KEY, blockId: 'wc-intro', sentence: 0 }) }));
    expect(res.status).toBe(401);
  });
});
