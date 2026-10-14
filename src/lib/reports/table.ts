import type { CsvValue } from '@/lib/export/csv';
import { isMessageKey, t, type Lang, type MessageKey } from '@/lib/i18n';
import { sayNumber } from '@/lib/insights/dashboard';
import type { ReportCell, ReportResult, ReportRow } from './types';

// A report as words and numbers (docs/26 slice 8h, C207): the table the
// screen draws and the CSV file are both written from one ReportResult by
// the functions here, column by column, so the file has the rows and the
// total of the screen. The screen writes a number for a person (Indian
// grouping, the rupee sign, a date in words); the file writes the same
// number for a spreadsheet (plain digits, rupees not paise, the date as
// YYYY-MM-DD), and says the unit in the column's heading.
//
// No database and no session here: a client screen may import this file.

type Column = ReportResult['columns'][number];

const say = (lang: Lang, key: string, params?: Record<string, string | number>): string => (isMessageKey(key) ? t(lang, key as MessageKey, params) : key);
const dayWords = (lang: Lang, iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
// One day, or a span "first/last", in words.
const spanWords = (lang: Lang, span: string) => {
  const [first, last] = span.split('/');
  return last ? t(lang, 'rpt.span', { from: dayWords(lang, first), to: dayWords(lang, last) }) : dayWords(lang, first);
};

// A cell as the screen writes it. An empty text says the column's own words for "not known"; any other empty cell is a dash.
export function sayCell(lang: Lang, column: Column, value: ReportCell): string {
  if (value === null || value === undefined) return column.empty ? t(lang, column.empty) : '–';
  switch (column.unit) {
    case 'count':
    case 'inr_paise':
    case 'percent':
      return sayNumber(Number(value), column.unit);
    case 'date':
      return dayWords(lang, String(value));
    case 'dates':
      return (value as string[]).map((d) => spanWords(lang, d)).join(', ');
    case 'word':
      return say(lang, `${column.words ?? ''}${value}`);
    default:
      return String(value);
  }
}

// A cell as the file writes it.
export function fileCell(lang: Lang, column: Column, value: ReportCell): CsvValue {
  if (value === null || value === undefined) return column.empty ? t(lang, column.empty) : null;
  switch (column.unit) {
    case 'count':
    case 'percent':
      return Number(value);
    case 'inr_paise':
      return Number(value) / 100;
    case 'dates':
      return (value as string[]).join('; ');
    case 'word':
      return say(lang, `${column.words ?? ''}${value}`);
    default:
      return String(value);
  }
}

// The heading of a column. In the file an amount says it is in rupees and a rate that it is a percentage.
export const sayHeading = (lang: Lang, column: Column): string => t(lang, column.label);
export const fileHeading = (lang: Lang, column: Column): string =>
  column.unit === 'inr_paise' ? t(lang, 'rpt.csv.rupees', { label: t(lang, column.label) }) : column.unit === 'percent' ? t(lang, 'rpt.csv.percent', { label: t(lang, column.label) }) : t(lang, column.label);

// The total row: the first column says "Total", the others what load.ts made of the rows.
const totalCell = <T>(lang: Lang, column: Column, index: number, total: ReportRow, write: (lang: Lang, column: Column, value: ReportCell) => T): T | string | null =>
  index === 0 ? t(lang, 'rpt.total') : total[column.key] === null || total[column.key] === undefined ? null : write(lang, column, total[column.key]);

// The screen's table: headings, rows and the total row, as words.
export function reportTable(lang: Lang, report: ReportResult): { headings: string[]; rows: string[][]; total: string[] | null } {
  return {
    headings: report.columns.map((c) => sayHeading(lang, c)),
    rows: report.rows.map((r) => report.columns.map((c) => sayCell(lang, c, r[c.key] ?? null))),
    total: report.total && report.columns.map((c, i) => totalCell(lang, c, i, report.total as ReportRow, sayCell) ?? ''),
  };
}

// The file: the same headings, the same rows in the same order, and the same total row last.
export function reportCsv(lang: Lang, report: ReportResult): { header: string[]; rows: CsvValue[][] } {
  const rows: CsvValue[][] = report.rows.map((r) => report.columns.map((c) => fileCell(lang, c, r[c.key] ?? null)));
  if (report.total) rows.push(report.columns.map((c, i) => totalCell(lang, c, i, report.total as ReportRow, fileCell)));
  return { header: report.columns.map((c) => fileHeading(lang, c)), rows };
}

// The words of a report with no rows: what is true, and what to do next. A report about a thing the school has
// not set up says that (docs/26 §3 rule 1), in the report's own words; any other empty report says that nothing
// was recorded, never a row of zeros.
export function reportEmpty(lang: Lang, report: Pick<ReportResult, 'id' | 'state'>): { title: string; do: string } {
  const part = report.state === 'not_set_up' ? 'notSetUp' : 'empty';
  return { title: say(lang, `rpt.${report.id}.${part}.title`), do: say(lang, `rpt.${report.id}.${part}.do`) };
}

// The words around a table.
export const reportTitle = (lang: Lang, id: string): string => say(lang, `rpt.${id}.title`);
export const reportAbout = (lang: Lang, id: string): string => say(lang, `rpt.${id}.about`);
export const reportRule = (lang: Lang, report: Pick<ReportResult, 'rule'>): string => say(lang, report.rule.key);
export const sayDay = dayWords;
