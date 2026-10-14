import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { minorToRupees } from '@/lib/fees/money';
import { LANG_COOKIE, isMessageKey, langCookieValue, t } from '@/lib/i18n';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';
import { FACTS, FACT_IDS, NO_LIST_YET, loadFacts, type FactId, type FactResult } from '@/lib/insights';
import { DASHBOARD_ATTENTION, DASHBOARD_CSV_HEADER, DASHBOARD_GROUPS, chartRowLabel, chartTitle, dashboardCsvRows, dashboardModel, sayDetail, sayNumber, sayPeriod, sayValue } from '@/lib/insights/dashboard';
import { READ_ROUTES, readModuleFor } from '@/lib/frameworks/write-guard';
import { A, ACCOUNTANT, C6B, PRINCIPAL, TARA, TODAY, accountant, admin, asWho, asWhoKept, coordinator, day, ents, principal, startSchool, tara, type Db, type Who } from './seed';
import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';

// The office's dashboard (docs/26 slice 8d, C203): the screen and its CSV are drawn from the school facts, in
// English and Hindi, on the whole schema. The export route is run for real: the caller's own session, an audit
// row, and nobody but the office.

const state = vi.hoisted(() => ({ claims: null as any, db: null as any, cookies: {} as Record<string, string> }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: (name: string) => (state.cookies[name] ? { value: state.cookies[name] } : undefined) }) }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  withTenantContext: (claims: any, fn: any) => state.db(claims, fn),
}));

import { GET as exportDashboard } from '@/app/api/app/dashboard/export/route';
import DashboardPage from '@/app/(school)/app/dashboard/page';
import { OfficeDashboard } from '@/components/shell/OfficeDashboard';
import { OfficeDashboardView } from '@/components/dashboards/OfficeDashboardView';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
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
import { AttendanceDays, AttendanceShown } from '@/components/attendance/AttendanceShown';
import { MessagesView } from '@/components/communication/MessagesView';
import { NoticesShown } from '@/components/communication/NoticesShown';
import { ComplaintsShown } from '@/components/complaints/ComplaintsShown';
import { ComplaintsView } from '@/components/complaints/ComplaintsView';
import { EventsShown } from '@/components/events/EventsShown';
import { FeesShown } from '@/components/fees/FeesShown';
import { HomeworkShown } from '@/components/homework/HomeworkShown';
import { ParentAiShown } from '@/components/parent-ai/ParentAiShown';
import { ProxyView } from '@/components/proxy/ProxyView';
import { PtmShown } from '@/components/ptm/PtmShown';
import { PtmView } from '@/components/ptm/PtmView';
import { PulseShown } from '@/components/pulse/PulseShown';
import { StaffLeaveOffice } from '@/components/staff/StaffLeaveOffice';
import { StaffLeaveShown } from '@/components/staff/StaffLeaveShown';
import { TicketsShown } from '@/components/tickets/TicketsShown';

let db: Db;
const claimsOf = (w: Who) => ({ sub: w.user, role: w.role, schoolId: A, membershipId: null, tv: 0 });
const signIn = (w: Who | null) => (state.claims = w ? claimsOf(w) : null);
const get = (query = '', cookie?: string) => exportDashboard(new NextRequest(`http://school.example/api/app/dashboard/export${query}`, cookie ? { headers: { cookie } } : undefined));
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
const audits = async () => (await db.pg.query(`select actor_user_id, actor_role::text as role, target_type, after_state from audit_log where school_id = $1 and event_action = 'dashboard.exported' order by audit_id`, [A])).rows;
const load = (w: Who, range: 'today' | '7d' | '30d' = 'today') => asWho(db, w, (c) => loadFacts(c, { schoolId: A, userId: w.user, role: w.role as never }, ents(), { range }));

