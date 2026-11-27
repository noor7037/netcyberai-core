import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FactChart, type FactChartKind, type FactChartRow } from '@/components/dashboards/FactChart';
import { OfficeDashboardView } from '@/components/dashboards/OfficeDashboardView';
import { describeFact } from '@/lib/insights/load';
import { classPresentParts, collectedDaily, coverageByClass, studentsByClassParts } from '@/lib/insights/facts';
import { DASHBOARD_CHARTS, chartNote, chartRowLabel, chartTitle, dashboardModel } from '@/lib/insights/dashboard';
import { isMessageKey, t } from '@/lib/i18n';
import type { FactId, FactResult } from '@/lib/insights/types';

// The dashboard's charts (founder, C235): the rows of the new facts as shaped from what the database returns, the
// order and inclusion of the charts, and every chart kind as drawn. Every name and number is made up.

const RANGE = { from: '2026-11-20', to: '2026-11-26' };
const DAYS = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'];
const fact = (id: FactId, more: Partial<FactResult> = {}): FactResult => ({ ...describeFact(id), state: 'ok', value: 1, countedAt: '2026-11-26T05:00:00.000Z', href: '/app/x?show=y', attention: false, range: RANGE, ...more });

describe('the rows of the new facts', () => {
  it('attendance by class: each marked class by the present rate’s rule, in the order given, opening its register; an unmarked class is not drawn', () => {
    const day = (class_id: string, class_name: string, m: [number, number, number, number]) => ({ class_id, class_name, students: 10, marked: m.reduce((a, b) => a + b, 0), present: m[0], absent: m[1], late: m[2], leave: m[3] });
    const parts = classPresentParts([day('c1', '1-A', [6, 2, 1, 1]), day('c2', '1-B', [0, 0, 0, 0]), day('c3', '2-A', [1, 3, 0, 0])], (id) => `/app/attendance?class=${id}`);
    expect(parts).toEqual([
      { key: '1-A', value: 70, unit: 'percent', href: '/app/attendance?class=c1' },
      { key: '2-A', value: 25, unit: 'percent', href: '/app/attendance?class=c3' },
    ]);
  });

  it('students by class: the class’s name with its section, class order kept, the students in no class last', () => {
    expect(studentsByClassParts([{ class_id: 'c1', name: '5', section: 'A', active: 30 }, { class_id: 'c2', name: '5-B', section: 'B', active: 28 }, { class_id: 'c3', name: '6', section: null, active: 0 }, { class_id: null, name: null, section: null, active: 2 }])).toEqual([
      { key: '5-A', value: 30 },
      { key: '5-B', value: 28 },
      { key: '', value: 2 },
    ]);
    expect(studentsByClassParts([])).toEqual([]);
  });

  it('fees received each day: every day of the range, the ways of paying added, a day with nothing an honest zero', () => {
    expect(collectedDaily(DAYS.slice(0, 3), [{ day: '2026-11-20', minor: 5000 }, { day: '2026-11-20', minor: 2500 }, { day: '2026-11-22', minor: 100 }])).toEqual([
      { date: '2026-11-20', value: 7500 },
      { date: '2026-11-21', value: 0 },
      { date: '2026-11-22', value: 100 },
    ]);
  });

  it('syllabus by class: all subjects of a class together, as a whole percent, in the table’s order', () => {
    const row = (class_id: string, class_name: string, class_section: string | null, planned: number, taught: number) => ({ class_id, class_name, class_section, planned, taught });
    expect(coverageByClass([row('c1', '5', 'A', 10, 3), row('c1', '5', 'A', 10, 4), row('c2', '6-B', 'B', 3, 2), row('c3', '7', null, 0, 0)])).toEqual([
      { key: '5-A', value: 35, unit: 'percent' },
      { key: '6-B', value: 67, unit: 'percent' },
    ]);
  });
});

