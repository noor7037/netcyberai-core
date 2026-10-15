import { NextResponse } from 'next/server';
import { validationError, type ErrorRule } from '@/lib/errors/catalogue';

// A refusal of the certificates' routes (C228). Like every route under /api/app/documents (C136), the sentence is the
// error catalogue's own, never one written in a route; `reason` is the certificate's own code, so the screen can say
// exactly what to do, in the person's language.
const RULE: Record<string, ErrorRule> = {
  withdrawn: 'already_done',
  too_large: 'file_too_large',
  not_a_pdf: 'file_type',
  not_a_png: 'file_type',
};
const PARAMS: Record<string, Record<string, string | number>> = {
  too_large: { field: 'file', maxMb: 3 },
  not_a_pdf: { field: 'file', allowed: 'PDF' },
  not_a_png: { field: 'file', allowed: 'PNG, JPG, WebP' },
};

export function certificateRefusal(status: number, reason: string, extra: Record<string, unknown> = {}, params?: Record<string, string | number>): NextResponse {
  return NextResponse.json({ ...validationError(RULE[reason] ?? 'not_saved', params ?? PARAMS[reason] ?? {}), reason, ...extra }, { status });
}
