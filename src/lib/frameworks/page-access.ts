import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import type { ModuleId } from '@/lib/contracts/modules';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { readRefusal } from '@/lib/frameworks/write-guard';

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
