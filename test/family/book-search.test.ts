import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { bookPassages, childBooks, searchBooks, skeleton, sourceTitle, stem, type SearchIndex } from '@/lib/family/book-search';
import { BOOKS } from '@/lib/family/books';

// C505: a typed question is answered from the child's own published book (reader/content/<cNN>/<subject>/search.json).
const ROOT = path.resolve(__dirname, '../..');
const load = (rel: string) => JSON.parse(readFileSync(path.join(ROOT, 'reader/content', rel, 'search.json'), 'utf8')) as SearchIndex;
const ALL = ['c01/english', 'c01/hindi', 'c01/mathematics', 'c10/mathematics', 'c10/science'].map(load);
const science = (question: string, lang: 'en' | 'hi' = 'en') => searchBooks(ALL, { question, classLevel: 10, board: 'CBSE', subject: 'science', lang });
const any10 = (question: string, lang: 'en' | 'hi' = 'en') => searchBooks(ALL, { question, classLevel: 10, board: 'CBSE', subject: null, lang });

describe('the generated search index (C505)', () => {
  it('has every topic of the published chapters and none of a draft, the same every time it is built', async () => {
    // @ts-expect-error -- a plain .mjs script, no types
    const lib = await import('../../reader/scripts/books-lib.mjs');
    const content = path.join(ROOT, 'reader/content');
    const a = lib.buildAll(content).files as Record<string, string>;
    expect(lib.buildAll(content).files).toEqual(a);
    expect(a['c10/science/search.json']).toBe(readFileSync(path.join(content, 'c10/science/search.json'), 'utf8'));
    for (const rel of ['c10/mathematics', 'c10/science']) {
      const ix = JSON.parse(a[`${rel}/search.json`]) as SearchIndex;
      const index = JSON.parse(readFileSync(path.join(content, rel, 'index.json'), 'utf8')) as { chapters: { key: string; file: string | null }[] };
      for (const c of index.chapters.filter((x) => x.file)) {
        const ch = JSON.parse(readFileSync(path.join(content, c.file!), 'utf8')) as { status?: string; topics: { id: string }[] };
        const got = ix.topics.filter((t) => t.chapter_key === c.key).map((t) => t.topic);
        expect(got, c.key).toEqual(ch.status === 'draft' ? [] : ch.topics.map((t) => t.id));
      }
      for (const t of ix.topics) {
        expect(t.text.en.length).toBeLessThanOrEqual(lib.SEARCH_TEXT_MAX);
        expect(t.text.hi.length).toBeLessThanOrEqual(lib.SEARCH_TEXT_MAX);
        expect(`${t.text.en}${t.text.hi}`).not.toMatch(/<[a-z/]|\{\{/);
      }
    }
    // Class 10 Mathematics has draft chapters, and they are not in it.
    expect(JSON.parse(a['c10/mathematics/search.json']).topics.length).toBeGreaterThan(0);
  });
});

describe('the words (C505)', () => {
  it('stems English plurals and endings the same way', () => {
    expect(stem('reflection')).toBe(stem('reflected'));
    expect(stem('lenses')).toBe(stem('lens'));
    expect(stem('images')).toBe(stem('image'));
    expect(stem('mirrors')).toBe('mirror');
  });
  it('gives Hindi in Roman letters and in Devanagari one skeleton', () => {
    expect(skeleton('prakash')).toBe(skeleton('प्रकाश'));
    expect(skeleton('paravartan')).toBe(skeleton('परावर्तन'));
    expect(skeleton('apvartan')).toBe(skeleton('अपवर्तन'));
    expect(skeleton('pachan')).toBe(skeleton('पाचन'));
    expect(skeleton('oozone')).toBe(skeleton('ओज़ोन'.replace('़', '')));
  });
});

describe('a Class 10 Science question finds its topic in the book (C505)', () => {
  const cases: [string, 'en' | 'hi', string, string][] = [
    ['What is refraction of light?', 'en', 'u.c10.science.jesc1.ch09', 't06'],
    ['Why is the sky blue?', 'en', 'u.c10.science.jesc1.ch10', 't08'],
    ["State Ohm's law", 'en', 'u.c10.science.jesc1.ch11', 't03'],
    ['How do plants make their own food?', 'en', 'u.c10.science.jesc1.ch05', 't02'],
    ['प्रकाश का अपवर्तन क्या है?', 'hi', 'u.c10.science.jesc1.ch09', 't06'],
    ['ओज़ोन परत पतली क्यों हो रही है?', 'hi', 'u.c10.science.jesc1.ch13', 't07'],
    ['prakash ka paravartan kya hai', 'hi', 'u.c10.science.jesc1.ch09', 't01'],
    ['pachan kaise hota hai', 'hi', 'u.c10.science.jesc1.ch05', 't03'],
  ];
  for (const [q, lang, chapter, topic] of cases) {
    it(q, () => {
      const hits = science(q, lang);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.length).toBeLessThanOrEqual(3);
      expect(`${hits[0].topic.chapter_key} ${hits[0].topic.topic}`).toBe(`${chapter} ${topic}`);
      expect(hits[0].text.length).toBeGreaterThan(40);
      expect(hits[0].text.length).toBeLessThanOrEqual(700);
      if (lang === 'hi') expect(hits[0].text).toMatch(/[ऀ-ॿ]/);
      // The same topic leads when the subject is not known yet (every book of the class).
      expect(`${any10(q, lang)[0]?.topic.chapter_key} ${any10(q, lang)[0]?.topic.topic}`).toBe(`${chapter} ${topic}`);
    });
  }

  it('returns nothing for a question the book does not answer', () => {
    for (const q of ['Who won the cricket world cup in 2011?', 'How do I make pizza at home?', 'Tell me a joke', 'kal ka match kisne jeeta']) {
      expect(any10(q), q).toEqual([]);
    }
  });

  it('never searches another class’s or board’s book', () => {
    expect(searchBooks(ALL, { question: 'What is refraction of light?', classLevel: 10, board: 'CISCE', subject: null, lang: 'en' })).toEqual([]);
    expect(searchBooks(ALL, { question: 'What is refraction of light?', classLevel: 9, board: 'CBSE', subject: null, lang: 'en' })).toEqual([]);
    for (const h of searchBooks(ALL, { question: 'What is refraction of light?', classLevel: 1, board: 'CBSE', subject: null, lang: 'en' })) expect(h.topic.chapter_key).toMatch(/^u\.c01\./);
    expect(searchBooks(ALL, { question: 'What is refraction of light?', classLevel: 10, board: 'CBSE', subject: 'mathematics', lang: 'en' }).every((h) => h.subject === 'mathematics')).toBe(true);
  });

  it('names the source in words, chapter number, chapter and topic', () => {
    const t = science('What is refraction of light?')[0].topic;
    expect(sourceTitle(t, 'en')).toBe('Chapter 9, Light – Reflection and Refraction, topic: Refraction of light');
    expect(sourceTitle(t, 'hi')).toMatch(/^अध्याय 9, /);
  });
});

describe('the books a child may be taught from (C505)', () => {
  it('only the book bookFor offers, and only subjects of the class', () => {
    expect(childBooks({ classLevel: 10, board: 'CBSE', subject: null, subjects: ['science', 'mathematics'] }).map((b) => b.id).sort()).toEqual(['ncert.jemh1', 'ncert.jesc1']);
    expect(childBooks({ classLevel: 10, board: 'CBSE', subject: null, subjects: ['mathematics'] }).map((b) => b.id)).toEqual(['ncert.jemh1']);
    expect(childBooks({ classLevel: 10, board: 'CISCE', subject: null, subjects: ['science'] })).toEqual([]);
    expect(childBooks({ classLevel: 10, board: 'CBSE', subject: 'science', subjects: ['science'] }, BOOKS).map((b) => b.id)).toEqual(['ncert.jesc1']);
  });

  it('reads the files and gives passages in the prompt’s shape', async () => {
    const files = { read: async (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8') };
    const got = await bookPassages({ question: 'Why is the sky blue?', classLevel: 10, board: 'CBSE', subject: null, lang: 'en', subjects: ['science'] }, files);
    expect(got[0]).toMatchObject({ chapterKey: 'u.c10.science.jesc1.ch10', title: expect.stringMatching(/^Chapter 10, /) });
    expect(await bookPassages({ question: 'Why is the sky blue?', classLevel: 10, board: 'CBSE', subject: null, lang: 'en', subjects: [] }, files)).toEqual([]);
    expect(await bookPassages({ question: 'Why is the sky blue?', classLevel: 10, board: 'CBSE', subject: null, lang: 'en', subjects: ['science'] }, { read: async () => null })).toEqual([]);
  });
});
