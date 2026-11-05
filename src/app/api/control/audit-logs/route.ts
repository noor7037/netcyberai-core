import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { auditDetail, exportAuditCsv, listAuditLogs, parseAuditQuery } from '@/lib/control/audit-logs';

// GET: the platform-wide audit trail for the founder, newest first, 50 a page. Read only.
//   ?id=<audit id>      one row's detail (personal values hidden)
//   ?format=csv         the filtered rows as CSV, no before or after state (W21-M6)
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const params = req.nextUrl.searchParams;
  const parsed = parseAuditQuery(params);
  if (!parsed.ok) return NextResponse.json({ error: 'bad request', code: parsed.code }, { status: 400 });
  try {
    const id = params.get('id');
    if (id !== null) {
      const row = await withTenantContext(guard.claims, (client) => auditDetail(client, id));
      return row ? NextResponse.json({ row }, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    if (params.get('format') === 'csv') {
      const out = await withTenantContext(guard.claims, (client) => exportAuditCsv(client, parsed.query));
      return new NextResponse(out.csv, {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="audit-log.csv"', 'Cache-Control': 'no-store', 'X-Rows': String(out.rows), 'X-Capped': out.capped ? '1' : '0' },
      });
    }
    return NextResponse.json(await withTenantContext(guard.claims, (client) => listAuditLogs(client, parsed.query)));
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
