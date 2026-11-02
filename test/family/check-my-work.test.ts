import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { HOMEWORK_PROMPTS, LATEST_HOMEWORK_PROMPT, checkMarkSystem, checkReadSystem, homeworkPrompt, questionOfReading } from '@/lib/ai/prompts/family.homework';
import * as v1 from '@/lib/ai/prompts/family.homework/v1';
import * as v2 from '@/lib/ai/prompts/family.homework/v2';
import { checkSearchQuery } from '@/lib/family/check-work';
import { CHECK_CORE } from '@/lib/family/resolver';
import { checkBlock, type Block } from '@/lib/family/blocks';

// W16-B2: Check my work (the proposal's M8). A photo of a Class 8 Science numerical, worked by the child with one wrong
// step, is read line by line, the chapter is searched on the question the photo showed, and the working comes back
// marked step by step: verdicts (steps), the corrected working (worked_example), one similar question (check) and the
// chapter (sources). On the real migrations (PGlite), the real route and the real resolver; the AI platform's calls are
// stood in for, and the tutor's private bucket is a store in memory. Made-up names and content only.
//   1. The reading is the second half of the proof: the restatement reaches the marking, so a misread is visible.
//   2. Grounding: the passages come from the question the photo showed, not from "Check my work".
//   3. The marked working is a tutor message like any other: the feed, the memory see it; another child never does.
//   4. One photo only; a PDF or an unreadable photo is said so and nothing is marked.
//   5. Prompt v2: v1 untouched, ask mode is v1's text, the check mode asks for what the brief says.

const ai = vi.hoisted(() => ({
  asked: [] as { profile: string; system: string; content: string; images: number }[],
  reading: '',
  marking: [] as string[],
  photoOff: false,
}));
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async (_db: unknown, profile: string) => (profile === 'family.homework' ? 'v2' : profile === 'family.resolver' ? 'v9' : 'v1'),
  prepareText: async (_db: unknown, _ctx: unknown, profile: string, request: { system: string; messages: { content: string; images?: unknown[] }[] }) => {
    if (profile === 'family.homework' && ai.photoOff) return { ok: false, reason: 'not_switched_on' };
    const m = request.messages[request.messages.length - 1];
    ai.asked.push({ profile, system: request.system, content: m.content, images: m.images?.length ?? 0 });
    const lines = profile === 'family.homework' ? [ai.reading] : profile === 'family.resolver' ? ai.marking : ['{}'];
    return {
      ok: true,
      text: {
        send: async (onDelta?: (t: string) => void) => {
          for (const l of lines) onDelta?.(`${l}\n`);
          return { result: { ok: true, text: lines.join('\n'), tokensIn: 1, tokensOut: 1, provider: 'stand-in', model: 'm' }, record: async () => {} };
        },
      },
    };
  },
  dailyRequestsLeft: async () => 100,
  prepareModeration: async () => ({ ok: true, moderation: { check: async () => ({ safe: true, categories: [] }), record: async () => {} } }),
}));
const store = vi.hoisted(() => ({ files: new Map<string, Uint8Array>() }));
vi.mock('@/lib/family/tutor', async (original) => ({
  ...(await original<typeof import('@/lib/family/tutor')>()),
  tutorStorage: { get: async (key: string) => store.files.get(key) ?? null },
}));

