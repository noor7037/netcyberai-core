import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { SchoolRole } from '@/lib/contracts/modules';
import { LANG_COOKIE, langCookieValue } from '@/lib/i18n';
import { loadFacts, rangeFor, type FactRange, type FactResult } from '@/lib/insights';
import { collectedBetween, collectedByDay } from '@/lib/fees/payments';
import { countAssignmentsByClass, countAssignmentsIn } from '@/lib/homework/homework';
import { sentTotals, sentTotalsByClass } from '@/lib/pulse/drafts';
import { NotThisRolesReport, REPORTS, REPORT_IDS, REPORT_SOURCE_ROWS_MAX, ReportTooLarge, askReport, reportCsv, reportDefinition, reportEmpty, reportTable, runReport, type ReportAgrees, type ReportId, type ReportResult, type ReportRow } from '@/lib/reports';
import { A, ACCOUNTANT, C, PRINCIPAL, PRINCIPAL_C, STUDENT_C, TARA, TODAY, accountant, admin, asWho, asWhoKept, coordinator, day, ents, principal, principalC, startSchool, tara, type Db, type Who } from './seed';

// Reports on the whole schema, as the app's own database role (docs/26 slice 8h, C207). The acceptance sentence:
//   "Each report's total equals the sum of its rows and the dashboard's number for the same range. An accountant
//    gets no learning report; a coordinator no fee report. Each export writes an audit row and has the rows on
//    screen."
// The seeded school is in seed.ts; the numbers below are counted from it by hand. The three routes are run for
// real: the caller's own session, the read guard, the audit row.

const state = vi.hoisted(() => ({ claims: null as any, db: null as any, cookies: {} as Record<string, string> }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: (name: string) => (state.cookies[name] ? { value: state.cookies[name] } : undefined) }) }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  withTenantContext: (claims: any, fn: any) => state.db(claims, fn),
}));

import { GET as listRoute } from '@/app/api/app/reports/route';
import { GET as rowsRoute } from '@/app/api/app/reports/[reportId]/route';
import { GET as fileRoute } from '@/app/api/app/reports/[reportId]/export/route';
import ReportsPage from '@/app/(school)/app/reports/page';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ReportsView } from '@/components/reports/ReportsView';

let db: Db;
const who = (w: Who) => ({ schoolId: w.school ?? A, userId: w.user, role: w.role as SchoolRole });
const signIn = (w: Who | null) => (state.claims = w ? { sub: w.user, role: w.role, schoolId: A, membershipId: null, tv: 0 } : null);
const run = (w: Who, id: ReportId, range: FactRange) => asWho(db, w, (c) => runReport(c, reportDefinition(id), { ...who(w), today: TODAY, range }));
const facts = async (w: Who, range: FactRange) => (await asWho(db, w, (c) => loadFacts(c, who(w), ents([], w.school ?? A), { range, today: TODAY }))).facts;
const days = (id: 'today' | '7d' | '30d') => rangeFor(TODAY, id);
const sum = (rows: ReportRow[], key: string) => rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);

const getList = () => listRoute(new NextRequest('http://school.example/api/app/reports'));
const getRows = (id: string, query = '') => rowsRoute(new NextRequest(`http://school.example/api/app/reports/${id}${query}`), { params: { reportId: id } });
const getFile = (id: string, query = '', cookie?: string) => fileRoute(new NextRequest(`http://school.example/api/app/reports/${id}/export${query}`, cookie ? { headers: { cookie } } : undefined), { params: { reportId: id } });
const shown = async (id: string, query = '') => (await (await getRows(id, query)).json()).report as ReportResult;
// A CSV line, back into its cells (quoted cells may hold commas and doubled quotes; the last cell may be empty).
const cells = (line: string) => {
  const out: string[] = [];
  for (const m of line.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)) {
    out.push(m[1].startsWith('"') ? m[1].slice(1, -1).replace(/""/g, '"') : m[1]);
    if (m[2] === '') break; // the end of the line
  }
  return out;
};
// The file as it is sent: the byte order mark first (so Hindi opens correctly in Excel), then the lines.
const csvOf = async (res: Response) => {
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { mark: [...bytes.slice(0, 3)], lines: new TextDecoder('utf-8').decode(bytes).trimEnd().split('\r\n').map(cells) };
};
const asText = (rows: readonly (readonly (string | number | null | undefined)[])[]) => rows.map((r) => r.map((v) => (v === null || v === undefined ? '' : String(v))));
const audits = async () => (await db.pg.query(`select actor_user_id, actor_role::text as role, target_type, target_id, before_state, after_state from audit_log where school_id = $1 and event_action = 'report.exported' order by audit_id`, [A])).rows;
// What a dashboard number says for one `agrees` line of a report.
const picked = (fact: FactResult | undefined, pick: ReportAgrees['pick']): number | null | undefined =>
  !fact ? undefined : pick === 'value' ? fact.value : pick === 'total' ? fact.total : pick === 'count' ? fact.count : fact.parts?.find((p) => p.key === pick.part)?.value;

const NO_METHOD = { cash: 0, upi: 0, cheque: 0, card: 0, netbanking: 0, online: 0 };
const NO_STATE = { queued: 0, uncertain: 0, sent: 0, delivered: 0, read: 0, failed: 0, held: 0 };

beforeAll(async () => {
  db = await startSchool();
  state.db = (claims: any, fn: any) => asWhoKept(db, { role: claims.role, user: claims.sub }, fn);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
}, 180_000);
afterAll(async () => db?.stop());

