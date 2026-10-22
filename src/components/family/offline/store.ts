// The phone's offline store (M2-9, C283), in IndexedDB: the chapter packs a family saved, and the answers made with no
// connection, each waiting with its token, its choice, the India day it was made and a key of its own, until it is sent
// once. Storage may be missing or blocked (a private window): every call then does nothing and says so.
import type { ChapterPack } from '@/lib/family/pack';
import { indiaDate } from '@/lib/time/india';

const DB_NAME = 'ncf-offline';
const PACKS = 'packs';
const ANSWERS = 'answers';
const OWNER_KEY = 'ncf.offline.owner';
const CHILD_KEY = 'ncf.offline.child';
const SHELL_KEY = 'ncf.offline.shellAt';

export type SavedPack = { id: string; childId: string; chapterKey: string; savedAt: number; pack: ChapterPack };
export type QueuedAnswer = { key: string; token: string; choice: number; answeredOn: string; madeAt: number };

const packId = (childId: string, chapterKey: string) => `${childId}:${chapterKey}`;

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(PACKS, { keyPath: 'id' });
        req.result.createObjectStore(ANSWERS, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => {
        db.close();
        resolve(req ? (req.result as T) : null);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

// ---- packs ----

export async function savePack(pack: ChapterPack): Promise<boolean> {
  const rec: SavedPack = { id: packId(pack.childId, pack.chapter.key), childId: pack.childId, chapterKey: pack.chapter.key, savedAt: Date.now(), pack };
  return (await run(PACKS, 'readwrite', (s) => s.put(rec))) !== null;
}

export async function removePack(childId: string, chapterKey: string): Promise<void> {
  await run(PACKS, 'readwrite', (s) => s.delete(packId(childId, chapterKey)));
}

// The saved packs (of one child, when given), an expired one deleted on the way.
export async function listPacks(childId?: string | null): Promise<SavedPack[]> {
  const all = ((await run<SavedPack[]>(PACKS, 'readonly', (s) => s.getAll() as IDBRequest<SavedPack[]>)) ?? []).filter((p) => p && p.pack && p.pack.v === 1);
  const now = Date.now();
  const expired = all.filter((p) => Date.parse(p.pack.expiresAt) <= now);
  for (const p of expired) await removePack(p.childId, p.chapterKey);
  return all.filter((p) => !expired.includes(p) && (!childId || p.childId === childId)).sort((a, b) => a.pack.chapter.title.localeCompare(b.pack.chapter.title));
}

// ---- answers made offline ----

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`);

export async function queueAnswer(token: string, choice: number): Promise<boolean> {
  const rec: QueuedAnswer = { key: newKey(), token, choice, answeredOn: indiaDate(), madeAt: Date.now() };
  return (await run(ANSWERS, 'readwrite', (s) => s.put(rec))) !== null;
}

export async function queuedAnswers(): Promise<QueuedAnswer[]> {
  return ((await run<QueuedAnswer[]>(ANSWERS, 'readonly', (s) => s.getAll() as IDBRequest<QueuedAnswer[]>)) ?? []).sort((a, b) => a.madeAt - b.madeAt);
}

let flushing: Promise<number> | null = null;

// Send the waiting answers, oldest first. An answer the server took (or can never take: its token ended, it is not this
// family's, it is malformed) leaves the queue; one that met no connection or a server fault waits for the next try.
// Returns how many still wait.
export function flushAnswers(): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    for (const a of await queuedAnswers()) {
      let status = 0;
      try {
        const res = await fetch('/api/family/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ token: a.token, choice: a.choice, answeredOn: a.answeredOn, key: a.key }),
        });
        status = res.status;
      } catch {
        break;
      }
      if (status === 200 || status === 400 || status === 404) await run(ANSWERS, 'readwrite', (s) => s.delete(a.key));
      else break;
    }
    return (await queuedAnswers()).length;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

// ---- who the store belongs to ----

function local(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Everything on the phone, and the kept shell, deleted.
export async function clearOffline(): Promise<void> {
  await run(PACKS, 'readwrite', (s) => s.clear());
  await run(ANSWERS, 'readwrite', (s) => s.clear());
  local()?.removeItem(CHILD_KEY);
  local()?.removeItem(SHELL_KEY);
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) navigator.serviceWorker.controller?.postMessage({ type: 'family-clear' });
}

// Another account signed in on this phone: the last account's packs and answers go first.
export async function claimStore(owner: string): Promise<void> {
  const ls = local();
  if (!ls || ls.getItem(OWNER_KEY) === owner) return;
  await clearOffline();
  ls.setItem(OWNER_KEY, owner);
}

export const rememberChild = (childId: string) => local()?.setItem(CHILD_KEY, childId);
export const rememberedChild = () => local()?.getItem(CHILD_KEY) ?? null;

// Keep the app's shell for offline use: when a pack is saved, and then at most once a day while packs are saved.
export function keepShell(force = false): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const ls = local();
  const last = Number(ls?.getItem(SHELL_KEY) ?? 0);
  if (!force && Date.now() - last < 24 * 60 * 60 * 1000) return;
  void navigator.serviceWorker.ready.then((r) => {
    r.active?.postMessage({ type: 'family-shell' });
    ls?.setItem(SHELL_KEY, String(Date.now()));
  });
}
