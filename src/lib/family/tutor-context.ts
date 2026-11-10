import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { bookChapter, bookFor, type Book, type BookChapter } from './books';
import { syllabusBoardOf } from './children';
import { isSubject } from './subjects';

// Where the Family tutor was opened, checked and turned into what the tutor is told (W23-C). The phone sends only
// `{ kind, key, topicId?, labId? }`; this file decides, on the server, whether the child may open that place (their own
// board, class and subject: the book's chapter via books.ts, the catalog for a topic) and then reads the content itself:
// the chapter reader's JSON (reader/content/...) and the lab definitions (labs/...). Nothing the phone says as text is
// ever put in the prompt. Also here: the short list of ready-built labs the tutor may show (a `lab` block, prompt v13).

export const WHERE_KINDS = ['book_topic', 'book_chapter', 'lab', 'study_subject', 'topic'] as const;
export type WhereKind = (typeof WHERE_KINDS)[number];
// `key`: the book chapter's key (book_topic, book_chapter, lab), the subject (study_subject) or the catalog topic key (topic).
export type TutorWhere = { kind: WhereKind; key: string; topicId?: string; labId?: string };

const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const TOPIC_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const LAB_ID = /^[a-z0-9][a-z0-9._-]{2,119}$/;

// The shape only; whether the child may open it is buildScope's to decide. null: not a place.
export function parseWhere(v: unknown): TutorWhere | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!(WHERE_KINDS as readonly unknown[]).includes(o.kind) || typeof o.key !== 'string' || !KEY.test(o.key)) return null;
  if (o.topicId !== undefined && (typeof o.topicId !== 'string' || !TOPIC_ID.test(o.topicId))) return null;
  if (o.labId !== undefined && (typeof o.labId !== 'string' || !LAB_ID.test(o.labId))) return null;
  const kind = o.kind as WhereKind;
  if (kind === 'lab' && o.labId === undefined) return null;
  return { kind, key: o.key, ...(o.topicId !== undefined ? { topicId: o.topicId as string } : {}), ...(o.labId !== undefined ? { labId: o.labId as string } : {}) };
}

// The chapter whose chat the place belongs to (the scoped feed and the scoped chat), or null when it is not a chapter's.
export const scopeKeyOf = (w: Pick<TutorWhere, 'kind' | 'key'>): string | null => (w.kind === 'book_topic' || w.kind === 'book_chapter' || w.kind === 'lab' ? w.key : null);

// A chapter of the book this child reads (their board, class and subject), by its key; false for anything else.
export function ownsBookChapter(child: { board: string; stateCode: string; classLevel: number }, key: string): boolean {
  const found = bookChapter(key);
  if (!found) return false;
  const mine = bookFor({ board: syllabusBoardOf(child), classLevel: child.classLevel, subject: found.book.subject });
  return !!mine && mine.id === found.book.id;
}

export type LabOffer = { id: string; title: string; aim: string };
export type TutorScope = {
  // "Chapter / topic": the short line the planner and the library search read.
  about: string;
  // What the tutor is told: our own content, trimmed to a budget.
  text: string;
  labs: LabOffer[];
  // What a kept question is filed under: the book chapter and, for a topic, its id.
  chapterKey: string | null;
  blockId: string | null;
};

type T = { en?: unknown; hi?: unknown } | string | null | undefined;
type Lang = 'en' | 'hi';
const BOOK_TOPIC_CHARS = 3400;
const BOOK_CHAPTER_CHARS = 1800;
const LAB_CHARS = 2200;
export const LABS_OFFERED = 12;

// ---- files -----------------------------------------------------------------------------------------------------------

export type Files = { read: (rel: string) => Promise<string | null> };
const ROOT = process.cwd();
export const diskFiles: Files = {
  read: async (rel) => {
    try {
      return await readFile(path.join(ROOT, rel), 'utf8');
    } catch {
      return null;
    }
  },
};

type IndexLab = { id: string; title: T; class: number; subject_id: string; chapter_key: string; chapter_title: string; topic?: string; topic_title?: string; file: string };
let indexCache: Promise<IndexLab[]> | null = null;
export function resetLabIndex(): void {
  indexCache = null;
}
async function labIndex(files: Files): Promise<IndexLab[]> {
  indexCache ??= (async () => {
    const raw = await files.read('labs/index.json');
    if (!raw) return [];
    try {
      const j = JSON.parse(raw) as { labs?: unknown };
      return Array.isArray(j.labs) ? (j.labs as IndexLab[]).filter((l) => l && typeof l.id === 'string' && LAB_ID.test(l.id)) : [];
    } catch {
      return [];
    }
  })();
  const got = await indexCache;
  if (got.length === 0) indexCache = null;
  return got;
}