describe('each report says the school’s own rows, counted here by hand (30 days)', () => {
  const month = days('30d');

  it('daily collection: a row a day, by method; a reversed receipt counts for nothing and is shown apart', async () => {
    const r = await run(principal, 'daily-collection', month);
    expect(r.rows).toEqual([
      { day: day(20), receipts: 1, amount: 500000, ...NO_METHOD, cheque: 500000, reversed: 0 },
      { day: day(3), receipts: 2, amount: 130000, ...NO_METHOD, upi: 100000, online: 30000, reversed: 0 },
      // Only a reversed receipt that day: nothing collected, one reversed.
      { day: day(2), receipts: 0, amount: 0, ...NO_METHOD, reversed: 1 },
      // Issued ten past midnight in India: yesterday's, by India's date.
      { day: day(1), receipts: 1, amount: 40000, ...NO_METHOD, card: 40000, reversed: 0 },
      { day: day(0), receipts: 1, amount: 50000, ...NO_METHOD, cash: 50000, reversed: 0 },
    ]);
    expect(r.total).toEqual({ day: null, receipts: 5, amount: 720000, cash: 50000, upi: 100000, cheque: 500000, card: 40000, netbanking: 0, online: 30000, reversed: 1 });
    // Every rupee of a day is under one method: the methods of a row add up to its amount.
    for (const row of [...r.rows, r.total!]) expect(Object.keys(NO_METHOD).reduce((a, m) => a + Number(row[m]), 0), String(row.day)).toBe(row.amount);
    expect(r.range).toEqual(month);
    expect(r.rule).toEqual({ key: 'rpt.daily-collection.rule', version: 1 });
  });

  it('dues and defaulters: a row a family or child by the one overdue rule, the longest wait first, with the office’s last follow-up', async () => {
    const r = await run(principal, 'dues', month);
    expect(r.rows).toEqual([
      // The smallest amount comes first: it has waited longest. Never the largest first.
      { payer: 'Gopal', children: 1, entries: 1, owed: 60000, oldest_due: day(15), last_followup: 'none', last_on: null },
      { payer: 'F-001 · Asha', children: 2, entries: 3, owed: 550000, oldest_due: day(12), last_followup: 'promise', last_on: day(2) },
      // The call was recorded against the brother, who has no overdue entry: it is still this family's last follow-up.
      { payer: 'F-002 · Hina', children: 1, entries: 1, owed: 20000, oldest_due: day(7), last_followup: 'call', last_on: day(1) },
    ]);
    expect(r.total).toEqual({ payer: null, children: 4, entries: 5, owed: 630000, oldest_due: null, last_followup: null, last_on: null });
    // About this moment: the days asked do not change it, and it says no days.
    expect(r.range).toBeNull();
    expect((await run(principal, 'dues', days('today'))).rows).toEqual(r.rows);
    // Waived and paid entries are not owed, and a fee due next week is not overdue.
    expect(JSON.stringify(r.rows)).not.toMatch(/Bela|Dev/);
  });

  it('attendance by class: the marks of the days under the class they were saved for, and the present rate by the one rule', async () => {
    const r = await run(principal, 'attendance-by-class', month);
    expect(r.rows).toEqual([
      { class: '5-A', days: 4, present: 6, late: 1, absent: 4, leave: 1, rate: 58.3 },
      { class: '6-B', days: 2, present: 2, late: 0, absent: 1, leave: 1, rate: 50 },
    ]);
    // 9 in school (present or late) of 16 marks: 56.3. Not the average of the two classes' rates (54.2).
    // Days marked: 5-A on four days (today, yesterday, three and ten days ago) and 6-B on two of the same four.
    // The school has a mark on FOUR days, the dashboard's "Days with a mark saved", not on six.
    expect(r.total).toEqual({ class: null, days: 4, present: 8, late: 1, absent: 5, leave: 2, rate: 56.3 });
    expect(sum(r.rows, 'days')).toBe(6);
    // Seven days: 5-A on three days, 6-B on one of them. Three days, not four.
    const week = await run(principal, 'attendance-by-class', days('7d'));
    expect([week.rows.map((x) => x.days), week.total!.days]).toEqual([[3, 1], 3]);
    // A class marked alone on a day adds a day; the same day in two classes does not.
    const [five, six] = [await run(principal, 'attendance-by-class', { from: day(3), to: day(3) }), await run(principal, 'attendance-by-class', { from: day(10), to: day(10) })];
    expect([five.rows.map((x) => x.days), five.total!.days]).toEqual([[1], 1]);
    expect([six.rows.map((x) => x.days), six.total!.days]).toEqual([[1, 1], 1]);
  });

  it('absentees: a row a student marked absent, by class and then name, never by the number of days', async () => {
    const r = await run(principal, 'absentees', month);
    expect(r.rows).toEqual([
      { class: '5-A', student: 'Bela', roll_no: null, days: 1, dates: [day(3)] },
      { class: '5-A', student: 'Chirag', roll_no: null, days: 2, dates: [day(1), day(0)] },
      { class: '5-A', student: 'Esha', roll_no: null, days: 1, dates: [day(0)] },
      { class: '6-B', student: 'Farah', roll_no: null, days: 1, dates: [day(1)] },
    ]);
    expect(r.total).toEqual({ class: null, student: null, roll_no: null, days: 5, dates: null });
    // The order is the class and the name: the days are neither rising nor falling.
    expect(r.rows.map((x) => x.days)).toEqual([1, 2, 1, 1]);
    // Late and on leave are not absences: Bela (late today), Dev and Hina (on leave) are listed for no such day.
    expect(JSON.stringify(r.rows)).not.toMatch(/Dev|Hina|Gopal/);
  });

  it('homework coverage: given out, fell due, checked for everyone, not yet checked, marked not done, a row a class', async () => {
    const r = await run(principal, 'homework-coverage', month);
    expect(r.rows).toEqual([
      { class: '5-A', set: 2, due: 1, checked: 1, unchecked: 0, not_done: 2 },
      { class: '6-B', set: 2, due: 2, checked: 0, unchecked: 2, not_done: 1 },
      // Given to a section with nobody on its roll: given out, and nothing else.
      { class: '7-C', set: 1, due: 0, checked: 0, unchecked: 0, not_done: 0 },
    ]);
    expect(r.total).toEqual({ class: null, set: 5, due: 3, checked: 1, unchecked: 2, not_done: 3 });
    for (const row of [...r.rows, r.total!]) expect(Number(row.checked) + Number(row.unchecked), String(row.class)).toBe(row.due);
  });

  it('Daily Pulse coverage: the messages a person sent, how many went out or were held, and what parents answered', async () => {
    const r = await run(principal, 'pulse-coverage', month);
    expect(r.rows).toEqual([
      { class: '5-A', sent: 1, queued: 1, held: 1, understood: 1, needs_help: 1 },
      { class: '6-B', sent: 1, queued: 1, held: 0, understood: 2, needs_help: 0 },
    ]);
    expect(r.total).toEqual({ class: null, sent: 2, queued: 2, held: 1, understood: 3, needs_help: 1 });
  });

  it('messages by state: a row a day, counts only', async () => {
    const r = await run(principal, 'messages-by-state', month);
    expect(r.rows).toEqual([
      { day: day(10), ...NO_STATE, held: 1, all: 1 },
      // Written ten past midnight in India: that day's, by India's date.
      { day: day(5), ...NO_STATE, delivered: 1, all: 1 },
      { day: day(4), ...NO_STATE, sent: 1, all: 1 },
      { day: day(2), ...NO_STATE, failed: 1, all: 1 },
      { day: day(1), ...NO_STATE, read: 1, all: 1 },
      { day: day(0), ...NO_STATE, queued: 1, delivered: 1, held: 1, all: 3 },
    ]);
    expect(r.total).toEqual({ day: null, queued: 1, uncertain: 0, sent: 1, delivered: 2, read: 1, failed: 1, held: 2, all: 8 });
    // No name and no number: nothing of a parent or a child is in the answer. The email is not a WhatsApp message.
    expect(JSON.stringify(r)).not.toMatch(/9000000001|9000000006|Anita|Fatima|Asha|Farah/);
    for (const row of [...r.rows, r.total!]) expect(Object.keys(NO_STATE).reduce((a, s) => a + Number(row[s]), 0), String(row.day)).toBe(row.all);
  });

  it('staff leave: a row a leave, in the order of its first day; never added up by person, never the kind or the reason', async () => {
    const r = await run(principal, 'staff-leave', month);
    expect(r.rows).toEqual([
      // Two of the eight days of this leave fall inside the thirty days.
      { name: 'Tara Teacher', from_date: day(35), to_date: day(28), days: 2 },
      { name: 'Tara Teacher', from_date: day(3), to_date: day(3), days: 1 },
      // Yesterday and today are inside; tomorrow and the day after are not.
      { name: 'Tarun Teacher', from_date: day(1), to_date: day(-2), days: 2 },
    ]);
    expect(r.total).toEqual({ name: null, from_date: null, to_date: null, days: 5 });
    // Leave is never counted by person (docs/26 section 3 rule 4, and the leave module's own rule): Tara's two
    // leaves are two rows, and no row says the three days they make together.
    expect(r.rows.filter((x) => x.name === 'Tara Teacher')).toHaveLength(2);
    expect(r.rows.map((x) => x.days)).not.toContain(3);
    // The order is the leave's first day (the office's own list), not a count: the days neither rise nor fall.
    expect(r.rows.map((x) => x.from_date)).toEqual([day(35), day(3), day(1)]);
    expect(r.rows.map((x) => x.days)).toEqual([2, 1, 2]);
    // Waiting, withdrawn and refused requests are not leave; leave of sixty days ago is outside.
    expect(JSON.stringify(r)).not.toMatch(/Chitra|Anil|casual|family function|audit/i);
    const week = await run(principal, 'staff-leave', days('7d'));
    expect(week.rows.map((x) => [x.name, x.from_date, x.days])).toEqual([['Tara Teacher', day(3), 1], ['Tarun Teacher', day(1), 2]]);
    // A whole year: every approved leave of it, one row each, each with its own days.
    const year = await run(principal, 'staff-leave', { from: day(365), to: day(0) });
    expect(year.rows.map((x) => [x.name, x.from_date, x.to_date, x.days])).toEqual([['Tara Teacher', day(60), day(58), 3], ['Tara Teacher', day(35), day(28), 8], ['Tara Teacher', day(3), day(3), 1], ['Tarun Teacher', day(1), day(-2), 2]]);
    expect(year.total!.days).toBe(14);
    // The school admin reads the same list.
    expect((await run(admin, 'staff-leave', month)).rows).toEqual(r.rows);
  });

  it('nothing of another school is in any report', async () => {
    // School B has an absence today, a receipt, an overdue fee, a failed message and approved leave.
    for (const id of REPORT_IDS) expect(JSON.stringify(await run(principal, id, { from: day(365), to: day(0) })), id).not.toMatch(/Bina|Bharat/);
    expect((await run(principal, 'dues', month)).total!.owed).toBe(630000); // not School B's 9,99,000
  });
});

