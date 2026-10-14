import { parseCsv } from '@/lib/import/csv';
import { daysBetween, formatDate, isIsoDate, newId, readDate } from './admissions-tracker';
import { MAX_DEVICE_ROWS } from './device-list';
import { money, num, pct, toCsv, type ReportSection, type ReportTone, type ToolReport } from './report';
import { whatsappDraftLink } from './whatsapp-draft';

// Promises to pay overdue fees, worked entirely in the browser (Decision
// Log C198-B). Pure, so the kept / broken rules, the totals and the CSV
// round trip are unit-tested without a browser. The calendar-day helpers
// are shared with the admissions tracker, the other follow-up tracker.
//
// Families who ask for help are kept apart: they never reach the reminder
// list and never get a WhatsApp draft. A named staff member speaks to them.

export interface FeePromise {
  id: string;
  student: string;
  className: string;
  phone: string; // the parent's phone
  amountDue: string;
  amountPromised: string; // blank means the whole amount due
  promisedDate: string; // YYYY-MM-DD
  owner: string; // who follows up
  amountReceived: string; // everything received against this promise
  receivedDate: string; // YYYY-MM-DD of the latest payment
  needsHelp: boolean;
  helpStaff: string; // the staff member who will speak to the family
  helpNote: string;
}

export const PROMISE_MAX = { student: 60, className: 30, phone: 20, amount: 12, owner: 60, helpStaff: 60, helpNote: 300 };

export type PromiseStatus = 'kept' | 'paid-late' | 'partly-kept' | 'broken' | 'due-today' | 'upcoming' | 'incomplete' | 'needs-help';

export const STATUS_LABEL: Record<PromiseStatus, string> = {
  kept: 'Kept',
  'paid-late': 'Paid after the date',
  'partly-kept': 'Partly kept',
  broken: 'Broken',
  'due-today': 'Due today',
  upcoming: 'Coming up',
  incomplete: 'Details missing',
  'needs-help': 'Needs help',
};

// Statuses that still have money to come and may get a polite reminder.
export const REMINDER_STATUSES: PromiseStatus[] = ['due-today', 'broken', 'partly-kept', 'upcoming'];

export function blankPromise(id = newId()): FeePromise {
  return { id, student: '', className: '', phone: '', amountDue: '', amountPromised: '', promisedDate: '', owner: '', amountReceived: '', receivedDate: '', needsHelp: false, helpStaff: '', helpNote: '' };
}

export function hasContent(p: FeePromise): boolean {
  return Boolean(p.student.trim() || p.phone.trim() || p.amountDue.trim() || p.amountPromised.trim());
}

// An amount as typed: commas, spaces, the rupee sign and "Rs" are allowed.
// NaN when blank or not a number.
export function amount(s: string): number {
  const t = s.trim().replace(/^rs\.?/i, '').replace(/[,\s₹]/g, '');
  return t === '' ? NaN : Number(t);
}

const badAmount = (s: string) => s.trim() !== '' && !(amount(s) >= 0);

export interface PromiseView {
  p: FeePromise;
  status: PromiseStatus;
  promised: number;
  received: number;
  balance: number;
  daysPast: number; // days since the promised date; negative while it is ahead
  missing: string[]; // what to fill in before the promise can be judged
}

