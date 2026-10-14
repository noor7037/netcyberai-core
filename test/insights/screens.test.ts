import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ATTENDANCE_SHOWS, isAttendanceShow, marksTotal, presentRate } from '@/lib/attendance/day';
import { COMPLAINT_SHOWS, isComplaintShow } from '@/lib/complaints/complaints';
import { TICKET_SHOWS, TICKET_SHOW_STATUSES, TICKET_STATUSES, isTicketShow } from '@/lib/contracts/tickets';
import { HOMEWORK_SHOWS, isHomeworkShow } from '@/lib/homework/homework';
import { ANSWERS_SHOW, ATTENDANCE_DAYS_SHOW, DEFAULT_RANGE, EVENTS_SHOW, FEES_SHOWS, NOTICES_SHOW, PROXY_SHOW, PTM_SHOW, STAFF_SHOWS, datesIn, isFeesShow, isRangeId, isStaffShow, rangeFor, readRange, readShow, readState, screenFor } from '@/lib/insights';
import { MESSAGE_STATES, isMessageState } from '@/lib/whatsapp/delivery';

// The addresses a dashboard number opens (docs/26 slice 8d, C203): built in one place and read back in the same
// place, so the tile, the screen and the tests speak one format. Dates are India's, both ends included.

describe('the days', () => {
  it('today is one day; 7 and 30 days end today and count it', () => {
    expect(rangeFor('2026-10-14', 'today')).toEqual({ from: '2026-10-14', to: '2026-10-14' });
    expect(rangeFor('2026-10-14', '7d')).toEqual({ from: '2026-10-08', to: '2026-10-14' });
    expect(rangeFor('2026-10-14', '30d')).toEqual({ from: '2026-09-15', to: '2026-10-14' });
    expect(rangeFor('2026-03-01', '7d')).toEqual({ from: '2026-02-23', to: '2026-03-01' }); // across a month end
    expect(datesIn(rangeFor('2026-10-14', '7d'))).toEqual(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
    expect(datesIn(rangeFor('2026-10-14', '30d'))).toHaveLength(30);
    expect([DEFAULT_RANGE, isRangeId('7d'), isRangeId('90d'), isRangeId(undefined), isRangeId('constructor')]).toEqual(['today', true, false, false, false]);
  });

  it('a range in an address is two real dates in order, at most a year apart; anything else is no range', () => {
    const q = (from?: string, to?: string) => readRange(new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }));
    expect(q('2026-10-08', '2026-10-14')).toEqual({ from: '2026-10-08', to: '2026-10-14' });
    expect(q('2026-10-14', '2026-10-14')).toEqual({ from: '2026-10-14', to: '2026-10-14' });
    expect(readRange({ from: '2026-10-08', to: '2026-10-14' })).toEqual({ from: '2026-10-08', to: '2026-10-14' }); // a page's searchParams
    for (const [from, to] of [['2026-10-14', '2026-10-08'], ['2026-10-08', undefined], [undefined, '2026-10-14'], ['yesterday', 'today'], ['2026-13-40', '2026-10-14'], ['2024-01-01', '2026-10-14'], ["2026-10-08'; drop table students; --", '2026-10-14']] as const) expect(q(from, to), `${from}..${to}`).toBeNull();
    expect(readRange({ from: ['2026-10-08', '2026-10-09'], to: '2026-10-14' })).toBeNull(); // a repeated parameter
    expect([readShow(new URLSearchParams('show=overdue')), readShow({}), readState({ state: 'held' })]).toEqual(['overdue', null, 'held']);
  });
});

