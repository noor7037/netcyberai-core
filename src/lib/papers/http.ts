import type { NextResponse } from 'next/server';
import { jsonError, ruleError } from '@/lib/frameworks/route';

// How the paper maker's routes answer (C362): not found and not allowed are the catalogue's own answers; a thing sent
// wrongly is a 400; everything else is a thing that cannot be done in the paper's state now (a 409), with a plain code
// the screen says in the person's language (pp.refused.*).
const BAD_REQUEST = new Set(['not_sent_properly', 'blueprint', 'twice', 'too_many']);

export function paperRefusal(reason: string, extra: Record<string, unknown> = {}): NextResponse {
  if (reason === 'not_found') return ruleError(404, 'not_found');
  if (reason === 'not_allowed') return ruleError(403, 'not_allowed');
  return jsonError(BAD_REQUEST.has(reason) ? 400 : 409, 'the paper was not changed', { code: reason, ...extra });
}
