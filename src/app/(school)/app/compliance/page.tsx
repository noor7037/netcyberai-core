import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { EmptyState } from '@/components/ui/EmptyState';
import { ComplianceView } from '@/components/compliance/ComplianceView';
import { ModulePage } from '@/components/app-ui/ModulePage';

// Task 5, PRD §2.3: impersonation must be "visible to the impersonated
// school" -- this is that visibility. audit_log's own
// audit_read_own_school RLS policy already scopes this correctly to
// the caller's own tenant; nothing here widens that.
export default async function CompliancePage() {
  const session = await getServerSession();
  const events = session
    ? await withTenantContext(session, async (client) => {
        const { rows } = await client.query(
          `select occurred_at, event_action, target_id, after_state
           from audit_log
           where school_id = $1 and event_action in ('ImpersonationStarted', 'ImpersonationEnded')
           order by occurred_at desc
           limit 50`,
          [session.schoolId]
        );
        return rows;
      })
    : [];

  return (
    <ModulePage moduleId="compliance" tour="compliance" title="Compliance" purpose="Consent, data requests, and every time NetCyberAI staff looked at your school’s data.">
      <ComplianceView canManage={session?.role === 'school_admin' || session?.role === 'principal'} />
      <section>
        <h2 className="mb-2 text-lg font-bold text-slate">Support access to this school</h2>
        <p className="mb-3 text-sm text-slate/70">
          Every time NetCyberAI staff view your school's data on your behalf, it appears here -- time-boxed, with the
          reason recorded before access was granted. Support access you cannot see is not support.
        </p>
        {events.length === 0 ? (
          <EmptyState title="No support access on record" description="Nothing to show yet." />
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((e, i) => (
              <li key={i} className="rounded-md border border-slate/10 p-3 text-sm text-slate">
                <span className="font-medium">{e.event_action}</span> — {new Date(e.occurred_at).toLocaleString()}
                {e.after_state?.reason && <p className="text-slate/70">Reason: {e.after_state.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </ModulePage>
  );
}
