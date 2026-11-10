import { isLangCode, type LangCode } from './languages';

// The word-help call (POST /api/family/word-help): meaning and a translation of a word or selection, with the sentence it
// came from. One answer per (text, context, language) is kept for the visit, so a second look is free.

export type WordHelp = { meaning: string | null; translation: string | null; lang: LangCode };
export type WordHelpError = 'not_signed_in' | 'off' | 'daily_limit' | 'bad_request' | 'failed';
export type WordHelpResult = { ok: true; help: WordHelp } | { ok: false; error: WordHelpError };

const kept = new Map<string, WordHelp>();
const ERRORS: readonly string[] = ['not_signed_in', 'off', 'daily_limit', 'bad_request', 'failed'];

export async function fetchWordHelp(text: string, context: string, to: LangCode, signal?: AbortSignal): Promise<WordHelpResult> {
  const key = `${to}\u0000${text}\u0000${context}`;
  const hit = kept.get(key);
  if (hit) return { ok: true, help: hit };
  try {
    const res = await fetch('/api/family/word-help', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context ? { text, context, to } : { text, to }),
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    });
    const body = (await res.json().catch(() => ({}))) as { meaning?: unknown; translation?: unknown; lang?: unknown; error?: unknown };
    if (!res.ok) return { ok: false, error: ERRORS.includes(body.error as string) ? (body.error as WordHelpError) : 'failed' };
    const help: WordHelp = {
      meaning: typeof body.meaning === 'string' && body.meaning.trim() ? body.meaning.trim() : null,
      translation: typeof body.translation === 'string' && body.translation.trim() ? body.translation.trim() : null,
      lang: isLangCode(body.lang) ? body.lang : to,
    };
    kept.set(key, help);
    return { ok: true, help };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

// The language the child last picked for translations, kept on this device (a convenience, never needed).
const PICK = 'fam.wordhelp.lang';
export function savedLang(): LangCode | null {
  try {
    const v = localStorage.getItem(PICK);
    return isLangCode(v) ? v : null;
  } catch {
    return null;
  }
}
export function saveLang(l: LangCode) {
  try {
    localStorage.setItem(PICK, l);
  } catch {
    /* a private window keeps nothing */
  }
}
export const clearWordHelpCache = () => kept.clear();
