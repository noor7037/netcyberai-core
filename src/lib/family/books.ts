import c10Science from '../../../reader/content/index.json';

// The NetCyberAI chapter reader's books in the Family app (founder, 9 Nov 2026). The reader (`reader/`, with its labs
// in `labs/`) teaches one NCERT book chapter by chapter, with diagrams, labs inside the lessons, topic checks and a
// board-pattern test, in English and Hindi. A book reaches the child whose board, class and subject read that book;
// its chapters open inside the Family app at /family/study/book/<key>, which frames the reader served to signed-in
// families only (/family/learn/..., src/app/(family)/family/learn/[...path]/route.ts).
//
// `catalog` names, for each book chapter, the chapter of the board's own syllabus (the catalog Control releases) that
// it teaches, so one row in Study carries both: the reader and the catalog's Explain, topics and offline pack. A book
// chapter with no catalog chapter still shows; a catalog chapter the book does not have shows after the book's.

export type BookChapter = { key: string; number: number; title: { en: string; hi: string }; topics: number; minutes: number; catalogKey: string | null };
export type Book = { id: string; boards: readonly string[]; classLevel: number; subject: string; chapters: readonly BookChapter[] };

type ReaderIndex = { class: number; subject_id: string; chapters: { key: string; number: number; title: { en: string; hi: string }; file?: string | null; topics: number; minutes: number }[] };

// NCERT Science, Class 10 (jesc1), against CBSE's 2026-27 catalog (data/catalog/cbse-2026-27-maths-science.csv).
// Chapters 9 (Light), 10 (The Human Eye) and 11 (Electricity) have no chapter in that catalog yet.
const C10_SCIENCE_CATALOG: Record<number, string> = {
  1: 'cbse.c10.science.u1.ch01',
  2: 'cbse.c10.science.u1.ch03',
  3: 'cbse.c10.science.u1.ch04',
  4: 'cbse.c10.science.u1.ch05',
  5: 'cbse.c10.science.u2.ch01',
  6: 'cbse.c10.science.u2.ch02',
  7: 'cbse.c10.science.u2.ch03',
  8: 'cbse.c10.science.u2.ch04',
  12: 'cbse.c10.science.u4.ch01',
  13: 'cbse.c10.science.u5.ch01',
};

function bookOf(id: string, boards: readonly string[], index: ReaderIndex, catalog: Record<number, string>): Book {
  return {
    id,
    boards,
    classLevel: index.class,
    subject: index.subject_id,
    // Only a chapter the reader has a file for: a planned one is not offered.
    chapters: index.chapters
      .filter((c) => !!c.file)
      .map((c) => ({ key: c.key, number: c.number, title: c.title, topics: c.topics, minutes: c.minutes, catalogKey: catalog[c.number] ?? null })),
  };
}

export const BOOKS: readonly Book[] = [bookOf('ncert.jesc1', ['CBSE'], c10Science as ReaderIndex, C10_SCIENCE_CATALOG)];

// The book this child reads for a subject: their board, class and subject. null: none yet.
export function bookFor(q: { board: string; classLevel: number; subject: string }): Book | null {
  return BOOKS.find((b) => b.classLevel === q.classLevel && b.subject === q.subject && b.boards.includes(q.board)) ?? null;
}

// A chapter of any book, by its reader key.
export function bookChapter(key: string): { book: Book; chapter: BookChapter } | null {
  for (const book of BOOKS) {
    const chapter = book.chapters.find((c) => c.key === key);
    if (chapter) return { book, chapter };
  }
  return null;
}

// Where the reader opens a chapter: its own page under the signed-in route, in the child's language. The reader's
// address after the # is the chapter's file without .json (reader/reader.js, "start").
export function readerSrc(book: Book, chapter: BookChapter, lang: string): string {
  const cls = `c${String(book.classLevel).padStart(2, '0')}`;
  return `/family/learn/reader/index.html?lang=${lang === 'hi' ? 'hi' : 'en'}#${cls}/${book.subject}/${chapter.key}`;
}

export const bookHref = (key: string) => `/family/study/book/${encodeURIComponent(key)}`;
