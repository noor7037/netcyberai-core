import { memoryOutboxStore, type OutboxKind, type OutboxStore } from './outbox';
import { SCAN_OUTBOX_DB, SCAN_OUTBOX_STORES, SCAN_OUTBOX_VERSION } from './outbox-clear';

// The scan outbox on the phone (C230-AJ): one IndexedDB database, its own (never localStorage), with a store for each
// kind of record and a small `meta` store saying whose pages these are, which the service worker reads before it sends
// anything in the background (public/sw.js keeps the same names and version: change both together). A browser that
// refuses storage gets the outbox in memory: the pages then live only while the scan screen is open, and it says so.
//
// Signing out deletes the whole database (clearScanOutbox), for every person who used this phone: pages are children's
// work, so nothing is left behind. An open scan screen lets go of it when asked (versionchange), so the deletion is
// never held up.

const STORES: Record<OutboxKind, string> = { page: SCAN_OUTBOX_STORES.page, batch: SCAN_OUTBOX_STORES.batch, upload: SCAN_OUTBOX_STORES.upload };
const META = SCAN_OUTBOX_STORES.meta;

const request = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('scan outbox'));
  });

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SCAN_OUTBOX_DB, SCAN_OUTBOX_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      for (const name of [...Object.values(STORES), META]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
    };
    open.onsuccess = () => {
      const db = open.result;
      // Signing out (in this tab or another) deletes the database: let go of it at once.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    open.onerror = () => reject(open.error ?? new Error('scan outbox'));
    open.onblocked = () => reject(new Error('scan outbox blocked'));
  });
}

export type OpenedOutbox = { store: OutboxStore; onPhone: boolean; close: () => void };

// The outbox for `owner` (the signed-in person): IndexedDB when the browser allows it, else memory. The owner is written
// down for the service worker, which sends only that person's pages.
export async function openScanOutbox(owner: string): Promise<OpenedOutbox> {
  if (typeof indexedDB === 'undefined') return { store: memoryOutboxStore(), onPhone: false, close: () => undefined };
  let db: IDBDatabase;
  try {
    db = await openDb();
    await request(db.transaction(META, 'readwrite').objectStore(META).put({ id: 'owner', owner }));
  } catch {
    return { store: memoryOutboxStore(), onPhone: false, close: () => undefined };
  }
  const run = <T>(name: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => request(fn(db.transaction(name, mode).objectStore(name)));
  const store: OutboxStore = {
    list: (kind) => run(STORES[kind], 'readonly', (s) => s.getAll()) as never,
    put: async (kind, value) => void (await run(STORES[kind], 'readwrite', (s) => s.put(value))),
    remove: async (kind, id) => void (await run(STORES[kind], 'readwrite', (s) => s.delete(id))),
    clear: async () => {
      for (const name of Object.values(STORES)) await run(name, 'readwrite', (s) => s.clear());
    },
  };
  return { store, onPhone: true, close: () => db.close() };
}

export { clearScanOutbox, scanPagesOnPhone } from './outbox-clear';
