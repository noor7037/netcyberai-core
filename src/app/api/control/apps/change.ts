import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import type { Actor, Done } from '@/lib/control/apps';

// What every change under /api/control/apps has in common (M1-7): a real session, the founder, and the founder's
// authenticator proven in this session (aal2: a founder who is only at aal1 changes nothing here, as for every other
// sensitive Control change). The body is parsed by the caller's own parser; the change runs in one transaction as the
// platform role and is audited by the function that makes it.
const STATUS: Record<string, number> = { not_found: 404, already_undone: 409, already_ended: 409 };

export async function runChange(req: NextRequest, run: (db: PoolClient, actor: Actor, body: unknown) => Promise<Done<object>>): Promise<NextResponse> {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (guard.claims.aal !== 'aal2') {
    return NextResponse.json({ error: 'the authenticator is needed for this change', code: 'aal2' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  try {
    const result = await withTenantContext(guard.claims, (db) => run(db, { userId: guard.claims.sub, role: guard.claims.role }, body));
    if (!result.ok) return NextResponse.json({ error: result.code, code: result.code }, { status: STATUS[result.code] ?? 400 });
    return NextResponse.json(result);
  } catch (err) {
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
