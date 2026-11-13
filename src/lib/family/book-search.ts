import { BOOKS, bookFor, type Book } from './books';
import { diskFiles, type Files } from './tutor-context';
import type { Passage } from '@/lib/ai/teaching/retrieve';

// The child's own book, searched for a typed question (C505). When the tutor is opened from a chapter, tutor-context.ts
// gives it that chapter; a question typed with no chapter open was searched only in the library table
// (content.chapter_contents, retrieve.ts), which may hold nothing, so the answer was never from the book. This searches
// the published topics of the books the child reads (reader/content/<cNN>/<subject>/search.json, written by
// reader/scripts/index.mjs; a draft chapter is not in it) and returns the topics that answer the question, best first.
//
// Keyword scoring, BM25 over each topic's title, terms and text in both languages: English words lowercased and
// stemmed, Hindi in Devanagari as whole words, and Hindi typed in Roman letters (Hinglish, "prakash ka paravartan")
// matched by its consonant skeleton against the Hindi words, and through the topic's own terms to their English. Below
// a minimum, nothing is returned: no passage is better than a wrong one. The search itself is pure and synchronous over
// the loaded files.

export type SearchTopic = {
  chapter_key: string;
  chapter: number;
  chapter_title: { en: string; hi: string };
  topic: string;
  title: { en: string; hi: string };
  terms: { en: string; hi: string }[];
  text: { en: string; hi: string };
};
export type SearchIndex = { id: string; class: number; subject_id: string; boards: string[]; topics: SearchTopic[] };

export type BookSearchAsk = {
  question: string;
  classLevel: number;
  board: string;
  // null: every book of the class.
  subject: string | null;
  lang: 'en' | 'hi';
};
export type BookHit = { bookId: string; subject: string; topic: SearchTopic; score: number; text: string };

export const BOOK_HITS_MAX = 3;
// The weakest answer still given: a topic must score at least this, and the words it matches must carry at least
// MIN_COVERAGE of the question's weight (rare words weigh more). Set from the tests' real questions.
export const MIN_SCORE = 4;
export const MIN_COVERAGE = 0.5;
// Extra hits only when they are near the best one.
const NEAR_BEST = 0.5;
const PASSAGE_MAX = 700;
const QUESTION_MAX = 500;

// ---- words -----------------------------------------------------------------------------------------------------------

const STOP_EN = new Set(
  'a an the is are was were be been am of to in on at by for from with and or not no it its this that these those what which who whom whose why how when where do does did can could will would should shall may might must i me my we our you your he she they them his her their there here than then so if as about into over under also just very more most some any all each please tell explain define describe meaning mean means give example examples answer question short long note notes write state name list happens happen'.split(' ')
);
const STOP_HI = new Set(
  'क्या है हैं का की के को से में और यह वह ये वे एक तो भी पर कैसे क्यों होता होती होते हो था थी थे ने लिए कि बताओ बताइए बताएं समझाओ समझाइए मतलब किसे कहते कहाँ कहां कौन जब तक इस उस या नहीं जाता जाती जाते करता करते करती अर्थ उदाहरण'.split(' ')
);
const STOP_ROMAN = new Set(
  'kya hai hain ka ki ke ko se me mein main aur ye yeh wo woh vo ek to bhi par kaise kese kyu kyun kyon kyo hota hoti hote ho tha thi the ne liye batao bataiye bataye samjhao samjhaiye samjha matlab kise kahte kehte kahan kaha kaun jab tak is us nahi nahin jata jati jate karta karte karti hindi mujhe hum tum aap arth udaharan'.split(' ')
);

const isDeva = (w: string) => /[ऀ-ॿ]/.test(w);

// A small English stemmer: plurals, -ing, -ed, -ion, -ly and a final e, then a doubled last letter as one.
export function stem(w: string): string {
  let s = w;
  if (s.length <= 3) return s;
  if (s.endsWith('ies') && s.length > 4) s = `${s.slice(0, -3)}y`;
  else if (s.endsWith('sses')) s = s.slice(0, -2);
  else if (/(x|ch|sh|z|ns)es$/.test(s)) s = s.slice(0, -2);
  else if (s.endsWith('s') && !/(ss|us|is|ns)$/.test(s)) s = s.slice(0, -1);
  if (s.endsWith('ing') && s.length > 5) s = s.slice(0, -3);
  else if (s.endsWith('ed') && s.length > 4) s = s.slice(0, -2);
  if (s.endsWith('ions') && s.length > 6) s = s.slice(0, -4);
  else if (s.endsWith('ion') && s.length > 5) s = s.slice(0, -3);
  if (s.endsWith('ly') && s.length > 5) s = s.slice(0, -2);
  if (s.endsWith('e') && s.length > 4) s = s.slice(0, -1);
  if (s.length > 3 && s[s.length - 1] === s[s.length - 2]) s = s.slice(0, -1);
  return s;
}

