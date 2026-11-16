import { loadChildSettings, meaningLangOf } from './child-settings';
import type { FamilyChild } from './children';
import { drawTemplate } from './draw-templates';
import { syllabusLine, type Line } from './resolver';
import { isSubject, type Subject } from './subjects';
import { topicVideos, type WithDb } from './video-finder';
import { words, type VideoLanguage, type VideoPick } from './videos';

// C522: two to four videos under any tutor answer, typed, photo or drawing, whenever a topic can be named from what the
// pipeline already has, with no AI call and never from a child's words (the search is our own catalog text):
//   1. the syllabus line the question matched;
//   2. a drawing template's own registry entry (its chapter when it names one, else its title, keyed by class);
//   3. the chapter of the best library passage retrieved for the question, read again from the child's own syllabus;
//   4. (Noor, 16 Nov 2026) a typed question none of these name: a few of its own subject words (freeLine below), only
//      once the safety check passed the question (the route passes `asked` only then), with no name, number, address or
//      contact, under a `free.` key shared by every child who asks the same words.
// The videos are in the language the child's settings name for meanings (meaningLang, all of languages.ts; else the
// app's language); when that language has too few, the app's language (English or Hindi) is used and the card says so.

export const MIN_SHOWN = 2;

export type VideoTopic = { line: Line; child: FamilyChild; accountId: string; language: VideoLanguage };
export type AnswerVideos = { picks: VideoPick[]; topicKey: string; language: VideoLanguage; wanted: VideoLanguage | null };

type Db = Parameters<Parameters<WithDb>[0]>[0];

const TOPIC = /^[a-z0-9][a-z0-9._-]{2,119}$/;

// The topic for an answer's videos, or null when none can be named.
// `asked`: the typed question, only when the safety check passed it (else null); `subject`: the subject the server
// knows for it (the line's, the window's), else science.
export async function videoTopicOf(
  db: Db,
  a: { line: Line | null; passages: readonly { chapterKey: string; score: number }[]; drawTemplate: string | null; child: FamilyChild; accountId: string; asked?: string | null; subject?: Subject | null }
): Promise<VideoTopic | null> {
  const language = meaningLangOf(await loadChildSettings(db, a.accountId, a.child.childId), a.child.language);
  const line = a.line ?? (await drawLine(db, a.drawTemplate, a.child)) ?? (await passageLine(db, a.passages, a.child)) ?? freeLine(a.asked ?? null, a.subject ?? null, a.child);
  return line && TOPIC.test(line.key) ? { line, child: a.child, accountId: a.accountId, language } : null;
}

// Words that say who or where someone is, or how to reach them, never a topic: what follows them is dropped too.
const W = String.raw`[\p{L}\p{M}.'-]+`;
const INTRO = new RegExp(
  [
    String.raw`\b(?:my\s+name\s+is|my\s+name's|name\s+is|call\s+me|mera\s+naam|meri\s+naam|my\s+(?:school|teacher|friend|brother|sister|mother|father|mom|dad|mummy|papa|address|number|phone|email|city|village)(?:'s)?\s+(?:name\s+)?is)\s+${W}(?:\s+${W})?`,
    String.raw`\b(?:i\s+am|i'm|i\s+live\s+in|i\s+study\s+(?:in|at))\s+${W}`,
  ].join('|'),
  'giu'
);
const CONTACT = /(?:[\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(?:https?:\/\/\S+|www\.\S+)|(?:@[\w.]+)|(?:\+?\d[\d\s().-]{5,}\d)/giu;
// Question words and chatter with no topic in them.
const CHATTER = new Set([
  'please', 'pls', 'plz', 'tell', 'explain', 'does', 'did', 'can', 'could', 'would', 'should', 'will', 'give', 'show', 'teach', 'help', 'know', 'want',
  'need', 'meaning', 'mean', 'means', 'define', 'definition', 'example', 'examples', 'thing', 'things', 'something', 'anything', 'hello', 'thanks',
  'thank', 'sir', 'mam', 'maam', 'madam', 'teacher', 'name', 'naam', 'mera', 'meri', 'mujhe', 'kya', 'hai', 'hota', 'hoti', 'kaise', 'kyon', 'kyu',
  'batao', 'samjhao', 'friend', 'school', 'home', 'today', 'yesterday', 'tomorrow', 'answer', 'question', 'doubt', 'not', 'have', 'has', 'had',
  'been', 'being', 'just', 'also', 'very', 'really', 'like', 'there', 'here', 'then', 'than', 'where', 'whose', 'whom',
]);
const FREE_WORDS = 8;
const LATIN = /^[a-z][a-z-]*$/;

// The meaningful words of a typed question, in order, at most FREE_WORDS: no digit, no contact, no introduction, no
// one-letter or chatter word, and never the child's own first name.
export function freeWords(asked: string, firstName = ''): string[] {
  const own = new Set(words(firstName));
  const text = asked.normalize('NFC').slice(0, 600).replace(CONTACT, ' ').replace(INTRO, ' ');
  const out: string[] = [];
  for (const w of words(text)) {
    if (/\p{N}/u.test(w) || CHATTER.has(w) || own.has(w) || out.includes(w)) continue;
    out.push(w);
    if (out.length >= FREE_WORDS) break;
  }
  return out;
}

// FNV-1a, for a key when the question's words are not in the Latin alphabet.
const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193) >>> 0;
  return h.toString(36);
};

