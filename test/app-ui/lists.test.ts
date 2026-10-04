import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BulkBar, ComingInPhase, DataList, FilterBar, SavedViewsMenu, listQuery } from '@/components/app-ui';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import { bulkActionFixture, bulkPreviewFixture, bulkRunFixture, studentListFixture, studentPageFixture } from '@/demo-fixture/contracts';
import { galleryOptions, galleryViews, GALLERY_USER_ID } from '@/demo-fixture/app-ui-gallery';

const fields = studentListFixture.data.fields;
const noop = () => undefined;

describe('list query edits', () => {
  it('quick filters own one condition per field; remove, combinator and clear keep the rest', () => {
    let q = listQuery.setQuickFilter({}, 'status', ['active']);
    q = listQuery.addCondition(q, { field: 'date_of_birth', op: 'before', value: '2015-01-01' });
    q = listQuery.setQuickFilter(q, 'status', ['active', 'transferred']);
    expect(q.filter!.conditions).toHaveLength(2);
    expect(listQuery.quickValues(q, 'status')).toEqual(['active', 'transferred']);
    expect(listQuery.describe(q.filter!.conditions[1], fields)).toBe('Status is Active, Transferred');
    expect(listQuery.describe(q.filter!.conditions[0], fields)).toBe('Date of birth before 2015-01-01');
    expect(listQuery.setCombinator(q, 'or').filter!.combinator).toBe('or');
    expect(listQuery.removeAt(q, 0).filter!.conditions).toHaveLength(1);
    expect(listQuery.setQuickFilter(listQuery.removeAt(q, 0), 'status', [])).toEqual({});
    expect(listQuery.clearFilters({ ...q, search: 'aa', sort: [{ field: 'x', dir: 'asc' }] })).toEqual({ sort: [{ field: 'x', dir: 'asc' }] });
    expect(listQuery.describe({ field: 'class_id', op: 'in', value: ['illustrative-class-10'] }, fields, galleryOptions)).toBe('Class is Class 10');
  });
});

describe('filter bar and saved views', () => {
  it('shows quick chips, applied filters with remove, and Clear all', () => {
    const q = listQuery.setQuickFilter({ search: 'aar' }, 'status', ['active']);
    const html = renderToStaticMarkup(h(FilterBar, { definition: studentListFixture.data, query: q, onChange: noop, options: galleryOptions }));
    for (const label of ['Class', 'Section', 'Status', 'More filters', 'Clear all']) expect(html).toContain(label);
    expect(html).toContain('aria-label="Remove filter: Status is Active"');
    expect(html).toContain('placeholder="Name, admission no. or parent phone"');
  });

  it('lists my views and school views; only the owner (or a sharer) can delete; sharing needs canShare', () => {
    const open = (canShare: boolean, userId = GALLERY_USER_ID) =>
      renderToStaticMarkup(h(SavedViewsMenu, { views: galleryViews, defaultViewId: null, currentUserId: userId, canShare, onApply: noop, onSave: noop, onDelete: noop, defaultOpen: true }));
    const sharer = open(true);
    expect(sharer).toContain('My views');
    expect(sharer).toContain('School views');
    expect(sharer).toContain('Default for School admin');
    expect(sharer).toContain('Whole school');
    expect(sharer.match(/Delete view/g)).toHaveLength(2);
    const teacher = open(false, 'someone-else');
    expect(teacher).not.toContain('Whole school');
    expect(teacher).not.toContain('Delete view');
  });
});

