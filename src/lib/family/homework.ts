import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { checkUpload } from '@/lib/privacy/upload-check';
import { familyHashKey } from './secret';

// The Socratic homework helper (docs/family-app/11 L3; M2-6, C280). A photo of one question becomes a hint ladder: hint
// 1 → the child's attempt with feedback → the next hint → "I'm stuck" → the worked steps; the child writes the final
// answer, which is never shown first.
//
// The photo is never stored: it is screened here (the 12-digit rule and the Aadhaar card's words, on the text the OCR
// reads), sent once to a provider cleared for minors, and dropped when the request ends. What the later steps need (the
// question as read, the hints, the steps, the answer) travels in a sealed token, like a check item's (M1-5): AES-256-GCM
// with a key for this purpose only, bound to the account and child, for a day. Nothing the child types is kept.

export const HINTS = 3;
// Attempts per question: enough to learn, too few to guess a number by trying them all.
export const MAX_TRIES = 10;
const MAX_STEPS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

export type HomeworkRead = {
  question: string;
  subject: string;
  hints: string[];
  steps: string[];
  answer: string;
  kind: 'number' | 'word' | 'choice';
  mistakes: { answer: string; feedback: string }[];
};
export type ReadRefusal = 'no_question' | 'person' | 'personal_info' | 'failed';

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

// Lower case, one kind of minus, ASCII digits, no spaces or end punctuation: "1/2 m." and "1/2m" compare equal.
export function normaliseAnswer(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/[−–—]/g, '-')
    .toLowerCase()
    .replace(/[\s.,;:!?।'"]+/g, '');
}

// The first number in a text: an integer, a decimal or a fraction a/b. null when there is none.
export function firstNumber(s: string): number | null {
  const m = /(-?\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/.exec(s.normalize('NFKC').replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966)).replace(/[−–—]/g, '-').replace(/,(?=\d{3})/g, ''));
  if (!m) return null;
  const n = Number(m[1]);
  if (m[2] === undefined) return n;
  const d = Number(m[2]);
  return d === 0 ? null : n / d;
}

// Whether the child's answer matches: numbers by value (2/4 = 0.5), a choice by its letter, words as written.
export function sameAnswer(given: string, answer: string, kind: HomeworkRead['kind']): boolean {
  if (!given.trim()) return false;
  if (kind === 'number') {
    const a = firstNumber(answer);
    const g = firstNumber(given);
    if (a !== null && g !== null) return Math.abs(a - g) <= Math.max(1e-9, Math.abs(a) * 1e-6);
  }
  if (kind === 'choice') {
    const letter = (s: string) => /^\(?([a-d])\)?/i.exec(s.trim())?.[1]?.toLowerCase() ?? normaliseAnswer(s);
    return letter(given) === letter(answer);
  }
  return normaliseAnswer(given) === normaliseAnswer(answer);
}

// Whether a line gives the answer away: it contains the answer as written (when the answer is more than a character)
// or, for a number, states the value as a result ("= 3", "is 3", "answer 3", or the line ending on it). A number that
// merely appears ("the 3 sides") is kept, so small answers do not wipe out ordinary hints.
export function givesAway(line: string, answer: string, kind: HomeworkRead['kind']): boolean {
  const a = normaliseAnswer(answer);
  if (a.length > 1 && normaliseAnswer(line).includes(a)) return true;
  if (kind === 'number') {
    const v = firstNumber(answer);
    if (v === null) return false;
    const NUM = '(-?\\d+(?:\\.\\d+)?(?:\\s*\\/\\s*\\d+(?:\\.\\d+)?)?)';
    const stated = new RegExp(`(?:=|\\bis\\b|\\bare\\b|\\bequals?\\b|\\banswer\\b|\\bहै\\b|उत्तर)\\s*:?\\s*${NUM}|${NUM}\\s*[a-zA-Z\\u0900-\\u097F%°]*\\s*[.!।]?\\s*$`, 'giu');
    const plain = line.normalize('NFKC').replace(/[\u0966-\u096F]/g, (d) => String(d.charCodeAt(0) - 0x0966)).replace(/[−–—]/g, '-');
    for (const m of plain.matchAll(stated)) {
      const n = firstNumber(m[1] ?? m[2] ?? '');
      if (n !== null && Math.abs(n - v) <= Math.max(1e-9, Math.abs(v) * 1e-6)) return true;
    }
  }
  return false;
}

// The model's answer, checked: a refusal it chose, or a ladder with hints that keep the answer back, the steps cut where
// one would give it away, and a subject from the class's list. Anything else is 'failed'.
export function parseRead(raw: string, classSubjects: readonly string[]): { ok: true; read: HomeworkRead } | { ok: false; reason: ReadRefusal } {
  let o: Record<string, unknown>;
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    o = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if (o.status === 'no_question' || o.status === 'person' || o.status === 'personal_info') return { ok: false, reason: o.status };
  if (o.status !== 'ok') return { ok: false, reason: 'failed' };
  const kind = o.answer_kind === 'number' || o.answer_kind === 'choice' ? o.answer_kind : 'word';
  const answer = text(o.answer, 120);
  const question = text(o.question, 500);
  if (!answer || question.length < 3) return { ok: false, reason: 'failed' };
  const hints = (Array.isArray(o.hints) ? o.hints : []).map((h) => text(h, 400)).filter((h) => h && !givesAway(h, answer, kind)).slice(0, HINTS);
  const steps: string[] = [];
  for (const s of (Array.isArray(o.steps) ? o.steps : []).slice(0, MAX_STEPS).map((x) => text(x, 400))) {
    if (!s) continue;
    if (givesAway(s, answer, kind)) break;
    steps.push(s);
  }
  if (hints.length === 0) return { ok: false, reason: 'failed' };
  const mistakes = (Array.isArray(o.mistakes) ? o.mistakes : [])
    .map((m) => ({ answer: text((m as { answer?: unknown })?.answer, 120), feedback: text((m as { feedback?: unknown })?.feedback, 400) }))
    .filter((m) => m.answer && m.feedback && !sameAnswer(m.answer, answer, kind) && !givesAway(m.feedback, answer, kind))
    .slice(0, 3);
  const subject = typeof o.subject === 'string' && classSubjects.includes(o.subject) ? o.subject : 'other';
  return { ok: true, read: { question, subject, hints, steps, answer, kind, mistakes } };
}

