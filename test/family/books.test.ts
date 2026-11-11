import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { BOOKS, bookChapter, bookFor, bookHref, booksFromRegistry, readerSrc, type ReaderIndex } from '@/lib/family/books';
import { allowedLearnFile } from '@/lib/family/learn-files';
import { readCatalogCsv } from '@/lib/content/catalog-csv';

const ROOT = path.resolve(__dirname, '../..');

describe('the child’s book in Study (founder, 9 Nov 2026)', () => {
  it('a CBSE Class 10 child reads all 13 chapters of NCERT Science, in the book’s order', () => {
    const book = bookFor({ board: 'CBSE', classLevel: 10, subject: 'science' });
    expect(book?.id).toBe('ncert.jesc1');
    expect(book!.chapters.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    for (const c of book!.chapters) {
      expect(c.title.en.length, c.key).toBeGreaterThan(3);
      expect(c.title.hi, c.key).toMatch(/[ऀ-ॿ]/);
    }
  });

  it('no other board, class or subject gets it', () => {
    expect(bookFor({ board: 'CISCE', classLevel: 10, subject: 'science' })).toBeNull();
    expect(bookFor({ board: 'CBSE', classLevel: 9, subject: 'science' })).toBeNull();
    expect(bookFor({ board: 'CISCE', classLevel: 10, subject: 'mathematics' })).toBeNull();
  });

  it('a CBSE Class 10 child gets NCERT Mathematics with the chapters that are written, each on its CBSE catalog chapter', () => {
    const book = bookFor({ board: 'CBSE', classLevel: 10, subject: 'mathematics' });
    expect(book?.id).toBe('ncert.jemh1');
    expect(book!.chapters.map((c) => c.number)).toContain(4);
    expect(book!.chapters.find((c) => c.number === 4)?.catalogKey).toBe('cbse.c10.mathematics.u2.ch03');
    const text = readFileSync(path.join(ROOT, 'data/catalog/cbse-2026-27-maths-science.csv'), 'utf8');
    const chapters = new Map(readCatalogCsv(text, '2026-11-11').lines.filter((l) => l.board === 'CBSE' && l.classLevel === 10 && l.subject === 'mathematics' && l.level === 'chapter').map((l) => [l.key, l.titleEn]));
    const word = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '').slice(0, 7);
    for (const c of book!.chapters) {
      expect(chapters.has(c.catalogKey!), c.key).toBe(true);
      expect(word(chapters.get(c.catalogKey!)!), c.key).toBe(word(c.title.en));
    }
  });

  it('every chapter opens a reader file that exists, in the child’s language', () => {
    for (const book of BOOKS) {
      for (const c of book.chapters) {
        const src = readerSrc(book, c, 'hi');
        expect(src.startsWith('/family/learn/reader/index.html?lang=hi#')).toBe(true);
        const file = src.split('#')[1];
        expect(existsSync(path.join(ROOT, 'reader/content', `${file}.json`)), file).toBe(true);
        expect(bookChapter(c.key)?.chapter.key).toBe(c.key);
        expect(bookHref(c.key)).toBe(`/family/study/book/${c.key}`);
      }
    }
    expect(readerSrc(BOOKS[0], BOOKS[0].chapters[0], 'xx')).toContain('?lang=en#');
    expect(bookChapter('u.c10.science.jesc1.ch99')).toBeNull();
  });

  it('each book chapter names a chapter of CBSE’s own Class 10 Science catalog, once, and the title matches', () => {
    const text = readFileSync(path.join(ROOT, 'data/catalog/cbse-2026-27-maths-science.csv'), 'utf8');
    const chapters = new Map(
      readCatalogCsv(text, '2026-11-09')
        .lines.filter((l) => l.board === 'CBSE' && l.classLevel === 10 && l.subject === 'science' && l.level === 'chapter')
        .map((l) => [l.key, l.titleEn])
    );
    const book = bookFor({ board: 'CBSE', classLevel: 10, subject: 'science' })!;
    const named = book.chapters.map((c) => c.catalogKey).filter((k): k is string => k !== null);
    expect(new Set(named).size).toBe(named.length);
    const word = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '').slice(0, 7);
    for (const c of book.chapters) {
      if (!c.catalogKey) continue;
      expect(chapters.has(c.catalogKey), c.catalogKey).toBe(true);
      // The same chapter: its title starts with the same word (Control and co-ordination / Control and Coordination).
      expect(word(chapters.get(c.catalogKey)!), c.key).toBe(word(c.title.en.replace(/^How do Organisms /, '')));
    }
    // Light, the Human Eye and Electricity have no chapter in that catalog yet.
    expect(book.chapters.filter((c) => !c.catalogKey).map((c) => c.number)).toEqual([9, 10, 11]);
  });
});

