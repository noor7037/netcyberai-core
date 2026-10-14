import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { recordPayment, schoolBilling, schoolPayments } from '@/lib/control/billing';
import { rupeesFromBody } from '@/lib/control/billing-input';
import { asLiveStaff } from '@/lib/control/billing-route';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { applyPlan } from '@/lib/frameworks/plans';

// One school's subscription (docs/26 slice 8e, C204). NetCyberAI staff only. The school is the one in the address.
//   GET   its plan, paid-until day and access, and every payment recorded for it
//   POST  { action: 'payment', amountRupees, paidOn, coversUntil, reference, note?, correctsPaymentId? }
//         a payment taken outside the app; with correctsPaymentId it corrects that earlier row (nothing is ever edited).
//         Answers the paid-until day, the school's access now, and handGraceEnded: true when the payment brought the
//         school up to date and so ended a grace period that had been set by hand.
//   POST  { action: 'plan', planId, reason }   puts the school on a plan: exactly that plan's modules
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUuid(params.schoolId)) return NextResponse.json({ error: 'school not found' }, { status: 404 });
  const run = await asLiveStaff(guard.claims, async (db) => {
    const school = await schoolBilling(db, params.schoolId);
    return school ? { school, payments: await schoolPayments(db, params.schoolId) } : null;
  });
  if ('refused' in run) return run.refused;
  if (!run.value) return NextResponse.json({ error: 'school not found' }, { status: 404 });
  return NextResponse.json(run.value, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUuid(params.schoolId)) return NextResponse.json({ error: 'school not found' }, { status: 404 });
  const b = await req.json().catch(() => null);
  if (typeof b !== 'object' || b === null) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });

  if (b.action === 'payment') {
    const amount = rupeesFromBody(b.amountRupees);
    if (amount === undefined || amount === null) return NextResponse.json({ error: 'the payment was not recorded', code: 'amount' }, { status: 400 });
    const run = await asLiveStaff(guard.claims, (db) =>
      recordPayment(db, { userId: guard.claims.sub }, params.schoolId, { amountMinor: amount, paidOn: b.paidOn, coversUntil: b.coversUntil, reference: b.reference, note: b.note, correctsPaymentId: b.correctsPaymentId })
    );
    if ('refused' in run) return run.refused;
    const r = run.value;
    if (r.ok) return NextResponse.json({ ok: true, paidUntil: r.paidUntil, accessMode: r.accessMode, handGraceEnded: r.handGraceEnded }, { status: 201 });
    return NextResponse.json({ error: 'the payment was not recorded', code: r.reason }, { status: r.reason === 'not_found' ? 404 : 400 });
  }

  if (b.action === 'plan') {
    const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
    if (reason.length < 3 || reason.length > 500) return NextResponse.json({ error: 'the plan was not changed', code: 'reason' }, { status: 400 });
    if (typeof b.planId !== 'string') return NextResponse.json({ error: 'the plan was not changed', code: 'plan' }, { status: 400 });
    const run = await asLiveStaff(guard.claims, async (db) => {
      if (!(await db.query(`select 1 from schools where school_id = $1`, [params.schoolId])).rows[0]) return { ok: false as const, error: 'not_found' as const };
      return applyPlan(db, params.schoolId, b.planId, { userId: guard.claims.sub, role: guard.claims.role }, reason);
    });
    if ('refused' in run) return run.refused;
    const r = run.value;
    if (r.ok) return NextResponse.json({ ok: true, modules: r.modules.length, switchedOff: r.switchedOff.length });
    return NextResponse.json({ error: 'the plan was not changed', code: r.error === 'not_found' ? 'not_found' : r.error === 'plan retired' ? 'retired' : 'plan' }, { status: r.error === 'not_found' ? 404 : 400 });
  }
  return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
}
