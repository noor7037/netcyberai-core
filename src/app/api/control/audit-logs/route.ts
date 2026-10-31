import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { listAuditLogs, parseAuditQuery } from '@/lib/control/audit-logs';

// GET: the platform-wide audit trail for the founder, newest first, 50 a page. Read only.
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const parsed = parseAuditQuery(req.nextUrl.searchParams);
  if (!parsed.ok) return NextResponse.json({ error: 'bad request', code: parsed.code }, { status: 400 });
  try {
    return NextResponse.json(await withTenantContext(guard.claims, (client) => listAuditLogs(client, parsed.query)));
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
