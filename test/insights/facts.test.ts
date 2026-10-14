import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { getAttendanceRoster } from '@/lib/attendance/attendance';
import { presentRate } from '@/lib/attendance/day';
import { complaintFrom } from '@/components/complaints/complaint-words';
import { addNote, complaintsShown, isOverdue, listComplaints } from '@/lib/complaints/complaints';
import { loadFeesSummary } from '@/lib/fees/overdue';
import { t } from '@/lib/i18n';
import { FACTS, FACT_IDS, NO_LIST_YET, describeFact, loadFacts, type FactId, type FactResult, type RangeId } from '@/lib/insights';
import { attentionNumber, sayNumber, sayValue } from '@/lib/insights/dashboard';
import { PROXY_ARRANGERS, coverWork, needsCover, periodsToCover } from '@/lib/proxy/proxy';
import { decideLeave, leaveWaiting, onLeave } from '@/lib/staff/leave';
import { loadMyDay } from '@/lib/today/cards';
import { schoolSpend } from '@/lib/whatsapp/cost';
import { MESSAGE_ROWS_MAX, MESSAGE_ROWS_RECENT } from '@/lib/whatsapp/delivery';
import { A, ADMIN, B, C5A, C6B, EMPTY, FARAH, FARAH_COMPLAINT, G_FARAH, NEW_PRINCIPAL, PRINCIPAL, TARA, TARA_LEAVE, TODAY, accountant, admin, asPlatform, asWho, coordinator, day, ents, isSundayToday, principal, startSchool, tara, type Db, type Who } from './seed';

// School facts (docs/26 slice 8d, C203) on the whole schema, as the app's own database role.
//
// The acceptance sentence, first part: "Tile by tile on the full schema, the number equals the count of rows on
// the screen it opens." Each fact below is (1) checked against a count made by hand from the seeded rows, and
// (2) compared with what a person sees on opening the fact's own address: the PAGE reads the address (its own
// searchParams), and the list the page puts on the screen reads the rows, in that person's own session. The test
// adds no filter of its own: it counts the rows drawn and reads the number the list's title says. Every name and
// number is made up (seed.ts).

const session = vi.hoisted(() => ({ claims: null as any, run: null as any }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => session.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => session.claims }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  withTenantContext: (claims: any, fn: any) => session.run(claims, fn),
}));

import AdmissionsPage from '@/app/(school)/app/admissions/page';
import AttendancePage from '@/app/(school)/app/attendance/page';
import CommunicationPage from '@/app/(school)/app/communication/page';
import ComplaintsPage from '@/app/(school)/app/complaints/page';
import EventsPage from '@/app/(school)/app/events/page';
import FeesPage from '@/app/(school)/app/fees/page';
import TicketsPage from '@/app/(school)/app/help/ticket/page';
import HomeworkPage from '@/app/(school)/app/homework/page';
import ParentAiPage from '@/app/(school)/app/parent-ai/page';
import ProxyPage from '@/app/(school)/app/proxy/page';
import PtmPage from '@/app/(school)/app/ptm/page';
import PulsePage from '@/app/(school)/app/pulse/page';
import StaffPage from '@/app/(school)/app/staff/page';
import StudentsPage from '@/app/(school)/app/students/page';
import { GET as budgetRoute } from '@/app/api/app/communication/budget/route';
import { GET as messagesRoute } from '@/app/api/app/communication/messages/route';
import { GET as complaintsRoute } from '@/app/api/app/complaints/route';
import { GET as followupsRoute } from '@/app/api/app/followups/route';
import { GET as proxyRoute } from '@/app/api/app/proxy/route';
import { GET as studentsRoute } from '@/app/api/app/students/route';
import { AdmissionsWaiting } from '@/components/admissions/AdmissionsWaiting';
import { AttendanceDays, AttendanceShown } from '@/components/attendance/AttendanceShown';
import { BudgetView } from '@/components/communication/BudgetView';
import { MessagesView } from '@/components/communication/MessagesView';
import { NoticesShown } from '@/components/communication/NoticesShown';
import { ComplaintsShown } from '@/components/complaints/ComplaintsShown';
import { EventsShown } from '@/components/events/EventsShown';
import { FeesShown } from '@/components/fees/FeesShown';
import { HomeworkShown } from '@/components/homework/HomeworkShown';
import { ParentAiShown } from '@/components/parent-ai/ParentAiShown';
import { ProxyArranger, ProxyView } from '@/components/proxy/ProxyView';
import { PtmShown } from '@/components/ptm/PtmShown';
import { NeedsHelpView } from '@/components/pulse/NeedsHelpView';
import { PulseShown } from '@/components/pulse/PulseShown';
import { StaffLeaveShown } from '@/components/staff/StaffLeaveShown';
import { StudentsView } from '@/components/students/StudentsView';
import { TicketsShown } from '@/components/tickets/TicketsShown';

let db: Db;
const who = (w: Who) => ({ schoolId: w.school ?? A, userId: w.user, role: w.role as never });
const load = (w: Who, range: RangeId, off: string[] = []) => asWho(db, w, (c) => loadFacts(c, who(w), ents(off, w.school ?? A), { range }));
const byId = (facts: FactResult[]) => Object.fromEntries(facts.map((f) => [f.id, f])) as Record<FactId, FactResult>;
// Every read a page or a route makes runs as that person, in the app's own database role, and is rolled back.
// `within`: a test that must see what a page or a route WROTE sets this to its own open transaction (already that
// person's), so their reads and writes happen there; it is rolled back with the test's transaction.
let within: Db | null = null;
const signIn = (w: Who) => {
  session.claims = { sub: w.user, role: w.role, schoolId: w.school ?? A, membershipId: null, tv: 0 };
  session.run = (claims: any, fn: any) => (within ? fn(within) : asWho(db, { role: claims.role, user: claims.sub, school: claims.schoolId }, fn));
};

// ---- What a person sees on opening an address ------------------------------------
//
// `listed`: the rows on the screen. `said`: the number the list's own title (or count line, or pressed button)
// says. `rows`: each row's words. `text`: everything drawn. `figure`: for a screen that says a figure and lists
// nothing behind it.
type Opened = { listed: number; said: number | null; rows: string[]; text: string; figure?: { value: number | null; total: number | null } };

const PAGES: Record<string, (props: { searchParams: Record<string, string> }) => unknown> = {
  '/app/attendance': AttendancePage as never,
  '/app/students': StudentsPage as never,
  '/app/admissions': AdmissionsPage as never,
  '/app/fees': FeesPage as never,
  '/app/homework': HomeworkPage as never,
  '/app/pulse': PulsePage as never,
  '/app/communication': CommunicationPage as never,
  '/app/events': EventsPage as never,
  '/app/parent-ai': ParentAiPage as never,
  '/app/help/ticket': TicketsPage as never,
  '/app/complaints': ComplaintsPage as never,
  '/app/ptm': PtmPage as never,
  '/app/staff': StaffPage as never,
  '/app/proxy': ProxyPage as never,
};
// The lists of "the rows behind a number" a page may put on the screen for an address.
const LISTS: unknown[] = [AdmissionsWaiting, AttendanceShown, AttendanceDays, FeesShown, HomeworkShown, PulseShown, NoticesShown, EventsShown, ParentAiShown, TicketsShown, ComplaintsShown, PtmShown, StaffLeaveShown];

