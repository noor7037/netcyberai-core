import Link from 'next/link';
import type { ReactNode } from 'react';
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
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading || rows === null) return <Skeleton lines={5} />;
  if (rows.length === 0) return <EmptyState {...empty} />;

  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary && !c.hideOnPhone);

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-slate/10 bg-white md:block">
        <table className="w-full text-left text-sm text-slate">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-off-white">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-4 py-3 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="nca-row border-t border-slate/10">
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
            <li key={rowKey(row)}>
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
    </>
  );
}