const CONSONANT: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n', ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n',
  त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n', प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', ळ: 'l', व: 'v',
  श: 'sh', ष: 'sh', स: 's', ह: 'h',
};
const VOWEL: Record<string, string> = {
  अ: 'a', आ: 'aa', इ: 'i', ई: 'ii', उ: 'u', ऊ: 'uu', ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ऑ: 'o',
  'ा': 'aa', 'ि': 'i', 'ी': 'ii', 'ु': 'u', 'ू': 'uu', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e',
  'ं': 'n', 'ँ': 'n', 'ः': 'h',
};
// A Devanagari word in Roman letters, roughly: each consonant with its own "a" unless a vowel sign or the virama follows.
function romanOf(word: string): string {
  let out = '';
  for (const c of word) {
    if (c === '\u094d') {
      if (out.endsWith('a')) out = out.slice(0, -1);
    } else if (CONSONANT[c]) out += `${CONSONANT[c]}a`;
    else if (VOWEL[c]) {
      if (/[\u093e-\u094c]/.test(c) && out.endsWith('a')) out = out.slice(0, -1);
      out += VOWEL[c];
    }
  }
  return out;
}
// The consonants of a word, the way Hindi is typed in Roman letters (C505): the vowels and the h of an aspirate (kh, dh,
// sh) dropped, w as v, z as j, f as p, c as k unless it is the ch of च, a doubled letter as one. "prakash" and "प्रकाश"
// are both "prks"; "paravartan" and "परावर्तन" both "prvrtn"; "pachan" (पाचन) is "pcn", "pahchan" (पहचान) "phcn".
// Only a skeleton of three letters or more is matched.
export function skeleton(word: string): string {
  return (isDeva(word) ? romanOf(word) : word.toLowerCase())
    .replace(/[^a-z]/g, '')
    .replace(/ch/g, 'C')
    .replace(/([^aeiou])h/g, (_m, c: string) => c)
    .replace(/c/g, 'k')
    .replace(/C/g, 'c')
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/f/g, 'p')
    .replace(/[aeiou]/g, '')
    .replace(/(.)\1+/g, (_m, c: string) => c);
}
const SK = (s: string) => `~${s}`;

// The words of a text: lowercased, the nukta dropped (ज़ as ज), Roman words and Devanagari words.
export function words(text: string): string[] {
  return (text.toLowerCase().normalize('NFC').replace(/़/g, '').match(/[a-z0-9]+|[ऀ-ॣ०-ॿ]+/g) ?? []).filter((w) => w.length > 1 || /\d/.test(w));
}
// What a topic's text is indexed as: English stems, Devanagari words, and each Devanagari word's skeleton.
function docTokens(text: string): string[] {
  const out: string[] = [];
  for (const w of words(text)) {
    if (isDeva(w)) {
      if (STOP_HI.has(w)) continue;
      out.push(w);
      const s = skeleton(w);
      if (s.length >= 3) out.push(SK(s));
    } else if (!STOP_EN.has(w)) out.push(stem(w));
  }
  return out;
}

// ---- the index -------------------------------------------------------------------------------------------------------

const FIELD_WEIGHT = { title: 3, terms: 2, text: 1 } as const;
type Prepared = {
  // `head`: the tokens of the topic's title, which say what the topic is about.
  docs: { topic: SearchTopic; tf: Map<string, number>; len: number; head: Set<string> }[];
  df: Map<string, number>;
  // A Hindi term's skeleton → the English stems of the same term (the topic's own en↔hi pairs).
  termPairs: Map<string, Set<string>>;
};
const prepared = new WeakMap<SearchIndex, Prepared>();
function prepare(ix: SearchIndex): Prepared {
  const got = prepared.get(ix);
  if (got) return got;
  const df = new Map<string, number>();
  const termPairs = new Map<string, Set<string>>();
  const docs = ix.topics.map((t) => {
    const tf = new Map<string, number>();
    let len = 0;
    const add = (text: string, wgt: number) => {
      for (const tok of docTokens(text)) {
        tf.set(tok, (tf.get(tok) ?? 0) + wgt);
        len += wgt;
      }
    };
    add(`${t.title.en} ${t.title.hi}`, FIELD_WEIGHT.title);
    for (const term of t.terms) {
      add(`${term.en} ${term.hi}`, FIELD_WEIGHT.terms);
      const en = docTokens(term.en).filter((x) => !x.startsWith('~'));
      for (const hw of words(term.hi).filter(isDeva)) {
        const s = skeleton(hw);
        if (s.length < 3 || en.length === 0) continue;
        const set = termPairs.get(s) ?? new Set<string>();
        en.forEach((e) => set.add(e));
        termPairs.set(s, set);
      }
    }
    add(`${t.text.en} ${t.text.hi}`, FIELD_WEIGHT.text);
    for (const tok of tf.keys()) df.set(tok, (df.get(tok) ?? 0) + 1);
    return { topic: t, tf, len, head: new Set(docTokens(`${t.title.en} ${t.title.hi}`)) };
  });
  const p = { docs, df, termPairs };
  prepared.set(ix, p);
  return p;
}