// Every fact the charts are drawn from, loaded.
const ALL: FactResult[] = [
  fact('attendance.students_marked', { value: 8, total: 10, parts: [{ key: 'marked', value: 8 }, { key: 'not_marked', value: 2, href: '/app/attendance?show=not-marked' }] }),
  fact('attendance.present', { value: 5 }),
  fact('attendance.absent', { value: 1 }),
  fact('attendance.late', { value: 1 }),
  fact('attendance.leave', { value: 1 }),
  fact('attendance.by_class', { value: 2, total: 3, parts: [{ key: '1-A', value: 70, unit: 'percent', href: '/app/attendance?class=c1' }, { key: '2-A', value: 25, unit: 'percent' }] }),
  fact('attendance.present_rate', { value: 80, series: DAYS.map((date, i) => ({ date, value: i === 2 ? null : 80 })) }),
  fact('fees.collected_daily', { unit: 'inr_paise', value: 7600, count: 3, series: DAYS.map((date, i) => ({ date, value: i === 0 ? 7500 : i === 2 ? 100 : 0 })) }),
  fact('fees.owed', { value: 1000 }),
  fact('fees.overdue', { value: 500 }),
  fact('students.by_class', { value: 60, parts: [{ key: '5-A', value: 30 }, { key: '5-B', value: 28 }, { key: '', value: 2 }] }),
  fact('syllabus.by_class', { value: 40, total: 3, parts: [{ key: '5-A', value: 35 }, { key: '6-B', value: 67 }] }),
  fact('admissions.funnel', { value: 25, total: 8, parts: [{ key: 'enquiries', value: 8 }, { key: 'visits', value: 5 }, { key: 'forms', value: 3 }, { key: 'admitted', value: 2 }] }),
  fact('messages.total', { value: 3, parts: [{ key: 'sent', value: 2 }, { key: 'failed', value: 1 }] }),
  fact('homework.checked', { value: 1, total: 2, parts: [{ key: 'checked', value: 1 }, { key: 'unchecked', value: 1 }] }),
];