describe('each report’s total equals the sum of its rows', () => {
  const spans: [string, FactRange][] = [['today', days('today')], ['7 days', days('7d')], ['30 days', days('30d')], ['two dates', { from: day(44), to: day(2) }], ['a whole year', { from: day(365), to: day(0) }]];

  it('for every report and every choice of days: each summed column is its rows added up, and a rate is worked out from the sums', async () => {
    let compared = 0;
    let shared = 0;
    for (const [name, range] of spans) {
      for (const def of REPORTS) {
        const r = await run(principal, def.id, range);
        expect(r.rows.length, `${def.id}, ${name}`).toBeGreaterThan(0);
        for (const c of def.columns) {
          if (c.total === 'sum') {
            expect(r.total![c.key], `${def.id}.${c.key}, ${name}`).toBe(sum(r.rows, c.key));
            compared += 1;
          } else if (c.total === 'none' || c.total === 'label') expect(r.total![c.key], `${def.id}.${c.key}, ${name}`).toBeNull();
          else if (c.total === 'whole') {
            // A count the rows share: at least the largest row, at most the rows added up, and never left out.
            const each = r.rows.map((row) => Number(row[c.key]));
            expect(Number(r.total![c.key]), `${def.id}.${c.key}, ${name}`).toBeGreaterThanOrEqual(Math.max(...each));
            expect(Number(r.total![c.key]), `${def.id}.${c.key}, ${name}`).toBeLessThanOrEqual(sum(r.rows, c.key));
            shared += 1;
          }
        }
        if (def.id === 'attendance-by-class') {
          const [inSchool, marks] = [sum(r.rows, 'present') + sum(r.rows, 'late'), sum(r.rows, 'present') + sum(r.rows, 'late') + sum(r.rows, 'absent') + sum(r.rows, 'leave')];
          expect(r.total!.rate, name).toBe(Math.round((inSchool / marks) * 1000) / 10);
          // Each class's own rate, by the same rule.
          for (const row of r.rows) expect(row.rate, `${row.class}, ${name}`).toBe(Math.round(((Number(row.present) + Number(row.late)) / (Number(row.present) + Number(row.late) + Number(row.absent) + Number(row.leave))) * 1000) / 10);
        }
      }
    }
    expect(compared).toBeGreaterThan(150);
    // The one column that is not a sum (the days a class was marked on), on each of the five spans.
    expect(shared).toBe(5);
  });

  it('days with nothing recorded give no rows and no total: nothing is not a row of zeros', async () => {
    const longAgo = { from: day(300), to: day(200) };
    for (const def of REPORTS.filter((d) => d.period === 'range')) {
      const r = await run(principal, def.id, longAgo);
      expect(r.rows, def.id).toEqual([]);
      expect(r.total, def.id).toBeNull();
    }
  });
});

