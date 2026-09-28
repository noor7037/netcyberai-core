import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/visual/Icons';
import { NETCYBERAI_UNLOCKS, TRIAL_CTA, type FreeToolKind } from '@/content/free-tools';

// The free tool stays fully usable without a login; these are the jobs
// only the full platform does, shown locked with the trial call to action.
export function LockedFeatures({ kind, compact = false }: { kind: FreeToolKind; compact?: boolean }) {
  const u = NETCYBERAI_UNLOCKS[kind];
  const items = u.items;
  return (
    <section aria-label={u.title} className={`rounded-3xl border-2 border-dashed border-royal/40 bg-white ${compact ? 'p-5' : 'p-6 sm:p-8'}`}>
      <div className="flex flex-col gap-1">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-royal/10 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-royal-deep">
          <Icon name="lock" className="h-3.5 w-3.5" /> {u.title}
        </p>
        <h2 className={`font-extrabold text-slate ${compact ? 'text-lg' : 'text-2xl'}`}>
          {kind === 'certificate' ? 'Want this done for every student, automatically?' : 'Want this to run by itself, every day?'}
        </h2>
      </div>
      <ul className={`mt-4 grid grid-cols-1 gap-3 ${compact ? '' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        {items.map((it) => (
          <li key={it.title} className="flex gap-3 rounded-2xl bg-off-white p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sapphire text-white">
              <Icon name="lock" className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <b className="block text-sm text-slate">{it.title}</b>
              <span className="block text-sm text-slate/70">{it.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate/70">Ask us which parts are live for your school today.</p>
        <Button href={TRIAL_CTA.href} variant="secondary" className="shrink-0">
          Book your free trial to unlock <Icon name="arrow" className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
