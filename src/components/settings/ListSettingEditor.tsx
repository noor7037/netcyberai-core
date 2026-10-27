'use client';

import { useT } from '@/components/app-shell/LangContext';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import type { ModuleId } from '@/lib/contracts/modules';
import type { SettingDefinition } from '@/lib/contracts/settings';
import { codeColumnOf, type ListRow } from '@/lib/frameworks/list-rows';
import type { MessageKey } from '@/lib/i18n';

// A 'list' setting as rows to edit (17 §1a, C230-AJ): one card for each row, a field for each column from the
// schema, "Add" at the end. Nothing here is hand-built for one list: the columns, their types and their words come from
// the schema and its messages (set.<module>.<field>.col.<column>). A row with a code (see list-rows.ts) is kept: it is
// renamed or hidden, and removed only while it is new, because records refer to it by its code. The engine checks the
// list when it is saved; this screen only makes the rows.

const TAP = 'inline-flex min-h-[44px] items-center justify-center rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate disabled:opacity-60';
const MAX_ROWS = 30;

export function ListSettingEditor({ moduleId, def, rows, disabled, onChange }: { moduleId: ModuleId; def: SettingDefinition; rows: ListRow[]; disabled: boolean; onChange: (rows: ListRow[]) => void }) {
  const { t } = useT();
  const columns = def.columns ?? [];
  const code = codeColumnOf(columns);
  const fields = columns.filter((c) => c !== code);
  const words = (part: string) => t(`set.${moduleId}.${def.key}.${part}` as MessageKey);
  const max = Math.min(def.max ?? MAX_ROWS, MAX_ROWS);
  const blank = (): ListRow => Object.fromEntries(columns.map((c) => [c.key, c.type === 'boolean' ? false : c.type === 'number' ? 0 : c.type === 'time' ? '00:00' : '']));
  const put = (i: number, key: string, v: string | number | boolean) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  // A new row goes before the pinned ones, so "Other" stays last.
  const add = () => {
    const pinnedAt = code ? rows.findIndex((r) => (def.pinnedRows ?? []).includes(String(r[code.key]))) : -1;
    onChange(pinnedAt < 0 ? [...rows, blank()] : [...rows.slice(0, pinnedAt), blank(), ...rows.slice(pinnedAt)]);
  };

  return (
    <fieldset data-list-setting={def.key} className="flex flex-col gap-3">
      <legend className="text-sm font-semibold text-slate">{words('label')}</legend>
      <ol className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const saved = code !== null && typeof r[code.key] === 'string' && r[code.key] !== '';
          const pinned = saved && (def.pinnedRows ?? []).includes(String(r[code!.key]));
          const id = `set-${moduleId}-${def.key}-${i}`;
          return (
            <li key={i} data-list-row={i} data-list-row-code={saved ? String(r[code!.key]) : undefined} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
              <p className="text-xs text-slate/70">{saved ? t('set.list.code', { code: String(r[code!.key]) }) : t('set.list.new')}</p>
              <div className="grid grid-cols-1 items-start gap-x-4 gap-y-2 sm:grid-cols-2">
                {fields.map((c) => {
                  const label = words(`col.${c.key}`);
                  const v = r[c.key];
                  if (c.type === 'boolean')
                    return <Checkbox key={c.key} id={`${id}-${c.key}`} label={label} checked={pinned ? false : v === true} disabled={disabled || pinned} onChange={(e) => put(i, c.key, e.target.checked)} />;
                  if (c.type === 'number') return <Input key={c.key} id={`${id}-${c.key}`} label={label} type="number" inputMode="numeric" value={String(v ?? '')} disabled={disabled} onChange={(e) => put(i, c.key, e.target.value === '' ? '' : Number(e.target.value))} />;
                  return <Input key={c.key} id={`${id}-${c.key}`} label={label} type={c.type === 'time' ? 'time' : 'text'} maxLength={c.type === 'text' ? 60 : undefined} value={String(v ?? '')} disabled={disabled} onChange={(e) => put(i, c.key, e.target.value)} />;
                })}
              </div>
              {!saved && rows.length > (def.min ?? 0) && (
                <button type="button" data-list-remove={i} className={`${TAP} self-start`} disabled={disabled} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                  {t('set.list.remove', { n: i + 1 })}
                </button>
              )}
              {pinned && <p className="text-xs text-slate/70">{t('set.list.pinned')}</p>}
            </li>
          );
        })}
      </ol>
      <button type="button" data-list-add className={`${TAP} self-start`} disabled={disabled || rows.length >= max} onClick={add}>
        {words('add')}
      </button>
    </fieldset>
  );
}
