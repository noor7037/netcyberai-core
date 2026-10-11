// The device store (docs/20 §4, C143): a small key-value store in the
// browser, separate for each school and person, holding only what the day
// needs (the outbox, and from 5b a class's names and roll numbers). Never
// guardian phone numbers, documents or marks. Signing out clears it.
//
// One interface, two homes: IndexedDB in the browser, and memory for tests
// and for a browser that refuses storage (the app then works online only,
// and says so).

export interface DeviceStore {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
  clear(): Promise<void>;
}

export function memoryStore(): DeviceStore {
  const data = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      // A copy, as a real store gives: the caller cannot change what is kept by holding on to it.
      return data.has(key) ? (structuredClone(data.get(key)) as T) : undefined;
    },
    async put(key, value) {
      data.set(key, structuredClone(value));
    },
    async delete(key) {
      data.delete(key);
    },
    async keys(prefix = '') {
      return [...data.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
    async clear() {
      data.clear();
    },
  };
}

// One database per school and person: another person signing in on the same
// phone opens a different one and never sees or sends this person's work.
export const deviceStoreName = (schoolId: string, userId: string): string => `nca-device-${schoolId}-${userId}`;

const STORE = 'kv';
const request = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('device store'));
  });

export async function idbStore(name: string): Promise<DeviceStore> {
  const open = indexedDB.open(name, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  const db = await request(open);
  const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => request(fn(db.transaction(STORE, mode).objectStore(STORE)));
  return {
    get: <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key)),
    put: async (key, value) => void (await run('readwrite', (s) => s.put(value, key))),
    delete: async (key) => void (await run('readwrite', (s) => s.delete(key))),
    keys: async (prefix = '') => ((await run('readonly', (s) => s.getAllKeys())) as string[]).filter((k) => typeof k === 'string' && k.startsWith(prefix)).sort(),
    clear: async () => void (await run('readwrite', (s) => s.clear())),
  };
}

// Removes one person's device store from this browser (their sign-out).
// Another person's store on a shared phone, with changes of theirs that
// may not be sent yet, is left alone.
export async function deleteDeviceStore(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined' || !name.startsWith('nca-device-')) return;
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}
