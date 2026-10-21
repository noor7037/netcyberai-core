import { NextRequest, NextResponse } from 'next/server';
import { setLanguage } from '@/lib/family/account';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_LANG_COOKIE, familyCookieOptions } from '@/lib/family/session';
import { isLang } from '@/lib/i18n';

// The parent's language for the app (English or Hindi). Before sign-in it is kept in a cookie only.
export async function POST(req: NextRequest) {
  const lang = (await jsonBody(req)).lang;
  if (!isLang(lang)) return NextResponse.json({ error: 'lang' }, { status: 400 });
  const g = await requireFamily(req);
  const res = g.error
    ? NextResponse.json({ lang })
    : await familyRun(g.session, async (db) => {
        await setLanguage(db, g.session.accountId, lang);
        return NextResponse.json({ lang });
      });
  if (res.status === 200) res.cookies.set(FAMILY_LANG_COOKIE, lang, familyCookieOptions(365 * 24 * 60 * 60));
  return res;
}
