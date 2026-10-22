import { NextRequest, NextResponse } from 'next/server';
import { asLiveStaff } from '@/lib/control/billing-route';
import { NO_STORE, requireContentStaff } from '@/lib/content/route';
import { getResponse, isResponseId, markChecked, withdrawResponse } from '@/lib/content/response-queue';

// One cached response (M2-12, C286).
//   GET                           its blocks, as the family sees them
//   POST { action: 'check' }      mark checked: families see "Checked by NetCyberAI"
//   POST { action: 'withdraw' }   families stop seeing it; the next ask makes a fresh one
// NetCyberAI staff with their authenticator; each change writes an audit row.
export const dynamic = 'force-dynamic';

type Ctx = { params: { responseId: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  if (!isResponseId(params.responseId)) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const run = await asLiveStaff(guard.claims, (db) => getResponse(db, { userId: guard.claims.sub }, params.responseId));
  if ('refused' in run) return run.refused;
  if (!run.value) return NextResponse.json({ error: 'not found', code: 'not_found' }, { status: 404 });
  return NextResponse.json(run.value, { headers: NO_STORE });
}

const STATUS: Record<string, number> = { not_found: 404, not_ai_made: 409, withdrawn: 409 };

export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  const action = typeof b === 'object' && b !== null ? (b as { action?: unknown }).action : null;
  if (!isResponseId(params.responseId) || (action !== 'check' && action !== 'withdraw')) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const actor = { userId: guard.claims.sub };
  const run = await asLiveStaff(guard.claims, (db) => (action === 'check' ? markChecked(db, actor, params.responseId) : withdrawResponse(db, actor, params.responseId)));
  if ('refused' in run) return run.refused;
  const r = run.value;
  if (!r.ok) return NextResponse.json({ error: r.reason, code: r.reason }, { status: STATUS[r.reason] ?? 400, headers: NO_STORE });
  return NextResponse.json(r, { headers: NO_STORE });
}
