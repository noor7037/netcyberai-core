import { NextRequest, NextResponse } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { setSchoolBudget } from '@/lib/whatsapp/cost';

// POST { budgetRupees | null, reason }: NetCyberAI staff set one school's monthly WhatsApp limit (docs/25 slice 7o,
// C197). The school is the one in the address. null takes the limit away: nothing sends for that school.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  const amount = b?.budgetRupees === null ? null : typeof b?.budgetRupees === 'number' && Number.isFinite(b.budgetRupees) ? Math.round(b.budgetRupees * 100) : NaN;
  if (!isUuid(params.schoolId) || typeof b?.reason !== 'string' || b.reason.length > 400) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const r = await withPlatformService((db) => setSchoolBudget(db, { userId: guard.claims.sub }, params.schoolId, amount, b.reason));
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'the budget was not set', code: r.reason }, { status: r.reason === 'not_found' ? 404 : 400 });
}
