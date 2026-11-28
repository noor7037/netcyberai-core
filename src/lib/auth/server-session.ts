import { cookies, headers } from 'next/headers';
import { isSurface, sessionForRequest, SURFACE_HEADER } from './surfaces';
import type { SessionClaims } from './types';

// For Server Components/layouts (which read cookies() rather than a
// NextRequest). Same verification as require-session.ts's route-handler
// version, just adapted to the RSC cookie API. The area (C556) is the one the
// middleware named for this page.
export async function getServerSession(): Promise<SessionClaims | null> {
  const jar = cookies();
  let said: string | null = null;
  try {
    said = headers().get(SURFACE_HEADER);
  } catch {
    /* outside a request (a test or a script): the area cannot be told */
  }
  // Pages only: their area is their own address (the middleware names it), and their layouts guard the role.
  return sessionForRequest((name) => jar.get(name)?.value, isSurface(said) ? said : null, true);
}
