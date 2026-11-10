import { createHash } from 'node:crypto';
import { activePromptVersion, prepareModeration, prepareText, type AiContext } from '@/lib/ai/platform';
import { wordHelpPrompt } from '@/lib/ai/prompts/family.word_help';
import { isLangCode, languageInfo, type LangCode } from './languages';

// W23-B (C494): word help, the meaning and translation of a word or sentence a child tapped, in the child's language.
// Pure parts (the checks, the cache key, the reading of the answer) run anywhere; `askWordHelp` takes the family's own
// transaction. The service is the AI platform's text chain (profile family.word_help): the words leave the server only
// through the gateway, to a provider cleared for minors. A selection can be the child's own words, so nothing is kept
// that could name a person: the shared cache (content.word_help) holds the text, a hash of its sentence, the language
// and the two answers, never an account or a child, and a text that looks personal is answered but not kept.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export const WORD_MAX = 200;
export const CONTEXT_MAX = 400;
export const MEANING_MAX = 400;
export const TRANSLATION_MAX = 600;
// A family's allowance of fresh (not cached) word helps in an India day, Control's 'family.word_help.daily_requests'.
// Its own count, beside the tutor's day, so a child tapping words never uses up the tutor. Used when the setting is
// missing or not a whole number.
export const WORD_HELP_SETTING = 'family.word_help.daily_requests';
export const WORD_HELP_DEFAULT_DAILY = 300;

export type WordHelpInput = { text: string; context: string | null; to: LangCode };
export type WordHelpAnswer = { meaning: string | null; translation: string | null };
export type WordHelpError = 'bad_request' | 'daily_limit' | 'failed';

// The body of a request, checked: text 1 to 200 characters, context at most 400, a known language.
export function checkWordHelpBody(b: Record<string, unknown>): WordHelpInput | null {
  if (typeof b.text !== 'string' || !isLangCode(b.to)) return null;
  const text = clean(b.text);
  if (text.length < 1 || text.length > WORD_MAX) return null;
  let context: string | null = null;
  if (b.context !== undefined && b.context !== null) {
    if (typeof b.context !== 'string' || b.context.length > CONTEXT_MAX) return null;
    context = clean(b.context) || null;
  }
  return { text, context, to: b.to };
}

// Control characters out, runs of space into one, ends trimmed.
function clean(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f-\u009f​-‍⁠﻿]/g, ' ').replace(/\s+/g, ' ').trim();
}

// The cache's key text: Unicode-normalised, lower case, punctuation at the ends dropped, so "Photosynthesis." and
// "photosynthesis" share an answer.
const EDGE = new Set([...'"\u201c\u201d\u2018\u2019()[].,;:!?\u0964 ']);
export function normaliseText(s: string): string {
  const chars = [...clean(s).normalize('NFC').toLowerCase()];
  let a = 0;
  let b = chars.length;
  while (a < b && EDGE.has(chars[a])) a++;
  while (b > a && EDGE.has(chars[b - 1])) b--;
  return chars.slice(a, b).join('');
}

export function contextHash(context: string | null): string {
  return context === null ? '' : createHash('sha256').update(normaliseText(context)).digest('hex');
}

// A text that could carry something personal (an address, a long number, a handle) is answered but never kept.
export function looksPersonal(...parts: (string | null)[]): boolean {
  return parts.some((p) => p !== null && (/@|https?:|www\./i.test(p) || /\d[\d\s-]{6,}\d/.test(p)));
}

