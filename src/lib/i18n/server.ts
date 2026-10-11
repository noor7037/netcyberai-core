import { cookies } from 'next/headers';
import { readToursCookie, TOURS_COOKIE, type TourId } from '@/lib/contracts/tours';
import { DEFAULT_LANG, LANG_COOKIE, readLangCookie, type Lang } from './index';

// The language for this request, for server components and layouts. No
// database query, ever: the cookie when it was written for this person,
// otherwise English. `known` is false when the shell should ask the
// person's account once (LanguageSync).
export function getLang(userId: string): { lang: Lang; known: boolean } {
  const mine = readLangCookie(cookies().get(LANG_COOKIE)?.value, userId);
  return { lang: mine ?? DEFAULT_LANG, known: mine !== null };
}

// The first-visit tours this person has seen, from their own cookie; null
// when this browser has none for them (the shell then asks once). No query.
export function getToursSeen(userId: string): TourId[] | null {
  return readToursCookie(cookies().get(TOURS_COOKIE)?.value, userId);
}
