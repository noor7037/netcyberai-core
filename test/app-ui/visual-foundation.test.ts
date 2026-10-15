import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AreaTrend, CalendarHeat, DonutChart, GaugeChart, greetingFor, HeroBand, indiaHour, KpiTile, ModuleIcon, RingProgress, TOKEN_TONES } from '@/components/app-ui';
import { controlShellGroups } from '@/components/app-shell/shell-nav';
import { ControlDashboardView } from '@/components/dashboards/ControlDashboardView';
import { indiaToday, lastDays, plural, trendFromSeries } from '@/components/dashboards/dashboard-parts';
import { FactChart } from '@/components/dashboards/FactChart';
import { OfficeDashboardView } from '@/components/dashboards/OfficeDashboardView';
import { controlDashboardFixture, heatDaysFixture, officeDashboardEmptyFixture, officeDashboardFixture } from '@/demo-fixture/visual-foundation';
import { MODULE_GROUPS, MODULE_REGISTRY } from '@/lib/contracts/modules';
import { chartRowLabel, chartTitle, dashboardModel } from '@/lib/insights/dashboard';
import { chartOther, chartSeries, colors, sequentialRoyal, seriesColor } from '@/lib/design-tokens';
import { controlNav } from '@/lib/nav/nav-items';

// The visual foundation (docs/19 §3, C131): the validated palette, one icon
// per module, the KPI tile, the new chart forms, the hero band and the two
// live dashboards drawn from them.

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const NOW = new Date('2026-09-25T04:00:00Z');

describe('palette', () => {
  it('is the validated six-colour order, fixed and never cycled', () => {
    expect(chartSeries).toEqual(['#1D4ED8', '#FF7A1A', '#14B8A6', '#8B3DFF', '#016898', '#4400F0']);
    expect(chartSeries).toEqual([colors.royal, colors.tangerine, colors.turquoise, colors.grape, colors.azure, colors.violet]);
    expect(seriesColor(0)).toBe(colors.royal);
    expect(seriesColor(6)).toBe(chartOther); // a 7th series is "Other", not the first colour again
    expect(seriesColor(13)).toBe(chartOther);
    expect([...sequentialRoyal.steps]).toEqual([...sequentialRoyal.steps].sort((a, b) => a - b)); // light to dark
  });
});

describe('module icons', () => {
  it('every module has its own icon, and every group a tile colour', () => {
    const icons = MODULE_REGISTRY.map((m) => m.icon);
    expect(new Set(icons).size).toBe(MODULE_REGISTRY.length);
    for (const m of MODULE_REGISTRY) expect(render(h(ModuleIcon, { name: m.icon, tone: 'royal' })), m.id).toContain('<path d="M');
    expect(MODULE_GROUPS.find((g) => g.id === 'help')!.tone[0]).toBe('gold');
    for (const g of MODULE_GROUPS) expect(TOKEN_TONES[g.tone[0]].soft).toBeTruthy();
  });

  it('a tile is the tone’s soft surface, or solid when selected, and is decorative', () => {
    const soft = render(h(ModuleIcon, { name: 'fees', tone: 'tangerine' }));
    expect(soft).toContain(TOKEN_TONES.tangerine.soft);
    expect(soft).toContain('aria-hidden="true"');
    expect(render(h(ModuleIcon, { name: 'fees', tone: 'tangerine', variant: 'solid' }))).toContain(TOKEN_TONES.tangerine.solid);
  });

  it('every Control menu item has an icon and a colour', () => {
    const [group] = controlShellGroups(controlNav);
    expect(group.items).toHaveLength(controlNav.length);
    for (const i of group.items) expect(i.icon && i.tone, i.href).toBeTruthy();
    expect(controlShellGroups(controlNav, (x) => (x === '/control' ? '/here' : x))[0].items[0].href).toBe('/here');
  });
});