// Each content word of the question as the tokens that may stand for it (any one matching counts once).
function questionGroups(question: string, enVocab: (s: string) => boolean, termPairs: (s: string) => Set<string> | undefined): string[][] {
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const w of words(question.slice(0, QUESTION_MAX))) {
    if (seen.has(w)) continue;
    seen.add(w);
    if (isDeva(w)) {
      if (!STOP_HI.has(w)) groups.push([w]);
      continue;
    }
    if (STOP_EN.has(w) || STOP_ROMAN.has(w)) continue;
    const st = stem(w);
    const alts = [st];
    // A Roman word the books' English does not have may be Hindi in Roman letters.
    if (!enVocab(st) && !/\d/.test(w)) {
      const s = skeleton(w);
      if (s.length >= 3) {
        alts.push(SK(s));
        for (const e of termPairs(s) ?? []) alts.push(e);
      }
    }
    groups.push(alts);
  }
  return groups;
}

const K1 = 1.2;
const TITLE_BONUS = 0.5;
const B = 0.75;

// The topics of the given books that answer the question, best first; [] when none is good enough. Pure. Only the books
// of the asked class and board (and subject, when one is given) are searched, whatever else is passed.
export function searchBooks(indexes: readonly SearchIndex[], a: BookSearchAsk): BookHit[] {
  const books = indexes.filter((ix) => ix.class === a.classLevel && ix.boards.includes(a.board) && (a.subject === null || ix.subject_id === a.subject));
  if (books.length === 0 || a.question.trim().length < 2) return [];
  const preps = books.map((ix) => ({ ix, p: prepare(ix) }));
  const docs = preps.flatMap(({ ix, p }) => p.docs.map((d) => ({ ix, d })));
  const N = docs.length;
  if (N === 0) return [];
  const dfOf = (tok: string) => preps.reduce((n, { p }) => n + (p.df.get(tok) ?? 0), 0);
  const groups = questionGroups(
    a.question,
    (s) => dfOf(s) > 0,
    (s) => {
      const out = new Set<string>();
      for (const { p } of preps) for (const e of p.termPairs.get(s) ?? []) out.add(e);
      return out.size ? out : undefined;
    }
  );
  if (groups.length === 0) return [];
  const idf = new Map<string, number>();
  const idfOf = (tok: string) => {
    let v = idf.get(tok);
    if (v === undefined) {
      const df = dfOf(tok);
      v = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      idf.set(tok, v);
    }
    return v;
  };
  // A word no book has weighs the most: a question about something the book never says is not covered by it.
  const groupWeight = groups.map((g) => Math.max(...g.map(idfOf)));
  const totalWeight = groupWeight.reduce((x, y) => x + y, 0);
  const avgLen = docs.reduce((n, { d }) => n + d.len, 0) / N;

  const scored: { ix: SearchIndex; topic: SearchTopic; score: number }[] = [];
  for (const { ix, d } of docs) {
    let score = 0;
    let covered = 0;
    groups.forEach((g, gi) => {
      let best = 0;
      for (const tok of g) {
        const tf = d.tf.get(tok);
        if (!tf) continue;
        const s = (idfOf(tok) * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * d.len) / avgLen));
        if (s > best) best = s;
      }
      if (best > 0) {
        // A word of the topic's own title counts once more: "प्रकाश का अपवर्तन" is that topic.
        score += best + (g.some((tok) => d.head.has(tok)) ? TITLE_BONUS * groupWeight[gi] : 0);
        covered += groupWeight[gi];
      }
    });
    if (score >= MIN_SCORE && covered / totalWeight >= MIN_COVERAGE) scored.push({ ix, topic: d.topic, score });
  }
  scored.sort((x, y) => y.score - x.score || x.topic.chapter_key.localeCompare(y.topic.chapter_key) || x.topic.topic.localeCompare(y.topic.topic));
  const top = scored[0]?.score ?? 0;
  const tokens = new Set(groups.flat());
  return scored
    .filter((s) => s.score >= top * NEAR_BEST)
    .slice(0, BOOK_HITS_MAX)
    .map((s) => ({ bookId: s.ix.id, subject: s.ix.subject_id, topic: s.topic, score: Math.round(s.score * 100) / 100, text: passageOf(s.topic.text[a.lang] || s.topic.text.en, tokens) }));
}

