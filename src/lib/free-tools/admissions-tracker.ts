import { parseCsv } from '@/lib/import/csv';
import { MAX_DEVICE_ROWS } from './device-list';
import { num, pct, toCsv, type ReportSection, type ReportTone, type ToolReport } from './report';
import { waNumber } from './whatsapp-draft';

// Admission enquiries for one season, worked entirely in the browser
// (Decision Log C198-B). Pure, so today's follow-up list, the stage
// counts, conversion and the CSV round trip are unit-tested without a
// browser. Nothing here sends anything anywhere.

export const SOURCES = ['Walk-in', 'Phone call', 'WhatsApp', 'Website', 'Referral', 'Newspaper or hoarding', 'Other'] as const;
export type Source = (typeof SOURCES)[number];

export const STAGES = ['Enquiry', 'Visit booked', 'Visited', 'Form taken', 'Form submitted', 'Admitted', 'Not joining'] as const;
export type Stage = (typeof STAGES)[number];

// Admitted and not joining close an enquiry: it leaves today's list.
export const CLOSED_STAGES: Stage[] = ['Admitted', 'Not joining'];

export interface Enquiry {
  id: string;
  parentName: string;
  phone: string;
  childName: string;
  classWanted: string;
  source: Source;
  stage: Stage;
  nextStep: string;
  followUp: string; // YYYY-MM-DD, or '' when no date is set
  notes: string;
  notJoiningReason: string;
  added: string; // YYYY-MM-DD
  updated: string; // YYYY-MM-DD
}

export const ENQUIRY_MAX = { parentName: 60, phone: 20, childName: 60, classWanted: 30, nextStep: 120, notes: 2000, notJoiningReason: 120 };

export const QUIET_DAYS_DEFAULT = 14;

