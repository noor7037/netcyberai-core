import type { ReportTone, ToolReport } from '@/lib/free-tools/report';

// On-screen and print rendering of a ToolReport. The PDF is drawn from the
// same object (src/lib/pdf/report-canvas.ts), so what is shown here is
// what gets printed, downloaded and exported.

const TONE_TEXT: Record<ReportTone, string> = {
  good: 'text-emerald-text',
  warn: 'text-amber-text',
  bad: 'text-red-800',
  neutral: 'text-slate',
};
const TONE_EDGE: Record<ReportTone, string> = {
  good: 'border-l-emerald',
  warn: 'border-l-amber',
  bad: 'border-l-red-600',
  neutral: 'border-l-slate/30',
};
const TONE_WORD: Record<ReportTone, string> = { good: 'Good', warn: 'Check', bad: 'Problem', neutral: '' };

export function ReportView({
  report,
  meta,
  headingLevel = 2,
}: {
  report: ToolReport;
  meta: { generatedOn: string; rulesUpdated: string; rulesLabel: string; assumptionsLabel: string };
  headingLevel?: 2 | 3;
}) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const Sub = headingLevel === 2 ? 'h3' : 'h4';
  return (
    <article className="nca-report flex flex-col gap-6 rounded-3xl border border-slate/10 bg-white p-5 sm:p-8" aria-label={report.title}>
      <header className="flex flex-col gap-1 border-b border-slate/10 pb-4">
        <H className="text-2xl font-extrabold text-sapphire">{report.title}</H>
        {report.subtitle && <p className="text-slate/70">{report.subtitle}</p>}
        <p className="text-xs text-slate/70">
          {meta.generatedOn} · {meta.rulesLabel} {meta.rulesUpdated}
        </p>
      </header>

      {report.sections.map((s, i) => (
        <section key={i} className="flex flex-col gap-3">
          {s.heading && <Sub className="text-lg font-extrabold text-sapphire">{s.heading}</Sub>}
          {s.kind === 'stats' && (
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {s.items.map((it) => {
                const tone = it.tone ?? 'neutral';
                return (
                  <div key={it.label} className={`rounded-2xl border border-l-4 border-y-slate/10 border-r-slate/10 bg-white p-4 ${TONE_EDGE[tone]}`}>
                    <dt className="text-sm text-slate/70">{it.label}</dt>
                    <dd className={`text-2xl font-extrabold ${TONE_TEXT[tone]}`}>
                      {it.value}
                      {tone !== 'neutral' && <span className="sr-only"> ({TONE_WORD[tone]})</span>}
                    </dd>
                    {it.note && <dd className="mt-1 text-xs text-slate/70">{it.note}</dd>}
                  </div>
                );
              })}
            </dl>
          )}
          {s.kind === 'table' && (
            <div className="nca-scroll relative -mx-1 overflow-x-auto px-1" tabIndex={0} role="region" aria-label={s.heading}>
              <table className="w-full min-w-[32rem] border-collapse text-sm">
                <thead>
                  <tr className="bg-off-white">
                    {s.columns.map((c, ci) => (
                      <th key={c} scope="col" className={`border-b border-slate/20 px-3 py-2 font-bold text-slate ${s.numeric?.[ci] ? 'text-right' : 'text-left'}`}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r, ri) => {
                    const tone = s.rowTones?.[ri];
                    return (
                      <tr key={ri} className="border-b border-slate/10">
                        {r.map((cell, ci) => (
                          <td
                            key={ci}
                            className={`px-3 py-2 ${s.numeric?.[ci] ? 'text-right tabular-nums' : 'text-left'} ${tone ? `${TONE_TEXT[tone]} font-semibold` : 'text-slate'}`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {s.kind === 'notes' && (
            <ul className="flex flex-col gap-2">
              {s.items.map((it) => (
                <li key={it} className={`flex gap-2 ${s.tone ? TONE_TEXT[s.tone] : 'text-slate'}`}>
                  <span aria-hidden="true">•</span>
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          )}
          {s.kind === 'text' && <p className="text-slate">{s.text}</p>}
        </section>
      ))}

      <footer className="flex flex-col gap-2 border-t border-slate/10 pt-4 text-sm text-slate/70">
        <Sub className="font-bold text-slate">{meta.assumptionsLabel}</Sub>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {report.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <p>{report.disclaimer}</p>
      </footer>
    </article>
  );
}
