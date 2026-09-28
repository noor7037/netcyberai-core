import type { ToolReport } from './report';

// The shared shape of every calculator-style free tool: labelled fields
// (in English and Hinglish), a compute() that turns raw input strings
// into a ToolReport, and share-link encoding that can only ever carry
// non-personal fields. Pure TypeScript, so every tool's arithmetic is
// unit-tested without a browser.

export type Lang = 'en' | 'hi';
export interface Bi {
  en: string;
  hi: string;
}
export const bi = (en: string, hi: string): Bi => ({ en, hi });

export type Suffix = 'money' | 'percent' | 'days' | 'periods' | 'sqm' | 'sqft' | 'students' | 'hours' | 'months' | 'count';

export interface RowColumn {
  id: string;
  label: Bi;
  kind: 'number' | 'text';
  // A personal column (a teacher's name) is never saved into a share
  // link; it is replaced with "Row 1", "Row 2" and so on.
  personal?: boolean;
  min?: number;
  step?: number;
  suffix?: Suffix;
}

export type FieldDef =
  | { kind: 'number'; id: string; label: Bi; help?: Bi; min?: number; max?: number; step?: number; suffix?: Suffix }
  | { kind: 'select'; id: string; label: Bi; help?: Bi; options: { value: string; label: Bi }[] }
  | { kind: 'text'; id: string; label: Bi; help?: Bi; personal?: boolean }
  | { kind: 'rows'; id: string; label: Bi; help?: Bi; columns: RowColumn[]; addLabel: Bi; maxRows: number };

export interface FieldGroup {
  title: Bi;
  fields: FieldDef[];
}

export type Row = Record<string, string>;
export type Values = Record<string, string | Row[]>;

export interface ComputeResult {
  report: ToolReport;
  // Input problems in plain words, in the chosen language. When there are
  // any, the report is not shown, so nobody prints a wrong answer.
  errors: string[];
}

export interface ToolSpec {
  slug: string;
  rulesUpdated: string;
  groups: FieldGroup[];
  defaults: Values;
  compute: (v: Values, lang: Lang) => ComputeResult;
}

// ---- reading raw values --------------------------------------------------

export function str(v: Values, id: string): string {
  const x = v[id];
  return typeof x === 'string' ? x.trim() : '';
}

export function n(v: Values, id: string): number {
  const s = str(v, id).replace(/,/g, '');
  return s === '' ? NaN : Number(s);
}

export function rows(v: Values, id: string): Row[] {
  const x = v[id];
  return Array.isArray(x) ? x : [];
}

export function rn(r: Row, id: string): number {
  const s = (r[id] ?? '').trim().replace(/,/g, '');
  return s === '' ? NaN : Number(s);
}

// Collects "please fix" messages while reading numbers, so each tool
// validates its inputs in one readable block.
export class Checker {
  errors: string[] = [];
  constructor(private lang: Lang) {}

  num(value: number, label: Bi, opts: { min?: number; max?: number; int?: boolean } = {}): number {
    const name = label[this.lang];
    if (!Number.isFinite(value)) {
      this.errors.push(this.lang === 'en' ? `Enter a number for “${name}”.` : `“${name}” mein number bhariye.`);
      return 0;
    }
    if (opts.int && !Number.isInteger(value)) {
      this.errors.push(this.lang === 'en' ? `“${name}” must be a whole number.` : `“${name}” poora number hona chahiye.`);
    }
    if (opts.min !== undefined && value < opts.min) {
      this.errors.push(this.lang === 'en' ? `“${name}” cannot be less than ${opts.min}.` : `“${name}” ${opts.min} se kam nahi ho sakta.`);
    }
    if (opts.max !== undefined && value > opts.max) {
      this.errors.push(this.lang === 'en' ? `“${name}” cannot be more than ${opts.max}.` : `“${name}” ${opts.max} se zyada nahi ho sakta.`);
    }
    return value;
  }

  // An optional number: blank means the given fallback.
  opt(value: number, fallback: number, label: Bi, opts: { min?: number; max?: number; int?: boolean } = {}): number {
    return Number.isFinite(value) ? this.num(value, label, opts) : fallback;
  }

  add(en: string, hi: string) {
    this.errors.push(this.lang === 'en' ? en : hi);
  }
}

// ---- share links -----------------------------------------------------------

const MAX_VALUE_LENGTH = 60;

