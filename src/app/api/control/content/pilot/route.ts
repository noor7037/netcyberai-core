import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { asLiveStaff } from '@/lib/control/billing-route';
import { parsePilotScope, readPilotScope, writePilotScope } from '@/lib/content/pilot-scope';

// Control → Content → Library coverage → Pilot scope (W12-D). NetCyberAI staff only, checked again in the transaction
// (asLiveStaff), the same guard as the coverage export. A school's staff or a parent gets 403, a visitor 401.
//   GET   → { scope: { boardId, classLevels, subjects } }
//   POST  { boardId, classLevels, subjects }   set the scope; all three empty clears it. One audit row per change.
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const run = await asLiveStaff(guard.claims, (db) => readPilotScope(db));
  if ('refused' in run) return run.refused;
  return NextResponse.json({ scope: run.value }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const body = await req.json().catch(() => null);
  const scope = parsePilotScope(body);
  if (!scope) return NextResponse.json({ error: 'not sent properly', code: 'request' }, { status: 400, headers: NO_STORE });
  const run = await asLiveStaff(guard.claims, async (db) => {
    await writePilotScope(db, { userId: guard.claims.sub }, scope);
    return scope;
  });
  if ('refused' in run) return run.refused;
  return NextResponse.json({ ok: true, scope: run.value }, { headers: NO_STORE });
}
