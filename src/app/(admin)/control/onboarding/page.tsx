import Link from 'next/link';
import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { CreateSchoolForm } from '@/components/control/CreateSchoolForm';
import { EmptyState } from '@/components/ui/EmptyState';

const STAGE_LABELS: Record<string, string> = {
  tenant_created: 'Tenant Created',
  admin_invited: 'Admin Invited',
  data_imported: 'Data Imported',
  data_validated: 'Data Validated',
  consent_collection: 'Consent Collection',
  configuration: 'Configuration',
  training: 'Training',
  pilot_outbound_approved: 'Pilot Outbound Approved',
  go_live: 'Go-Live',
};

export default async function OnboardingPage() {
  const session = await getServerSession();
  // canAccessControl already gated this whole route group at the layout
  // (Prompt D) -- session is real and super_admin by construction here.
  const inProgress = session
    ? await withTenantContext(session, async (client) => {
        const { rows } = await client.query(
          `select school_id, name, onboarding_stage, onboarding_stage_updated_at
           from schools where onboarding_stage <> 'go_live' order by onboarding_stage_updated_at desc`
        );
        return rows;
      })
    : [];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="mb-1 text-xl font-bold text-slate">Onboarding</h1>
        <p className="text-sm text-slate/70">
          Lead → Approved → Tenant Created → Admin Invited → Data Imported → Data Validated →{' '}
          <strong className="text-slate">Consent Collection (a gate, not a checkbox)</strong> → Configuration →
          Training → Pilot Outbound Approved → Go-Live.
        </p>
      </div>

      <CreateSchoolForm />

      <div>
        <h2 className="mb-3 text-lg font-bold text-slate">In the pipeline</h2>
        {inProgress.length === 0 ? (
          <EmptyState title="Nothing in the pipeline" description="Create a school above to start onboarding." />
        ) : (
          <ul className="flex flex-col gap-2">
            {inProgress.map((s) => (
              <li key={s.school_id} className="flex items-center justify-between rounded-md border border-slate/10 p-3">
                <div>
                  <p className="font-medium text-slate">{s.name}</p>
                  <p className="text-sm text-slate/70">{STAGE_LABELS[s.onboarding_stage] ?? s.onboarding_stage}</p>
                </div>
                <Link href={`/control/schools/${s.school_id}`} className="text-sm font-medium text-sapphire underline">
                  Manage →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
