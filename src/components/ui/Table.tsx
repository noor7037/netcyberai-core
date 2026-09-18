import type { ReactNode } from 'react';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';
import { EmptyState } from './EmptyState';

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

interface Props<T> {
  columns: TableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  state?: 'ready' | 'loading' | 'error' | 'empty';
  errorMessage?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  retryAction?: ReactNode;
  emptyAction?: ReactNode;
}

// Mobile strategy decision (docs/07_DESIGN_SYSTEM.md Table entry: "cards
// or a horizontal-scroll container, never a squeezed grid" -- both
// allowed, one had to be picked and applied consistently):
//
// CARDS below 768px, the real <table> at >=768px and up.
//
// Why cards, not horizontal scroll, as the DEFAULT: the per-role device
// matrix has every role Table actually serves -- school admin, office,
// accountant -- primary-desktop for the bulk/reconciliation work Table
// is built for; phone is explicitly their "lookups and approvals"
// secondary use, not deep reconciliation. A card reads cleanly for a
// quick lookup on a touch screen without a sideways gesture; a wide
// table's hidden-off-to-the-right columns are exactly the kind of
// thing easy to miss with gloved or damp hands outdoors, per the Floor
// Device Standard's own input/ambient rows. Horizontal scroll remains
// legitimate for a genuinely dense, equally-weighted-columns view (an
// audit log, say) -- that would be a deliberate, new decision for that
// specific screen when it's built, not a second default this
// component quietly also supports; Table itself only implements one.
//
// Both markups render from the same rows/columns; CSS (`md:hidden` /
// `hidden md:block`), not a JS viewport check, decides which shows --
// no layout-shift risk from a client-side breakpoint read.
export function Table<T>({
  columns,
  rows,
  getRowId,
  state = 'ready',
  errorMessage = 'Could not load this data.',
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  retryAction,
  emptyAction,
}: Props<T>) {
  if (state === 'loading') return <LoadingState label="Loading…" />;
  if (state === 'error') return <ErrorState message={errorMessage} action={retryAction} />;
  if (state === 'empty' || rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <>
      {/* Card view: below 768px */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <div key={getRowId(row)} className="rounded-lg border border-slate/10 bg-white p-4">
            <dl className="flex flex-col gap-2">
              {columns.map((col, i) => (
                <div key={col.key} className="flex items-baseline justify-between gap-3">
                  <dt className={i === 0 ? 'sr-only' : 'text-sm text-slate/70'}>{col.header}</dt>
                  <dd className={i === 0 ? 'text-base font-semibold text-slate' : 'text-sm text-slate ml-auto'}>
                    {col.render(row)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {/* Full table: 768px and up */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate/10">
              {columns.map((col) => (
                <th key={col.key} scope="col" className="px-4 py-3 font-semibold text-slate">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getRowId(row)} className="border-b border-slate/10">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-slate">
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