describe('KPI tile v3 (C230-D)', () => {
  const tile = { kind: 'kpi' as const, id: 'a', label: 'Attendance today', value: 94.5, unit: 'percent' as const, drillHref: '/app/attendance', trend: { direction: 'up' as const, delta: 1.5, unit: 'percent' as const, comparedTo: 'the day before', good: 'up' as const } };

  it('is a white, linked card with a bar in its tone, an icon chip, a trend in words and a sparkline; the value stays slate', () => {
    const html = render(h(KpiTile, { tile, tone: 'royal', icon: 'attendance', spark: [90, 92, null, 94.5] }));
    expect(html).toMatch(/^<a [^>]*href="\/app\/attendance"/);
    expect(html).toContain('bg-white');
    expect(html).toContain(`top-0 h-1 ${TOKEN_TONES.royal.bar}`); // the bar in the tile's tone
    expect(html).toContain(TOKEN_TONES.royal.solid); // the icon chip
    expect(html).toContain('text-3xl font-extrabold tabular-nums text-slate');
    expect(html).toContain('1.5 points vs the day before');
    expect(html).toContain('up 1.5 points since the day before'); // for screen readers
    expect(html).toContain('<polyline');
  });

  it('says "No data yet" for null, with no trend and no sparkline; one point draws no line', () => {
    const none = render(h(KpiTile, { tile: { ...tile, value: null }, spark: [1, 2, 3] }));
    expect(none).toContain('No data yet');
    expect(none).not.toContain('<polyline');
    expect(none).not.toContain('points vs');
    expect(render(h(KpiTile, { tile, spark: [null, 94.5] }))).not.toContain('<polyline');
  });
});