// Only numbers, choices and non-personal row columns go into a share
// link; free text and personal columns never do. The result lives in the
// URL fragment (#s=...), which browsers do not send to any server.
export function shareableValues(spec: ToolSpec, v: Values): Values {
  const out: Values = {};
  // The same real name always becomes the same stand-in ("Teacher 2"),
  // across every table of the tool, so clashes still show up in a shared
  // link while the name itself never leaves the device.
  const aliases = new Map<string, string>();
  const counters = new Map<string, number>();
  const alias = (label: string, value: string) => {
    const k = `${label}\u0000${value.trim().toLowerCase()}`;
    if (!value.trim()) return '';
    if (!aliases.has(k)) {
      const next = (counters.get(label) ?? 0) + 1;
      counters.set(label, next);
      aliases.set(k, `${label} ${next}`);
    }
    return aliases.get(k) as string;
  };
  for (const g of spec.groups) {
    for (const f of g.fields) {
      if (f.kind === 'text') continue;
      if (f.kind === 'rows') {
        out[f.id] = rows(v, f.id)
          .slice(0, f.maxRows)
          .map((r) => {
            const clean: Row = {};
            for (const c of f.columns) clean[c.id] = c.personal ? alias(c.label.en, r[c.id] ?? '') : (r[c.id] ?? '').slice(0, MAX_VALUE_LENGTH);
            return clean;
          });
      } else out[f.id] = str(v, f.id).slice(0, MAX_VALUE_LENGTH);
    }
  }
  return out;
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeShare(spec: ToolSpec, v: Values): string {
  return toBase64Url(JSON.stringify(shareableValues(spec, v)));
}

// Accepts only known, non-personal fields of the right type and size.
// Anything else in a crafted link is dropped, never trusted.
export function decodeShare(spec: ToolSpec, encoded: string): Values | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(encoded));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const out: Values = { ...spec.defaults };
  for (const g of spec.groups) {
    for (const f of g.fields) {
      const x = obj[f.id];
      if (f.kind === 'text') continue;
      if (f.kind === 'rows') {
        if (!Array.isArray(x)) continue;
        out[f.id] = x.slice(0, f.maxRows).map((r) => {
          const row: Row = {};
          for (const c of f.columns) {
            const cell = r && typeof r === 'object' ? (r as Record<string, unknown>)[c.id] : '';
            row[c.id] = typeof cell === 'string' ? cell.slice(0, MAX_VALUE_LENGTH) : '';
          }
          return row;
        });
      } else if (typeof x === 'string') {
        if (f.kind === 'select' && !f.options.some((o) => o.value === x)) continue;
        out[f.id] = x.slice(0, MAX_VALUE_LENGTH);
      }
    }
  }
  return out;
}

// ---- shared words ----------------------------------------------------------

export const UI = {
  language: bi('Language', 'Bhasha'),
  example: bi('Try with example values', 'Example values se try karein'),
  exampleBanner: bi(
    'These are example values. Replace them with your own numbers.',
    'Ye example values hain. Inki jagah apne school ke numbers bhariye.'
  ),
  reset: bi('Reset', 'Reset'),
  save: bi('Save on this device', 'Is device par save karein'),
  saved: bi('Saved in this browser only.', 'Sirf is browser mein save hua.'),
  clearSaved: bi('Forget saved values', 'Saved values hatayein'),
  share: bi('Copy share link', 'Share link copy karein'),
  shareDone: bi('Link copied. It carries only numbers, never names.', 'Link copy ho gaya. Ismein sirf numbers hain, naam nahi.'),
  print: bi('Print report', 'Report print karein'),
  pdf: bi('Download PDF', 'PDF download karein'),
  pdfBusy: bi('Preparing PDF…', 'PDF ban raha hai…'),
  csv: bi('Export CSV', 'CSV export karein'),
  importCsv: bi('Import CSV', 'CSV import karein'),
  email: bi('Email', 'Email'),
  whatsapp: bi('WhatsApp', 'WhatsApp'),
  fixFirst: bi('Please fix these first:', 'Pehle ye theek karein:'),
  addRow: bi('Add row', 'Row jodein'),
  remove: bi('Remove', 'Hatayein'),
  results: bi('Results', 'Nateeje'),
  assumptions: bi('Assumptions', 'Maanyataayein'),
  lastUpdated: bi('Rules last updated', 'Niyam last update'),
  privacy: bi(
    'Runs in your browser. Nothing you type is sent to NetCyberAI.',
    'Ye aapke browser mein chalta hai. Aap jo bhi bharte hain, NetCyberAI ko nahi bheja jata.'
  ),
} as const;
