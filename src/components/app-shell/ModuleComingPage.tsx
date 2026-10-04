import { redirect } from 'next/navigation';
import { ComingInPhase } from '@/components/app-ui/ComingInPhase';
import { NoAccessState } from '@/components/app-ui/States';
import { withTenantContext, SessionRevokedError } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import type { ModuleId, SchoolRole } from '@/lib/contracts/modules';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { comingState } from './coming';

// The page at an unbuilt module's route (C121; a module route is never a
// 404): the Coming page, or the reason this person cannot use the module.
// The (school)/app layout has already checked the session.
export async function ModuleComingPage({ moduleId }: { moduleId: ModuleId }) {
  const session = await getServerSession();
  if (!session?.schoolId) redirect('/login');
  let state;
  try {
    const entitlements = await withTenantContext(session, (db) => loadEntitlements(db, session.schoolId!));
    state = comingState(session.role as SchoolRole, entitlements, moduleId);
  } catch (err) {
    if (err instanceof SessionRevokedError) redirect('/login');
    throw err;
  }
  return (
    <div className="p-4 md:p-6">
      {state === 'coming' ? <ComingInPhase moduleId={moduleId} /> : <NoAccessState reason={state} />}
    </div>
  );
}
