import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { markTourSeen, ownToursSeen } from '@/lib/auth/db';
import { cookieOptions } from '@/lib/auth/cookies';
import { isTourId, readToursCookie, TOURS_COOKIE, TOURS_COOKIE_MAX_AGE, toursCookieValue, type TourId } from '@/lib/contracts/tours';
import { validationError } from '@/lib/errors/catalogue';

// The first-visit tours a person has seen (docs/19 rule 8, C138). The list
// lives on their own account; the cookie written here ("<user id>.<tours>")
// only saves pages from asking again, and is ignored for anyone else.

function withCookie(res: NextResponse, userId: string, seen: readonly string[]): NextResponse {
  res.cookies.set(TOURS_COOKIE, toursCookieValue(userId, seen), cookieOptions(TOURS_COOKIE_MAX_AGE));
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

// Asked once by the shell when this browser has no cookie for this person.
// A database that cannot say means no tour is shown this time (better none
// than one the person has already dismissed), and nothing is remembered.
export async function GET(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) return NextResponse.json({ error: 'session_expired' }, { status: 401 });
  try {
    const seen = (await ownToursSeen(claims.sub)).filter(isTourId);
    return withCookie(NextResponse.json({ seen }), claims.sub, seen);
  } catch (err) {
    console.error('[tours] could not read the tours seen', err instanceof Error ? err.name : 'error');
    return NextResponse.json({ seen: null }, { headers: { 'Cache-Control': 'no-store' } });
  }
}

// A tour was finished or skipped. During an impersonation only the cookie
// changes: the founder looking at a school never uses up that person's tours.
export async function POST(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) return NextResponse.json({ error: 'session_expired' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const tour = body?.tour;
  if (!isTourId(tour)) return NextResponse.json(validationError('not_sent_properly'), { status: 400 });
  let seen: string[];
  if (claims.impersonation) {
    const known: TourId[] = readToursCookie(req.cookies.get(TOURS_COOKIE)?.value, claims.sub) ?? [];
    seen = known.includes(tour) ? known : [...known, tour];
  } else {
    try {
      seen = await markTourSeen(claims.sub, tour);
    } catch (err) {
      console.error('[tours] could not save a tour as seen', err instanceof Error ? err.name : 'error');
      return NextResponse.json(validationError('not_saved'), { status: 503 });
    }
  }
  return withCookie(NextResponse.json({ status: 'saved', seen: seen.filter(isTourId) }), claims.sub, seen);
}
