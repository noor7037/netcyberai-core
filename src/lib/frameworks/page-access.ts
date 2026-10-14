import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import type { ModuleId } from '@/lib/contracts/modules';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { readRefusal } from '@/lib/frameworks/write-guard';
import { planHasFeature, type PlanFeature } from '@/lib/frameworks/plans';

// For a module's own page (C140): why this school may not open it
// ('module_off', 'account_paused'), or null. The page then shows the
// "module off" state in place of its screen:
//
//   const off = await moduleOffReason('attendance');
//   if (off) return <ModuleOffPage moduleId="attendance" reason={off} />;
//
// If the entitlements cannot be read the page goes ahead: its APIs are
// guarded on their own, so nothing is shown that should not be.
export async function moduleOffReason(moduleId: ModuleId): Promise<'module_off' | 'account_paused' | null> {
  const session = await getServerSession();
  if (!session?.schoolId) return null;
  const schoolId = session.schoolId;
  try {
    const entitlements = await withTenantContext(session, (db) => loadEntitlements(db, schoolId));
    const rule = readRefusal(entitlements, moduleId);
    return rule === 'module_off' || rule === 'account_paused' ? rule : null;
  } catch {
    return null;
  }
}

// For a part of a module that a plan gives or holds back (C212): true when the school's plan does not give it.
// A plan with every working module gives every feature. If the plan cannot be read the part is shown: its APIs
// ask the same question on their own, so nothing is done that the plan does not give.
export async function featureOff(feature: PlanFeature): Promise<boolean> {
  const session = await getServerSession();
  if (!session?.schoolId) return false;
  const schoolId = session.schoolId;
  try {
    return !(await withTenantContext(session, (db) => planHasFeature(db, schoolId, feature)));
  } catch {
    return false;
  }
}