// Kept: the amount promised received by the promised date (a payment with
// no date counts as on time). Paid after the date: received in full, but
// later. Partly kept: the date has passed with part of it received.
// Broken: the date has passed with nothing received.
export function viewPromise(p: FeePromise, today: string): PromiseView {
  const due = amount(p.amountDue);
  const typed = amount(p.amountPromised);
  const promised = p.amountPromised.trim() ? typed : due;
  const got = amount(p.amountReceived);
  const received = got > 0 ? got : 0;
  const balance = promised > 0 ? Math.max(0, promised - received) : 0;
  const daysPast = isIsoDate(p.promisedDate) ? daysBetween(p.promisedDate, today) : NaN;
  const base = { p, promised: promised > 0 ? promised : 0, received, balance, daysPast };
  if (p.needsHelp) return { ...base, status: 'needs-help', missing: p.helpStaff.trim() ? [] : ['staff member who will speak to the family'] };
  const missing = [
    !(promised > 0) || badAmount(p.amountPromised) ? 'amount promised' : '',
    !isIsoDate(p.promisedDate) ? 'promised date' : '',
    badAmount(p.amountDue) ? 'amount due as a number' : '',
    badAmount(p.amountReceived) ? 'amount received as a number' : '',
    p.receivedDate && !isIsoDate(p.receivedDate) ? 'date received' : '',
  ].filter(Boolean);
  if (missing.length) return { ...base, status: 'incomplete', missing };
  let status: PromiseStatus;
  if (received >= promised) status = isIsoDate(p.receivedDate) && daysBetween(p.promisedDate, p.receivedDate) > 0 ? 'paid-late' : 'kept';
  else if (daysPast > 0) status = received > 0 ? 'partly-kept' : 'broken';
  else status = daysPast === 0 ? 'due-today' : 'upcoming';
  return { ...base, status, missing };
}

export interface FeeTotals {
  promises: number; // promises that count: complete, and not marked as needing help
  promised: number;
  received: number;
  balance: number;
  counts: Record<PromiseStatus, number>;
}

export function feeTotals(views: PromiseView[]): FeeTotals {
  const counted = views.filter((v) => v.status !== 'needs-help' && v.status !== 'incomplete');
  const counts = Object.fromEntries(Object.keys(STATUS_LABEL).map((k) => [k, 0])) as Record<PromiseStatus, number>;
  for (const v of views) counts[v.status]++;
  return {
    promises: counted.length,
    promised: counted.reduce((a, v) => a + v.promised, 0),
    received: counted.reduce((a, v) => a + v.received, 0),
    balance: counted.reduce((a, v) => a + v.balance, 0),
    counts,
  };
}

const byName = (a: PromiseView, b: PromiseView) => a.p.student.localeCompare(b.p.student);

// The working lists: due today, then broken and partly kept (oldest
// first), then coming up (soonest first). Needs-help rows are never in
// them; they have their own list.
export function promiseLists(list: FeePromise[], today: string) {
  const views = list.filter(hasContent).map((p) => viewPromise(p, today));
  const of = (...s: PromiseStatus[]) => views.filter((v) => s.includes(v.status));
  return {
    views,
    dueToday: of('due-today').sort(byName),
    broken: of('broken', 'partly-kept').sort((a, b) => b.daysPast - a.daysPast || byName(a, b)),
    upcoming: of('upcoming').sort((a, b) => b.daysPast - a.daysPast || byName(a, b)),
    done: of('kept', 'paid-late').sort(byName),
    help: of('needs-help').sort(byName),
    incomplete: of('incomplete'),
  };
}

// ---- one-step updates ------------------------------------------------------------

const cents = (n: number) => String(Math.round(n * 100) / 100);

// A payment adds to what has been received and moves the received date.
export function recordPayment(p: FeePromise, paid: number, on: string): FeePromise {
  const before = amount(p.amountReceived);
  return { ...p, amountReceived: cents((before > 0 ? before : 0) + paid), receivedDate: isIsoDate(on) ? on : p.receivedDate };
}

// A new date for what is still to come. The amount promised becomes what
// has already been received plus the new amount (the balance when blank).
export function renewPromise(p: FeePromise, on: string, toPay: number | null, today: string): FeePromise {
  const v = viewPromise({ ...p, needsHelp: false }, today);
  const next = toPay !== null && toPay > 0 ? toPay : v.balance;
  return { ...p, promisedDate: on, amountPromised: next > 0 ? cents(v.received + next) : p.amountPromised };
}

export function askForHelp(p: FeePromise, staff: string, note: string): FeePromise {
  return { ...p, needsHelp: true, helpStaff: staff.trim().slice(0, PROMISE_MAX.helpStaff), helpNote: note.trim().slice(0, PROMISE_MAX.helpNote) };
}

// ---- WhatsApp draft -------------------------------------------------------------------