describe('selection and the bulk bar', () => {
  const rows = studentPageFixture.data.rows;
  const list = (selected: Set<string>, allMatching = false) =>
    renderToStaticMarkup(
      h(DataList<(typeof rows)[number]>, {
        caption: 'Students',
        columns: [{ key: 'n', header: 'Name', primary: true, render: (r) => r.displayName }],
        rows,
        rowKey: (r) => r.studentId,
        empty: { title: 'x', whatToDo: 'y' },
        selection: { selected, onChange: noop, allMatching, onAllMatching: noop, total: 48 },
      })
    );

  it('rows have checkboxes; selecting the whole page offers all N matching', () => {
    const none = list(new Set());
    expect(none).toContain('aria-label="Select all on this page"');
    expect(none).toContain('aria-label="Select Aarav Example"');
    expect(none).not.toContain('Select all 48 matching');
    expect(list(new Set(rows.map((r) => r.studentId)))).toContain('Select all 48 matching');
    expect(list(new Set(), true)).toContain('All 48 matching rows are selected.');
  });

  it('a row checkbox is labelled in words even when the primary column renders an element (code-review finding)', () => {
    const html = renderToStaticMarkup(
      h(DataList<(typeof rows)[number]>, {
        caption: 'Students',
        columns: [{ key: 'n', header: 'Name', primary: true, render: (r) => h('strong', null, r.displayName) }],
        rows,
        rowKey: (r) => r.studentId,
        empty: { title: 'x', whatToDo: 'y' },
        selection: { selected: new Set<string>(), onChange: noop, allMatching: false, onAllMatching: noop, total: 2 },
      })
    );
    expect(html).not.toContain('[object Object]');
    expect(html).toContain('aria-label="Select row 1"');
    const named = renderToStaticMarkup(
      h(DataList<(typeof rows)[number]>, {
        caption: 'Students',
        columns: [{ key: 'n', header: 'Name', primary: true, render: (r) => h('strong', null, r.displayName) }],
        rows,
        rowKey: (r) => r.studentId,
        rowLabel: (r) => r.displayName,
        empty: { title: 'x', whatToDo: 'y' },
        selection: { selected: new Set<string>(), onChange: noop, allMatching: false, onAllMatching: noop, total: 2 },
      })
    );
    expect(named).toContain('aria-label="Select Diya Example"');
  });

  it('shows only the actions this role may run, then the preview, then progress with Undo', () => {
    const bar = (role: 'principal' | 'teacher', extra = {}) =>
      renderToStaticMarkup(h(BulkBar, { actions: [bulkActionFixture.data], role, count: 2, selection: { mode: 'ids', ids: ['a', 'b'] }, onClear: noop, ...extra }));
    expect(bar('principal')).toContain('Promote to next class');
    expect(bar('teacher')).toContain('No bulk action is available for your role.');
    const preview = bar('principal', { initialStep: { kind: 'preview', action: bulkActionFixture.data, preview: { ...bulkPreviewFixture.data, count: 5, warnings: ['Rows with no next class are skipped.'] } } });
    expect(preview).toContain('Promote 5 students?');
    expect(preview).toContain('Class 10 A → Class 11 A');
    expect(preview).toContain('and 3 more');
    expect(preview).toContain('Rows with no next class are skipped.');
    expect(preview).toContain('Confirm for 5');
    const future = new Date(Date.now() + 60_000).toISOString();
    const done = bar('principal', { initialStep: { kind: 'run', action: bulkActionFixture.data, run: { ...bulkRunFixture.data, undoUntil: future } } });
    expect(done).toContain('2 of 2 done');
    expect(done).toContain('>Undo<');
    const closed = bar('principal', { initialStep: { kind: 'run', action: bulkActionFixture.data, run: { ...bulkRunFixture.data, undoUntil: undefined } } });
    expect(closed).not.toContain('>Undo<');
  });
});

describe('coming in phase', () => {
  it('shows the registry’s name, group, phase and capabilities, and no dates', () => {
    for (const m of MODULE_REGISTRY.filter((x) => x.status === 'planned' || x.status === 'spec-v0')) {
      const html = renderToStaticMarkup(h(ComingInPhase, { moduleId: m.id }));
      expect(html).toContain(`Coming in phase ${m.phase}`);
      for (const c of m.capabilities) expect(html).toContain(c.replace(/&/g, '&amp;'));
      expect(html).not.toMatch(/\b20\d\d\b/); // no year, no date
    }
  });
});