describe('each report’s total equals the dashboard’s number for the same days', () => {
  const compare = async (w: Who, range: FactRange, name: string) => {
    const dashboard = await facts(w, range);
    let compared = 0;
    for (const def of REPORTS.filter((d) => d.roles.includes(w.role as SchoolRole))) {
      const r = await run(w, def.id, range);
      for (const a of def.agrees) {
        const fact = dashboard.find((f) => f.id === a.fact);
        expect(fact, `${a.fact} for ${w.role}`).toBeDefined();
        // A dashboard number that had nothing to count from says so (no value); the report then has no such figure either.
        expect(Number(r.total?.[a.column] ?? 0), `${def.id}.${a.column} against ${a.fact} (${JSON.stringify(a.pick)}), ${name}, ${w.role}`).toBe(Number(picked(fact, a.pick) ?? 0));
        compared += 1;
      }
    }
    return compared;
  };

  it('for the principal: today, 7 days, 30 days and two dates of their own', async () => {
    const perSpan = REPORTS.reduce((n, d) => n + d.agrees.length, 0);
    // Collection 3, dues 2, attendance by class 6, absentees 1, homework 5, Daily Pulse 5, messages 10.
    expect(perSpan).toBe(32);
    for (const [name, range] of [['today', days('today')], ['7 days', days('7d')], ['30 days', days('30d')], ['two dates', { from: day(44), to: day(2) }], ['long ago', { from: day(300), to: day(200) }]] as [string, FactRange][]) {
      expect(await compare(principal, range, name), name).toBe(perSpan);
    }
  });

  it('the numbers themselves, for 30 days, are the dashboard’s', async () => {
    const dashboard = Object.fromEntries((await facts(principal, days('30d'))).map((f) => [f.id, f]));
    expect(dashboard['fees.collected']).toMatchObject({ value: 720000, count: 5 });
    expect(dashboard['fees.overdue']).toMatchObject({ value: 630000, count: 5 });
    expect(dashboard['attendance.present_rate'].value).toBe(56.3);
    expect([dashboard['homework.set'].value, dashboard['homework.checked'].value, dashboard['homework.checked'].total, dashboard['homework.not_done'].value]).toEqual([5, 1, 3, 3]);
    expect([dashboard['pulse.sent'].value, dashboard['pulse.understood'].value, dashboard['pulse.needs_help'].value]).toEqual([2, 3, 1]);
    expect([dashboard['messages.total'].value, dashboard['messages.failed'].value, dashboard['messages.held'].value]).toEqual([8, 1, 2]);
    const total = async (id: ReportId) => (await run(principal, id, days('30d'))).total!;
    expect((await total('daily-collection')).amount).toBe(dashboard['fees.collected'].value);
    expect((await total('dues')).owed).toBe(dashboard['fees.overdue'].value);
    expect((await total('attendance-by-class')).rate).toBe(dashboard['attendance.present_rate'].value);
    // "Days marked" in the total row is the dashboard's "Days with a mark saved": four.
    expect(dashboard['attendance.present_rate'].total).toBe(4);
    expect((await total('attendance-by-class')).days).toBe(dashboard['attendance.present_rate'].total);
    expect((await total('absentees')).days).toBe(dashboard['attendance.present_rate'].parts!.find((p) => p.key === 'absent')!.value);
    expect((await total('homework-coverage')).set).toBe(dashboard['homework.set'].value);
    expect((await total('pulse-coverage')).sent).toBe(dashboard['pulse.sent'].value);
    expect((await total('messages-by-state')).all).toBe(dashboard['messages.total'].value);
  });

  it('and for the accountant and the coordinator, each against their own numbers', async () => {
    expect(await compare(accountant, days('30d'), '30 days')).toBe(5);
    expect(await compare(coordinator, days('30d'), '30 days')).toBe(12);
    // The accountant reads the same money as the principal.
    expect((await run(accountant, 'daily-collection', days('30d'))).total).toEqual((await run(principal, 'daily-collection', days('30d'))).total);
    expect((await run(accountant, 'dues', days('30d'))).rows).toEqual((await run(principal, 'dues', days('30d'))).rows);
    // The coordinator may not see a child who is waiting for consent: the absence is still counted, without the name.
    const absent = await run(coordinator, 'absentees', days('30d'));
    expect(absent.rows.map((x) => [x.class, x.student, x.days])).toEqual([['5-A', 'Bela', 1], ['5-A', 'Chirag', 2], ['5-A', null, 1], ['6-B', 'Farah', 1]]);
    expect(absent.total!.days).toBe(5);
    expect(JSON.stringify(absent)).not.toContain('Esha');
    expect(reportTable('en', absent).rows.find((x) => x[1].startsWith('Name not shown'))).toEqual(['5-A', 'Name not shown to your role (waiting for consent)', '–', '1', expect.any(String)]);
  });
});

