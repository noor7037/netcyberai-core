// C521: the language a tutor question is asked in, from the child's own words. Pure, no database, no model. The script
// of each word decides by Unicode block (Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada,
// Malayalam, Arabic, Latin), and the script most of the words are in wins. Latin words are English unless they carry
// Romanised Hindi (Hinglish) by a short, conservative word list, so ordinary English never reads as Hinglish. A script
// two languages share is read by the child's mother tongue (Devanagari: Hindi, or Marathi for a Marathi child; Bengali
// script: Bengali, or Assamese by its own letters or for an Assamese child). No letters (a sum, a photo with no words) or a
// tie: the child's setting.

import { isLangCode, type LangCode } from './languages';

// What the answer is written in: one of the word-help languages, or Hinglish (Hindi in Roman letters).
export type ReplyLang = LangCode | 'hinglish';
export const isReplyLang = (v: unknown): v is ReplyLang => v === 'hinglish' || isLangCode(v);

type Script = 'latin' | 'deva' | 'beng' | 'guru' | 'gujr' | 'orya' | 'taml' | 'telu' | 'knda' | 'mlym' | 'arab';

// The Unicode blocks, first code point and last.
const BLOCKS: readonly [Script, number, number][] = [
  ['deva', 0x0900, 0x097f],
  ['beng', 0x0980, 0x09ff],
  ['guru', 0x0a00, 0x0a7f],
  ['gujr', 0x0a80, 0x0aff],
  ['orya', 0x0b00, 0x0b7f],
  ['taml', 0x0b80, 0x0bff],
  ['telu', 0x0c00, 0x0c7f],
  ['knda', 0x0c80, 0x0cff],
  ['mlym', 0x0d00, 0x0d7f],
  ['arab', 0x0600, 0x06ff],
  ['arab', 0x0750, 0x077f],
  ['arab', 0xfb50, 0xfdff],
  ['arab', 0xfe70, 0xfeff],
];

// The language a script is read as when nothing else decides.
const SCRIPT_LANG: Record<Exclude<Script, 'latin'>, LangCode> = { deva: 'hi', beng: 'bn', guru: 'pa', gujr: 'gu', orya: 'or', taml: 'ta', telu: 'te', knda: 'kn', mlym: 'ml', arab: 'ur' };
// The other languages written in a shared script, taken when the child's mother tongue is one of them.
const SHARED: Partial<Record<Exclude<Script, 'latin'>, readonly LangCode[]>> = { deva: ['mr'], beng: ['as'] };
// Assamese's own letters (ra and wa), which Bengali does not use.
const ASSAMESE_LETTERS = /[ৰৱ]/;

function scriptOf(ch: string): Script | null {
  const c = ch.codePointAt(0)!;
  if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0xc0 && c <= 0x24f)) return 'latin';
  for (const [s, from, to] of BLOCKS) if (c >= from && c <= to) return s;
  return null;
}

// Romanised Hindi words that are not English words (so "is", "to", "main", "me", "he", "par", "so" are left out on
// purpose: each is also English).
const HINGLISH = new Set([
  'kya', 'kyaa', 'kaise', 'kaisa', 'kaisi', 'kese', 'kyun', 'kyon', 'kyu', 'kyunki', 'kyonki', 'hai', 'hain', 'hota', 'hoti',
  'hote', 'batao', 'bataiye', 'bataye', 'batana', 'samjhao', 'samjhaiye', 'samjha', 'samjhna', 'samajh', 'matlab', 'kaun',
  'kitna', 'kitne', 'kitni', 'kahan', 'kaha', 'kab', 'aur', 'nahi', 'nahin', 'mujhe', 'humein', 'hume', 'tum', 'aap', 'ka',
  'ki', 'ke', 'ko', 'se', 'mein', 'yeh', 'ye', 'woh', 'wo', 'karo', 'karte', 'karta', 'karti', 'lekin', 'bhi', 'sirf',
  'accha', 'acha', 'bata', 'sawal', 'sawaal', 'jawab', 'jawaab', 'padhai', 'kaam', 'hum', 'apna', 'apni', 'iska', 'uska',
  'isme', 'usme', 'kuch', 'sab', 'wala', 'wali', 'raha', 'rahi', 'gaya', 'gayi', 'banta', 'banti', 'milta', 'chahiye',
]);

