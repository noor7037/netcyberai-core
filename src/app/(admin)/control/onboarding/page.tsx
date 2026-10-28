import Link from 'next/link';
import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { CreateSchoolForm } from '@/components/control/CreateSchoolForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

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

const LEAD_STATUS_VARIANT: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  new: 'warning',
  contacted: 'neutral',
  qualified: 'neutral',
  converted: 'success',
  rejected: 'danger',
  duplicate: 'neutral',
};

const SOURCE_LABELS: Record<string, string> = {
  get_started: 'Get Started',
  book_demo: 'Book Demo',
  start_pilot: 'Start a Pilot',
  contact: 'Contact',
  callback: 'Callback request',
  quote: 'Quote request',
  free_tools: 'Free tools account',
};
export default async function OnboardingPage() {
  const session = await getServerSession();
  const lang = session ? getLang(session.sub).lang : 'en';
  // canAccessControl already gated this whole route group at the layout
  // (Prompt D) -- session is real and super_admin by construction here.
  const { inProgress, leads } = session
    ? await withTenantContext(session, async (client) => {
        const [schoolsRes, leadsRes] = await Promise.all([
          client.query(
            `select school_id, name, onboarding_stage, onboarding_stage_updated_at
             from schools where onboarding_stage <> 'go_live' order by onboarding_stage_updated_at desc`
          ),
          client.query(
            `select lead_id, source, school_name, contact_name, contact_phone, status, created_at
             from leads order by created_at desc limit 20`
          ),
        ]);
        return { inProgress: schoolsRes.rows, leads: leadsRes.rows };
      })
    : { inProgress: [], leads: [] };

  return (
    <ModulePage title="Onboarding" purpose="Bring a school on, step by step." icon="admissions" tone="turquoise" eyebrow="Control">

      <Link
        href="/control/onboarding/provision"
        data-provision-link
        className="flex min-h-[44px] items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-sapphire to-royal p-4 text-off-white shadow-sm motion-safe:transition motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-md"
      >
        <span>
          <span className="block font-semibold">{t(lang, 'control.provision.link.title')}</span>
          <span className="block text-sm">{t(lang, 'control.provision.link.lead')}</span>
        </span>
        <span className="text-sm font-semibold underline">{t(lang, 'control.provision.link.open')}</span>
      </Link>

      <Link
        href="/control/onboarding/applications"
        className="flex items-center justify-between rounded-md border border-sapphire/30 bg-sapphire/5 p-4 text-slate hover:border-sapphire"
      >
        <span>
          <span className="block font-semibold">School applications</span>
          <span className="block text-sm text-slate/70">Review, approve or reject.</span>
        </span>
        <span className="text-sm font-medium text-sapphire underline">Open →</span>
      </Link>

      <CreateSchoolForm />

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-x-1">
          <h2 className="text-lg font-bold text-slate">In the pipeline</h2>
          <InfoTip>
            Lead → Approved → Tenant Created → Admin Invited → Data Imported → Data Validated →{' '}
            <strong className="text-slate">Consent Collection (a gate, not a checkbox)</strong> → Configuration → Training → Pilot Outbound Approved → Go-Live.
          </InfoTip>
        </div>
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
                <Link href={`/control/schools/${s.school_id}`} className="inline-flex min-h-[44px] items-center text-sm font-medium text-sapphire underline">
                  Manage →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-x-1">
          <h2 className="text-lg font-bold text-slate">Recent leads</h2>
          <InfoTip>Real submissions from the public Get Started and Book Demo forms.</InfoTip>
        </div>
        {leads.length === 0 ? (
          <EmptyState title="No leads yet" description="Submissions from Get Started / Book Demo will appear here." />
        ) : (
          <ul className="flex flex-col gap-2">
            {leads.map((l) => (
              <li key={l.lead_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 p-3">
                <div>
                  <p className="font-medium text-slate">
                    {l.school_name} <span className="font-normal text-slate/70">— {l.contact_name}</span>
                  </p>
                  <p className="text-sm text-slate/70">
                    {l.contact_phone} · {SOURCE_LABELS[l.source] ?? l.source} ·{' '}
                    {new Date(l.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <Badge variant={LEAD_STATUS_VARIANT[l.status] ?? 'neutral'}>{l.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModulePage>
  );
}
