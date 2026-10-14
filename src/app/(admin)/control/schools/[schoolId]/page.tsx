import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { schoolDetailTabs } from '@/lib/nav/nav-items';
import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { SchoolOnboardingPanel } from '@/components/control/SchoolOnboardingPanel';
import { SchoolEntitlements } from '@/components/control/SchoolEntitlementsPanel';
import { BoardSchoolPanel } from '@/components/control/BoardSchoolPanel';
import { ModulePage } from '@/components/app-ui/ModulePage';

// Prompt E fills in the real Overview tab (onboarding stage, pilot
// status, consent meter, feature flags, invite, impersonation), and
// "Modules & access" (C123) the school's plan, module switches, access mode
// and their history. The other 20 of the PRD's 21 sub-tabs (§7.2, Decision
// Log C36) stay honest EmptyStates -- their real logic belongs to later prompts.
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
    if (tab.id === 'modules-access' && school) {
      return { id: tab.id, label: tab.label, content: <SchoolEntitlements schoolId={school.school_id} /> };
    }
    // The board the school records (C213); its grading scheme is the school's own, on its Exams screen.
    if (tab.id === 'exams' && school) {
      return { id: tab.id, label: tab.label, content: <BoardSchoolPanel schoolId={school.school_id} /> };
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
    <ModulePage
      title={school ? school.name : 'School detail'}
      purpose={params.schoolId === 'shell-preview' ? 'Shell preview: no real school exists behind this id yet.' : school ? `School id: ${params.schoolId}` : `No school found for id: ${params.schoolId}`}
      icon="school"
      tone="sapphire"
      eyebrow="School"
    >
      <Tabs items={items} orientation="vertical" />
    </ModulePage>
  );
}
