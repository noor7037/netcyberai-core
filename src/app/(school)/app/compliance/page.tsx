import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { ComplianceView } from '@/components/compliance/ComplianceView';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { TeachEmpty } from '@/components/app-ui/TeachEmpty';
import { Badge } from '@/components/ui/Badge';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Task 5, PRD §2.3: impersonation must be "visible to the impersonated
// school" -- this is that visibility. audit_log's own
// audit_read_own_school RLS policy already scopes this correctly to
// the caller's own tenant; nothing here widens that.
export default async function CompliancePage() {
  const off = await moduleOffReason('compliance');
  if (off) return <ModuleOffPage moduleId="compliance" reason={off} />;
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
  // What was done in this school's app while NetCyberAI was viewing it as one of its people (C165, C180). Each
  // such row carries who was really acting (audit_log.impersonated_by); the school sees every one of them, marked.
  const viewed = session
    ? await withTenantContext(session, async (client) => {
        const { rows } = await client.query(
          `select a.occurred_at, a.event_action, a.target_type, u.display_name as as_name, a.actor_role
             from audit_log a left join users u on u.user_id = a.actor_user_id
            where a.school_id = $1 and a.impersonated_by is not null and a.event_action not in ('ImpersonationStarted', 'ImpersonationEnded')
            order by a.occurred_at desc limit 50`,
          [session.schoolId]
        );
        return rows as { occurred_at: string; event_action: string; target_type: string | null; as_name: string | null; actor_role: string | null }[];
      })
    : [];
  const { lang } = getLang(session?.sub ?? '');
  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

  return (
    <ModulePage
      moduleId="compliance"
      help="compliance-screen"
      tour="compliance"
      title="Compliance"
      purpose="Fee notice rules for your state, how long records are kept, and every time NetCyberAI staff looked at your school’s data."
      primary={
        // The compliance desk (C227): teacher qualifications and TET, the public disclosure, Form 6 and SQAAF.
        <a href="/app/compliance/desk" data-compliance-desk-link className="inline-flex min-h-[44px] items-center rounded-md bg-sapphire px-5 text-sm font-semibold text-white">
          {t(lang, 'cdk.link')}
        </a>
      }
    >
      <ComplianceView canManage={session?.role === 'school_admin' || session?.role === 'principal'} />
      <section>
        <h2 className="mb-2 text-lg font-bold text-slate">Support access to this school</h2>
        <p className="mb-3 text-sm text-slate/70">
          Every time NetCyberAI staff view your school's data on your behalf, it appears here -- time-boxed, with the
          reason recorded before access was granted. Support access you cannot see is not support.
        </p>
        {events.length === 0 ? (
          <TeachEmpty id="support-access" />
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
      <section lang={lang} data-viewed-by-founder className="mt-6">
        <h2 className="mb-2 text-lg font-bold text-slate">{t(lang, 'viewed.title')}</h2>
        <p className="mb-3 text-sm text-slate/70">{t(lang, 'viewed.how')}</p>
        {viewed.length === 0 ? (
          <p className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t(lang, 'viewed.none')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {viewed.map((e, i) => (
              <li key={i} data-viewed-row className="flex flex-wrap items-center gap-2 rounded-md border border-slate/10 p-3 text-sm text-slate">
                <Badge variant="warning">{t(lang, 'viewed.mark')}</Badge>
                {/* ui-strings: not words -- the action's own code, as the audit trail records it */}
                <code className="font-semibold">{e.event_action}</code>
                <span>{t(lang, 'viewed.row', { name: e.as_name ?? '', when: when.format(new Date(e.occurred_at)) })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </ModulePage>
  );
}
