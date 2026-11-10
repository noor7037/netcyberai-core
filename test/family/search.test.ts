import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import bookTopics from '@/lib/family/book-topics.json';
import { MAX_HITS, normalize, rank, scoreTitles, type SearchEntry } from '@/lib/family/search';
import { waitingBySubject } from '@/lib/family/quiz';

// W22-S1: the Study search (matching, ranking, English and Hindi, typos) and the per-subject quiz count.

const e = (kind: SearchEntry['kind'], en: string, hi: string, subject = 'science'): SearchEntry => ({ kind, subject, titles: [en, hi], title: { en, hi }, context: null, href: `/x/${en}` });
const ENTRIES = [
  e('subject', 'Science', 'विज्ञान'),
  e('subject', 'Mathematics', 'गणित', 'mathematics'),
  e('chapter', 'Chemical Reactions and Equations', 'रासायनिक अभिक्रियाएँ एवं समीकरण'),
  e('topic', 'Balancing a chemical equation', 'रासायनिक समीकरण को संतुलित करना'),
  e('chapter', 'Number Systems', 'संख्या पद्धति', 'mathematics'),
  e('topic', 'Photosynthesis', 'प्रकाश संश्लेषण'),
];
const titles = (q: string, lang: 'en' | 'hi' = 'en') => rank(ENTRIES, q, lang).map((h) => h.title);

describe('search matching', () => {
  it('is case-insensitive and matches a word beginning', () => {
    expect(titles('CHEMI')).toEqual(expect.arrayContaining(['Chemical Reactions and Equations', 'Balancing a chemical equation']));
    expect(titles('science')[0]).toBe('Science');
  });
  it('needs every typed word', () => {
    expect(titles('chemical equation')).toContain('Balancing a chemical equation');
    expect(titles('chemical photosynthesis')).toEqual([]);
  });
  it('matches Hindi titles and English typed by a Hindi child', () => {
    expect(titles('गणित', 'hi')).toEqual(['गणित']);
    expect(titles('mathematics', 'hi')).toEqual(['गणित']);
    expect(titles('संश्लेषण', 'hi')).toEqual(['प्रकाश संश्लेषण']);
  });
  it('forgives a small typo in a longer word', () => {
    expect(titles('mathmatics')).toEqual(['Mathematics']);
    expect(titles('photosyntesis')).toEqual(['Photosynthesis']);
    expect(titles('xyzzy')).toEqual([]);
  });
  it('ignores a one-letter query and caps the answer', () => {
    expect(rank(ENTRIES, 'c', 'en')).toEqual([]);
    const many = Array.from({ length: 60 }, (_, i) => e('topic', `Cell ${i}`, `कोशिका ${i}`));
    expect(rank(many, 'cell', 'en')).toHaveLength(MAX_HITS);
  });
  it('scores an exact title higher and strips Latin accents only', () => {
    expect(scoreTitles('science', ['Science'])).toBeGreaterThan(scoreTitles('science', ['Science and society']));
    expect(normalize('Café')).toBe('cafe');
    expect(normalize('गणित')).toBe('गणित');
  });
});

describe('quizzes waiting per subject', () => {
  it('counts quizzes never taken or due for review, not scored ones', () => {
    expect(waitingBySubject([{ subject: 'science', state: 'ready' }, { subject: 'science', state: 'review' }, { subject: 'science', state: 'scored' }, { subject: 'mathematics', state: 'scored' }])).toEqual({ science: 2 });
    expect(waitingBySubject([])).toEqual({});
  });
});

describe('book topics file', () => {
  it('matches the reader content (run node scripts/gen_book_topics.mjs when it changes)', () => {
    const root = new URL('../../reader/content/', import.meta.url);
    const index = JSON.parse(readFileSync(new URL('index.json', root), 'utf8')) as { chapters: { key: string; file?: string | null }[] };
    for (const c of index.chapters.filter((x) => x.file)) {
      const ch = JSON.parse(readFileSync(new URL(c.file!, root), 'utf8')) as { topics: { id: string; title: { en: string; hi: string } }[] };
      expect((bookTopics as Record<string, { id: string; en: string; hi: string }[]>)[c.key]).toEqual(ch.topics.map((t) => ({ id: t.id, en: t.title.en, hi: t.title.hi })));
    }
  });
});
