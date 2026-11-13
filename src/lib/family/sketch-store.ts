// My drawings (C510): the drawing studio's pictures, kept on this device only (IndexedDB), never uploaded. Every access
// is wrapped: a private window, a phone with storage turned off or full, or a browser with no IndexedDB answers
// { ok: false } with a reason the studio says in words, and the studio still draws and sends. At most DRAWINGS_CAP
// drawings (src/lib/family/sketch.ts); the cap is checked by the caller before a new one is saved.

import type { DrawingMeta, Paper } from './sketch';

// C513: a drawing may remember the template it was made on (its id) and where it was started ("free", "lesson",
// "homework"); a drawing saved before C513 has neither and opens as a free drawing.
export type SavedDrawing = DrawingMeta & { paper: Paper; width: number; height: number; layer: Blob; thumb: Blob; templateId?: string | null; from?: string };
export type StoreFailure = 'unavailable' | 'full' | 'failed';
export type StoreResult<T> = { ok: true; value: T } | { ok: false; reason: StoreFailure };

const DB = 'ncf-drawings';
const STORE = 'drawings';
// C513: the new drawings started each India day, per child (src/lib/family/draw-daily.ts), beside the drawings.
const DAYS = 'days';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 2);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
        if (!req.result.objectStoreNames.contains(DAYS)) req.result.createObjectStore(DAYS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

const isQuota = (e: unknown) => e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | null, read?: (req: IDBRequest | null) => T, store = STORE): Promise<StoreResult<T>> {
  const db = await openDb();
  if (!db) return { ok: false, reason: 'unavailable' };
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, mode);
      const req = work(tx.objectStore(store));
      tx.oncomplete = () => {
        db.close();
        resolve({ ok: true, value: (read ? read(req) : undefined) as T });
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve({ ok: false, reason: isQuota(tx.error) ? 'full' : 'failed' });
      };
    } catch (e) {
      db.close();
      resolve({ ok: false, reason: isQuota(e) ? 'full' : 'failed' });
    }
  });
}

export const listDrawings = (): Promise<StoreResult<SavedDrawing[]>> =>
  run('readonly', (s) => s.getAll(), (req) => ((req?.result as SavedDrawing[] | undefined) ?? []).filter((d) => d && typeof d.id === 'string'));
export const putDrawing = (d: SavedDrawing): Promise<StoreResult<void>> => run('readwrite', (s) => s.put(d));
export const deleteDrawing = (id: string): Promise<StoreResult<void>> => run('readwrite', (s) => s.delete(id));

// The day's count of new drawings (draw-daily.ts dayKey). Read: 0 when none yet. Bump: one more, in one transaction.
export const readDayCount = (key: string): Promise<StoreResult<number>> =>
  run('readonly', (s) => s.get(key), (req) => (typeof req?.result === 'number' ? (req.result as number) : 0), DAYS);
export const bumpDayCount = async (key: string): Promise<StoreResult<number>> => {
  let next = 0;
  return run(
    'readwrite',
    (s) => {
      const get = s.get(key);
      get.onsuccess = () => {
        next = (typeof get.result === 'number' ? get.result : 0) + 1;
        s.put(next, key);
      };
      return get;
    },
    () => next,
    DAYS
  );
};