describe('chart forms', () => {
  it('ring progress says the number in words, and its table view has the same numbers', () => {
    const chart = render(h(RingProgress, { title: 'Marked today', done: 42, total: 60, noun: 'classes', doneWord: 'marked', emptyHint: 'x' }));
    expect(chart).toContain('42 of 60 classes marked');
    expect(chart).toContain('70%');
    expect(chart).toContain('aria-label="Marked today: 42 of 60 classes marked (70%)"');
    const table = render(h(RingProgress, { title: 'Marked today', done: 42, total: 60, noun: 'classes', doneWord: 'marked', emptyHint: 'x', initialView: 'table' }));
    expect(table).toContain('<table');
    expect(table).toMatch(/Left<\/th><td[^>]*>18</);
    expect(table).not.toContain('<svg');
  });

  it('every form has an empty state that says what to do, with no drawing and no switch', () => {
    const empties = [
      h(RingProgress, { title: 'T', done: 0, total: 0, noun: 'topics', emptyHint: 'Add the syllabus map.' }),
      h(DonutChart, { title: 'T', slices: [{ id: 'a', label: 'A', value: 0 }], unit: 'count', emptyHint: 'Add the syllabus map.' }),
      h(GaugeChart, { title: 'T', score: null, emptyHint: 'Add the syllabus map.' }),
      h(AreaTrend, { title: 'T', seriesLabel: 'S', points: [{ t: '2026-09-01', v: null }], unit: 'count', emptyHint: 'Add the syllabus map.' }),
      h(CalendarHeat, { title: 'T', days: [{ date: '2026-09-01', value: null }], unit: 'percent', emptyHint: 'Add the syllabus map.' }),
    ];
    for (const e of empties) {
      const html = render(e);
      expect(html).toContain('No data yet');
      expect(html).toContain('Add the syllabus map.');
      expect(html).not.toContain('<svg');
      expect(html).not.toContain('aria-pressed');
    }
  });

  it('donut: a legend with every part in slate text, at most five parts, the rest folded into "Other"', () => {
    const slices = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((l, i) => ({ id: l, label: l, value: 10 + i }));
    const html = render(h(DonutChart, { title: 'Parts', slices, unit: 'count', emptyHint: 'x' }));
    expect(html).toContain('aria-label="Legend"');
    expect((html.match(/<li class="flex items-center gap-2">/g) ?? []).length).toBe(5);
    expect(html).toContain('Other');
    expect(html).toContain(chartOther);
    expect(html).not.toContain(colors.violet); // the 6th colour is not reached: 4 parts + Other
    expect(html).not.toMatch(/fill="#(1D4ED8|FF7A1A|14B8A6)"[^>]*>[^<]*\d/i); // no text in a series colour
    // The table view keeps all seven.
    expect((render(h(DonutChart, { title: 'Parts', slices, unit: 'count', emptyHint: 'x', initialView: 'table' })).match(/<tr class="border-b border-slate\/5">/g) ?? []).length).toBe(7);
  });

  it('gauge: the band is said in words beside the score', () => {
    expect(render(h(GaugeChart, { title: 'Health', score: 68, emptyHint: 'x' }))).toContain('aria-label="Health: 68 out of 100, Watch"');
    expect(render(h(GaugeChart, { title: 'Health', score: 20, emptyHint: 'x' }))).toContain('>Act<');
    expect(render(h(GaugeChart, { title: 'Health', score: 140, emptyHint: 'x' }))).toContain('aria-label="Health: 100 out of 100, Good"');
    expect(render(h(GaugeChart, { title: 'Health', score: 68, emptyHint: 'x' }))).toContain('Act 0–50 · Watch 51–75 · Good 76–100');
  });

  it('area trend: a day without data is a gap in the line, never a line drawn across it', () => {
    const points = [{ t: '2026-09-01', v: 90 }, { t: '2026-09-02', v: 91 }, { t: '2026-09-03', v: null }, { t: '2026-09-04', v: 94.5 }];
    const area = render(h(AreaTrend, { title: 'Attendance', seriesLabel: 'Present', unit: 'percent', emptyHint: 'x', points }));
    expect(area).toContain('1 day has no data and is left as a gap.');
    expect(area).toContain('94.5%'); // the end label
    expect((area.match(/data-run="line"/g) ?? []).length).toBe(1); // 1 and 2 Sept joined; 4 Sept stands alone
    expect(area).toMatch(/data-run="line"[^>]*|d="M8\.0 [0-9.]+L96\.0 [0-9.]+"/);
    // The fourth day sits at the fourth place (x = 272), not next to the second.
    expect(area).toContain('cx="272"');
    // Two separate stretches are two lines; a value over 100% stays inside the drawing.
    const two = render(h(AreaTrend, { title: 'T', seriesLabel: 'S', unit: 'percent', emptyHint: 'x', points: [...points, { t: '2026-09-05', v: 140 }] }));
    expect((two.match(/data-run="line"/g) ?? []).length).toBe(2);
    expect(two).not.toMatch(/cy="-/);
    // One day only: a dot and its value, no line.
    const one = render(h(AreaTrend, { title: 'T', seriesLabel: 'S', unit: 'count', emptyHint: 'x', points: [{ t: '2026-09-01', v: 5 }] }));
    expect(one).not.toContain('data-run="line"');
    expect(one).toContain('<circle');
  });

  it('heat grid: one hue; shades follow the range shown; a day without data is never a colour', () => {
    const heat = render(h(CalendarHeat, { title: 'By day', days: heatDaysFixture, unit: 'percent', emptyHint: 'x' }));
    const fills = new Set([...heat.matchAll(/<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase()));
    expect([...fills].sort()).toEqual(['#1D4ED8', '#FFFFFF']);
    expect(heat).toContain('no data');
    expect(heat).toContain('No data');
    // A month between 76% and 100% still shows its pattern: all four shades are used.
    const narrow = render(h(CalendarHeat, { title: 'By day', unit: 'percent', emptyHint: 'x', days: [76, 80, 85, 90, 95, 100].map((value, i) => ({ date: `2026-09-0${i + 1}`, value })) }));
    expect(new Set([...narrow.matchAll(/fill-opacity="([0-9.]+)"/g)].map((m) => m[1])).size).toBe(4);
    expect(narrow).toContain('76%');
    // Every day the same, or a zero maximum: one shade, never NaN.
    const flat = render(h(CalendarHeat, { title: 'By day', unit: 'count', emptyHint: 'x', max: 0, days: [{ date: '2026-09-01', value: 0 }, { date: '2026-09-02', value: 0 }] }));
    expect(flat).not.toContain('NaN');
    // Weeks stay in order across a year end, whatever order the days arrive in.
    const yearEnd = render(h(CalendarHeat, { title: 'By day', unit: 'count', emptyHint: 'x', days: [{ date: '2027-01-04', value: 2 }, { date: '2026-12-28', value: 1 }] }));
    expect([...yearEnd.matchAll(/<rect x="(\d+)"/g)].map((m) => Number(m[1]))).toEqual([26, 42]);
  });

  it('a very small part of a donut is still drawn, and the gauge’s number and band always agree', () => {
    const donut = render(h(DonutChart, { title: 'Parts', unit: 'count', emptyHint: 'x', slices: [{ id: 'a', label: 'A', value: 990 }, { id: 'b', label: 'B', value: 10 }] }));
    const arcs = [...donut.matchAll(/<path d="M([0-9.]+) ([0-9.]+)A44 44 0 [01] 1 ([0-9.]+) ([0-9.]+)"/g)];
    expect(arcs).toHaveLength(2);
    for (const [, x1, y1, x2, y2] of arcs) expect(Math.hypot(Number(x2) - Number(x1), Number(y2) - Number(y1))).toBeGreaterThan(1);
    const g = render(h(GaugeChart, { title: 'Health', score: 50.4, emptyHint: 'x' }));
    expect(g).toContain('aria-label="Health: 50 out of 100, Act"');
    expect(render(h(GaugeChart, { title: 'Health', score: 50.6, emptyHint: 'x' }))).toContain('aria-label="Health: 51 out of 100, Watch"');
    expect(render(h(GaugeChart, { title: 'Health', score: Number.NaN, emptyHint: 'x' }))).toContain('No data yet');
  });
});

describe('hero band', () => {
  it('says how many things need you, as chips that go to the work; or that nothing does', () => {
    const html = render(h(HeroBand, { variant: 'cinematic', greeting: 'Good morning', date: 'Friday', title: 'A School', chips: [{ label: 'Mark attendance', href: '/app/attendance', count: 412 }, { label: 'Open fees', href: '/app/fees', count: 17 }] }));
    expect(html).toContain('2 things need you today');
    expect(html).toContain('href="/app/attendance"');
    expect(html).toContain('nca-mesh-dark bg-midnight text-white');
    expect(render(h(HeroBand, { greeting: 'Good morning', date: 'Friday', title: 'A School', chips: [{ label: 'x', href: '/x' }] }))).toContain('1 thing needs you today');
    const clear = render(h(HeroBand, { greeting: 'Good morning', date: 'Friday', title: 'A School', chips: [] }));
    expect(clear).toContain('Nothing needs you right now.');
    expect(clear).not.toContain('<ul');
  });

  it('greets by the hour in India', () => {
    expect([greetingFor(6), greetingFor(13), greetingFor(19)]).toEqual(['Good morning', 'Good afternoon', 'Good evening']);
    expect(indiaHour(new Date('2026-09-25T04:00:00Z'))).toBe(9); // 09:30 IST
    expect(indiaHour(new Date('2026-09-25T20:00:00Z'))).toBe(1);
  });
});

describe('the live dashboards', () => {
  it('office: hero, the tiles in their groups, the attention list with its reasons, charts with a table and quick actions, from the given facts only', () => {
    const html = render(h(OfficeDashboardView, { data: officeDashboardFixture, now: NOW }));
    const model = dashboardModel(officeDashboardFixture.facts);
    expect(html).toContain('Illustrative Public School');
    expect(html).toContain('4 things need you today'); // classes not marked, overdue fees, consent, held messages
    for (const label of ['Classes marked today', 'Active students', 'Fees overdue', 'Homework checked', 'WhatsApp messages']) expect(html).toContain(label);
    for (const group of ['Today', 'Money', 'Learning', 'Parents', 'Running the school']) expect(html).toContain(`>${group}</h2>`);
    expect(html).toContain('14 of 16'); // classes marked today
    expect(html).toContain('₹21,500');
    expect(html).toContain('2 classes have no attendance saved today');
    expect(html).toContain('17 fee entries are overdue');
    // "Why this?" on every tile, every attention item and every chart: an info button whose words stay for screen readers (C230-D).
    expect((html.match(/class="sr-only">Why this\?</g) ?? []).length).toBe(model.groups.reduce((n, g) => n + g.tiles.length, 0) + model.attention.length + model.charts.length);
    expect([model.groups.reduce((n, g) => n + g.tiles.length, 0), model.attention.length, model.charts.length]).toEqual([18, 4, 5]);
    expect(html).toContain('Attendance today: 400 of 412 students marked');
    // The fees chart is two facts side by side (not yet due, overdue): its title adds nothing up.
    expect(html).toContain('>Fees still to come in</');
    expect(html).toContain('₹52,000');
    expect(html).not.toContain('₹73,500');
    expect(html).toContain('1 day has no mark saved and is left as a gap.');
    expect(html).toContain('href="/app/help/ticket/new"');
    expect(html).toContain('href="/api/app/dashboard/export?range=7d"');
  });

  it('office: one of something reads as one; a fact that was not given is not drawn, and is never a zero', () => {
    const one = officeDashboardFixture.facts.map((f) => (f.attention ? { ...f, value: 1, count: f.count === undefined ? undefined : 1 } : f));
    const html = render(h(OfficeDashboardView, { data: { ...officeDashboardFixture, facts: one }, now: NOW }));
    for (const text of ['1 fee entry is overdue', '1 student is waiting for consent', '1 message was held back', '1 class has no attendance saved today']) expect(html).toContain(text);
    const withoutFees = render(h(OfficeDashboardView, { data: { ...officeDashboardFixture, facts: officeDashboardFixture.facts.filter((f) => f.moduleId !== 'fees') }, now: NOW }));
    expect(withoutFees).not.toContain('Fees');
    expect(withoutFees).not.toContain('₹');
    expect(withoutFees).not.toContain('>Money</h2>');
    expect(withoutFees).toContain('3 things need you today');
  });

  it('office, the table view of a chart: every row is said in words and links to its rows', () => {
    const marked = { ...officeDashboardFixture.facts.find((f) => f.id === 'attendance.students_marked')!, parts: [{ key: 'marked', value: 400 }, { key: 'not_marked', value: 12, href: '/app/attendance?show=not-marked' }] };
    const absent = { ...officeDashboardFixture.facts.find((f) => f.id === 'attendance.absent')!, href: '/app/attendance?show=absent' };
    const model = dashboardModel(officeDashboardFixture.facts.map((f) => (f.id === marked.id ? marked : f.id === absent.id ? absent : f)));
    const chart = model.charts.find((c) => c.id === 'attendance-today')!;
    expect(chart.rows.map((r) => [r.key, r.value])).toEqual([['present', 371], ['absent', 22], ['late', 5], ['leave', 2], ['not_marked', 12]]);
    const rows = chart.rows.map((r) => ({ label: chartRowLabel('en', chart, r), value: r.value, text: String(r.value), href: r.href }));
    const words = { showAs: 'Show as', chart: 'Chart', table: 'Table', what: 'What', value: 'Number', none: 'No data yet', open: 'Open the rows' };
    const table = render(h(FactChart, { id: chart.id, title: chartTitle('en', chart), kind: chart.kind, tone: chart.tone, rows, words, href: chart.href, initialView: 'table' }));
    expect(table).toContain('<caption class="sr-only">Attendance today: 400 of 412 students marked</caption>');
    expect(table).toContain('href="/app/attendance?show=absent"');
    expect(table).toContain('href="/app/attendance?show=not-marked"');
    expect(table).toContain('Not marked yet');
    expect(table).toContain('aria-pressed="true"');
  });

  it('office, nothing set up yet: it says what is missing, and no number is made up', () => {
    const html = render(h(OfficeDashboardView, { data: officeDashboardEmptyFixture, now: NOW }));
    expect(html).toContain('Nothing needs you right now.');
    expect(html).toContain('Nothing needs attention right now.');
    expect((html.match(/Not set up yet/g) ?? []).length).toBe(5); // classes, students, two fee tiles, the budget
    expect(html).toContain('No fee has been raised yet.');
    expect(html).toContain('No monthly budget is set yet');
    expect(html).toContain('Nothing recorded in these days');
    expect(html).not.toMatch(/\d%/);
    expect(html).not.toContain('data-chart-kind="line"');
  });

  it('office in Hindi: the same screen, every word from the message files', () => {
    const html = render(h(OfficeDashboardView, { data: officeDashboardFixture, lang: 'hi', now: NOW }));
    expect(html).toContain('आज 4 काम आपका इंतज़ार कर रहे हैं');
    expect(html).toContain('इन पर ध्यान दें');
    expect(html).toContain('16 में से 14');
    expect(html).toContain('17 फ़ीस प्रविष्टियों की तारीख़ निकल चुकी है');
    for (const english of ['Why this?', 'Needs your attention', 'things need you today', 'Not set up yet', 'Classes marked today', 'Quick actions', 'Chart', 'Download']) expect(html, english).not.toContain(english);
  });

  it('control: tickets waiting come first; totals count live schools and say that test schools are left out', () => {
    const html = render(h(ControlDashboardView, { data: controlDashboardFixture, now: NOW, schoolsTable: null }));
    expect(html).toContain('NetCyberAI Control');
    expect(html).toContain('2 things need you today');
    expect(html).toContain('2</span> support tickets are waiting to be picked up');
    expect(html).toContain('Live schools');
    expect(html).toContain('The totals count live schools only. 1 test school is listed below and not counted.');
    expect(html).toContain('560 of 590 students are active with consent recorded');
    expect(html).toContain('Fees marked paid');
  });

  it('control, no live school yet: every total says "No data yet"; no number is borrowed from a test school', () => {
    const none = { ...controlDashboardFixture, schools: controlDashboardFixture.schools.map((s) => ({ ...s, isFixture: true })), liveSchools: 0, activeStudents: 0, totalStudents: 0, totalStaff: 0, totalComms: 0, blocked: 0, deliveryRate: null, consentActive: 0, consentPending: 0, feesCollectedMinor: 0, feesDueMinor: 0, ticketsOpen: 0, ticketsInProgress: 0, ticketsFromTestSchools: 3, dailySends: [] };
    const html = render(h(ControlDashboardView, { data: none, now: NOW, schoolsTable: null }));
    expect(html).toContain('There is no live school yet. 2 test schools are listed below; test data is never counted in these totals.');
    expect((html.match(/No data yet/g) ?? []).length).toBe(5); // students, staff, fees tiles and the two charts
    // Test schools' tickets are not counted, but the dashboard does not claim the queue is empty.
    expect(html).toContain('No ticket from a live school is waiting for you.');
    expect(html).toContain('3 tickets from test schools are');
    expect(html).toContain('href="/control/tickets"');
    expect(html).not.toContain('messages logged in the last 30 days');
    expect(html).not.toContain('₹');
  });

  it('a trend is computed from the last two real values, or not shown', () => {
    expect(trendFromSeries([90, null, 94.5], 'percent', 'the day before', 'up')).toEqual({ direction: 'up', delta: 4.5, unit: 'percent', comparedTo: 'the day before', good: 'up' });
    expect(trendFromSeries([94, 94], 'percent', 'x', 'up')!.direction).toBe('flat');
    expect(trendFromSeries([94], 'percent', 'x', 'up')).toBeUndefined();
    expect(trendFromSeries([], 'percent', 'x', 'up')).toBeUndefined();
  });

  it('the last days are India’s calendar days, with a gap or a zero where the database had no row', () => {
    expect(indiaToday(new Date('2026-09-24T19:00:00Z'))).toBe('2026-09-25'); // 00:30 in India
    expect(lastDays([{ date: '2026-09-24', value: 7 }], 3, null, NOW)).toEqual([{ t: '2026-09-23', v: null }, { t: '2026-09-24', v: 7 }, { t: '2026-09-25', v: null }]);
    expect(lastDays([{ date: '2026-09-24', value: 7 }], 3, 0, NOW).map((d) => d.v)).toEqual([0, 7, 0]);
    expect(lastDays([{ date: '2026-08-01', value: 9 }], 2, 0, NOW).map((d) => d.v)).toEqual([0, 0]); // outside the window
    expect([plural(1, 'entry', 'entries'), plural(2, 'entry', 'entries')]).toEqual(['entry', 'entries']);
  });
});