async function jsonOf(files: Files, rel: string): Promise<Record<string, unknown> | null> {
  const raw = await files.read(rel);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const classDir = (book: Book) => `c${String(book.classLevel).padStart(2, '0')}`;
const chapterFile = (book: Book, chapter: BookChapter) => `reader/content/${classDir(book)}/${book.subject}/${chapter.key}.json`;

// ---- text helpers ----------------------------------------------------------------------------------------------------

const squash = (s: string) => s.replace(/\{\{eq:([^}]*)\}\}/g, (_m, eq: string) => eq).replace(/\s+/g, ' ').trim();
function tx(v: T, lang: Lang): string {
  if (typeof v === 'string') return squash(v);
  if (!v || typeof v !== 'object') return '';
  const pick = lang === 'hi' && typeof v.hi === 'string' && v.hi.trim() ? v.hi : v.en;
  return typeof pick === 'string' ? squash(pick) : '';
}
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
// Sections in priority order, each clipped to what is left of the budget; an empty section is left out.
function within(parts: string[], budget: number): string {
  const out: string[] = [];
  let left = budget;
  for (const p of parts) {
    if (!p || left < 40) continue;
    const c = clip(p, left);
    out.push(c);
    left -= c.length + 1;
  }
  return out.join('\n');
}

// ---- the book: a topic, a chapter, a lab ------------------------------------------------------------------------------

function topicText(topic: Record<string, unknown>, lang: Lang): string {
  const steps = list(topic.steps).map(obj);
  const terms = list(topic.terms)
    .map(obj)
    .map((t) => {
      const name = typeof t.en === 'string' ? t.en : '';
      const hi = lang === 'hi' && typeof t.hi === 'string' ? ` (${t.hi})` : '';
      const gloss = tx(t.gloss as T, lang);
      return name ? `${name}${hi}${gloss ? `: ${gloss}` : ''}` : '';
    })
    .filter(Boolean)
    .slice(0, 10);
  const points = steps.filter((s) => s.type === 'keypoints').flatMap((s) => list(s.points).map((p) => tx(p as T, lang))).filter(Boolean);
  const explain = steps
    .filter((s) => s.type === 'explain')
    .map((s) => squash([tx(s.title as T, lang), tx(s.plain as T, lang), ...list(s.body).map((b) => tx(b as T, lang))].filter(Boolean).join('. ')))
    .filter(Boolean);
  const wrong = steps
    .filter((s) => s.type === 'misconception')
    .map((s) => `Often wrong: ${tx(s.wrong as T, lang)} Right: ${tx(s.right as T, lang)}`)
    .filter((s) => s.length > 30);
  return within(
    [
      terms.length ? `Key terms: ${terms.join('; ')}` : '',
      points.length ? `Key points: ${points.join(' | ')}` : '',
      explain.length ? `The lesson says: ${explain.join(' / ')}` : '',
      wrong.length ? wrong.join(' / ') : '',
    ],
    BOOK_TOPIC_CHARS
  );
}

function chapterText(ch: Record<string, unknown>, lang: Lang): string {
  const outcomes = list(ch.outcomes).map((o) => tx(o as T, lang)).filter(Boolean);
  const topics = list(ch.topics)
    .map(obj)
    .map((t) => tx(t.title as T, lang))
    .filter(Boolean);
  return within([tx(ch.big_idea as T, lang) ? `Big idea: ${tx(ch.big_idea as T, lang)}` : '', outcomes.length ? `The child can learn to: ${outcomes.join(' | ')}` : '', topics.length ? `Topics in order: ${topics.join(' | ')}` : ''], BOOK_CHAPTER_CHARS);
}

