import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { loadComplianceDesk, markDsrDone } from '@/lib/control/compliance-desk';

// Control → Compliance (W21-M6). NetCyberAI staff only.
//   GET                                          the data-request desk, the consent counts, the retention jobs' last runs
//   POST { action: 'done', requestId, note }     close an access or correction request with a note; audited
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  try {
    return NextResponse.json(await withTenantContext(guard.claims, (db) => loadComplianceDesk(db)), { headers: NO_STORE });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.action !== 'done') return NextResponse.json({ error: 'not sent properly', code: 'request' }, { status: 400 });
  try {
    const result = await withTenantContext(guard.claims, (db) => markDsrDone(db, { userId: guard.claims.sub }, body));
    if (result.ok) return NextResponse.json({ ok: true }, { headers: NO_STORE });
    return NextResponse.json({ error: 'not done', code: result.code }, { status: result.code === 'not_found' ? 404 : result.code === 'note_required' ? 400 : 409, headers: NO_STORE });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
