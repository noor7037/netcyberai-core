import { en } from './messages/en';
import { hi } from './messages/hi';

// The app's two languages (docs/19 rule 3, C134). Every word a person reads
// in /app and /control comes from the message files in ./messages, keyed
// the same in both; scripts/check_ui_strings.py fails a screen that writes
// its own words. The Hindi is a first translation: it stays marked
// unreviewed until the founder approves it (supervisor decision, C133).
import { isLang, type Lang } from './lang';
export { LANGS, DEFAULT_LANG, LANG_NAME, isLang, type Lang } from './lang';
export const HINDI_REVIEWED = false;


// The language belongs to the signed-in person (users.ui_language), not to
// the browser. This cookie only saves pages from asking the database: it
// holds "<user id>.<language>", and a cookie written for anyone else is
// ignored, so on a shared office computer the next person never inherits
// the last person's language. A page never queries for it: with no cookie
// of their own the person sees English, and the shell asks once
// (GET /api/auth/language), which writes the cookie. It is cleared at every
// sign-in and sign-out and lasts twelve hours at most, so a choice made on
// another device arrives here at the next sign-in or the next day. A
// preference, nothing more: not a secret.
export const LANG_COOKIE = 'nca_lang';
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 12;

export function langCookieValue(userId: string, lang: Lang): string {
  return `${userId}.${lang}`;
}

// The language in the cookie, only when the cookie was written for this person.
export function readLangCookie(value: string | undefined, userId: string): Lang | null {
  if (!value || !userId) return null;
  const at = value.lastIndexOf('.');
  if (at < 0 || value.slice(0, at) !== userId) return null;
  const lang = value.slice(at + 1);
  return isLang(lang) ? lang : null;
}

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
const TABLES: Record<Lang, Messages> = { en, hi };


export function isMessageKey(v: string): v is MessageKey {
  return Object.prototype.hasOwnProperty.call(en, v);
}

// `{name}` in a message is replaced by params.name. A key the Hindi file
// lacks falls back to English (a test keeps the two files in step, so this
// is a safety net, never the plan).
export function t(lang: Lang, key: MessageKey, params?: Record<string, string | number>): string {
  const text = TABLES[lang][key] ?? en[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole));
}

// "1 result" / "3 results": the two forms are separate messages, `.one` and `.other`.
export function tCount(lang: Lang, base: string, count: number, params: Record<string, string | number> = {}): string {
  const key = `${base}.${count === 1 ? 'one' : 'other'}`;
  return isMessageKey(key) ? t(lang, key, { count, ...params }) : String(count);
}

// A label that is looked up by an id (a module, a group, a role): the
// English `fallback` is used for an id the files do not know yet.
export function tOr(lang: Lang, key: string, fallback: string): string {
  return isMessageKey(key) ? t(lang, key) : fallback;
}