// The part of the topic's text that answers: from the sentence with the most of the question's words, up to
// PASSAGE_MAX characters (with the sentences before it when it is near the end).
function passageOf(text: string, tokens: Set<string>): string {
  const sentences = text.split(/(?<=[.!?।])\s+/).filter(Boolean);
  let best = 0;
  let bestHits = 0;
  sentences.forEach((s, i) => {
    const hits = new Set(docTokens(s).filter((t) => tokens.has(t))).size;
    if (hits > bestHits) {
      best = i;
      bestHits = hits;
    }
  });
  let out = '';
  for (const s of sentences.slice(best)) {
    if (out && out.length + 1 + s.length > PASSAGE_MAX) break;
    out = out ? `${out} ${s}` : s;
  }
  // Near the end of the text, the sentences before it fill what is left.
  for (let i = best - 1; i >= 0 && out.length + 1 + sentences[i].length <= PASSAGE_MAX; i -= 1) out = `${sentences[i]} ${out}`;
  if (out.length <= PASSAGE_MAX) return out;
  const cut = out.slice(0, PASSAGE_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > PASSAGE_MAX / 2 ? cut.slice(0, space) : cut}…`;
}

// The source in words, as the answer names it (no address): the book's chapter number and title, and the topic.
export function sourceTitle(t: SearchTopic, lang: 'en' | 'hi'): string {
  const head = lang === 'hi' ? `अध्याय ${t.chapter}, ${t.chapter_title.hi || t.chapter_title.en}` : `Chapter ${t.chapter}, ${t.chapter_title.en}`;
  const topic = lang === 'hi' ? t.title.hi || t.title.en : t.title.en;
  const full = `${head}, ${lang === 'hi' ? 'विषय' : 'topic'}: ${topic}`;
  return full.length <= 120 ? full : `${full.slice(0, 119).trimEnd()}…`;
}

// A hit in the shape the tutor's prompt takes (retrieve.ts Passage).
export const hitPassage = (h: BookHit, lang: 'en' | 'hi'): Passage => ({ chapterKey: h.topic.chapter_key, title: sourceTitle(h.topic, lang), text: h.text, score: h.score });

// ---- the books a child reads, from disk ------------------------------------------------------------------------------

// The books this child may be taught from: for each subject of the class (and only the asked one, when given) the book
// bookFor offers for their board and class, and only subjects their class has (`subjects`, from the catalog).
export function childBooks(q: { classLevel: number; board: string; subject: string | null; subjects: readonly string[] }, books: readonly Book[] = BOOKS): Book[] {
  const wanted = [...new Set(books.filter((b) => b.classLevel === q.classLevel).map((b) => b.subject))].filter((s) => q.subjects.includes(s) && (q.subject === null || s === q.subject));
  return wanted.map((subject) => bookFor({ board: q.board, classLevel: q.classLevel, subject }, books)).filter((b): b is Book => !!b);
}

// C509: the subjects of the class that have a published book for this child's board: an answer in one of them that no
// passage matched is honestly "not from your book"; in any other subject there is no book to name, so nothing is said.
export function bookSubjects(q: { classLevel: number; board: string; subjects: readonly string[] }, books: readonly Book[] = BOOKS): string[] {
  return childBooks({ ...q, subject: null }, books).map((b) => b.subject);
}

// Each file is read once per source of files (the disk, or a test's).
let caches = new WeakMap<Files, Map<string, Promise<SearchIndex | null>>>();
export function resetBookSearch(): void {
  caches = new WeakMap();
}
async function loadIndex(files: Files, book: Book): Promise<SearchIndex | null> {
  const cache = caches.get(files) ?? new Map<string, Promise<SearchIndex | null>>();
  caches.set(files, cache);
  const rel = `reader/content/c${String(book.classLevel).padStart(2, '0')}/${book.subject}/search.json`;
  let p = cache.get(rel);
  if (!p) {
    p = (async () => {
      const raw = await files.read(rel);
      if (!raw) return null;
      try {
        const j = JSON.parse(raw) as SearchIndex;
        return j && j.id === book.id && Array.isArray(j.topics) ? j : null;
      } catch {
        return null;
      }
    })();
    cache.set(rel, p);
  }
  const got = await p;
  if (!got) cache.delete(rel);
  return got;
}

// The passages of the child's own books for a typed question: [] when none is good enough or a file cannot be read.
export async function bookPassages(a: BookSearchAsk & { subjects: readonly string[] }, files: Files = diskFiles, books: readonly Book[] = BOOKS): Promise<Passage[]> {
  const mine = childBooks({ classLevel: a.classLevel, board: a.board, subject: a.subject, subjects: a.subjects }, books);
  if (mine.length === 0) return [];
  const indexes = (await Promise.all(mine.map((b) => loadIndex(files, b)))).filter((x): x is SearchIndex => !!x);
  return searchBooks(indexes, a).map((h) => hitPassage(h, a.lang));
}
