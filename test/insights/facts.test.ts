import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { getAttendanceRoster } from '@/lib/attendance/attendance';
import { presentRate } from '@/lib/attendance/day';
import { loadFeesSummary } from '@/lib/fees/overdue';
import { FACTS, FACT_IDS, NO_LIST_YET, describeFact, loadFacts, type FactId, type FactResult, type RangeId } from '@/lib/insights';
import { sayNumber } from '@/lib/insights/dashboard';
import { loadMyDay } from '@/lib/today/cards';
import { schoolSpend } from '@/lib/whatsapp/cost';
import { MESSAGE_ROWS_MAX, MESSAGE_ROWS_RECENT } from '@/lib/whatsapp/delivery';
import { A, B, C5A, C6B, EMPTY, NEW_PRINCIPAL, PRINCIPAL, TODAY, accountant, admin, asPlatform, asWho, coordinator, day, ents, isSundayToday, principal, startSchool, tara, type Db, type Who } from './seed';

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
import EventsPage from '@/app/(school)/app/events/page';
import FeesPage from '@/app/(school)/app/fees/page';
import TicketsPage from '@/app/(school)/app/help/ticket/page';
import HomeworkPage from '@/app/(school)/app/homework/page';
import ParentAiPage from '@/app/(school)/app/parent-ai/page';
import PulsePage from '@/app/(school)/app/pulse/page';
import StudentsPage from '@/app/(school)/app/students/page';
import { GET as budgetRoute } from '@/app/api/app/communication/budget/route';
import { GET as messagesRoute } from '@/app/api/app/communication/messages/route';
import { GET as followupsRoute } from '@/app/api/app/followups/route';
import { GET as studentsRoute } from '@/app/api/app/students/route';
import { AttendanceDays, AttendanceShown } from '@/components/attendance/AttendanceShown';
import { BudgetView } from '@/components/communication/BudgetView';
import { MessagesView } from '@/components/communication/MessagesView';
import { NoticesShown } from '@/components/communication/NoticesShown';
import { EventsShown } from '@/components/events/EventsShown';
import { FeesShown } from '@/components/fees/FeesShown';
import { HomeworkShown } from '@/components/homework/HomeworkShown';
import { ParentAiShown } from '@/components/parent-ai/ParentAiShown';
import { NeedsHelpView } from '@/components/pulse/NeedsHelpView';
import { PulseShown } from '@/components/pulse/PulseShown';
import { StudentsView } from '@/components/students/StudentsView';
import { TicketsShown } from '@/components/tickets/TicketsShown';

