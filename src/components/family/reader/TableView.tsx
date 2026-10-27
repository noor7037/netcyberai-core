import type { Table } from '@/lib/family/blocks';
import { Card, SUBJECT_TONE } from '../blocks/BlockViews';

// A chapter's table (S1, C374): plain-text cells in a real table, so a screen reader reads it row by row. Narration
// never reads it (blocks.ts READ_ALOUD_TYPES). A wide table scrolls inside its card on a narrow phone, never the page.
export function TableView({ b, tone }: { b: Table; tone: string }) {
  return (
    <Card title={b.title} tone={tone} tag="table">
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[18rem] border-separate border-spacing-0 text-left text-sm text-slate">
          <thead>
            <tr>
              {b.columns.map((c, i) => (
                <th key={i} scope="col" className={`px-3 py-2 font-bold first:rounded-l-xl last:rounded-r-xl ${SUBJECT_TONE[tone]?.soft ?? 'bg-royal/10'}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, k) =>
                  k === 0 ? (
                    <th key={k} scope="row" className="border-b border-slate/10 bg-white px-3 py-2 align-top font-semibold">
                      {c}
                    </th>
                  ) : (
                    <td key={k} className="border-b border-slate/10 bg-white px-3 py-2 align-top">
                      {c}
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
