import { cookies } from 'next/headers';
import { DEFAULT_LANG, LANG_COOKIE, readLangCookie, type Lang } from './index';

// The language for this request, for server components and layouts. No
// database query, ever: the cookie when it was written for this person,
// otherwise English. `known` is false when the shell should ask the
// person's account once (LanguageSync).
export function getLang(userId: string): { lang: Lang; known: boolean } {
  const mine = readLangCookie(cookies().get(LANG_COOKIE)?.value, userId);
  return { lang: mine ?? DEFAULT_LANG, known: mine !== null };
}
