import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { schoolDetailTabs } from '@/lib/nav/nav-items';
import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { SchoolOnboardingPanel } from '@/components/control/SchoolOnboardingPanel';
import { SchoolEntitlements } from '@/components/control/SchoolEntitlementsPanel';
import { BoardSchoolPanel } from '@/components/control/BoardSchoolPanel';
import { SchoolAttendancePanel } from '@/components/control/SchoolAttendancePanel';
import { SchoolChecklistPanel } from '@/components/control/SchoolChecklistPanel';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { getLang } from '@/lib/i18n/server';
import { onboardingChecklist, type ChecklistItem } from '@/lib/setup/checklist';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// Prompt E fills in the real Overview tab (onboarding stage, pilot
// status, consent meter, feature flags, invite, impersonation), and
// "Modules & access" (C123) the school's plan, module switches, access mode
// and their history. The other 20 of the PRD's 21 sub-tabs (§7.2, Decision
// Log C36) stay honest EmptyStates -- their real logic belongs to later prompts.
//
// The Overview tab also shows the school's onboarding checklist (C244), counted from that school's own records by the
// same function the school's Setup screen uses. The page runs as the platform role, which reads every school, so the
// school's id is passed. If it cannot be counted the tab says so and the rest of the page is unchanged.
export default async function SchoolDetailPage({ params }: { params: { schoolId: string } }) {
  const session = await getServerSession();
  let checklist: ChecklistItem[] | null = null;
  const school =
    session && params.schoolId !== 'shell-preview'
      ? await withTenantContext(session, async (client) => {
          const { rows } = await client.query(
            `select school_id, name, onboarding_stage, is_pilot, pilot_allow_outbound
             from schools where school_id = $1`,
            [params.schoolId]
          );
          if (rows[0]) {
            await client.query('savepoint school_checklist');
            try {
              checklist = await onboardingChecklist(client, rows[0].school_id);
              await client.query('release savepoint school_checklist');
            } catch {
              await client.query('rollback to savepoint school_checklist');
            }
          }
          return rows[0] ?? null;
        })
      : null;
  const { lang } = getLang(session?.sub ?? '');

  const items: TabItem[] = schoolDetailTabs.map((tab) => {
    if (tab.id === 'overview' && school) {
      return {
        id: tab.id,
        label: tab.label,
        content: (
          <div className="flex flex-col gap-4">
            <SchoolChecklistPanel items={checklist} lang={lang} />
            <SchoolOnboardingPanel
              schoolId={school.school_id}
              initialStage={school.onboarding_stage}
              isPilot={school.is_pilot}
              pilotAllowOutbound={school.pilot_allow_outbound}
            />
          </div>
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
    if (tab.id === 'attendance' && school) return { id: tab.id, label: tab.label, content: <SchoolAttendancePanel schoolId={school.school_id} /> };
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
      <WordsProvider words={pageWords(lang, '/control/schools/[schoolId]')}>
      <Tabs items={items} orientation="vertical" />
      </WordsProvider>
    </ModulePage>
  );
}