const ACCOUNT = 'f4200000-0000-4000-8000-0000000000a1';
const OTHER = 'f4200000-0000-4000-8000-0000000000b1';
const CHILD = 'f4200000-0000-4000-8000-0000000000c1';
const SIBLING = 'f4200000-0000-4000-8000-0000000000c2';
const OTHER_CHILD = 'f4200000-0000-4000-8000-0000000000c3';
const DEVICE = 'f4200000-0000-4000-8000-0000000000e2';
const CONV = 'f4200000-0000-4000-8000-0000000000d1';
const id = (n: number) => `f4200000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const keyOf = (n: number) => `${ACCOUNT}/${CHILD}/${id(n)}.png`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

// The fixture photo, as the vision profile reads it: the question, the child's lines as written (the last one wrong:
// 20 / 4 is 5), the final answer.
const QUESTION = 'A force of 20 N acts on an area of 4 m2. Find the pressure.';
const READING = [`Question: ${QUESTION}`, 'Line 1: P = F / A', 'Line 2: P = 20 / 4', 'Line 3: P = 50 Pa', 'Answer: 50 Pa'].join('\n');
const STEP_RIGHT_1 = { label: 'Step 1: right', text: 'You wrote P = F / A. That is the formula for pressure.' };
const STEP_RIGHT_2 = { label: 'Step 2: right', text: 'You wrote P = 20 / 4. The force and the area are put in correctly.' };
const STEP_WRONG = { label: 'Step 3: wrong', text: 'You wrote 50 Pa. But 20 divided by 4 is 5, not 50.' };
const MARKING = [
  { type: 'subject', subject: 'science' },
  { type: 'sources', chapter: 'Force and Pressure', unit: 'Pressure' },
  { type: 'steps', title: 'Your working, step by step', items: [STEP_RIGHT_1, STEP_RIGHT_2, STEP_WRONG] },
  { type: 'worked_example', problem: QUESTION, steps: [{ text: 'Divide the force by the area.', expression: '20/4', result: '5' }], answer: '5 Pa' },
  { type: 'check', items: [{ id: 'c1', question: 'A force of 30 N acts on 6 m2. What is the pressure?', options: ['5 Pa', '24 Pa', '36 Pa', '180 Pa'], answer: 0, hint: 'Divide the force by the area.', why: '30 divided by 6 is 5.', wrong: ['', 'Not 24: that takes the area away from the force.', 'Not 36: that adds them.', 'Not 180: that multiplies them.'] }] },
].map((b) => JSON.stringify(b));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
type Client = { query: (s: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
const fam = async <R2,>(fn: (c: Client) => Promise<R2>, account = ACCOUNT, device: { deviceId: string; childId: string } | null = null): Promise<R2> =>
  (await import('@/lib/auth/db')).withFamilyContext({ accountId: account, tokenVersion: 0, device }, fn as never) as Promise<R2>;
let cookie = '';

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-w16-b2-check-my-work-0123456789';
  await db.pg.exec(`
    update control.settings set value = '[]'::jsonb where key in ('family.open_subjects', 'family.reviewed_only_subjects');
    update control.settings set value = '50'::jsonb where key = 'family.photo_questions_per_day';
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'check@example.org'), ('${OTHER}', 'other-check@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values
      ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'fam-notice-3'), ('${ACCOUNT}', 'photo_input', true, 'parent_tap', 'fam-notice-3'),
      ('${OTHER}', 'study_core', true, 'parent_tap', 'fam-notice-3'), ('${OTHER}', 'photo_input', true, 'parent_tap', 'fam-notice-3');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code, free_subject) values
      ('${CHILD}', '${ACCOUNT}', 'Riya', 8, 'CBSE', 'en', 'en', 'IN-UP', 'science'),
      ('${SIBLING}', '${ACCOUNT}', 'Arun', 7, 'CBSE', 'en', 'en', 'IN-UP', 'science'),
      ('${OTHER_CHILD}', '${OTHER}', 'Dev', 8, 'CBSE', 'en', 'en', 'IN-UP', 'science');
    insert into family.child_devices (device_id, account_id, child_id) values ('${DEVICE}', '${ACCOUNT}', '${SIBLING}');
    insert into family.tutor_conversations (conversation_id, account_id, child_id, subject) values ('${CONV}', '${ACCOUNT}', '${CHILD}', 'science');
  `);
  // The chapter the working belongs to, published to everyone (made-up words in the chapter's style).
  await q(
    `insert into content.chapter_contents (chapter_key, version_no, subject, board_id, class_level, title_en, title_hi, blocks, status, source, created_by, reviewed_by, reviewed_at, published_by, published_at)
     values ('cbse.c8.science.force-pressure', 1, 'science', 'CBSE', 8, 'Force and Pressure', 'बल और दाब', $1::jsonb, 'published', 'studio', $2, $2, now(), $2, now())`,
    [
      JSON.stringify({
        en: [{ type: 'explanation', title: 'Pressure', idea: 'Pressure is the force acting on each unit of area: pressure = force / area, in pascals when the force is in newtons and the area in square metres.', paragraphs: ['A larger area spreads the same force, so the pressure is smaller.'], example: 'A sharp knife cuts easily.', steps: ['Divide the force by the area.'], terms: [] }],
        hi: [],
      }),
      'f4200000-0000-4000-8000-0000000000f1',
    ]
  );
  const file = async (n: number, bytes: Uint8Array, mime = 'image/png', ext = 'png') => {
    await q(`insert into family.tutor_attachments (attachment_id, conversation_id, account_id, child_id, status, mime, size_bytes, storage_key) values ($1, $2, $3, $4, 'ready', $5, $6, $7)`, [id(n), CONV, ACCOUNT, CHILD, mime, bytes.length, `${ACCOUNT}/${CHILD}/${id(n)}.${ext}`]);
    store.files.set(`${ACCOUNT}/${CHILD}/${id(n)}.${ext}`, bytes);
  };
  for (const n of [1, 2, 3, 4, 5, 6, 8, 9, 10, 11]) await file(n, PNG);
  await file(7, new TextEncoder().encode('%PDF-1.4\n%%EOF'), 'application/pdf', 'pdf');
  const { signFamilySession } = await import('@/lib/family/session');
  cookie = `ncf_session=${await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' })}; ncf_child=${CHILD}`;
  R = { understand: await import('@/app/api/family/understand/route'), tutor: await import('@/lib/family/tutor') };
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});
beforeEach(() => {
  ai.asked = [];
  ai.reading = READING;
  ai.marking = MARKING;
  ai.photoOff = false;
});

