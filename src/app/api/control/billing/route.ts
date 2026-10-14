import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { billingOverview, createPlan } from '@/lib/control/billing';
import { planInputFromBody } from '@/lib/control/billing-input';
import { asLiveStaff } from '@/lib/control/billing-route';

// Control → Billing & Plans (docs/26 slice 8e, C204). NetCyberAI staff only.
//   GET   the plans, which one a new school gets, and every school's plan, paid-until day, access and amount due
//   POST  { planId, name, priceMonthRupees, priceYearRupees, graceDays, allWorkingModules, moduleIds, limits, features,
//           messagesPerStudentMonth }  a new plan; both prices are per active student (C212)
// A plan is changed or retired at /api/control/billing/plans/[planId]; a school's payments and plan at
// /api/control/schools/[schoolId]/subscription.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const run = await asLiveStaff(guard.claims, (db) => billingOverview(db));
  if ('refused' in run) return run.refused;
  return NextResponse.json(run.value, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  if (typeof b !== 'object' || b === null) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const input = planInputFromBody(b);
  if (!input.ok) return NextResponse.json({ error: 'the plan was not saved', code: input.reason }, { status: 400 });
  const run = await asLiveStaff(guard.claims, (db) => createPlan(db, { userId: guard.claims.sub }, { ...input.value, planId: b.planId }));
  if ('refused' in run) return run.refused;
  const r = run.value;
  if (r.ok) return NextResponse.json({ ok: true, planId: r.plan.planId }, { status: 201 });
  return NextResponse.json({ error: 'the plan was not saved', code: r.reason }, { status: r.reason === 'id_taken' || r.reason === 'name_taken' ? 409 : 400 });
}