// ---- the sealed ladder ----------------------------------------------------------------------------------------------

export type Ladder = HomeworkRead & { acct: string; c: string; exp: number; shown: number; tries: number; stuck: boolean; solved: boolean };

export function sealLadder(l: Ladder): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', familyHashKey('homework.v1'), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(l), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}

export function newLadder(read: HomeworkRead, ctx: { accountId: string; childId: string }, now = Date.now()): Ladder {
  return { ...read, acct: ctx.accountId, c: ctx.childId, exp: now + DAY_MS, shown: 0, tries: 0, stuck: false, solved: false };
}

// The ladder, when the token is whole, unexpired and this account's child's. null otherwise.
export function openLadder(token: unknown, ctx: { accountId: string; childId: string }, now = Date.now()): Ladder | null {
  if (typeof token !== 'string' || token.length > 16000) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, body] = parts.map((p) => Buffer.from(p, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', familyHashKey('homework.v1'), iv);
    decipher.setAuthTag(tag);
    const l = JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')) as Ladder;
    if (l.acct !== ctx.accountId || l.c !== ctx.childId || !(l.exp > now)) return null;
    return l;
  } catch {
    return null;
  }
}

// What the phone may see of a ladder: never the answer or a hint not yet earned; the steps only once stuck or solved.
export type LadderView = { question: string; subject: string; hints: string[]; hintsTotal: number; canHint: boolean; canStuck: boolean; steps: string[] | null; solved: boolean; tries: number };

export const canHint = (l: Ladder) => !l.solved && l.shown < l.hints.length && (l.shown === 0 || l.tries >= l.shown);
export const canStuck = (l: Ladder) => !l.solved && !l.stuck && (l.shown >= l.hints.length || l.tries >= 2);

export function viewOf(l: Ladder): LadderView {
  return {
    question: l.question,
    subject: l.subject,
    hints: l.hints.slice(0, l.shown),
    hintsTotal: l.hints.length,
    canHint: canHint(l),
    canStuck: canStuck(l),
    steps: l.stuck || l.solved ? l.steps : null,
    solved: l.solved,
    tries: l.tries,
  };
}

export type StepResult =
  | { ok: true; ladder: Ladder; result?: { correct: boolean; feedback: string | null } }
  | { ok: false; reason: 'not_yet' | 'bad_request' };

// One step of the ladder. A hint is earned by an attempt after each one; "I'm stuck" after every hint, or two tries.
export function step(l: Ladder, action: unknown, given?: unknown): StepResult {
  if (action === 'hint') {
    if (!canHint(l)) return { ok: false, reason: 'not_yet' };
    return { ok: true, ladder: { ...l, shown: l.shown + 1 } };
  }
  if (action === 'stuck') {
    if (!canStuck(l)) return { ok: false, reason: 'not_yet' };
    return { ok: true, ladder: { ...l, stuck: true, shown: l.hints.length } };
  }
  if (action === 'attempt') {
    const g = typeof given === 'string' ? given.trim().slice(0, 200) : '';
    if (!g) return { ok: false, reason: 'bad_request' };
    if (l.solved || l.tries >= MAX_TRIES) return { ok: false, reason: 'not_yet' };
    const correct = sameAnswer(g, l.answer, l.kind);
    const mistake = correct ? null : l.mistakes.find((m) => sameAnswer(g, m.answer, l.kind));
    return { ok: true, ladder: { ...l, tries: l.tries + 1, solved: correct }, result: { correct, feedback: mistake?.feedback ?? null } };
  }
  return { ok: false, reason: 'bad_request' };
}

// ---- the photo ------------------------------------------------------------------------------------------------------

export const PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export type PhotoProblem = 'not_a_photo' | 'too_big' | 'personal_info' | 'unreadable';

// The screen before anything leaves the server: a real photo (by its own first bytes), not too big, and no Aadhaar
// number or card in the words the OCR reads. The OCR is injectable for tests.
export async function screenPhoto(
  bytes: Uint8Array,
  sniff: (b: Uint8Array) => 'image/png' | 'image/jpeg' | 'image/webp' | null,
  ocr?: Parameters<typeof checkUpload>[1]
): Promise<{ ok: true; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' } | { ok: false; reason: PhotoProblem }> {
  const mediaType = sniff(bytes);
  if (!mediaType) return { ok: false, reason: 'not_a_photo' };
  if (bytes.byteLength > PHOTO_MAX_BYTES) return { ok: false, reason: 'too_big' };
  const check = await checkUpload({ bytes, name: 'photo' }, ocr);
  if (!check.ok) return { ok: false, reason: check.reason === 'upload_unreadable' ? 'unreadable' : 'personal_info' };
  return { ok: true, mediaType };
}
