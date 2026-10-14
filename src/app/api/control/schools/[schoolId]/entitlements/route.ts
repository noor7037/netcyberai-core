import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { changeModuleEntitlement, changeSchoolAccess, entitlementHistory, loadEntitlements } from '@/lib/frameworks/entitlements';
import { applyPlan, listPlans } from '@/lib/frameworks/plans';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { AccessMode, PlanSummary } from '@/lib/contracts/entitlements';
import type { ModuleId } from '@/lib/contracts/modules';

// The founder's entitlement switches for one school (Control, C112).
// PUT { moduleId, enabled, limits?, reason } switches a module;
// PUT { accessMode, graceEndsAt?, reason } sets the access mode by hand.
// PUT { applyPlan, reason } puts the school on a plan: exactly that plan's
// modules (C114, C204). The plans are rows of the plans table; a retired one
// is offered only to a school already on it, and one for test schools only
// only to a test school (C219).
// Every change is audited with its reason.
export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUuid(params.schoolId)) return NextResponse.json({ error: 'school not found' }, { status: 404 });
  try {
    // ?history=1 adds who changed what, when and why, from the audit log (C123).
    const withHistory = req.nextUrl.searchParams.get('history') === '1';
    const data = await withTenantContext(guard.claims, async (db) => {
      const entitlements = await loadEntitlements(db, params.schoolId);
      const testSchool = (await db.query(`select is_test_fixture from schools where school_id = $1`, [params.schoolId])).rows[0]?.is_test_fixture === true;
      const plans: PlanSummary[] = (await listPlans(db))
        .filter((p) => (!p.retired || p.planId === entitlements.plan) && (!p.testSchoolsOnly || testSchool))
        .map((p) => ({ planId: p.planId, label: p.name, moduleIds: p.moduleIds }));
      return { entitlements, plans, ...(withHistory ? { history: await entitlementHistory(db, params.schoolId) } : {}) };
    });
    return NextResponse.json(data);
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

export async function PUT(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUuid(params.schoolId)) return NextResponse.json({ error: 'school not found' }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (typeof body !== 'object' || body === null) return NextResponse.json({ error: 'a JSON body is required' }, { status: 400 });
  const actor = { userId: guard.claims.sub, role: guard.claims.role };

  try {
    const result = await withTenantContext(guard.claims, async (db) => {
      const { rows } = await db.query(`select 1 from schools where school_id = $1`, [params.schoolId]);
      if (!rows[0]) return { ok: false as const, status: 404, error: 'school not found' };
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (typeof body.applyPlan === 'string') {
        if (reason.length < 3 || reason.length > 500) return { ok: false as const, status: 400, error: 'a reason of 3 to 500 characters is required' };
        const applied = await applyPlan(db, params.schoolId, body.applyPlan, actor, reason);
        return applied.ok ? { ok: true as const, entitlements: await loadEntitlements(db, params.schoolId) } : { ok: false as const, status: 400, error: applied.error };
      }
      const r =
        typeof body.moduleId === 'string'
          ? await changeModuleEntitlement(
              db,
              { schoolId: params.schoolId, moduleId: body.moduleId as ModuleId, enabled: body.enabled === true, limits: body.limits, reason: body.reason },
              actor
            )
          : await changeSchoolAccess(
              db,
              { schoolId: params.schoolId, accessMode: body.accessMode as AccessMode, graceEndsAt: body.graceEndsAt, reason: body.reason },
              actor
            );
      return r.ok ? { ok: true as const, entitlements: await loadEntitlements(db, params.schoolId) } : { ok: false as const, status: 400, error: r.error };
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ entitlements: result.entitlements });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