// A lab's steps as the child is told them: what to do and watch, what it shows, the questions it asks.
function labText(lab: Record<string, unknown>, lang: Lang): string {
  const say = (s: Record<string, unknown>) => tx(s.say as T, lang);
  const steps = list(lab.steps).map(obj);
  const doing = steps.filter((s) => s.kind === 'do' || s.kind === 'predict').map(say).filter(Boolean);
  const shows = steps.filter((s) => s.kind === 'explain').map(say).filter(Boolean);
  const asks = steps
    .filter((s) => s.kind === 'check')
    .flatMap((s) => list(s.items).map((i) => tx(obj(i).q as T, lang)))
    .filter(Boolean);
  return within([doing.length ? `The lab's steps: ${doing.map((d, i) => `${i + 1}. ${d}`).join(' ')}` : '', shows.length ? `What it shows: ${shows.join(' ')}` : '', asks.length ? `It asks: ${asks.join(' | ')}` : ''], LAB_CHARS);
}

async function labDef(files: Files, entry: IndexLab): Promise<Record<string, unknown> | null> {
  const file = jsonFileOf(entry.file);
  if (!file) return null;
  const def = await jsonOf(files, `labs/${file}`);
  return list(def?.labs).map(obj).find((l) => l.id === entry.id) ?? null;
}
const jsonFileOf = (f: unknown): string | null => (typeof f === 'string' && /^defs\/[a-z0-9_./-]+\.json$/.test(f) && !f.includes('..') ? f : null);

// ---- the labs on offer -------------------------------------------------------------------------------------------------

const STOP = new Set(['work', 'works', 'working', 'happen', 'happens', 'make', 'makes', 'made', 'mean', 'means', 'thing', 'things', 'give', 'gives', 'does', 'what', 'which', 'with', 'that', 'this', 'from', 'about', 'does', 'have', 'into', 'your', 'when', 'where', 'there', 'their', 'class', 'lab', 'show', 'explain', 'tell', 'the', 'and', 'why', 'how']);
const words = (s: string): string[] => (s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w));

// A lab word and a word of the question are the same word, or one holds the other (magnet, electromagnet, magnetic).
const near = (w: string, ask: ReadonlySet<string>): boolean => ask.has(w) || (w.length >= 5 && [...ask].some((q) => q.length >= 5 && (q.includes(w) || w.includes(q))));

