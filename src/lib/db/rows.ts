import type { QueryResult } from 'pg';

// Decision Log C40: RLS silently turns a denied UPDATE/DELETE into zero
// rows affected, not an error -- confirmed live, `impersonate/end`
// returned 200 while a missing policy meant `ended_at` never actually
// got set. Every UPDATE/DELETE that expects to change a specific row
// must check this, not assume the absence of a thrown error means the
// row changed. `withTenantContext`'s own live checks can't catch this
// class of bug -- it's a property of one statement's result, not the
// session/role state those checks inspect.
export class NoRowsAffectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoRowsAffectedError';
  }
}

export function assertRowsAffected(result: QueryResult, message: string): void {
  if (result.rowCount === 0) {
    throw new NoRowsAffectedError(message);
  }
}