// A short, polite reminder for the school to edit and send itself. Never
// for a family that asked for help, and never with late-fee or penalty
// wording. Null when there is nothing to remind about.
export function reminderDraft(v: PromiseView, schoolName: string): string | null {
  if (v.p.needsHelp || !REMINDER_STATUSES.includes(v.status)) return null;
  const from = schoolName.trim() || 'the school office';
  const who = `${v.p.student.trim() || 'your child'}${v.p.className.trim() ? ` (${v.p.className.trim()})` : ''}`;
  const date = formatDate(v.p.promisedDate);
  const line: Record<string, string> = {
    upcoming: `As discussed, ${money(v.balance)} is planned for ${date}.`,
    'due-today': `As discussed, ${money(v.balance)} is planned for today, ${date}.`,
    broken: `We have not yet received the ${money(v.balance)} planned for ${date}.`,
    'partly-kept': `Thank you for the ${money(v.received)} received. The remaining ${money(v.balance)} planned for ${date} is still to come.`,
  };
  return [
    'Namaste,',
    [`This is a gentle reminder from ${from} about the fee for ${who}.`, line[v.status], 'If you have already paid, thank you, and please ignore this message. If you would like to talk about it, please reply or call the school office.', 'Thank you.'].join(' '),
  ].join('\n');
}

// The wa.me link, never for a family that asked for help.
export function reminderLink(p: FeePromise, text: string): string | null {
  return p.needsHelp ? null : whatsappDraftLink(p.phone, text);
}

// ---- report ------------------------------------------------------------------------------

const ownerOf = (v: PromiseView) => v.p.owner.trim() || '—';

