import { createHash, timingSafeEqual } from 'crypto';
import type { Sql } from './types';

// The sweeper's credential (C97): `Authorization: Bearer <token>`, sent by
// pg_cron through pg_net with the secret kept only in Supabase Vault. The
// app never holds the secret: it asks the database for its SHA-256 digest
// (jobs_runner_secret_digest(), migration …_b2_jobs_runner_secret_digest)
// and compares digests in constant time, so neither the content nor the
// length of the secret leaks through timing.

const TOKEN_RE = /^[0-9a-f]{64}$/;

export function bearerToken(authorization: string | null): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length);
  return TOKEN_RE.test(token) ? token : null;
}

export function runnerAuthorized(token: string | null, secretDigest: Buffer | null): boolean {
  if (!token || !secretDigest || secretDigest.length !== 32) return false;
  return timingSafeEqual(createHash('sha256').update(token).digest(), secretDigest);
}

export async function secretDigest(db: Sql): Promise<Buffer | null> {
  const { rows } = await db.query(`select public.jobs_runner_secret_digest() as d`);
  const d = rows[0]?.d;
  return d ? Buffer.from(d) : null;
}
