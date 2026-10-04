import { Icon } from '@/components/visual/Icons';
import { MODULE_GROUPS, moduleById, type ModuleId } from '@/lib/contracts/modules';
import { TOKEN_TONES } from './tones';

// The page every module route shows until the module is built (C110: a
// "coming in <phase>" page, never a 404). Everything comes from the
// registry: name, group and its tone, phase, and what the module will do.
// No counts and no dates: the phase is the only promise.
export function ComingInPhase({ moduleId }: { moduleId: ModuleId }) {
  const m = moduleById(moduleId);
  const group = MODULE_GROUPS.find((g) => g.id === m.group)!;
  const [primary] = m.tone;
  const tone = TOKEN_TONES[primary];
  return (
    <section aria-labelledby="coming-title" className="relative mx-auto flex max-w-2xl flex-col gap-4 overflow-hidden rounded-2xl border border-slate/10 bg-white p-6">
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1.5 ${tone.bar}`} />
      <div className="flex items-center gap-3">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone.solid}`}>
          <Icon name={m.icon} className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className={`text-xs font-bold uppercase tracking-wider ${tone.fg}`}>{group.label}</p>
          <h1 id="coming-title" className="text-2xl font-extrabold text-slate">
            {m.label}
          </h1>
        </div>
      </div>
      <p className={`self-start rounded-full px-3 py-1 text-sm font-bold ${tone.soft}`}>Coming in phase {m.phase}</p>
      <p className="text-sm text-slate/70">{m.phaseNote ? `${m.phaseNote}. ` : ''}This is what the module will do:</p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {m.capabilities.map((c) => (
          <li key={c} className="flex gap-2 text-sm text-slate">
            <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.bar}`} />
            {c}
          </li>
        ))}
      </ul>
    </section>
  );
}