// Latin words read as Hinglish: at least two of the list, and at least a fifth of the Latin words.
export function isHinglish(latinWords: readonly string[]): boolean {
  if (latinWords.length === 0) return false;
  const hits = latinWords.filter((w) => HINGLISH.has(w.toLowerCase())).length;
  return hits >= 2 && hits / latinWords.length >= 0.2;
}

export type QuestionLanguage = {
  // The language to answer in.
  lang: ReplyLang;
  // Whether the child's words decided it (false: the child's setting, for no letters or a tie).
  detected: boolean;
};

// The language a question is asked in. `setting`: the child's reply setting, for a question with no letters or a tie.
// `motherTongue`: the parent's word-help language for the child, which reads a script two languages share.
export function questionLanguage(text: string, setting: ReplyLang, motherTongue: LangCode | null = null): QuestionLanguage {
  const counts = new Map<Script, number>();
  const latin: string[] = [];
  // Words: runs of letters and the marks that join them (a Devanagari matra belongs to its word).
  for (const word of text.normalize('NFC').match(/[\p{L}\p{M}]+/gu) ?? []) {
    const tally = new Map<Script, number>();
    for (const ch of word) {
      const s = scriptOf(ch);
      if (s) tally.set(s, (tally.get(s) ?? 0) + 1);
    }
    let best: Script | null = null;
    for (const [s, n] of tally) if (best === null || n > tally.get(best)!) best = s;
    if (!best) continue;
    counts.set(best, (counts.get(best) ?? 0) + 1);
    if (best === 'latin') latin.push(word);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0 || (ranked.length > 1 && ranked[0][1] === ranked[1][1])) return { lang: setting, detected: false };
  const script = ranked[0][0];
  if (script === 'latin') return { lang: isHinglish(latin) ? 'hinglish' : 'en', detected: true };
  if (script === 'beng' && ASSAMESE_LETTERS.test(text)) return { lang: 'as', detected: true };
  const shared = SHARED[script];
  if (motherTongue && shared?.includes(motherTongue)) return { lang: motherTongue, detected: true };
  return { lang: SCRIPT_LANG[script], detected: true };
}

// The child's reply setting (the style every earlier prompt explains in: en, hi or hinglish) as a reply language.
export function settingLang(child: { style: string }): ReplyLang {
  return child.style === 'hinglish' ? 'hinglish' : child.style === 'hi' ? 'hi' : 'en';
}

// Prompt v20: a short question in Latin letters with no English function word in it ("Kachra prabandhan") is Hindi in Roman
// letters, not English, when the child's profile language is Hindi. Ordinary English questions always carry one of these.
const ENGLISH_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'what', 'why', 'how', 'when', 'where', 'who', 'which', 'do', 'does', 'did', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'with', 'and', 'or', 'not', 'can', 'it', 'this', 'that',
  'explain', 'tell', 'me', 'about', 'define', 'meaning', 'difference', 'between', 'example', 'give', 'my', 'i', 'you', 'we', 'they', 'water', 'plant', 'plants', 'light', 'energy', 'force', 'cell', 'air', 'earth', 'sun', 'moon',
]);
export function looksRomanHindi(text: string): boolean {
  const words = text.normalize('NFC').match(/[\p{L}\p{M}]+/gu) ?? [];
  if (words.length === 0 || words.length > 6) return false;
  if (!words.every((w) => scriptOf(w[0]) === 'latin')) return false;
  return !words.some((w) => ENGLISH_WORDS.has(w.toLowerCase()));
}
