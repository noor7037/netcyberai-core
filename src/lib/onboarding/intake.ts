import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { appSessionSecret } from '@/lib/auth/env';
import { normalizeEmail, normalizePhone } from '@/lib/auth/account';
import type { Sql } from '@/lib/jobs/types';

// The public "Register your school" form's rules (C98), kept free of
// request objects so they are unit-tested.

import { BOARDS, INDIAN_STATES, type Board } from './states';
export { BOARDS, BOARD_LABELS, INDIAN_STATES, type Board } from './states';

export type ApplicationInput = {
  schoolName: string;
  city: string;
  stateCode: string;
  board: Board;
  approxStudents: number | null;
  principalName: string;
  email: string;
  mobile: string;
};

export type FieldErrors = Partial<Record<keyof ApplicationInput, string>>;

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim();
  return t.length >= min && t.length <= max ? t : null;
}

export function validateApplication(body: unknown): { ok: true; value: ApplicationInput } | { ok: false; errors: FieldErrors } {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: FieldErrors = {};
  const schoolName = text(b.schoolName, 2, 200);
  if (!schoolName) errors.schoolName = 'Enter the school’s name.';
  const city = text(b.city, 2, 100);
  if (!city) errors.city = 'Enter the city or town.';
  const stateCode = typeof b.stateCode === 'string' && INDIAN_STATES.some((s) => s.code === b.stateCode) ? b.stateCode : null;
  if (!stateCode) errors.stateCode = 'Choose the state.';
  const board = typeof b.board === 'string' && (BOARDS as readonly string[]).includes(b.board) ? (b.board as Board) : null;
  if (!board) errors.board = 'Choose the board.';
  let approxStudents: number | null = null;
  if (b.approxStudents !== undefined && b.approxStudents !== null && b.approxStudents !== '') {
    const n = Number(b.approxStudents);
    if (!Number.isInteger(n) || n < 1 || n > 100000) errors.approxStudents = 'Enter a number between 1 and 100000, or leave it empty.';
    else approxStudents = n;
  }
  const principalName = text(b.principalName, 2, 200);
  if (!principalName) errors.principalName = 'Enter the principal’s name.';
  const email = normalizeEmail(b.email);
  if (!email) errors.email = 'Enter a valid email address.';
  const mobile = normalizePhone(b.mobile);
  if (!mobile) errors.mobile = 'Enter a 10-digit Indian mobile number.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { schoolName: schoolName!, city: city!, stateCode: stateCode!, board: board!, approxStudents, principalName: principalName!, email: email!, mobile: mobile! },
  };
}

// Dedupe key: "St. Mary's  School" and "st marys school" are the same.
export function schoolNameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ऀ-ॿ]+/g, ' ')
    .trim();
}

// ---- secrets derived from the app's session secret -----------------------------

function hmac(purpose: string, value: string): string {
  return createHmac('sha256', appSessionSecret()).update(`${purpose}:${value}`).digest('hex');
}

// Rate-limit keys: an IP address or email is never stored, only this.
export function rateKey(kind: 'ip' | 'email', value: string): string {
  return hmac(`rate-${kind}`, value.toLowerCase());
}

export function newVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function codeHash(applicationId: string, code: string): string {
  return hmac('application-code', `${applicationId}:${code}`);
}

export function codeMatches(applicationId: string, code: string, storedHash: string | null): boolean {
  if (!storedHash || !/^\d{6}$/.test(code)) return false;
  const a = Buffer.from(codeHash(applicationId, code), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const CODE_TTL_MINUTES = 15;
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_CODES_PER_APPLICATION = 5;
export const CODE_RESEND_SECONDS = 60;

// ---- rate limits --------------------------------------------------------------------

export const RATE_LIMITS = {
  apply_ip: { limit: 5, windowSeconds: 60 * 60 },
  apply_email: { limit: 3, windowSeconds: 60 * 60 },
  verify_ip: { limit: 20, windowSeconds: 60 * 60 },
} as const;
export type RateBucket = keyof typeof RATE_LIMITS;

// Counts this key's events in the window; under the limit it records one
// and allows. A soft limit: two requests in the same instant may both pass.
export async function allowAndRecord(db: Sql, bucket: RateBucket, keyHash: string): Promise<boolean> {
  const { limit, windowSeconds } = RATE_LIMITS[bucket];
  const { rows } = await db.query(
    `select count(*)::int as n from intake_rate_events
      where bucket = $1 and key_hash = $2 and created_at > now() - make_interval(secs => $3)`,
    [bucket, keyHash, windowSeconds]
  );
  if (Number(rows[0]?.n ?? 0) >= limit) return false;
  await db.query(`insert into intake_rate_events (bucket, key_hash) values ($1, $2)`, [bucket, keyHash]);
  return true;
}

// The caller's address as Vercel reports it (Vercel sets x-forwarded-for
// itself; the left-most entry is the client).
export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip')?.trim() || 'unknown';
}

// ---- Cloudflare Turnstile, behind a flag ----------------------------------------------

// On only when both keys exist. Off, the honeypot and rate limits still apply.
export function turnstileEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}

export async function turnstilePasses(token: unknown, ip: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!turnstileEnabled()) return true;
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const form = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token });
  if (ip !== 'unknown') form.set('remoteip', ip);
  try {
    const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
