import { describe, expect, it } from 'vitest';
import { createOutbox, syncState, type Operation, type Sender, type SendResult } from '@/lib/offline/outbox';
import { deviceStoreName, memoryStore } from '@/lib/offline/store';

// The outbox (docs/20 §4, C143): order kept, a retried operation applied
// once, a refused one stays visible, nothing lost and nothing doubled.

// A server that records each operation id and applies an id once, as the
// real one does (client_operations, 5b). `down` makes it unreachable.
function server() {
  const applied: string[] = [];
  const seen = new Set<string>();
  const arrivals: string[] = [];
  const state = { down: false, refuse: new Map<string, string>(), loseAnswerFor: new Set<string>() };
  const send: Sender = async (op: Operation): Promise<SendResult> => {
    if (state.down) return { ok: false, kind: 'retry' };
    arrivals.push(op.id);
    const why = state.refuse.get((op.payload as { student: string }).student);
    if (why) return { ok: false, kind: 'refused', reason: why, detail: { existing: 'present' } };
    if (!seen.has(op.id)) {
      seen.add(op.id);
      applied.push((op.payload as { student: string }).student);
    }
    // The server applied it, but the answer never reached the phone.
    if (state.loseAnswerFor.delete(op.id)) throw new Error('connection lost');
    return { ok: true };
  };
  return { applied, arrivals, state, senders: { 'attendance.mark': send } };
}

let n = 0;
const outbox = () => createOutbox(memoryStore(), { newId: () => `op-${++n}`, now: () => new Date('2026-10-12T03:00:00Z') });
const mark = (o: ReturnType<typeof outbox>, student: string) => o.add('attendance.mark', '2026-10-12', { student, status: 'present' });

describe('the outbox', () => {
  it('keeps the order things were done in', async () => {
    const o = outbox();
    const s = server();
    for (const student of ['a', 'b', 'c', 'd']) await mark(o, student);
    expect((await o.all()).map((op) => op.seq)).toEqual([1, 2, 3, 4]);
    await o.flush(s.senders);
    expect(s.applied).toEqual(['a', 'b', 'c', 'd']);
    expect(await o.status()).toEqual({ waiting: 0, failed: 0, sending: false });
  });

  it('with no network everything waits, and nothing is lost when it returns', async () => {
    const o = outbox();
    const s = server();
    s.state.down = true;
    for (const student of ['a', 'b', 'c']) await mark(o, student);
    expect(await o.flush(s.senders)).toMatchObject({ waiting: 3, failed: 0 });
    expect(await o.flush(s.senders)).toMatchObject({ waiting: 3 });
    expect(s.applied).toEqual([]);
    s.state.down = false;
    expect(await o.flush(s.senders)).toMatchObject({ waiting: 0, failed: 0 });
    expect(s.applied).toEqual(['a', 'b', 'c']);
  });

  it('an operation whose answer was lost is sent again with the same id, and is applied once', async () => {
    const o = outbox();
    const s = server();
    const first = await mark(o, 'a');
    await mark(o, 'b');
    s.state.loseAnswerFor.add(first.id);
    expect(await o.flush(s.senders)).toMatchObject({ waiting: 2 }); // the phone does not know 'a' was saved
    expect(s.applied).toEqual(['a']);
    expect(await o.flush(s.senders)).toMatchObject({ waiting: 0 });
    // 'a' arrived twice with one id, and was applied once; 'b' was not sent before 'a' was settled.
    expect(s.arrivals).toEqual([first.id, first.id, 'op-' + (Number(first.id.slice(3)) + 1)]);
    expect(s.applied).toEqual(['a', 'b']);
  });

  it('a network failure stops the queue: nothing later overtakes it', async () => {
    const o = outbox();
    const s = server();
    await mark(o, 'a');
    await mark(o, 'b');
    let calls = 0;
    const flaky: Sender = async (op) => (++calls === 1 ? { ok: false, kind: 'retry' } : s.senders['attendance.mark'](op));
    await o.flush({ 'attendance.mark': flaky });
    expect(s.applied).toEqual([]);
    expect(calls).toBe(1);
    await o.flush({ 'attendance.mark': flaky });
    expect(s.applied).toEqual(['a', 'b']);
  });

  it('an operation the server refuses stays visible with its reason; the others still go', async () => {
    const o = outbox();
    const s = server();
    s.state.refuse.set('b', 'This student was already marked today by someone else.');
    for (const student of ['a', 'b', 'c']) await mark(o, student);
    expect(await o.flush(s.senders)).toEqual({ waiting: 0, failed: 1, sending: false });
    expect(s.applied).toEqual(['a', 'c']);
    const failed = (await o.all())[0];
    expect(failed).toMatchObject({ state: 'failed', reason: 'This student was already marked today by someone else.', detail: { existing: 'present' }, attempts: 1 });
    // It is not sent again by itself.
    await o.flush(s.senders);
    expect(s.arrivals.filter((id) => id === failed.id)).toHaveLength(1);
  });

  it('a failed operation can be retried (same id) or removed; it is never dropped silently', async () => {
    const o = outbox();
    const s = server();
    s.state.refuse.set('a', 'no');
    const op = await mark(o, 'a');
    await o.flush(s.senders);
    s.state.refuse.clear();
    await o.retry(op.id);
    expect(await o.status()).toMatchObject({ waiting: 1, failed: 0 });
    await o.flush(s.senders);
    expect(s.applied).toEqual(['a']);
    expect(s.arrivals).toEqual([op.id, op.id]);

    s.state.refuse.set('z', 'no');
    const other = await mark(o, 'z');
    await o.flush(s.senders);
    expect((await o.status()).failed).toBe(1);
    await o.remove(other.id);
    expect(await o.status()).toEqual({ waiting: 0, failed: 0, sending: false });
  });

  it('two sends at once do not send anything twice from this device', async () => {
    const o = outbox();
    const s = server();
    for (const student of ['a', 'b', 'c']) await mark(o, student);
    await Promise.all([o.flush(s.senders), o.flush(s.senders), o.flush(s.senders)]);
    expect(s.arrivals).toHaveLength(3);
    expect(s.applied).toEqual(['a', 'b', 'c']);
  });

  it('a kind this version cannot send fails in plain words, and a sender that throws is a retry', async () => {
    const o = outbox();
    await o.add('something.new', '2026-10-12', {});
    await o.flush({});
    expect((await o.all())[0]).toMatchObject({ state: 'failed' });
    expect((await o.all())[0].reason).toContain('Refresh the page');
    const o2 = outbox();
    await mark(o2, 'a');
    expect(await o2.flush({ 'attendance.mark': async () => { throw new Error('boom'); } })).toMatchObject({ waiting: 1, failed: 0 });
  });

  it('survives the app being closed: a new outbox on the same store carries on', async () => {
    const store = memoryStore();
    const before = createOutbox(store, { newId: () => 'kept-1' });
    await before.add('attendance.mark', '2026-10-12', { student: 'a', status: 'absent' });
    const after = createOutbox(store, { newId: () => 'kept-2' });
    const second = await after.add('attendance.mark', '2026-10-12', { student: 'b', status: 'present' });
    expect(second.seq).toBe(2);
    const s = server();
    await after.flush(s.senders);
    expect(s.applied).toEqual(['a', 'b']);
  });

  it('tells its listeners as things change', async () => {
    const o = outbox();
    const heard: number[] = [];
    const stop = o.subscribe((st) => heard.push(st.waiting));
    await mark(o, 'a');
    await o.flush(server().senders);
    stop();
    await mark(o, 'b');
    expect(heard).toEqual([1, 0]);
  });
});