const ask = async (files: string[], over: Record<string, unknown> = {}, text = 'Check my work') => {
  const res = await R.understand.POST(
    new NextRequest('http://localhost/api/family/understand', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ kind: 'question', text, tutor: { subject: 'science', files, mode: 'check', ...over } }) })
  );
  if (res.headers.get('content-type')?.startsWith('application/json')) return { status: res.status, events: [{ json: await res.json() }] as any[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, events: (await res.text()).trim().split('\n').map((l: string) => JSON.parse(l)) as any[] };
};
const marking = () => ai.asked.find((a) => a.profile === 'family.resolver');

describe('a photo of a Class 8 Science numerical with one wrong step', () => {
  it('comes back marked: one wrong verdict, the corrected working, one similar question, the chapter', async () => {
    const { status, events } = await ask([id(1)]);
    expect(status).toBe(200);
    const blocks = events.filter((e) => e.t === 'block').map((e) => e.block);
    expect(blocks.map((b: { type: string }) => b.type)).toEqual(['sources', 'steps', 'worked_example', 'check']);
    const steps = blocks.find((b: { type: string }) => b.type === 'steps');
    expect(steps.items.map((i: { label: string }) => i.label)).toEqual(['Step 1: right', 'Step 2: right', 'Step 3: wrong']);
    expect(steps.items.filter((i: { label: string }) => /wrong/.test(i.label))).toHaveLength(1);
    // The corrected working is checked by our code (20 / 4 = 5) and gives the answer only after the verdicts.
    expect(blocks.findIndex((b: { type: string }) => b.type === 'steps')).toBeLessThan(blocks.findIndex((b: { type: string }) => b.type === 'worked_example'));
    const worked = blocks.find((b: { type: string }) => b.type === 'worked_example');
    expect(worked).toMatchObject({ problem: QUESTION, answer: '5 Pa', steps: [{ expression: '20/4', result: '5' }] });
    // The chapter chip: one sources block naming the chapter, no links; the similar question is sealed (no answer on the phone).
    expect(blocks.find((b: { type: string }) => b.type === 'sources')).toMatchObject({ chapter: 'Force and Pressure', unit: 'Pressure', links: [] });
    expect(JSON.stringify(blocks.find((b: { type: string }) => b.type === 'check'))).not.toContain('"answer"');
    expect(events.find((e) => e.t === 'done')).toMatchObject({ complete: true, missing: [], cut: false, chat: { subject: 'science' } });
    expect(events.find((e) => e.t === 'files')?.message).toBe('The tutor read 1 of 1 attached files.');
    // Every verdict is in words: no tick or cross symbols.
    expect(JSON.stringify(steps)).not.toMatch(/[✓✔✗✘×]/u);
  });

  it('reads the photo line by line through the vision profile, and the restatement reaches the marking', async () => {
    await ask([id(2)]);
    const read = ai.asked.find((a) => a.profile === 'family.homework')!;
    expect(read.images).toBe(1);
    expect(read.system).toContain('Do not mark, correct, explain or answer anything');
    expect(read.system).toContain('Line 1:');
    const m = marking()!;
    // What was read is in the marking's request, line by line, so a misread shows in the verdicts.
    expect(m.content).toContain(`Question: ${QUESTION}`);
    expect(m.content).toContain('Line 3: P = 50 Pa');
    expect(m.system).toContain('restate it, so a misread shows');
    expect(m.system).toContain('Never give the whole answer first');
    expect(m.system).toContain('Class 8');
    // No planning call: the plan is the marking's own.
    expect(ai.asked.some((a) => a.profile === 'family.plan')).toBe(false);
    expect(ai.asked.filter((a) => a.profile === 'family.homework')).toHaveLength(1);
    // The restated working is in the answer itself: the question as read, and each step quoting what was written.
    expect(MARKING.join('\n')).toContain(QUESTION);
  });

  it('searches the chapter on the question the photo showed, so the passages match; the chip names it', async () => {
    await ask([id(3)]);
    const m = marking()!;
    expect(m.system).toContain('[1] Force and Pressure');
    expect(m.system).toContain('pressure = force / area');
    expect(m.system).toContain('Write exactly ONE sources block naming the chapter');
  });

  it('with no passage found: no sources block is asked for, and the marking is still given', async () => {
    ai.reading = ['Question: Who built the Red Fort and in which year was it finished?', 'Line 1: Shah Jahan', 'Line 2: 1648', 'Answer: Shah Jahan, 1648'].join('\n');
    ai.marking = MARKING.filter((l) => !l.includes('"sources"'));
    const { events } = await ask([id(4)]);
    expect(marking()!.system).toContain('No chapter of the student\'s library matched this question');
    expect(marking()!.system).not.toContain('Write exactly ONE sources block');
    expect(events.filter((e) => e.t === 'block').map((e) => e.block.type)).toEqual(['steps', 'worked_example', 'check']);
    expect(events.find((e) => e.t === 'done')).toMatchObject({ complete: true });
  });

  it('one photo only, and a photo that cannot be read marks nothing', async () => {
    expect((await ask([id(1), id(2)])).status).toBe(400);
    expect(ai.asked).toEqual([]);
    const pdf = await ask([id(7)]);
    expect(pdf.events).toEqual([expect.objectContaining({ t: 'refused', message: expect.stringContaining('not a PDF') })]);
    expect(ai.asked).toEqual([]);
    ai.reading = 'UNREADABLE';
    const blank = await ask([id(5)]);
    expect(blank.events.some((e) => e.t === 'block')).toBe(false);
    expect(blank.events.at(-1)).toMatchObject({ t: 'refused', message: expect.stringContaining('could not be read') });
    expect(ai.asked.some((a) => a.profile === 'family.resolver')).toBe(false);
    // No file and no typed sum: the words are answered as the ordinary question they are (W18), never a bad request.
    expect((await ask([])).status).toBe(200);
  });
});

