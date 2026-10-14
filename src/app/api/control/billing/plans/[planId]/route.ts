import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { setDefaultPlan, setPlanRetired, updatePlan } from '@/lib/control/billing';
import { planInputFromBody } from '@/lib/control/billing-input';
import { asLiveStaff } from '@/lib/control/billing-route';

// One plan (docs/26 slice 8e, C204). NetCyberAI staff only. The plan is the one in the address.
//   POST { action: 'edit', name, priceMonthRupees, priceYearRupees, graceDays, allWorkingModules, moduleIds, limits, features, messagesPerStudentMonth }
//   POST { action: 'retire' } | { action: 'restore' }   retired: not offered to a school that is not on it
//   POST { action: 'default' }                          the plan a new school starts on
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { planId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  if (typeof b !== 'object' || b === null || !/^[a-z0-9_-]{1,40}$/.test(params.planId)) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  if (!['edit', 'retire', 'restore', 'default'].includes(b.action)) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const by = { userId: guard.claims.sub };
  const input = b.action === 'edit' ? planInputFromBody(b) : null;
  if (input && !input.ok) return NextResponse.json({ error: 'the plan was not saved', code: input.reason }, { status: 400 });
  const run = await asLiveStaff(guard.claims, (db) => {
    if (input?.ok) return updatePlan(db, by, params.planId, input.value);
    if (b.action === 'default') return setDefaultPlan(db, by, params.planId);
    return setPlanRetired(db, by, params.planId, b.action === 'retire');
  });
  if ('refused' in run) return run.refused;
  const r = run.value;
  if (r.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: 'the plan was not saved', code: r.reason }, { status: r.reason === 'not_found' ? 404 : r.reason === 'name_taken' ? 409 : 400 });
}