describe('how a book reaches the app: the generated registry (W22-S4)', () => {
  const content = path.join(ROOT, 'reader/content');
  const folders = readdirSync(content, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^c\d\d$/.test(e.name))
    .flatMap((c) => readdirSync(path.join(content, c.name), { withFileTypes: true }).filter((s) => s.isDirectory() && existsSync(path.join(content, c.name, s.name, 'book.json'))).map((s) => ({ cls: +c.name.slice(1), subject: s.name })));

  it('lists every book folder, each with its boards and its catalog chapter carried over from book.json', () => {
    expect(folders.length).toBeGreaterThan(0);
    expect(BOOKS.map((b) => `${b.classLevel}/${b.subject}`).sort()).toEqual(folders.map((f) => `${f.cls}/${f.subject}`).sort());
    for (const b of BOOKS) expect(b.boards.length, b.id).toBeGreaterThan(0);
    const sci = bookFor({ board: 'CBSE', classLevel: 10, subject: 'science' })!;
    expect(sci.chapters.find((c) => c.number === 2)?.catalogKey).toBe('cbse.c10.science.u1.ch03');
    expect(sci.chapters.every((c) => c.topicTitles!.length === c.topics)).toBe(true);
  });

  it('a second book in a registry resolves for its own class and board, and the first still resolves', () => {
    const t = (en: string) => ({ en, hi: 'हिं' });
    const fake: ReaderIndex = {
      id: 'ncert.jemh1', class: 7, subject_id: 'mathematics', boards: ['CBSE', 'CISCE'],
      chapters: [
        { key: 'u.c07.mathematics.jemh1.ch01', number: 1, title: t('Integers'), file: 'c07/mathematics/u.c07.mathematics.jemh1.ch01.json', topics: 2, minutes: 30, topic_titles: [t('A'), t('B')], catalog_key: 'cbse.c7.mathematics.u1.ch01' },
        { key: 'u.c07.mathematics.jemh1.ch02', number: 2, title: t('Fractions'), file: null, topics: 0, minutes: 0 },
      ],
    };
    const books = booksFromRegistry({ books: [...(JSON.parse(readFileSync(path.join(ROOT, 'reader/content/books.json'), 'utf8')).books as ReaderIndex[]), fake] });
    const hit = bookFor({ board: 'CISCE', classLevel: 7, subject: 'mathematics' }, books);
    expect(hit?.id).toBe('ncert.jemh1');
    // A planned chapter (no reader file) is not offered; the catalog key and topic titles come through.
    expect(hit!.chapters.map((c) => c.number)).toEqual([1]);
    expect(hit!.chapters[0].catalogKey).toBe('cbse.c7.mathematics.u1.ch01');
    expect(hit!.chapters[0].topicTitles).toHaveLength(2);
    expect(bookFor({ board: 'CBSE', classLevel: 10, subject: 'science' }, books)?.id).toBe('ncert.jesc1');
    expect(bookFor({ board: 'ICSE', classLevel: 7, subject: 'mathematics' }, books)).toBeNull();
  });

  it('no book for a class without one', () => {
    // Whichever classes the content team has not reached yet (this stays true as books are added), and a class no book can have.
    for (const cls of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((c) => !folders.some((f) => f.cls === c))) expect(bookFor({ board: 'CBSE', classLevel: cls, subject: 'science' }), `class ${cls}`).toBeNull();
    expect(bookFor({ board: 'CBSE', classLevel: 99, subject: 'science' })).toBeNull();
    expect(booksFromRegistry({ books: [] })).toEqual([]);
  });
});

describe('the reader’s files served under /family/learn/', () => {
  it('serves the pages, scripts, chapter and lab data, and the images', () => {
    for (const p of ['reader/index.html', 'reader/reader.js', 'reader/reader.css', 'reader/content/books.json', 'reader/content/c10/science/index.json', 'reader/content/c10/science/u.c10.science.jesc1.ch01.json', 'labs/index.html', 'labs/engine.js', 'labs/lib.js', 'labs/styles.css', 'labs/index.json', 'labs/templates/beaker.js', 'labs/defs/c10/science/u.c10.science.jesc1.ch01.json', 'labs/assets/manifest.json']) {
      expect(allowedLearnFile(p.split('/')), p).toBe(p);
    }
    expect(allowedLearnFile(['labs', 'assets', 'c10', 'science', 'C10-SCI-CH01-01_hook-of-the-chapter.640.webp'])).not.toBeNull();
  });

  it('never the scripts, the contracts, the smoke page, a hidden file or a path out of the folders', () => {
    for (const p of [['reader', 'scripts', 'check.mjs'], ['labs', 'scripts', 'check.mjs'], ['reader', 'CONTRACT.md'], ['labs', 'CONTRACT.md'], ['labs', 'smoke.html'], ['reader', '.gitignore'], ['reader', '..', 'package.json'], ['..', 'package.json'], ['package.json'], ['src', 'middleware.ts'], ['.env'], ['reader', 'content', '..', '..', '.env.json'], []]) {
      expect(allowedLearnFile(p), p.join('/')).toBeNull();
    }
  });
});

describe('the reader\'s files are never served stale (W24)', () => {
  it('pages, scripts, styles and data are checked on every load; pictures keep a week', async () => {
    const { learnCacheControl, sameTag } = await import('@/lib/family/learn-files');
    for (const p of ['reader/reader.js', 'reader/index.html', 'reader/reader.css', 'reader/content/c10/science/index.json', 'labs/engine.js', 'labs/templates/beaker.js', 'labs/defs/c10/science/x.json']) expect(learnCacheControl(p), p).toBe('private, no-cache');
    expect(learnCacheControl('labs/assets/c10/science/a.640.webp')).toBe('private, max-age=604800');
    expect(sameTag('"abc"', '"abc"')).toBe(true);
    expect(sameTag('W/"abc", "x"', '"abc"')).toBe(true);
    expect(sameTag('"x"', '"abc"')).toBe(false);
    expect(sameTag(null, '"abc"')).toBe(false);
  });
});
