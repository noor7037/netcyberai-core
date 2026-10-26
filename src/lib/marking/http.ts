import type { NextResponse } from 'next/server';
import { jsonError, ruleError } from '@/lib/frameworks/route';

// AI marking's refusals as the routes answer them (src/app/api/app/marking/**): the error catalogue's own rule where
// there is one, else a plain code (`code`) the screen says in the person's language (marking.pipeline.refused.*).
export type MarkingRefusal =
  | 'not_sent_properly'
  | 'not_allowed'
  | 'not_found'
  | 'closed' // the class is published: nothing changes until it is reopened
  | 'state' // the script is not one that can be marked again now
  | 'tries' // the AI's tries at this script are used: mark it by hand
  | 'questions' // the questions do not make up the paper yet
  | 'ai_off' // AI marking is off for the school (why: no_limit, switched_off, no_provider)
  | 'limit' // the month's pages are used up
  | 'upload_closed' // the upload is closed: start another
  | 'too_many' // more pages than one upload takes
  | 'storage' // the file store did not answer: try again
  | 'not_a_page' // not a JPEG picture we can read
  | 'too_large'
  | 'too_small';

const STATUS: Record<Exclude<MarkingRefusal, 'not_sent_properly' | 'not_allowed' | 'not_found'>, number> = {
  closed: 409,
  state: 409,
  tries: 409,
  questions: 409,
  ai_off: 409,
  limit: 409,
  upload_closed: 409,
  too_many: 413,
  storage: 503,
  not_a_page: 400,
  too_large: 413,
  too_small: 400,
};

export function markingRefusal(reason: MarkingRefusal, extra: Record<string, unknown> = {}): NextResponse {
  if (reason === 'not_sent_properly') return ruleError(400, 'not_sent_properly');
  if (reason === 'not_allowed') return ruleError(403, 'not_allowed');
  if (reason === 'not_found') return ruleError(404, 'not_found');
  return jsonError(STATUS[reason], 'AI marking refused this', { code: reason, ...extra });
}