describe('which charts the dashboard draws, and in what order', () => {
  it('all of them, in the order the principal reads them, each with a title and a plain line in English and Hindi', () => {
    const model = dashboardModel([...ALL].reverse());
    expect(model.charts.map((c) => c.id)).toEqual([...DASHBOARD_CHARTS]);
    expect(model.charts.map((c) => c.kind)).toEqual(['donut', 'hbars', 'line', 'area', 'bars', 'hbars', 'progress', 'funnel', 'bars', 'ring']);
    for (const c of model.charts) {
      expect(isMessageKey(`chart.${c.id}.note`), c.id).toBe(true);
      expect(chartNote('hi', c), c.id).toMatch(/[ऀ-ॿ]/);
      expect(chartTitle('hi', c), c.id).not.toMatch(/chart\./);
    }
    const by = Object.fromEntries(model.charts.map((c) => [c.id, c]));
    expect(chartTitle('en', by['attendance-by-class'])).toBe('In school today, class by class: 2 of 3 classes marked');
    expect(chartTitle('en', by['admissions-funnel'])).toBe('Admissions this session: 25% of enquiries admitted');
    expect(chartTitle('en', by['syllabus-by-class'])).toBe('Syllabus taught, class by class: 40% overall');
    expect(chartTitle('en', by['fees-daily'])).toBe('Fees received over these days: ₹76');
    expect(by['students-by-class'].rows.map((r) => chartRowLabel('en', by['students-by-class'], r))).toEqual(['5-A', '5-B', 'Not in a class yet']);
    expect(by['admissions-funnel'].rows.map((r) => chartRowLabel('hi', by['admissions-funnel'], r))).toEqual(['पूछताछ', 'विज़िट हुई', 'फ़ॉर्म लिया', 'दाख़िला हुआ']);
    // The trend runs across both columns on a laptop; the others take one.
    expect(model.charts.filter((c) => c.wide).map((c) => c.id)).toEqual(['present-rate']);
  });

  it('a fact that was not loaded, is not set up or has no rows draws no chart; one day of fees is the tile, not a chart', () => {
    const without = (ids: FactId[]) => dashboardModel(ALL.filter((f) => !ids.includes(f.id))).charts.map((c) => c.id);
    expect(without(['attendance.by_class', 'students.by_class'])).toEqual(DASHBOARD_CHARTS.filter((id) => id !== 'attendance-by-class' && id !== 'students-by-class'));
    const notSetUp = ALL.map((f) => (f.id === 'syllabus.by_class' || f.id === 'admissions.funnel' ? { ...f, state: 'not_set_up' as const, value: null, parts: undefined } : f));
    expect(dashboardModel(notSetUp).charts.map((c) => c.id)).not.toEqual(expect.arrayContaining(['syllabus-by-class']));
    expect(dashboardModel(notSetUp).charts.some((c) => c.id === 'admissions-funnel')).toBe(false);
    const oneDay = ALL.map((f) => (f.id === 'fees.collected_daily' ? { ...f, series: [{ date: DAYS[6], value: 0 }] } : f));
    expect(dashboardModel(oneDay).charts.some((c) => c.id === 'fees-daily')).toBe(false);
    const noClasses = ALL.map((f) => (f.id === 'attendance.by_class' ? { ...f, parts: [] } : f));
    expect(dashboardModel(noClasses).charts.some((c) => c.id === 'attendance-by-class')).toBe(false);
  });

  it('on the page: one column on a phone, two on a laptop, the trend across both; every chart has its words', () => {
    const html = renderToStaticMarkup(h(OfficeDashboardView, { data: { schoolName: 'Made-up School', rangeId: '7d', range: RANGE, facts: ALL, failed: 0 }, now: new Date('2026-11-26T05:00:00Z') }));
    expect(html).toMatch(/data-charts="[^"]*" class="grid grid-cols-1 gap-4 lg:grid-cols-2"/);
    expect((html.match(/class="min-w-0 lg:col-span-2"><section/g) ?? []).length).toBe(1);
    for (const id of DASHBOARD_CHARTS) expect(html, id).toContain(`data-chart="${id}"`);
    expect(html).toContain(t('en', 'chart.attendance-by-class.note'));
    // The funnel says how many did not go on, from the two steps' own counts.
    expect(html).toContain('3 did not go on');
    expect(html).toContain('2 did not go on');
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

const ROWS: FactChartRow[] = [
  { label: 'First', value: 40, text: '40', href: '/app/first' },
  { label: 'Second', value: null, text: 'No mark saved' },
  { label: 'Third', value: 25, text: '25', note: 'Fifteen did not go on' },
  { label: 'Fourth', value: 10, text: '10', muted: true },
];
const WORDS = { showAs: 'Show as', chart: 'Chart', table: 'Table', what: 'What', value: 'Number', none: 'No data yet', open: 'Open the rows' };
const draw = (kind: FactChartKind, view: 'chart' | 'table') => renderToStaticMarkup(h(FactChart, { id: `test-${kind}`, title: `A ${kind} chart`, note: 'How to read it', kind, tone: 'royal', rows: ROWS, words: WORDS, href: '/app/all', initialView: view, centre: kind === 'donut' ? { value: '75', word: 'in all' } : undefined }));

describe('every chart kind, drawn', () => {
  for (const kind of ['bars', 'hbars', 'progress', 'line', 'area', 'ring', 'donut', 'funnel'] as const) {
    it(`${kind}: an SVG in the theme's chart colours, a table that lists every row, and no colour written as a hex`, () => {
      const chart = draw(kind, 'chart');
      expect(chart).toContain(`data-chart-kind="${kind}"`);
      expect(chart).toMatch(/<svg[\s>]/);
      expect(chart).toContain('var(--chart-');
      expect(chart).toContain('How to read it');
      expect(chart).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      const table = draw(kind, 'table');
      expect((table.match(/data-chart-table-row/g) ?? []).length).toBe(ROWS.length);
      for (const r of ROWS) expect(table).toContain(`>${r.label}<`);
      expect(table).toContain('href="/app/first"');
      expect(table).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });
  }

  it('the parts of a donut take the series colours in order, the not-yet-counted part the track colour, and the centre says the whole', () => {
    const donut = draw('donut', 'chart');
    expect(donut).toContain('stroke="var(--chart-1)"');
    expect(donut).toContain('stroke="var(--chart-3)"'); // the second row has no value: its colour is kept, no arc is drawn
    expect(donut).not.toContain('stroke="var(--chart-2)"');
    expect(donut).toContain('fill="var(--chart-grid)"');
    expect(donut).toContain('>75<');
    expect(donut).toContain('>in all<');
    // Each part's name opens its rows, in the legend as in the table.
    expect(donut).toContain('href="/app/first"');
  });

  it('a line and an area leave a day with no value as a gap; the funnel says each drop', () => {
    // Days 1, 3 and 4 have a value: day 1 stands alone, days 3 and 4 are joined; day 2 is a gap.
    expect(draw('line', 'chart').match(/<path /g) ?? []).toHaveLength(1);
    expect(draw('area', 'chart').match(/<path /g) ?? []).toHaveLength(2); // the fill and the line of the one run
    expect(draw('funnel', 'chart')).toContain('Fifteen did not go on');
    expect(draw('area', 'chart')).toContain('var(--chart-text)');
  });

  it('with nothing to draw it says so, and offers no switch', () => {
    const none = renderToStaticMarkup(h(FactChart, { id: 'empty', title: 'Empty', kind: 'donut', tone: 'royal', rows: [{ label: 'A', value: 0, text: '0' }], words: WORDS, href: null }));
    expect(none).toContain('data-chart-none');
    expect(none).not.toContain('data-chart-view');
  });
});
