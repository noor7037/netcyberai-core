import { NextResponse } from 'next/server';
import { maskEmail } from '@/lib/auth/account';

// Shared by the public school-application routes (C98): every answer is
// uncached, and errors carry a code the page turns into a sentence.
export function reply(body: Record<string, unknown>, status = 200): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

export { maskEmail };
