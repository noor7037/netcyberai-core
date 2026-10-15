import Link from 'next/link';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { ModuleIcon } from '@/components/app-ui/ModuleIcon';
import { isAlwaysOn, isModuleEnabled, type SchoolEntitlements } from '@/lib/contracts/entitlements';
import { MODULE_GROUPS, MODULE_REGISTRY, type ModuleDefinition } from '@/lib/contracts/modules';
import { isMessageKey, t, tOr, type Lang } from '@/lib/i18n';
import { moduleOffSentence, needsOwnSentence } from '@/lib/i18n/module-off';

// The school's modules, on its own Settings page (docs/19 rule 7, C139):
// what is on, what is off, and one plain sentence on what "off" changes and
// for whom. The switches themselves are turned by NetCyberAI (the founder
// rule of C112: a school's entitlements change only in Control, and every
// change is audited), so this list shows the state and how to ask.
// C235-C: each row shows the module and its state; what "off" changes is
// behind the row's ⓘ, and the list's own explanation behind the title's.
export function ModuleSwitchList({ entitlements, lang }: { entitlements: SchoolEntitlements; lang: Lang }) {
  const groups = [...MODULE_GROUPS].sort((a, b) => a.order - b.order);
  // What exists today comes first; what is not built yet is one tap away, so the page stays short.
  // A module with a sentence of its own has a working part today, whatever its status says.
  const hasOwn = (m: ModuleDefinition) => needsOwnSentence(m) || isMessageKey(`moduleOff.${m.id}`);
  const built = MODULE_REGISTRY.filter(hasOwn);
  const later = MODULE_REGISTRY.filter((m) => !hasOwn(m));

  const row = (m: ModuleDefinition) => {
    const g = groups.find((x) => x.id === m.group)!;
    const always = isAlwaysOn(m.id);
    const on = isModuleEnabled(entitlements, m.id);
    return (
      <li key={m.id} data-module={m.id} data-on={on} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
        <ModuleIcon name={m.icon} tone={g.tone[0]} size="sm" />
        <p className="min-w-0 flex-1 text-sm font-semibold text-slate">{tOr(lang, `module.${m.id}`, m.label)}</p>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${on ? 'bg-emerald/10 text-slate' : 'bg-slate/10 text-slate'}`}>{t(lang, always ? 'modules.always' : on ? 'modules.on' : 'modules.off')}</span>
        <InfoTip label={tOr(lang, `module.${m.id}`, m.label)}>
          {!always && <span className="font-semibold">{t(lang, 'modules.whenOff')} </span>}
          {moduleOffSentence(lang, m)}
        </InfoTip>
      </li>
    );
  };

  return (
    <section lang={lang} aria-labelledby="modules-title" data-module-switches className="flex flex-col gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 id="modules-title" className="text-lg font-bold text-slate">
            {t(lang, 'modules.title')}
          </h2>
          <InfoTip>
            {t(lang, 'modules.intro')} {t(lang, 'modules.ask')}
          </InfoTip>
        </div>
        {entitlements.accessMode === 'suspended' && <p className="mt-2 max-w-prose rounded-md bg-tangerine/10 px-3 py-2 text-sm font-semibold text-slate">{t(lang, 'modules.paused')}</p>}
        {entitlements.accessMode === 'read_only' && <p className="mt-2 max-w-prose rounded-md bg-tangerine/10 px-3 py-2 text-sm font-semibold text-slate">{t(lang, 'modules.readOnly')}</p>}
      </div>
      {groups
        .filter((g) => built.some((m) => m.group === g.id))
        .map((g) => (
          <div key={g.id} className="rounded-xl border border-slate/10 bg-white p-3">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate/70">{tOr(lang, `group.${g.id}`, g.label)}</h3>
            <ul className="flex flex-col divide-y divide-slate/10">{built.filter((m) => m.group === g.id).map(row)}</ul>
          </div>
        ))}
      {later.length > 0 && (
        <details className="rounded-xl border border-slate/10 bg-white p-3">
          <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-semibold text-sapphire underline">{t(lang, 'modules.later', { count: later.length })}</summary>
          <ul className="flex flex-col divide-y divide-slate/10">{later.map(row)}</ul>
        </details>
      )}
      <p className="flex flex-wrap items-center gap-3 text-sm text-slate">
        <Link href="/app/help/ticket/new" className="inline-flex min-h-[44px] items-center rounded-md border border-sapphire bg-white px-4 text-sm font-semibold text-sapphire">
          {t(lang, 'modules.askAction')}
        </Link>
      </p>
    </section>
  );
}