describe('the addresses', () => {
  const week = { from: '2026-10-08', to: '2026-10-14' };
  it('each names the screen and the filter that lists the rows', () => {
    expect(screenFor.attendance('unmarked')).toBe('/app/attendance?show=unmarked');
    expect(screenFor.students('active')).toBe('/app/students?status=active');
    expect(screenFor.students('pending_consent')).toBe('/app/admissions');
    expect([screenFor.dues('overdue'), screenFor.dues('owed'), screenFor.fees('promises'), screenFor.fees('verify')]).toEqual(['/app/fees?show=overdue', '/app/fees?show=owed', '/app/fees?show=promises', '/app/fees?show=verify']);
    expect(screenFor.collected(week)).toBe('/app/fees?show=collected&from=2026-10-08&to=2026-10-14');
    expect(screenFor.homework('unchecked', week)).toBe('/app/homework?show=unchecked&from=2026-10-08&to=2026-10-14');
    expect(screenFor.pulseSent(week)).toBe('/app/pulse?show=sent&from=2026-10-08&to=2026-10-14');
    expect(screenFor.messages('held', week)).toBe('/app/communication?state=held&from=2026-10-08&to=2026-10-14');
    expect(screenFor.messages(null, week)).toBe('/app/communication?from=2026-10-08&to=2026-10-14');
    expect(screenFor.attendanceDays(week)).toBe('/app/attendance?show=days&from=2026-10-08&to=2026-10-14');
    expect([screenFor.noticesWaiting(), screenFor.eventsComing(), screenFor.answerDrafts()]).toEqual(['/app/communication?show=notices', '/app/events?show=coming', '/app/parent-ai?show=drafts']);
    expect([screenFor.tickets('open'), screenFor.tickets('waiting')]).toEqual(['/app/help/ticket?show=open', '/app/help/ticket?show=waiting']);
    // The list of days is not one of today's attendance lists, and none of them is called "days".
    expect([ATTENDANCE_DAYS_SHOW, isAttendanceShow(ATTENDANCE_DAYS_SHOW)]).toEqual(['days', false]);
    expect([NOTICES_SHOW, EVENTS_SHOW, ANSWERS_SHOW]).toEqual(['notices', 'coming', 'drafts']);
    // Complaints, meetings, leave and covers (slice 8d-2): each number opens its own list.
    expect([screenFor.complaints('open'), screenFor.complaints('overdue'), screenFor.ptmComing()]).toEqual(['/app/complaints?show=open', '/app/complaints?show=overdue', '/app/ptm?show=coming']);
    expect([screenFor.staffLeave('leave-waiting'), screenFor.staffLeave('on-leave-today')]).toEqual(['/app/staff?show=leave-waiting', '/app/staff?show=on-leave-today']);
    // Proxy Auto as it stands draws the covered periods too: the number opens it on the ones that still need cover.
    expect([screenFor.coverToday(), PROXY_SHOW, PTM_SHOW]).toEqual(['/app/proxy?show=needs-cover', 'needs-cover', 'coming']);
    expect(new URL(screenFor.coverToday(), 'http://x').searchParams.get('show')).toBe(PROXY_SHOW);
  });

  it('the lists of complaints and of leave name their filters, and a made-up one is refused', () => {
    expect([[...COMPLAINT_SHOWS], [...STAFF_SHOWS]]).toEqual([['open', 'overdue'], ['leave-waiting', 'on-leave-today']]);
    for (const s of COMPLAINT_SHOWS) expect(isComplaintShow(new URL(screenFor.complaints(s), 'http://x').searchParams.get('show'))).toBe(true);
    for (const s of STAFF_SHOWS) expect(isStaffShow(new URL(screenFor.staffLeave(s), 'http://x').searchParams.get('show'))).toBe(true);
    expect(new URL(screenFor.ptmComing(), 'http://x').searchParams.get('show')).toBe(PTM_SHOW);
    for (const bad of ['', 'closed', 'all', 'OPEN', 'waiting', 'on-leave', 'constructor', '__proto__', undefined, null, 7, ['open']]) expect([isComplaintShow(bad), isStaffShow(bad)], String(bad)).toEqual([false, false]);
  });

  it('the two ticket lists name their statuses: open is everything not yet resolved or closed, waiting is the school’s turn', () => {
    expect([...TICKET_SHOWS]).toEqual(['open', 'waiting']);
    expect(TICKET_SHOW_STATUSES).toEqual({ open: ['open', 'in_progress', 'waiting_on_school'], waiting: ['waiting_on_school'] });
    for (const s of TICKET_SHOWS) expect(isTicketShow(new URL(screenFor.tickets(s), 'http://x').searchParams.get('show'))).toBe(true);
    for (const bad of ['', 'closed', 'resolved', 'OPEN', 'constructor', undefined, null, 7]) expect(isTicketShow(bad), String(bad)).toBe(false);
    // Every status a list names is a real one, and a list never names a status that is over.
    for (const s of TICKET_SHOWS) for (const status of TICKET_SHOW_STATUSES[s]) expect(TICKET_STATUSES.includes(status) && status !== 'resolved' && status !== 'closed', status).toBe(true);
  });

  it('every filter an address can carry is one its screen accepts, and a made-up one is refused', () => {
    for (const s of ATTENDANCE_SHOWS) expect(isAttendanceShow(new URL(screenFor.attendance(s), 'http://x').searchParams.get('show'))).toBe(true);
    for (const s of HOMEWORK_SHOWS) expect(isHomeworkShow(new URL(screenFor.homework(s, week), 'http://x').searchParams.get('show'))).toBe(true);
    for (const s of MESSAGE_STATES) expect(isMessageState(new URL(screenFor.messages(s, week), 'http://x').searchParams.get('state'))).toBe(true);
    for (const s of ['overdue', 'owed', 'collected', 'promises', 'verify']) expect(isFeesShow(s)).toBe(true);
    expect(FEES_SHOWS).toHaveLength(5);
    for (const bad of ['', 'all', 'OVERDUE', 'constructor', '__proto__', undefined, null, 7]) expect([isAttendanceShow(bad), isHomeworkShow(bad), isFeesShow(bad), isMessageState(bad)], String(bad)).toEqual([false, false, false, false]);
  });
});

