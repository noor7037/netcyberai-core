import { t, type Lang, type MessageKey } from '@/lib/i18n';
import { indiaDate } from '@/lib/time/india';
import { BOOKS, bookHref } from './books';
import { academicYearOf, classSubjects } from './catalog';
import { syllabusBoardOf, type FamilyChild } from './children';
import { openSubjects } from './learning';
import { subjectAccess } from './modules';

// The universal search in Study (W22-S1): the child types a subject, a chapter or a topic, in English or Hindi, and finds
// it across every subject of their board and class that is open to them: the subjects, the chapters and topics of the
// catalog released to everyone (content.*), and the book's chapters and topics (the reader's, books.ts). Matching is on
// the server, case-insensitive, whole words each, with a word's beginning and a small typo allowed. Only the child's own
// board and class are read; nothing the child types is stored or sent anywhere.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type SearchKind = 'subject' | 'book_chapter' | 'chapter' | 'book_topic' | 'topic';
export type SearchHit = { kind: SearchKind; subject: string; title: string; context: string | null; href: string };
export type SearchEntry = { kind: SearchKind; subject: string; titles: readonly string[]; context: { en: string; hi: string } | null; title: { en: string; hi: string }; href: string };

export const MIN_QUERY = 2;
export const MAX_QUERY = 60;
export const MAX_HITS = 24;
const KIND_ORDER: Record<SearchKind, number> = { subject: 0, book_chapter: 1, chapter: 2, book_topic: 3, topic: 4 };

// Lower case, accents off for Latin letters (Devanagari marks stay: they are part of the letters).
export const normalize = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
const words = (s: string): string[] => normalize(s).split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);

function distance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

// How well one typed word fits one word of a title: 4 the same, 3 its beginning, 2 inside it, 1 a small typo, 0 not at all.
function wordScore(q: string, w: string): number {
  if (q === w) return 4;
  if (w.startsWith(q)) return 3;
  if (q.length >= 3 && w.includes(q)) return 2;
  if (q.length >= 4) {
    const cap = q.length >= 8 ? 2 : 1;
    if (distance(q, w, cap) <= cap || distance(q, w.slice(0, q.length), cap) <= cap) return 1;
  }
  return 0;
}

// The score of a title (in any of its languages) for the typed words: every typed word must fit some word of it.
export function scoreTitles(query: string, titles: readonly string[]): number {
  const qw = words(query);
  if (qw.length === 0) return 0;
  const whole = normalize(query).trim();
  let best = 0;
  for (const title of titles) {
    const tw = words(title);
    let sum = 0;
    for (const q of qw) {
      let top = 0;
      for (const w of tw) top = Math.max(top, wordScore(q, w));
      if (top === 0) {
        sum = 0;
        break;
      }
      sum += top;
    }
    if (sum === 0) continue;
    const full = normalize(title).trim();
    best = Math.max(best, sum + (full === whole ? 5 : full.startsWith(whole) ? 3 : 0));
  }
  return best;
}

