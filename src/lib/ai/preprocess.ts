import type { ChatMessage } from './adapters/types';

// The pre-processor (docs/family-app/03 §7, 08 §7): before any request leaves the server, every child identifier is
// replaced with a neutral word. It runs on the whole request (the system text and every message), so nothing a family
// typed, and nothing a prompt template filled in, can carry them out.
//
//   the account's children's first names  -> "the student"   (whole word, any case, Latin or Devanagari)
//   the parent's email, and any email      -> "an email address"
//   Indian phone numbers (10 digits, +91)  -> "a phone number"
//   12-digit numbers (Aadhaar)             -> "an ID number"
//
// Devanagari digits are read as digits first, so a number typed in them is caught too.

export type ScrubContext = { childFirstNames: readonly string[]; parentEmail?: string | null };

export const NEUTRAL = { name: 'the student', email: 'an email address', idNumber: 'an ID number', phone: 'a phone number' } as const;

const DEVANAGARI_DIGITS = /[०-९]/g;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const AADHAAR = /(?<!\d)\d(?:[\s.-]?\d){11}(?!\d)/g;
// +91 / 0091 / 91 / 0, then ten digits starting 6-9, grouped any way with the spaces, dots and dashes people type.
const PHONE = /(?<![\d+])(?:(?:\+|00)\s?91[\s.-]?|91[\s.-]?|0)?[6-9](?:[\s.-]?\d){9}(?!\d)/g;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function nameMatcher(names: readonly string[]): RegExp | null {
  const words = Array.from(new Set(names.map((n) => n.normalize('NFC').trim()).filter((n) => n.length > 0)));
  if (words.length === 0) return null;
  // Longest first, so "Ashaben" is not left as "the studentben" when both are names.
  words.sort((a, b) => b.length - a.length);
  // \b does not see Devanagari letters; a letter, mark or digit on either side means it is part of another word.
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:${words.map(escape).join('|')})(?![\\p{L}\\p{M}\\p{N}_])`, 'giu');
}

export function scrubText(text: string, ctx: ScrubContext): string {
  let out = text.normalize('NFC').replace(DEVANAGARI_DIGITS, (d) => String(d.charCodeAt(0) - 0x0966));
  if (ctx.parentEmail) out = out.replace(new RegExp(escape(ctx.parentEmail.normalize('NFC')), 'giu'), NEUTRAL.email);
  out = out.replace(EMAIL, NEUTRAL.email);
  // Phone numbers first, so a +91 number is not read as twelve digits.
  out = out.replace(PHONE, NEUTRAL.phone);
  out = out.replace(AADHAAR, NEUTRAL.idNumber);
  const names = nameMatcher(ctx.childFirstNames);
  if (names) out = out.replace(names, NEUTRAL.name);
  return out;
}

export function scrubRequest<T extends { system: string; messages: readonly ChatMessage[] }>(request: T, ctx: ScrubContext): { system: string; messages: ChatMessage[] } {
  return { system: scrubText(request.system, ctx), messages: request.messages.map((m) => ({ role: m.role, content: scrubText(m.content, ctx) })) };
}