describe('a page that reads a filter from its address', () => {
  // Next.js checks the first argument of every page when it builds (.next/types/…/page.ts): a page whose whole
  // props object has a default ("= {}") may be called with nothing, and that does not pass the check, so the build
  // stops. Type-checking alone does not show it until a build or a development run has written those files.
  // The Staff page was written that way once. No page may be: a test calls a page with {} instead.
  it('takes its props with no default for the whole object, so that the build’s own check of the page passes', () => {
    const root = path.resolve(__dirname, '../../src/app');
    const pages = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? pages(path.join(dir, e.name)) : e.name === 'page.tsx' ? [path.join(dir, e.name)] : []));
    const all = pages(root);
    expect(all.length).toBeGreaterThan(40);
    const defaulted = all.filter((file) => /export default (?:async )?function \w*\([^\n]*=\s*\{\s*\}\s*\)\s*\{/.test(readFileSync(file, 'utf8'))).map((file) => path.relative(root, file));
    expect(defaulted).toEqual([]);
    for (const page of ['(school)/app/staff/page.tsx', '(school)/app/proxy/page.tsx', '(school)/app/complaints/page.tsx', '(school)/app/ptm/page.tsx']) {
      expect(readFileSync(path.join(root, page), 'utf8'), page).toMatch(/export default async function \w+\(\{ searchParams = \{\} \}: \{ searchParams\?: \{ show\?: string \} \}\) \{/);
    }
  });
});

describe('the present rate, rule version 1', () => {
  it('in school (present or late) out of every mark saved; leave is marked and is not an absence; nothing marked is no rate', () => {
    expect(presentRate({ present: 7, late: 1, absent: 3, leave: 2 })).toBe(61.5);
    expect(presentRate({ present: 10, late: 0, absent: 0, leave: 0 })).toBe(100);
    expect(presentRate({ present: 0, late: 0, absent: 0, leave: 4 })).toBe(0); // everyone on leave: marked, nobody in school
    expect(presentRate({ present: 0, late: 0, absent: 0, leave: 0 })).toBeNull();
  });

  it('over a range: the rate is of all the marks of the days together, never the average of the days’ rates', () => {
    const days = [
      { date: '2026-10-12', present: 1, late: 0, absent: 1, leave: 0 }, // 50 on a small day
      { date: '2026-10-13', present: 6, late: 1, absent: 2, leave: 2 }, // 63.6 on a big one
    ];
    expect(marksTotal(days)).toEqual({ present: 7, late: 1, absent: 3, leave: 2, marks: 13, days: 2, rate: 61.5 });
    expect(marksTotal([])).toEqual({ present: 0, late: 0, absent: 0, leave: 0, marks: 0, days: 0, rate: null });
  });
});
