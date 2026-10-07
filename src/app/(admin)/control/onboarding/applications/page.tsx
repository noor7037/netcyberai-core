import Link from 'next/link';
import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ApprovalModeToggle } from '@/components/control/ApprovalModeToggle';
import { APPLICATION_STATES, STATE_BADGE, STATE_LABELS, isApplicationState, type ApplicationState } from '@/lib/onboarding/application-machine';
import { applicationCounts, approvalMode, listApplications } from '@/lib/onboarding/applications';
import { ModulePage } from '@/components/app-ui/ModulePage';

// School applications from /register-school (C98), newest first, filtered
// by state. Each opens to its detail, decisions and history.
export const dynamic = 'force-dynamic';


export default async function ApplicationsPage({ searchParams }: { searchParams: { status?: string } }) {
  const session = await getServerSession();
  const filter = isApplicationState(searchParams.status) ? searchParams.status : null;
  const data = session
    ? await withTenantContext(session, async (db) => ({
        apps: await listApplications(db, filter),
        counts: await applicationCounts(db),
        mode: await approvalMode(db),
      }))
    : { apps: [], counts: {} as Record<string, number>, mode: 'manual' as const };

  const tab = (state: ApplicationState | null, label: string, n?: number) => (
    <Link
      key={state ?? 'all'}
      href={state ? `/control/onboarding/applications?status=${state}` : '/control/onboarding/applications'}
      aria-current={filter === state ? 'page' : undefined}
      className={`rounded-full border px-3 py-1.5 text-sm ${filter === state ? 'border-sapphire bg-sapphire/10 font-semibold text-slate' : 'border-slate/15 text-slate/80'}`}
    >
      {label}
      {n !== undefined ? ` (${n})` : ''}
    </Link>
  );

  return (
    <ModulePage
      title="School applications"
      purpose="From the public “Register your school” form: submitted, email confirmed, under review, approved, invite sent, active (the principal’s first sign-in)."
      icon="admissions"
      tone="turquoise"
      eyebrow="Onboarding"
      more={
        <Link href="/control/onboarding" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-sapphire underline">
          ← Onboarding
        </Link>
      }
    >
      <ApprovalModeToggle mode={data.mode} />
      <nav aria-label="Filter by state" className="flex flex-wrap gap-2">
        {tab(null, 'All')}
        {APPLICATION_STATES.map((s) => tab(s, STATE_LABELS[s], data.counts[s] ?? 0))}
      </nav>
      {data.apps.length === 0 ? (
        <EmptyState title="No applications here" description="Applications from /register-school appear here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.apps.map((a) => (
            <li key={a.application_id}>
              <Link
                href={`/control/onboarding/applications/${a.application_id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 bg-white p-3 hover:border-sapphire"
              >
                <span>
                  <span className="block font-medium text-slate">{a.school_name}</span>
                  <span className="block text-sm text-slate/70">
                    {a.city} · {a.board} · {a.principal_name} ·{' '}
                    {new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </span>
                <Badge variant={STATE_BADGE[a.status]}>{STATE_LABELS[a.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ModulePage>
  );
}