export function feeReport(list: FeePromise[], today: string): ToolReport {
  const l = promiseLists(list, today);
  const t = feeTotals(l.views);
  const c = t.counts;
  const sections: ReportSection[] = [
    {
      kind: 'stats',
      heading: 'Totals',
      items: [
        { label: 'Amount promised', value: money(t.promised), note: `${num(t.promises)} ${t.promises === 1 ? 'promise' : 'promises'}` },
        { label: 'Amount received', value: money(t.received), tone: t.promised && t.received >= t.promised ? 'good' : 'neutral', note: t.promised ? `${pct((t.received / t.promised) * 100)} of the amount promised` : undefined },
        { label: 'Still to come', value: money(t.balance), tone: t.balance ? 'warn' : 'good' },
        { label: 'Kept', value: num(c.kept), tone: c.kept ? 'good' : 'neutral' },
        { label: 'Partly kept', value: num(c['partly-kept']), tone: c['partly-kept'] ? 'warn' : 'neutral' },
        { label: 'Broken', value: num(c.broken), tone: c.broken ? 'bad' : 'good' },
        { label: 'Due today', value: num(c['due-today']), tone: c['due-today'] ? 'warn' : 'neutral' },
        { label: 'Coming up', value: num(c.upcoming) },
        ...(c['paid-late'] ? [{ label: 'Paid after the date', value: num(c['paid-late']) }] : []),
        { label: 'Families needing help', value: num(c['needs-help']), note: 'Kept apart and never sent a reminder' },
      ],
    },
  ];
  const followCols = ['Student', 'Class', 'Parent phone', 'Promised', 'Received', 'Balance', 'Promised date', 'Status', 'Follow-up by'];
  const followRows = [...l.dueToday, ...l.upcoming];
  if (followRows.length) {
    sections.push({
      kind: 'table',
      heading: 'Follow-up list: due today and coming up',
      columns: followCols,
      rows: followRows.map((v) => [v.p.student, v.p.className, v.p.phone, money(v.promised), money(v.received), money(v.balance), formatDate(v.p.promisedDate), STATUS_LABEL[v.status], ownerOf(v)]),
      numeric: [false, false, false, true, true, true, false, false, false],
      rowTones: followRows.map((v): ReportTone | undefined => (v.status === 'due-today' ? 'warn' : undefined)),
    });
  } else sections.push({ kind: 'text', heading: 'Follow-up list: due today and coming up', text: 'No promises are due today or coming up.' });
  if (l.broken.length) {
    sections.push({
      kind: 'table',
      heading: 'Broken and partly kept promises',
      columns: ['Student', 'Class', 'Parent phone', 'Promised', 'Received', 'Balance', 'Promised date', 'Days since', 'Follow-up by'],
      rows: l.broken.map((v) => [v.p.student, v.p.className, v.p.phone, money(v.promised), money(v.received), money(v.balance), formatDate(v.p.promisedDate), num(v.daysPast), ownerOf(v)]),
      numeric: [false, false, false, true, true, true, false, true, false],
      rowTones: l.broken.map((v): ReportTone => (v.status === 'broken' ? 'bad' : 'warn')),
    });
  } else sections.push({ kind: 'text', heading: 'Broken and partly kept promises', text: 'No promise has been broken.' });
  if (l.help.length) {
    sections.push({
      kind: 'table',
      heading: 'Families needing help',
      columns: ['Student', 'Class', 'Amount due', 'Staff member', 'Note'],
      rows: l.help.map((v) => [v.p.student, v.p.className, Number.isFinite(amount(v.p.amountDue)) ? money(amount(v.p.amountDue)) : '', v.p.helpStaff.trim() || 'Not named yet', v.p.helpNote]),
      numeric: [false, false, true, false, false],
      rowTones: l.help.map((v): ReportTone | undefined => (v.p.helpStaff.trim() ? undefined : 'warn')),
    });
  }
  const toFill = [...l.incomplete, ...l.help.filter((v) => v.missing.length)];
  if (toFill.length) {
    sections.push({ kind: 'notes', heading: 'Details to complete', tone: 'warn', items: toFill.map((v) => `${v.p.student.trim() || 'A row with no student name'}: add the ${v.missing.join(' and the ')}.`) });
  }
  return {
    title: 'Fee promise follow-up list',
    subtitle: today ? `As on ${formatDate(today)}` : undefined,
    sections,
    assumptions: [
      'A promise is kept when the amount promised is recorded as received by the promised date. A payment with no date recorded counts as on time.',
      'A promise is broken when its date passes with nothing received, and partly kept when the date passes with part of it received. One paid in full after the date shows as paid after the date.',
      'When no amount promised is entered, the whole amount due is taken as the promise.',
      'Families marked as needing help are kept apart, are left out of the totals and never get a reminder. A named staff member speaks to them.',
    ],
    disclaimer: 'Made in your browser from the promises you entered. Nothing is sent to NetCyberAI. Check every amount against your fee register before speaking to a family.',
  };
}

// ---- storage and CSV --------------------------------------------------------------------

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const date = (v: unknown) => (typeof v === 'string' && isIsoDate(v) ? v : '');

// One row read back from this device's storage: only known fields of the
// right type and size. A row with no student, phone or amount is dropped.
export function cleanPromise(row: unknown): FeePromise | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  const p: FeePromise = {
    id: typeof r.id === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(r.id) ? r.id : newId(),
    student: text(r.student, PROMISE_MAX.student),
    className: text(r.className, PROMISE_MAX.className),
    phone: text(r.phone, PROMISE_MAX.phone),
    amountDue: text(r.amountDue, PROMISE_MAX.amount),
    amountPromised: text(r.amountPromised, PROMISE_MAX.amount),
    promisedDate: date(r.promisedDate),
    owner: text(r.owner, PROMISE_MAX.owner),
    amountReceived: text(r.amountReceived, PROMISE_MAX.amount),
    receivedDate: date(r.receivedDate),
    needsHelp: r.needsHelp === true,
    helpStaff: text(r.helpStaff, PROMISE_MAX.helpStaff),
    helpNote: text(r.helpNote, PROMISE_MAX.helpNote),
  };
  return hasContent(p) ? p : null;
}

export const PROMISE_COLUMNS = ['Student', 'Class', 'Parent phone', 'Amount due', 'Amount promised', 'Promised date', 'Follow-up by', 'Amount received', 'Received date', 'Needs help', 'Help staff member', 'Help note'];

