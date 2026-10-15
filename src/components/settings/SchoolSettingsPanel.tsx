'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
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
// C235-C: a field shows its control and its state (a "Default" mark, or the
// default it differs from with "Reset to default"); its sentence and its
// default are behind the field's ⓘ.

// `value` is null for a field with no default that the school has not set yet (C231).
export type SettingsModule = { moduleId: ModuleId; revision: number; fields: { def: SettingDefinition; value: SettingValue | null; isDefault: boolean; mayEdit: boolean }[] };

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function ModuleCard({ module }: { module: SettingsModule }) {
  const { t, lang } = useT();
  const toast = useToast();
  const router = useRouter();
  // A field not set yet starts empty (C231): nothing is filled in for the school.
  const [values, setValues] = useState<Record<string, SettingValue>>(() => Object.fromEntries(module.fields.map((f) => [f.def.key, f.value ?? ''])));
  const [busy, setBusy] = useState(false);
  const key = (f: SettingDefinition, part: 'label' | 'help') => `set.${module.moduleId}.${f.key}.${part}` as MessageKey;
  const mayEditAny = module.fields.some((f) => f.mayEdit);
  const changed = module.fields.filter((f) => f.mayEdit && !same(values[f.def.key], f.value ?? ''));

  async function send(body: Record<string, unknown>, done: MessageKey) {
    setBusy(true);
    const res = await fetch(`/api/app/settings/${module.moduleId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRevision: module.revision, ...body }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) toast.show(t(done), 'success');
    else toast.show(t(res?.status === 409 ? 'set.stale' : res?.status === 403 ? 'set.notAllowed' : res?.status === 400 ? 'set.invalid' : 'set.failed'), 'danger');
    // The page is read again either way: it then shows what is really stored.
    router.refresh();
  }

  // The change history of this part (C180): read when it is opened, newest first.
  type Change = { key: string; from: SettingValue | null; to: SettingValue | null; changedByName?: string | null; changedAt: string };
  const [history, setHistory] = useState<Change[] | 'loading' | 'failed' | null>(null);
  async function openHistory(open: boolean) {
    if (!open || Array.isArray(history) || history === 'loading') return;
    setHistory('loading');
    const res = await fetch(`/api/app/settings/${module.moduleId}?history=1`).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    setHistory(Array.isArray(body?.history) ? body.history : 'failed');
  }

  const show = (f: SettingDefinition, v: SettingValue): string => {
    if (typeof v === 'boolean') return t(v ? 'set.on' : 'set.off');
    if (f.type === 'weekdays' && Array.isArray(v)) return (v as string[]).map((d) => t(`tt.day.${d}` as MessageKey)).join(', ');
    if (f.type === 'select') return t(`set.${module.moduleId}.${f.key}.option.${String(v)}` as MessageKey);
    return String(v);
  };

  function control(f: SettingDefinition, mayEdit: boolean) {
    const id = `set-${module.moduleId}-${f.key}`;
    const v = values[f.key];
    const set = (next: SettingValue) => setValues((all) => ({ ...all, [f.key]: next }));
    const label = t(key(f, 'label'));
    if (f.type === 'boolean') return <Switch id={id} label={label} stateText={t(v === true ? 'set.on' : 'set.off')} checked={v === true} disabled={!mayEdit || busy} onChange={(e) => set(e.target.checked)} />;
    if (f.type === 'weekdays')
      return (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-semibold text-slate">{label}</legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <label key={d} className="relative cursor-pointer">
                <input type="checkbox" className="peer sr-only" checked={Array.isArray(v) && (v as string[]).includes(d)} disabled={!mayEdit || busy} onChange={(e) => set(DAYS.filter((x) => (x === d ? e.target.checked : Array.isArray(v) && (v as string[]).includes(x))))} />
                <span className="flex min-h-[44px] items-center rounded-full border border-slate/20 bg-white px-4 text-sm font-semibold text-slate peer-checked:border-royal peer-checked:bg-royal/10 peer-checked:text-royal-deep peer-checked:before:mr-1.5 peer-checked:before:content-['✓'] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-royal peer-disabled:opacity-70">
                  {t(`tt.day.${d}` as MessageKey)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    // A colour is chosen by looking at it (C180): one swatch each, with its name under it, the chosen one ringed.
    if (f.type === 'color_token')
      return (
        <fieldset id={id} data-swatches className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-slate">{label}</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(colors) as (keyof typeof colors)[]).map((name) => (
              <label key={name} data-swatch={name} className={`flex min-h-[44px] min-w-[72px] cursor-pointer flex-col items-center gap-1 rounded-md border-2 p-1 text-xs text-slate ${v === name ? 'border-midnight font-bold' : 'border-transparent'} ${!mayEdit || busy ? 'cursor-default opacity-70' : ''}`}>
                <input type="radio" name={id} value={name} className="sr-only" checked={v === name} disabled={!mayEdit || busy} onChange={() => set(name)} />
                <span aria-hidden className="h-8 w-full rounded border border-slate/20" style={{ backgroundColor: colors[name] }} />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
      );
    if (f.type === 'select')
      return (
        <Select id={id} label={label} value={String(v)} disabled={!mayEdit || busy} onChange={(e) => set(e.target.value)}>
          {(f.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {t(`set.${module.moduleId}.${f.key}.option.${o.value}` as MessageKey)}
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
    <section data-settings-module={module.moduleId} className="flex flex-col gap-3 rounded-2xl border border-slate/10 bg-white p-4 shadow-sm md:p-5">
      <h3 className="text-base font-bold text-slate">{t(`module.${module.moduleId}` as MessageKey)}</h3>
      {module.fields.map(({ def, isDefault, mayEdit }) => (
        <div key={def.key} data-setting={def.key} className="flex flex-col gap-1 border-t border-slate/10 pt-3">
          <div className="flex flex-wrap items-start gap-x-1">
            <div className="min-w-0 flex-1">{control(def, mayEdit)}</div>
            <InfoTip label={t(key(def, 'label'))} className="mt-1">
              {t(key(def, 'help'))} {def.default === null ? t('set.noDefault') : t('set.default', { value: show(def, def.default) })}
            </InfoTip>
          </div>
          {/* A field with no default (C231): the school sets it, and it is never reset. */}
          {def.default === null ? (
            isDefault && (
              <p data-not-set className="text-xs font-semibold text-slate">
                {t('set.notSet')}
              </p>
            )
          ) : isDefault ? (
            <p className="text-xs text-slate/70">
              <span data-is-default className="rounded-full bg-slate/5 px-2 py-0.5 font-semibold">
                {t('set.isDefault')}
              </span>
            </p>
          ) : (
            <p className="flex flex-wrap items-center gap-3 text-xs text-slate/70">
              <span>{t('set.default', { value: show(def, def.default) })}</span>
              {mayEdit && (
                <button type="button" data-reset disabled={busy} className="min-h-[44px] font-semibold text-sapphire underline disabled:opacity-60" onClick={() => void send({ resetToDefault: [def.key] }, 'set.reset.done')}>
                  {t('set.reset')}
                </button>
              )}
            </p>
          )}
        </div>
      ))}
      {mayEditAny ? (
        <button type="button" data-save-settings disabled={busy || changed.length === 0} className={`${PRIMARY} self-start`} onClick={() => void send({ set: Object.fromEntries(changed.map((f) => [f.def.key, values[f.def.key]])) }, 'set.saved')}>
          {t('set.save')}
        </button>
      ) : (
        <p className="text-sm text-slate/70">{t('set.readOnly')}</p>
      )}
      <details data-settings-history className="border-t border-slate/10 pt-2 text-sm text-slate" onToggle={(e) => void openHistory((e.target as HTMLDetailsElement).open)}>
        <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold text-sapphire">{t('set.history')}</summary>
        {history === 'loading' && <p className="text-slate/70">{t('set.history.loading')}</p>}
        {history === 'failed' && <p className="text-slate/70">{t('set.history.failed')}</p>}
        {Array.isArray(history) && history.length === 0 && <p className="text-slate/70">{t('set.history.none')}</p>}
        {Array.isArray(history) && history.length > 0 && (
          <ul className="flex flex-col gap-1">
            {history.map((c, i) => {
              const def = module.fields.find((f) => f.def.key === c.key)?.def;
              const say = (v: SettingValue | null) => (v === null ? t('set.history.default') : def ? show(def, v) : String(v));
              return (
                <li key={i} data-history-row>
                  <span className="font-semibold">{def ? t(key(def, 'label')) : c.key}</span>: {say(c.from)} → {say(c.to)}
                  <span className="text-slate/70"> · {t('set.history.by', { name: c.changedByName ?? '', when: new Date(c.changedAt).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) })}</span>
                </li>
              );
            })}
          </ul>
        )}
      </details>
    </section>
  );
}

export function SchoolSettingsPanel({ modules }: { modules: SettingsModule[] }) {
  const { t, lang } = useT();
  if (modules.length === 0) return null;
  return (
    <section lang={lang} data-school-settings className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 className="text-lg font-bold text-slate">{t('set.title')}</h2>
        <InfoTip>{t('set.how')}</InfoTip>
      </div>
      {/* The key holds the revision: after a save the card starts again from what is stored. */}
      {modules.map((m) => (
        <ModuleCard key={`${m.moduleId}:${m.revision}:${JSON.stringify(m.fields.map((f) => f.value))}`} module={m} />
      ))}
    </section>
  );
}