// The model's answer read strictly: one JSON object, two plain strings or null, each cut short. Anything else is null
// (the route then says it failed). A reply with neither string is a "no answer" and is returned as two nulls.
export function parseWordHelp(raw: string): WordHelpAnswer | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  const BAD = Symbol('bad');
  const pick = (v: unknown, max: number): string | null | typeof BAD => {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'string') return BAD;
    const s = clean(v.replace(/<[^>]*>/g, ' ').replace(/[*_\u0060#]+/g, '').replace(/https?:\S+/gi, ''));
    return s === '' ? null : s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
  };
  const meaning = pick(r.meaning, MEANING_MAX);
  const translation = pick(r.translation, TRANSLATION_MAX);
  if (meaning === BAD || translation === BAD) return null;
  return { meaning, translation };
}

// ---- the cache ------------------------------------------------------------------------------------------------------

export async function readCached(db: Db, key: { text: string; context: string | null; to: LangCode }): Promise<WordHelpAnswer | null> {
  const { rows } = await db.query(`select meaning, translation from content.word_help where text_norm = $1 and context_hash = $2 and to_lang = $3`, [normaliseText(key.text), contextHash(key.context), key.to]);
  return rows[0] ? { meaning: (rows[0].meaning as string | null) ?? null, translation: (rows[0].translation as string | null) ?? null } : null;
}

async function keep(db: Db, key: { text: string; context: string | null; to: LangCode }, a: WordHelpAnswer, provider: string, model: string) {
  await db.query(
    `insert into content.word_help (text_norm, context_hash, to_lang, meaning, translation, provider, model) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict do nothing`,
    [normaliseText(key.text), contextHash(key.context), key.to, a.meaning, a.translation, provider.slice(0, 40), model.slice(0, 80)]
  );
}

// ---- the daily allowance --------------------------------------------------------------------------------------------

export async function wordHelpLimit(db: Db): Promise<number> {
  const { rows } = await db.query(`select value from control.settings where key = $1`, [WORD_HELP_SETTING]);
  const v = rows[0]?.value;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : WORD_HELP_DEFAULT_DAILY;
}

// One more fresh word help for this account today, if under the limit; one statement, so two taps at once cannot both
// take the last place.
export async function takeWordHelp(db: Db, accountId: string, day: string, limit: number): Promise<boolean> {
  if (limit < 1) return false;
  const { rows } = await db.query(
    `insert into family.ai_daily as d (account_id, day, word_helps) values ($1::uuid, $2::date, 1)
     on conflict (account_id, day) do update set word_helps = d.word_helps + 1 where d.word_helps < $3::int
     returning word_helps`,
    [accountId, day, limit]
  );
  return rows.length === 1;
}

async function giveBackWordHelp(db: Db, accountId: string, day: string) {
  await db.query(`update family.ai_daily set word_helps = greatest(word_helps - 1, 0) where account_id = $1::uuid and day = $2::date`, [accountId, day]);
}

// ---- the ask --------------------------------------------------------------------------------------------------------

export type AskResult = { ok: true; answer: WordHelpAnswer; cached: boolean } | { ok: false; error: WordHelpError };

// The cache first (a hit takes nothing from the day); otherwise one place from the family's word-help allowance, the
// gateway's text call, the safety check on the words and the answer together, and the answer kept for every child.
export async function askWordHelp(db: Db, ai: AiContext, classLevel: number | null, input: WordHelpInput): Promise<AskResult> {
  const hit = await readCached(db, input);
  if (hit) return { ok: true, answer: hit, cached: true };
  if (!(await takeWordHelp(db, ai.accountId, ai.day, await wordHelpLimit(db)))) return { ok: false, error: 'daily_limit' };
  const fail = async (): Promise<AskResult> => {
    await giveBackWordHelp(db, ai.accountId, ai.day);
    return { ok: false, error: 'failed' };
  };

  // Words a child may have typed pass the safety check as the tutor's questions do; without it nothing is sent.
  const safety = await prepareModeration(db as never, ai, 'family.word_help');
  if (!safety.ok) return fail();
  const prompt = wordHelpPrompt(await activePromptVersion(db as never, 'family.word_help'));
  const lang = languageInfo(input.to);
  const out = await prepareText(db as never, ai, 'family.word_help', {
    system: prompt.system(),
    messages: [{ role: 'user', content: prompt.user({ text: input.text, context: input.context, toEnglish: lang.english, toNative: lang.native, classLevel }) }],
    responseFormat: 'json',
    maxTokens: 400,
    temperature: 0.2,
  });
  if (!out.ok) return fail();
  const sent = await out.text.send().catch(() => null);
  if (!sent) return fail();
  await sent.record(db as never);
  if (!sent.result.ok) {
    await safety.moderation.record(db as never);
    return fail();
  }
  const answer = parseWordHelp(sent.result.text);
  if (!answer) {
    await safety.moderation.record(db as never);
    return fail();
  }
  if (answer.meaning === null && answer.translation === null) {
    await safety.moderation.record(db as never);
    return { ok: true, answer, cached: false };
  }
  const verdict = await safety.moderation.check({ user: input.text, assistant: [answer.meaning, answer.translation].filter(Boolean).join('\n') });
  await safety.moderation.record(db as never);
  if (!verdict) return fail();
  // An unsafe text or answer shows nothing, and is not kept.
  if (!verdict.safe) return { ok: true, answer: { meaning: null, translation: null }, cached: false };
  if (!looksPersonal(input.text, input.context)) await keep(db, input, answer, sent.result.provider, sent.result.model);
  return { ok: true, answer, cached: false };
}
