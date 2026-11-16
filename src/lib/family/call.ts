import { elaborationSpeech } from './elaboration';
import type { PublicBlock } from './resolver';

// The call (W16-A4): a child talks to a tutor and hears the answer. Pure helpers, safe for the phone (no database, no
// message file): how an answer is cut into the sentences that are spoken one at a time, and which blocks of an answer
// are said aloud at all. The chain today is listen (voice input), answer (the understand route), speak (the server
// voice, or the phone's own); the sentences are cut on the server, which seals each for the server voice
// (call-say.ts), so the speak route never speaks a word a phone sent.

// A sentence is spoken as soon as it is at least this long (a shorter one rides with the next), so the first words come
// quickly without the voice stumbling over three-word scraps.
export const CALL_SENTENCE_MIN = 20;
// A sentence with no end in sight is cut at a space after this many characters.
export const CALL_SENTENCE_MAX = 220;
// The most characters one answer speaks: a call is a conversation, not a lecture (the board holds the rest).
export const CALL_SPOKEN_MAX = 900;

const END = /(?<=[.!?।]["'’”)\]]*)\s+|\n+/;

function hardCut(piece: string): string[] {
  const out: string[] = [];
  let rest = piece;
  while (rest.length > CALL_SENTENCE_MAX) {
    const at = rest.lastIndexOf(' ', CALL_SENTENCE_MAX);
    const end = at > CALL_SENTENCE_MIN ? at : CALL_SENTENCE_MAX;
    out.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// The sentences of a text for speaking, in order: cut after . ! ? or the Devanagari danda (।) when a space follows
// (so "3.5" stays whole) and at every new line; pieces shorter than CALL_SENTENCE_MIN join the next one, and a short
// last piece joins the one before it. Empty pieces and pieces with no letter or number are dropped.
export function splitSpeech(text: string): string[] {
  const pieces = text
    .split(END)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
  const out: string[] = [];
  let carry = '';
  for (const piece of pieces) {
    const joined = carry ? `${carry} ${piece}` : piece;
    if (joined.length >= CALL_SENTENCE_MIN) {
      out.push(...hardCut(joined));
      carry = '';
    } else carry = joined;
  }
  if (carry) {
    if (out.length > 0 && out[out.length - 1].length + carry.length + 1 <= CALL_SENTENCE_MAX) out[out.length - 1] = `${out[out.length - 1]} ${carry}`;
    else out.push(carry);
  }
  return out;
}

// What a block says aloud on a call: the explanation's idea, its paragraphs and its example; a worked example's problem,
// its steps and its answer. The title, a formula, the terms list, key points (they repeat what was said), the quiz
// questions and every picture-like block are shown on the board and never spoken.
export function callSpeech(block: PublicBlock): string[] {
  switch (block.type) {
    case 'explanation':
      return [block.idea, ...(block.paragraphs ?? []), block.example].filter((t) => typeof t === 'string' && t.trim().length > 0);
    case 'worked_example':
      return [block.problem, ...block.steps.map((s) => s.text), block.answer].filter((t) => typeof t === 'string' && t.trim().length > 0);
    case 'elaboration':
      return elaborationSpeech(block);
    default:
      return [];
  }
}

// The voice's limit for one request (the family app may not import the adapters; a test holds the two equal).
export const ANSWER_SPOKEN_MAX = 600;

// The words read aloud for a kept tutor answer (W17-B2): what a call would say, whole sentences only, within `max`
// characters. One helper for the server (what the voice speaks) and the phone (what its own voice reads when the server
// voice is off), so both read the same words.
export function spokenAnswer(blocks: readonly { type: string }[], max: number): string {
  return spokenSentences(blocks, max).join(' ');
}

// The same words as spokenAnswer, sentence by sentence (W18-P1): the read-aloud and "Teach me" find the sentence being
// spoken in this list, and the board its step from that sentence's place (board.ts boardCursorFromSentence).
export function spokenSentences(blocks: readonly { type: string }[], max: number): string[] {
  const pieces = splitSpeech(blocks.flatMap((b) => callSpeech(b as PublicBlock)).join(' '));
  const out: string[] = [];
  let length = -1;
  for (const p of pieces) {
    if (length + 1 + p.length > max) break;
    out.push(p);
    length += 1 + p.length;
  }
  return out;
}

// W22-S3: the voice takes one request at a time (ANSWER_SPOKEN_MAX characters), so an answer is read in parts. The part
// that starts at sentence `from`: whole sentences up to `max` characters; the index just past its last sentence. At least
// one sentence is always taken (a longer one is cut by the server), so reading always moves on. The phone and the server
// both use this, so they cut the answer in the same places.
export function chunkEnd(sentences: readonly string[], from: number, max: number): number {
  let end = from;
  let length = -1;
  while (end < sentences.length && (end === from || length + 1 + sentences[end].length <= max)) {
    length += 1 + sentences[end].length;
    end++;
  }
  return end;
}

// Which sentence a character of the spoken text (the sentences joined by one space, as spokenAnswer joins them) falls in,
// from 0. A voice says where it is by character: the phone's word boundaries, or, for the server voice, which reports
// none, how much of the audio has played turned into a character by the caller. The space after a sentence belongs to
// it. Past the end, the last sentence; no sentences, -1.
export function sentenceAtChar(sentences: readonly string[], charIndex: number): number {
  if (sentences.length === 0) return -1;
  const at = Number.isFinite(charIndex) ? Math.max(0, charIndex) : 0;
  let end = 0;
  for (let i = 0; i < sentences.length; i++) {
    end += sentences[i].length + 1;
    if (at < end) return i;
  }
  return sentences.length - 1;
}

// The blocks the board draws on a call: the teaching ones. Questions to answer, the video list and the source list
// belong to the lesson page; on a call the child answers by speaking.
export const BOARD_HIDDEN: readonly PublicBlock['type'][] = ['check', 'practice', 'videos', 'sources'];

// The marks one turn takes, in milliseconds from the moment the child stopped speaking: to the first words of the
// answer arriving, and to the first sound played (the phone's own voice counts the same as the server's).
export type CallMarks = { turn: number; textMs: number | null; audioMs: number | null; voice: 'server' | 'phone' | 'none' };

export const MARK_LIMIT_MS = 120_000;

// A mark from a phone, checked for shape and range; null when it is not one.
export function cleanMarks(body: Record<string, unknown>): CallMarks | null {
  const ms = (v: unknown): number | null | undefined => (v === null ? null : typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MARK_LIMIT_MS ? Math.round(v) : undefined);
  const textMs = ms(body.textMs);
  const audioMs = ms(body.audioMs);
  const turn = Number(body.turn);
  const voice = body.voice === 'server' || body.voice === 'phone' || body.voice === 'none' ? body.voice : null;
  if (textMs === undefined || audioMs === undefined || !voice || !Number.isInteger(turn) || turn < 1 || turn > 200) return null;
  return { turn, textMs, audioMs, voice };
}
