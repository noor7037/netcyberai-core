import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppCard, EmptyState, PageHeader } from '@/components/app-ui';
import { recentHandoffs } from '@/lib/ai/agents/events';
import { AGENTS, TURN_STEPS } from '@/lib/ai/agents/registry';

// The tutor's handoff graph (W16-A1): the agent registry, the live turn's steps in order, and the last 50 handoffs this
// server made (src/lib/ai/agents/events.ts: steps, times and counts, never a child's words). Development only, as the
// design system gallery: production answers 404, it is never prerendered and never indexed.

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tutor graph (development)', robots: { index: false, follow: false } };

const facts = (f: Record<string, number | boolean | string>) =>
  Object.entries(f)
    .map(([k, v]) => `${k} ${String(v)}`)
    .join(' · ');

export default function TutorGraph() {
  if (process.env.NODE_ENV === 'production') notFound();
  const events = recentHandoffs();
  return (
    <main className="min-h-screen bg-off-white px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <PageHeader eyebrow="Development only" title="Tutor graph" description="The tutor’s agents, the order of a live turn’s handoffs, and the last handoffs this server made." />

        <AppCard title="A live turn" description="The handoffs in the order the orchestrator makes them.">
          <ol className="flex flex-wrap gap-2">
            {TURN_STEPS.map((s, i) => (
              <li key={s.step} className="rounded-md border border-slate/10 px-3 py-2 text-sm text-slate">
                {i + 1}. {s.step} ({s.agent})
              </li>
            ))}
          </ol>
        </AppCard>

        <AppCard title="Agents" description="Each agent, whether a child waits for it, its workload and what does the work today.">
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {AGENTS.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate/10 p-3 text-sm text-slate">
                <p className="font-bold">
                  {a.id} · {a.mode}
                  {a.mode === 'job' ? ` · ${a.jobType}` : ''}
                </p>
                <p>{a.role}</p>
                <p>Workload: {a.profileId ?? 'none'}</p>
                <p>Done by: {a.implementedBy === 'pending' && 'wave' in a ? `pending (${a.wave})` : a.implementedBy}</p>
              </li>
            ))}
          </ul>
        </AppCard>

        <AppCard title="Last handoffs" description="Newest first, this server only, lost on restart.">
          {events.length === 0 ? (
            <EmptyState title="No handoffs yet" whatToDo="Ask the tutor a question in the Family app on this server, then reload." />
          ) : (
            <ul className="flex flex-col gap-1">
              {events.map((e) => (
                <li key={`${e.turn}-${e.step}`} className="break-words rounded-md border border-slate/10 px-3 py-2 text-sm text-slate">
                  <span className="font-bold">{e.step}</span> ({e.agent}) · {e.ms} ms · turn {e.turn.slice(0, 8)} · {facts(e.facts)}
                </li>
              ))}
            </ul>
          )}
        </AppCard>
      </div>
    </main>
  );
}