let db: Db;
const who = (w: Who) => ({ schoolId: w.school ?? A, userId: w.user, role: w.role as never });
const load = (w: Who, range: RangeId, off: string[] = []) => asWho(db, w, (c) => loadFacts(c, who(w), ents(off, w.school ?? A), { range }));
const byId = (facts: FactResult[]) => Object.fromEntries(facts.map((f) => [f.id, f])) as Record<FactId, FactResult>;
// Every read a page or a route makes runs as that person, in the app's own database role, and is rolled back.
const signIn = (w: Who) => {
  session.claims = { sub: w.user, role: w.role, schoolId: w.school ?? A, membershipId: null, tv: 0 };
  session.run = (claims: any, fn: any) => asWho(db, { role: claims.role, user: claims.sub, school: claims.schoolId }, fn);
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
};
// The lists of "the rows behind a number" a page may put on the screen for an address.
const LISTS: unknown[] = [AttendanceShown, AttendanceDays, FeesShown, HomeworkShown, PulseShown, NoticesShown, EventsShown, ParentAiShown, TicketsShown];

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
const get = async (route: (req: NextRequest) => Promise<Response>, path: string) => {
  const res = await route(new NextRequest(`http://school.example${path}`));
  expect(res.status, path).toBe(200);
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
    const text = plain(renderToStaticMarkup(made));
    const rows = [...text.matchAll(/<li[^>]*data-shown-row[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
    const title = /<h2[^>]*data-shown-title[^>]*>([\s\S]*?)<\/h2>/.exec(text)?.[1] ?? '';
    return { listed: rows.length, said: numberIn(title.split(':').pop() ?? ''), rows, text };
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
    expect([f['complaints.open'].value, f['complaints.overdue'].value]).toEqual([3, 1]);
    expect(f['notices.waiting']).toMatchObject({ value: 2, attention: true, href: '/app/communication?show=notices' });
    expect(f['ptm.coming']).toMatchObject({ value: 1, parts: [{ key: 'slots', value: 2 }, { key: 'booked', value: 1 }] });
    expect(f['events.coming']).toMatchObject({ value: 1, href: '/app/events?show=coming', parts: [{ key: 'invited', value: 0 }, { key: 'yes', value: 2 }, { key: 'no', value: 1 }] });
    expect(f['parent_ai.drafts']).toMatchObject({ value: 1, href: '/app/parent-ai?show=drafts' });
    expect([f['tickets.open'].value, f['tickets.waiting'].value]).toEqual([2, 1]);
    expect([f['tickets.open'].href, f['tickets.waiting'].href]).toEqual(['/app/help/ticket?show=open', '/app/help/ticket?show=waiting']);
    // Every fact says when it was counted, by which rule and from which tables.
    for (const fact of facts) {
      expect(Date.now() - Date.parse(fact.countedAt), fact.id).toBeLessThan(120_000);
      expect(fact.rule.key, fact.id).toBe(`fact.${fact.id}.rule`);
    }
  });

  it('a number has an address only where that screen lists exactly its rows: three wait for their screen and open nothing', async () => {
    const { facts } = await load(principal, '7d');
    // The Complaints and PTM screens have no filter in their address yet; their numbers are shown without a link
    // rather than open a page that lists other rows too. Every other fact has an address with its filter in it.
    expect([...NO_LIST_YET]).toEqual(['complaints.open', 'complaints.overdue', 'ptm.coming']);
    expect(facts.filter((f) => f.href === null).map((f) => f.id)).toEqual([...NO_LIST_YET]);
    for (const f of facts.filter((x) => x.href !== null)) {
      expect(f.href, f.id).toMatch(/^\/app\//);
      // Two screens ARE the list as they stand and need no filter: the students waiting for consent, and the needs-help queue.
      // The month's spend is a figure the Communication screen says itself.
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
    for (const id of ['attendance.classes_marked', 'attendance.present', 'students.active', 'fees.overdue', 'fees.owed', 'followups.open', 'complaints.open', 'ptm.coming', 'tickets.open'] as const) {
      expect([week[id].value, week[id].total, week[id].range], id).toEqual([month[id].value, month[id].total, month[id].range]);
    }
  });

  it('tile by tile, the number equals the rows of the screen it opens: today, 7 days and 30 days', async () => {
    for (const range of ['today', '7d', '30d'] as const) {
      // Every fact of the principal that has an address is opened and compared; none is skipped.
      const seen = await sameAsItsScreen(principal, range);
      expect(seen.noAddress, range).toEqual([...NO_LIST_YET]);
      expect(seen.compared, range).toEqual(FACT_IDS.filter((id) => !NO_LIST_YET.includes(id)));
      await sameAsItsScreen(admin, range);
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
    for (const href of ['/app/events?show=all', '/app/events', '/app/parent-ai?show=sent', '/app/help/ticket?show=closed', '/app/help/ticket', '/app/communication?show=everything', '/app/attendance?show=days', `/app/attendance?show=days&from=${TODAY}&to=${day(3)}`]) {
      expect((await pageFor(principal, href)).lists, href).toEqual([]);
    }
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
    const office = await asWho(db, admin, (c) => loadMyDay(c, who(admin), ents(), { sunday: false }));
    expect(office.cards.find((k) => k.type === 'attendance-school')).toMatchObject({ state: 'todo', count: f['attendance.classes_unmarked'].value, total: f['attendance.classes_unmarked'].total });
  });

  it('another school’s rows are never counted', async () => {
    const totals = await asWho(db, principal, async (c) => (await c.query(`select (select count(*)::int from students) as students, (select count(*)::int from fees_ledger) as dues, (select count(*)::int from communication_log) as messages, (select count(*)::int from support_tickets) as tickets`)).rows[0]);
    expect(totals).toEqual({ students: 10, dues: 6, messages: 9, tickets: 3 }); // School B's student, due, message and ticket are not there
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
      expect(asThePlatform.failed, range).toEqual(['fees.promises_due', 'fees.upi_to_verify']);
      expect(asThePlatform.facts, range).toHaveLength(FACT_IDS.length - 2);
      for (const f of asThePlatform.facts) expect([f.state, f.value, f.total, f.count, f.parts], `${f.id} (${range})`).toEqual([mine[f.id].state, mine[f.id].value, mine[f.id].total, mine[f.id].count, mine[f.id].parts]);
      const p = byId(asThePlatform.facts);
      expect([p['fees.overdue'].value, p['fees.overdue'].count, p['tickets.open'].value]).toEqual([250000, 2, 2]);
    }
  });

  it('something not set up says so, never zero: no class with students, no fee raised, no budget', async () => {
    const empty: Who = { role: 'principal', user: NEW_PRINCIPAL, school: EMPTY };
    const { facts, failed } = await asWho(db, empty, (c) => loadFacts(c, who(empty), ents([], EMPTY), { range: '7d' }));
    expect(failed).toEqual([]);
    const f = byId(facts);
    for (const id of ['attendance.classes_marked', 'attendance.classes_unmarked', 'attendance.students_marked', 'attendance.present', 'attendance.absent', 'students.active', 'students.waiting_consent', 'fees.owed', 'fees.overdue', 'whatsapp.spend'] as const) {
      expect(f[id], id).toMatchObject({ state: 'not_set_up', value: null, attention: false });
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
