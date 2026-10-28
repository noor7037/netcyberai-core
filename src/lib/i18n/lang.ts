// The two languages and their names, with nothing of the message table (C401), for client code that needs only
// these. './index' re-exports them.
export const LANGS = ['en', 'hi'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'en';

// The language's own name, always shown in that language.
export const LANG_NAME: Record<Lang, string> = { en: 'English', hi: 'हिन्दी' };

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}
