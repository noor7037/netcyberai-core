import type { BulkApi } from '@/components/app-ui/BulkBar';
import type { SavedView } from '@/lib/contracts/filters';
import { bulkPreviewFixture, bulkRunFixture, savedViewFixture } from './contracts';

// Illustrative data for the /design-system gallery only (development): an
// in-memory stand-in for the bulk API so the whole preview → confirm →
// progress → undo flow can be seen without a database. Never used by a
// product screen.

export const GALLERY_USER_ID = '00000000-0000-4000-8000-00000000f001';
export const GALLERY_MATCHING_TOTAL = 48; // rows "matching the filter" in the gallery list

export const galleryOptions = {
  classes: [
    { value: 'illustrative-class-10', label: 'Class 10' },
    { value: 'illustrative-class-9', label: 'Class 9' },
  ],
  sections: [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ],
};

export const galleryViews: SavedView[] = [
  savedViewFixture.data,
  { ...savedViewFixture.data, viewId: '00000000-0000-4000-8000-00000000f011', name: 'My Class 10 A', scope: 'personal', ownerUserId: GALLERY_USER_ID, defaultForRoles: undefined },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const galleryBulkApi: BulkApi = {
  async preview(req) {
    await wait(300);
    const count = req.selection.mode === 'ids' ? req.selection.ids.length : req.selection.expectedCount;
    return { ...bulkPreviewFixture.data, count, warnings: count > 2 ? ['Rows with no next class are skipped.'] : [] };
  },
  async confirm() {
    await wait(300);
    return { ...bulkRunFixture.data, status: 'running', done: 0, undoUntil: undefined, finishedAt: undefined };
  },
  async get() {
    return { ...bulkRunFixture.data, undoUntil: new Date(Date.now() + 600_000).toISOString() };
  },
  async undo() {
    await wait(300);
    return { ...bulkRunFixture.data, status: 'undone', undoUntil: undefined };
  },
};
