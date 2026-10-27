import { describe, expect, it } from 'vitest';
import { BACKOFF_MS, HOLD_MS, IDLE_CLOSE_MS, LONG_WAIT_MS, PAGES_PER_UPLOAD, ScanOutbox, backoff, memoryOutboxStore, type ApiFailure, type OutboxApi, type OutboxDeps, type OutboxStore } from '@/lib/marking/outbox';

// The phone's outbox for scanned pages (C230-AJ), over the in-memory store: a page stays on the phone until the
// server confirms it; failures are tried again after longer and longer waits; nothing goes while offline; a new
// outbox over the same store (the app opened again) carries on; another person's pages are never sent and are
// removed; signing out clears it.

const PAPER = 'p0000000-0000-4000-8000-000000000001';
const [MEERA, ZOYA, DEV] = ['c1', 'c2', 'c3'];
const jpeg = (n: number, size = 100) => new Uint8Array(size).fill(n).buffer;

type Call = { kind: 'start' | 'send' | 'close'; uploadId?: string; pages?: { fileNo: number; pageNo: number; childId: string; first: number }[] };
function fakeServer() {
  const calls: Call[] = [];
  const kept = new Map<string, { fileNo: number; pageNo: number; childId: string }[]>();
  const closed = new Set<string>();
  let n = 0;
  // What the next calls answer, in turn: undefined means "as a working server would".
  const script: (ApiFailure | undefined)[] = [];
  const next = () => script.shift();
  const api: OutboxApi = {
    async start(paperId) {
      calls.push({ kind: 'start' });
      const f = next();
      if (f) return f;
      const id = `upload-${++n}`;
      kept.set(id, []);
      expect(paperId).toBe(PAPER);
      return { ok: true, uploadId: id };
    },
    async send(uploadId, pages) {
      calls.push({ kind: 'send', uploadId, pages: pages.map((p) => ({ fileNo: p.fileNo, pageNo: p.pageNo, childId: p.childId, first: new Uint8Array(p.bytes)[0] })) });
      const f = next();
      if (f) return f;
      if (closed.has(uploadId)) return { ok: false, status: 409, code: 'upload_closed' };
      for (const p of pages) if (!kept.get(uploadId)!.some((k) => k.fileNo === p.fileNo && k.pageNo === p.pageNo)) kept.get(uploadId)!.push({ fileNo: p.fileNo, pageNo: p.pageNo, childId: p.childId });
      return { ok: true };
    },
    async close(uploadId) {
      calls.push({ kind: 'close', uploadId });
      const f = next();
      if (f) return f;
      closed.add(uploadId);
      return { ok: true };
    },
  };
  return { api, calls, kept, closed, script };
}
const clock = (start = 1_000_000) => {
  const c = { t: start, now: () => c.t };
  return c;
};
let ids = 0;
const newId = () => `id-${++ids}`;
// Most tests send a child's pages at once; the hold is a test of its own.
const outboxOf = (store: OutboxStore, owner: string, api: OutboxApi, deps: OutboxDeps = {}) => new ScanOutbox(store, owner, api, { newId, holdMs: 0, ...deps });