describe('who gets which report', () => {
  const ROLES: [Who, ReportId[]][] = [
    [principal, [...REPORT_IDS]],
    [admin, [...REPORT_IDS]],
    [accountant, ['daily-collection', 'dues']],
    [coordinator, ['attendance-by-class', 'absentees', 'homework-coverage']],
    [tara, []],
  ];

  it('the list is the role’s own: an accountant is given no learning report, a coordinator no fee report, a teacher none', async () => {
    for (const [w, mine] of ROLES) {
      signIn(w);
      const res = await getList();
      if (w === tara) {
        expect(res.status).toBe(403);
        expect((await res.json()).code).toBe('not_allowed');
        continue;
      }
      expect(res.status, w.role).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = await res.json();
      expect(body.reports.map((r: { id: string }) => r.id), w.role).toEqual(mine);
      expect(body.today).toBe(TODAY);
    }
    signIn(accountant);
    const forAccountant = (await (await getList()).json()).reports as { id: string; group: string; moduleId: string }[];
    expect(forAccountant.every((r) => r.group === 'money' && r.moduleId === 'fees')).toBe(true);
    signIn(coordinator);
    const forCoordinator = (await (await getList()).json()).reports as { id: string; group: string; moduleId: string }[];
    expect(forCoordinator.some((r) => r.group === 'money' || r.moduleId === 'fees')).toBe(false);
  });

  it('asked for by its address, a report that is not the role’s is refused: the rows and the file alike', async () => {
    const before = (await audits()).length;
    let refused = 0;
    for (const [w, mine] of ROLES) {
      signIn(w);
      for (const id of REPORT_IDS) {
        if (mine.includes(id)) {
          expect((await getRows(id, '?range=30d')).status, `${id} as ${w.role}`).toBe(200);
          continue;
        }
        for (const res of [await getRows(id, '?range=30d'), await getFile(id, '?range=30d')]) {
          expect(res.status, `${id} as ${w.role}`).toBe(403);
          const body = await res.json();
          expect(body.code, `${id} as ${w.role}`).toBe('not_allowed');
          expect(JSON.stringify(body), `${id} as ${w.role}`).not.toMatch(/rows|Asha|Chirag|Tara Teacher/);
        }
        refused += 1;
      }
    }
    // The accountant: six. The coordinator: five. The teacher: all eight.
    expect(refused).toBe(6 + 5 + 8);
    // A refused file writes nothing to the audit trail, and neither does looking at a report.
    expect(await audits()).toHaveLength(before);
    // No such report; and nobody signed in.
    signIn(principal);
    for (const res of [await getRows('marks-by-teacher'), await getFile('marks-by-teacher')]) {
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe('not_found');
    }
    signIn(null);
    for (const res of [await getList(), await getRows('dues'), await getFile('dues')]) expect(res.status).toBe(401);
    expect(await audits()).toHaveLength(before);
  });

  it('asked for through the library, it is refused before any query runs', async () => {
    let pairs = 0;
    for (const [w, mine] of ROLES) {
      for (const def of REPORTS.filter((d) => !mine.includes(d.id))) {
        const asked = { query: vi.fn(async () => ({ rows: [] })) };
        await expect(runReport(asked, def, { ...who(w), today: TODAY, range: days('30d') }), `${def.id} → ${w.role}`).rejects.toBeInstanceOf(NotThisRolesReport);
        expect(await askReport(asked, who(w), ents(), def.id, new URLSearchParams('range=30d'), TODAY), `${def.id} → ${w.role}`).toEqual({ ok: false, reason: 'not_allowed' });
        expect(asked.query, `${def.id} → ${w.role}`).not.toHaveBeenCalled();
        pairs += 1;
      }
    }
    expect(pairs).toBe(19);
    // In the role's real session too: nothing is read, and the transaction goes on.
    const still = await asWho(db, accountant, async (c) => {
      await expect(runReport(c, reportDefinition('absentees'), { ...who(accountant), today: TODAY, range: days('30d') })).rejects.toBeInstanceOf(NotThisRolesReport);
      return (await c.query(`select count(*)::int as n from receipts`)).rows[0].n;
    });
    expect(still).toBe(7);
  });

  // The pairs the database alone would answer: a teacher's own classes' attendance, homework and Daily Pulse, which
  // are theirs to read on their own screens (role policies on attendance, pulse_messages, pulse_response_log and
  // communication_log since C210 refuse the accountant and the coordinator). For these the report's own role list is
  // what refuses, before any query runs (the test above). Every other pair is refused by the database itself, which
  // the test below proves pair by pair. Since C219 that includes a teacher's messages-by-state: the school's message
  // totals are answered only to those who read its whole log (reads_school_message_totals()).
  const HELD_BY_THE_LIST_ONLY: Record<string, ReportId[]> = {
    teacher: ['attendance-by-class', 'absentees', 'homework-coverage', 'pulse-coverage'],
  };

  it('and the database itself: the report’s own query, run in the role’s session with no check in code, gives nothing', async () => {
    const answered: Record<string, ReportId[]> = {};
    for (const [w, mine] of ROLES.filter(([x]) => x !== principal && x !== admin)) {
      for (const def of REPORTS.filter((d) => !mine.includes(d.id))) {
        // The principal has rows in every report of the seeded school, so "nothing" below is the database's doing.
        expect((await run(principal, def.id, days('30d'))).rows.length, def.id).toBeGreaterThan(0);
        // def.run is the report's query with nothing in front of it.
        const got = await asWho(db, w, async (c) => {
          await c.query('savepoint direct');
          try {
            return (await def.run(c, { ...who(w), today: TODAY, range: days('30d') })).rows;
          } catch {
            await c.query('rollback to savepoint direct');
            return []; // the database refused the statement outright
          }
        });
        if (got.length > 0) (answered[w.role] ??= []).push(def.id);
      }
    }
    expect(answered).toEqual(HELD_BY_THE_LIST_ONLY);
    // "A coordinator no fee report" and "an accountant no homework or leave report" are the database's own rule.
    expect(answered.academic_coordinator ?? []).not.toContain('daily-collection');
    expect(answered.academic_coordinator ?? []).not.toContain('dues');
    expect(answered.accountant ?? []).not.toContain('homework-coverage');
    for (const role of Object.keys(answered)) expect(answered[role], role).not.toContain('staff-leave');
  });

  it('and the tables themselves refuse: fees to a coordinator and a teacher, homework to an accountant, another person’s leave to all three', async () => {
    const count = (w: Who, sql: string, params: unknown[] = []) => asWho(db, w, async (c) => Number((await c.query(`select count(*) as n from ${sql}`, params)).rows[0].n));
    for (const table of ['receipts', 'fees_ledger', 'payments', 'fee_followups']) {
      expect(await count(principal, table), table).toBeGreaterThan(0);
      expect(await count(accountant, table), table).toBeGreaterThan(0);
      for (const w of [coordinator, tara]) expect(await count(w, table), `${table} as ${w.role}`).toBe(0);
    }
    for (const table of ['homework', 'homework_targets', 'homework_status']) {
      expect(await count(coordinator, table), table).toBeGreaterThan(0);
      expect(await count(accountant, table), `${table} as accountant`).toBe(0);
    }
    expect(await count(principal, 'staff_leave where user_id <> $1', [PRINCIPAL])).toBe(7);
    for (const w of [accountant, coordinator, tara]) expect(await count(w, 'staff_leave where user_id <> $1', [w.user]), `leave as ${w.role}`).toBe(0);
    // A person still reads their own requests: the accountant's two, which are not approved and so in no report.
    expect(await count(accountant, 'staff_leave')).toBe(2);
    expect(ACCOUNTANT).toBeTruthy();
  });
});

