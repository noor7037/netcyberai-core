import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { featureOff, moduleOffReason } from '@/lib/frameworks/page-access';
import { getServerSession } from '@/lib/auth/server-session';
import { shellForRole } from '@/lib/auth/guards';
import { OfficeDashboard } from '@/components/shell/OfficeDashboard';
import { getLang } from '@/lib/i18n/server';
import { DEFAULT_RANGE, isRangeId } from '@/lib/insights/screens';
import { redirect } from 'next/navigation';

// The dashboard is the office's (docs/26 §5): the principal and the school
// admin. Every other role's home is My Day (C136): today's work, computed.
// ?range=today|7d|30d chooses the days; anything else is today.
export const dynamic = 'force-dynamic';

export default async function DashboardPage({ searchParams }: { searchParams: { range?: string } }) {
  const off = await moduleOffReason('dashboard');
  if (off) return <ModuleOffPage moduleId="dashboard" reason={off} />;
  const session = await getServerSession();
  const shell = session ? shellForRole(session.role) : null;

  // The office's dashboard is a part of the plan (C212: 'principal-dashboard', Growth and Compass); without it the
  // office's home is My Day, as every other role's is.
  if (shell === 'office' && session && !(await featureOff('principal-dashboard'))) {
    return <OfficeDashboard session={session} rangeId={isRangeId(searchParams.range) ? searchParams.range : DEFAULT_RANGE} lang={getLang(session.sub).lang} />;
  }
  redirect('/app/my-day');
}
