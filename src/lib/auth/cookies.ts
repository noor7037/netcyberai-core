export const ACCESS_COOKIE = 'nca_access';
export const REFRESH_COOKIE = 'nca_refresh';
export const PENDING_COOKIE = 'nca_pending';
// Holds the actor's own pre-impersonation access token while they're
// viewing as someone else, so /api/control/impersonate/end can restore
// it without a fresh login. Never sent anywhere but read back by that
// one route; same httpOnly/secure/sameSite handling as every other cookie
// here.
export const IMPERSONATION_RETURN_COOKIE = 'nca_impersonation_return';
// "Remember this device" (C90): skips the email-code step after a password
// on this browser. Not cleared by a normal log out (that is the point);
// cleared by "Forget this device", invalidated by "Sign out on all devices".
export const DEVICE_COOKIE = 'nca_device';
// "Keep me signed in" switched off on the first sign-in screen (F1-1, C257): carried through the later steps
// (emailed code, authenticator, choosing a school) until the session is issued. Holds '0' only; no secret.
export const KEEP_COOKIE = 'nca_keep';
// Setting up or replacing an authenticator on the account page (C95): the
// Supabase session that started the enrolment, parked until the first code
// confirms it. Separate from the sign-in pending cookie so a half-finished
// setup never interferes with signing in.
export const AUTHENTICATOR_COOKIE = 'nca_authenticator';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
export const PENDING_TTL_SECONDS = 2 * 60;
// The email-code step waits for an email to arrive, so it gets longer
// than the 2-minute mfa/select-school hop (C90).
export const EMAIL_STEP_TTL_SECONDS = 10 * 60;
export const DEVICE_TTL_SECONDS = 30 * 24 * 60 * 60;
// Scanning a QR code and typing the first code takes longer than the
// 2-minute sign-in hop (C95).
export const AUTHENTICATOR_SETUP_TTL_SECONDS = 10 * 60;
export const IMPERSONATION_TTL_SECONDS = 15 * 60; // PRD §2.3 "time-boxed" -- matches ACCESS_TTL_SECONDS, no PRD-specified number

// A session's cookies (F1-1): with "Keep me signed in" they last their full time; without it they have no max-age, so
// the browser drops them when it closes.
export function sessionCookieOptions(maxAgeSeconds: number, persistent: boolean) {
  const options = cookieOptions(maxAgeSeconds);
  if (persistent) return options;
  const { maxAge: _dropped, ...sessionOnly } = options;
  void _dropped;
  return sessionOnly;
}

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
