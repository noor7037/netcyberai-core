'use client';

import { useState } from 'react';
import { AppCard } from '@/components/app-ui/Card';
import { BulkBar } from '@/components/app-ui/BulkBar';
import { DataList, type DataColumn } from '@/components/app-ui/DataList';
import { FilterBar, useUrlListQuery } from '@/components/app-ui/FilterBar';
import { SavedViewsMenu } from '@/components/app-ui/SavedViewsMenu';
import { StatusPill } from '@/components/app-ui/StatusPill';
import type { BulkSelection } from '@/lib/contracts/bulk';
import type { SavedView } from '@/lib/contracts/filters';
import { bulkActionFixture, studentListFixture, studentPageFixture } from '@/demo-fixture/contracts';
import { galleryBulkApi, galleryOptions, galleryViews, GALLERY_MATCHING_TOTAL, GALLERY_USER_ID } from '@/demo-fixture/app-ui-gallery';

// Filters, saved views, selection and the bulk bar working together on
// illustrative data. The query lives in the URL (`q`), as on real lists.

type Row = (typeof studentPageFixture.data.rows)[number];
const columns: DataColumn<Row>[] = [
  { key: 'name', header: 'Name', primary: true, render: (r) => r.displayName },
  { key: 'adm', header: 'Admission no.', render: (r) => r.admissionNo },
  { key: 'class', header: 'Class', render: (r) => `${r.className} ${r.section}` },
  { key: 'status', header: 'Status', render: () => <StatusPill tone="success">Active</StatusPill> },
];

export function GalleryLists() {
  const [query, setQuery] = useUrlListQuery();
  const [views, setViews] = useState<SavedView[]>(galleryViews);
  const [active, setActive] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const rows = studentPageFixture.data.rows;
  const count = allMatching ? GALLERY_MATCHING_TOTAL : selected.size;
  const selection: BulkSelection | null = allMatching
    ? { mode: 'filtered', query, expectedCount: GALLERY_MATCHING_TOTAL }
    : selected.size
      ? { mode: 'ids', ids: [...selected] }
      : null;
  const clear = () => {
    setSelected(new Set());
    setAllMatching(false);
  };

  return (
    <AppCard title="Filters, saved views and bulk actions" description="Quick filters, More filters (a sheet on a phone), saved views, row selection and the bulk bar.">
      <FilterBar
        definition={studentListFixture.data}
        query={query}
        onChange={(q) => {
          setQuery(q);
          setActive(null);
        }}
        options={galleryOptions}
        trailing={
          <SavedViewsMenu
            views={views}
            defaultViewId={null}
            activeViewId={active}
            currentUserId={GALLERY_USER_ID}
            canShare
            onApply={(v) => {
              setQuery(v.query);
              setActive(v.viewId);
            }}
            onSave={(v) =>
              setViews([...views, { ...galleryViews[1], viewId: `00000000-0000-4000-8000-${String(views.length).padStart(12, '0')}`, name: v.name, scope: v.scope, defaultForRoles: v.defaultForRoles, query }])
            }
            onDelete={(id) => setViews(views.filter((v) => v.viewId !== id))}
          />
        }
      />
      <DataList
        caption="Students"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.studentId}
        empty={{ title: 'No students match', whatToDo: 'Clear a filter to see more.' }}
        selection={{ selected, onChange: setSelected, allMatching, onAllMatching: setAllMatching, total: GALLERY_MATCHING_TOTAL }}
      />
      <BulkBar actions={[bulkActionFixture.data]} role="principal" count={count} selection={selection} onClear={clear} api={galleryBulkApi} />
    </AppCard>
  );
}
