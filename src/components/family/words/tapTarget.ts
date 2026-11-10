// Pure parts of the word tap (W23-A): which word and which sentence a tap landed on, inside the text of one text node.
// No browser here, so it is tested on plain strings; the layer (WordTapLayer.tsx) finds the node and offset.

const LETTER = /[\p{L}\p{N}\p{M}]/u;
const JOINER = /['’-]/;
const ENDS = '.!?।';

// The word that holds `offset` (or the one the tap is touching), without its punctuation; null on spaces or bare marks.
export function wordAtOffset(text: string, offset: number): { start: number; end: number; word: string } | null {
  const at = Math.min(Math.max(offset, 0), text.length);
  const inWord = (i: number) => i >= 0 && i < text.length && (LETTER.test(text[i]) || (JOINER.test(text[i]) && i > 0 && i < text.length - 1 && LETTER.test(text[i - 1]) && LETTER.test(text[i + 1])));
  let a = at;
  if (!inWord(a)) {
    if (inWord(a - 1)) a = a - 1;
    else return null;
  }
  let b = a;
  while (a > 0 && inWord(a - 1)) a--;
  while (b < text.length && inWord(b)) b++;
  const word = text.slice(a, b);
  return word && LETTER.test(word) ? { start: a, end: b, word } : null;
}

const endsAt = (text: string, i: number) => ENDS.includes(text[i]) && (i + 1 >= text.length || /\s/.test(text[i + 1]));

// The sentence of the node's text that holds `offset`: from after the last sentence end to the next one.
export function sentenceAtOffset(text: string, offset: number): { start: number; end: number; text: string } {
  const at = Math.min(Math.max(offset, 0), text.length);
  let a = 0;
  for (let i = 0; i < at; i++) if (endsAt(text, i)) a = i + 1;
  let b = text.length;
  for (let i = Math.max(a, at); i < text.length; i++) {
    if (endsAt(text, i)) {
      b = i + 1;
      break;
    }
  }
  const raw = text.slice(a, b);
  const lead = raw.length - raw.trimStart().length;
  return { start: a + lead, end: b, text: raw.trim() };
}

// Which of the spoken sentences (the answer's `sentences`, as the voice reads them) holds the tapped place of the node's
// text; -1 when the tap is on text the voice does not read (a heading, a label).
export function sentenceIndexIn(nodeText: string, offset: number, sentences: readonly string[]): number {
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    if (!s) continue;
    for (let at = nodeText.indexOf(s); at >= 0; at = nodeText.indexOf(s, at + 1)) {
      if (offset >= at && offset <= at + s.length) return i;
    }
  }
  return -1;
}

// The words to ask about: trimmed, one line, within the API's 200 characters; the context within 400.
export function cleanAsk(text: string, context: string): { text: string; context: string } | null {
  const t = text.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!t || !LETTER.test(t)) return null;
  return { text: t, context: context.replace(/\s+/g, ' ').trim().slice(0, 400) };
}
