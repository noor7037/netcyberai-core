import Link from 'next/link';
import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { EmptyState } from '@/components/ui/EmptyState';
import { RetryJobButton } from '@/components/control/RetryJobButton';
import { JOB_STATUSES } from '@/lib/jobs/types';
import { pipelineCounts, problemJobs } from '@/lib/jobs/pg-queue';
import { applicationCounts } from '@/lib/onboarding/applications';
import { APPLICATION_STATES, STATE_LABELS } from '@/lib/onboarding/application-machine';
import { ModulePage } from '@/components/app-ui/ModulePage';

// Monitoring, first section: the Pipeline (C97). Every job by type and
// status, jobs waiting for a retry, and dead jobs with a Retry button; then
// the school-application funnel. The PRD's other monitoring panels (pulse
// dispatch, template approvals, blocked sends, QR and OCR) come with their
// features.
export const dynamic = 'force-dynamic';

const when = (v: string) => new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default async function MonitoringPage() {
  const session = await getServerSession();
  const data = session
    ? await withTenantContext(session, async (db) => ({
        counts: await pipelineCounts(db),
        problems: await problemJobs(db),
        funnel: await applicationCounts(db),
        lastRun: (await db.query(`select max(updated_at) as at from jobs where status in ('succeeded', 'dead')`)).rows[0]?.at as string | null,
        // A school invited an email that already has an account (C98): it
        // waits for NetCyberAI to resolve with the account's owner.
        needsFounder: (
          await db.query(
            `select i.invitation_id, s.name as school_name, i.email, i.role::text as role, i.created_at
               from staff_invitations i join schools s on s.school_id = i.school_id
              where i.status = 'needs_founder' order by i.created_at desc limit 50`
          )
        ).rows,
      }))
    : { counts: [], problems: [], funnel: {} as Record<string, number>, lastRun: null, needsFounder: [] };

  const types = Array.from(new Set(data.counts.map((c) => c.type)));
  const cell = (type: string, status: string) => data.counts.find((c) => c.type === type && c.status === status);
  const retrying = data.counts.reduce((n, c) => n + Number(c.retrying), 0);

  return (
    <ModulePage
      title="Pipeline"
      purpose={`Background jobs (emails, invitations). Each is retried with growing waits, then marked dead for you to retry. ${data.lastRun ? `Last finished job: ${when(data.lastRun)}.` : 'No job has finished yet.'}`}
      icon="pulse"
      tone="emerald"
      eyebrow="Control"
    >

      <section aria-labelledby="jobs-by-status">
        <h2 id="jobs-by-status" className="mb-2 text-lg font-bold text-slate">
          Jobs by status
        </h2>
        {types.length === 0 ? (
          <EmptyState title="No jobs yet" description="Jobs appear when an application or invitation needs an email." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm text-slate">
              <thead>
                <tr className="border-b border-slate/15 text-left">
                  <th className="py-2 pr-3">Type</th>
                  {JOB_STATUSES.map((s) => (
                    <th key={s} className="py-2 pr-3 capitalize">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t} className="border-b border-slate/10">
                    <td className="py-2 pr-3 font-medium">{t}</td>
                    {JOB_STATUSES.map((s) => {
                      const c = cell(t, s);
                      return (
                        <td key={s} className={`py-2 pr-3 ${s === 'dead' && c ? 'font-bold text-red-800' : ''}`}>
                          {c?.count ?? 0}
                          {s === 'pending' && c && Number(c.retrying) > 0 ? ` (${c.retrying} retrying)` : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="problem-jobs">
        <h2 id="problem-jobs" className="mb-2 text-lg font-bold text-slate">
          Failed jobs ({data.problems.length}{retrying ? `, ${retrying} waiting for a retry` : ''})
        </h2>
        {data.problems.length === 0 ? (
          <p className="text-sm text-slate/70">Nothing failed.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.problems.map((j) => (
              <li key={j.job_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 bg-white p-3 text-sm">
                <span className="text-slate">
                  <strong>{j.type}</strong> · {j.status === 'dead' ? 'dead' : `retry at ${when(j.next_run_at)}`} · attempt {j.attempts} of {j.max_attempts}
                  <span className="block text-red-800">{j.last_error ?? 'no error recorded'}</span>
                </span>
                {j.status === 'dead' && <RetryJobButton jobId={j.job_id} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="needs-founder">
        <h2 id="needs-founder" className="mb-2 text-lg font-bold text-slate">
          Invitations that need you ({data.needsFounder.length})
        </h2>
        {data.needsFounder.length === 0 ? (
          <p className="text-sm text-slate/70">None. A school’s invitation to an email that already has a NetCyberAI account would wait here.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {data.needsFounder.map((i) => (
              <li key={i.invitation_id} className="rounded-md border border-slate/10 bg-white p-3 text-slate">
                <strong>{i.school_name}</strong> invited {i.email} as {i.role}. That email already has an account; nothing was attached.
                Confirm with the account’s owner before adding them. <span className="text-slate/70">({when(i.created_at)})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="funnel">
        <h2 id="funnel" className="mb-2 text-lg font-bold text-slate">
          School applications
        </h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {APPLICATION_STATES.map((s) => (
            <li key={s}>
              <Link href={`/control/onboarding/applications?status=${s}`} className="flex min-h-[44px] items-center gap-1 rounded-md border border-slate/10 bg-white px-3 text-slate hover:border-sapphire">
                {STATE_LABELS[s]}: <strong>{data.funnel[s] ?? 0}</strong>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </ModulePage>
  );
}