// An element of that type in the tree a page hands down (before anything is drawn).
const find = (el: any, type: unknown): any => {
  if (!el || typeof el !== 'object') return null;
  if (el.type === type) return el;
  for (const child of [].concat(el.props?.children ?? [])) {
    const found = find(child, type);
    if (found) return found;
  }
  return null;
};
const plain = (html: string) => html.replace(/<!-- -->/g, '');
const numberIn = (text: string) => Number(text.replace(/,/g, '').match(/\d+/)?.[0] ?? NaN);
// A list of rows as it is drawn: every row carries data-shown-row, and the title says how many there are.
const shownIn = (text: string): Opened => {
  const rows = [...text.matchAll(/<li[^>]*data-shown-row[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  const title = /<h2[^>]*data-shown-title[^>]*>([\s\S]*?)<\/h2>/.exec(text)?.[1] ?? '';
  return { listed: rows.length, said: numberIn(title.split(':').pop() ?? ''), rows, text };
};
const get = async (route: (req: NextRequest) => Promise<Response>, address: string) => {
  const res = await route(new NextRequest(`http://school.example${address}`));
  expect(res.status, address).toBe(200);
  return res.json();
};

// The page for an address, as that person, and the lists of rows it put on the screen.
async function pageFor(w: Who, href: string): Promise<{ url: URL; page: any; lists: any[] }> {
  const url = new URL(href, 'http://school.example');
  signIn(w);
  expect(Object.keys(PAGES), href).toContain(url.pathname);
  const page: any = await PAGES[url.pathname]({ searchParams: Object.fromEntries(url.searchParams) });
  return { url, page, lists: LISTS.map((type) => find(page, type)).filter(Boolean) };
}

async function open(w: Who, href: string): Promise<Opened> {
  const { url, page, lists } = await pageFor(w, href);
  expect(lists.length, `${href}: at most one list of rows`).toBeLessThanOrEqual(1);
  if (lists[0]) {
    // The list the page put on the screen for this address, drawn as the page would draw it.
    const made = await lists[0].type(lists[0].props);
    expect(made, `${href}: the list is drawn for ${w.role}`).toBeTruthy();
    return shownIn(plain(renderToStaticMarkup(made)));
  }
  // No list of rows for the address: the number is the screen's own list or figure, which the screen reads
  // from its own route. The request is the one the screen itself makes from what the page handed it.
  if (page.type === StudentsView) {
    const status = page.props.statusFilter;
    const body = await get(studentsRoute, `/api/app/students?status=${status}&limit=200`);
    expect(body.students.every((x: { status: string }) => x.status === status), href).toBe(true);
    return { listed: body.students.length, said: body.total, rows: [], text: '' };
  }
  const messages = find(page, MessagesView);
  if (messages && (messages.props.range || messages.props.initialState)) {
    const asked = new URLSearchParams();
    if (messages.props.initialState) asked.set('state', messages.props.initialState);
    if (messages.props.range) for (const k of ['from', 'to'] as const) asked.set(k, messages.props.range[k]);
    const body = await get(messagesRoute, `/api/app/communication/messages?${asked}`);
    const text = plain(renderToStaticMarkup(h(MessagesView, { ...messages.props, initial: body })));
    const pressed = /<button[^>]*aria-pressed="true"[^>]*>([\s\S]*?)<\/button>/.exec(text)?.[1] ?? '';
    return { listed: (text.match(/<li[^>]*data-message=/g) ?? []).length, said: numberIn(pressed.split('·').pop() ?? ''), rows: [], text };
  }
  if (url.pathname === '/app/pulse' && find(page, NeedsHelpView)) {
    const body = await get(followupsRoute, '/api/app/followups');
    return { listed: body.open.length, said: body.open.length, rows: [], text: '' };
  }
  if (url.pathname === '/app/communication' && find(page, BudgetView)) {
    const body = await get(budgetRoute, '/api/app/communication/budget');
    return { listed: 0, said: null, rows: [], text: '', figure: { value: body.budgetPaise === null ? null : body.spentPaise, total: body.budgetPaise } };
  }
  const proxy = find(page, ProxyView);
  if (url.pathname === '/app/proxy' && proxy) {
    // Proxy Auto reads its own route (today, when no date is asked for) and draws the day that comes back. The
    // page hands it the filter of the address, and the screen is drawn here with exactly what the page handed
    // it. On ?show=needs-cover it lists the periods that still need cover and no others, under a title that says
    // how many: read like every other list of rows, with no filter added by this test.
    const body = await get(proxyRoute, '/api/app/proxy');
    expect([body.arranger, body.day.date], href).toEqual([true, TODAY]);
    return shownIn(plain(renderToStaticMarkup(h(ProxyArranger, { data: body, show: proxy.props.show, busy: false, note: null, onPick: () => undefined, onAssign: () => undefined, onUndo: () => undefined }))));
  }
  throw new Error(`nothing on ${href} shows the rows of a number`);
}

// A figure each row of a list carries, for the facts that are a sum of it.
const paise = (rupees: string) => Math.round(Number(rupees.replace(/,/g, '')) * 100);
const IN_A_ROW: Partial<Record<FactId, { find: RegExp; as: (text: string) => number }>> = {
  'fees.collected': { find: / · ₹([\d,]+(?:\.\d\d)?)</, as: paise },
  'fees.owed': { find: /left ₹([\d,]+(?:\.\d\d)?)\./, as: paise },
  'fees.overdue': { find: /left ₹([\d,]+(?:\.\d\d)?)\./, as: paise },
  'pulse.understood': { find: /Answers: (\d+) understood/, as: Number },
  'pulse.needs_help': { find: /understood, (\d+) needs help/, as: Number },
  'homework.not_done': { find: /not done (\d+)\./, as: Number },
};

// Every fact a person was given, compared with the screen its address opens, in their own session.
async function sameAsItsScreen(w: Who, range: RangeId): Promise<{ compared: FactId[]; noAddress: FactId[] }> {
  const { facts } = await load(w, range);
  const compared: FactId[] = [];
  const noAddress: FactId[] = [];
  for (const f of facts) {
    const label = `${f.id} (${range}, ${w.role})`;
    if (f.state === 'not_set_up') continue;
    if (f.href === null) {
      noAddress.push(f.id); // counted and shown, opens nothing
      continue;
    }
    const seen = await open(w, f.href);
    compared.push(f.id);
    if (seen.figure) {
      // The screen says the figure itself.
      expect(f.drill, label).toBe('figure');
      expect([f.value, f.total ?? null], label).toEqual([seen.figure.value, seen.figure.total]);
      continue;
    }
    // Whatever the number is, its list says how many rows it has and lists that many.
    expect(seen.said, `${label}: the title's count and the rows listed`).toBe(seen.listed);
    const inRows = IN_A_ROW[f.id];
    const sum = inRows ? seen.rows.reduce((a, row) => a + inRows.as(inRows.find.exec(row)?.[1] ?? 'not there'), 0) : null;
    if (f.id === 'attendance.present_rate') {
      // The rate: the list's rows are the days it is worked out from, its title line says the same rate, and the
      // marks written on the rows give that rate.
      expect(f.drill, label).toBe('figure');
      expect(seen.listed, label).toBe(f.total);
      const marks = { present: 0, late: 0, absent: 0, leave: 0 };
      for (const row of seen.rows) {
        const m = /Present (\d+), late (\d+), absent (\d+), on leave (\d+)\./.exec(row)!;
        marks.present += Number(m[1]);
        marks.late += Number(m[2]);
        marks.absent += Number(m[3]);
        marks.leave += Number(m[4]);
      }
      expect(presentRate(marks), label).toBe(f.value);
      if (f.value !== null) expect(seen.text, label).toContain(`In school (present or late): ${sayNumber(f.value, 'percent')} of the ${marks.present + marks.late + marks.absent + marks.leave} marks`);
    } else if (f.drill === 'sum') {
      expect(sum, label).toBe(f.value);
    } else if (f.count !== undefined) {
      // An amount: the rows are its entries, and they add up to it.
      expect(seen.listed, label).toBe(f.count);
      expect(sum, label).toBe(f.value);
    } else if (f.state === 'no_data') {
      expect(seen.listed, label).toBe(0);
    } else {
      expect(seen.listed, label).toBe(f.value);
    }
    // An amount is also said in the list's title, written as the tile writes it.
    if (f.unit === 'inr_paise' && f.value !== null) expect(seen.text, label).toContain(`${sayNumber(f.value, 'inr_paise')} in all`);
  }
  return { compared, noAddress };
}

describe('school facts on the whole schema', () => {
  beforeAll(async () => {
    db = await startSchool();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  }, 180_000);
  afterAll(async () => db?.stop());

  it('the registry: every fact has one definition, a rule version, its tables and its roles', () => {
    expect(FACTS.map((f) => f.id)).toEqual([...FACT_IDS]);
    for (const f of FACTS) {
      expect(f.roles.length, f.id).toBeGreaterThan(0);
      expect(f.sources.length, f.id).toBeGreaterThan(0);
      expect(f.version, f.id).toBeGreaterThanOrEqual(1);
      expect(describeFact(f.id).rule).toEqual({ key: `fact.${f.id}.rule`, version: f.version });
    }
  });

  it('today, counted by hand: attendance (a student on leave is marked), students, fees, Pulse, homework, messages and the rest', async () => {
    const { facts, failed, today, range } = await load(principal, 'today');
    expect(failed).toEqual([]);
    expect([today, range]).toEqual([TODAY, { from: TODAY, to: TODAY }]);
    const f = byId(facts);
    // Attendance: 5-A is marked, 6-B is not; 7-C has no student and is not a class to mark.
    expect(f['attendance.classes_marked']).toMatchObject({ value: 1, total: 2, state: 'ok', period: 'today' });
    expect(f['attendance.classes_unmarked']).toMatchObject({ value: 1, total: 2, attention: !isSundayToday });
    // Present, late, absent AND on leave are marked: 4 of the 8 on a roll. (The first dashboard said 3.)
    expect(f['attendance.students_marked']).toMatchObject({ value: 4, total: 8 });
    expect([f['attendance.present'].value, f['attendance.absent'].value, f['attendance.late'].value, f['attendance.leave'].value]).toEqual([1, 1, 1, 1]);
    // In school (present or late) out of the four marks saved today; the day on leave is not an absence.
    expect(f['attendance.present_rate']).toMatchObject({ value: 50, unit: 'percent', total: 1, drill: 'figure', href: `/app/attendance?show=days&from=${TODAY}&to=${TODAY}` });
    expect(f['attendance.present_rate'].parts).toEqual([{ key: 'present', value: 1 }, { key: 'late', value: 1 }, { key: 'absent', value: 1 }, { key: 'leave', value: 1 }]);
    expect(f['students.active']).toMatchObject({ value: 8, total: 10 });
    expect(f['students.waiting_consent']).toMatchObject({ value: 1, total: 9, attention: true });
    // Fees: 500 received today; 2 entries overdue for 2,500 in all; 6,000 owed and not yet due.
    expect(f['fees.collected']).toMatchObject({ value: 50000, count: 1, unit: 'inr_paise', range: { from: TODAY, to: TODAY } });
    expect(f['fees.overdue']).toMatchObject({ value: 250000, count: 2, attention: true });
    expect(f['fees.owed']).toMatchObject({ value: 600000 });
    expect(f['fees.promises_due']).toMatchObject({ value: 2, attention: true });
    expect(f['fees.upi_to_verify']).toMatchObject({ value: 1, attention: true });
    expect(f['pulse.sent']).toMatchObject({ value: 1, parts: [{ key: 'queued', value: 1 }, { key: 'held', value: 1 }] });
    expect([f['pulse.understood'].value, f['pulse.needs_help'].value]).toEqual([1, 1]);
    expect(f['followups.open']).toMatchObject({ value: 2, attention: true });
    // Homework: one set today. Two are due today: the one for 6-B is not checked for the whole section (one
    // "not done"); the one for 7-C, which has nobody on its roll, is not "due" and not "checked for everyone".
    expect(f['homework.set'].value).toBe(1);
    expect(f['homework.checked']).toMatchObject({ value: 0, total: 1 });
    expect(f['homework.not_done'].value).toBe(1);
    // Messages written today: delivered, held back, waiting to go.
    expect(f['messages.total'].value).toBe(3);
    expect(Object.fromEntries(f['messages.total'].parts!.map((p) => [p.key, p.value]))).toEqual({ queued: 1, uncertain: 0, sent: 0, delivered: 1, read: 0, failed: 0, held: 1 });
    expect(f['messages.failed']).toMatchObject({ value: 0, attention: false });
    expect(f['messages.held']).toMatchObject({ value: 1, attention: true });
    expect(f['whatsapp.spend']).toMatchObject({ state: 'ok', total: 50000, unit: 'inr_paise', period: 'month' });
    expect(f['whatsapp.spend'].value).toBeGreaterThan(0);
    // Complaints: three open (one of them past its time), one closed. Each number opens its own list.
    expect([f['complaints.open'].value, f['complaints.overdue'].value]).toEqual([3, 1]);
    expect([f['complaints.open'].href, f['complaints.overdue'].href]).toEqual(['/app/complaints?show=open', '/app/complaints?show=overdue']);
    expect(f['complaints.overdue'].attention).toBe(true);
    expect(f['notices.waiting']).toMatchObject({ value: 2, attention: true, href: '/app/communication?show=notices' });
    // Meetings: the one dated today (a draft, no times yet) and the one in five days (two times, one booked).
    expect(f['ptm.coming']).toMatchObject({ value: 2, href: '/app/ptm?show=coming', parts: [{ key: 'slots', value: 2 }, { key: 'booked', value: 1 }] });
    expect(f['events.coming']).toMatchObject({ value: 1, href: '/app/events?show=coming', parts: [{ key: 'invited', value: 0 }, { key: 'yes', value: 2 }, { key: 'no', value: 1 }] });
    expect(f['parent_ai.drafts']).toMatchObject({ value: 1, href: '/app/parent-ai?show=drafts' });
    expect([f['tickets.open'].value, f['tickets.waiting'].value]).toEqual([2, 1]);
    expect([f['tickets.open'].href, f['tickets.waiting'].href]).toEqual(['/app/help/ticket?show=open', '/app/help/ticket?show=waiting']);
    // Leave: two requests wait (Tara's and the school admin's own); Tarun's approved leave covers today. The
    // refused request, the withdrawn one, the leave that ended and the leave still to come are not "today".
    // The principal may decide both, so both ask for the principal.
    expect(f['staff.leave_waiting']).toMatchObject({ state: 'ok', value: 2, attention: true, attentionCount: 2, period: 'now', href: '/app/staff?show=leave-waiting' });
    expect(f['staff.on_leave_today']).toMatchObject({ state: 'ok', value: 1, attention: false, period: 'today', href: '/app/staff?show=on-leave-today', range: { from: TODAY, to: TODAY } });
    // Covers: Tarun's three periods today. One is covered; one has no cover (the one assigned was undone); one was
    // given to Tara, who teaches her own class then. Two of the three still need cover.
    // The number opens Proxy Auto on those two periods, not on all three.
    expect(f['proxy.uncovered_today']).toMatchObject({ state: 'ok', value: 2, total: 3, attention: true, period: 'today', href: '/app/proxy?show=needs-cover' });
    expect(sayValue('en', f['proxy.uncovered_today'])).toBe('2 of 3');
    // Every fact says when it was counted, by which rule and from which tables.
    for (const fact of facts) {
      expect(Date.now() - Date.parse(fact.countedAt), fact.id).toBeLessThan(120_000);
      expect(fact.rule.key, fact.id).toBe(`fact.${fact.id}.rule`);
    }
  });

  it('every number has an address, and the address names the filter that lists exactly its rows', async () => {
    const { facts } = await load(principal, '7d');
    // No fact waits for its screen any more: complaints and meetings open their own lists. (A fact added before
    // its screen can list its rows would be named in NO_LIST_YET and drawn without a link.)
    expect([...NO_LIST_YET]).toEqual([]);
    expect(facts.map((f) => f.id)).toEqual([...FACT_IDS]);
    expect(facts.filter((f) => f.href === null).map((f) => f.id)).toEqual([...NO_LIST_YET]);
    for (const f of facts) {
      expect(f.href, f.id).toMatch(/^\/app\//);
      // Two screens ARE the list as they stand and need no filter: the students waiting for consent and the
      // needs-help queue. The month's spend is a figure the Communication screen says itself. Proxy Auto as it
      // stands draws the covered periods too, so its number carries a filter like the rest.
      const plainAddress: Partial<Record<FactId, string>> = { 'students.waiting_consent': '/app/admissions', 'followups.open': '/app/pulse', 'whatsapp.spend': '/app/communication' };
      if (plainAddress[f.id]) expect(f.href, f.id).toBe(plainAddress[f.id]);
      else expect(f.href, f.id).toMatch(/\?(show|status|state|from)=/);
    }
  });

  it('the range changes what a ranged fact counts, and nothing else', async () => {
    const week = byId((await load(principal, '7d')).facts);
    const month = byId((await load(principal, '30d')).facts);
    expect(week['fees.collected']).toMatchObject({ value: 150000, count: 2, range: { from: day(6), to: TODAY }, parts: [{ key: 'receipts', value: 2 }, { key: 'reversed', value: 1 }] });
    expect(month['fees.collected']).toMatchObject({ value: 650000, count: 3, range: { from: day(29), to: TODAY } });
    // 8 of 13 marks in the week, 11 of 16 in the month, in school.
    expect([week['attendance.present_rate'].value, week['attendance.present_rate'].total]).toEqual([61.5, 3]);
    expect([month['attendance.present_rate'].value, month['attendance.present_rate'].total]).toEqual([68.8, 4]);
    expect(week['attendance.present_rate'].series).toHaveLength(7);
    expect(week['attendance.present_rate'].series!.find((p) => p.date === day(2))).toEqual({ date: day(2), value: null }); // a day with no mark is a gap, not zero
    expect(week['attendance.present_rate'].series!.find((p) => p.date === day(3))).toEqual({ date: day(3), value: 50 });
    expect([week['pulse.sent'].value, week['pulse.understood'].value, week['pulse.needs_help'].value]).toEqual([2, 3, 1]);
    // Set: the one for 7-C (nobody on its roll) was given out, so it is counted as set.
    expect([week['homework.set'].value, month['homework.set'].value]).toEqual([4, 5]);
    expect([week['homework.checked'].value, week['homework.checked'].total, week['homework.not_done'].value]).toEqual([1, 2, 3]);
    expect([month['homework.checked'].value, month['homework.checked'].total, month['homework.not_done'].value]).toEqual([1, 3, 3]);
    expect([week['messages.total'].value, week['messages.failed'].value, week['messages.held'].value]).toEqual([6, 1, 1]);
    expect([month['messages.total'].value, month['messages.failed'].value, month['messages.held'].value]).toEqual([7, 1, 2]);
    expect(week['messages.failed'].attention).toBe(true);
    // "As of now", "today" and "coming" facts do not move with the range.
    for (const id of ['attendance.classes_marked', 'attendance.present', 'students.active', 'fees.overdue', 'fees.owed', 'followups.open', 'complaints.open', 'ptm.coming', 'tickets.open', 'staff.leave_waiting', 'staff.on_leave_today', 'proxy.uncovered_today'] as const) {
      expect([week[id].value, week[id].total, week[id].range], id).toEqual([month[id].value, month[id].total, month[id].range]);
    }
  });

  it('tile by tile, the number equals the rows of the screen it opens: today, 7 days and 30 days', async () => {
    for (const range of ['today', '7d', '30d'] as const) {
      // Every fact of the principal is opened and compared: complaints, meetings, leave and covers like the rest.
      // None is skipped, and none is without an address.
      const seen = await sameAsItsScreen(principal, range);
      expect(seen.noAddress, range).toEqual([]);
      expect(seen.compared, range).toEqual([...FACT_IDS]);
      const office = await sameAsItsScreen(admin, range);
      expect([office.noAddress, office.compared], range).toEqual([[], [...FACT_IDS]]);
    }
  });

  it('and for the other roles, each in their own session: a teacher’s own classes, the accountant’s fees, the coordinator’s learning', async () => {
    for (const w of [tara, accountant, coordinator]) {
      const seen = await sameAsItsScreen(w, '7d');
      expect(seen.compared.length, w.role).toBeGreaterThanOrEqual(8);
    }
    // What Tara's own lists hold: her class, her waiting notice, the events and drafts of her class, her ticket.
    const hers = byId((await load(tara, '7d')).facts);
    expect((await open(tara, hers['notices.waiting'].href!)).rows.join(' ')).toContain('Bring a water bottle.');
    expect((await open(tara, hers['notices.waiting'].href!)).rows.join(' ')).not.toContain('School closes early');
    expect((await open(tara, hers['tickets.open'].href!)).rows.join(' ')).toContain('How do I mark leave?');
    expect([(await open(tara, hers['events.coming'].href!)).listed, (await open(tara, hers['parent_ai.drafts'].href!)).listed]).toEqual([hers['events.coming'].value, hers['parent_ai.drafts'].value]);
  });

  it('the lists that were missing: what each one holds, and what it leaves out', async () => {
    const f = byId((await load(principal, '7d')).facts);
    // Notices: the two waiting, not the one already sent.
    const notices = await open(principal, f['notices.waiting'].href!);
    expect(notices.text).toContain('Notices waiting for approval: 2');
    expect([notices.rows.join(' ').includes('Bring a water bottle.'), notices.rows.join(' ').includes('School closes early on Friday.'), notices.text.includes('Sports day kit.')]).toEqual([true, true, false]);
    // Events: the one in three days, not the one five days ago.
    const events = await open(principal, f['events.coming'].href!);
    expect(events.text).toContain('Events coming: 1');
    expect([events.text.includes('Annual day'), events.text.includes('Old fair'), events.text.includes('Answers: 2 yes, 1 no.')]).toEqual([true, false, true]);
    // Parent AI: the draft, not the answer already sent; a draft's words are not repeated in this list.
    const drafts = await open(principal, f['parent_ai.drafts'].href!);
    expect(drafts.text).toContain('Draft answers waiting for approval: 1');
    expect([drafts.rows.join(' ').includes('Asha'), drafts.rows.join(' ').includes('Farah'), drafts.text.includes('Practise fractions')]).toEqual([true, false, false]);
    // Tickets: the two not yet resolved; of those, the one that waits for the school. Each row opens its ticket.
    const openTickets = await open(principal, f['tickets.open'].href!);
    expect(openTickets.text).toContain('Support tickets open: 2');
    expect([openTickets.text.includes('How do I mark leave?'), openTickets.text.includes('Fee heads'), openTickets.text.includes('Receipt format'), openTickets.text.includes('Another school')]).toEqual([true, true, false, false]);
    expect(openTickets.rows.every((row) => /href="\/app\/help\/ticket\/[0-9a-f-]{36}"/.test(row))).toBe(true);
    const waiting = await open(principal, f['tickets.waiting'].href!);
    expect(waiting.text).toContain('Support tickets waiting for the school’s reply: 1');
    expect([waiting.text.includes('Fee heads'), waiting.text.includes('How do I mark leave?'), waiting.text.includes('Waiting on the school.')]).toEqual([true, false, true]);
    // The present rate: the three days of the week with a mark saved, and the rate the tile says.
    const days = await open(principal, f['attendance.present_rate'].href!);
    expect(days.text).toContain('Days with attendance saved: 3');
    expect(days.text).toContain('In school (present or late): 61.5% of the 13 marks saved in these days.');
    expect(days.rows.find((row) => row.includes('Present 1, late 1, absent 1, on leave 1.'))).toContain('In school: 50%.');
    // A filter that is not one of the screen's own puts no list on the screen.
    for (const href of ['/app/events?show=all', '/app/events', '/app/parent-ai?show=sent', '/app/help/ticket?show=closed', '/app/help/ticket', '/app/communication?show=everything', '/app/attendance?show=days', `/app/attendance?show=days&from=${TODAY}&to=${day(3)}`, '/app/complaints', '/app/complaints?show=closed', '/app/complaints?show=OPEN', '/app/ptm', '/app/ptm?show=past', '/app/staff', '/app/staff?show=waiting', '/app/staff?show=on-leave']) {
      expect((await pageFor(principal, href)).lists, href).toEqual([]);
    }
  });

  it('complaints and meetings open their rows: the open complaints, the ones past their time, the meetings to come', async () => {
    const f = byId((await load(principal, '7d')).facts);
    // Open: the three not yet closed, the one due soonest first. The closed one is not there.
    const all = await open(principal, f['complaints.open'].href!);
    expect(all.text).toContain('Complaints open: 3');
    expect(all.listed).toBe(3);
    expect(all.rows.map((row) => [/Tara Teacher is looking into it/.test(row), /Asif Admin is looking into it/.test(row), />Overdue</.test(row)])).toEqual([[true, false, true], [false, true, false], [false, true, false]]);
    expect([all.rows[1].includes('Anita Sharma, about Asha'), all.rows[2].includes('Fatima Ali, about Farah'), all.text.includes('Looked into by')]).toEqual([true, true, false]);
    // A complaint's words are read in the list below, not here.
    expect([all.text.includes('The bus was late.'), all.text.includes('The water cooler is broken.'), all.text.includes('About a teacher.')]).toEqual([false, false, false]);
    expect(all.text).toContain('href="/app/complaints?show=overdue"');
    expect(all.text).toContain('href="/app/complaints"'); // "Show everything"
    // Past their time: the one of those three whose due time has passed.
    const late = await open(principal, f['complaints.overdue'].href!);
    expect(late.text).toContain('Complaints past their due time: 1');
    expect([late.listed, late.rows[0].includes('Tara Teacher is looking into it'), late.text.includes('Asif Admin')]).toEqual([1, true, false]);
    expect(late.text).toContain('href="/app/complaints?show=open"');
    // The list is the library's own reading, and "overdue" is a part of "open".
    const [shownOpen, shownLate] = await asWho(db, principal, async (c) => [await complaintsShown(c, A, 'open'), await complaintsShown(c, A, 'overdue')] as const);
    expect([shownOpen.length, shownLate.length, shownOpen.filter((c) => c.overdue).map((c) => c.complaint_id)]).toEqual([3, 1, shownLate.map((c) => c.complaint_id)]);
    // Tara: the two she may see. The one about her, which the principal has not seen yet, is not hers to see.
    const hers = byId((await load(tara, '7d')).facts);
    const taras = await open(tara, hers['complaints.open'].href!);
    expect([hers['complaints.open'].value, taras.listed, taras.text.includes('Fatima Ali')]).toEqual([2, 2, false]);
    expect((await open(tara, hers['complaints.overdue'].href!)).listed).toBe(1);

    // Meetings, the nearest first: the one dated TODAY (a meeting this afternoon is still to come, and a draft
    // counts), then the one in five days. Not the one ten days ago, and not the one that was called off.
    const meetings = await open(principal, f['ptm.coming'].href!);
    expect(meetings.text).toContain('Meetings coming: 2');
    expect(meetings.listed).toBe(2);
    expect([meetings.rows[0].includes('Class meeting'), meetings.rows[0].includes('>Not invited yet<'), meetings.rows[0].includes('6-B')]).toEqual([true, true, true]);
    expect([meetings.rows[1].includes('Term meeting'), meetings.rows[1].includes('1 of 2 times booked'), meetings.rows[1].includes('5-A'), meetings.text.includes('Old meeting'), meetings.text.includes('Called off')]).toEqual([true, true, true, false, false]);
    // The tile's second line is the same two counts.
    expect(f['ptm.coming'].parts).toEqual([{ key: 'slots', value: 2 }, { key: 'booked', value: 1 }]);
    // Tara is the class teacher of 5-A: its meeting is hers too. The meeting of 6-B is not.
    const tarasMeetings = await open(tara, hers['ptm.coming'].href!);
    expect([hers['ptm.coming'].value, tarasMeetings.listed, tarasMeetings.text.includes('Term meeting'), tarasMeetings.text.includes('Class meeting')]).toEqual([1, 1, true, false]);
  });

  it('a number on the dashboard, and the list it opens, never mark a complaint as seen by the principal; the Complaints screen’s own list does', async () => {
    await asWho(db, principal, async (c) => {
      const seen = async () => (await c.query(`select count(*)::int as n from complaints where school_id = $1 and principal_seen_at is not null`, [A])).rows[0].n;
      within = c; // the page's and the route's own reads run in this one transaction, so anything they write is seen here
      try {
        expect(await seen()).toBe(0);
        // The dashboard's numbers, as the principal.
        const f = byId((await loadFacts(c, who(principal), ents(), { range: 'today' })).facts);
        expect([f['complaints.open'].value, f['complaints.overdue'].value, await seen()]).toEqual([3, 1, 0]);
        // The lists the two numbers open, drawn as the page draws them.
        for (const href of [f['complaints.open'].href!, f['complaints.overdue'].href!]) expect((await open(principal, href)).listed).toBeGreaterThan(0);
        expect(await seen()).toBe(0);
        // The Complaints screen's own list, which the principal's browser loads once the screen is open: every
        // complaint is marked as seen, the closed one too.
        const body = await get(complaintsRoute, '/api/app/complaints');
        expect([body.complaints.length, await seen()]).toEqual([4, 4]);
        expect((await listComplaints(c, { schoolId: A, userId: PRINCIPAL, role: 'principal' })).length).toBe(4);
      } finally {
        within = null;
      }
    });
    // Rolled back: Tara still does not see the complaint about her.
    expect(byId((await load(tara, 'today')).facts)['complaints.open'].value).toBe(2);
  });

  it('a complaint a teacher owns about a child of another class: the number, the list above and the list below all hold it, and no name she may not read is shown', async () => {
    // The office gives Tara a complaint from Farah's guardian to look into. Farah is in 6-B, which is not Tara's
    // class: row level security lets Tara read the complaint she owns, and neither the guardian nor the child.
    await db.pg.exec(`set session_replication_role = replica;
      insert into complaints (complaint_id, school_id, parent_id, student_id, about_user_id, source, summary, status, owner_id, due_at, created_by) values
        ('${FARAH_COMPLAINT}', '${A}', '${G_FARAH}', '${FARAH}', null, 'office', 'The class is too noisy.', 'open', '${TARA}', '${day(-1)}T10:00:00+05:30', '${ADMIN}');
      set session_replication_role = origin;`);
    try {
      const hers = byId((await load(tara, 'today')).facts);
      expect(hers['complaints.open'].value).toBe(3);
      // The list the number opens: three rows. The new one says in plain words that the guardian is not of her
      // classes; it names nobody she may not read, and no row is left with an empty name.
      const above = await open(tara, hers['complaints.open'].href!);
      expect([above.listed, above.said]).toEqual([3, 3]);
      expect(above.rows.filter((row) => row.includes('A guardian from another class')).length).toBe(1);
      expect(above.rows.every((row) => !/<span class="font-bold"><\/span>/.test(row))).toBe(true);
      expect([above.text.includes('Fatima'), above.text.includes('Farah')]).toEqual([false, false]);
      // The list below is the Complaints screen's own, read from its route. It holds the same three complaints, so
      // "…in the list below" leads to every one of them; the new one with its words and with her buttons.
      signIn(tara);
      const below = (await get(complaintsRoute, '/api/app/complaints')).complaints as { complaint_id: string; guardian: string | null; child: string | null; summary: string; status: string; mayChange: boolean }[];
      const counted = (await asWho(db, tara, (c) => complaintsShown(c, A, 'open'))).map((c) => c.complaint_id).sort();
      expect(below.filter((c) => c.status === 'open').map((c) => c.complaint_id).sort()).toEqual(counted);
      expect(below.find((c) => c.complaint_id === FARAH_COMPLAINT)).toMatchObject({ guardian: null, child: null, summary: 'The class is too noisy.', mayChange: true });
      // And she can do what the note above the list says: add a note to the complaint she owns.
      expect(await asWho(db, tara, (c) => addNote(c, { schoolId: A, userId: TARA, role: 'teacher' }, FARAH_COMPLAINT, 'Spoke to the class.'))).toEqual({ ok: true });
      // The office reads every guardian: for the principal the same complaint has its names.
      const office = await open(principal, '/app/complaints?show=open');
      expect([office.listed, office.text.includes('A guardian from another class'), office.rows.filter((row) => row.includes('Fatima Ali, about Farah')).length]).toEqual([4, false, 2]);
    } finally {
      await db.pg.exec(`set session_replication_role = replica; delete from complaint_events where complaint_id = '${FARAH_COMPLAINT}'; delete from complaints where complaint_id = '${FARAH_COMPLAINT}'; set session_replication_role = origin;`);
    }
    // Who a complaint is from, as both lists write it, in English and in Hindi.
    const say = (lang: 'en' | 'hi') => (key: Parameters<typeof t>[1], params?: Record<string, string | number>) => t(lang, key, params);
    const from = (guardian: string | null, child: string | null) => complaintFrom(say('en'), { guardian, child });
    expect([from('Anita Sharma', 'Asha'), from('Anita Sharma', null), from(null, null), from(null, 'Asha')]).toEqual(['Anita Sharma, about Asha', 'Anita Sharma', 'A guardian from another class', 'A guardian from another class, about Asha']);
    expect(complaintFrom(say('hi'), { guardian: null, child: null })).toMatch(/[ऀ-ॿ]/);
    // Put back: Tara's number is as it was.
    expect(byId((await load(tara, 'today')).facts)['complaints.open'].value).toBe(2);
  });

  it('“past its due time” is one rule: the number, the list above and the list below call the same complaints overdue, to the instant', async () => {
    const due = new Date('2026-10-14T10:00:00+05:30');
    expect([isOverdue(due, new Date(due.getTime() - 1)), isOverdue(due, due), isOverdue(due.toISOString(), new Date(due.getTime() + 1))]).toEqual([false, true, true]);
    // Two of the seeded complaints fall due at the same instant, two days from now. One millisecond before it, at
    // it and after it, the list a number opens (complaintsShown) and the Complaints screen's own list
    // (listComplaints) badge the same complaints.
    const seen = await asWho(db, principal, async (c) => {
      const dueAt = new Date((await c.query(`select min(due_at) as at from complaints where school_id = $1 and status = 'open' and due_at > now()`, [A])).rows[0].at);
      const out: { above: Record<string, boolean>; below: Record<string, boolean>; closedOverdue: number }[] = [];
      for (const now of [new Date(dueAt.getTime() - 1), dueAt, new Date(dueAt.getTime() + 1)]) {
        const below = await listComplaints(c, { schoolId: A, userId: PRINCIPAL, role: 'principal' }, now);
        out.push({
          above: Object.fromEntries((await complaintsShown(c, A, 'open', now)).map((x) => [x.complaint_id, x.overdue])),
          below: Object.fromEntries(below.filter((x) => x.status === 'open').map((x) => [x.complaint_id, x.overdue])),
          closedOverdue: below.filter((x) => x.status === 'closed' && x.overdue).length,
        });
      }
      return out;
    });
    for (const at of seen) expect(at.above).toEqual(at.below);
    expect(seen.map((at) => Object.values(at.above).filter(Boolean).length)).toEqual([1, 3, 3]);
    // A closed complaint is never overdue, whatever its due time was.
    expect(seen.map((at) => at.closedOverdue)).toEqual([0, 0, 0]);
  });

  it('leave and covers open their rows: the requests waiting, who is on leave today, and today’s periods that still need cover', async () => {
    const f = byId((await load(principal, 'today')).facts);
    // Waiting: Tara's and the school admin's own, in the order they came in. Not Tarun's (approved), not the refused one.
    const waiting = await open(principal, f['staff.leave_waiting'].href!);
    expect(waiting.text).toContain('Leave requests waiting: 2');
    expect(waiting.rows.map((row) => [row.includes('Tara Teacher · Teacher'), row.includes('Asif Admin · School admin')])).toEqual([[true, false], [false, true]]);
    expect([waiting.rows[0].includes('(2 days). Kind: Casual.'), waiting.text.includes('Tarun'), waiting.text.includes('Anil'), waiting.text.includes('A family function')]).toEqual([true, false, false, false]); // a reason is read in the list below
    expect(waiting.text).toContain('Approve or refuse them in the list below.');
    // On leave today: Tarun, whose approved leave runs from yesterday to tomorrow. Not Tina (withdrawn for today,
    // approved for later), not the accountant (refused), not the coordinator (ended last week).
    const away = await open(principal, f['staff.on_leave_today'].href!);
    expect(away.text).toContain('Staff on leave today: 1');
    expect([away.listed, away.rows[0].includes('Tarun Teacher · Teacher'), away.rows[0].includes('(3 days). Kind: Sick.'), away.text.includes('Tina'), away.text.includes('Anil'), away.text.includes('Chitra')]).toEqual([1, true, true, false, false, false]);
    // Both lists are the library's own: the Staff screen's "waiting" list, and the database's one rule for a day on leave.
    const [listWaiting, listAway] = await asWho(db, principal, async (c) => [await leaveWaiting(c, { schoolId: A, userId: PRINCIPAL, role: 'principal' }, TODAY), await onLeave(c, A, TODAY)] as const);
    expect([listWaiting.length, listAway.map((p) => p.name)]).toEqual([f['staff.leave_waiting'].value, ['Tarun Teacher']]);

    // Covers: the number opens Proxy Auto on today's periods that still need cover, and on no others. Tarun has
    // three periods today; the two with no teacher are listed, and the title says "2 of 3".
    const cover = await open(principal, f['proxy.uncovered_today'].href!);
    expect([cover.listed, cover.said]).toEqual([2, 2]);
    expect(cover.text).toContain('Periods that still need cover: 2 of 3');
    // The period Tina covers is not on this list, and nothing on it is badged "Covered".
    expect([cover.text.includes('Tina Teacher covers this period'), cover.text.includes('data-covered="yes"'), (cover.text.match(/data-proxy-period=/g) ?? []).length]).toEqual([false, false, 2]);
    // The cover given to Tara cannot be taken (she teaches 5-A then): the period is counted as needing cover.
    expect((cover.text.match(/data-proxy-problem="own_class"/g) ?? []).length).toBe(1);
    // "Show everything" takes the filter away, and the covers nothing needs any more are for that screen too.
    expect([cover.text.includes('href="/app/proxy"'), cover.text.includes('data-proxy-stale'), cover.text.includes('data-proxy-days')]).toEqual([true, false, false]);
    // Without the filter the screen is as before: all three periods, the covered one among them, and the same line.
    const { page: whole } = await pageFor(principal, '/app/proxy');
    expect(find(whole, ProxyView).props.show).toBeUndefined();
    const everything = await open(principal, '/app/proxy');
    expect([(everything.text.match(/data-proxy-period=/g) ?? []).length, everything.text.includes('Tina Teacher covers this period'), everything.text.includes('Periods that still need cover: 2 of 3'), everything.listed, everything.text.includes('data-shown=')]).toEqual([3, true, true, 0, false]);
    // A filter that is not Proxy Auto's own is no filter.
    for (const href of ['/app/proxy?show=covered', '/app/proxy?show=NEEDS-COVER', '/app/proxy?show=']) expect(find((await pageFor(principal, href)).page, ProxyView).props.show, href).toBeUndefined();
    // One rule, one place: Proxy Auto's own reading and its own "needs cover" rule; My Day's card reads the same.
    const [periods, work] = await asWho(db, principal, async (c) => [await periodsToCover(c, A, TODAY), await coverWork(c, { schoolId: A, userId: PRINCIPAL, role: 'principal' }, TODAY)] as const);
    expect([periods.filter(needsCover).length, periods.length, work.open.length]).toEqual([f['proxy.uncovered_today'].value, f['proxy.uncovered_today'].total, f['proxy.uncovered_today'].value]);
    // The academic coordinator arranges cover too, and is told the same number; leave itself is not theirs.
    const forCoordinator = byId((await load(coordinator, 'today')).facts);
    expect(forCoordinator['proxy.uncovered_today']).toMatchObject({ value: 2, total: 3, attention: true });
    expect([forCoordinator['staff.leave_waiting'], forCoordinator['staff.on_leave_today']]).toEqual([undefined, undefined]);
    const theirs = await open(coordinator, forCoordinator['proxy.uncovered_today'].href!);
    expect([theirs.listed, theirs.said]).toEqual([2, 2]);
    // The roles of the number are Proxy Auto's own list of who arranges cover: the same list, not a copy of it.
    expect(FACTS.find((x) => x.id === 'proxy.uncovered_today')!.roles).toBe(PROXY_ARRANGERS);
  });

  it('a leave request asks for the person who may decide it, never for the one who asked; a holiday has nothing to cover', async () => {
    // The school admin: Tara's request is theirs to decide, their own is not. Both are on the list, and the tile
    // counts the list. What asks for the school admin is the ONE they may decide: the sentence under "Needs your
    // attention" says 1, as My Day's card does, never 2.
    const office = byId((await load(admin, 'today')).facts);
    expect(office['staff.leave_waiting']).toMatchObject({ value: 2, attention: true, attentionCount: 1 });
    expect([attentionNumber(office['staff.leave_waiting']), attentionNumber(byId((await load(principal, 'today')).facts)['staff.leave_waiting'])]).toEqual([1, 2]);
    // A fact with no number of its own to ask with says its value, or the rows behind an amount.
    expect([attentionNumber(office['complaints.overdue']), office['complaints.overdue'].attentionCount]).toEqual([1, undefined]);
    await asWho(db, admin, async (c) => {
      // Tara's request is approved (by the rule's own function): only the admin's own request still waits.
      expect(await decideLeave(c, { schoolId: A, userId: ADMIN, role: 'school_admin' }, TARA_LEAVE, 'approve', '')).toEqual({ ok: true });
      const after = byId((await loadFacts(c, who(admin), ents(), { range: 'today' })).facts);
      expect(after['staff.leave_waiting']).toMatchObject({ value: 1, attention: false, attentionCount: 0 });
      // Tara's leave is for later in the week: approved, and still not "today".
      expect(after['staff.on_leave_today'].value).toBe(1);
      within = c;
      try {
        expect((await open(admin, after['staff.leave_waiting'].href!)).listed).toBe(1);
      } finally {
        within = null;
      }
    });
    // Today is made a holiday: the school is closed, so no period needs cover, and the tile says a plain 0.
    await asWho(db, principal, async (c) => {
      await c.query(`insert into school_holidays (school_id, holiday_date, name, created_by) values ($1, $2, 'Founders day', $3)`, [A, TODAY, PRINCIPAL]);
      const closed = byId((await loadFacts(c, who(principal), ents(), { range: 'today' })).facts);
      expect(closed['proxy.uncovered_today']).toMatchObject({ state: 'ok', value: 0, total: 0, attention: false });
      expect(sayValue('en', closed['proxy.uncovered_today'])).toBe('0');
      // Leave is leave on a holiday too.
      expect(closed['staff.on_leave_today'].value).toBe(1);
      within = c;
      try {
        // The list the number opens says the same plain 0, lists nothing, and says why: the school is closed.
        const cover = await open(principal, closed['proxy.uncovered_today'].href!);
        expect([cover.listed, cover.said, cover.text.includes('data-proxy-empty="holiday"'), cover.text.includes('Periods that still need cover: 0<'), cover.text.includes('There is nothing in this list right now.')]).toEqual([0, 0, true, true, true]);
      } finally {
        within = null;
      }
    });
    // Rolled back: the number is as it was.
    expect(byId((await load(principal, 'today')).facts)['proxy.uncovered_today']).toMatchObject({ value: 2, total: 3 });
  });

  it('homework given to a section with nobody on its roll is set, and is neither due nor checked for everyone', async () => {
    const today = `from=${TODAY}&to=${TODAY}`;
    const set = await open(principal, `/app/homework?show=set&from=${day(6)}&to=${TODAY}`);
    expect([set.listed, set.text.includes('Sums 5'), set.text.includes('Checked 0 of 0; not done 0.')]).toEqual([4, true, true]);
    const [due, checked, unchecked] = [await open(principal, `/app/homework?show=due&${today}`), await open(principal, `/app/homework?show=checked&${today}`), await open(principal, `/app/homework?show=unchecked&${today}`)];
    expect([due.listed, checked.listed, unchecked.listed]).toEqual([1, 0, 1]);
    expect([due.text.includes('Sums 3'), due.text.includes('Sums 5')]).toEqual([true, false]);
    const f = byId((await load(principal, 'today')).facts);
    expect(f['homework.checked']).toMatchObject({ value: 0, total: 1, rule: { version: 2 } });
  });

  it('a list longer than its limit: the number stays whole, the rows stop at the limit, and the screen says how many it lists of how many', async () => {
    const more = MESSAGE_ROWS_MAX + 40;
    await db.pg.exec(`insert into communication_log (school_id, channel, template_name, status, created_at, provider, to_phone) select '${A}', 'whatsapp', 'class_notice', 'queued', now(), 'meta', '9000009999' from generate_series(1, ${more})`);
    try {
      const f = byId((await load(principal, 'today')).facts);
      expect([f['messages.total'].value, f['messages.held'].value]).toEqual([3 + more, 1]);
      // The tile's own address: the button says the whole number, the first rows are listed, and the list says so.
      const all = await open(principal, f['messages.total'].href!);
      expect([all.said, all.listed]).toEqual([3 + more, MESSAGE_ROWS_MAX]);
      expect(all.text).toContain(`Only the first ${MESSAGE_ROWS_MAX.toLocaleString('en-IN')} of ${(3 + more).toLocaleString('en-IN')} messages are listed, newest first.`);
      // One state that fits is listed whole and says nothing about a limit.
      const held = await open(principal, f['messages.held'].href!);
      expect([held.said, held.listed, held.text.includes('Only the first')]).toEqual([1, 1, false]);
      // The screen as it usually opens (the last 14 days) has a shorter page and says the same when it is cut.
      signIn(principal);
      const usual = await get(messagesRoute, '/api/app/communication/messages');
      expect([usual.messages.length, usual.inState]).toEqual([MESSAGE_ROWS_RECENT, 7 + more]); // the seed's seven of the last 14 days
      expect(plain(renderToStaticMarkup(h(MessagesView, { mayRead: true, initial: usual })))).toContain(`Only the first ${MESSAGE_ROWS_RECENT} of ${(7 + more).toLocaleString('en-IN')} messages are listed`);
    } finally {
      await db.pg.exec(`set session_replication_role = replica; delete from communication_log where to_phone = '9000009999'; set session_replication_role = origin;`);
    }
    // With the seed's few messages nothing is cut, and nothing says it is.
    const f = byId((await load(principal, '30d')).facts);
    const all = await open(principal, f['messages.total'].href!);
    expect([all.said, all.listed, all.text.includes('Only the first')]).toEqual([7, 7, false]);
  });

  it('today’s attendance also equals the Attendance screen’s own rosters, class by class', async () => {
    const f = byId((await load(principal, 'today')).facts);
    const rosters = await asWho(db, principal, async (c) => [...(await getAttendanceRoster(c, { schoolId: A, classId: C5A, date: TODAY, today: TODAY })), ...(await getAttendanceRoster(c, { schoolId: A, classId: C6B, date: TODAY, today: TODAY }))]);
    const having = (status: string | null) => rosters.filter((r) => r.status === status).length;
    expect(f['attendance.students_marked'].total).toBe(rosters.length);
    expect(f['attendance.students_marked'].value).toBe(rosters.length - having(null));
    expect([f['attendance.present'].value, f['attendance.absent'].value, f['attendance.late'].value, f['attendance.leave'].value]).toEqual([having('present'), having('absent'), having('late'), having('leave')]);
  });

  it('one rule, one place: the fees are the fee summary’s, the spend is the month’s, and My Day’s cards say the same numbers', async () => {
    const f = byId((await load(principal, 'today')).facts);
    const [summary, spend, myDay] = await asWho(db, principal, async (c) => [await loadFeesSummary(c, A), await schoolSpend(c, A), await loadMyDay(c, who(principal), ents(), { sunday: false })] as const);
    expect([f['fees.overdue'].value, f['fees.overdue'].count, f['fees.owed'].value]).toEqual([summary.overdueMinor, summary.overdueCount, summary.pendingMinor]);
    expect([f['whatsapp.spend'].value, f['whatsapp.spend'].total]).toEqual([spend.spentPaise, spend.budgetPaise]);
    const card = (type: string) => myDay.cards.find((k) => k.type === type)?.count ?? 0;
    expect(card('consent-waiting')).toBe(f['students.waiting_consent'].value);
    expect(card('fees-overdue')).toBe(f['fees.overdue'].count);
    expect(card('payments-to-verify')).toBe(f['fees.upi_to_verify'].value);
    expect(card('promises-due')).toBe(f['fees.promises_due'].value);
    expect(card('complaints-overdue')).toBe(f['complaints.overdue'].value);
    expect(card('followups-open')).toBe(f['followups.open'].value);
    expect(card('tickets-waiting')).toBe(f['tickets.waiting'].value);
    // Covers: the card and the tile are one reading (coverWork and periodsToCover both draw from Proxy Auto's day).
    expect(card('periods-uncovered')).toBe(f['proxy.uncovered_today'].value);
    // Leave: the card says how many requests wait for THIS person's decision, and so does the dashboard's
    // sentence under "Needs your attention". The principal may decide both that wait.
    expect(card('leave-waiting')).toBe(attentionNumber(f['staff.leave_waiting']));
    expect(card('leave-waiting')).toBe(2);
    const office = await asWho(db, admin, (c) => loadMyDay(c, who(admin), ents(), { sunday: false }));
    expect(office.cards.find((k) => k.type === 'attendance-school')).toMatchObject({ state: 'todo', count: f['attendance.classes_unmarked'].value, total: f['attendance.classes_unmarked'].total });
    // The school admin's own request waits too. The tile counts the Staff screen's "waiting" list, which shows it
    // (with nothing to press): 2. The card and the dashboard's sentence both count what this person may decide: 1.
    const theirs = byId((await load(admin, 'today')).facts)['staff.leave_waiting'];
    expect([office.cards.find((k) => k.type === 'leave-waiting')?.count, attentionNumber(theirs), theirs.value]).toEqual([1, 1, 2]);
  });

  it('another school’s rows are never counted', async () => {
    const totals = await asWho(db, principal, async (c) => (await c.query(`select (select count(*)::int from students) as students, (select count(*)::int from fees_ledger) as dues, (select count(*)::int from communication_log) as messages, (select count(*)::int from support_tickets) as tickets, (select count(*)::int from staff_leave) as leave, (select count(*)::int from substitutions) as covers`)).rows[0]);
    expect(totals).toEqual({ students: 10, dues: 6, messages: 9, tickets: 3, leave: 7, covers: 4 }); // School B's student, due, message, ticket and leave are not there
    // School B has a leave request waiting and a teacher away today: neither is in School A's numbers (2 and 1).
    expect((await db.pg.query(`select count(*)::int as n from staff_leave where school_id = $1`, [B])).rows[0].n).toBe(2);
  });

  it('every fact names the school it counts: run as the platform role, which row level security does not narrow, the numbers are still this school’s', async () => {
    // What a nightly job or a dated check would be: the platform's own database role, with School A's settings.
    // School B's rows are all visible to it (a due of 9,99,000 past its date, an open ticket, a mark, a message).
    const b = await asPlatform(db, principal, async (c) => (await c.query(`select (select count(*)::int from fees_ledger where school_id = $1) as dues, (select count(*)::int from support_tickets where school_id = $1) as tickets, (select count(*)::int from attendance where school_id = $1) as marks, (select count(*)::int from communication_log where school_id = $1) as messages, (select count(*)::int from students where school_id = $1) as students`, [B])).rows[0]);
    expect(b).toEqual({ dues: 1, tickets: 1, marks: 1, messages: 1, students: 1 });
    for (const range of ['today', '30d'] as const) {
      const mine = byId((await load(principal, range)).facts);
      const asThePlatform = await asPlatform(db, principal, (c) => loadFacts(c, who(principal), ents(), { range }));
      // Two fee lists read their students through fee_billing_students(), which only the app's own role may
      // run: as the platform they are left out and named, never answered with another school's rows.
      // Leave and covers the same: the platform role holds no right on staff_leave or substitutions and may not
      // ask staff_on_leave() or teachers_away_on() (leave is read by the person and the office, C201 and C202).
      expect(asThePlatform.failed, range).toEqual(['fees.promises_due', 'fees.upi_to_verify', 'staff.leave_waiting', 'staff.on_leave_today', 'proxy.uncovered_today']);
      expect(asThePlatform.facts, range).toHaveLength(FACT_IDS.length - 5);
      for (const f of asThePlatform.facts) expect([f.state, f.value, f.total, f.count, f.parts], `${f.id} (${range})`).toEqual([mine[f.id].state, mine[f.id].value, mine[f.id].total, mine[f.id].count, mine[f.id].parts]);
      const p = byId(asThePlatform.facts);
      expect([p['fees.overdue'].value, p['fees.overdue'].count, p['tickets.open'].value]).toEqual([250000, 2, 2]);
    }
  });

  it('something not set up says so, never zero: no class with students, no fee raised, no budget, no timetable', async () => {
    const empty: Who = { role: 'principal', user: NEW_PRINCIPAL, school: EMPTY };
    const { facts, failed } = await asWho(db, empty, (c) => loadFacts(c, who(empty), ents([], EMPTY), { range: '7d' }));
    expect(failed).toEqual([]);
    const f = byId(facts);
    for (const id of ['attendance.classes_marked', 'attendance.classes_unmarked', 'attendance.students_marked', 'attendance.present', 'attendance.absent', 'students.active', 'students.waiting_consent', 'fees.owed', 'fees.overdue', 'whatsapp.spend', 'proxy.uncovered_today'] as const) {
      expect(f[id], id).toMatchObject({ state: 'not_set_up', value: null, attention: false });
    }
    // With no timetable there is no period to cover: the tile says what is missing and opens nothing.
    expect([f['proxy.uncovered_today'].href, f['proxy.uncovered_today'].total]).toEqual([null, undefined]);
    // Nobody has asked for leave: an honest zero, and a list that says there is nothing.
    expect([f['staff.leave_waiting'], f['staff.on_leave_today'], f['complaints.open'], f['ptm.coming']].map((x) => [x.state, x.value])).toEqual([['ok', 0], ['ok', 0], ['ok', 0], ['ok', 0]]);
    for (const id of ['staff.leave_waiting', 'staff.on_leave_today', 'complaints.open', 'complaints.overdue', 'ptm.coming'] as const) {
      const list = await open(empty, f[id].href!);
      expect([list.listed, list.said, list.text.includes('There is nothing in this list right now.')], id).toEqual([0, 0, true]);
    }
    // Nothing recorded in the days is "no data"; a plain count of nothing is an honest zero.
    expect(f['attendance.present_rate']).toMatchObject({ state: 'no_data', value: null });
    expect(f['homework.checked']).toMatchObject({ state: 'no_data', value: null });
    expect(f['messages.total']).toMatchObject({ state: 'ok', value: 0 });
    expect(f['fees.collected']).toMatchObject({ state: 'ok', value: 0, count: 0 });
    expect(facts.filter((x) => x.attention)).toEqual([]);
    // And the lists it opens say there is nothing, in the same words everywhere.
    const days = await open(empty, f['attendance.present_rate'].href!);
    expect([days.listed, days.text.includes('Days with attendance saved: 0'), days.text.includes('There is nothing in this list right now.'), days.text.includes('In school (present or late)')]).toEqual([0, true, true, false]);
  });

  it('a module switched off: its facts are absent, the others are there', async () => {
    const { facts } = await load(principal, 'today', ['fees', 'homework']);
    const ids = facts.map((f) => f.id);
    expect(ids.filter((id) => id.startsWith('fees.') || id.startsWith('homework.'))).toEqual([]);
    expect(ids).toContain('attendance.present');
    expect(ids).toHaveLength(FACT_IDS.length - 8);
  });

  it('a fact that cannot be computed is left out and named; the transaction and the other facts go on', async () => {
    const got = await asWho(db, principal, async (c) => {
      // The complaints query is made to fail inside the database, as a real fault would.
      const faulty = { query: (text: string, params?: unknown[]) => c.query(/from complaints/.test(text) ? 'select * from a_table_that_is_not_there' : text, params) };
      const loaded = await loadFacts(faulty, who(principal), ents(), { range: 'today' });
      // The same transaction still answers afterwards.
      const still = (await c.query(`select count(*)::int as n from students`)).rows[0].n;
      return { loaded, still };
    });
    expect(got.loaded.failed).toEqual(['complaints.open', 'complaints.overdue']);
    expect(got.loaded.facts).toHaveLength(FACT_IDS.length - 2);
    expect(got.loaded.facts.find((f) => f.id === 'tickets.open')?.value).toBe(2);
    expect(got.still).toBe(10);
  });

  it('`ids` narrows a load to the facts a caller needs', async () => {
    const { facts } = await asWho(db, principal, (c) => loadFacts(c, who(principal), ents(), { range: '30d', ids: ['fees.collected', 'attendance.present_rate'] }));
    expect(facts.map((f) => f.id)).toEqual(['attendance.present_rate', 'fees.collected']);
    expect(PRINCIPAL).toBeTruthy();
  });
});
