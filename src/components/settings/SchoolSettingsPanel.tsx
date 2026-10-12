'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/app-shell/LangContext';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { ModuleId } from '@/lib/contracts/modules';
import type { SettingDefinition, SettingValue } from '@/lib/contracts/settings';
import { colors } from '@/lib/design-tokens';
import type { MessageKey } from '@/lib/i18n';

// The school's settings, generated from every module's schema (17 §1a,
// C166): one card per module, each field with its plain sentence, its
// default and "Reset to default". Nothing here is hand-built for a module:
// a field added to a schema appears by itself. Saving goes through the
// settings API, which checks the module, the role and the value, keeps the
// history and writes the audit row.

export type SettingsModule = { moduleId: ModuleId; revision: number; fields: { def: SettingDefinition; value: SettingValue; isDefault: boolean; mayEdit: boolean }[] };

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function ModuleCard({ module }: { module: SettingsModule }) {
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();
  const [values, setValues] = useState<Record<string, SettingValue>>(() => Object.fromEntries(module.fields.map((f) => [f.def.key, f.value])));
  const [busy, setBusy] = useState(false);
  const key = (f: SettingDefinition, part: 'label' | 'help') => `set.${module.moduleId}.${f.key}.${part}` as MessageKey;
  const mayEditAny = module.fields.some((f) => f.mayEdit);
  const changed = module.fields.filter((f) => f.mayEdit && !same(values[f.def.key], f.value));

  async function send(body: Record<string, unknown>, done: MessageKey) {
    setBusy(true);
    const res = await fetch(`/api/app/settings/${module.moduleId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRevision: module.revision, ...body }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) toast.show(t(done), 'success');
    else toast.show(t(res?.status === 409 ? 'set.stale' : res?.status === 403 ? 'set.notAllowed' : res?.status === 400 ? 'set.invalid' : 'set.failed'), 'danger');
    // The page is read again either way: it then shows what is really stored.
    router.refresh();
  }

  const show = (f: SettingDefinition, v: SettingValue): string => {
    if (typeof v === 'boolean') return t(v ? 'set.on' : 'set.off');
    if (f.type === 'weekdays' && Array.isArray(v)) return (v as string[]).map((d) => t(`tt.day.${d}` as MessageKey)).join(', ');
    return String(v);
  };

  function control(f: SettingDefinition, mayEdit: boolean) {
    const id = `set-${module.moduleId}-${f.key}`;
    const v = values[f.key];
    const set = (next: SettingValue) => setValues((all) => ({ ...all, [f.key]: next }));
    const label = t(key(f, 'label'));
    if (f.type === 'boolean')
      return (
        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-semibold text-slate">
          <input id={id} type="checkbox" role="switch" className="h-5 w-5" checked={v === true} disabled={!mayEdit || busy} onChange={(e) => set(e.target.checked)} />
          {label}: {t(v === true ? 'set.on' : 'set.off')}
        </label>
      );
    if (f.type === 'weekdays')
      return (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-semibold text-slate">{label}</legend>
          <div className="flex flex-wrap gap-x-4">
            {DAYS.map((d) => (
              <label key={d} className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate">
                <input type="checkbox" className="h-5 w-5" checked={Array.isArray(v) && (v as string[]).includes(d)} disabled={!mayEdit || busy} onChange={(e) => set(DAYS.filter((x) => (x === d ? e.target.checked : Array.isArray(v) && (v as string[]).includes(x))))} />
                {t(`tt.day.${d}` as MessageKey)}
              </label>
            ))}
          </div>
        </fieldset>
      );
    if (f.type === 'select' || f.type === 'color_token')
      return (
        <Select id={id} label={label} value={String(v)} disabled={!mayEdit || busy} onChange={(e) => set(e.target.value)}>
          {(f.type === 'select' ? (f.options ?? []).map((o) => o.value) : Object.keys(colors)).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
    if (f.type === 'number') return <Input id={id} label={label} type="number" inputMode="numeric" min={f.min} max={f.max} value={String(v)} disabled={!mayEdit || busy} onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))} />;
    if (f.type === 'text' || f.type === 'numbering' || f.type === 'time' || f.type === 'date')
      return <Input id={id} label={label} type={f.type === 'time' ? 'time' : f.type === 'date' ? 'date' : 'text'} value={String(v)} disabled={!mayEdit || busy} onChange={(e) => set(e.target.value)} />;
    // A list or a many-choice setting has no editor on this screen yet: it is shown, not changed.
    return (
      <p className="text-sm text-slate">
        <span className="font-semibold">{label}:</span> {show(f, v)}
      </p>
    );
  }

  return (
    <section data-settings-module={module.moduleId} className="flex flex-col gap-4 rounded-lg border border-slate/10 bg-white p-4">
      <h3 className="text-base font-bold text-slate">{t(`module.${module.moduleId}` as MessageKey)}</h3>
      {module.fields.map(({ def, isDefault, mayEdit }) => (
        <div key={def.key} data-setting={def.key} className="flex flex-col gap-1 border-t border-slate/10 pt-3">
          {control(def, mayEdit)}
          <p className="text-sm text-slate/70">{t(key(def, 'help'))}</p>
          <p className="flex flex-wrap items-center gap-3 text-xs text-slate/70">
            <span>{t('set.default', { value: show(def, def.default) })}</span>
            {isDefault ? (
              <span data-is-default>{t('set.isDefault')}</span>
            ) : (
              mayEdit && (
                <button type="button" data-reset disabled={busy} className="min-h-[44px] font-semibold text-sapphire underline disabled:opacity-60" onClick={() => void send({ resetToDefault: [def.key] }, 'set.reset.done')}>
                  {t('set.reset')}
                </button>
              )
            )}
          </p>
        </div>
      ))}
      {mayEditAny ? (
        <button type="button" data-save-settings disabled={busy || changed.length === 0} className={`${PRIMARY} self-start`} onClick={() => void send({ set: Object.fromEntries(changed.map((f) => [f.def.key, values[f.def.key]])) }, 'set.saved')}>
          {t('set.save')}
        </button>
      ) : (
        <p className="text-sm text-slate/70">{t('set.readOnly')}</p>
      )}
    </section>
  );
}

export function SchoolSettingsPanel({ modules }: { modules: SettingsModule[] }) {
  const { t, lang } = useT();
  if (modules.length === 0) return null;
  return (
    <section lang={lang} data-school-settings className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-slate">{t('set.title')}</h2>
        <p className="text-sm text-slate/70">{t('set.how')}</p>
      </div>
      {/* The key holds the revision: after a save the card starts again from what is stored. */}
      {modules.map((m) => (
        <ModuleCard key={`${m.moduleId}:${m.revision}:${JSON.stringify(m.fields.map((f) => f.value))}`} module={m} />
      ))}
    </section>
  );
}