describe('the words of every fact', () => {
  it('each fact has its name and its rule in English and Hindi; what can ask for a person has its sentence and its button', () => {
    for (const id of FACT_IDS) {
      for (const part of ['label', 'rule']) expect(isMessageKey(`fact.${id}.${part}`), `fact.${id}.${part}`).toBe(true);
      expect(t('hi', `fact.${id}.rule` as keyof typeof en)).toMatch(/[ऀ-ॿ]/);
    }
    for (const id of DASHBOARD_ATTENTION) for (const part of ['todo.one', 'todo.other', 'action']) expect(isMessageKey(`fact.${id}.${part}`), `fact.${id}.${part}`).toBe(true);
    // No words are left over for a fact that does not exist.
    const known = new Set<string>(FACT_IDS);
    for (const key of Object.keys(en).filter((k) => k.startsWith('fact.'))) expect(known.has(key.replace(/^fact\./, '').replace(/\.(label|rule|detail|action|todo\.one|todo\.other)$/, '')), key).toBe(true);
    expect(Object.keys(hi).filter((k) => k.startsWith('fact.')).sort()).toEqual(Object.keys(en).filter((k) => k.startsWith('fact.')).sort());
  });

  it('every table a fact is counted from has a plain name, and every tile sits in one group', () => {
    for (const table of new Set(FACTS.flatMap((f) => f.sources))) expect(isMessageKey(`dash.source.${table}`), table).toBe(true);
    const placed = DASHBOARD_GROUPS.flatMap((g) => g.facts);
    expect(new Set(placed).size).toBe(placed.length);
    // A fact is a tile, or an attention item, or the whole of a chart: none is loaded and then not shown.
    const onlyInAChart: FactId[] = ['attendance.students_marked'];
    for (const id of FACT_IDS) expect(placed.includes(id) || DASHBOARD_ATTENTION.includes(id) || onlyInAChart.includes(id), id).toBe(true);
    for (const g of DASHBOARD_GROUPS) expect(isMessageKey(`dash.group.${g.id}`), g.id).toBe(true);
    // Fees stay in their own group: no fee figure sits in the learning group or beside it (docs/26 §3 rule 5).
    for (const g of DASHBOARD_GROUPS) expect(g.facts.some((id) => id.startsWith('fees.')) && g.id !== 'money', g.id).toBe(false);
    expect(DASHBOARD_GROUPS.find((g) => g.id === 'learning')!.facts.some((id) => id.startsWith('fees.') || id === 'whatsapp.spend')).toBe(false);
  });

  it('numbers are written the Indian way, and a number that is missing says why', () => {
    expect([sayNumber(1234567, 'count'), sayNumber(10700000, 'inr_paise'), sayNumber(61.5, 'percent')]).toEqual(['12,34,567', '₹1,07,000', '61.5%']);
    // An amount is written by the fee screens' own writer, so a tile and the list it opens say it the same way:
    // paise keep both digits, whole rupees show none.
    for (const minor of [150050, 150005, 250000, 99, 0, 1234567890]) expect(sayNumber(minor, 'inr_paise'), String(minor)).toBe(`₹${minorToRupees(minor)}`);
    expect([sayNumber(150050, 'inr_paise'), sayNumber(150005, 'inr_paise'), sayNumber(99, 'inr_paise')]).toEqual(['₹1,500.50', '₹1,500.05', '₹0.99']);
    const base: FactResult = { id: 'fees.overdue', moduleId: 'fees', state: 'ok', value: 250000, count: 2, unit: 'inr_paise', period: 'now', drill: 'rows', countedAt: new Date().toISOString(), rule: { key: 'fact.fees.overdue.rule', version: 1 }, sources: ['fees_ledger'], href: '/app/fees?show=overdue', attention: true };
    expect(sayValue('en', base)).toBe('₹2,500');
    expect(sayDetail('en', base)).toBe('Fee entries: 2');
    expect(sayValue('en', { ...base, state: 'not_set_up', value: null })).toBe('Not set up yet');
    expect(sayValue('hi', { ...base, state: 'no_data', value: null })).toBe('इन दिनों में कुछ दर्ज नहीं हुआ');
    expect(sayValue('en', { ...base, id: 'attendance.classes_marked', unit: 'count', value: 4, total: 6 })).toBe('4 of 6');
    expect(sayValue('hi', { ...base, id: 'attendance.classes_marked', unit: 'count', value: 4, total: 6 })).toBe('6 में से 4');
    // Periods without cover: "x of y" while there is a period to cover; on a day with none, a plain 0, not "0 of 0".
    expect([sayValue('en', { ...base, id: 'proxy.uncovered_today', unit: 'count', value: 2, total: 3 }), sayValue('en', { ...base, id: 'proxy.uncovered_today', unit: 'count', value: 0, total: 3 }), sayValue('en', { ...base, id: 'proxy.uncovered_today', unit: 'count', value: 0, total: 0 })]).toEqual(['2 of 3', '0 of 3', '0']);
    // A budget of nothing is still said as the whole it is.
    expect(sayValue('en', { ...base, id: 'whatsapp.spend', value: 0, total: 0 })).toBe('₹0 of ₹0');
    expect(sayPeriod('en', { period: 'range', range: { from: '2026-10-08', to: '2026-10-14' } })).toBe('8 Oct to 14 Oct');
    expect([sayPeriod('en', { period: 'now' }), sayPeriod('en', { period: 'month' }), sayPeriod('en', { period: 'coming' }), sayPeriod('en', { period: 'today', range: { from: TODAY, to: TODAY } })]).toEqual(['As of now', 'This month', 'From today', 'Today']);
  });
});

