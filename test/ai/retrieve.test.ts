import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { PASSAGE_MAX, retrievePassages, type RetrieveAsk } from '@/lib/ai/teaching/retrieve';

// W9-B: chapter retrieval on the real migrations (PGlite), read as the family role, as the answer's first transaction
// reads it. A published chapter is found by a question in its own words; the open chapter comes first, then the child's
// own syllabus chapters; a Hindi question is found through search_hi; a draft is never found; nothing found is an empty
// list, not an error. Made-up chapters only.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

const STAFF = 'c9000000-0000-4000-8000-0000000000a1';
const long = 'Plants make food in their leaves. '.repeat(60);

const explanation = (title: string, idea: string, paragraphs: string[]) => ({ type: 'explanation', title, idea, paragraphs, example: 'A made-up example.', steps: ['One step.'], terms: [] });

async function chapter(key: string, o: { subject?: string; classLevel?: number; titleEn: string; titleHi: string; en: unknown[]; hi?: unknown[]; status?: string }) {
  const published = (o.status ?? 'published') === 'published';
  await db.pg.query(
    `insert into content.chapter_contents (chapter_key, version_no, subject, board_id, class_level, title_en, title_hi, blocks, status, source, created_by, reviewed_by, reviewed_at, published_by, published_at)
     values ($1, 1, $2, 'CBSE', $3, $4, $5, $6::jsonb, $7, 'studio', $8, $9, case when $9::uuid is null then null else now() end, $10, case when $10::uuid is null then null else now() end)`,
    [key, o.subject ?? 'science', o.classLevel ?? 7, o.titleEn, o.titleHi, JSON.stringify({ en: o.en, hi: o.hi ?? [] }), o.status ?? 'published', STAFF, published ? STAFF : null, published ? STAFF : null]
  );
}

const asFamily = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', '', true)`);
    return fn(tx);
  });

const ask = (o: Partial<RetrieveAsk>): RetrieveAsk => ({ question: '', subject: 'science', classLevel: 7, boardId: 'CBSE', lang: 'en', chapterKey: null, ...o });
const find = (o: Partial<RetrieveAsk>) => asFamily((tx) => retrievePassages(tx, ask(o)));

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await chapter('cbse.c7.science.photosynthesis', {
    titleEn: 'Nutrition in plants',
    titleHi: 'पौधों में पोषण',
    en: [explanation('How plants make food', 'Green leaves make food by photosynthesis using sunlight, water and carbon dioxide.', [long]), { type: 'key_points', points: ['Chlorophyll traps sunlight.', 'Stomata take in carbon dioxide.'] }],
    hi: [explanation('पौधे भोजन कैसे बनाते हैं', 'हरी पत्तियाँ प्रकाश संश्लेषण से भोजन बनाती हैं।', ['पत्तियों में क्लोरोफिल सूर्य का प्रकाश पकड़ता है।'])],
  });
  await chapter('cbse.c7.science.respiration', {
    titleEn: 'Respiration in organisms',
    titleHi: 'जीवों में श्वसन',
    en: [explanation('Breathing and respiration', 'Cells release energy from food; plants also respire through their leaves.', ['Leaves have stomata for gases.'])],
  });
  await chapter('cbse.c7.science.heat', {
    titleEn: 'Heat',
    titleHi: 'ऊष्मा',
    en: [explanation('Conduction', 'Heat flows from a hotter object to a colder one.', ['A metal spoon gets hot in tea.'])],
  });
  await chapter('cbse.c7.science.draft', {
    titleEn: 'Photosynthesis draft',
    titleHi: 'मसौदा',
    en: [explanation('Photosynthesis in leaves', 'Leaves photosynthesis sunlight food.', ['Draft words.'])],
    status: 'draft',
  });
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('retrievePassages', () => {
  it('finds a published chapter by a question in its own words, with a passage of at most 700 characters', async () => {
    const found = await find({ question: 'How do leaves make food from sunlight?' });
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]).toMatchObject({ chapterKey: 'cbse.c7.science.photosynthesis', title: 'Nutrition in plants' });
    expect(found[0].text.length).toBeGreaterThan(0);
    expect(found.every((p) => p.text.length <= PASSAGE_MAX)).toBe(true);
    expect(found.map((p) => p.chapterKey)).not.toContain('cbse.c7.science.heat');
    // A draft is never read by a family, however well it matches.
    expect(found.map((p) => p.chapterKey)).not.toContain('cbse.c7.science.draft');
  });

  it('puts the open chapter first, then the child\'s own syllabus chapters', async () => {
    const plain = await find({ question: 'leaves' });
    expect(plain.map((p) => p.chapterKey)).toEqual(expect.arrayContaining(['cbse.c7.science.photosynthesis', 'cbse.c7.science.respiration']));
    const open = await find({ question: 'leaves', chapterKey: 'cbse.c7.science.respiration' });
    expect(open[0].chapterKey).toBe('cbse.c7.science.respiration');
    const mine = await find({ question: 'leaves', syllabusTitles: ['Respiration in Organisms'] });
    expect(mine[0].chapterKey).toBe('cbse.c7.science.respiration');
  });

  it('finds a Hindi question through search_hi, and quotes the Hindi chapter', async () => {
    const found = await find({ question: 'प्रकाश संश्लेषण', lang: 'hi' });
    expect(found[0]).toMatchObject({ chapterKey: 'cbse.c7.science.photosynthesis', title: 'पौधों में पोषण' });
    expect(found[0].text).toContain('प्रकाश');
  });

  it('keeps to the subject and class, and returns an empty list when nothing matches', async () => {
    expect(await find({ question: 'leaves', classLevel: 9 })).toEqual([]);
    expect(await find({ question: 'leaves', subject: 'mathematics' })).toEqual([]);
    expect(await find({ question: 'quadratic equations and their roots' })).toEqual([]);
    expect(await find({ question: ' ' })).toEqual([]);
    // A typed question whose subject is not known yet searches the class.
    expect((await find({ question: 'conduction of heat', subject: null }))[0]?.chapterKey).toBe('cbse.c7.science.heat');
  });
});
