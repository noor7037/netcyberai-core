import { labCase } from './cases';
import type { LabRun } from './store';
import { columnSummaries, labTable } from './table';

// The Quality Lab's exports (G4, C372): the whole run as JSON (the cases' version, the models, every answer with its
// measures and score, and each model's summary), or one CSV line per case and model for a spreadsheet. Made-up cases
// only, and no key or account detail is in a run, so an export carries nothing private.

const CSV_COLUMNS = [
  'run_id',
  'dataset_version',
  'case_id',
  'area',
  'language',
  'expect',
  'provider',
  'model',
  'latency_ms',
  'first_token_ms',
  'tokens_in',
  'tokens_out',
  'cost_usd_today',
  'json_valid',
  'check_passed',
  'error_class',
  'score',
  'notes',
  'output_text',
] as const;

// A cell a spreadsheet would read as a formula is written as text (a leading apostrophe).
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function labRunCsv(run: LabRun): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of labTable(run).rows) {
    const c = labCase(row.caseId);
    for (const cell of row.cells) {
      if (!cell) continue;
      lines.push(
        [run.runId, run.datasetVersion, cell.caseId, c?.area, c?.language, c?.expect, cell.provider, cell.model, cell.latencyMs, cell.firstTokenMs, cell.tokensIn, cell.tokensOut, cell.costUsd, cell.jsonValid, cell.checkPassed, cell.errorClass, cell.score, cell.notes, cell.outputText]
          .map(csvCell)
          .join(',')
      );
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function labRunJson(run: LabRun): string {
  const table = labTable(run);
  const summaries = columnSummaries(table);
  return JSON.stringify(
    {
      runId: run.runId,
      datasetVersion: run.datasetVersion,
      startedAt: run.startedAt,
      models: run.models.map((m, i) => ({ ...m, summary: summaries[i] })),
      cases: table.rows.map((r) => {
        const c = labCase(r.caseId);
        return { caseId: r.caseId, area: c?.area ?? null, language: c?.language ?? null, expect: c?.expect ?? null, results: r.cells.filter((x) => x !== null) };
      }),
    },
    null,
    2
  );
}
