// Postgres SQLSTATE codes this codebase treats as expected, reportable
// outcomes rather than bugs -- Pre-F Architecture Hardening's composite
// FKs (Decision Log, supabase/migrations/20260921084751) make a
// cross-tenant reference fail exactly this way at the database layer,
// and Prompt F's CSV import relies on the same 23505 idempotency
// pattern the fee-webhook flow already uses (05_BUSINESS_LOGIC.md §3.3).
// https://www.postgresql.org/docs/current/errcodes-appendix.html
export function isForeignKeyViolation(err: unknown): boolean {
  return getSqlState(err) === '23503';
}

export function isUniqueViolation(err: unknown): boolean {
  return getSqlState(err) === '23505';
}

export function isCheckViolation(err: unknown): boolean {
  return getSqlState(err) === '23514';
}

// 42501: an RLS policy (e.g. teacher_scope_syllabus_progress) refused the
// row. Reported as 403, never as a crash or a silent no-op.
export function isRlsViolation(err: unknown): boolean {
  return getSqlState(err) === '42501';
}

function getSqlState(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null ? (err as { code?: string }).code : undefined;
}
