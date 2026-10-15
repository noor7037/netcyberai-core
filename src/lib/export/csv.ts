import { NextResponse } from 'next/server';

// One CSV writer for every export in the app (docs/26, P5): the dashboard, the reports and Control's cost export
// all use it, so a cell is made safe in one place.
//
//   - A cell that a spreadsheet would run as a formula (it begins with =, +, -, @, a tab or a line break) is
//     written as text, unless it is a plain number.
//   - UTF-8 with a byte order mark, so Hindi opens correctly in Excel. Lines end with CRLF.
//   - The response is a download and is never cached.

export type CsvValue = string | number | null | undefined;

// The text of a cell, made safe from being run as a formula: a text that begins with =, +, -, @, a tab or a line
// break gets an apostrophe in front, unless it is a plain number. Shared with the .xlsx writer (./xlsx.ts).
export function formulaSafeText(value: string): string {
  const plainNumber = /^-?[0-9]+(\.[0-9]+)?$/.test(value);
  return !plainNumber && /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
}

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const safe = formulaSafeText(value);
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return `﻿${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

// `name` becomes the file's name: letters, digits, dot, dash and underscore only.
export function downloadFileName(name: string, extension: string): string {
  return `${name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'export'}.${extension}`;
}

export function csvResponse(name: string, csv: string): NextResponse {
  const file = downloadFileName(name, 'csv');
  return new NextResponse(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file}"`, 'Cache-Control': 'no-store' } });
}