// W18-Q3: Check my work always gives a verdict. When the model's verdicts are missing or refused by our checks, our own
// arithmetic marks the reading's equation lines, first; with nothing to mark the child is told so, and no lesson shows.
describe('a verdict is guaranteed', () => {
  const SUMS = ['Question: Multiply.', 'Line 1: 5 × 6 = 32', 'Line 2: 45 x 2 = 90', 'Answer: 32'].join('\n');
  const SUBJECT = JSON.stringify({ type: 'subject', subject: 'science' });
  const WORKED = MARKING.find((l) => l.includes('"worked_example"'))!;
  const CHECK = MARKING.find((l) => l.includes('"type":"check"'))!;
  const blocksOf = (events: { t: string; block?: { type: string } }[]) => events.filter((e) => e.t === 'block').map((e) => e.block!);
  const verdictLog = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('"family.check.verdict"')).map((l) => JSON.parse(l) as Record<string, unknown>);

  it('the model sends no steps line: the verdicts come from the reading, before the corrected working', async () => {
    ai.reading = SUMS;
    // The worked example first, as a model that skips the verdicts would write it.
    ai.marking = [SUBJECT, WORKED, CHECK];
    const spy = vi.spyOn(console, 'info');
    const { events } = await ask([id(8)]);
    const blocks = blocksOf(events);
    expect(blocks.map((b) => b.type)).toEqual(['steps', 'worked_example', 'check']);
    expect((blocks[0] as unknown as { items: unknown[] }).items).toEqual([
      { label: 'Step 1: wrong', text: '5 × 6 = 30, not 32.' },
      { label: 'Step 2: right', text: '45 × 2 = 90 is correct.' },
    ]);
    expect(events.find((e) => e.t === 'done')).toMatchObject({ complete: true, missing: [] });
    expect(verdictLog(spy).at(-1)).toMatchObject({ from: 'arithmetic', stepsRejected: 'none' });
    spy.mockRestore();
  });

  it('the model sends a steps line our checks refuse: it is counted with its reason, and the verdicts still come first', async () => {
    ai.reading = SUMS;
    const six = { type: 'steps', title: 'Your working', items: Array.from({ length: 6 }, (_, i) => ({ label: `Step ${i + 1}: right`, text: 'Fine.' })) };
    ai.marking = [SUBJECT, WORKED, JSON.stringify(six), CHECK];
    const spy = vi.spyOn(console, 'info');
    const { events } = await ask([id(9)]);
    expect(blocksOf(events).map((b) => b.type)).toEqual(['steps', 'worked_example', 'check']);
    expect(JSON.stringify(blocksOf(events)[0])).toContain('5 × 6 = 30, not 32.');
    const logged = verdictLog(spy).at(-1)!;
    expect(logged).toMatchObject({ from: 'arithmetic', stepsRejected: 'too_many_items' });
    // A count and a reason: none of the child's working is in the log.
    expect(JSON.stringify(logged)).not.toContain('32');
    spy.mockRestore();
  });

  it('the model’s own verdicts arrive after its worked example: the verdicts are still shown first', async () => {
    ai.marking = [SUBJECT, WORKED, MARKING.find((l) => l.includes('"steps"'))!, CHECK];
    const { events } = await ask([id(10)]);
    expect(blocksOf(events).map((b) => b.type)).toEqual(['steps', 'worked_example', 'check']);
  });

  it('nothing to mark and no verdicts from the model: the child is told so, and no lesson is shown', async () => {
    ai.reading = ['Question: Who built the Red Fort?', 'Line 1: Shah Jahan', 'Answer: Shah Jahan'].join('\n');
    ai.marking = [SUBJECT, JSON.stringify({ type: 'explanation', title: 'Red Fort', idea: 'An idea.', example: 'An example.', steps: ['One.'], terms: [] }), WORKED, CHECK];
    const { events } = await ask([id(11)]);
    expect(blocksOf(events)).toEqual([]);
    expect(events.at(-1)).toEqual({ t: 'refused', reason: 'not_found', message: 'I could not mark this working. Try a clearer photo, one sum per line.' });
  });

  it('typed "Check my work: 2+3×4=14": no photo is read, the working is marked, and no lesson is given', async () => {
    ai.marking = [SUBJECT, JSON.stringify({ type: 'explanation', title: 'Order of operations', idea: 'An idea.', example: 'An example.', steps: ['One.'], terms: [] }), CHECK];
    const { status, events } = await ask([], {}, 'Check my work: 2+3×4=14');
    expect(status).toBe(200);
    // No vision call: the reading is the typed text, line by line.
    expect(ai.asked.some((a) => a.profile === 'family.homework')).toBe(false);
    expect(marking()!.content).toContain('Line 1: 2+3×4=14');
    expect(marking()!.system).toContain('marking a Class 8 student');
    const blocks = blocksOf(events);
    expect(blocks.map((b) => b.type)).toEqual(['steps', 'check']);
    expect((blocks[0] as unknown as { items: unknown[] }).items).toEqual([{ label: 'Step 1: right', text: '2+3×4 = 14 is correct.' }]);
    expect(events.some((e) => e.t === 'files')).toBe(false);
    expect(events.find((e) => e.t === 'done')).toMatchObject({ complete: true });
    // Typed words that open like a check but hold nothing our arithmetic can mark are answered as an ordinary question.
    expect((await ask([], {}, 'Check my work: x + 2 = 5')).status).toBe(200);
  });
});

