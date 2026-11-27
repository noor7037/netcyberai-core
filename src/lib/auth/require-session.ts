import { NextRequest } from 'next/server';
import { sessionForRequest, surfaceOfRequest } from './surfaces';
import type { SessionClaims } from './types';

// The session of the area this request belongs to (C556): Control, the parent home or the School app, each with its
// own cookies, so a browser signed in to two of them answers each with the right person.
export async function requireSession(req: NextRequest): Promise<SessionClaims | null> {
  return sessionForRequest((name) => req.cookies.get(name)?.value, surfaceOfRequest(req.nextUrl, req.headers));
}
