// My drawings (C510): the drawing studio's pictures, kept on this device only (IndexedDB), never uploaded. Every access
// is wrapped: a private window, a phone with storage turned off or full, or a browser with no IndexedDB answers
// { ok: false } with a reason the studio says in words, and the studio still draws and sends. At most DRAWINGS_CAP
// drawings (src/lib/family/sketch.ts); the cap is checked by the caller before a new one is saved.

import type { DrawingMeta, Paper } from './sketch';

export type SavedDrawing = DrawingMeta & { paper: Paper; width: number; height: number; layer: Blob; thumb: Blob };
export type StoreFailure = 'unavailable' | 'full' | 'failed';
export type StoreResult<T> = { ok: true; value: T } | { ok: false; reason: StoreFailure };

const DB = 'ncf-drawings';
const STORE = 'drawings';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
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

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | null, read?: (req: IDBRequest | null) => T): Promise<StoreResult<T>> {
  const db = await openDb();
  if (!db) return { ok: false, reason: 'unavailable' };
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
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
