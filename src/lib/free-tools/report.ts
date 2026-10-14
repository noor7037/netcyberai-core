import { hasProfile, schoolHeaderLines, type SchoolProfile } from './school-profile';

// The one report shape every free tool produces. The same object renders
// on screen (ReportView), in the print view, into the 300 DPI PDF
// (src/lib/pdf/report-canvas.ts) and into CSV, so the four can never
// disagree with each other.

export type ReportTone = 'good' | 'warn' | 'bad' | 'neutral';

export interface ReportStat {
  label: string;
  value: string;
  tone?: ReportTone;
  note?: string;
}

export type ReportSection =
  | { kind: 'stats'; heading?: string; items: ReportStat[] }
  | { kind: 'table'; heading: string; columns: string[]; rows: string[][]; numeric?: boolean[]; rowTones?: (ReportTone | undefined)[] }
  | { kind: 'notes'; heading: string; items: string[]; tone?: ReportTone }
  | { kind: 'text'; heading?: string; text: string };

// The school a report is prepared for, from the profile saved in this
// browser (school-profile.ts). Printed above the title when present.
export interface ReportSchool {
  name: string;
  lines: string[];
  logo?: string;
  logoAspect?: number;
}

export interface ToolReport {
  title: string;
  subtitle?: string;
  school?: ReportSchool;
  sections: ReportSection[];
  assumptions: string[];
  disclaimer: string;
}

export const RUPEE = '₹';

// Puts the saved school's name, address and codes on a report. A report
// without a saved school is returned unchanged.
export function withSchool(report: ToolReport, p: SchoolProfile): ToolReport {
  if (!hasProfile(p)) return report;
  return {
    ...report,
    school: { name: p.schoolName.trim(), lines: schoolHeaderLines(p), ...(p.logo ? { logo: p.logo, logoAspect: p.logoAspect } : {}) },
  };
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function money(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}${RUPEE}${inr.format(Math.abs(Math.round(n)))}`;
}

export function num(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  return digits === 0 ? inr.format(Math.round(n)) : inr2.format(Number(n.toFixed(digits)));
}

export function pct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return `${Number(n.toFixed(digits))}%`;
}

// Quote a value for CSV (RFC 4180) and neutralise spreadsheet formulas:
// a cell starting with = + - @ is prefixed with an apostrophe so opening
// the file in Excel can never execute anything.
export function csvCell(v: string): string {
  const safe = /^[=+\-@]/.test(v) && !/^-?₹?[0-9.,]+%?$/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

// Every table and stat block of a report as one CSV, section by section.
export function reportToCsv(r: ToolReport): string {
  const school = r.school ? [[r.school.name], ...r.school.lines.map((l) => [l]), []] : [];
  const out: string[][] = [...school, [r.title], ...(r.subtitle ? [[r.subtitle]] : []), []];
  for (const s of r.sections) {
    if (s.kind === 'stats') {
      if (s.heading) out.push([s.heading]);
      for (const it of s.items) out.push([it.label, it.value, it.note ?? '']);
    } else if (s.kind === 'table') {
      out.push([s.heading], s.columns, ...s.rows);
    } else if (s.kind === 'notes') {
      out.push([s.heading], ...s.items.map((i) => [i]));
    } else {
      if (s.heading) out.push([s.heading]);
      out.push([s.text]);
    }
    out.push([]);
  }
  out.push(['Assumptions'], ...r.assumptions.map((a) => [a]), [], [r.disclaimer]);
  return toCsv(out);
}
