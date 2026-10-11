'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createOutbox, syncState, type Operation, type Outbox, type OutboxStatus, type SendResult, type Sender, type SyncState } from '@/lib/offline/outbox';
import { ATTENDANCE_MARK, sendAttendanceMark } from '@/lib/offline/attendance-sender';
import { TAUGHT_MARK, sendTaughtMark } from '@/lib/offline/taught-sender';
import { HOMEWORK_CHECK, sendHomeworkCheck } from '@/lib/offline/homework-sender';
import { deleteDeviceStore, deviceStoreName, idbStore, memoryStore, type DeviceStore } from '@/lib/offline/store';

// The phone's side of working offline (docs/20 §4, C143): the device store
// and outbox of this school and person, whether the network is there, and
// the sending of what waits: when the app opens, when the network returns,
// and when the person presses "Send now". A screen adds a change with
// `queue(...)`; a module says how its kind of change is sent with
// `registerSender` (attendance: src/lib/offline/attendance-sender.ts).

type Offline = {
  ready: boolean;
  online: boolean;
  sync: SyncState;
  store: DeviceStore | null;
  operations: () => Promise<Operation[]>;
  queue: <P>(kind: string, forDate: string, payload: P) => Promise<Operation<P> | null>;
  sendNow: () => Promise<void>;
  retry: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  // Signing out: this person's device store and the kept pages go with them.
  clear: () => Promise<void>;
};

// A sender is given this person's device store, to keep what the answer says.
export type DeviceSender = (op: Operation, store: DeviceStore | null) => Promise<SendResult>;
const SENDERS: Record<string, DeviceSender> = { [ATTENDANCE_MARK]: sendAttendanceMark, [TAUGHT_MARK]: sendTaughtMark, [HOMEWORK_CHECK]: sendHomeworkCheck };
export function registerSender(kind: string, sender: DeviceSender): void {
  SENDERS[kind] = sender;
}

const NONE: OutboxStatus = { waiting: 0, failed: 0, sending: false };
const OfflineContext = createContext<Offline>({ ready: false, online: true, sync: { state: 'saved' }, store: null, operations: async () => [], queue: async () => null, sendNow: async () => undefined, retry: async () => undefined, remove: async () => undefined, clear: async () => undefined });

export function OfflineProvider({ schoolId, userId, children }: { schoolId: string | null; userId: string | null; children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<OutboxStatus>(NONE);
  const [ready, setReady] = useState(false);
  const outbox = useRef<Outbox | null>(null);
  const store = useRef<DeviceStore | null>(null);

  const sendNow = useCallback(async () => {
    if (!outbox.current || !navigator.onLine) return;
    const senders: Record<string, Sender> = {};
    for (const [kind, send] of Object.entries(SENDERS)) senders[kind] = (op) => send(op, store.current);
    setStatus(await outbox.current.flush(senders));
  }, []);

  useEffect(() => {
    if (!schoolId || !userId) return;
    let stop: (() => void) | undefined;
    let gone = false;
    (async () => {
      // A phone that another person used last: their kept pages are not shown to this one.
      await forgetPagesOfAnother(`${schoolId}.${userId}`);
      // A browser that refuses storage keeps things in memory: the app works, online only.
      const s = await idbStore(deviceStoreName(schoolId, userId)).catch(() => memoryStore());
      if (gone) return;
      store.current = s;
      outbox.current = createOutbox(s);
      stop = outbox.current.subscribe(setStatus);
      setStatus(await outbox.current.status());
      setReady(true);
      void sendNow();
    })();
    return () => {
      gone = true;
      stop?.();
    };
  }, [schoolId, userId, sendNow]);

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void sendNow();
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    // The service worker keeps the day's pages for when the network is gone.
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/app' }).catch(() => undefined);
    }
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [sendNow]);

  // These keep one identity for the life of the provider, so a screen that
  // depends on them does not start over each time the outbox moves.
  const operations = useCallback(async () => outbox.current?.all() ?? [], []);
  const queue = useCallback<Offline['queue']>(
    async (kind, forDate, payload) => {
      if (!outbox.current) return null;
      const op = await outbox.current.add(kind, forDate, payload);
      void sendNow();
      return op;
    },
    [sendNow]
  );
  const retry = useCallback(
    async (id: string) => {
      await outbox.current?.retry(id);
      void sendNow();
    },
    [sendNow]
  );
  const remove = useCallback(async (id: string) => void (await outbox.current?.remove(id)), []);
  const clear = useCallback(async () => {
    outbox.current = null;
    store.current = null;
    if (schoolId && userId) await deleteDeviceStore(deviceStoreName(schoolId, userId)).catch(() => undefined);
    await clearKeptPages();
    forgetOwner();
  }, [schoolId, userId]);

  const value = useMemo<Offline>(
    () => ({ ready, online, sync: syncState(status, online), store: store.current, operations, queue, sendNow, retry, remove, clear }),
    [ready, online, status, operations, queue, sendNow, retry, remove, clear]
  );
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): Offline {
  return useContext(OfflineContext);
}

// The pages the service worker kept (public/sw.js) hold what one person saw.
async function clearKeptPages(): Promise<void> {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) navigator.serviceWorker.controller?.postMessage({ type: 'clear' });
  if (typeof caches !== 'undefined') {
    const names = await caches.keys().catch(() => [] as string[]);
    await Promise.all(names.filter((n) => n.startsWith('nca-') && n.endsWith('-pages')).map((n) => caches.delete(n).catch(() => false)));
  }
}

// Whose kept pages these are. A session that ended without signing out
// leaves them behind; the next person to open the app clears them.
const OWNER_KEY = 'nca-device-owner';
async function forgetPagesOfAnother(owner: string): Promise<void> {
  try {
    if (window.localStorage.getItem(OWNER_KEY) === owner) return;
    await clearKeptPages();
    window.localStorage.setItem(OWNER_KEY, owner);
  } catch {
    // Storage refused: nothing is remembered, so clear every time.
    await clearKeptPages();
  }
}
function forgetOwner(): void {
  try {
    window.localStorage.removeItem(OWNER_KEY);
  } catch {
    // Nothing was remembered.
  }
}