// ---- dates -------------------------------------------------------------------
// Dates are kept as YYYY-MM-DD strings (what a date input gives) and
// compared as calendar days, so no time zone can move a follow-up.

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function isoToday(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateParts(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? [y, mo, d] : null;
}

export function isIsoDate(s: string): boolean {
  return dateParts(s) !== null;
}

// A date cell from a CSV: '' when blank, YYYY-MM-DD for 2026-10-14 or
// 14/10/2026 (also with - or .), null when it cannot be read.
export function readDate(s: string): string | null {
  const t = s.trim();
  if (!t) return '';
  if (isIsoDate(t)) return t;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

const dayNumber = (iso: string) => {
  const p = dateParts(iso);
  return p ? Date.UTC(p[0], p[1] - 1, p[2]) / 86_400_000 : NaN;
};

// Whole days from one date to another (NaN when either is not a date).
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function addDays(iso: string, n: number): string {
  const p = dateParts(iso);
  return p ? new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10) : '';
}

export function formatDate(iso: string): string {
  const p = dateParts(iso);
  return p ? `${p[2]} ${MONTHS_SHORT[p[1] - 1]} ${p[0]}` : '';
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---- rows ----------------------------------------------------------------------

export function blankEnquiry(today: string, id = newId()): Enquiry {
  return { id, parentName: '', phone: '', childName: '', classWanted: '', source: 'Walk-in', stage: 'Enquiry', nextStep: '', followUp: '', notes: '', notJoiningReason: '', added: today, updated: today };
}

export function hasContent(e: Enquiry): boolean {
  return Boolean(e.parentName.trim() || e.childName.trim() || e.phone.trim());
}

export function isOpen(e: Enquiry): boolean {
  return !CLOSED_STAGES.includes(e.stage);
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const date = (v: unknown) => (typeof v === 'string' && isIsoDate(v) ? v : '');

// One row read back from this device's storage: only known fields, only
// strings of the right size, only listed sources and stages. A row with
// no parent, child or phone is dropped.
export function cleanEnquiry(row: unknown): Enquiry | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  const e: Enquiry = {
    id: typeof r.id === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(r.id) ? r.id : newId(),
    parentName: text(r.parentName, ENQUIRY_MAX.parentName),
    phone: text(r.phone, ENQUIRY_MAX.phone),
    childName: text(r.childName, ENQUIRY_MAX.childName),
    classWanted: text(r.classWanted, ENQUIRY_MAX.classWanted),
    source: SOURCES.includes(r.source as Source) ? (r.source as Source) : 'Other',
    stage: STAGES.includes(r.stage as Stage) ? (r.stage as Stage) : 'Enquiry',
    nextStep: text(r.nextStep, ENQUIRY_MAX.nextStep),
    followUp: date(r.followUp),
    notes: text(r.notes, ENQUIRY_MAX.notes),
    notJoiningReason: text(r.notJoiningReason, ENQUIRY_MAX.notJoiningReason),
    added: date(r.added),
    updated: date(r.updated),
  };
  return hasContent(e) ? e : null;
}

// ---- today's list ------------------------------------------------------------------

export interface DueItem {
  e: Enquiry;
  overdueDays: number; // 0 means due today
}
export interface QuietItem {
  e: Enquiry;
  quietDays: number;
}

// Open enquiries with a follow-up date of today or earlier, most overdue
// first; then open enquiries not already due that have had no update
// for quietAfter days or more, the longest silence first.
export function followUps(list: Enquiry[], today: string, quietAfter: number): { due: DueItem[]; quiet: QuietItem[] } {
  const open = list.filter((e) => hasContent(e) && isOpen(e));
  const due = open
    .filter((e) => isIsoDate(e.followUp) && daysBetween(e.followUp, today) >= 0)
    .map((e) => ({ e, overdueDays: daysBetween(e.followUp, today) }))
    .sort((a, b) => b.overdueDays - a.overdueDays || a.e.parentName.localeCompare(b.e.parentName));
  const dueIds = new Set(due.map((d) => d.e.id));
  const quiet = open
    .filter((e) => !dueIds.has(e.id))
    .map((e) => ({ e, quietDays: daysBetween(e.updated || e.added, today) }))
    .filter((q) => Number.isFinite(q.quietDays) && q.quietDays >= quietAfter)
    .sort((a, b) => b.quietDays - a.quietDays || a.e.parentName.localeCompare(b.e.parentName));
  return { due, quiet };
}

export interface Outcome {
  note: string;
  stage: Stage;
  nextStep: string;
  followUp: string;
  reason: string;
}

// "Record what happened" in one step: the note is added to the notes with
// today's date, the stage moves, and the next step and date are set. A
// closed enquiry keeps no follow-up date.
export function recordOutcome(e: Enquiry, o: Outcome, today: string): Enquiry {
  const note = o.note.trim().replace(/\s+/g, ' ');
  const notes = [e.notes.trim(), note ? `${formatDate(today)}: ${note}` : ''].filter(Boolean).join('\n').slice(-ENQUIRY_MAX.notes);
  const closed = CLOSED_STAGES.includes(o.stage);
  return {
    ...e,
    stage: o.stage,
    nextStep: closed ? '' : o.nextStep.trim().slice(0, ENQUIRY_MAX.nextStep),
    followUp: closed || !isIsoDate(o.followUp) ? '' : o.followUp,
    notJoiningReason: o.stage === 'Not joining' ? o.reason.trim().slice(0, ENQUIRY_MAX.notJoiningReason) : e.notJoiningReason,
    notes,
    updated: today,
  };
}

// ---- numbers -------------------------------------------------------------------------

export interface AdmissionsSummary {
  total: number;
  open: number;
  admitted: number;
  conversion: number | null; // admitted ÷ all enquiries, 0 to 1
  byStage: { stage: Stage; count: number }[];
  bySource: { source: Source; enquiries: number; admitted: number; notJoining: number; conversion: number | null }[];
  // How many enquiries are at each step or past it. Families marked not
  // joining are left out: the list does not keep how far they got.
  reached: { stage: Stage; count: number }[];
  reasons: { reason: string; count: number }[];
}

const PATH: Stage[] = STAGES.filter((s) => s !== 'Not joining');

export function admissionsSummary(list: Enquiry[]): AdmissionsSummary {
  const rows = list.filter(hasContent);
  const count = (f: (e: Enquiry) => boolean) => rows.filter(f).length;
  const total = rows.length;
  const admitted = count((e) => e.stage === 'Admitted');
  const reasons = new Map<string, number>();
  for (const e of rows.filter((x) => x.stage === 'Not joining')) {
    const r = e.notJoiningReason.trim() || 'No reason recorded';
    reasons.set(r, (reasons.get(r) ?? 0) + 1);
  }
  return {
    total,
    open: count(isOpen),
    admitted,
    conversion: total ? admitted / total : null,
    byStage: STAGES.map((stage) => ({ stage, count: count((e) => e.stage === stage) })),
    bySource: SOURCES.map((source) => {
      const enquiries = count((e) => e.source === source);
      const adm = count((e) => e.source === source && e.stage === 'Admitted');
      return { source, enquiries, admitted: adm, notJoining: count((e) => e.source === source && e.stage === 'Not joining'), conversion: enquiries ? adm / enquiries : null };
    }).filter((s) => s.enquiries > 0),
    reached: PATH.slice(1).map((stage, i) => ({ stage, count: count((e) => PATH.indexOf(e.stage) >= i + 1) })),
    reasons: [...reasons.entries()].map(([reason, n]) => ({ reason, count: n })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
  };
}

const childAndClass = (e: Enquiry) => [e.childName.trim(), e.classWanted.trim()].filter(Boolean).join(', ');

export function admissionsReport(list: Enquiry[], today: string, quietAfter: number): ToolReport {
  const s = admissionsSummary(list);
  const f = followUps(list, today, quietAfter);
  const share = (n: number) => (s.total ? pct((n / s.total) * 100) : '—');
  const rate = (r: number | null) => (r === null ? '—' : pct(r * 100));
  const overdue = f.due.filter((d) => d.overdueDays > 0).length;
  const sections: ReportSection[] = [
    {
      kind: 'stats',
      items: [
        { label: 'Enquiries', value: num(s.total), note: `${num(s.open)} still open` },
        { label: 'Admitted', value: num(s.admitted), tone: s.admitted ? 'good' : 'neutral' },
        { label: 'Conversion', value: rate(s.conversion), note: 'Admitted families ÷ all enquiries' },
        { label: 'Due today or overdue', value: num(f.due.length), tone: overdue ? 'bad' : f.due.length ? 'warn' : 'good', note: overdue ? `${num(overdue)} overdue` : undefined },
        { label: 'Gone quiet', value: num(f.quiet.length), tone: f.quiet.length ? 'warn' : 'good', note: `No update for ${num(quietAfter)} days or more` },
      ],
    },
    {
      kind: 'table',
      heading: 'Enquiries by stage',
      columns: ['Stage', 'Families', 'Share of enquiries'],
      rows: s.byStage.map((b) => [b.stage, num(b.count), share(b.count)]),
      numeric: [false, true, true],
    },
    {
      kind: 'table',
      heading: 'How far families have got',
      columns: ['Reached', 'Families', 'Share of enquiries'],
      rows: [['Enquiry', num(s.total), share(s.total)], ...s.reached.map((r) => [r.stage === 'Admitted' ? 'Admitted' : `${r.stage} or further`, num(r.count), share(r.count)])],
      numeric: [false, true, true],
    },
    {
      kind: 'table',
      heading: 'Conversion by source',
      columns: ['Source', 'Enquiries', 'Admitted', 'Not joining', 'Conversion'],
      rows: s.bySource.map((b) => [b.source, num(b.enquiries), num(b.admitted), num(b.notJoining), rate(b.conversion)]),
      numeric: [false, true, true, true, true],
    },
  ];
  if (f.due.length) {
    sections.push({
      kind: 'table',
      heading: 'Follow-ups due today and overdue',
      columns: ['Parent', 'Phone', 'Child and class', 'Stage', 'Next step', 'Follow-up date', 'Status'],
      rows: f.due.map((d) => [d.e.parentName, d.e.phone, childAndClass(d.e), d.e.stage, d.e.nextStep, formatDate(d.e.followUp), d.overdueDays ? `Overdue by ${num(d.overdueDays)} ${d.overdueDays === 1 ? 'day' : 'days'}` : 'Due today']),
      rowTones: f.due.map((d): ReportTone => (d.overdueDays ? 'bad' : 'warn')),
    });
  } else sections.push({ kind: 'text', heading: 'Follow-ups due today and overdue', text: 'No follow-ups are due today or overdue.' });
  if (f.quiet.length) {
    sections.push({
      kind: 'table',
      heading: 'Gone quiet',
      columns: ['Parent', 'Phone', 'Child and class', 'Stage', 'Last updated', 'Days without an update'],
      rows: f.quiet.map((q) => [q.e.parentName, q.e.phone, childAndClass(q.e), q.e.stage, formatDate(q.e.updated || q.e.added), num(q.quietDays)]),
      numeric: [false, false, false, false, false, true],
    });
  }
  if (s.reasons.length) {
    sections.push({ kind: 'table', heading: 'Why families are not joining', columns: ['Reason', 'Families'], rows: s.reasons.map((r) => [r.reason, num(r.count)]), numeric: [false, true] });
  }
  return {
    title: 'Admissions enquiry report',
    subtitle: today ? `As on ${formatDate(today)}` : undefined,
    sections,
    assumptions: [
      'Conversion is admitted families divided by all enquiries in the list, overall and for each source.',
      'Families marked not joining are left out of the “or further” counts, because the list does not record how far they got.',
      'Follow-ups due are open enquiries with a follow-up date of today or earlier.',
      `An open enquiry has gone quiet when it is not already due and has had no update for ${num(quietAfter)} days or more.`,
    ],
    disclaimer: 'Made in your browser from the enquiries you entered. Nothing is sent to NetCyberAI. Check the numbers against your admission register.',
  };
}

// ---- WhatsApp draft ------------------------------------------------------------------

const STAGE_LINE: Record<Stage, string> = {
  Enquiry: 'Would you like to visit the school? Please reply with a day and time that suits you.',
  'Visit booked': 'We look forward to your visit. Please reply if you need to change the day or time.',
  Visited: 'Thank you for visiting us. Please reply if you have any questions.',
  'Form taken': 'If you would like any help with the admission form, please reply and we will be glad to help.',
  'Form submitted': 'We have your admission form. Please reply if you have any questions about the next step.',
  Admitted: 'We are glad your child is joining us. Please reply if you have any questions.',
  'Not joining': '',
};

// A short, polite follow-up for the school to edit and send itself. A
// family marked not joining gets no follow-up.
export function followUpDraft(e: Enquiry, schoolName: string): string {
  if (e.stage === 'Not joining') return '';
  const parent = e.parentName.trim();
  const school = schoolName.trim();
  const cls = e.classWanted.trim();
  return [
    `Namaste${parent ? ` ${parent}` : ''},`,
    [school ? `This is the admissions office of ${school}.` : 'This is the school admissions office.', `Thank you for your enquiry about admission${cls ? ` to ${cls}` : ''}.`, STAGE_LINE[e.stage], 'Thank you.'].join(' '),
  ].join('\n');
}

// Why there is no WhatsApp link for this number, or null when there is one.
export function phoneProblem(phone: string): string | null {
  if (!phone.trim()) return 'Add a mobile number to open WhatsApp.';
  return waNumber(phone) ? null : 'This is not a 10-digit Indian mobile number, so there is no WhatsApp link. Check the number.';
}

// ---- CSV ---------------------------------------------------------------------------------

export const ENQUIRY_COLUMNS = ['Parent name', 'Phone', 'Child name', 'Class wanted', 'Source', 'Stage', 'Next step', 'Follow-up date', 'Notes', 'Not joining reason', 'Date added', 'Last updated'];

type TextField = Exclude<keyof Enquiry, 'id'>;
const COLUMN_FIELD: Record<string, TextField> = {
  parentname: 'parentName',
  parent: 'parentName',
  guardianname: 'parentName',
  phone: 'phone',
  mobile: 'phone',
  phonenumber: 'phone',
  mobilenumber: 'phone',
  parentphone: 'phone',
  childname: 'childName',
  child: 'childName',
  studentname: 'childName',
  student: 'childName',
  classwanted: 'classWanted',
  class: 'classWanted',
  source: 'source',
  stage: 'stage',
  status: 'stage',
  nextstep: 'nextStep',
  followupdate: 'followUp',
  followup: 'followUp',
  nextdate: 'followUp',
  notes: 'notes',
  note: 'notes',
  notjoiningreason: 'notJoiningReason',
  reason: 'notJoiningReason',
  dateadded: 'added',
  added: 'added',
  lastupdated: 'updated',
  updated: 'updated',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
// A cell the CSV writer protected from spreadsheet formulas ('+91...) is
// read back without the apostrophe.
const unprotect = (s: string) => s.replace(/^'(?=[=+\-@])/, '');

const SOURCE_ALIASES: Record<string, Source> = { phone: 'Phone call', call: 'Phone call', newspaper: 'Newspaper or hoarding', hoarding: 'Newspaper or hoarding', web: 'Website', reference: 'Referral' };
const STAGE_ALIASES: Record<string, Stage> = { new: 'Enquiry', visit: 'Visit booked', joined: 'Admitted', confirmed: 'Admitted', notjoined: 'Not joining', lost: 'Not joining' };

function matchSource(v: string): Source | null {
  return SOURCES.find((s) => norm(s) === norm(v)) ?? SOURCE_ALIASES[norm(v)] ?? null;
}
function matchStage(v: string): Stage | null {
  return STAGES.find((s) => norm(s) === norm(v)) ?? STAGE_ALIASES[norm(v)] ?? null;
}

export function enquiryTemplateCsv(): string {
  return toCsv([ENQUIRY_COLUMNS]);
}

export function enquiriesToCsv(list: Enquiry[]): string {
  return toCsv([ENQUIRY_COLUMNS, ...list.filter(hasContent).map((e) => [e.parentName, e.phone, e.childName, e.classWanted, e.source, e.stage, e.nextStep, e.followUp, e.notes, e.notJoiningReason, e.added, e.updated])]);
}

const rowsWord = (n: number) => `${num(n)} ${n === 1 ? 'row' : 'rows'}`;

// Reads a CSV the school saved from this tracker or made from the
// template. Unknown sources become Other and unknown stages Enquiry, and
// every change of that kind is reported back, never silent.
export function enquiriesFromCsv(csv: string, today: string): { rows: Enquiry[]; problems: string[]; error?: string } {
  const table = parseCsv(csv.replace(/^﻿/, ''));
  if (table.length < 2) return { rows: [], problems: [], error: 'The file has no enquiries. It needs a header row and at least one enquiry row.' };
  const fields = table[0].map((h) => COLUMN_FIELD[norm(h)]);
  if (!fields.some((f) => f === 'parentName' || f === 'childName' || f === 'phone')) {
    return { rows: [], problems: [], error: 'The first row needs column names such as Parent name, Phone and Child name. Download the CSV template to see them.' };
  }
  const rows: Enquiry[] = [];
  let skipped = 0;
  let over = 0;
  let badDates = 0;
  let badSource = 0;
  let badStage = 0;
  for (const cells of table.slice(1)) {
    const rec: Partial<Record<TextField, string>> = {};
    fields.forEach((f, i) => {
      if (f && rec[f] === undefined) rec[f] = unprotect((cells[i] ?? '').trim());
    });
    const get = (f: TextField) => rec[f] ?? '';
    if (!get('parentName') && !get('childName') && !get('phone')) {
      if (cells.some((c) => c.trim())) skipped++;
      continue;
    }
    if (rows.length >= MAX_DEVICE_ROWS) {
      over++;
      continue;
    }
    const readD = (f: TextField) => {
      const d = readDate(get(f));
      if (d === null) badDates++;
      return d ?? '';
    };
    const source = get('source') ? matchSource(get('source')) : 'Other';
    if (!source) badSource++;
    const stage = get('stage') ? matchStage(get('stage')) : 'Enquiry';
    if (!stage) badStage++;
    const added = readD('added') || today;
    const e = cleanEnquiry({
      id: newId(),
      parentName: get('parentName'),
      phone: get('phone'),
      childName: get('childName'),
      classWanted: get('classWanted'),
      source: source ?? 'Other',
      stage: stage ?? 'Enquiry',
      nextStep: get('nextStep'),
      followUp: readD('followUp'),
      notes: get('notes'),
      notJoiningReason: get('notJoiningReason'),
      added,
      updated: readD('updated') || added,
    });
    if (e) rows.push(e);
  }
  const problems = [
    skipped ? `${rowsWord(skipped)} had no parent name, child name or phone and ${skipped === 1 ? 'was' : 'were'} left out.` : '',
    over ? `Only the first ${num(MAX_DEVICE_ROWS)} enquiries were opened; ${rowsWord(over)} more ${over === 1 ? 'was' : 'were'} left out.` : '',
    badDates ? `${num(badDates)} ${badDates === 1 ? 'date' : 'dates'} could not be read and ${badDates === 1 ? 'was' : 'were'} left blank. Write dates as 2026-10-14 or 14/10/2026.` : '',
    badSource ? `${rowsWord(badSource)} had a source the tracker does not list and ${badSource === 1 ? 'was' : 'were'} set to Other.` : '',
    badStage ? `${rowsWord(badStage)} had a stage the tracker does not list and ${badStage === 1 ? 'was' : 'were'} set to Enquiry.` : '',
  ].filter(Boolean);
  return { rows, problems };
}