describe('the marked working is a tutor message like any other', () => {
  it('is kept with its stored blocks (verdicts, the corrected working, the chapter) and the photo; the similar question is not', async () => {
    const { events } = await ask([id(6)], {}, 'Check my work on question 3');
    const chat = events.find((e) => e.t === 'done').chat.chatId as string;
    const turns = (await fam((c) => R.tutor.readFeed(c, ACCOUNT, CHILD, 'science'))) as { chatId: string; role: string; text?: string; blocks?: Block[]; files?: unknown[] }[];
    // The feed is oldest first: this turn is its last child turn and the answer after it.
    const mine = turns.slice(-2);
    expect(mine.every((t) => t.chatId === chat)).toBe(true);
    expect(mine.map((t) => t.role)).toEqual(['child', 'tutor']);
    expect(mine[0]).toMatchObject({ text: 'Check my work on question 3', files: [expect.objectContaining({ id: id(6) })] });
    const stored = mine[1].blocks as Block[];
    expect(stored.map((b) => b.type)).toEqual(['sources', 'steps', 'worked_example']);
    // The stored blocks read back through the checker unchanged (the feed and the library draw the same blocks).
    for (const b of stored) expect(checkBlock(b)).toEqual(b);
    expect(JSON.stringify(await q(`select blocks from family.tutor_messages where role = 'tutor' and conversation_id = $1`, [chat]))).not.toMatch(/"type":"(check|practice)"/);
  });

  it('is remembered: the chat’s memory holds its verdicts, so a follow-up sees what was said', async () => {
    const chat = (await q(`select conversation_id from family.tutor_conversations where child_id = $1 and turn_count > 0 order by last_at desc limit 1`, [CHILD]))[0].conversation_id as string;
    const memory = (await fam((c) => R.tutor.memoryFor(c, chat))) as { turns: { role: string; text: string }[] };
    const tutorTurn = memory.turns.filter((t) => t.role === 'tutor').at(-1)!;
    expect(tutorTurn.text).toContain('Step 3: wrong');
    expect(tutorTurn.text).toContain('20 divided by 4 is 5');
  });

  it('is never read by a sibling or another family: the message and the photo', async () => {
    const chat = (await q(`select conversation_id from family.tutor_conversations where child_id = $1 and turn_count > 0 order by last_at desc limit 1`, [CHILD]))[0].conversation_id as string;
    const mine = (await q(`select count(*)::int as n from family.tutor_messages where conversation_id = $1`, [chat]))[0].n;
    expect(mine).toBeGreaterThanOrEqual(2);
    const count = (table: string) => async (c: Client) => (await c.query(`select count(*)::int as n from family.${table}`)).rows[0].n as number;
    // The sibling on its own phone: nothing of the child's messages, conversation or attachments.
    for (const table of ['tutor_messages', 'tutor_conversations', 'tutor_attachments']) {
      expect(await fam(count(table), ACCOUNT, { deviceId: DEVICE, childId: SIBLING })).toBe(0);
      expect(await fam(count(table), OTHER)).toBe(0);
    }
    expect(await fam((c) => R.tutor.readFeed(c, ACCOUNT, CHILD, 'science'), ACCOUNT, { deviceId: DEVICE, childId: SIBLING })).toEqual([]);
    expect(await fam((c) => R.tutor.readFeed(c, OTHER, CHILD, 'science'), OTHER)).toEqual([]);
    // The photo's link is handed to no one else, and the other family cannot change or remove the message.
    expect(await fam((c) => R.tutor.signedTutorFile(c, { sign: async () => 'https://x.invalid/u', get: async () => null }, ACCOUNT, SIBLING, id(6)))).toBeNull();
    expect(await fam((c) => R.tutor.signedTutorFile(c, { sign: async () => 'https://x.invalid/u', get: async () => null }, OTHER, OTHER_CHILD, id(6)), OTHER)).toBeNull();
    expect(await fam(async (c) => (await c.query(`delete from family.tutor_messages returning 1`)).rows, OTHER)).toEqual([]);
    expect(await fam(async (c) => (await c.query(`update family.tutor_attachments set status = 'removed' returning 1`)).rows, OTHER)).toEqual([]);
    expect((await q(`select count(*)::int as n from family.tutor_messages where conversation_id = $1`, [chat]))[0].n).toBe(mine);
  });
});