type Field = Exclude<keyof FeePromise, 'id'>;
const COLUMN_FIELD: Record<string, Field> = {
  student: 'student',
  studentname: 'student',
  name: 'student',
  class: 'className',
  parentphone: 'phone',
  phone: 'phone',
  mobile: 'phone',
  amountdue: 'amountDue',
  due: 'amountDue',
  amountpromised: 'amountPromised',
  promised: 'amountPromised',
  promiseddate: 'promisedDate',
  promisedby: 'promisedDate',
  followupby: 'owner',
  owner: 'owner',
  followupowner: 'owner',
  amountreceived: 'amountReceived',
  received: 'amountReceived',
  receiveddate: 'receivedDate',
  datereceived: 'receivedDate',
  needshelp: 'needsHelp',
  hardship: 'needsHelp',
  helpstaffmember: 'helpStaff',
  staffmember: 'helpStaff',
  helpnote: 'helpNote',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const unprotect = (s: string) => s.replace(/^'(?=[=+\-@])/, '');

export function promiseTemplateCsv(): string {
  return toCsv([PROMISE_COLUMNS]);
}

export function promisesToCsv(list: FeePromise[]): string {
  return toCsv([
    PROMISE_COLUMNS,
    ...list.filter(hasContent).map((p) => [p.student, p.className, p.phone, p.amountDue, p.amountPromised, p.promisedDate, p.owner, p.amountReceived, p.receivedDate, p.needsHelp ? 'Yes' : '', p.helpStaff, p.helpNote]),
  ]);
}

const rowsWord = (n: number) => `${num(n)} ${n === 1 ? 'row' : 'rows'}`;

export function promisesFromCsv(csv: string): { rows: FeePromise[]; problems: string[]; error?: string } {
  const table = parseCsv(csv.replace(/^﻿/, ''));
  if (table.length < 2) return { rows: [], problems: [], error: 'The file has no promises. It needs a header row and at least one promise row.' };
  const fields = table[0].map((h) => COLUMN_FIELD[norm(h)]);
  if (!fields.includes('student')) return { rows: [], problems: [], error: 'The first row needs column names, starting with Student. Download the CSV template to see them.' };
  const rows: FeePromise[] = [];
  let skipped = 0;
  let over = 0;
  let badDates = 0;
  for (const cells of table.slice(1)) {
    const rec: Partial<Record<Field, string>> = {};
    fields.forEach((f, i) => {
      if (f && rec[f] === undefined) rec[f] = unprotect((cells[i] ?? '').trim());
    });
    const get = (f: Field) => rec[f] ?? '';
    if (!cells.some((c) => c.trim())) continue;
    if (rows.length >= MAX_DEVICE_ROWS) {
      over++;
      continue;
    }
    const readD = (f: Field) => {
      const d = readDate(get(f));
      if (d === null) badDates++;
      return d ?? '';
    };
    const p = cleanPromise({
      id: newId(),
      student: get('student'),
      className: get('className'),
      phone: get('phone'),
      amountDue: get('amountDue'),
      amountPromised: get('amountPromised'),
      promisedDate: readD('promisedDate'),
      owner: get('owner'),
      amountReceived: get('amountReceived'),
      receivedDate: readD('receivedDate'),
      needsHelp: /^(yes|y|true|1)$/i.test(get('needsHelp')),
      helpStaff: get('helpStaff'),
      helpNote: get('helpNote'),
    });
    if (p) rows.push(p);
    else skipped++;
  }
  const problems = [
    skipped ? `${rowsWord(skipped)} had no student, phone or amount and ${skipped === 1 ? 'was' : 'were'} left out.` : '',
    over ? `Only the first ${num(MAX_DEVICE_ROWS)} promises were opened; ${rowsWord(over)} more ${over === 1 ? 'was' : 'were'} left out.` : '',
    badDates ? `${num(badDates)} ${badDates === 1 ? 'date' : 'dates'} could not be read and ${badDates === 1 ? 'was' : 'were'} left blank. Write dates as 2026-10-14 or 14/10/2026.` : '',
  ].filter(Boolean);
  return { rows, problems };
}
