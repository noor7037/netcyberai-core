import Link from 'next/link';
import type { KeyboardEvent, ReactNode } from 'react';
import { EmptyState, ErrorState, Skeleton } from './States';

// One list component for every screen (17 §4: tables become card lists on
// phones). At 768 px and wider it is a table; below, each row is a card
// with the primary column as its title. Rows that open something are whole
// 44 px+ targets.

export type DataColumn<Row> = {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
  primary?: boolean; // the card title on phones (exactly one column)
  hideOnPhone?: boolean;
  align?: 'left' | 'right';
};

// Row selection for bulk actions (C110 bulk contract): rows of this page,
// or every row matching the filter (`allMatching`, sent as BulkSelection
// mode 'filtered' with the total as expectedCount). Space toggles a focused
// row; Escape clears the selection.
export type ListSelection = {
  selected: ReadonlySet<string>;
  onChange: (ids: Set<string>) => void;
  allMatching: boolean;
  onAllMatching: (on: boolean) => void;
  total: number; // rows matching the filter, across all pages
};

export function DataList<Row>({
  caption,
  columns,
  rows,
  rowKey,
  rowHref,
  loading,
  error,
  onRetry,
  empty,
  selection,
  rowLabel,
}: {
  caption: string;
  columns: readonly DataColumn<Row>[];
  rows: readonly Row[] | null;
  rowKey: (row: Row) => string;
  rowHref?: (row: Row) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty: { title: string; whatToDo: string; action?: ReactNode };
  selection?: ListSelection;
  // What a screen reader says for a row's checkbox; defaults to the primary
  // column when it renders plain text.
  rowLabel?: (row: Row) => string;
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading || rows === null) return <Skeleton lines={5} />;
  if (rows.length === 0) return <EmptyState {...empty} />;

  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary && !c.hideOnPhone);
  const sel = selection;
  const pageIds = rows.map(rowKey);
  const pageAll = !!sel && pageIds.every((id) => sel.selected.has(id));
  const isOn = (id: string) => !!sel && (sel.allMatching || sel.selected.has(id));
  const toggle = (id: string) => {
    if (!sel) return;
    const next = new Set(sel.allMatching ? pageIds : sel.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    sel.onAllMatching(false);
    sel.onChange(next);
  };
  const togglePage = () => {
    if (!sel) return;
    sel.onAllMatching(false);
    sel.onChange(pageAll ? new Set() : new Set(pageIds));
  };
  const clear = () => {
    sel?.onAllMatching(false);
    sel?.onChange(new Set());
  };
  const box = (id: string, label: string) => (
    <input type="checkbox" checked={isOn(id)} onChange={() => toggle(id)} aria-label={`Select ${label}`} className="h-5 w-5" />
  );
  const rowKeys = (id: string) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === ' ' && e.target === e.currentTarget) {
      e.preventDefault();
      toggle(id);
    }
  };
  const label = (row: Row) => {
    if (rowLabel) return rowLabel(row);
    const r = primary.render(row);
    return typeof r === 'string' || typeof r === 'number' ? String(r) : `row ${rows.indexOf(row) + 1}`;
  };

  return (
    // Handlers only with selection: without it this renders from server
    // components, which cannot pass event handlers.
    <div onKeyDown={sel ? (e) => e.key === 'Escape' && clear() : undefined}>
      {sel && (pageAll || sel.allMatching) && sel.total > rows.length && (
        <p role="status" className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-sapphire/5 px-3 text-sm text-slate">
          {sel.allMatching ? `All ${sel.total} matching rows are selected.` : `All ${rows.length} on this page are selected.`}
          <button type="button" onClick={() => (sel.allMatching ? clear() : sel.onAllMatching(true))} className="min-h-[44px] font-semibold text-sapphire">
            {sel.allMatching ? 'Clear selection' : `Select all ${sel.total} matching`}
          </button>
        </p>
      )}
      <div className="hidden overflow-x-auto rounded-xl border border-slate/10 bg-white md:block">
        <table className="w-full text-left text-sm text-slate">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-off-white">
            <tr>
              {sel && (
                <th scope="col" className="w-12 px-4 py-3">
                  <input type="checkbox" checked={pageAll || sel.allMatching} onChange={togglePage} aria-label="Select all on this page" className="h-5 w-5" />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-4 py-3 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                tabIndex={sel ? 0 : undefined}
                onKeyDown={sel ? rowKeys(rowKey(row)) : undefined}
                aria-selected={sel ? isOn(rowKey(row)) : undefined}
                className={`nca-row border-t border-slate/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal ${sel && isOn(rowKey(row)) ? 'bg-sapphire/5' : ''}`}
              >
                {sel && <td className="px-4 py-3">{box(rowKey(row), label(row))}</td>}
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                    {c === primary && rowHref ? (
                      <Link href={rowHref(row)} className="inline-flex min-h-[44px] items-center font-semibold text-sapphire">
                        {c.render(row)}
                      </Link>
                    ) : (
                      c.render(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul aria-label={caption} className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => {
          const card = (
            <>
              <p className="font-semibold text-slate">{primary.render(row)}</p>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {rest.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-slate/70">{c.header}</dt>
                    <dd className="text-slate">{c.render(row)}</dd>
                  </div>
                ))}
              </dl>
            </>
          );
          return (
            <li key={rowKey(row)} tabIndex={sel ? 0 : undefined} onKeyDown={sel ? rowKeys(rowKey(row)) : undefined} className={sel ? 'relative rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal' : undefined}>
              {sel && <span className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center">{box(rowKey(row), label(row))}</span>}
              {rowHref ? (
                <Link href={rowHref(row)} className="nca-lift block min-h-[44px] rounded-xl border border-slate/10 bg-white p-4">
                  {card}
                </Link>
              ) : (
                <div className="rounded-xl border border-slate/10 bg-white p-4">{card}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