describe('each person’s work stays theirs', () => {
  it('the store is named for the school and the person', () => {
    expect(deviceStoreName('s1', 'u1')).not.toBe(deviceStoreName('s1', 'u2'));
    expect(deviceStoreName('s1', 'u1')).not.toBe(deviceStoreName('s2', 'u1'));
  });
  it('one store never shows another’s operations, and clearing empties it', async () => {
    const mine = memoryStore();
    const theirs = memoryStore();
    await createOutbox(mine).add('attendance.mark', '2026-10-12', { student: 'a' });
    expect(await createOutbox(theirs).all()).toEqual([]);
    await mine.clear();
    expect(await createOutbox(mine).all()).toEqual([]);
  });
  it('what is kept cannot be changed by holding on to it', async () => {
    const store = memoryStore();
    const value = { a: 1 };
    await store.put('k', value);
    value.a = 2;
    expect(await store.get('k')).toEqual({ a: 1 });
  });
});

describe('the sync line always tells the truth', () => {
  const st = (waiting: number, failed: number, sending = false) => ({ waiting, failed, sending });
  it('saved, sending, waiting, failed, offline', () => {
    expect(syncState(st(0, 0), true)).toEqual({ state: 'saved' });
    expect(syncState(st(0, 0), false)).toEqual({ state: 'offline' });
    expect(syncState(st(3, 0), false)).toEqual({ state: 'waiting', count: 3, offline: true });
    expect(syncState(st(3, 0), true)).toEqual({ state: 'waiting', count: 3, offline: false });
    expect(syncState(st(3, 0, true), true)).toEqual({ state: 'sending', count: 3 });
    expect(syncState(st(2, 1), true)).toEqual({ state: 'failed', count: 1, waiting: 2 });
  });
  it('never says "saved" while anything is waiting or failed', () => {
    for (const [w, f] of [[1, 0], [0, 1], [5, 2]]) for (const online of [true, false]) expect(syncState(st(w, f), online).state).not.toBe('saved');
  });
});