describe('the prompt (family.homework v2)', () => {
  it('registers v2 after v1; v1 is unchanged and v2 asks the hint ladder exactly as v1 does', () => {
    expect(HOMEWORK_PROMPTS.map((p) => p.version)).toEqual(['v1', 'v2']);
    expect(LATEST_HOMEWORK_PROMPT).toBe('v2');
    expect(v1.HOMEWORK_PROMPT_VERSION).toBe('v1');
    expect(v2.HOMEWORK_PROMPT_VERSION).toBe('v2');
    const a = { board: 'CBSE', classLevel: 8, classSubjects: ['science'], language: 'en' as const, style: 'en' as const };
    expect(homeworkPrompt('v1').system(a)).toBe(v1.homeworkSystem(a));
    expect(homeworkPrompt('v2').system(a)).toBe(v1.homeworkSystem(a));
    expect(homeworkPrompt('v2').system({ ...a, mode: 'ask' })).toBe(v1.homeworkSystem(a));
    expect(homeworkPrompt('v2').user()).toBe(v1.homeworkUser());
    expect(homeworkPrompt('v9').version).toBe('v2');
    expect(homeworkPrompt(null).version).toBe('v2');
    expect(homeworkPrompt('v2').system({ ...a, mode: 'check' })).toBe(checkReadSystem(a));
  });

  it('reads line by line and restates; marks each step right, wrong or missing; gives the correct step, never the whole answer first', () => {
    const read = checkReadSystem({ classLevel: 8, board: 'CBSE' });
    expect(read).toMatch(/Question: /);
    expect(read).toMatch(/Line 1/);
    expect(read).toContain('[unclear]');
    expect(read).toContain('UNREADABLE');
    const base = { board: 'CBSE', classLevel: 8, subject: 'science' as const, openSubjects: [], classSubjects: [], language: 'en' as const, style: 'hinglish' as const, question: READING };
    const withChapter = checkMarkSystem({ ...base, passages: [{ chapterKey: 'k', title: 'Force and Pressure', text: 'pressure = force / area', score: 1 }] });
    expect(withChapter).toContain('right, wrong or missing');
    expect(withChapter).toContain('give the correct step');
    expect(withChapter).toContain('Never give the whole answer first');
    expect(withChapter).toContain('Hinglish');
    expect(withChapter).toContain('Write exactly ONE sources block');
    expect(withChapter).toContain('"type":"steps"');
    expect(withChapter).toContain('"type":"worked_example"');
    expect(withChapter).toContain('"type":"check"');
    expect(withChapter).not.toMatch(/[✓✔✗✘]/u);
    const without = checkMarkSystem(base);
    expect(without).toContain('do not name a chapter');
    expect(without).not.toContain('Write exactly ONE sources block');
    expect(CHECK_CORE).toEqual(['steps', 'check']);
  });

  it('finds the question in the reading, and searches the chapter on its content words', () => {
    expect(questionOfReading(`[File 1, photo]\n${READING}`)).toBe(QUESTION);
    expect(questionOfReading('Line 1: P = F / A')).toBeNull();
    expect(checkSearchQuery(QUESTION)).toBe('force or acts or area or pressure');
    expect(checkSearchQuery('Find the 2 or 3')).toBe('');
    expect(checkSearchQuery('बल और दाब')).toBe('बल or और or दाब');
  });

  it('the migration moves family.homework to v2 the way W16-A2’s moved the resolver, and can be rolled back', () => {
    const file = 'supabase/migrations/20261102074040_w16_b2_homework_v2.sql';
    expect(existsSync(file)).toBe(true);
    const sql = readFileSync(file, 'utf8');
    expect(sql).toMatch(/update control\.ai_profiles set prompt_version = 'v2' where profile_id = 'family\.homework' and prompt_version = 'v1';/);
    expect(sql).toMatch(/Rollback: update control\.ai_profiles set prompt_version = 'v1'/);
  });
});
