import { parseCsv } from '@/lib/import/csv';
import { money, toCsv, type ReportSection, type ReportStat, type ReportTone, type ToolReport } from './report';
import { browserStore, type KeyValueStore } from './school-profile';
import { daysBetween, dayNumber, readDate, showDate, toIso, type DayDate } from './student-data-check';

// RTE reimbursement claim sheet builder: children admitted under section
// 12(1)(c), claimed at the lower of the state's per-child rate and the
// school's fee (section 12(2)), with each child's documents and the age of
// every year's unpaid claim.
//
// The settings (year, rate, fees, document list and the claim history) are
// the school's own figures and are remembered in this browser. Children's
// details are never saved: they stay in the tab, or in a CSV the school
// saves itself. There is no default rate: it comes from the state's
// notification, typed by the school.

export const RTE_KEY = 'nca-free-tool:rte-claim-sheet-builder';

export const DEFAULT_DOCUMENTS = ['Admission order or lottery allotment', 'Proof of age', 'Income or category certificate', 'Proof of residence', 'Attendance record'];

export const MAX_DOCUMENTS = 12;
export const MAX_CHILDREN = 500;
export const MAX_CLASS_FEES = 20;
export const MAX_AGEING = 15;

export interface ClassFee {
  cls: string;
  fee: string;
}

export interface AgeingRow {
  year: string;
  claimed: string;
  // yyyy-mm-dd, from a date input.
  filed: string;
  received: string;
}

export interface RteSettings {
  year: string;
  rate: string;
  fee: string;
  classFees: ClassFee[];
  documents: string[];
  ageing: AgeingRow[];
}

export interface RteChild {
  name: string;
  cls: string;
  // yyyy-mm-dd, from a date input.
  admitted: string;
  // One tick per document, in the order of the settings' document list.
  docs: boolean[];
}

export const blankSettings = (): RteSettings => ({ year: '', rate: '', fee: '', classFees: [], documents: [...DEFAULT_DOCUMENTS], ageing: [] });
export const blankChild = (docCount: number): RteChild => ({ name: '', cls: '', admitted: '', docs: Array.from({ length: docCount }, () => false) });

// ---- settings in this browser ------------------------------------------------------

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const list = (v: unknown) => (Array.isArray(v) ? v : []);
const record = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

// Only known fields, only strings, each capped. Anything else is dropped.
export function cleanSettings(input: unknown): RteSettings {
  const src = record(input);
  return {
    year: text(src.year, 20),
    rate: text(src.rate, 14),
    fee: text(src.fee, 14),
    classFees: list(src.classFees)
      .slice(0, MAX_CLASS_FEES)
      .map(record)
      .map((r) => ({ cls: text(r.cls, 30), fee: text(r.fee, 14) })),
    documents: Array.isArray(src.documents)
      ? src.documents
          .map((d) => text(d, 80))
          .filter((d) => d.trim())
          .slice(0, MAX_DOCUMENTS)
      : [...DEFAULT_DOCUMENTS],
    ageing: list(src.ageing)
      .slice(0, MAX_AGEING)
      .map(record)
      .map((r) => ({ year: text(r.year, 20), claimed: text(r.claimed, 16), filed: text(r.filed, 10), received: text(r.received, 16) })),
  };
}

