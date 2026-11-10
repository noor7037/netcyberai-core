// What the chapter reader (reader/reader.js) and its framing page say to each other (W22-S2). Pure: no React, no
// browser. Everything from the reader is data to check, never trusted: sentences are counted and cut, the language is
// one of two, the context is short plain text.

export type FromReader = {
  source: 'nca-reader';
  type: 'ready' | 'where' | 'stop' | 'speak' | 'ask' | 'tap' | 'state';
  id?: unknown;
  lang?: unknown;
  sentences?: unknown;
  offset?: unknown;
  chapter?: unknown;
  topic?: unknown;
  topicId?: unknown;
  lab?: unknown;
  question?: unknown;
  context?: unknown;
  // W23-A: a tap on a word or a selection (text, context, rect in the frame, the step and sentence it fell in), and the
  // reader's reading state for the bar (playing, percent, whether the screen can read).
  text?: unknown;
  rect?: unknown;
  step?: unknown;
  sent?: unknown;
  playing?: unknown;
  percent?: unknown;
  can?: unknown;
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

// W23-A: a tap or selection in the reader, checked: the words (1 to 200 characters), the sentence they came from (up to
// 400), where they sit in the frame, and, when the screen can read from there, the step and sentence to start at.
export type ReaderTap = { text: string; context: string; lang: 'en' | 'hi'; rect: { left: number; top: number; width: number; height: number }; at: { step: number; sent: number } | null };
const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
export function cleanTap(m: Pick<FromReader, 'text' | 'context' | 'lang' | 'rect' | 'step' | 'sent'>): ReaderTap | null {
  if (typeof m.text !== 'string' || (m.lang !== 'en' && m.lang !== 'hi')) return null;
  const text = m.text.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!text || !/[\p{L}\p{N}]/u.test(text)) return null;
  const context = typeof m.context === 'string' ? m.context.replace(/\s+/g, ' ').trim().slice(0, 400) : '';
  const r = (m.rect ?? {}) as Record<string, unknown>;
  const left = num(r.left, -10000, 20000);
  const top = num(r.top, -10000, 20000);
  const width = num(r.width, 0, 20000);
  const height = num(r.height, 0, 20000);
  if (left === null || top === null || width === null || height === null) return null;
  const step = num(m.step, 0, 999);
  const sent = num(m.sent, 0, 9999);
  return { text, context, lang: m.lang, rect: { left, top, width, height }, at: step !== null && sent !== null && Number.isInteger(step) && Number.isInteger(sent) ? { step, sent } : null };
}

// The reader's reading state for the bar: playing or not, how much of the topic is read (0 to 100), and whether this screen reads.
export function cleanState(m: Pick<FromReader, 'playing' | 'percent' | 'can'>): { playing: boolean; percent: number; can: boolean } {
  return { playing: m.playing === true, percent: Math.round(num(m.percent, 0, 100) ?? 0), can: m.can === true };
}