describe('the export: the rows on screen, and one audit row', () => {
  it('for every report the file has exactly the rows and the total the screen was given, and writes exactly one audit row', async () => {
    signIn(principal);
    const atStart = (await audits()).length;
    for (const id of REPORT_IDS) {
      const before = await audits();
      // What the screen is drawn from: the rows route's answer.
      const screen = await shown(id, '?range=30d');
      expect(await audits(), `${id}: looking writes nothing`).toHaveLength(before.length);
      const res = await getFile(id, '?range=30d');
      expect(res.status, id).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('content-disposition'), id).toBe(`attachment; filename="report-${id}-${screen.range ? `${screen.range.from}-to-${screen.range.to}` : TODAY}.csv"`);
      const { mark, lines } = await csvOf(res);
      expect(mark).toEqual([0xef, 0xbb, 0xbf]);
      // The screen's table and the file, written from the same answer: the same headings, the same rows in the
      // same order, the total last.
      const file = reportCsv('en', screen);
      const table = reportTable('en', screen);
      expect(lines[0], id).toEqual(file.header);
      expect(lines.slice(1), id).toEqual(asText(file.rows));
      expect(lines.length - 2, id).toBe(screen.rows.length);
      expect(table.rows, id).toHaveLength(lines.length - 2);
      expect(lines[lines.length - 1][0], id).toBe('Total');
      expect(table.total![0], id).toBe('Total');
      // Cell by cell, the first column (a day, a class, a name) is the screen's row in the file's own spelling.
      screen.rows.forEach((row, i) => expect(lines[i + 1][0], `${id} row ${i + 1}`).toBe(String(row[screen.columns[0].key] ?? table.rows[i][0])));
      // The file's own total row is the file's own rows added up, in every column that is a sum; the one count
      // that is not (the days a class was marked on) is the screen's own figure.
      reportDefinition(id).columns.forEach((c, col) => {
        if (c.total === 'whole') return expect(lines[lines.length - 1][col], `${id}.${c.key}`).toBe(String(screen.total![c.key]));
        if (c.total !== 'sum') return;
        const added = lines.slice(1, -1).reduce((a, l) => a + Number(l[col]), 0);
        expect(Number(lines[lines.length - 1][col]), `${id}.${c.key}`).toBeCloseTo(added, 2);
      });
      // Exactly one audit row: who, which report, which days, how many rows. Never the rows.
      const after = await audits();
      expect(after, id).toHaveLength(before.length + 1);
      const row = after[after.length - 1];
      expect(row, id).toMatchObject({ actor_user_id: PRINCIPAL, role: 'principal', target_type: 'report', target_id: null, before_state: null });
      expect(row.after_state, id).toEqual({ report: id, period: screen.period, from: screen.range?.from ?? null, to: screen.range?.to ?? null, rows: screen.rows.length, language: 'en' });
      expect(JSON.stringify(row), id).not.toMatch(/Asha|Chirag|Gopal|Tara Teacher|500000|630000/);
    }
    expect(await audits()).toHaveLength(atStart + REPORT_IDS.length);
  });

  it('the file says amounts in rupees and a rate as a percentage, in the person’s language', async () => {
    signIn(accountant);
    const dues = (await csvOf(await getFile('dues'))).lines;
    expect(dues).toEqual([
      ['Family or student', 'Children', 'Overdue entries', 'Owed (rupees)', 'Oldest due date', 'Last follow-up', 'Follow-up on'],
      ['Gopal', '1', '1', '600', day(15), 'None yet', ''],
      ['F-001 · Asha', '2', '3', '5500', day(12), 'Promise to pay', day(2)],
      ['F-002 · Hina', '1', '1', '200', day(7), 'Call', day(1)],
      ['Total', '4', '5', '6300', '', '', ''],
    ]);
    const collection = (await csvOf(await getFile('daily-collection', `?from=${day(3)}&to=${day(0)}`))).lines;
    expect(collection[0]).toEqual(['Day', 'Receipts', 'Collected (rupees)', 'Cash (rupees)', 'UPI (rupees)', 'Cheque (rupees)', 'Card (rupees)', 'Net banking (rupees)', 'Online (rupees)', 'Receipts reversed']);
    expect(collection.slice(1)).toEqual([
      [day(3), '2', '1300', '0', '1000', '0', '0', '0', '300', '0'],
      [day(2), '0', '0', '0', '0', '0', '0', '0', '0', '1'],
      [day(1), '1', '400', '0', '0', '0', '400', '0', '0', '0'],
      [day(0), '1', '500', '500', '0', '0', '0', '0', '0', '0'],
      ['Total', '4', '2200', '500', '1000', '0', '400', '0', '300', '1'],
    ]);
    const last = (await audits()).pop()!;
    expect(last).toMatchObject({ actor_user_id: ACCOUNTANT, role: 'accountant', after_state: { report: 'daily-collection', period: 'range', from: day(3), to: day(0), rows: 4, language: 'en' } });
    signIn(coordinator);
    const byClass = (await csvOf(await getFile('attendance-by-class', '?range=30d'))).lines;
    expect(byClass[0]).toEqual(['Class', 'Days marked', 'Present', 'Late', 'Absent', 'On leave', 'In school (percent)']);
    expect(byClass.slice(1)).toEqual([['5-A', '4', '6', '1', '4', '1', '58.3'], ['6-B', '2', '2', '0', '1', '1', '50'], ['Total', '4', '8', '1', '5', '2', '56.3']]);
    signIn(principal);
    const leave = (await csvOf(await getFile('staff-leave', '?range=30d'))).lines;
    expect(leave).toEqual([
      ['Member of staff', 'First day of leave', 'Last day of leave', 'Days of leave in the days shown'],
      ['Tara Teacher', day(35), day(28), '2'], ['Tara Teacher', day(3), day(3), '1'], ['Tarun Teacher', day(1), day(-2), '2'],
      ['Total', '', '', '5'],
    ]);
    // In Hindi, for a person whose language is Hindi (their own cookie; anyone else's is ignored).
    signIn(principal);
    const hindi = (await csvOf(await getFile('absentees', '?range=30d', `${LANG_COOKIE}=${langCookieValue(PRINCIPAL, 'hi')}`))).lines;
    expect(hindi[0]).toEqual(['कक्षा', 'विद्यार्थी', 'रोल नंबर', 'अनुपस्थिति के दिन', 'तारीख़ें']);
    expect(hindi[2]).toEqual(['5-A', 'Chirag', '', '2', `${day(1)}; ${day(0)}`]);
    expect(hindi[hindi.length - 1]).toEqual(['कुल', '', '', '5', '']);
    expect((await audits()).pop()!.after_state).toMatchObject({ report: 'absentees', language: 'hi', rows: 4 });
    expect((await csvOf(await getFile('absentees', '?range=30d', `${LANG_COOKIE}=${langCookieValue(TARA, 'hi')}`))).lines[0][0]).toBe('Class');
  });

  it('a span longer than a year, or backwards, or not real dates, is refused: for the rows and for the file, with nothing audited', async () => {
    signIn(principal);
    const before = (await audits()).length;
    for (const query of [`?from=${day(366)}&to=${day(0)}`, `?from=${day(0)}&to=${day(7)}`, '?from=2026-02-30&to=2026-03-02', `?from=${day(7)}`, '?range=90d', `?from=${day(7)}&to=${day(0)}&range=7d`]) {
      for (const res of [await getRows('absentees', query), await getFile('absentees', query)]) {
        expect(res.status, query).toBe(400);
        const body = await res.json();
        expect(body.code, query).toBe('range');
        expect(body.error, query).toMatch(/at most 366 days/);
      }
    }
    // 366 days, both ends included, is the most: it is answered.
    const year = await getRows('absentees', `?from=${day(365)}&to=${day(0)}`);
    expect(year.status).toBe(200);
    expect((await year.json()).report.range).toEqual({ from: day(365), to: day(0) });
    expect(await audits()).toHaveLength(before);
  });

  it('a report with more rows than one report reads is refused in plain words, never cut short', async () => {
    signIn(principal);
    const before = (await audits()).length;
    const absentees = reportDefinition('absentees');
    const spy = vi.spyOn(absentees, 'run').mockRejectedValue(new ReportTooLarge('absentees'));
    try {
      for (const res of [await getRows('absentees', '?range=30d'), await getFile('absentees', '?range=30d')]) {
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: 'too_many_rows', error: expect.stringMatching(/Choose fewer days/) });
      }
    } finally {
      spy.mockRestore();
    }
    expect((await getRows('absentees', '?range=30d')).status).toBe(200);
    expect(await audits()).toHaveLength(before);
  });
});