// A topic line from a typed question none of the catalog's lines named, or null. The key is the class and the sorted
// words (so "how do plants make food" and "plants make food how" share one search); the title, the words in order.
export function freeLine(asked: string | null, subject: Subject | null, child: Pick<FamilyChild, 'classLevel' | 'firstName'>): Line | null {
  if (!asked) return null;
  const kept = freeWords(asked, child.firstName ?? '');
  if (!kept.length || (kept.length === 1 && kept[0].length < 4)) return null;
  const sorted = Array.from(new Set(kept)).sort();
  const latin = sorted.filter((w) => LATIN.test(w));
  const cls = Math.max(0, Math.floor(child.classLevel));
  const slug = latin.length === sorted.length ? latin.join('-').slice(0, 100).replace(/-+$/, '') : `h${hash(sorted.join(' '))}`;
  const key = `free.c${cls}.${slug}`;
  if (!TOPIC.test(key)) return null;
  const title = kept.join(' ');
  return { subject: isSubject(subject) ? subject : 'science', key, chapterEn: title, topicEn: title, title };
}

async function drawLine(db: Db, id: string | null, child: FamilyChild): Promise<Line | null> {
  const t = id ? drawTemplate(id) : null;
  // An activity kind (colour, learn, play, art) is not a school topic: no videos.
  if (!t || t.cat || !isSubject(t.subject)) return null;
  if (t.chapterKey) return syllabusLine(db, child, { kind: 'chapter', key: t.chapterKey });
  return { subject: t.subject, key: `draw.c${child.classLevel}.${t.id}`, chapterEn: t.title.en, topicEn: t.title.en, title: child.language === 'hi' ? t.title.hi : t.title.en };
}

async function passageLine(db: Db, passages: readonly { chapterKey: string; score: number }[], child: FamilyChild): Promise<Line | null> {
  const best = [...passages].sort((x, y) => y.score - x.score).slice(0, 2);
  for (const p of best) {
    const line = await syllabusLine(db, child, { kind: 'chapter', key: p.chapterKey });
    if (line) return line;
  }
  return null;
}

// The languages tried, in order: the chosen one, then the app's (English or Hindi), then English after Hindi.
export function videoLanguages(wanted: VideoLanguage, app: 'en' | 'hi'): VideoLanguage[] {
  const out: VideoLanguage[] = [wanted];
  if (wanted !== app) out.push(app);
  else if (wanted === 'hi') out.push('en');
  return out;
}

// The answer's videos: the first language with at least MIN_SHOWN picks (cached, else one claimed refresh from the
// day's quota), or null. `wanted` is set when a fallback language is shown.
export async function answerVideos(withDb: WithDb, t: VideoTopic): Promise<AnswerVideos | null> {
  for (const language of videoLanguages(t.language, t.child.language)) {
    const picks = await topicVideos(withDb, t.line, t.child, language).catch(() => []);
    if (picks.length >= MIN_SHOWN) return { picks, topicKey: t.line.key, language, wanted: language === t.language ? null : t.language };
  }
  return null;
}
