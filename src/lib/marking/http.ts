import type { NextResponse } from 'next/server';
import { EXAM_READERS } from '@/lib/exams/exams';
import { jsonError, ruleError, type AppClaims } from '@/lib/frameworks/route';
import type { Actor } from './context';

// How the marking routes answer (C347): the library says what went wrong in one word; this puts it into the status a
// screen expects. Not found and not allowed are the catalogue's own answers; a thing that cannot be done in the
// state it is in (published, already approved, fixed once approved) is a 409; a thing sent wrongly is a 400.

export const actorOf = (claims: AppClaims): Actor => ({ schoolId: claims.schoolId, userId: claims.sub, role: claims.role });

// Whoever reads exams at all: the office, the coordinator and teachers. The accountant reads nothing here.
export const mayRead = (claims: AppClaims): boolean => EXAM_READERS.includes(claims.role);

const CONFLICTS = new Set(['closed', 'state', 'taken', 'not_ready', 'flagged', 'locked', 'twice', 'fixed', 'already', 'has_marks']);

export function refusal(reason: string, extra: Record<string, unknown> = {}): NextResponse {
  if (reason === 'not_found') return ruleError(404, 'not_found');
  if (reason === 'not_allowed') return ruleError(403, 'not_allowed');
  return jsonError(CONFLICTS.has(reason) ? 409 : 400, 'the change was not made', { code: reason, ...extra });
}