describe('a school that has not set fees up says so, as the dashboard does', () => {
  // School C (seed.ts): a principal, one class, one student. No fee was ever raised and no receipt issued.
  const outside = (sql: string) => db.pg.exec(`set session_replication_role = replica; ${sql}; set session_replication_role = origin;`);
  const overdue = async () => (await facts(principalC, days('30d'))).find((f) => f.id === 'fees.overdue')!;

  it('dues and defaulters: "not set up" while no fee has been raised, and "no fee is overdue" only once one has', async () => {
    // The dashboard's number for this school: not set up, and no value.
    expect(await overdue()).toMatchObject({ state: 'not_set_up', value: null });
    const r = await run(principalC, 'dues', days('30d'));
    expect(r).toMatchObject({ id: 'dues', state: 'not_set_up', rows: [], total: null, notes: [] });
    expect(reportEmpty('en', r)).toEqual({ title: 'Fees are not set up yet', do: expect.stringMatching(/No fee has been raised for your school yet.*Raise a month’s dues in Fees/) });
    expect(`${reportEmpty('en', r).title} ${reportEmpty('en', r).do}`).not.toMatch(/No fee is overdue|Nothing is past its date/);
    expect(reportEmpty('hi', r).title).toBe('फ़ीस अभी सेट नहीं है');
    // Through the door the routes share, with the school's own entitlements: the same answer.
    const asked = await asWho(db, principalC, (c) => askReport(c, who(principalC), ents([], C), 'dues', new URLSearchParams(''), TODAY));
    expect(asked).toMatchObject({ ok: true, result: { state: 'not_set_up', rows: [], total: null } });

    // One fee raised and paid in full: fees are set up, and nothing is overdue. Now, and only now, it says so.
    await outside(`insert into fees_ledger (fee_id, school_id, student_id, amount_minor, gross_minor, due_date, status) values ('ae000000-0000-4000-8000-000000000399', '${C}', '${STUDENT_C}', 50000, 50000, '${day(5)}', 'paid')`);
    try {
      expect(await overdue()).toMatchObject({ state: 'ok', value: 0, count: 0 });
      const paid = await run(principalC, 'dues', days('30d'));
      expect(paid).toMatchObject({ state: 'ok', rows: [], total: null });
      expect(reportEmpty('en', paid).title).toBe('No fee is overdue');
    } finally {
      await outside(`delete from fees_ledger where school_id = '${C}'`);
    }
    expect(await overdue()).toMatchObject({ state: 'not_set_up' });
  });

  it('every other report of a school that has only begun is "ok" with no rows: nothing was recorded in the days, and it says that', async () => {
    for (const def of REPORTS.filter((d) => d.id !== 'dues')) {
      const r = await run(principalC, def.id, days('30d'));
      expect(r, def.id).toMatchObject({ state: 'ok', rows: [], total: null });
      expect(reportEmpty('en', r).title, def.id).toMatch(/^(No |Nobody )/);
    }
    // A school with rows is set up by the fact of them: the report asks the dashboard nothing more.
    for (const id of REPORT_IDS) expect((await run(principal, id, days('30d'))).state, id).toBe('ok');
    const asked = { n: 0 };
    await asWho(db, principal, async (c) => {
      const counting = { query: (text: string, params?: unknown[]) => ((asked.n += /overdue_count|select exists/.test(text) ? 1 : 0), c.query(text, params)) };
      await runReport(counting, reportDefinition('dues'), { ...who(principal), today: TODAY, range: days('30d') });
    });
    expect(asked.n, 'the fee summary is not asked for when there are rows').toBe(0);
  });
});

