import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChartCard, DataList, KpiTile, NoAccessState, StatusPill } from '@/components/app-ui';
import { classCoverageFixture, feeShareFixture, kpiTilesFixture, studentPageFixture } from '@/demo-fixture/contracts';

// Server renders of the app design system (what the first paint shows).

describe('app-ui renders', () => {
  it('a KPI tile with no value says so, never shows a number, and keeps its drill link', () => {
    const [students, present, fees] = kpiTilesFixture.data;
    const none = renderToStaticMarkup(h(KpiTile, { tile: fees }));
    expect(none).toContain('No data yet');
    expect(none).toContain('—');
    expect(none).not.toMatch(/₹\d/);
    const linked = renderToStaticMarkup(h(KpiTile, { tile: students }));
    expect(linked).toContain('href="/app/students"');
    expect(linked).toContain('640');
    expect(renderToStaticMarkup(h(KpiTile, { tile: present }))).toContain('up 1.2 points since last week');
  });

  it('a chart card offers a table, says how many values are missing, and shows an empty state with no data', () => {
    const html = renderToStaticMarkup(h(ChartCard, { chart: classCoverageFixture.data }));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('>Table<');
    expect(html).toContain('1 has no data yet and is left out.');
    const empty = renderToStaticMarkup(h(ChartCard, { chart: { ...feeShareFixture.data, slices: [] }, emptyHint: 'Record fees to see this.' }));
    expect(empty).toContain('No data yet');
    expect(empty).toContain('Record fees to see this.');
    expect(empty).not.toContain('>Table<');
  });

  it('a list renders a table for wide screens and cards for phones, with 44 px row links', () => {
    const html = renderToStaticMarkup(
      h(DataList<(typeof studentPageFixture.data.rows)[number]>, {
        caption: 'Students',
        columns: [
          { key: 'name', header: 'Name', primary: true, render: (r) => r.displayName },
          { key: 'adm', header: 'Admission no.', render: (r) => r.admissionNo },
        ],
        rows: studentPageFixture.data.rows,
        rowKey: (r) => r.studentId,
        rowHref: (r) => `/app/students/${r.studentId}`,
        empty: { title: 'No students', whatToDo: 'Add one.' },
      })
    );
    expect(html).toContain('<table');
    expect(html).toContain('md:hidden');
    expect(html.match(/min-h-\[44px\]/g)!.length).toBeGreaterThanOrEqual(4);
    const empty = renderToStaticMarkup(
      h(DataList<{ id: string }>, { caption: 'X', columns: [{ key: 'id', header: 'Id', render: (r) => r.id }], rows: [], rowKey: (r) => r.id, empty: { title: 'Nothing yet', whatToDo: 'Add one.' } })
    );
    expect(empty).toContain('Nothing yet');
  });

  it('the no-access and status states say what they mean in words', () => {
    expect(renderToStaticMarkup(h(NoAccessState, { reason: 'module' }))).toContain('Not switched on for your school');
    expect(renderToStaticMarkup(h(StatusPill, { tone: 'alert', children: 'Failed' }))).toContain('Failed');
  });
});
