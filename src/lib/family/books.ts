import registry from '../../../reader/content/books.json';

// The NetCyberAI chapter reader's books in the Family app (founder, 9 Nov 2026). The reader (`reader/`, with its labs
// in `labs/`) teaches one NCERT book chapter by chapter, with diagrams, labs inside the lessons, topic checks and a
// board-pattern test, in English and Hindi. A book reaches the child whose board, class and subject read that book;
// its chapters open inside the Family app at /family/study/book/<key>, which frames the reader served to signed-in
// families only (/family/learn/..., src/app/(family)/family/learn/[...path]/route.ts).
//
// `catalog_key`, set per chapter in the book's book.json, names, for each book chapter, the chapter of the board's own syllabus (the catalog Control releases) that
// it teaches, so one row in Study carries both: the reader and the catalog's Explain, topics and offline pack. A book
// chapter with no catalog chapter still shows; a catalog chapter the book does not have shows after the book's.

export type BookChapter = { key: string; number: number; title: { en: string; hi: string }; topics: number; minutes: number; catalogKey: string | null; topicTitles?: readonly { en: string; hi: string }[] };
export type Book = { id: string; boards: readonly string[]; classLevel: number; subject: string; chapters: readonly BookChapter[] };

// One book's index as reader/scripts/index.mjs writes it (reader/content/<class>/<subject>/index.json), listed in the
// registry reader/content/books.json. Adding a book is adding its files and running that script: nothing here changes.
export type ReaderIndex = {
  id: string;
  class: number;
  subject_id: string;
  boards: string[];
  chapters: { key: string; number: number; title: { en: string; hi: string }; file?: string | null; topics: number; minutes: number; topic_titles?: { en: string; hi: string }[]; catalog_key?: string | null }[];
};

export function booksFromRegistry(registry: { books: readonly ReaderIndex[] }): Book[] {
  return registry.books.map((index) => ({
    id: index.id,
    boards: index.boards,
    classLevel: index.class,
    subject: index.subject_id,
    // Only a chapter the reader has a file for: a planned one is not offered.
    chapters: index.chapters
      .filter((c) => !!c.file)
      .map((c) => ({ key: c.key, number: c.number, title: c.title, topics: c.topics, minutes: c.minutes, catalogKey: c.catalog_key ?? null, topicTitles: c.topic_titles ?? [] })),
  }));
}

export const BOOKS: readonly Book[] = booksFromRegistry(registry as { books: ReaderIndex[] });

// The book this child reads for a subject: their board, class and subject. null: none yet.
export function bookFor(q: { board: string; classLevel: number; subject: string }, books: readonly Book[] = BOOKS): Book | null {
  return books.find((b) => b.classLevel === q.classLevel && b.subject === q.subject && b.boards.includes(q.board)) ?? null;
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