describe('the scan outbox (C230-AJ)', () => {
  it('keeps a page on the phone until the server confirms it, then removes it', async () => {
    const store = memoryOutboxStore();
    const server = fakeServer();
    const t = clock();
    const box = outboxOf(store, 'teacher-1', server.api, { now: t.now });
    await box.capture(PAPER, MEERA, jpeg(1));
    expect((await box.pages(PAPER)).length).toBe(1);
    // The network drops on the first send: the page is still there.
    server.script.push(undefined, { ok: false, status: 0, code: null });
    expect(await box.sync()).toMatchObject({ sent: 0, failed: true });
    expect((await box.pages(PAPER)).map((p) => p.tries)).toEqual([1]);
    t.t += BACKOFF_MS[0];
    expect(await box.sync()).toMatchObject({ sent: 1, failed: false });
    expect(await box.pages(PAPER)).toEqual([]);
    expect(server.kept.get('upload-1')).toEqual([{ fileNo: 1, pageNo: 1, childId: MEERA }]);
    // One upload for the class, started once.
    expect(server.calls.filter((c) => c.kind === 'start')).toHaveLength(1);
  });

  it('tries again after longer and longer waits, and not before; a refusal that may pass waits the longest', async () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 20].map(backoff)).toEqual([2_000, 5_000, 15_000, 30_000, 60_000, 120_000, 300_000, 300_000, 300_000]);
    const store = memoryOutboxStore();
    const server = fakeServer();
    const t = clock();
    const box = outboxOf(store, 'teacher-1', server.api, { now: t.now });
    await box.capture(PAPER, MEERA, jpeg(1));
    await box.sync(); // starts the upload and sends
    await box.capture(PAPER, MEERA, jpeg(2));
    const sends = () => server.calls.filter((c) => c.kind === 'send').length;
    const before = sends();
    // Three failures in a row: 500, timeout, 503.
    for (const status of [500, 408, 503]) {
      server.script.push({ ok: false, status, code: null });
      await box.sync();
    }
    // Only the first failure was tried at once: the next ones waited their turn.
    expect(sends() - before).toBe(1);
    const [p] = await box.pages(PAPER);
    expect(p.tries).toBe(1);
    expect(p.nextAt).toBe(t.t + BACKOFF_MS[0]);
    t.t += BACKOFF_MS[0] - 1;
    await box.sync();
    expect(sends() - before).toBe(1);
    t.t += 1;
    await box.sync(); // 408
    expect((await box.pages(PAPER))[0]).toMatchObject({ tries: 2, nextAt: t.t + BACKOFF_MS[1] });
    t.t += BACKOFF_MS[1];
    await box.sync(); // 503
    expect((await box.pages(PAPER))[0]).toMatchObject({ tries: 3, nextAt: t.t + BACKOFF_MS[2] });
    // AI marking switched off for the school: kept, and asked again only after the long wait.
    t.t += BACKOFF_MS[2];
    server.script.push({ ok: false, status: 409, code: 'ai_off' });
    await box.sync();
    expect((await box.pages(PAPER))[0]).toMatchObject({ tries: 4, nextAt: t.t + LONG_WAIT_MS, refused: null });
    t.t += LONG_WAIT_MS;
    await box.sync();
    expect(await box.pages(PAPER)).toEqual([]);
  });

  it('sends nothing while offline, and goes on when the network is back', async () => {
    const store = memoryOutboxStore();
    const server = fakeServer();
    let online = false;
    const box = outboxOf(store, 'teacher-1', server.api, { online: () => online });
    await box.capture(PAPER, MEERA, jpeg(1));
    await box.capture(PAPER, MEERA, jpeg(2));
    expect(await box.sync()).toEqual({ sent: 0, closed: 0, failed: false });
    expect(server.calls).toEqual([]);
    online = true;
    expect(await box.sync()).toMatchObject({ sent: 2 });
  });

  it('carries on after the app is closed: a new outbox over the same store uses the same upload and file', async () => {
    const store = memoryOutboxStore();
    const server = fakeServer();
    const t = clock();
    const first = outboxOf(store, 'teacher-1', server.api, { now: t.now });
    await first.capture(PAPER, MEERA, jpeg(1));
    await first.sync();
    await first.capture(PAPER, MEERA, jpeg(2));
    // The app is closed before the second page goes.
    const again = outboxOf(store, 'teacher-1', server.api, { now: t.now });
    await again.capture(PAPER, MEERA, jpeg(3));
    expect(await again.sync()).toMatchObject({ sent: 2 });
    expect(server.calls.filter((c) => c.kind === 'start')).toHaveLength(1);
    expect(server.kept.get('upload-1')).toEqual([1, 2, 3].map((pageNo) => ({ fileNo: 1, pageNo, childId: MEERA })));
  });

  it('each child is one file; an upload closes once its children are moved on from and their pages are in', async () => {
    const store = memoryOutboxStore();
    const server = fakeServer();
    const t = clock();
    const box = outboxOf(store, 'teacher-1', server.api, { now: t.now });
    // Meera, five pages; Zoya, four: the upload holds a reading job's pages, so Dev starts another.
    for (let i = 0; i < 5; i++) await box.capture(PAPER, MEERA, jpeg(10 + i));
    await box.moveOn(PAPER, MEERA);
    for (let i = 0; i < 4; i++) await box.capture(PAPER, ZOYA, jpeg(20 + i));
    await box.sync();
    expect(server.kept.get('upload-1')!.map((p) => `${p.childId}:${p.fileNo}:${p.pageNo}`)).toEqual([...[1, 2, 3, 4, 5].map((n) => `c1:1:${n}`), ...[1, 2, 3, 4].map((n) => `c2:2:${n}`)]);
    // Zoya is still being scanned: nothing closes yet.
    expect(server.closed.size).toBe(0);
    await box.moveOn(PAPER, ZOYA);
    expect(5 + 4).toBeGreaterThanOrEqual(PAGES_PER_UPLOAD);
    await box.capture(PAPER, DEV, jpeg(30));
    await box.sync();
    // Dev went into a new upload; the first, full, closed (its reading starts while Dev is scanned).
    expect(server.kept.get('upload-2')).toEqual([{ fileNo: 1, pageNo: 1, childId: DEV }]);
    expect([...server.closed]).toEqual(['upload-1']);
    // Nothing taken for a while: the last upload closes too, once Dev is moved on from.
    t.t += IDLE_CLOSE_MS + 1_000;
    await box.sync();
    expect(server.closed.has('upload-2')).toBe(false);
    await box.moveOn(PAPER, DEV);
    await box.sync();
    expect(server.closed.has('upload-2')).toBe(true);
    expect(store.size()).toBe(0);
  });

  it('going back to a child whose upload is still open keeps their one file; Finish closes at once', async () => {
    const store = memoryOutboxStore();
    const server = fakeServer();
    const box = outboxOf(store, 'teacher-1', server.api);
    await box.capture(PAPER, MEERA, jpeg(1));
    await box.moveOn(PAPER, MEERA);
    await box.capture(PAPER, ZOYA, jpeg(2));
    await box.sync();
    await box.capture(PAPER, MEERA, jpeg(3));
    await box.finish(PAPER);
    await box.sync();
    expect(server.kept.get('upload-1')).toEqual([
      { fileNo: 1, pageNo: 1, childId: MEERA },
      { fileNo: 2, pageNo: 1, childId: ZOYA },
      { fileNo: 1, pageNo: 2, childId: MEERA },
    ]);
    expect([...server.closed]).toEqual(['upload-1']);
  });

  it('a page the server refuses for good is kept for the teacher to see and remove, and the rest go on', async () => {
    const store = memoryOutboxStore();
    const server = fakeServer();
    const box = outboxOf(store, 'teacher-1', server.api);
    await box.capture(PAPER, MEERA, jpeg(1));
    await box.capture(PAPER, MEERA, jpeg(2));
    // The pair is refused (one is not a picture the server can read); each then goes on its own.
    server.script.push(undefined, { ok: false, status: 400, code: 'not_a_page' }, undefined, { ok: false, status: 400, code: 'not_a_page' });
    await box.sync();
    const left = await box.pages(PAPER);
    expect(left.map((p) => [p.seq, p.refused])).toEqual([[2, 'not_a_page']]);
    expect(await box.counts(PAPER)).toEqual({ waiting: 0, refused: 1, byChild: { [MEERA]: 2 } });
    // Not tried again.
    const sends = server.calls.length;
    await box.sync();
    expect(server.calls.filter((c, i) => i >= sends && c.kind === 'send')).toEqual([]);
    await box.removePage(left[0].id);
    expect(await box.pages(PAPER)).toEqual([]);
  });

  it('the child being scanned keeps their pages until the teacher moves on (to take one again), or a minute passes', async () => {
    const store = memoryOutboxStore();
    const server = fakeServer();
    const t = clock();
    const box = new ScanOutbox(store, 'teacher-1', server.api, { now: t.now, newId });
    const first = await box.capture(PAPER, MEERA, jpeg(1));
    await box.capture(PAPER, MEERA, jpeg(2));
    await box.sync();
    expect(server.calls).toEqual([]);
    // Taken again: the blurred page is removed before it ever left the phone.
    await box.removePage(first.id);
    await box.capture(PAPER, MEERA, jpeg(3));
    await box.moveOn(PAPER, MEERA);
    await box.sync();
    expect(server.kept.get('upload-1')!.map((p) => p.pageNo)).toEqual([2, 3]);
    // The next child, left on the screen: their pages go once the hold has passed.
    await box.capture(PAPER, ZOYA, jpeg(4));
    await box.sync();
    expect(server.kept.get('upload-1')).toHaveLength(2);
    t.t += HOLD_MS + 1_000;
    await box.sync();
    expect(server.kept.get('upload-1')).toHaveLength(3);
  });

  it('only the signed-in person’s pages are sent or shown; another’s are removed; signing out clears everything', async () => {
    const store = memoryOutboxStore();
    const server = fakeServer();
    const theirs = outboxOf(store, 'teacher-2', server.api, { online: () => false });
    await theirs.capture(PAPER, DEV, jpeg(9));
    const box = outboxOf(store, 'teacher-1', server.api);
    await box.capture(PAPER, MEERA, jpeg(1));
    expect((await box.pages()).map((p) => p.childId)).toEqual([MEERA]);
    await box.sync();
    expect(server.calls.flatMap((c) => c.pages ?? []).map((p) => p.childId)).toEqual([MEERA]);
    expect(await box.forgetOthers()).toBe(2);
    expect(await theirs.pages()).toEqual([]);
    await box.capture(PAPER, ZOYA, jpeg(2));
    // Sign-out: clearScanOutbox deletes the whole store (./outbox-idb.ts); the store's clear is that step here.
    await store.clear();
    expect(store.size()).toBe(0);
    expect(await box.pages()).toEqual([]);
  });

  it('an upload closed from elsewhere: the child’s file starts again in a new upload, never lost', async () => {
    const store = memoryOutboxStore();
    const server = fakeServer();
    const box = outboxOf(store, 'teacher-1', server.api);
    await box.capture(PAPER, MEERA, jpeg(1));
    await box.sync();
    server.closed.add('upload-1');
    await box.capture(PAPER, MEERA, jpeg(2));
    await box.sync();
    await box.sync();
    expect(server.kept.get('upload-2')).toEqual([{ fileNo: 1, pageNo: 2, childId: MEERA }]);
    expect(await box.pages()).toEqual([]);
  });
});
