import { parseCsv, rowsToRecords } from '@/lib/import/csv';
import { IMPORT_COLUMNS, basicRowErrors } from '@/lib/import/rules';
import { indiaDate } from '@/lib/time/india';

// Browser-side preview of the real student import (run-import.ts): same
// parser, same row rules. It cannot know which classes a school has set
// up, so it lists the class names found for the school to confirm.

export interface ImportCheckResult {
  rowCount: number;
  columns: string[];
  unknownColumns: string[];
  missingRequired: string[];
  rowIssues: { row: number; name: string; errors: string[] }[];
  duplicateAdmissionNos: { admissionNo: string; rows: number[] }[];
  classNames: { name: string; count: number }[];
  okRows: number;
}

export function checkImportCsv(text: string, today: string = indiaDate()): ImportCheckResult {
  const rows = parseCsv(text);
  const columns = rows.length ? rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean) : [];
  const known = new Set<string>(IMPORT_COLUMNS.map((c) => c.key));
  const records = rowsToRecords(rows);
  const rowIssues: ImportCheckResult['rowIssues'] = [];
  const byAdmission = new Map<string, number[]>();
  const classes = new Map<string, number>();

  records.forEach((rec, i) => {
    const row = i + 1;
    const errors = basicRowErrors(rec, today);
    if (errors.length) rowIssues.push({ row, name: rec.name?.trim() || '(no name)', errors });
    const adm = rec.admission_no?.trim();
    if (adm) byAdmission.set(adm, [...(byAdmission.get(adm) ?? []), row]);
    const cls = rec.class_name?.trim();
    if (cls) classes.set(cls, (classes.get(cls) ?? 0) + 1);
  });

  return {
    rowCount: records.length,
    columns,
    unknownColumns: columns.filter((c) => !known.has(c)),
    missingRequired: IMPORT_COLUMNS.filter((c) => c.required && !columns.includes(c.key)).map((c) => c.key),
    rowIssues,
    duplicateAdmissionNos: [...byAdmission.entries()].filter(([, r]) => r.length > 1).map(([admissionNo, r]) => ({ admissionNo, rows: r })),
    classNames: [...classes.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    okRows: records.length - rowIssues.length,
  };
}

export const IMPORT_TEMPLATE_CSV = `${IMPORT_COLUMNS.map((c) => c.key).join(',')}\nAarav Sharma,A-1001,5A,12,2015-04-23\n`;
