'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { decodeListQuery, encodeListQuery, isFilterGroup, LIST_QUERY_PARAM, OPERATORS_BY_TYPE, type FilterCondition, type FilterField, type ListDefinition, type ListQuery } from '@/lib/contracts/filters';
import { addCondition, clearFilters, describe, quickValues, removeAt, setBooleanQuick, setCombinator, setQuickFilter, setSearch, validateListQuery, type Options } from './list-query';

// The filter bar every list uses (17 §1a): search, quick-filter chips, a
// "More filters" panel (a sheet on phones) with match all / any, the
// applied filters as removable chips, and Clear all. It edits a ListQuery
// (contracts/filters.ts); the server validates and runs it.

const chip = 'inline-flex min-h-[44px] items-center gap-1 rounded-full border px-3 text-sm font-semibold';

function QuickChip({ field, query, onChange, options }: { field: FilterField; query: ListQuery; onChange: (q: ListQuery) => void; options: Options }) {
  const [open, setOpen] = useState(false);
  if (field.type === 'boolean') {
    const on = (query.filter?.conditions ?? []).some((c) => !isFilterGroup(c) && c.field === field.key);
    return (
      <button type="button" aria-pressed={on} onClick={() => onChange(setBooleanQuick(query, field.key, !on))} className={`${chip} ${on ? 'border-sapphire bg-sapphire text-white' : 'border-slate/20 bg-white text-slate'}`}>
        {field.label}
      </button>
    );
  }
  const opts = field.options ?? (field.optionsFrom ? options[field.optionsFrom] : undefined) ?? [];
  const chosen = quickValues(query, field.key);
  const toggle = (v: string) => onChange(setQuickFilter(query, field.key, chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v]));
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={`${chip} ${chosen.length ? 'border-sapphire bg-sapphire/10 text-sapphire' : 'border-slate/20 bg-white text-slate'}`}>
        {field.label}
        {chosen.length > 0 && <span className="rounded-full bg-sapphire px-1.5 text-xs text-white">{chosen.length}</span>}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <fieldset className="absolute left-0 z-20 mt-1 max-h-72 min-w-[12rem] overflow-y-auto rounded-lg border border-slate/15 bg-white p-2 shadow-xl">
          <legend className="sr-only">{field.label}</legend>
          {opts.length === 0 && <p className="p-2 text-sm text-slate/70">No choices yet.</p>}
          {opts.map((o) => (
            <label key={o.value} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded px-2 text-sm text-slate hover:bg-slate/5">
              <input type="checkbox" checked={chosen.includes(o.value)} onChange={() => toggle(o.value)} className="h-4 w-4" />
              {o.label}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

function AddCondition({ fields, onAdd, options }: { fields: readonly FilterField[]; onAdd: (c: FilterCondition) => void; options: Options }) {
  const [key, setKey] = useState(fields[0]?.key ?? '');
  const field = fields.find((f) => f.key === key);
  const ops = field ? (OPERATORS_BY_TYPE[field.type] as readonly string[]) : [];
  const [op, setOp] = useState<string>(ops[0] ?? '');
  const [value, setValue] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => setOp(ops[0] ?? ''), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!field) return null;
  const opts = field.options ?? (field.optionsFrom ? options[field.optionsFrom] : undefined) ?? [];
  const noValue = op === 'is_empty' || op === 'is_not_empty';
  const inputType = field.type === 'number' || op === 'last_n_days' ? 'number' : field.type === 'date' ? 'date' : 'text';
  const select = 'min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-sm text-slate';

  function add() {
    let v: FilterCondition['value'];
    if (noValue) v = undefined;
    else if (field!.type === 'boolean') v = value === 'true';
    else if (op === 'in' || op === 'not_in') v = [value];
    else if (op === 'between') v = inputType === 'number' ? { from: Number(value), to: Number(to) } : { from: value, to };
    else v = inputType === 'number' ? Number(value) : value;
    onAdd({ field: field!.key, op: op as FilterCondition['op'], ...(v === undefined ? {} : { value: v }) });
    setValue('');
    setTo('');
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <label className="text-sm text-slate">
        Field
        <select value={key} onChange={(e) => setKey(e.target.value)} className={select}>
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-slate">
        Condition
        <select value={op} onChange={(e) => setOp(e.target.value)} className={select}>
          {ops.map((o) => (
            <option key={o} value={o}>
              {describe({ field: '', op: o as FilterCondition['op'] }, []).trim()}
            </option>
          ))}
        </select>
      </label>
      {!noValue && (
        <label className="text-sm text-slate">
          Value
          {field.type === 'boolean' || opts.length ? (
            <select value={value} onChange={(e) => setValue(e.target.value)} className={select}>
              <option value="">Choose…</option>
              {(field.type === 'boolean' ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] : opts).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input type={inputType} value={value} onChange={(e) => setValue(e.target.value)} className={select} />
          )}
          {op === 'between' && <input type={inputType} aria-label="and" value={to} onChange={(e) => setTo(e.target.value)} className={`${select} mt-1`} />}
        </label>
      )}
      <button type="button" onClick={add} disabled={!noValue && !value} className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-3 sm:justify-self-start">
        Add filter
      </button>
    </div>
  );
}

export function FilterBar({
  definition,
  query,
  onChange,
  options = {},
  trailing,
  staleLink = false,
}: {
  definition: ListDefinition;
  query: ListQuery;
  onChange: (q: ListQuery) => void;
  options?: Options;
  trailing?: ReactNode;
  staleLink?: boolean; // the link's `q` did not fit this list and was dropped
}) {
  const [more, setMore] = useState(false);
  const [text, setText] = useState(query.search ?? '');
  // The latest query, so a search typed while a filter changes applies to
  // the new query, not the one from when typing started (a /code-review finding).
  const latest = useRef(query);
  latest.current = query;
  useEffect(() => setText(query.search ?? ''), [query.search]);
  useEffect(() => {
    if (text === (latest.current.search ?? '')) return;
    const t = setTimeout(() => onChange(setSearch(latest.current, text)), 300);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const applied = query.filter?.conditions ?? [];
  const combinator = query.filter?.combinator ?? 'and';
  return (
    <div className="flex flex-col gap-2">
      {staleLink && (
        <p role="status" className="rounded-md border border-tangerine/40 bg-tangerine/10 px-3 py-2 text-sm text-slate">
          This link&apos;s filters no longer apply, so the full list is shown.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-[12rem] flex-1">
          <span className="sr-only">Search</span>
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={definition.searchPlaceholder} className="min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-sm text-slate" />
        </label>
        <div className="hidden flex-wrap gap-2 md:flex">
          {definition.fields.filter((f) => f.quick).map((f) => (
            <QuickChip key={f.key} field={f} query={query} onChange={onChange} options={options} />
          ))}
        </div>
        <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className={`${chip} border-slate/20 bg-white text-slate`}>
          More filters
        </button>
        {trailing}
      </div>

      {more && (
        <div role="dialog" aria-label="More filters" className="fixed inset-x-0 bottom-0 z-30 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-slate/15 bg-white p-4 shadow-2xl md:static md:rounded-xl md:shadow-none">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-base font-bold text-slate">More filters</p>
            <button type="button" onClick={() => setMore(false)} className="min-h-[44px] px-3 text-sm font-semibold text-sapphire">
              Done
            </button>
          </div>
          <div className="mb-3 flex flex-wrap gap-2 md:hidden">
            {definition.fields.filter((f) => f.quick).map((f) => (
              <QuickChip key={f.key} field={f} query={query} onChange={onChange} options={options} />
            ))}
          </div>
          <div role="group" aria-label="Match" className="mb-3 flex gap-2">
            {(['and', 'or'] as const).map((c) => (
              <button key={c} type="button" aria-pressed={combinator === c} onClick={() => onChange(setCombinator(query, c))} className={`${chip} ${combinator === c ? 'border-sapphire bg-sapphire text-white' : 'border-slate/20 bg-white text-slate'}`}>
                {c === 'and' ? 'Match all' : 'Match any'}
              </button>
            ))}
          </div>
          <AddCondition fields={definition.fields} options={options} onAdd={(c) => onChange(addCondition(query, c))} />
        </div>
      )}

      {(applied.length > 0 || query.search) && (
        <ul aria-label="Applied filters" className="flex flex-wrap items-center gap-2">
          {applied.map((c, i) => (
            <li key={i}>
              <button type="button" onClick={() => onChange(removeAt(query, i))} aria-label={`Remove filter: ${describe(c, definition.fields, options)}`} className={`${chip} border-sapphire/30 bg-sapphire/5 text-sapphire`}>
                {i > 0 && <span className="text-xs font-bold uppercase text-slate/70">{combinator === 'and' ? 'and' : 'or'}</span>}
                {describe(c, definition.fields, options)} <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => onChange(clearFilters(query))} className="min-h-[44px] px-2 text-sm font-semibold text-coral-deep">
              Clear all
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

// The list query, kept in the URL parameter `q` (contracts/filters.ts) so a
// filtered list can be bookmarked and shared. Replaces the history entry,
// so filtering does not fill the back button. A `q` that does not fit the
// list (validateListQuery) is dropped from the URL and reported as
// `staleLink`, so the screen can say "This link's filters no longer apply"
// (C120).
export function useUrlListQuery(definition: ListDefinition, initial: ListQuery = {}): [ListQuery, (q: ListQuery) => void, { staleLink: boolean }] {
  const [query, setQuery] = useState<ListQuery>(initial);
  const [staleLink, setStaleLink] = useState(false);
  const write = (q: ListQuery | null) => {
    const url = new URL(window.location.href);
    if (q && (q.filter || q.search || q.sort || q.columns)) url.searchParams.set(LIST_QUERY_PARAM, encodeListQuery(q));
    else url.searchParams.delete(LIST_QUERY_PARAM);
    window.history.replaceState(window.history.state, '', url);
  };
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get(LIST_QUERY_PARAM);
    if (!raw) return;
    const valid = validateListQuery(definition, decodeListQuery(raw));
    if (valid) setQuery(valid);
    else {
      setStaleLink(true);
      write(null);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (q: ListQuery) => {
    setQuery(q);
    setStaleLink(false);
    write(q);
  };
  return [query, update, { staleLink }];
}