// The chapter's labs first (the topic's own lab first of those), then the labs of the child's class and subject whose
// titles share words with what the child is asking about; at most LABS_OFFERED. A lab the question has nothing to do
// with is not offered: no match, no list.
export async function labsFor(files: Files, q: { classLevel: number; subject: string; lang: Lang; chapterKey: string | null; topicLabs?: readonly string[]; about: string; question: string }): Promise<LabOffer[]> {
  const all = (await labIndex(files)).filter((l) => l.class === q.classLevel && l.subject_id === q.subject);
  const title = (l: IndexLab) => tx(l.title, q.lang) || tx(l.title, 'en');
  const offer = (l: IndexLab): LabOffer => ({ id: l.id, title: clip(title(l), 80), aim: clip(squash(l.topic_title ?? l.chapter_title ?? ''), 100) });
  const mine = q.chapterKey ? all.filter((l) => l.chapter_key === q.chapterKey) : [];
  const first = new Set(q.topicLabs ?? []);
  const chapter = [...mine.filter((l) => first.has(l.id)), ...mine.filter((l) => !first.has(l.id))];
  const have = new Set(chapter.map((l) => l.id));
  const ask = new Set(words(`${q.question} ${q.about}`));
  const rest = all
    .filter((l) => !have.has(l.id))
    .map((l) => ({ l, score: [...new Set(words(`${tx(l.title, 'en')} ${l.topic_title ?? ''} ${l.chapter_title ?? ''}`))].filter((w) => near(w, ask)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return [...chapter, ...rest.map((x) => x.l)].slice(0, LABS_OFFERED).map(offer);
}

// ---- the scope ---------------------------------------------------------------------------------------------------------

export type ScopeChild = { board: string; classLevel: number; language: string };
export type ScopeDeps = {
  files?: Files;
  // The catalog's line for a topic key, for this child's board and class (resolver.ts syllabusLine); null: not theirs.
  topicLine?: (key: string) => Promise<{ subject: string; chapterEn: string; topicEn: string | null } | null>;
  books?: { chapter: typeof bookChapter; forChild: typeof bookFor };
};

// What the tutor is told about where the child opened it, or null when the child may not open that place (another
// board's, class's or subject's chapter, a topic or lab that is not there, a place that is not in the window's subject).
export async function buildScope(where: TutorWhere, child: ScopeChild & { boardId: string }, windowSubject: string, question: string, deps: ScopeDeps = {}): Promise<TutorScope | null> {
  const files = deps.files ?? diskFiles;
  const lang: Lang = child.language === 'hi' ? 'hi' : 'en';
  const subject = windowSubject;
  if (!isSubject(subject)) return null;

  if (where.kind === 'study_subject') {
    if (where.key !== subject) return null;
    const about = `${subject} (Class ${child.classLevel})`;
    return { about, text: `The child opened the tutor from the Study page of ${subject.replace(/_/g, ' ')}, Class ${child.classLevel}.`, labs: await labsFor(files, { classLevel: child.classLevel, subject, lang, chapterKey: null, about, question }), chapterKey: null, blockId: null };
  }

  if (where.kind === 'topic') {
    const line = await deps.topicLine?.(where.key);
    if (!line || line.subject !== subject) return null;
    const about = line.topicEn ? `${line.chapterEn} / ${line.topicEn}` : line.chapterEn;
    return {
      about: clip(about, 120),
      text: `The child opened the tutor from the topic "${line.topicEn ?? line.chapterEn}" of the chapter "${line.chapterEn}" (${subject.replace(/_/g, ' ')}, Class ${child.classLevel}).`,
      labs: await labsFor(files, { classLevel: child.classLevel, subject, lang, chapterKey: null, about, question }),
      chapterKey: null,
      blockId: null,
    };
  }

  // The book kinds: the chapter must be in the book this child's board, class and subject read.
  const found = (deps.books?.chapter ?? bookChapter)(where.key);
  if (!found || found.book.subject !== subject) return null;
  const mine = (deps.books?.forChild ?? bookFor)({ board: child.boardId, classLevel: child.classLevel, subject: found.book.subject });
  if (!mine || mine.id !== found.book.id) return null;
  const ch = await jsonOf(files, chapterFile(found.book, found.chapter));
  if (!ch) return null;
  const chapterTitle = tx(ch.title as T, 'en') || found.chapter.title.en;
  const topics = list(ch.topics).map(obj);
  const topic = where.topicId ? topics.find((t) => t.id === where.topicId) : undefined;
  if (where.topicId && !topic) return null;
  const topicTitle = topic ? tx(topic.title as T, 'en') : '';
  const about = clip(topicTitle ? `${chapterTitle} / ${topicTitle}` : chapterTitle, 120);
  const head = `Class ${found.book.classLevel} ${found.book.subject.replace(/_/g, ' ')}, chapter "${tx(ch.title as T, lang) || chapterTitle}"${topic ? `, topic "${tx(topic.title as T, lang) || topicTitle}"` : ''}.`;
  const topicLabs = list(topic?.steps)
    .map(obj)
    .filter((s) => s.type === 'lab' && typeof s.lab === 'string')
    .map((s) => s.lab as string);
  const labs = await labsFor(files, { classLevel: found.book.classLevel, subject, lang, chapterKey: found.chapter.key, topicLabs, about, question });

  if (where.kind === 'lab') {
    const entry = (await labIndex(files)).find((l) => l.id === where.labId && l.chapter_key === found.chapter.key && l.class === found.book.classLevel && l.subject_id === subject);
    if (!entry) return null;
    const def = await labDef(files, entry);
    if (!def) return null;
    const first: LabOffer = { id: entry.id, title: clip(tx(entry.title, lang) || tx(entry.title, 'en'), 80), aim: clip(squash(entry.topic_title ?? entry.chapter_title ?? ''), 100) };
    const text = within([`The child opened the tutor from a lab: "${first.title}" (${head.slice(0, -1)}). Its aim: ${first.aim}.`, labText(def, lang), topic ? topicText(topic, lang) : ''], LAB_CHARS + 1200);
    return { about: clip(`${about} / ${first.title}`, 120), text, labs: [first, ...labs.filter((l) => l.id !== first.id)].slice(0, LABS_OFFERED), chapterKey: found.chapter.key, blockId: where.topicId ?? null };
  }

  if (where.kind === 'book_topic') {
    if (!topic) return null;
    return { about, text: within([head, topicText(topic, lang)], BOOK_TOPIC_CHARS + 200), labs, chapterKey: found.chapter.key, blockId: where.topicId ?? null };
  }
  return { about, text: within([head, chapterText(ch, lang)], BOOK_CHAPTER_CHARS + 200), labs, chapterKey: found.chapter.key, blockId: null };
}
