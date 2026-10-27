import type { CardBlock } from '@/lib/exams/report-card-text';

// The card as the PDF prints it: the same blocks of words.
export function CardPreview({ blocks }: { blocks: readonly CardBlock[] }) {
  return (
    <div data-rc-card className="flex flex-col gap-1 rounded-md border border-slate/10 bg-white p-3">
      {blocks.map((b, i) => {
        if (b.kind === 'title') return <p key={i} className="text-base font-bold">{b.text}</p>;
        if (b.kind === 'subtitle') return <p key={i} className="font-semibold">{b.text}</p>;
        if (b.kind === 'heading') return <p key={i} className="mt-2 font-bold">{b.text}</p>;
        if (b.kind === 'line') return <p key={i} data-rc-line className={b.strong ? 'font-semibold' : undefined}>{b.text}</p>;
        if (b.kind === 'note') return <p key={i} className="text-xs text-slate/70">{b.text}</p>;
        return (
          <div key={i} className="my-2 max-w-full overflow-x-auto">
            <table className="w-full text-left text-xs" data-rc-table>
              <thead>
                <tr className="border-b border-slate/10">
                  {b.columns.map((c, ci) => (
                    <th key={ci} scope="col" className={`p-2 ${b.numeric[ci] ? 'text-right' : ''}`}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri} className={`border-b border-slate/10 ${b.totalRow && ri === b.rows.length - 1 ? 'bg-off-white font-semibold' : ''}`}>
                    {r.map((cell, ci) => (ci === 0 ? <th key={ci} scope="row" className="p-2 font-semibold">{cell}</th> : <td key={ci} className={`p-2 ${b.numeric[ci] ? 'text-right' : ''}`}>{cell}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
