import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { Badge } from '@/components/ui/Badge';
import { ApplicationActions } from '@/components/control/ApplicationActions';
import { STATE_BADGE, STATE_LABELS, founderActions } from '@/lib/onboarding/application-machine';
import { getApplication } from '@/lib/onboarding/applications';
import { INDIAN_STATES } from '@/lib/onboarding/states';
import { UUID_RE } from '@/lib/onboarding/public-http';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { getLang } from '@/lib/i18n/server';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// One application: details, decisions, the principal's invitation, the
// jobs that carry it out, and every recorded step (C98).
export const dynamic = 'force-dynamic';

const when = (v: string | null) =>
  v ? new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export default async function ApplicationPage({ params }: { params: { applicationId: string } }) {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  if (!session || !UUID_RE.test(params.applicationId)) notFound();
  const data = await withTenantContext(session, async (db) => {
    const app = await getApplication(db, params.applicationId);
    if (!app) return null;
    const history = await db.query(
      `select event_action, after_state, occurred_at from audit_log
        where target_type = 'school_applications' and target_id = $1 order by occurred_at`,
      [params.applicationId]
    );
    const invitation = app.invitation_id
      ? (
          await db.query(`select status, sends, last_sent_at, accepted_at from staff_invitations where invitation_id = $1`, [
            app.invitation_id,
          ])
        ).rows[0]
      : null;
    const jobs = await db.query(
      `select job_id, type, status, attempts, last_error, updated_at from jobs
        where idempotency_key like $1 or ($2::text is not null and idempotency_key like $2)
        order by created_at`,
      [`%:${params.applicationId}%`, app.invitation_id ? `%:${app.invitation_id}:%` : null]
    );
    return { app, history: history.rows, invitation, jobs: jobs.rows };
  });
  if (!data) notFound();
  const { app, history, invitation, jobs } = data;
  const stateName = INDIAN_STATES.find((s) => s.code === app.state_code)?.name ?? app.state_code;

  return (
    <ModulePage
      title={app.school_name}
      purpose="Details, your decision and what has happened."
      icon="admissions"
      tone="turquoise"
      eyebrow="School application"
      more={
        <>
          <Link href="/control/onboarding/applications" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-sapphire underline">
            ← School applications
          </Link>
          <Badge variant={STATE_BADGE[app.status]}>{STATE_LABELS[app.status]}</Badge>
        </>
      }
    >
      <WordsProvider words={pageWords(lang, '/control/onboarding/applications/[applicationId]')}>
      <dl className="grid grid-cols-1 gap-3 rounded-md border border-slate/10 bg-white p-4 text-sm sm:grid-cols-2">
        {[
          ['City', `${app.city}, ${stateName}`],
          ['Board', app.board],
          ['Students (approx.)', app.approx_students?.toString() ?? '—'],
          ['Principal', app.principal_name],
          ['Email', `${app.email}${app.email_verified_at ? ' (confirmed)' : ' (not confirmed)'}`],
          ['Mobile', app.mobile],
          ['Received', when(app.created_at)],
          ['Decided', when(app.reviewed_at)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate/70">{k}</dt>
            <dd className="text-slate">{v}</dd>
          </div>
        ))}
        {app.decision_reason && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate/70">Reason</dt>
            <dd className="text-slate">{app.decision_reason}</dd>
          </div>
        )}
      </dl>

      <ApplicationActions
        applicationId={app.application_id}
        actions={founderActions(app.status) as ('start_review' | 'approve' | 'reject')[]}
        canResend={app.status === 'provisioned' || (app.status === 'approved' && !!invitation)}
      />

      {app.school_id && (
        <p className="text-sm text-slate">
          School created:{' '}
          <Link href={`/control/schools/${app.school_id}`} className="text-sapphire underline">
            open school
          </Link>
          {invitation && (
            <>
              {' '}
              · Principal invitation: <strong>{invitation.status}</strong>, sent {invitation.sends} time(s), last {when(invitation.last_sent_at)}
            </>
          )}
        </p>
      )}

      <section>
        <h2 className="mb-2 text-lg font-bold text-slate">Jobs</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-slate/70">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {jobs.map((j) => (
              <li key={j.job_id} className="rounded border border-slate/10 bg-white px-3 py-2 text-slate">
                <strong>{j.type}</strong> · {j.status} · attempts {j.attempts} · {when(j.updated_at)}
                {j.last_error && <span className="block text-red-800">{j.last_error}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold text-slate">History</h2>
        {history.length === 0 && <p className="text-sm text-slate/70">No recorded steps.</p>}
        <ol className="flex flex-col gap-1 text-sm text-slate">
          {history.map((h, i) => (
            <li key={i}>
              {when(h.occurred_at)} · {String(h.event_action).replace('school_application.', '')}
              {h.after_state?.to ? ` → ${h.after_state.to}` : ''}
            </li>
          ))}
        </ol>
      </section>
      </WordsProvider>
    </ModulePage>
  );
}