describe('a row a day or a row a class is counted in the database: no year is too busy for it', () => {
  const outside = (sql: string) => db.pg.exec(`set session_replication_role = replica; ${sql}; set session_replication_role = origin;`);
  const year = { from: day(365), to: day(0) };
  const ASK = REPORT_SOURCE_ROWS_MAX + 1;
  // Every statement a report runs, with what it was given.
  const statements = async (id: ReportId) => {
    const ran: { text: string; params: unknown[] }[] = [];
    await asWho(db, principal, (c) => reportDefinition(id).run({ query: (text: string, params: unknown[] = []) => (ran.push({ text, params }), c.query(text, params)) }, { ...who(principal), today: TODAY, range: year }));
    return ran;
  };

  it('more receipts in a day than a list holds are one row of the daily collection, and the dashboard’s number', async () => {
    // One more receipt than a report reads of a list, all issued yesterday in School C: half in cash, half by UPI,
    // and the last three reversed since.
    const many = ASK;
    await outside(`insert into receipts (school_id, receipt_no, student_id, total_minor, method, issued_by, issued_at, reversed_at, reversed_by, reversal_reason)
      select '${C}', 'BULK-' || g, '${STUDENT_C}', 100, case when g % 2 = 0 then 'cash' else 'upi' end, '${PRINCIPAL_C}', '${day(1)}T10:00:00+05:30',
             case when g > ${many - 3} then now() end, case when g > ${many - 3} then '${PRINCIPAL_C}'::uuid end, case when g > ${many - 3} then 'Entered twice.' end
        from generate_series(1, ${many}) g`);
    try {
      const r = await run(principalC, 'daily-collection', year);
      const stand = many - 3;
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]).toMatchObject({ day: day(1), receipts: stand, amount: stand * 100, cheque: 0, card: 0, netbanking: 0, online: 0, reversed: 3 });
      expect(Number(r.rows[0].cash) + Number(r.rows[0].upi)).toBe(stand * 100);
      expect(r.total).toMatchObject({ receipts: stand, amount: stand * 100, reversed: 3 });
      // The dashboard's "Fees received" for the same days, which is never cut short.
      const fact = (await facts(principalC, year)).find((f) => f.id === 'fees.collected')!;
      expect([fact.value, fact.count, fact.parts!.find((p) => p.key === 'reversed')!.value]).toEqual([r.total!.amount, r.total!.receipts, r.total!.reversed]);
      // Through the door the routes share: answered, not "choose fewer days".
      const asked = await asWho(db, principalC, (c) => askReport(c, who(principalC), ents([], C), 'daily-collection', new URLSearchParams(`from=${year.from}&to=${year.to}`), TODAY));
      expect(asked).toMatchObject({ ok: true, result: { total: { receipts: stand } } });
    } finally {
      await outside(`delete from receipts where school_id = '${C}'`);
    }
  }, 120_000);

  it('the module’s counts by day and by class add up to the module’s own totals, on every span', async () => {
    for (const range of [days('today'), days('7d'), days('30d'), { from: day(44), to: day(2) }, year]) {
      const name = `${range.from}..${range.to}`;
      const got = await asWho(db, principal, async (c) => ({
        money: [await collectedBetween(c, A, range.from, range.to), await collectedByDay(c, A, range.from, range.to)] as const,
        homework: [await countAssignmentsIn(c, A, range.from, range.to), await countAssignmentsByClass(c, A, range.from, range.to)] as const,
        pulse: [await sentTotals(c, A, range.from, range.to), await sentTotalsByClass(c, A, range.from, range.to)] as const,
      }));
      const add = <T,>(rows: readonly T[], key: keyof T) => rows.reduce((a, r) => a + Number(r[key]), 0);
      for (const k of ['count', 'minor', 'reversed'] as const) expect(add(got.money[1], k), `collected.${k}, ${name}`).toBe(got.money[0][k]);
      for (const k of ['set', 'due', 'checked', 'unchecked', 'not_done', 'notDoneMarks'] as const) expect(add(got.homework[1], k), `homework.${k}, ${name}`).toBe(got.homework[0][k]);
      for (const k of ['sent', 'queued', 'held', 'understood', 'needs_help'] as const) expect(add(got.pulse[1], k), `pulse.${k}, ${name}`).toBe(got.pulse[0][k]);
    }
    // By day and by method, for 30 days, by hand: the reversed receipt has a row of its own with nothing collected.
    const byDay = await asWho(db, principal, (c) => collectedByDay(c, A, day(29), day(0)));
    expect(byDay).toEqual([
      { day: day(20), method: 'cheque', count: 1, minor: 500000, reversed: 0 },
      { day: day(3), method: 'online', count: 1, minor: 30000, reversed: 0 },
      { day: day(3), method: 'upi', count: 1, minor: 100000, reversed: 0 },
      { day: day(2), method: 'cash', count: 0, minor: 0, reversed: 1 },
      { day: day(1), method: 'card', count: 1, minor: 40000, reversed: 0 },
      { day: day(0), method: 'cash', count: 1, minor: 50000, reversed: 0 },
    ]);
  });

  it('such a report reads no list, so it has no row limit to meet; only a report whose own rows are a list has one', async () => {
    // The limit a list is read with (one more than a report holds) is given to a statement only by the three
    // reports whose rows are that list. The others give no statement a limit at all.
    const readsAList: ReportId[] = [];
    for (const id of REPORT_IDS) {
      const ran = await statements(id);
      expect(ran.length, id).toBeGreaterThan(0);
      if (ran.some((q) => q.params.includes(ASK))) readsAList.push(id);
      else expect(ran.filter((q) => /\blimit\b/i.test(q.text)).map((q) => q.text.slice(0, 60)), id).toEqual([]);
    }
    expect(readsAList).toEqual(['dues', 'absentees', 'staff-leave']);
  });
});

describe('switched off', () => {
  const set = (moduleId: string, enabled: boolean) => db.pg.query(`update school_module_entitlements set enabled = $3 where school_id = $1 and module_id = $2`, [A, moduleId, enabled]);

  it('a report whose module the school has off leaves the list and is refused by its address', async () => {
    await set('attendance', false);
    try {
      signIn(coordinator);
      expect((await (await getList()).json()).reports.map((r: { id: string }) => r.id)).toEqual(['homework-coverage']);
      const before = (await audits()).length;
      for (const res of [await getRows('absentees', '?range=7d'), await getFile('absentees', '?range=7d')]) {
        expect(res.status).toBe(403);
        expect((await res.json()).code).toBe('module_off');
      }
      expect(await audits()).toHaveLength(before);
      expect((await getRows('homework-coverage', '?range=7d')).status).toBe(200);
    } finally {
      await set('attendance', true);
    }
  });

  it('with Reports itself off, none of its three addresses answers and its page says so', async () => {
    await set('reports', false);
    try {
      signIn(principal);
      const before = (await audits()).length;
      for (const res of [await getList(), await getRows('dues'), await getFile('dues')]) {
        expect(res.status).toBe(403);
        expect((await res.json()).code).toBe('module_off');
      }
      expect(await audits()).toHaveLength(before);
      const off: any = await ReportsPage();
      expect(off.type).toBe(ModuleOffPage);
      expect(off.props).toEqual({ moduleId: 'reports', reason: 'module_off' });
    } finally {
      await set('reports', true);
    }
    // Switched on: the one layout every screen shares, with the guide, the tour and the reports screen inside.
    const on: any = await ReportsPage();
    expect(on.type).toBe(ModulePage);
    expect(on.props).toMatchObject({ moduleId: 'reports', help: 'run-a-report', tour: 'reports', title: 'Reports', purpose: expect.stringContaining('a total row and a CSV file') });
    expect(on.props.children.type).toBe(ReportsView);
    state.cookies[LANG_COOKIE] = langCookieValue(PRINCIPAL, 'hi');
    try {
      expect(((await ReportsPage()) as any).props.title).toBe('रिपोर्ट');
    } finally {
      delete state.cookies[LANG_COOKIE];
    }
  });
});
