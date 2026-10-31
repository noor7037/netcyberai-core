import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { asLiveStaff } from '@/lib/control/billing-route';
import { autoReplyOn, setAutoReply } from '@/lib/leads/reply';

// Control → Leads (W12-F): the switch for the automatic first reply to every new lead. NetCyberAI staff only.
//   GET           → { on }
//   PATCH { on }  → { on }; one platform audit row (leads.auto_reply_changed) with the before and after
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const run = await asLiveStaff(guard.claims, (db) => autoReplyOn(db));
  if ('refused' in run) return run.refused;
  return NextResponse.json({ on: run.value }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const body = await req.json().catch(() => null);
  if (typeof body?.on !== 'boolean') return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const on: boolean = body.on;
  const run = await asLiveStaff(guard.claims, async (db) => {
    await setAutoReply(db, guard.claims.sub, on);
    return autoReplyOn(db);
  });
  if ('refused' in run) return run.refused;
  return NextResponse.json({ on: run.value });
}
