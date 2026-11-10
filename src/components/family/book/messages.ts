// What the chapter reader (reader/reader.js) and its framing page say to each other (W22-S2). Pure: no React, no
// browser. Everything from the reader is data to check, never trusted: sentences are counted and cut, the language is
// one of two, the context is short plain text.

export type FromReader = {
  source: 'nca-reader';
  type: 'ready' | 'where' | 'stop' | 'speak' | 'ask';
  id?: unknown;
  lang?: unknown;
  sentences?: unknown;
  offset?: unknown;
  chapter?: unknown;
  topic?: unknown;
  question?: unknown;
  context?: unknown;
};

export const MAX_SENTENCES = 120;
export const MAX_SENTENCE_CHARS = 600;

// The sentences to say, or null when the message is not a well formed request to speak.
export function cleanSpeak(m: Pick<FromReader, 'id' | 'lang' | 'sentences' | 'offset'>): { id: number; lang: 'en' | 'hi'; sentences: string[]; offset: number } | null {
  if (typeof m.id !== 'number' || !Number.isInteger(m.id)) return null;
  if (m.lang !== 'en' && m.lang !== 'hi') return null;
  if (!Array.isArray(m.sentences) || m.sentences.length === 0 || m.sentences.length > MAX_SENTENCES) return null;
  const sentences = m.sentences.map((s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, MAX_SENTENCE_CHARS) : ''));
  if (sentences.some((s) => !s)) return null;
  const offset = typeof m.offset === 'number' && Number.isInteger(m.offset) && m.offset >= 0 && m.offset < 10000 ? m.offset : 0;
  return { id: m.id, lang: m.lang, sentences, offset };
}

// The word that starts at (or holds) a character of the sentence, as the reader highlights it; null between words.
export function wordAt(text: string, charIndex: number): { start: number; end: number } | null {
  let a = Math.min(Math.max(charIndex, 0), text.length);
  while (a > 0 && !/\s/.test(text[a - 1])) a--;
  let b = Math.min(Math.max(charIndex, 0), text.length);
  while (b < text.length && !/\s/.test(text[b])) b++;
  return b > a ? { start: a, end: b } : null;
}

// The line the tutor is given about where the child is: the chapter and, when there is one, the topic.
export function aboutLine(chapter: string, topic: string): string {
  const c = chapter.replace(/\s+/g, ' ').trim();
  const t = topic.replace(/\s+/g, ' ').trim();
  return (t ? `${c} / ${t}` : c).slice(0, 120);
}
