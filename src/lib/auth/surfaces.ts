// One sign-in per area (C556, founder 27 Nov 2026): the School app (/app: principal, office, teachers), the school
// parent home (/parent) and Control (/control) each keep their own session cookies, so signing in to one never signs
// another out, in browser tabs or in installed apps on one phone. (The Family app has had its own since C248.)
//
// Which area a session belongs to follows from its role alone: a platform admin's is Control's, a parent's is the
// parent home's, everyone else's is the School app's. The School app keeps the original cookie names, so sessions that
// began before this change still open: a Control or parent session found there is read for its own area and moved to
// that area's cookies at its next renewal.
//
// Edge-safe (no Node APIs): the middleware imports this.

import { verifyAccessToken } from './jwt';
import type { SessionClaims, SessionRole } from './types';

export type Surface = 'app' | 'parent' | 'control';
export const SURFACES: readonly Surface[] = ['app', 'parent', 'control'];

// Set by the middleware on every gated page and API request it passes on (any value a browser sent is replaced).
// It only chooses which of the browser's own cookies is read; each is still verified on its own.
export const SURFACE_HEADER = 'x-nca-surface';

const NAMES: Record<Surface, { access: string; refresh: string }> = {
  app: { access: 'nca_access', refresh: 'nca_refresh' },
  parent: { access: 'nca_parent_access', refresh: 'nca_parent_refresh' },
  control: { access: 'nca_control_access', refresh: 'nca_control_refresh' },
};

export const accessCookieOf = (surface: Surface) => NAMES[surface].access;
export const refreshCookieOf = (surface: Surface) => NAMES[surface].refresh;

export function isSurface(value: unknown): value is Surface {
  return value === 'app' || value === 'parent' || value === 'control';
}

export function surfaceForRole(role: SessionRole): Surface {
  if (role === 'super_admin') return 'control';
  if (role === 'parent') return 'parent';
  return 'app';
}

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

// The area an address belongs to, or null when the address is shared (the sign-in routes, /api/app, which the parent
// home also calls).
export function surfaceOfPath(pathname: string): Surface | null {
  if (under(pathname, '/control') || under(pathname, '/api/control')) return 'control';
  if (under(pathname, '/parent')) return 'parent';
  if (under(pathname, '/app')) return 'app';
  return null;
}

// The area of a request: its own address, else the page that made it (the Referer, same site only), else the
// middleware's header.
export function surfaceOfRequest(url: URL, headers: Headers): Surface | null {
  const own = surfaceOfPath(url.pathname);
  if (own) return own;
  const referer = headers.get('referer');
  if (referer) {
    try {
      const from = new URL(referer);
      if (from.origin === url.origin) {
        const s = surfaceOfPath(from.pathname);
        if (s) return s;
      }
    } catch {
      /* not a URL: ignored */
    }
  }
  const said = headers.get(SURFACE_HEADER);
  return isSurface(said) ? said : null;
}

type CookieGet = (name: string) => string | undefined;

// The verified session of one area: its own cookie, else (for Control and the parent home) a session of that area
// still held in the School app's original cookie from before C556. Null when there is none.
export async function sessionOf(get: CookieGet, surface: Surface): Promise<SessionClaims | null> {
  const own = get(accessCookieOf(surface));
  const claims = own ? await verifyAccessToken(own) : null;
  if (claims) return claims;
  if (surface === 'app') return null;
  const legacy = get(accessCookieOf('app'));
  const old = legacy ? await verifyAccessToken(legacy) : null;
  return old && surfaceForRole(old.role) === surface ? old : null;
}

// The person a request is from, for a route to authorise: the area's own session; for Control and the parent home with
// none of their own, the School app's session (whose role those routes then refuse with 403, as before C556). A request
// whose area cannot be told (no address, no Referer, no header: a script or a test) takes the first valid session,
// School app first. Signing out and ending a view read sessionOf, strictly, so they never end another area's session.
//
// The fallback is for guarded addresses only (`guarded`: the request's OWN address is Control's or the parent home's,
// whose guards refuse any other role). A shared route (/api/auth, /api/app) whose area comes from the Referer reads that
// area strictly, so a Control page whose sign-in ran out never acts as the School app's person (security review, C556).
export async function sessionForRequest(get: CookieGet, surface: Surface | null, guarded = false): Promise<SessionClaims | null> {
  if (surface) {
    const own = await sessionOf(get, surface);
    if (own || surface === 'app' || !guarded) return own;
    const app = get(accessCookieOf('app'));
    return app ? verifyAccessToken(app) : null;
  }
  for (const s of SURFACES) {
    const claims = await sessionOf(get, s);
    if (claims) return claims;
  }
  return null;
}

// The refresh cookie to renew an area's session with, and which cookie it came from. For Control and the parent home,
// the School app's cookie is used only when no area session of their own exists and the School app's access cookie is
// gone or belongs to that area (so a principal's session in the same browser is never spent for a Control page).
export async function refreshCookieFor(get: CookieGet, surface: Surface): Promise<{ token: string; from: Surface } | null> {
  const own = get(refreshCookieOf(surface));
  if (own) return { token: own, from: surface };
  if (surface === 'app') return null;
  const legacy = get(refreshCookieOf('app'));
  if (!legacy) return null;
  const access = get(accessCookieOf('app'));
  if (access) {
    const claims = await verifyAccessToken(access);
    if (claims && surfaceForRole(claims.role) !== surface) return null;
  }
  return { token: legacy, from: 'app' };
}
