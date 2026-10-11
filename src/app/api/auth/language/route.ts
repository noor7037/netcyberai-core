import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { ownLanguage, setOwnLanguage } from '@/lib/auth/db';
import { cookieOptions } from '@/lib/auth/cookies';
import { validationError } from '@/lib/errors/catalogue';
import { DEFAULT_LANG, isLang, LANG_COOKIE, LANG_COOKIE_MAX_AGE, langCookieValue, type Lang } from '@/lib/i18n';

// The signed-in person's language for the app (docs/19 rule 3, C134). It
// lives on their own account, so it follows them to another device; the
// cookie written here ("<user id>.<language>") only saves pages from asking
// again, and is ignored for anyone else.

function withCookie(res: NextResponse, userId: string, lang: Lang): NextResponse {
  res.cookies.set(LANG_COOKIE, langCookieValue(userId, lang), cookieOptions(LANG_COOKIE_MAX_AGE));
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

// Asked once by the shell when this browser has no cookie for this person.
// An account that never chose, or a database that cannot say, is English.
export async function GET(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) return NextResponse.json({ error: 'session_expired' }, { status: 401 });
  let lang: Lang = DEFAULT_LANG;
  try {
    lang = (await ownLanguage(claims.sub)) ?? DEFAULT_LANG;
  } catch (err) {
    console.error('[language] could not read the saved language', err instanceof Error ? err.name : 'error');
    // Not remembered in the cookie: the shell asks again when the app is next opened.
    return NextResponse.json({ lang }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return withCookie(NextResponse.json({ lang }), claims.sub, lang);
}

// The switch. During an impersonation only the cookie changes: the founder
// looking at a school never changes that person's own setting.
export async function POST(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) return NextResponse.json({ error: 'session_expired' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const lang = body?.lang;
  if (!isLang(lang)) return NextResponse.json(validationError('choose_one', { field: 'language' }), { status: 400 });
  if (!claims.impersonation) {
    try {
      await setOwnLanguage(claims.sub, lang);
    } catch (err) {
      console.error('[language] could not save the language', err instanceof Error ? err.name : 'error');
      return NextResponse.json(validationError('not_saved'), { status: 503 });
    }
  }
  return withCookie(NextResponse.json({ status: 'saved', lang }), claims.sub, lang);
}
