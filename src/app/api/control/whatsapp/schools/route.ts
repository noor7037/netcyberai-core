import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { loadWhatsAppSchools, releaseHeld } from '@/lib/control/whatsapp-schools';
import { jobQueue } from '@/lib/jobs/pg-queue';

// Control → WhatsApp, per school (W21-M6). NetCyberAI staff only.
//   GET                                       each school's number, status and today's sends; the held queue
//   POST { action: 'release', logId, reason } put a held message's send job back now, where the gate allows; audited
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  try {
    return NextResponse.json(await withTenantContext(guard.claims, (db) => loadWhatsAppSchools(db)), { headers: NO_STORE });
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
  if (body?.action !== 'release') return NextResponse.json({ error: 'not sent properly', code: 'request' }, { status: 400 });
  try {
    const result = await withTenantContext(guard.claims, (db) => releaseHeld(db, jobQueue, { userId: guard.claims.sub }, body));
    if (result.ok) return NextResponse.json({ ok: true }, { headers: NO_STORE });
    return NextResponse.json({ error: 'not released', code: result.code }, { status: result.code === 'not_found' ? 404 : result.code === 'reason_required' ? 400 : 409, headers: NO_STORE });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
