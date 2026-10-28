'use client';

import type { ReactNode } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/components/visual/Icons';
import { examTypeName, type ExamTypeRow } from '@/lib/contracts/exam-types';
import { COMPONENT_KINDS, componentKey, type ComponentKind } from '@/lib/exams/scheme';
import type { MessageKey } from '@/lib/i18n';
import type { BandForm, ComponentForm, TypeWeightForm } from './scheme-form';

// The parts of a grading scheme a person types, shared by the school's scheme builder and Control's preset form
// (C213): the bands, and the components with their parts. Numbers are typed as text and checked by the scheme's own
// rules (src/lib/exams/scheme.ts) before anything is saved.

export const TAP = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate disabled:opacity-60';
export const PRIMARY = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
export const FIELD = 'min-h-[44px] w-full min-w-0 rounded-md border border-slate/20 bg-white px-3 text-sm text-slate';
export const SECTION = 'flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4';

export function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold text-slate">
        {label}
      </label>
      {children}
    </div>
  );
}

export function AddButton({ onClick, label, data }: { onClick: () => void; label: string; data?: string }) {
  return (
    <button type="button" data-add={data} className={`${TAP} self-start`} onClick={onClick}>
      <Icon name="plus" className="h-4 w-4" />
      {label}
    </button>
  );
}

const set = <T,>(list: readonly T[], i: number, v: T) => list.map((x, j) => (j === i ? v : x));
const without = <T,>(list: readonly T[], i: number) => list.filter((_, j) => j !== i);

export function BandsEditor({ bands, onChange, idPrefix }: { bands: BandForm[]; onChange: (b: BandForm[]) => void; idPrefix: string }) {
  const { t } = useWords();
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {bands.map((b, i) => {
          const id = `${idPrefix}-band-${i}`;
          return (
            <li key={i} data-band={i} className="grid grid-cols-2 items-start gap-2 border-b border-slate/10 pb-3 sm:grid-cols-[minmax(0,7rem)_minmax(0,7rem)_minmax(0,7rem)_minmax(0,1fr)_auto]">
              <Input id={`${id}-from`} label={t('gs.bands.from')} inputMode="decimal" value={b.from} onChange={(e) => onChange(set(bands, i, { ...b, from: e.target.value }))} />
              <Input id={`${id}-to`} label={t('gs.bands.to')} inputMode="decimal" value={b.to} onChange={(e) => onChange(set(bands, i, { ...b, to: e.target.value }))} />
              <Input id={`${id}-grade`} label={t('gs.bands.grade')} maxLength={20} value={b.grade} onChange={(e) => onChange(set(bands, i, { ...b, grade: e.target.value }))} />
              <Input id={`${id}-meaning`} label={t('gs.bands.meaning')} maxLength={120} value={b.meaning} onChange={(e) => onChange(set(bands, i, { ...b, meaning: e.target.value }))} />
              <button type="button" className={`${TAP} col-span-2 sm:col-span-1`} onClick={() => onChange(without(bands, i))}>
                {t('gs.bands.remove', { n: i + 1 })}
              </button>
            </li>
          );
        })}
      </ol>
      <AddButton data="band" label={t('gs.bands.add')} onClick={() => onChange([...bands, { from: '', to: '', grade: '', meaning: '' }])} />
    </div>
  );
}