describe('the dashboard on the whole schema', () => {
  beforeAll(async () => {
    db = await startSchool();
    state.db = (claims: any, fn: any) => asWhoKept(db, { role: claims.role, user: claims.sub }, fn);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  }, 180_000);
  afterAll(async () => db?.stop());

  it('the screen is drawn from the loaded facts: every tile a link to its rows, with its rule, source and time', async () => {
    const { facts, range } = await load(principal, '7d');
    const html = renderToStaticMarkup(h(OfficeDashboardView, { data: { schoolName: 'School A', rangeId: '7d', range, facts, failed: 0 } }));
    const model = dashboardModel(facts);
    // Each tile shows the fact's own value and opens the fact's own address. A fact whose screen cannot yet
    // list exactly its rows has no address: its tile is drawn with the number and no link at all. (No fact is
    // in that state today: complaints, meetings, leave and covers each open their rows.)
    expect(model.groups.flatMap((g) => g.tiles).filter((f) => f.href === null)).toEqual([]);
    for (const g of model.groups) {
      for (const f of g.tiles) {
        const tile = new RegExp(`<li data-fact="${f.id.replace('.', '\\.')}"[^>]*>(.*?)</li>`, 's').exec(html)?.[1] ?? '';
        if (f.href === null) {
          expect(NO_LIST_YET, f.id).toContain(f.id);
          expect(tile, f.id).not.toContain('<a ');
        } else {
          expect(tile, f.id).toContain(`href="${f.href.replace(/&/g, '&amp;')}"`);
        }
        expect(tile, f.id).toContain(`>${sayValue('en', f)}<`);
        expect(tile, f.id).toContain(en[`fact.${f.id}.rule` as keyof typeof en].replace(/’/g, '’'));
        expect(tile, f.id).toContain('Rule version');
        expect(tile, f.id).toContain('Counted from:');
      }
    }
    expect(model.groups.map((g) => g.id)).toEqual(['today', 'money', 'learning', 'parents', 'running']);
    expect(model.groups.reduce((n, g) => n + g.tiles.length, 0)).toBe(31);
    // Leave and covers sit with running the school, as three counts: who is away is never listed on the dashboard.
    expect(model.groups.find((g) => g.id === 'running')!.tiles.map((f) => f.id)).toEqual(['students.active', 'students.waiting_consent', 'staff.leave_waiting', 'staff.on_leave_today', 'proxy.uncovered_today', 'whatsapp.spend', 'tickets.open']);
    for (const name of ['Tarun', 'Tara Teacher', 'Tina', 'Asif Admin']) expect(html, name).not.toContain(name);
    const tileOf = (id: string) => new RegExp(`<li data-fact="${id.replace('.', '\\.')}"[^>]*>(.*?)</li>`, 's').exec(html)?.[1] ?? '';
    expect([tileOf('staff.leave_waiting').includes('>2<'), tileOf('staff.on_leave_today').includes('>1<'), tileOf('proxy.uncovered_today').includes('>2 of 3<')]).toEqual([true, true, true]);
    expect([tileOf('complaints.open').includes('href="/app/complaints?show=open"'), tileOf('ptm.coming').includes('href="/app/ptm?show=coming"'), tileOf('proxy.uncovered_today').includes('href="/app/proxy?show=needs-cover"')]).toEqual([true, true, true]);
    // The attention list is the facts that ask for a person, in the day's order.
    expect(model.attention.map((f) => f.id).filter((id) => id !== 'attendance.classes_unmarked')).toEqual(['proxy.uncovered_today', 'complaints.overdue', 'notices.waiting', 'staff.leave_waiting', 'fees.upi_to_verify', 'fees.promises_due', 'fees.overdue', 'followups.open', 'parent_ai.drafts', 'students.waiting_consent', 'messages.failed', 'messages.held', 'tickets.waiting']);
    for (const f of facts) if (f.attention) expect(DASHBOARD_ATTENTION, f.id).toContain(f.id);
    expect(html).toContain('2 fee entries are overdue');
    expect(html).toContain('1 complaint is past its due time');
    expect(html).toContain('2 periods have no teacher today');
    // The principal may decide both leave requests that wait.
    expect(html).toContain('2 leave requests are waiting for your decision');
    // Each attention item's button goes to the fact's own list.
    for (const [id, href] of [['complaints.overdue', '/app/complaints?show=overdue'], ['staff.leave_waiting', '/app/staff?show=leave-waiting'], ['proxy.uncovered_today', '/app/proxy?show=needs-cover']]) {
      expect(new RegExp(`<li data-attention="${id.replace('.', '\\.')}"[^>]*>(.*?)</li>`, 's').exec(html)?.[1] ?? '', id).toContain(`href="${href}"`);
    }
    // The school admin's own request waits too, and nobody decides their own: the sentence says the one request
    // that is theirs to decide (My Day says the same), while the tile says the two on the list it opens.
    const office = await load(admin, '7d');
    const officeHtml = renderToStaticMarkup(h(OfficeDashboardView, { data: { schoolName: 'School A', rangeId: '7d', range: office.range, facts: office.facts, failed: 0 } }));
    const attentionOf = (page: string, id: string) => new RegExp(`<li data-attention="${id.replace('.', '\\.')}"[^>]*>(.*?)</li>`, 's').exec(page)?.[1] ?? '';
    expect([attentionOf(officeHtml, 'staff.leave_waiting').includes('1 leave request is waiting for your decision'), officeHtml.includes('leave requests are waiting')]).toEqual([true, false]);
    // The chip in the band at the top says the same 1 beside its button (for the principal, 2).
    const chip = (page: string) => /href="\/app\/staff\?show=leave-waiting"[^>]*><span[^>]*>(\d+)<\/span>See the requests/.exec(page)?.[1];
    expect([chip(officeHtml), chip(html)]).toEqual(['1', '2']);
    expect(new RegExp(`<li data-fact="staff\\.leave_waiting"[^>]*>(.*?)</li>`, 's').exec(officeHtml)?.[1] ?? '').toContain('>2<');
    // The file says what the screen says: 1 under "Needs your attention", 2 on the tile's row.
    const officeRows = dashboardCsvRows('en', dashboardModel(office.facts), office.range);
    expect(officeRows.filter((r) => r[1] === 'Leave requests waiting').map((r) => [r[0], r[2], r[4]])).toEqual([['Needs your attention', 1, 'count'], ['Running the school', 2, 'count']]);
    expect(html).toContain(`data-needs-you="${model.attention.length}"`);
    // Charts: one message each, and a table whose rows are the facts' own parts.
    expect(model.charts.map((c) => c.id)).toEqual(['attendance-today', 'present-rate', 'fees-owed', 'messages-by-state', 'homework-checked']);
    expect(chartTitle('en', model.charts[0])).toBe('Attendance today: 4 of 8 students marked');
    expect(model.charts[0].rows.map((r) => [chartRowLabel('en', model.charts[0], r), r.value, r.href])).toEqual([['Present', 1, '/app/attendance?show=present'], ['Absent', 1, '/app/attendance?show=absent'], ['Late', 1, '/app/attendance?show=late'], ['On leave', 1, '/app/attendance?show=leave'], ['Not marked yet', 4, '/app/attendance?show=not-marked']]);
    expect(chartTitle('en', model.charts[1])).toBe('In school over these days: 61.5%');
    expect(model.charts[1].href).toBe(`/app/attendance?show=days&from=${day(6)}&to=${TODAY}`);
    // The fees chart is two facts side by side. Its title says no total (the two added together would be a number
    // with no rule and no list of its own); each row is its own fact, with its own rule and its own rows.
    const fees = model.charts[2];
    expect([chartTitle('en', fees), chartTitle('hi', fees), fees.value, fees.href]).toEqual(['Fees still to come in', 'जो फ़ीस अभी आनी है', null, null]);
    expect(fees.rows.map((r) => [chartRowLabel('en', fees, r), r.value, r.href, r.fact?.id])).toEqual([['Not yet due', 600000, '/app/fees?show=owed', 'fees.owed'], ['Overdue', 250000, '/app/fees?show=overdue', 'fees.overdue']]);
    const feesCard = new RegExp(`<div data-chart="fees-owed"[^>]*>(.*?)</details>`, 's').exec(html)?.[1] ?? '';
    for (const id of ['fees.owed', 'fees.overdue'] as const) {
      const why = new RegExp(`<div data-why-fact="${id.replace('.', '\\.')}"[^>]*>(.*?)</div>`, 's').exec(feesCard)?.[1] ?? '';
      expect(why, id).toContain(en[`fact.${id}.label`]);
      expect(why, id).toContain(en[`fact.${id}.rule`]);
    }
    // In the chart itself each bar's name opens that bar's rows.
    expect(feesCard).toContain('href="/app/fees?show=owed"');
    expect(feesCard).toContain('href="/app/fees?show=overdue"');
    expect(html).not.toContain('8,500');
    // Today's attendance: each bar is its own fact; "not marked yet" is a part of the marked fact.
    expect(model.charts[0].rows.map((r) => r.fact?.id)).toEqual(['attendance.present', 'attendance.absent', 'attendance.late', 'attendance.leave', undefined]);
    expect(model.charts[3].rows.map((r) => [chartRowLabel('en', model.charts[3], r), r.value])).toEqual([['Waiting to go', 1], ['Not known', 0], ['Sent', 1], ['Delivered', 1], ['Read', 1], ['Failed', 1], ['Held back', 1]]);
    expect(chartTitle('hi', model.charts[4])).toBe('जाँचा गया होमवर्क: 2 में से 1');
  });

  it('the range is in the address: today unless a real range is asked for; other roles are sent to My Day', async () => {
    signIn(principal);
    const page: any = await DashboardPage({ searchParams: { range: '30d' } });
    expect(page.type).toBe(OfficeDashboard);
    expect(page.props).toMatchObject({ rangeId: '30d', lang: 'en' });
    expect(((await DashboardPage({ searchParams: { range: 'forever' } })) as any).props.rangeId).toBe('today');
    expect(((await DashboardPage({ searchParams: {} })) as any).props.rangeId).toBe('today');
    state.cookies[LANG_COOKIE] = langCookieValue(PRINCIPAL, 'hi');
    expect(((await DashboardPage({ searchParams: {} })) as any).props.lang).toBe('hi');
    state.cookies = {};
    for (const w of [{ role: 'teacher', user: TARA }, { role: 'accountant', user: ACCOUNTANT }]) {
      signIn(w);
      await expect(DashboardPage({ searchParams: {} })).rejects.toThrow(/NEXT_REDIRECT/);
    }
    // The server component loads in the reader's own session and hands the view real facts.
    signIn(admin);
    const drawn: any = await OfficeDashboard({ session: claimsOf(admin) as never, rangeId: '7d', lang: 'en' });
    expect(drawn.props).toMatchObject({ tour: 'dashboard', help: 'read-the-dashboard', lang: 'en' });
    expect(drawn.props.data).toMatchObject({ schoolName: 'School A', rangeId: '7d', range: { from: day(6), to: TODAY }, failed: 0 });
    expect(drawn.props.data.facts).toHaveLength(FACT_IDS.length);
  });

  it('switched off for the school, the dashboard page shows the "module off" state', async () => {
    signIn(principal);
    await db.pg.query(`update school_module_entitlements set enabled = false where school_id = $1 and module_id = 'dashboard'`, [A]);
    try {
      const page: any = await DashboardPage({ searchParams: {} });
      expect(page.type).toBe(ModuleOffPage);
      const res = await get();
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('module_off');
    } finally {
      await db.pg.query(`update school_module_entitlements set enabled = true where school_id = $1 and module_id = 'dashboard'`, [A]);
    }
  });

  it('the CSV has what is on the screen, in the person’s language, and every export is audited', async () => {
    expect(readModuleFor('/api/app/dashboard/export')).toBe('dashboard');
    expect(READ_ROUTES.some(([pattern, module]) => pattern === 'dashboard/export' && module === 'dashboard')).toBe(true);
    signIn(principal);
    const res = await get('?range=7d');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="dashboard-${TODAY}-7d.csv"`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const { mark, lines } = await csvOf(res);
    expect(mark).toEqual([0xef, 0xbb, 0xbf]);
    expect(lines[0]).toEqual(DASHBOARD_CSV_HEADER.map((k) => t('en', k)));
    // The same rows the screen is drawn from: the attention list, every tile, every chart row.
    const { facts, range } = await load(principal, '7d');
    const model = dashboardModel(facts);
    const expected = dashboardCsvRows('en', model, range);
    expect(lines.length - 1).toBe(expected.length);
    expect(expected.length).toBe(model.attention.length + model.groups.reduce((n, g) => n + g.tiles.length, 0) + model.charts.reduce((n, c) => n + c.rows.length, 0));
    // Every cell but the moment it was counted (column 7) is the same as a fresh count.
    for (let i = 0; i < expected.length; i++) expect(lines[i + 1].filter((_, col) => col !== 6), `row ${i + 1}`).toEqual(expected[i].filter((_, col) => col !== 6).map((v) => (v === null || v === undefined ? '' : String(v))));
    const row = (label: string) => lines.find((l) => l[1] === label)!;
    expect(row('Fees overdue').slice(0, 6)).toEqual(['Needs your attention', 'Fees overdue', '2', '', 'count', 'As of now']);
    expect(lines.find((l) => l[0] === 'Money' && l[1] === 'Fees overdue')!.slice(2, 10)).toEqual(['2500', '', 'rupees', 'As of now', expect.any(String), expect.stringContaining('due date has passed'), 'fees_ledger payments', '/app/fees?show=overdue']);
    expect(lines.find((l) => l[0] === 'Money' && l[1] === 'Fees received')!.slice(2, 6)).toEqual(['1500', '', 'rupees', `${day(6)} / ${TODAY}`]);
    expect(lines.find((l) => l[0] === 'Today' && l[1] === 'Classes marked today')!.slice(2, 4)).toEqual(['1', '2']);
    // "Out of" is written only where the tile itself says "x of y": the file says no whole the screen does not say.
    const tiles = model.groups.flatMap((g) => g.tiles);
    const tileRows = expected.slice(model.attention.length, model.attention.length + tiles.length);
    tiles.forEach((f, i) => expect(tileRows[i][3] !== null, f.id).toBe(/ of /.test(sayValue('en', f))));
    expect(tiles.filter((_, i) => tileRows[i][3] !== null).map((f) => f.id)).toEqual(['attendance.classes_marked', 'homework.checked', 'proxy.uncovered_today', 'whatsapp.spend']);
    expect(lines.find((l) => l[0] === 'Running the school' && l[1] === 'Periods without cover today')!.slice(2, 10)).toEqual(['2', '3', 'count', `${TODAY} / ${TODAY}`, expect.any(String), expect.stringContaining('have no teacher'), 'timetable_entries staff_leave substitutions', '/app/proxy?show=needs-cover']);
    expect(lines.find((l) => l[0] === 'Running the school' && l[1] === 'Staff on leave today')!.slice(2, 5)).toEqual(['1', '', 'count']);
    expect(lines.find((l) => l[0] === 'Needs your attention' && l[1] === 'Leave requests waiting')!.slice(2, 4)).toEqual(['2', '']);
    // The present rate is a share, not "61.5 out of 3": its days are not put in that column.
    expect(lines.find((l) => l[0] === 'Learning' && l[1] === 'In school, of those marked')!.slice(2, 5)).toEqual(['61.5', '', 'percent']);
    expect(lines.find((l) => l[0] === 'Running the school' && l[1] === 'Active students')!.slice(2, 5)).toEqual(['8', '', 'count']);
    expect(lines.find((l) => l[0] === 'Today' && l[1] === 'Present today')!.slice(2, 5)).toEqual(['1', '', 'count']);
    expect(lines.find((l) => l[0] === 'Running the school' && l[1] === 'WhatsApp spend this month')![3]).toBe('500');
    // A chart row that is a fact of its own carries that fact's rule and address, not the chart's.
    const chartRow = (chart: string, label: string) => lines.find((l) => l[0].startsWith(chart) && l[1] === label)!;
    expect(chartRow('Fees still to come in', 'Not yet due').slice(2, 10)).toEqual(['6000', '', 'rupees', 'As of now', expect.any(String), expect.stringContaining('due date is today or later'), 'fees_ledger payments', '/app/fees?show=owed']);
    expect(chartRow('Fees still to come in', 'Overdue').slice(7, 10)).toEqual([expect.stringContaining('due date has passed'), 'fees_ledger payments', '/app/fees?show=overdue']);
    expect(chartRow('Attendance today', 'Absent')[7]).toContain('marked absent today');
    expect(chartRow('Attendance today', 'Not marked yet')[7]).toContain('with a mark saved today');
    // Every tile's address is in the file: complaints and meetings open their own lists now.
    expect(lines.find((l) => l[0] === 'Parents' && l[1] === 'Complaints open')![9]).toBe('/app/complaints?show=open');
    expect(lines.find((l) => l[0] === 'Parents' && l[1] === 'Meetings coming')![9]).toBe('/app/ptm?show=coming');
    expect(lines.slice(1 + model.attention.length, 1 + model.attention.length + tiles.length).filter((l) => l[9] === '')).toEqual([]);
    expect(lines.some((l) => l[0] === 'Note')).toBe(false);
    // The audit row: who, which days, how many rows. No number of the school is copied into it.
    const trail = await audits();
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({ actor_user_id: PRINCIPAL, role: 'principal', target_type: 'dashboard', after_state: { range: '7d', from: day(6), to: TODAY, rows: expected.length, language: 'en', leftOut: 0 } });
    expect(Object.keys(trail[0].after_state).sort()).toEqual(['from', 'language', 'leftOut', 'range', 'rows', 'to']);

    // In Hindi, for a person whose language is Hindi (their own cookie; anyone else's is ignored).
    const hindi = await get('', `${LANG_COOKIE}=${langCookieValue(PRINCIPAL, 'hi')}`);
    const hindiLines = (await csvOf(hindi)).lines;
    expect(hindiLines[0]).toEqual(DASHBOARD_CSV_HEADER.map((k) => t('hi', k)));
    expect(hindiLines.some((l) => l[1] === 'तारीख़ निकली फ़ीस')).toBe(true);
    expect((await csvOf(await get('', `${LANG_COOKIE}=${langCookieValue(TARA, 'hi')}`))).lines[0][0]).toBe('Part of the screen');
    expect(await audits()).toHaveLength(3);
  });

  it('only the office can export it; a range that is not one is refused; signed out is refused', async () => {
    const before = (await audits()).length;
    for (const w of [{ role: 'teacher', user: TARA }, { role: 'accountant', user: ACCOUNTANT }, { role: 'academic_coordinator', user: 'ad000000-0000-4000-8000-000000000016' }]) {
      signIn(w);
      const res = await get('?range=today');
      expect(res.status, w.role).toBe(403);
      expect((await res.json()).code).toBe('not_allowed');
    }
    signIn(admin);
    expect((await get('?range=today')).status).toBe(200);
    const bad = await get('?range=90d');
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe('not_sent_properly');
    signIn(null);
    expect((await get()).status).toBe(401);
    expect(await audits()).toHaveLength(before + 1); // the school admin's one export
  });

  it('when a number could not be worked out the file says so in its first row, as the screen does', async () => {
    signIn(principal);
    const usual = state.db;
    // The complaints query is made to fail inside the database, as a real fault would, for the whole request.
    state.db = (claims: any, fn: any) =>
      asWhoKept(db, { role: claims.role, user: claims.sub }, (tx) =>
        fn(new Proxy(tx, { get: (target, prop) => (prop === 'query' ? (text: string, params?: unknown[]) => target.query(/from complaints/.test(text) ? 'select * from a_table_that_is_not_there' : text, params) : typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop]) }))
      );
    try {
      const res = await get('?range=today');
      expect(res.status).toBe(200);
      const { lines } = await csvOf(res);
      expect(lines[1]).toEqual(['Note', '2 numbers could not be worked out when this file was made and are left out.', '2', '', 'count', '', '', '', '', '']);
      expect(lines.some((l) => l[1] === 'Complaints open' || l[1] === 'Complaints past their time')).toBe(false);
      expect(lines.some((l) => l[1] === 'Support tickets open')).toBe(true);
      const last = (await audits()).pop()!;
      expect(last.after_state).toMatchObject({ range: 'today', leftOut: 2, rows: lines.length - 1 });
    } finally {
      state.db = usual;
    }
    // With every number worked out there is no such row; one number left out is said in the singular, and in Hindi.
    expect((await csvOf(await get('?range=today'))).lines.some((l) => l[0] === 'Note')).toBe(false);
    const { facts, range } = await load(principal, 'today');
    expect(dashboardCsvRows('en', dashboardModel(facts), range, 1)[0].slice(0, 3)).toEqual(['Note', '1 number could not be worked out when this file was made and is left out.', 1]);
    expect(dashboardCsvRows('hi', dashboardModel(facts), range, 3)[0].slice(0, 3)).toEqual(['टिप्पणी', 'यह फ़ाइल बनाते समय 3 संख्याएँ नहीं निकल पाईं और छोड़ दी गई हैं।', 3]);
    expect(dashboardCsvRows('en', dashboardModel(facts), range)).toHaveLength(dashboardCsvRows('en', dashboardModel(facts), range, 1).length - 1);
  });
  // ---- The rows a number opens, on the module's own screen ------------------------

  // A React element's tree holds an element of that type (as a page hands it down, before anything is drawn).
  const has = (el: any, type: unknown): any => {
    if (!el || typeof el !== 'object') return null;
    if (el.type === type) return el;
    for (const child of [].concat(el.props?.children ?? [])) {
      const found = has(child, type);
      if (found) return found;
    }
    return null;
  };
  const drawn = async (el: Promise<any>) => {
    const made = await el;
    return made ? renderToStaticMarkup(made) : null;
  };
  const rowsIn = (html: string | null) => (html?.match(/data-shown-row/g) ?? []).length;

  it('the rows are read in the reader’s own session: the office all, a teacher their own classes, and a role that may not read gets nothing', async () => {
    const week = { from: day(6), to: TODAY };
    signIn(principal);
    const unmarked = await drawn(AttendanceShown({ show: 'unmarked' }));
    expect(unmarked).toContain('Classes with no attendance saved today: 1');
    expect(unmarked).toContain('0 of 3 students marked');
    expect(unmarked).toContain(`href="/app/attendance?class=${C6B}"`);
    expect(unmarked).toContain('href="/app/attendance?show=marked"');
    expect(unmarked).toContain('href="/app/attendance"');
    const absent = await drawn(AttendanceShown({ show: 'absent' }));
    expect(absent).toContain('Students absent today: 1');
    expect(absent).toContain('Chirag');
    expect([rowsIn(await drawn(AttendanceShown({ show: 'with-mark' }))), rowsIn(await drawn(AttendanceShown({ show: 'not-marked' }))), rowsIn(await drawn(AttendanceShown({ show: 'leave' })))]).toEqual([4, 4, 1]);
    const due = await drawn(HomeworkShown({ show: 'unchecked', range: week }));
    expect(due).toContain('not yet checked for everyone: 1');
    expect(due).toContain('Sums 3');
    expect(due).toContain('Checked 2 of 3; not done 1.');
    const sent = await drawn(PulseShown({ range: week }));
    expect(sent).toContain('Daily Pulse messages sent for these days: 2');
    expect(sent).toContain('To parents: 1 went out, 1 held back. Answers: 1 understood, 1 needs help.');
    expect(sent).not.toContain('Today: fractions.'); // a message's words are not shown here

    // Tara, the class teacher of 5-A: her class only.
    signIn(tara);
    expect(await drawn(AttendanceShown({ show: 'unmarked' }))).toContain('There is nothing in this list right now.');
    const hers = await drawn(AttendanceShown({ show: 'marked' }));
    expect([rowsIn(hers), hers!.includes('5-A'), hers!.includes('6-B')]).toEqual([1, true, false]);
    expect(rowsIn(await drawn(HomeworkShown({ show: 'set', range: { from: day(29), to: TODAY } })))).toBe(2);
    expect(await FeesShown({ show: 'overdue', range: null })).toBeNull();

    // The accountant: the fees, and nothing of attendance, homework or Daily Pulse.
    signIn(accountant);
    const overdue = await drawn(FeesShown({ show: 'overdue', range: null }));
    expect(overdue).toContain('Fee entries overdue: 2, ₹2,500 in all');
    expect(rowsIn(overdue)).toBe(2);
    expect(overdue).toContain('Billed ₹2,000, paid ₹500, left ₹1,500.');
    expect(rowsIn(await drawn(FeesShown({ show: 'owed', range: null })))).toBe(2);
    const collected = await drawn(FeesShown({ show: 'collected', range: week }));
    expect(collected).toContain('Receipts of these days: 2, ₹1,500 in all');
    expect(collected).toContain('1 receipt of these days was reversed and is not counted.');
    expect(collected).not.toContain('RCP-4'); // the reversed receipt is not on the list
    expect(await drawn(FeesShown({ show: 'promises', range: null }))).toContain('Promises to pay now due: 2');
    expect(await drawn(FeesShown({ show: 'verify', range: null }))).toContain('UPI payments waiting to be verified: 1');
    expect(await AttendanceShown({ show: 'unmarked' })).toBeNull();
    expect(await HomeworkShown({ show: 'due', range: week })).toBeNull();
    expect(await PulseShown({ range: week })).toBeNull();
    signIn(coordinator);
    expect(await PulseShown({ range: week })).toBeNull();
    expect(await FeesShown({ show: 'overdue', range: null })).toBeNull();
    expect(rowsIn(await drawn(HomeworkShown({ show: 'due', range: week })))).toBe(2);
  });

  it('the lists added for notices, events, draft answers, tickets and the present rate keep to the same rule: the reader’s own session', async () => {
    const week = { from: day(6), to: TODAY };
    signIn(principal);
    expect([rowsIn(await drawn(NoticesShown())), rowsIn(await drawn(EventsShown())), rowsIn(await drawn(ParentAiShown())), rowsIn(await drawn(TicketsShown({ show: 'open' }))), rowsIn(await drawn(TicketsShown({ show: 'waiting' }))), rowsIn(await drawn(AttendanceDays({ range: week })))]).toEqual([2, 1, 1, 2, 1, 3]);
    const notices = await drawn(NoticesShown());
    expect(notices).toContain('The principal approves or rejects them in the notices list below.');
    expect(notices).toContain('All classes'); // the notice for the whole school
    expect(notices).toContain('href="/app/communication"'); // "Show everything"
    // In Hindi for a person whose language is Hindi.
    state.cookies[LANG_COOKIE] = langCookieValue(PRINCIPAL, 'hi');
    expect(await drawn(TicketsShown({ show: 'waiting' }))).toContain('स्कूल के जवाब के इंतज़ार में मदद के टिकट: 1');
    expect(await drawn(AttendanceDays({ range: week }))).toContain('जिन दिनों हाज़िरी सेव हुई: 3');
    state.cookies = {};

    // Tara, the class teacher of 5-A: her class's notice, her own ticket, her class's marks.
    signIn(tara);
    const hers = await drawn(NoticesShown());
    expect([rowsIn(hers), hers!.includes('Bring a water bottle.'), hers!.includes('School closes early')]).toEqual([1, true, false]);
    const mine = await drawn(TicketsShown({ show: 'open' }));
    expect([rowsIn(mine), mine!.includes('How do I mark leave?'), mine!.includes('Fee heads')]).toEqual([1, true, false]);
    expect(await drawn(TicketsShown({ show: 'waiting' }))).toContain('There is nothing in this list right now.');
    expect(await drawn(AttendanceDays({ range: week }))).toContain('Days with attendance saved: 3');

    // The accountant: none of the parents' lists, no attendance; their own tickets only (the one they raised is resolved).
    signIn(accountant);
    expect([await NoticesShown(), await EventsShown(), await ParentAiShown(), await AttendanceDays({ range: week })]).toEqual([null, null, null, null]);
    expect(await drawn(TicketsShown({ show: 'open' }))).toContain('Support tickets open: 0');
    // The coordinator: attendance, and none of the parents' lists.
    signIn(coordinator);
    expect([await NoticesShown(), await EventsShown(), await ParentAiShown()]).toEqual([null, null, null]);
    expect(rowsIn(await drawn(AttendanceDays({ range: week })))).toBe(3);
    // Signed out, nothing.
    signIn(null);
    expect([await NoticesShown(), await EventsShown(), await ParentAiShown(), await TicketsShown({ show: 'open' }), await AttendanceDays({ range: week })]).toEqual([null, null, null, null, null]);
  });

  it('the lists added for complaints, meetings and leave keep to the same rule: the reader’s own session, and leave for the office alone', async () => {
    signIn(principal);
    expect([rowsIn(await drawn(ComplaintsShown({ show: 'open' }))), rowsIn(await drawn(ComplaintsShown({ show: 'overdue' }))), rowsIn(await drawn(PtmShown())), rowsIn(await drawn(StaffLeaveShown({ show: 'leave-waiting' }))), rowsIn(await drawn(StaffLeaveShown({ show: 'on-leave-today' })))]).toEqual([3, 1, 2, 2, 1]);
    const complaints = await drawn(ComplaintsShown({ show: 'open' }));
    expect(complaints).toContain('Complaints open: 3');
    expect(complaints).toContain('Read each complaint, add a note or close it in the list below.');
    expect(complaints).toContain('Reference AD000000');
    expect(await drawn(PtmShown())).toContain('Open a meeting in the list below to see its times and to book one.');
    expect(await drawn(StaffLeaveShown({ show: 'on-leave-today' }))).toContain('Each leave is under “Approved leave” below, where it can be cancelled if it is wrong.');
    // Drawing these lists wrote nothing: no complaint was marked as seen by the principal (this file's reads are kept).
    expect((await db.pg.query(`select count(*)::int as n from complaints where principal_seen_at is not null`)).rows[0].n).toBe(0);
    // In Hindi for a person whose language is Hindi.
    state.cookies[LANG_COOKIE] = langCookieValue(PRINCIPAL, 'hi');
    expect(await drawn(ComplaintsShown({ show: 'overdue' }))).toContain('समय निकली शिकायतें: 1');
    expect(await drawn(PtmShown())).toContain('आने वाली बैठकें: 2');
    expect(await drawn(StaffLeaveShown({ show: 'leave-waiting' }))).toContain('इंतज़ार में छुट्टी की माँगें: 2');
    expect(await drawn(StaffLeaveShown({ show: 'on-leave-today' }))).toContain('आज छुट्टी पर स्टाफ़: 1');
    state.cookies = {};

    // The school admin: the same lists as the principal (the office).
    signIn(admin);
    expect([rowsIn(await drawn(ComplaintsShown({ show: 'open' }))), rowsIn(await drawn(StaffLeaveShown({ show: 'leave-waiting' }))), rowsIn(await drawn(StaffLeaveShown({ show: 'on-leave-today' })))]).toEqual([3, 2, 1]);
    // Tara, the class teacher of 5-A: the two complaints she may see (not the one about her), her class's meeting,
    // and no list of leave at all, though a request of her own waits.
    signIn(tara);
    const hers = await drawn(ComplaintsShown({ show: 'open' }));
    expect([rowsIn(hers), hers!.includes('Fatima Ali')]).toEqual([2, false]);
    expect(rowsIn(await drawn(PtmShown()))).toBe(1);
    expect([await StaffLeaveShown({ show: 'leave-waiting' }), await StaffLeaveShown({ show: 'on-leave-today' })]).toEqual([null, null]);
    // The accountant and the academic coordinator: none of the five. (The coordinator arranges cover on Proxy Auto,
    // which tells them who is away that day and nothing else about anyone's leave.)
    for (const w of [accountant, coordinator]) {
      signIn(w);
      expect([await ComplaintsShown({ show: 'open' }), await ComplaintsShown({ show: 'overdue' }), await PtmShown(), await StaffLeaveShown({ show: 'leave-waiting' }), await StaffLeaveShown({ show: 'on-leave-today' })], w.role).toEqual([null, null, null, null, null]);
    }
    signIn(null);
    expect([await ComplaintsShown({ show: 'open' }), await PtmShown(), await StaffLeaveShown({ show: 'on-leave-today' })]).toEqual([null, null, null]);
  });

  it('a screen opens on a filter only when the filter is one of its own; without one it is the screen as before', async () => {
    signIn(principal);
    const days = { from: day(6), to: TODAY };
    expect(has(await AttendancePage({ searchParams: { show: 'unmarked' } }), AttendanceShown)?.props).toEqual({ show: 'unmarked' });
    for (const show of [undefined, 'everything', 'UNMARKED']) expect(has(await AttendancePage({ searchParams: { show } }), AttendanceShown), String(show)).toBeNull();
    expect(has(await FeesPage({ searchParams: { show: 'collected', ...days } }), FeesShown)?.props).toEqual({ show: 'collected', range: days });
    expect(has(await FeesPage({ searchParams: { show: 'overdue' } }), FeesShown)?.props).toEqual({ show: 'overdue', range: null });
    for (const show of [undefined, 'all']) expect(has(await FeesPage({ searchParams: { show } }), FeesShown), String(show)).toBeNull();
    expect(has(await HomeworkPage({ searchParams: { show: 'due', ...days } }), HomeworkShown)?.props).toEqual({ show: 'due', range: days });
    expect(has(await HomeworkPage({ searchParams: { show: 'due' } }), HomeworkShown)).toBeNull(); // no days, no list
    expect(has(await HomeworkPage({ searchParams: { show: 'due', from: TODAY, to: day(6) } }), HomeworkShown)).toBeNull(); // days the wrong way round
    expect(has(await PulsePage({ searchParams: { show: 'sent', ...days } }), PulseShown)?.props).toEqual({ range: days });
    expect(has(await PulsePage({ searchParams: { show: 'drafts', ...days } }), PulseShown)).toBeNull();
    // Communication: the messages list comes first, opened on the state and the days; without them it is last, as before.
    const opened: any = await CommunicationPage({ searchParams: { state: 'held', ...days } });
    expect(has(opened, MessagesView)?.props).toEqual({ mayRead: true, initialState: 'held', range: days });
    expect(([] as any[]).concat(opened.props.children.props.children).filter(Boolean)[0].type).toBe(MessagesView);
    const usual: any = await CommunicationPage({ searchParams: { state: 'nonsense' } });
    expect(has(usual, MessagesView)?.props).toEqual({ mayRead: true, initialState: undefined, range: undefined });
    expect(([] as any[]).concat(usual.props.children.props.children).filter(Boolean)[0].type).not.toBe(MessagesView);
    // Attendance by day: the list of days needs its days; it is not one of today's lists, and they are not it.
    expect(has(await AttendancePage({ searchParams: { show: 'days', ...days } }), AttendanceDays)?.props).toEqual({ range: days });
    expect(has(await AttendancePage({ searchParams: { show: 'days', ...days } }), AttendanceShown)).toBeNull();
    expect(has(await AttendancePage({ searchParams: { show: 'days' } }), AttendanceDays)).toBeNull();
    expect(has(await AttendancePage({ searchParams: { show: 'absent', ...days } }), AttendanceDays)).toBeNull();
    // Notices waiting come first on Communication; events, draft answers and tickets each open on their one filter.
    const notices: any = await CommunicationPage({ searchParams: { show: 'notices' } });
    expect(([] as any[]).concat(notices.props.children.props.children).filter(Boolean)[0].type).toBe(NoticesShown);
    for (const show of [undefined, 'all', 'NOTICES']) expect(has(await CommunicationPage({ searchParams: { show } }), NoticesShown), String(show)).toBeNull();
    expect(has(await EventsPage({ searchParams: { show: 'coming' } }), EventsShown)).toBeTruthy();
    for (const show of [undefined, 'all', 'past']) expect(has(await EventsPage({ searchParams: { show } }), EventsShown), String(show)).toBeNull();
    expect(has(await EventsPage({}), EventsShown)).toBeNull();
    expect(has(await ParentAiPage({ searchParams: { show: 'drafts' } }), ParentAiShown)).toBeTruthy();
    for (const show of [undefined, 'sent', 'draft']) expect(has(await ParentAiPage({ searchParams: { show } }), ParentAiShown), String(show)).toBeNull();
    for (const show of ['open', 'waiting']) expect(has(TicketsPage({ searchParams: { show } }), TicketsShown)?.props, show).toEqual({ show });
    for (const show of [undefined, 'closed', 'resolved', 'OPEN']) expect(has(TicketsPage({ searchParams: { show } }), TicketsShown), String(show)).toBeNull();
    expect(has(TicketsPage({}), TicketsShown)).toBeNull();
    // Complaints open on their two lists, meetings and leave on theirs; anything else is the screen as before.
    for (const show of ['open', 'overdue']) expect(has(await ComplaintsPage({ searchParams: { show } }), ComplaintsShown)?.props, show).toEqual({ show });
    for (const show of [undefined, 'closed', 'all', 'OPEN']) expect(has(await ComplaintsPage({ searchParams: { show } }), ComplaintsShown), String(show)).toBeNull();
    expect(has(await ComplaintsPage({}), ComplaintsShown)).toBeNull();
    expect(has(await PtmPage({ searchParams: { show: 'coming' } }), PtmShown)).toBeTruthy();
    for (const show of [undefined, 'past', 'cancelled', 'COMING']) expect(has(await PtmPage({ searchParams: { show } }), PtmShown), String(show)).toBeNull();
    expect(has(await PtmPage({}), PtmShown)).toBeNull();
    for (const show of ['leave-waiting', 'on-leave-today']) expect(has(await StaffPage({ searchParams: { show } }), StaffLeaveShown)?.props, show).toEqual({ show });
    for (const show of [undefined, 'waiting', 'on-leave', 'everyone']) expect(has(await StaffPage({ searchParams: { show } }), StaffLeaveShown), String(show)).toBeNull();
    expect(has(await StaffPage({}), StaffLeaveShown)).toBeNull();
    // The list comes first on its screen, above the screen's own content.
    const staff: any = await StaffPage({ searchParams: { show: 'leave-waiting' } });
    expect(([] as any[]).concat(staff.props.children).filter(Boolean).slice(0, 2).map((el: any) => el.type)).toEqual([StaffLeaveShown, StaffLeaveOffice]);
    // The screen below is told when a list is drawn above it, so that a change made below (a complaint closed, a
    // leave request decided, a meeting cancelled) has the list above read again; with no list above, it is not.
    expect([has(await ComplaintsPage({ searchParams: { show: 'overdue' } }), ComplaintsView)?.props, has(await ComplaintsPage({ searchParams: { show: 'closed' } }), ComplaintsView)?.props, has(await ComplaintsPage({}), ComplaintsView)?.props]).toEqual([{ shownAbove: true }, { shownAbove: false }, { shownAbove: false }]);
    expect([has(await PtmPage({ searchParams: { show: 'coming' } }), PtmView)?.props, has(await PtmPage({ searchParams: { show: 'past' } }), PtmView)?.props, has(await PtmPage({}), PtmView)?.props]).toEqual([{ shownAbove: true }, { shownAbove: false }, { shownAbove: false }]);
    expect([has(staff, StaffLeaveOffice)?.props, has(await StaffPage({ searchParams: { show: 'on-leave-today' } }), StaffLeaveOffice)?.props, has(await StaffPage({ searchParams: { show: 'everyone' } }), StaffLeaveOffice)?.props, has(await StaffPage({}), StaffLeaveOffice)?.props]).toEqual([{ shownAbove: true }, { shownAbove: true }, { shownAbove: false }, { shownAbove: false }]);
    // Proxy Auto is handed its one filter, and draws the filtered periods itself (it has no list above it).
    expect([has(await ProxyPage({ searchParams: { show: 'needs-cover' } }), ProxyView)?.props, has(await ProxyPage({ searchParams: { show: 'covered' } }), ProxyView)?.props, has(await ProxyPage({}), ProxyView)?.props]).toEqual([{ show: 'needs-cover' }, {}, {}]);
    // Staff switched off for the school: leave is left out of the screen, and its list with it.
    await db.pg.query(`update school_module_entitlements set enabled = false where school_id = $1 and module_id = 'staff'`, [A]);
    try {
      const off: any = await StaffPage({ searchParams: { show: 'leave-waiting' } });
      expect([has(off, StaffLeaveShown), has(off, StaffLeaveOffice)]).toEqual([null, null]);
    } finally {
      await db.pg.query(`update school_module_entitlements set enabled = true where school_id = $1 and module_id = 'staff'`, [A]);
    }
    // Nobody but the office opens Staff at all: a teacher is shown the "not for your role" page, with no list.
    signIn(tara);
    const notHers: any = await StaffPage({ searchParams: { show: 'on-leave-today' } });
    expect([notHers.type, has(notHers, StaffLeaveShown)]).toEqual([ModuleComingPage, null]);
    signIn(principal);
    // Students: a status in the address; the students waiting for consent are the Admissions screen's.
    expect(((await StudentsPage({ searchParams: { status: 'active' } })) as any).props.statusFilter).toBe('active');
    for (const status of [undefined, 'pending_consent', 'everyone']) expect(((await StudentsPage({ searchParams: { status } })) as any).props.statusFilter, String(status)).toBeUndefined();
  });
});