// The saved settings, or null when nothing is saved (or storage is off).
export function readRteSettings(store: KeyValueStore | null = browserStore()): RteSettings | null {
  if (!store) return null;
  try {
    const raw = store.getItem(RTE_KEY);
    return raw ? cleanSettings(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveRteSettings(s: RteSettings, store: KeyValueStore | null = browserStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(RTE_KEY, JSON.stringify(cleanSettings(s)));
    return true;
  } catch {
    return false;
  }
}

export function forgetRteSettings(store: KeyValueStore | null = browserStore()): void {
  try {
    store?.removeItem(RTE_KEY);
  } catch {
    // Nothing to forget.
  }
}

// ---- amounts and fees --------------------------------------------------------------

// A typed amount: commas, spaces and a rupee sign are allowed. NaN when blank.
export function amount(s: string): number {
  const t = s.replace(/[,\s₹]/g, '');
  return t === '' ? NaN : Number(t);
}

const unprefix = (s: string) => s.trim().toLowerCase().replace(/^(class|std|grade)\.?\s*/, '');
export const classKey = (s: string) => unprefix(s).replace(/[\s.\-/]+/g, '');

// The annual fee for a child's class: that class's own fee if one is set,
// then the fee for the class without its section ("5-A" and "5A" fall back
// to "5"), then the school's default fee. NaN when none is set.
export function feeForClass(s: RteSettings, cls: string): number {
  const fees = new Map(s.classFees.filter((f) => f.cls.trim()).map((f) => [classKey(f.cls), amount(f.fee)]));
  const own = fees.get(classKey(cls));
  if (own !== undefined) return own;
  const raw = unprefix(cls);
  const base = /^(.+?)[\s\-/]+[a-z]$/.exec(raw)?.[1] ?? /^(\d+)[a-z]$/.exec(raw)?.[1];
  const forBase = base ? fees.get(classKey(base)) : undefined;
  return forBase !== undefined ? forBase : amount(s.fee);
}

// ---- the claim -------------------------------------------------------------------

export type Applied = 'rate' | 'fee' | 'equal';
export const APPLIED_LABEL: Record<Applied, string> = { rate: 'State rate', fee: 'School fee', equal: 'Both the same' };

export interface ChildClaim {
  child: RteChild;
  fee: number;
  claim: number;
  applied: Applied;
  missing: string[];
}

export type AgeBucket = 'paid' | 'upTo90' | 'upTo180' | 'upTo365' | 'overYear';
export const BUCKET_LABEL: Record<AgeBucket, string> = {
  paid: 'Paid in full',
  upTo90: 'Up to 90 days',
  upTo180: '91 to 180 days',
  upTo365: '181 to 365 days',
  overYear: 'Over a year',
};
const BUCKET_TONE: Record<AgeBucket, ReportTone | undefined> = { paid: 'good', upTo90: undefined, upTo180: 'warn', upTo365: 'warn', overYear: 'bad' };

export function ageBucket(days: number, due: number): AgeBucket {
  if (due <= 0) return 'paid';
  if (days <= 90) return 'upTo90';
  if (days <= 180) return 'upTo180';
  if (days <= 365) return 'upTo365';
  return 'overYear';
}

export interface AgeingLine {
  year: string;
  claimed: number;
  filed: DayDate;
  received: number;
  due: number;
  days: number;
  bucket: AgeBucket;
}

export interface RteResult {
  errors: string[];
  claims: ChildClaim[];
  ageing: AgeingLine[];
  // Null when there are errors, or nothing has been entered yet.
  report: ToolReport | null;
}

const childIsBlank = (c: RteChild) => !c.name.trim() && !c.cls.trim() && !c.admitted.trim() && !c.docs.some(Boolean);
const ageingIsBlank = (r: AgeingRow) => !r.year.trim() && !r.claimed.trim() && !r.filed.trim() && !r.received.trim();

export function buildClaim(s: RteSettings, children: RteChild[], today: DayDate): RteResult {
  const errors: string[] = [];
  // Row numbers in messages count every row on screen, blank ones included.
  const kids = children.map((c, i) => ({ c, row: i + 1 })).filter(({ c }) => !childIsBlank(c));
  const rows = s.ageing.map((r, i) => ({ r, row: i + 1 })).filter(({ r }) => !ageingIsBlank(r));
  const rate = amount(s.rate);
  // A document just added and not yet named is left out until it has a name.
  const docs = s.documents.map((label, j) => ({ label: label.trim(), j })).filter((d) => d.label);

  if (kids.length && !(Number.isFinite(rate) && rate > 0)) errors.push('Enter the state’s per-child rate for the year, from your state’s notification.');
  if (s.fee.trim() && !(Number.isFinite(amount(s.fee)) && amount(s.fee) >= 0)) errors.push('Enter the school’s annual fee as a number.');
  s.classFees.forEach((f, i) => {
    if (!f.cls.trim() && !f.fee.trim()) return;
    if (!f.cls.trim()) errors.push(`Name the class for the fee in row ${i + 1}.`);
    else if (!(Number.isFinite(amount(f.fee)) && amount(f.fee) >= 0)) errors.push(`Enter the annual fee for class ${f.cls.trim()} as a number.`);
  });

  const noFee = new Set<string>();
  const claims: ChildClaim[] = [];
  for (const { c, row } of kids) {
    const who = c.name.trim() || `row ${row}`;
    if (!c.name.trim()) errors.push(`Add the child’s name in row ${row}.`);
    if (!c.cls.trim()) {
      errors.push(`Add the class for ${who}.`);
      continue;
    }
    if (c.admitted.trim() && !readDate(c.admitted)) errors.push(`Write the admission date for ${who} as dd-mm-yyyy.`);
    const fee = feeForClass(s, c.cls);
    if (!Number.isFinite(fee)) {
      noFee.add(c.cls.trim());
      continue;
    }
    claims.push({
      child: c,
      fee,
      claim: Math.min(rate, fee),
      applied: rate < fee ? 'rate' : fee < rate ? 'fee' : 'equal',
      missing: docs.filter((d) => !c.docs[d.j]).map((d) => d.label),
    });
  }
  for (const cls of noFee) errors.push(`Enter the school’s annual fee, or a fee for class ${cls}.`);

  const ageing: AgeingLine[] = [];
  for (const { r, row } of rows) {
    const year = r.year.trim() || `row ${row}`;
    if (!r.year.trim()) errors.push(`Add the academic year for claim row ${row}.`);
    const claimed = amount(r.claimed);
    const received = r.received.trim() ? amount(r.received) : 0;
    const filed = readDate(r.filed);
    if (!(Number.isFinite(claimed) && claimed >= 0)) errors.push(`Enter the amount claimed for ${year}.`);
    if (!(Number.isFinite(received) && received >= 0)) errors.push(`Enter the amount received for ${year} as a number.`);
    if (!filed) errors.push(`Enter the date the ${year} claim was filed.`);
    else if (daysBetween(filed, today) < 0) errors.push(`The date the ${year} claim was filed is after today.`);
    if (!filed || !Number.isFinite(claimed) || !Number.isFinite(received)) continue;
    const due = Math.max(0, claimed - received);
    const days = daysBetween(filed, today);
    ageing.push({ year, claimed, filed, received, due, days, bucket: ageBucket(days, due) });
  }
  ageing.sort((a, b) => dayNumber(a.filed) - dayNumber(b.filed));

  if (errors.length || (!claims.length && !ageing.length)) return { errors, claims, ageing, report: null };
  return { errors, claims, ageing, report: claimReport(s, rate, docs.length, claims, ageing) };
}

function claimReport(s: RteSettings, rate: number, docCount: number, claims: ChildClaim[], ageing: AgeingLine[]): ToolReport {
  const ready = claims.filter((c) => c.missing.length === 0);
  const total = claims.reduce((t, c) => t + c.claim, 0);
  const readyTotal = ready.reduce((t, c) => t + c.claim, 0);
  const due = ageing.reduce((t, a) => t + a.due, 0);
  const stats: ReportStat[] = [];
  const sections: ReportSection[] = [];

  if (claims.length) {
    stats.push(
      { label: 'Children listed', value: String(claims.length) },
      { label: 'Ready to claim', value: String(ready.length), tone: ready.length === claims.length ? 'good' : 'neutral', note: 'Every document on the list ticked' },
      { label: 'Missing documents', value: String(claims.length - ready.length), tone: ready.length < claims.length ? 'warn' : 'good', note: 'Children with a document still to collect' },
      { label: 'Claim for all children', value: money(total), note: `State rate ${money(rate)} per child, or the fee if lower` },
      { label: 'Claim for children ready', value: money(readyTotal) }
    );
  }
  if (ageing.length) {
    const old = ageing.some((a) => a.bucket === 'overYear');
    stats.push({ label: 'Still due from claims filed', value: money(due), tone: due > 0 ? (old ? 'bad' : 'warn') : 'good', note: old ? 'Includes a claim unpaid for over a year' : undefined });
  }
  sections.push({ kind: 'stats', items: stats });

  if (claims.length) {
    sections.push({
      kind: 'table',
      heading: 'Claim sheet',
      columns: ['No.', 'Child', 'Class', 'Admitted', 'School fee', 'State rate', 'Claim', 'Claimed at', 'Documents'],
      rows: [
        ...claims.map((c, i) => {
          const d = readDate(c.child.admitted);
          const have = docCount - c.missing.length;
          return [String(i + 1), c.child.name.trim(), c.child.cls.trim(), d ? showDate(d) : '—', money(c.fee), money(rate), money(c.claim), APPLIED_LABEL[c.applied], docCount ? (have === docCount ? `All ${docCount}` : `${have} of ${docCount}`) : '—'];
        }),
        ['', 'Total', '', '', '', '', money(total), '', `${ready.length} ready`],
      ],
      numeric: [true, false, false, false, true, true, true, false, false],
      rowTones: [...claims.map((c) => (c.missing.length ? ('warn' as const) : undefined)), undefined],
    });
    const missing = claims.flatMap((c, i) => (c.missing.length ? [`${i + 1}. ${c.child.name.trim()}, class ${c.child.cls.trim()}: ${c.missing.join(', ')}`] : []));
    sections.push(
      missing.length
        ? { kind: 'notes', heading: 'Missing documents', items: missing, tone: 'warn' }
        : { kind: 'notes', heading: 'Missing documents', items: ['Every child has every document on your list.'], tone: 'good' }
    );
  }

  if (ageing.length) {
    sections.push({
      kind: 'table',
      heading: 'Claims filed and still due, oldest first',
      columns: ['Academic year', 'Claimed', 'Filed on', 'Received', 'Still due', 'Days since filed', 'Age'],
      rows: [
        ...ageing.map((a) => [a.year, money(a.claimed), showDate(a.filed), money(a.received), money(a.due), String(a.days), BUCKET_LABEL[a.bucket]]),
        ['Total', money(ageing.reduce((t, a) => t + a.claimed, 0)), '', money(ageing.reduce((t, a) => t + a.received, 0)), money(due), '', ''],
      ],
      numeric: [false, true, false, true, true, true, false],
      rowTones: [...ageing.map((a) => BUCKET_TONE[a.bucket]), undefined],
    });
  }

  return {
    title: `RTE reimbursement claim sheet${s.year.trim() ? `, ${s.year.trim()}` : ''}`,
    subtitle: 'Children admitted under section 12(1)(c) of the RTE Act',
    sections,
    assumptions: [
      'Each child is claimed at the lower of the state’s per-child rate and the annual fee the school charges for the child’s class, as section 12(2) of the RTE Act sets.',
      'The state rate and the school’s fees are the figures you entered. Take the rate from your state’s RTE reimbursement notification for the year; the builder never fills one in.',
      'A class uses its own fee when you set one, otherwise the school’s annual fee. Each child is claimed for the full year at that amount; if your state pays part of a year for some children, adjust those claims by hand.',
      'A child is ready to claim when every document on your list is ticked.',
      'Days since filed are counted from the date each claim was filed to today. Still due is the amount claimed less the amount received.',
    ],
    disclaimer: 'This sheet prepares the figures. It does not file anything: file the claim on your state’s RTE portal or with the education office, and check every figure against the state’s notification.',
  };
}

// ---- children as CSV ------------------------------------------------------------------

const YES = new Set(['yes', 'y', '1', 'true', '✓', '✔', 'ok', 'done']);
const docKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const unguard = (v: string) => v.trim().replace(/^'(?=[=+\-@])/, '');

const named = (documents: string[]) => documents.map((label, j) => ({ label: label.trim(), j })).filter((d) => d.label);

export function childrenToCsv(children: RteChild[], documents: string[]): string {
  const docs = named(documents);
  return toCsv([
    ['name', 'class', 'admission_date', ...docs.map((d) => d.label)],
    ...children.filter((c) => !childIsBlank(c)).map((c) => {
      const d = readDate(c.admitted);
      return [c.name, c.cls, d ? showDate(d) : c.admitted, ...docs.map((x) => (c.docs[x.j] ? 'yes' : 'no'))];
    }),
  ]);
}

export const rteTemplateCsv = (documents: string[]) => `${toCsv([['name', 'class', 'admission_date', ...named(documents).map((d) => d.label)]])}\r\n`;

export interface ChildrenImport {
  children: RteChild[];
  // Columns that are neither a known column nor a document on the list.
  ignored: string[];
  unreadableDates: number;
  error?: string;
}

export function childrenFromCsv(csv: string, documents: string[]): ChildrenImport {
  const table = parseCsv(csv.replace(/^﻿/, ''));
  if (table.length < 2) return { children: [], ignored: [], unreadableDates: 0, error: 'The file has no rows of children.' };
  const head = table[0].map((h) => h.trim());
  const keys = head.map((h) => h.toLowerCase().replace(/[\s-]+/g, '_'));
  const find = (...names: string[]) => keys.findIndex((k) => names.includes(k));
  const iName = find('name', 'child', 'child_name', 'student', 'student_name');
  const iClass = find('class', 'class_name');
  const iDate = find('admission_date', 'date_of_admission', 'admitted', 'admission');
  if (iName < 0 || iClass < 0) return { children: [], ignored: [], unreadableDates: 0, error: 'The file needs a name column and a class column. Download the template to see the columns.' };
  const docCols = documents.map((d) => (d.trim() ? head.findIndex((h) => docKey(h) === docKey(d)) : -1));
  const used = new Set([iName, iClass, iDate, ...docCols]);
  const ignored = head.filter((h, i) => h && !used.has(i));
  let unreadableDates = 0;
  const children = table
    .slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .slice(0, MAX_CHILDREN)
    .map((r) => {
      const rawDate = iDate >= 0 ? unguard(r[iDate] ?? '') : '';
      const admitted = toIso(rawDate);
      if (rawDate && !admitted) unreadableDates += 1;
      return {
        name: unguard(r[iName] ?? '').slice(0, 80),
        cls: unguard(r[iClass] ?? '').slice(0, 30),
        admitted,
        docs: docCols.map((ci) => ci >= 0 && YES.has((r[ci] ?? '').trim().toLowerCase())),
      };
    });
  return { children, ignored, unreadableDates };
}
