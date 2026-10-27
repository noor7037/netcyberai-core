// The scan outbox's name on the phone, and what signing out does to it (C230-AJ). Its own tiny file, with nothing
// imported, because the app shell's sign-out loads it on every page; the outbox itself is ./outbox-idb.ts, loaded only by
// the scan screen. The service worker (public/sw.js) uses the same name and version: change them together.

export const SCAN_OUTBOX_DB = 'nca-scan-outbox';
export const SCAN_OUTBOX_VERSION = 1;
export const SCAN_OUTBOX_STORES = { page: 'pages', batch: 'batches', upload: 'uploads', meta: 'meta' } as const;

// How many scanned pages are still on this phone, whoever took them (sign-out says so before it deletes them). 0 when
// there is no outbox, or the browser keeps none.
export async function scanPagesOnPhone(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  try {
    if (typeof indexedDB.databases === 'function' && !(await indexedDB.databases()).some((d) => d.name === SCAN_OUTBOX_DB)) return 0;
    return await new Promise<number>((resolve) => {
      const open = indexedDB.open(SCAN_OUTBOX_DB, SCAN_OUTBOX_VERSION);
      // Not there (a browser that cannot list its databases): nothing to count, and nothing is made.
      open.onupgradeneeded = () => open.transaction?.abort();
      open.onerror = open.onblocked = () => resolve(0);
      open.onsuccess = () => {
        const db = open.result;
        try {
          const r = db.transaction(SCAN_OUTBOX_STORES.page, 'readonly').objectStore(SCAN_OUTBOX_STORES.page).count();
          r.onsuccess = () => {
            db.close();
            resolve(r.result);
          };
          r.onerror = () => {
            db.close();
            resolve(0);
          };
        } catch {
          db.close();
          resolve(0);
        }
      };
    });
  } catch {
    return 0;
  }
}

// Sign-out: the whole outbox deleted from this phone, every person's (an open scan screen lets go of it when asked).
export async function clearScanOutbox(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(SCAN_OUTBOX_DB);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}
