import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { getServerSession } from '@/lib/auth/server-session';
import { shellForRole } from '@/lib/auth/guards';
import { OfficeDashboard } from '@/components/shell/OfficeDashboard';
import { redirect } from 'next/navigation';

// Only Office's dashboard has a specified exception-first structure
// (PRD §7.3/§4.4). The other roles' home is My Day (C136): today's work,
// computed, rather than an invented KPI layout.
export default async function DashboardPage() {
  const off = await moduleOffReason('dashboard');
  if (off) return <ModuleOffPage moduleId="dashboard" reason={off} />;
  const session = await getServerSession();
  const shell = session ? shellForRole(session.role) : null;

  if (shell === 'office' && session) {
    return <OfficeDashboard session={session} />;
  }
  redirect('/app/my-day');
}