export function ComponentsEditor({ components, onChange, idPrefix }: { components: ComponentForm[]; onChange: (c: ComponentForm[]) => void; idPrefix: string }) {
  const { t } = useWords();
  const total = components.reduce((s, c) => s + (Number(c.share.replace(',', '.')) || 0), 0);
  return (
    <div className="flex flex-col gap-3">
      {components.length === 0 ? (
        <p className="text-sm text-slate/70">{t('gs.comp.none')}</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {components.map((c, i) => {
            const id = `${idPrefix}-comp-${i}`;
            const put = (v: Partial<ComponentForm>) => onChange(set(components, i, { ...c, ...v }));
            return (
              <li key={c.key} data-component={c.key} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                <div className="grid grid-cols-2 items-start gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,8rem)_minmax(0,10rem)]">
                  <Select id={`${id}-kind`} label={t('gs.comp.kind')} value={c.kind} onChange={(e) => put({ kind: e.target.value as ComponentKind })}>
                    {COMPONENT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t(`gs.comp.kind.${k}` as MessageKey)}
                      </option>
                    ))}
                  </Select>
                  <Input id={`${id}-name`} label={t('gs.comp.name')} maxLength={60} value={c.name} onChange={(e) => put({ name: e.target.value })} />
                  <Input id={`${id}-share`} label={t('gs.comp.share')} inputMode="decimal" value={c.share} onChange={(e) => put({ share: e.target.value })} />
                  <Input id={`${id}-pass`} label={t('gs.comp.passMark')} inputMode="decimal" value={c.passMark} onChange={(e) => put({ passMark: e.target.value })} />
                </div>
                {c.parts.length > 0 && <p className="text-xs font-semibold text-slate">{t('gs.comp.parts')}</p>}
                {c.parts.map((p, j) => (
                  <div key={j} className="grid grid-cols-2 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_auto] sm:pl-4">
                    <Input id={`${id}-part-${j}-name`} label={t('gs.comp.partName')} maxLength={60} value={p.name} onChange={(e) => put({ parts: set(c.parts, j, { ...p, name: e.target.value }) })} />
                    <Input id={`${id}-part-${j}-share`} label={t('gs.comp.partShare')} inputMode="decimal" value={p.share} onChange={(e) => put({ parts: set(c.parts, j, { ...p, share: e.target.value }) })} />
                    <button type="button" className={`${TAP} col-span-2 sm:col-span-1`} onClick={() => put({ parts: without(c.parts, j) })}>
                      {t('gs.comp.removePart', { n: j + 1 })}
                    </button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <AddButton label={t('gs.comp.addPart')} onClick={() => put({ parts: [...c.parts, { name: '', share: '' }] })} />
                  <button type="button" className={TAP} onClick={() => onChange(without(components, i))}>
                    {t('gs.comp.remove', { n: i + 1 })}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {components.length > 0 && <p className="text-sm text-slate/70">{t('gs.comp.total', { total: Math.round(total * 10) / 10 })}</p>}
      <AddButton
        data="component"
        label={t('gs.comp.add')}
        onClick={() => onChange([...components, { key: componentKey('component', components.map((c) => c.key)), kind: 'theory', name: '', share: '', passMark: '', parts: [] }])}
      />
    </div>
  );
}

// The exam types that count toward a report card, and how much each counts (C230-AJ part 2): a tick and a weight for
// each of the school's exam types (the shown ones, and a hidden one that already counts). Nothing ticked: no type is
// weighed and every exam stands alone. The weights are checked by the scheme's own rules (validateScheme).
export function ExamTypesEditor({ types, weights, onChange, idPrefix }: { types: readonly ExamTypeRow[]; weights: TypeWeightForm[]; onChange: (w: TypeWeightForm[]) => void; idPrefix: string }) {
  const { t, lang } = useWords();
  const total = weights.reduce((s, w) => s + (Number(w.weight.replace(',', '.')) || 0), 0);
  const rows = types.filter((x) => !x.hidden || weights.some((w) => w.type === x.key));
  // A weighed type the school's list no longer has still shows, by its code, so it can be taken off.
  const strays = weights.filter((w) => !types.some((x) => x.key === w.type));
  const named = (key: string, hidden: boolean) => (hidden ? t('gs.types.hiddenName', { name: examTypeName(types, key, lang) }) : examTypeName(types, key, lang));
  const line = (key: string, name: string) => {
    const at = weights.findIndex((w) => w.type === key);
    const id = `${idPrefix}-type-${key}`;
    return (
      <li key={key} data-exam-type={key} className="grid grid-cols-1 items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]">
        <Checkbox
          id={`${id}-counts`}
          label={name}
          checked={at >= 0}
          onChange={(e) => onChange(e.target.checked ? [...weights, { type: key, weight: '' }] : weights.filter((w) => w.type !== key))}
        />
        {at >= 0 && (
          <Input id={`${id}-weight`} inputMode="decimal" label={t('gs.types.weight')} value={weights[at].weight} onChange={(e) => onChange(weights.map((w, j) => (j === at ? { ...w, weight: e.target.value } : w)))} />
        )}
      </li>
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1">
        {rows.map((x) => line(x.key, named(x.key, x.hidden)))}
        {strays.map((w) => line(w.type, w.type))}
      </ul>
      {weights.length > 0 ? <p className="text-sm text-slate/70">{t('gs.types.total', { total: Math.round(total * 10) / 10 })}</p> : <p className="text-sm text-slate/70">{t('gs.types.none')}</p>}
    </div>
  );
}
