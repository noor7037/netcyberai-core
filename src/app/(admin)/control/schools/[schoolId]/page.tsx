import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { schoolDetailTabs } from '@/lib/nav/nav-items';
import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { SchoolOnboardingPanel } from '@/components/control/SchoolOnboardingPanel';

// Prompt E fills in the real Overview tab (onboarding stage, pilot
// status, consent meter, feature flags, invite, impersonation). The
// other 20 of the PRD's 21 sub-tabs (§7.2, Decision Log C36) stay
// honest EmptyStates -- their real logic belongs to later prompts.
export default async function SchoolDetailPage({ params }: { params: { schoolId: string } }) {
  const session = await getServerSession();
  const school =
    session && params.schoolId !== 'shell-preview'
      ? await withTenantContext(session, async (client) => {
          const { rows } = await client.query(
            `select school_id, name, onboarding_stage, is_pilot, pilot_allow_outbound
             from schools where school_id = $1`,
            [params.schoolId]
          );
          return rows[0] ?? null;
        })
      : null;

  const items: TabItem[] = schoolDetailTabs.map((tab) => {
    if (tab.id === 'overview' && school) {
      return {
        id: tab.id,
        label: tab.label,
        content: (
          <SchoolOnboardingPanel
            schoolId={school.school_id}
            initialStage={school.onboarding_stage}
            isPilot={school.is_pilot}
            pilotAllowOutbound={school.pilot_allow_outbound}
          />
        ),
      };
    }
    return {
      id: tab.id,
      label: tab.label,
      content: (
        <EmptyState
          title="Not built yet"
          description={`${tab.label} data for this school will appear here once real data is wired in.`}
        />
      ),
    };
  });

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-1 text-xl font-bold text-slate">{school ? school.name : 'School detail'}</h1>
      <p className="mb-4 text-sm text-slate/70">
        {params.schoolId === 'shell-preview'
          ? 'Shell preview -- no real school exists behind this id yet.'
          : school
            ? `School id: ${params.schoolId}`
            : `No school found for id: ${params.schoolId}`}
      </p>
      <Tabs items={items} />
    </div>
  );
}
