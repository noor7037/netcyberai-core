import type { DeviceStore } from './store';

// The outbox (docs/20 §4, C143). Every change made on the phone is an
// operation with its own id, the date it is for and the time it was made.
// It goes into the outbox first, then to the server:
//
//   - sent in the order it was made;
//   - an operation keeps its id for every try, so the server (which records
//     each id) applies it once however often it arrives;
//   - when the network is down, sending stops and everything waits;
//   - an operation the server refuses stays in the outbox, marked failed
//     with the reason, until the person retries or removes it. Nothing is
//     dropped silently.

export type Operation<P = unknown> = {
  id: string; // made on the device, sent unchanged on every try
  kind: string; // which sender handles it, e.g. 'attendance.mark'
  forDate: string; // the school day it is for (YYYY-MM-DD, India)
  madeAt: string; // when the person did it (the device's clock, ISO)
  payload: P;
  seq: number; // order of making
  state: 'waiting' | 'failed';
  attempts: number;
  reason?: string; // why it failed, in plain words, when it has
  // What the server answered for a failed operation (for example the mark
  // that was already there), for the screen that offers the next step.
  detail?: unknown;
};

// What a sender reports. `retry`: the network or the server could not be
// reached; stop and try the whole queue again later. `refused`: the server
// answered and will not apply it as it is.
export type SendResult = { ok: true } | { ok: false; kind: 'retry' } | { ok: false; kind: 'refused'; reason: string; detail?: unknown };
export type Sender = (op: Operation) => Promise<SendResult>;

export type OutboxStatus = { waiting: number; failed: number; sending: boolean };

const KEY = 'outbox:';
const key = (seq: number, id: string) => `${KEY}${String(seq).padStart(12, '0')}:${id}`;

export function createOutbox(store: DeviceStore, opts: { newId?: () => string; now?: () => Date } = {}) {
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const now = opts.now ?? (() => new Date());
  let sending: Promise<OutboxStatus> | null = null;
  const listeners = new Set<(s: OutboxStatus) => void>();

  async function all(): Promise<Operation[]> {
    const ops = await Promise.all((await store.keys(KEY)).map((k) => store.get<Operation>(k)));
    return ops.filter((o): o is Operation => !!o).sort((a, b) => a.seq - b.seq);
  }

  async function status(): Promise<OutboxStatus> {
    const ops = await all();
    return { waiting: ops.filter((o) => o.state === 'waiting').length, failed: ops.filter((o) => o.state === 'failed').length, sending: sending !== null };
  }

  async function tell(): Promise<OutboxStatus> {
    const s = await status();
    listeners.forEach((l) => l(s));
    return s;
  }

  // Adds an operation and returns it. The id is made here, once.
  async function add<P>(kind: string, forDate: string, payload: P): Promise<Operation<P>> {
    const last = (await all()).at(-1)?.seq ?? 0;
    const op: Operation<P> = { id: newId(), kind, forDate, madeAt: now().toISOString(), payload, seq: last + 1, state: 'waiting', attempts: 0 };
    await store.put(key(op.seq, op.id), op);
    await tell();
    return op;
  }

  // Sends what is waiting, oldest first. Only one send runs at a time: a
  // second call while one is running joins it, so nothing is sent twice by
  // this device at once.
  function flush(senders: Record<string, Sender>): Promise<OutboxStatus> {
    if (sending) return sending;
    sending = (async () => {
      try {
        for (const op of await all()) {
          if (op.state !== 'waiting') continue;
          const send = senders[op.kind];
          let result: SendResult;
          try {
            result = send ? await send(op) : { ok: false, kind: 'refused', reason: 'This kind of change cannot be sent by this version of the app. Refresh the page, then try again.' };
          } catch {
            result = { ok: false, kind: 'retry' };
          }
          if (result.ok) {
            await store.delete(key(op.seq, op.id));
          } else if (result.kind === 'retry') {
            await store.put(key(op.seq, op.id), { ...op, attempts: op.attempts + 1 });
            break; // keep the order: nothing after it is sent before it
          } else {
            await store.put(key(op.seq, op.id), { ...op, attempts: op.attempts + 1, state: 'failed', reason: result.reason, detail: result.detail });
          }
        }
      } finally {
        sending = null;
      }
      return tell();
    })();
    return sending;
  }

  // A failed operation goes back to waiting, with the same id.
  async function retry(id: string): Promise<void> {
    const op = (await all()).find((o) => o.id === id);
    if (op?.state === 'failed') await store.put(key(op.seq, op.id), { ...op, state: 'waiting', reason: undefined, detail: undefined });
    await tell();
  }

  // The person chose not to send it (for example after saving it another way).
  async function remove(id: string): Promise<void> {
    const op = (await all()).find((o) => o.id === id);
    if (op) await store.delete(key(op.seq, op.id));
    await tell();
  }

  function subscribe(listener: (s: OutboxStatus) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { add, all, status, flush, retry, remove, subscribe };
}

export type Outbox = ReturnType<typeof createOutbox>;

// What the sync line says, from the outbox and the network (docs/20 §2:
// "always tells the truth: saved, waiting with a count, or failed").
export type SyncState = { state: 'saved' } | { state: 'sending'; count: number } | { state: 'waiting'; count: number; offline: boolean } | { state: 'failed'; count: number; waiting: number } | { state: 'offline' };

export function syncState(status: OutboxStatus, online: boolean): SyncState {
  if (status.failed > 0) return { state: 'failed', count: status.failed, waiting: status.waiting };
  if (status.waiting > 0) return status.sending && online ? { state: 'sending', count: status.waiting } : { state: 'waiting', count: status.waiting, offline: !online };
  return online ? { state: 'saved' } : { state: 'offline' };
}