export function rank(entries: readonly SearchEntry[], query: string, lang: Lang): SearchHit[] {
  const q = query.trim().slice(0, MAX_QUERY);
  if (q.length < MIN_QUERY) return [];
  const l = lang === 'hi' ? 'hi' : 'en';
  return entries
    .map((e) => ({ e, s: scoreTitles(q, e.titles) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || KIND_ORDER[a.e.kind] - KIND_ORDER[b.e.kind])
    .slice(0, MAX_HITS)
    .map(({ e }) => ({ kind: e.kind, subject: e.subject, title: e.title[l] || e.title.en, context: e.context ? e.context[l] || e.context.en : null, href: e.href }));
}

// Words that name a part of Science, for a class whose Science is one subject.
const SUBJECT_ALIASES: Record<string, readonly string[]> = { science: ['physics', 'chemistry', 'biology', 'भौतिकी', 'रसायन', 'जीव विज्ञान'], mathematics: ['maths', 'math'] };

// Everything the child can search: built from the database's catalog and the books, never from what they typed.
export async function searchEntries(db: Db, child: FamilyChild, today = indiaDate()): Promise<SearchEntry[]> {
  const board = syllabusBoardOf(child);
  const [subjects, open] = await Promise.all([classSubjects(db, { board, classLevel: child.classLevel, stream: child.stream, today }), openSubjects(db)]);
  const mine = subjects.filter((s) => subjectAccess(child, s, open).open);
  const entries: SearchEntry[] = [];
  const nameOf = (s: string, l: 'en' | 'hi') => t(l, `fam.subject.${s}` as MessageKey);
  const subjectName = (s: string) => ({ en: nameOf(s, 'en'), hi: nameOf(s, 'hi') });
  for (const s of mine) {
    entries.push({ kind: 'subject', subject: s, titles: [nameOf(s, 'en'), nameOf(s, 'hi'), ...(SUBJECT_ALIASES[s] ?? [])], title: subjectName(s), context: null, href: `/family/study?subject=${encodeURIComponent(s)}` });
  }
  const inBook = new Set<string>();
  for (const book of BOOKS) {
    if (book.classLevel !== child.classLevel || !book.boards.includes(board) || !mine.some((s) => s === book.subject)) continue;
    for (const c of book.chapters) {
      if (c.catalogKey) inBook.add(c.catalogKey);
      entries.push({ kind: 'book_chapter', subject: book.subject, titles: [c.title.en, c.title.hi], title: c.title, context: subjectName(book.subject), href: bookHref(c.key) });
      // The book's topic titles come from its index (reader/scripts/index.mjs, C491).
      for (const tp of c.topicTitles ?? []) {
        entries.push({ kind: 'book_topic', subject: book.subject, titles: [tp.en, tp.hi], title: { en: tp.en, hi: tp.hi || tp.en }, context: c.title, href: bookHref(c.key) });
      }
    }
  }
  if (mine.length === 0) return entries;
  const year = academicYearOf(today);
  const chapters = (
    await db.query(
      `select v.subject, c.chapter_key, c.title_en, c.title_hi
         from content.chapters c join content.syllabus_versions v on v.version_id = c.version_id
        where v.board_id = $1 and v.class_level = $2 and v.subject = any($3::text[]) and v.academic_year = $4 and v.status = 'published' and v.audience = 'everyone'
        order by v.subject, c.position, c.chapter_key`,
      [board, child.classLevel, mine, year]
    )
  ).rows;
  const chapterTitle = new Map<string, { en: string; hi: string }>();
  for (const c of chapters) {
    const key = String(c.chapter_key);
    const subject = String(c.subject);
    const title = { en: String(c.title_en), hi: String(c.title_hi ?? c.title_en) };
    chapterTitle.set(key, title);
    if (inBook.has(key)) continue;
    entries.push({ kind: 'chapter', subject, titles: [title.en, title.hi], title, context: subjectName(subject), href: `/family/study?subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(key)}#ch-${encodeURIComponent(key)}` });
  }
  const topics = (
    await db.query(
      `select v.subject, tp.topic_key, tp.title_en, tp.title_hi, c.chapter_key
         from content.topics tp join content.chapters c on c.chapter_id = tp.chapter_id join content.syllabus_versions v on v.version_id = tp.version_id
        where v.board_id = $1 and v.class_level = $2 and v.subject = any($3::text[]) and v.academic_year = $4 and v.status = 'published' and v.audience = 'everyone'
        order by v.subject, tp.position, tp.topic_key`,
      [board, child.classLevel, mine, year]
    )
  ).rows;
  for (const tp of topics) {
    const title = { en: String(tp.title_en), hi: String(tp.title_hi ?? tp.title_en) };
    entries.push({ kind: 'topic', subject: String(tp.subject), titles: [title.en, title.hi], title, context: chapterTitle.get(String(tp.chapter_key)) ?? null, href: `/family/understand?kind=topic&key=${encodeURIComponent(String(tp.topic_key))}` });
  }
  return entries;
}

export async function searchStudy(db: Db, child: FamilyChild, lang: Lang, query: string): Promise<SearchHit[]> {
  const q = query.trim().slice(0, MAX_QUERY);
  if (q.length < MIN_QUERY) return [];
  return rank(await searchEntries(db, child), q, lang);
}
