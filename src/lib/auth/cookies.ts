export const ACCESS_COOKIE = 'nca_access';
export const REFRESH_COOKIE = 'nca_refresh';
export const PENDING_COOKIE = 'nca_pending';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
export const PENDING_TTL_SECONDS = 2 * 60;

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
