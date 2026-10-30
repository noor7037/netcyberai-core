import type { LabLink, LabResult, LabRun } from './store';

// The comparable table (G4, C372): one row per case, one column per provider and model, in the run's own order, each
// cell the answer for that pair or null while it has not run. Pure, so the screen and the export build the same table.

export type LabCell = LabResult | null;
export type LabTable = { columns: LabLink[]; rows: { caseId: string; cells: LabCell[] }[] };

export const linkKey = (l: LabLink) => `${l.provider} ${l.model}`;

export function labTable(run: Pick<LabRun, 'caseIds' | 'models' | 'results'>): LabTable {
  const byCell = new Map(run.results.map((r) => [`${r.caseId} ${r.provider} ${r.model}`, r]));
  return {
    columns: run.models,
    rows: run.caseIds.map((caseId) => ({ caseId, cells: run.models.map((m) => byCell.get(`${caseId} ${linkKey(m)}`) ?? null) })),
  };
}

// Per column: answered, failed, JSON valid of those that expected it, checks passed of those with a check, the
// middle time, and the average score of those scored. Only what was measured; nothing is estimated.
// W10 (latency): medianMs is the p50 of the whole answer's time; p95Ms the time 95 in 100 answers came within; the
// first-text pair the same for the time to the answer's first words (a model's thinking is not words), over the answers.
export type LabColumnSummary = { answered: number; failed: number; jsonValid: number; jsonExpected: number; checksPassed: number; checks: number; medianMs: number | null; p95Ms: number | null; firstTextMedianMs: number | null; firstTextP95Ms: number | null; meanScore: number | null; scored: number;
  // G5 (C373): the column's answers' cost at today's price, or null while any answer has none.
  costUsd: number | null };

export function columnSummaries(table: LabTable): LabColumnSummary[] {
  return table.columns.map((_, i) => {
    const cells = table.rows.map((r) => r.cells[i]).filter((c): c is LabResult => c !== null);
    const ok = cells.filter((c) => c.errorClass === null || c.errorClass === 'output_schema_invalid');
    const times = ok.map((c) => c.latencyMs).sort((a, b) => a - b);
    const scored = cells.filter((c) => c.score !== null);
    const mid = median(times);
    const firsts = ok.map((c) => c.firstTokenMs).filter((ms): ms is number => typeof ms === 'number').sort((a, b) => a - b);
    return {
      answered: ok.length,
      failed: cells.length - ok.length,
      jsonValid: cells.filter((c) => c.jsonValid === true).length,
      jsonExpected: cells.filter((c) => c.jsonValid !== null).length,
      checksPassed: cells.filter((c) => c.checkPassed === true).length,
      checks: cells.filter((c) => c.checkPassed !== null).length,
      medianMs: mid,
      p95Ms: p95(times),
      firstTextMedianMs: median(firsts),
      firstTextP95Ms: p95(firsts),
      meanScore: scored.length ? Math.round((scored.reduce((n, c) => n + (c.score as number), 0) / scored.length) * 100) / 100 : null,
      scored: scored.length,
      costUsd: cells.length && cells.every((c) => c.costUsd !== null) ? Math.round(cells.reduce((n, c) => n + (c.costUsd as number), 0) * 1_000_000) / 1_000_000 : null,
    };
  });
}

// Over sorted times: the middle one (the mean of the two middle ones), and the nearest-rank 95th percentile.
function median(sorted: number[]): number | null {
  const n = sorted.length;
  return n ? (n % 2 ? sorted[(n - 1) / 2] : Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2)) : null;
}
function p95(sorted: number[]): number | null {
  return sorted.length ? sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)] : null;
}
