import { createHash, timingSafeEqual } from 'crypto';

// The sweeper's credential (C97): `Authorization: Bearer <JOBS_RUNNER_SECRET>`,
// sent by pg_cron through pg_net from the secret kept in Supabase Vault.
// Compared in constant time over fixed-length digests, so neither the
// secret's content nor its length leaks through timing.
export function runnerAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !authorization?.startsWith('Bearer ')) return false;
  const given = createHash('sha256').update(authorization.slice('Bearer '.length)).digest();
  const expected = createHash('sha256').update(secret).digest();
  return timingSafeEqual(given, expected);
}
