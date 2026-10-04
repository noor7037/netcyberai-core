import { getServerSession } from '@/lib/auth/server-session';
import { shellForRole } from '@/lib/auth/guards';
import { OfficeDashboard } from '@/components/shell/OfficeDashboard';
import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';

// Only Office's dashboard has a specified exception-first structure
// (PRD §7.3/§4.4). The other roles see the module's Coming page until
// their dashboards are built, rather than an invented KPI layout.
export default async function DashboardPage() {
  const session = await getServerSession();
  const shell = session ? shellForRole(session.role) : null;

  if (shell === 'office' && session) {
    return <OfficeDashboard session={session} />;
  }
  // The other roles' dashboards arrive with the module (C121).
  return <ModuleComingPage moduleId="dashboard" />;
}
