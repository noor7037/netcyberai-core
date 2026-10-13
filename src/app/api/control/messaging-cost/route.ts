import { NextRequest, NextResponse } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { addRate, allSchoolSpend } from '@/lib/whatsapp/cost';

// Control → Messaging & Cost (docs/25 slice 7o, C197). NetCyberAI staff only.
//   GET   every live school's month: budget, delivered spend, on its way, held for the budget
//   POST  { action: 'rate', category, rateRupees, gstPercent, source, verifiedOn, effectiveFrom }  a rate read from Meta's own page
// A school's monthly limit is set at /api/control/schools/[schoolId]/budget.
export const dynamic = 'force-dynamic';
const paise = (rupees: unknown) => (typeof rupees === 'number' && Number.isFinite(rupees) ? Math.round(rupees * 100) : NaN);

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  return NextResponse.json({ schools: await withPlatformService((db) => allSchoolSpend(db)) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  const by = { userId: guard.claims.sub };
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : '');
  if (b?.action === 'rate') {
    const r = await withPlatformService((db) => addRate(db, by, { category: text(b.category, 30), ratePaise: paise(b.rateRupees), gstPercent: typeof b.gstPercent === 'number' ? b.gstPercent : NaN, source: text(b.source, 500), verifiedOn: text(b.verifiedOn, 10), effectiveFrom: text(b.effectiveFrom, 10) }));
    return r.ok ? NextResponse.json({ ok: true }, { status: 201 }) : NextResponse.json({ error: 'the rate was not added', code: r.reason }, { status: 400 });
  }
  return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
}
