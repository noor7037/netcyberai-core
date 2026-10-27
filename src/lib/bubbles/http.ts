import type { NextResponse } from 'next/server';
import { jsonError, ruleError } from '@/lib/frameworks/route';
import type { BubbleProblem } from './server';

// How the bubble sheets' routes answer (C364): the library's one word as the status a screen expects, and the word as
// `code`, which the screen says in the person's language (mk.err.*). Not found and not allowed are the catalogue's own.

const STATUS: Record<Exclude<BubbleProblem, 'not_found' | 'not_allowed' | 'not_sent_properly'>, number> = {
  closed: 409,
  not_bubble: 409,
  sitting_fixed: 409,
  no_choice: 409,
  sheet_full: 409,
  questions: 409,
  layout: 409,
  old_sheet: 409,
  reading: 400,
  upload_closed: 409,
  sheet_taken: 409,
  state: 409,
  storage: 503,
  too_many_pages: 413,
};

export function bubbleRefusal(reason: BubbleProblem | 'not_a_page' | 'too_large' | 'too_small', extra: Record<string, unknown> = {}): NextResponse {
  if (reason === 'not_found') return ruleError(404, 'not_found');
  if (reason === 'not_allowed') return ruleError(403, 'not_allowed');
  if (reason === 'not_sent_properly') return ruleError(400, 'not_sent_properly');
  if (reason === 'too_large') return jsonError(413, 'the bubble sheet was not kept', { code: reason, ...extra });
  if (reason === 'not_a_page' || reason === 'too_small') return jsonError(400, 'the bubble sheet was not kept', { code: reason, ...extra });
  return jsonError(STATUS[reason], 'the change was not made', { code: reason, ...extra });
}
