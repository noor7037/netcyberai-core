import { getServerSession } from '@/lib/auth/server-session';
import { shellForRole } from '@/lib/auth/guards';
import { OfficeDashboard } from '@/components/shell/OfficeDashboard';
import { StubPage } from '@/components/shell/StubPage';

// Only Office's dashboard has a specified exception-first structure
// (PRD §7.3/§4.4). Finance and Academic's dashboards aren't specified
// beyond their device priority -- a generic stub for those two,
// flagged, rather than an invented KPI layout.
export default async function DashboardPage() {
  const session = await getServerSession();
  const shell = session ? shellForRole(session.role) : null;

  if (shell === 'office') {
    return <OfficeDashboard />;
  }
  return (
    <StubPage
      title="Dashboard"
      description="[GAP] Not specified in the PRD beyond this shell's device priority -- a generic placeholder until that's decided."
    />
  );
}
