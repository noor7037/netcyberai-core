import { MAX_PAGES_PER_FILE, PAGES_PER_REQUEST, REQUEST_MAX_BYTES } from '@/lib/contracts/marking';
import { PageBatcher, isRetryable } from './browser-plan';
import { PAGES_PER_READ } from './queue';

// The phone's outbox for scanned answer-sheet pages (C230-AJ): the teacher never waits. A page goes into the outbox the
// moment it is taken, and is sent in the background: a few at a time, tried again with longer and longer waits when the
// network or the server fails, waiting while the phone is offline, and carried on when the app is opened again (the
// outbox lives on the phone, over the small storage interface below: IndexedDB in the browser, memory in tests). A page
// is removed from the phone the moment the server confirms it has it. Nothing here is ever logged, and the outbox is
// cleared when the person signs out (clearScanOutbox, ./outbox-idb.ts): pages are children's work.
//
// How the pages reach the server (src/app/api/app/marking/**): each child the teacher scans is one file of a by_child
// upload, every page naming that child. A child's file is given an upload when its first page is sent; a few children
// share one upload (about a reading job's worth of pages, PAGES_PER_READ), and an upload is closed (which starts the
// school's reading and marking jobs) once every child in it has been moved on from and all their pages are confirmed:
// when it is full, when the teacher finishes, or when nothing has been taken for a while. So reading and marking run
// while the teacher is still scanning, and the jobs (C353) run as they always do.

export type OutboxPage = {
  id: string;
  owner: string; // the signed-in person's user id: only their own pages are ever sent or shown
  paperId: string;
  childId: string;
  batchId: string;
  seq: number; // the page's number in the child's file
  bytes: ArrayBuffer; // the JPEG
  takenAt: number;
  tries: number;
  nextAt: number; // not sent before this (ms)
  refused: string | null; // a refusal the server would give again (a code): kept for the teacher to see and remove
};

// One child's pages on this phone, as one file of an upload.
export type OutboxBatch = {
  id: string;
  owner: string;
  paperId: string;
  childId: string;
  uploadId: string | null; // set once the file has an upload
  fileNo: number | null;
  nextSeq: number;
  sent: number; // pages the server has confirmed
  done: boolean; // the teacher moved on to another child
  lastAt: number; // the last page taken
};

export type OutboxUpload = {
  id: string; // the server's upload id
  owner: string;
  paperId: string;
  files: number;
  full: boolean; // no more children go in
  finish: boolean; // the teacher finished: close it as soon as its pages are in
  tries: number;
  nextAt: number;
};

export type OutboxKind = 'page' | 'batch' | 'upload';
type Rec = { page: OutboxPage; batch: OutboxBatch; upload: OutboxUpload };

// The storage the outbox lives in: three kinds of record, each with an `id`.
export interface OutboxStore {
  list<K extends OutboxKind>(kind: K): Promise<Rec[K][]>;
  put<K extends OutboxKind>(kind: K, value: Rec[K]): Promise<void>;
  remove(kind: OutboxKind, id: string): Promise<void>;
  clear(): Promise<void>;
}

// In memory: for tests, and for a browser that refuses storage (the pages then live only while the screen is open).
export function memoryOutboxStore(): OutboxStore & { size(): number } {
  const data: { [K in OutboxKind]: Map<string, Rec[K]> } = { page: new Map(), batch: new Map(), upload: new Map() };
  // A copy, as a real store gives: holding on to a record never changes what is kept.
  const copy = <T>(v: T): T => {
    const out = { ...v } as Record<string, unknown>;
    if (out.bytes instanceof ArrayBuffer) out.bytes = (out.bytes as ArrayBuffer).slice(0);
    return out as T;
  };
  return {
    async list(kind) {
      return [...data[kind].values()].map(copy) as never;
    },
    async put(kind, value) {
      (data[kind] as Map<string, unknown>).set(value.id, copy(value));
    },
    async remove(kind, id) {
      data[kind].delete(id);
    },
    async clear() {
      for (const m of Object.values(data)) m.clear();
    },
    size: () => data.page.size + data.batch.size + data.upload.size,
  };
}

// What the outbox asks of the server; each answers ok, or the HTTP status (0: the network) and the refusal's code.
export type ApiFailure = { ok: false; status: number; code: string | null };
export type OutboxApi = {
  start: (paperId: string, files: number) => Promise<{ ok: true; uploadId: string } | ApiFailure>;
  send: (uploadId: string, pages: { fileNo: number; pageNo: number; childId: string; bytes: ArrayBuffer }[]) => Promise<{ ok: true } | ApiFailure>;
  close: (uploadId: string) => Promise<{ ok: true } | ApiFailure>;
};

export type OutboxDeps = {
  now?: () => number;
  newId?: () => string;
  online?: () => boolean;
  holdMs?: number; // HOLD_MS unless a test says otherwise
};

// The waits after one failure, then two, and so on (ms); the last one repeats. A refusal that may pass by itself (AI
// marking switched off, the month's pages used, the store not answering) waits the longest.
export const BACKOFF_MS: readonly number[] = [2_000, 5_000, 15_000, 30_000, 60_000, 120_000, 300_000];
export const LONG_WAIT_MS = 300_000;
export const backoff = (tries: number): number => BACKOFF_MS[Math.min(Math.max(tries, 1), BACKOFF_MS.length) - 1];
// The child being scanned keeps their pages on the phone until the teacher moves on, so a page can be taken again; after
// this long with no new page they go anyway.
export const HOLD_MS = 60_000;
// An upload with nothing taken for this long, its children all moved on from, is closed.
export const IDLE_CLOSE_MS = 120_000;
// A few children share an upload: once it holds a reading job's pages, the next child starts another.
export const PAGES_PER_UPLOAD = PAGES_PER_READ;
// Refusals that may pass by themselves: tried again, slowly.
const WAITS: readonly string[] = ['ai_off', 'limit', 'storage', 'questions'];

export type OutboxCounts = { waiting: number; refused: number; byChild: Record<string, number> };
export type SyncResult = { sent: number; closed: number; failed: boolean };

const failureKind = (f: ApiFailure): 'retry' | 'wait' | 'refused' => (isRetryable(f.status) ? 'retry' : f.code && WAITS.includes(f.code) ? 'wait' : 'refused');

export class ScanOutbox {
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly online: () => boolean;
  private readonly holdMs: number;
  private running: Promise<SyncResult> | null = null;
  // A paper whose upload could not be started waits this long before asking again (kept while the screen is open).
  private readonly startWait = new Map<string, { tries: number; nextAt: number }>();

  constructor(
    private readonly store: OutboxStore,
    private readonly owner: string,
    private readonly api: OutboxApi,
    deps: OutboxDeps = {}
  ) {
    this.now = deps.now ?? (() => Date.now());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.online = deps.online ?? (() => true);
    this.holdMs = deps.holdMs ?? HOLD_MS;
  }

  private async mine<K extends OutboxKind>(kind: K): Promise<Rec[K][]> {
    return (await this.store.list(kind)).filter((r) => r.owner === this.owner);
  }

  // Another person's records on this phone (their session ended without signing out): removed, never sent or shown.
  async forgetOthers(): Promise<number> {
    let n = 0;
    for (const kind of ['page', 'batch', 'upload'] as const) {
      for (const r of await this.store.list(kind)) {
        if (r.owner !== this.owner) {
          await this.store.remove(kind, r.id);
          n++;
        }
      }
    }
    return n;
  }

  // A page taken for a child: into the child's file on this phone (the same one while its upload is open, so a teacher
  // who goes back to a child keeps one script), at once.
  async capture(paperId: string, childId: string, bytes: ArrayBuffer): Promise<OutboxPage> {
    const batches = await this.mine('batch');
    // Strictly after every page taken before, also across a restart of the app: pages go in the order they were taken.
    const clockNow = this.now();
    const now = Math.max(clockNow, ...batches.map((b) => b.lastAt + 1));
    const uploads = new Map((await this.mine('upload')).map((u) => [u.id, u]));
    // The child's file goes on while its upload takes more: not once it is closed, or closing after the teacher finished.
    const open = (b: OutboxBatch) => !b.uploadId || (uploads.has(b.uploadId) && !(uploads.get(b.uploadId)!.finish && b.done));
    let batch = batches.find((b) => b.paperId === paperId && b.childId === childId && open(b));
    if (batch && batch.nextSeq > MAX_PAGES_PER_FILE) batch = undefined;
    batch ??= { id: this.newId(), owner: this.owner, paperId, childId, uploadId: null, fileNo: null, nextSeq: 1, sent: 0, done: false, lastAt: now };
    const page: OutboxPage = { id: this.newId(), owner: this.owner, paperId, childId, batchId: batch.id, seq: batch.nextSeq, bytes, takenAt: now, tries: 0, nextAt: clockNow, refused: null };
    await this.store.put('page', page);
    await this.store.put('batch', { ...batch, nextSeq: batch.nextSeq + 1, done: false, lastAt: now });
    return page;
  }

  // The teacher moves on from a child (Next child, Skip, another child): their file may be closed once it is sent.
  async moveOn(paperId: string, childId: string): Promise<void> {
    for (const b of await this.mine('batch')) if (b.paperId === paperId && b.childId === childId && !b.done) await this.store.put('batch', { ...b, done: true });
  }

  // The teacher finished the class (or reached the end of the roll): every file is moved on from, and every upload
  // of the paper is closed as soon as its pages are in.
  async finish(paperId: string): Promise<void> {
    for (const b of await this.mine('batch')) if (b.paperId === paperId && !b.done) await this.store.put('batch', { ...b, done: true });
    for (const u of await this.mine('upload')) if (u.paperId === paperId) await this.store.put('upload', { ...u, finish: true, full: true });
  }

  // A page not sent yet, taken away by the teacher (a retake, or one the server refused).
  async removePage(id: string): Promise<void> {
    const page = (await this.mine('page')).find((p) => p.id === id);
    if (page) await this.store.remove('page', id);
  }

  async pages(paperId?: string): Promise<OutboxPage[]> {
    return (await this.mine('page')).filter((p) => !paperId || p.paperId === paperId).sort(inOrder);
  }

  async counts(paperId?: string): Promise<OutboxCounts> {
    const out: OutboxCounts = { waiting: 0, refused: 0, byChild: {} };
    for (const p of await this.pages(paperId)) {
      if (p.refused) out.refused++;
      else out.waiting++;
    }
    // Pages taken per child on this phone (sent and not), for "page 3 of this child".
    for (const b of await this.mine('batch')) if (!paperId || b.paperId === paperId) out.byChild[b.childId] = (out.byChild[b.childId] ?? 0) + b.nextSeq - 1;
    return out;
  }

  // One pass: files given uploads, pages sent, uploads closed. One at a time; never throws (a failure waits its turn).
  sync(): Promise<SyncResult> {
    if (!this.running) this.running = this.pass().finally(() => (this.running = null));
    return this.running;
  }

  private async pass(): Promise<SyncResult> {
    const result: SyncResult = { sent: 0, closed: 0, failed: false };
    if (!this.online()) return result;
    try {
      const pages = await this.mine('page');
      const batches = await this.mine('batch');
      const papers = [...new Set([...batches.map((b) => b.paperId), ...pages.map((p) => p.paperId)])];
      for (const paperId of papers) {
        const ok = await this.paperPass(paperId, result);
        if (!ok) {
          result.failed = true;
          break;
        }
      }
    } catch {
      result.failed = true;
    }
    return result;
  }

  // One paper: false when the network or the server failed (the pass stops and waits).
  private async paperPass(paperId: string, result: SyncResult): Promise<boolean> {
    const now = this.now();
    let batches = (await this.mine('batch')).filter((b) => b.paperId === paperId).sort((a, b) => a.lastAt - b.lastAt);
    const held = new Set(batches.filter((b) => !b.done && this.holdMs > 0 && now - b.lastAt < this.holdMs).map((b) => b.id));
    const ready = (p: OutboxPage) => !p.refused && p.nextAt <= now && !held.has(p.batchId);
    const pages = (await this.mine('page')).filter((p) => p.paperId === paperId);

    // 1. Files with pages to send and no upload yet: into the open upload, or a new one once it is full.
    for (const b of batches.filter((x) => !x.uploadId)) {
      if (!pages.some((p) => p.batchId === b.id && ready(p))) continue;
      const uploads = (await this.mine('upload')).filter((u) => u.paperId === paperId);
      let open = uploads.find((u) => !u.full);
      if (open) {
        const inIt = batches.filter((x) => x.uploadId === open!.id).reduce((n, x) => n + x.nextSeq - 1, 0);
        if (inIt >= PAGES_PER_UPLOAD) {
          await this.store.put('upload', { ...open, full: true });
          open = undefined;
        }
      }
      if (!open) {
        const wait = this.startWait.get(paperId);
        if (wait && wait.nextAt > now) return true;
        const started = await this.api.start(paperId, 1);
        if (!started.ok) {
          const kind = failureKind(started);
          if (kind === 'refused') {
            for (const p of pages.filter((x) => x.batchId === b.id && !x.refused)) await this.store.put('page', { ...p, refused: started.code ?? 'refused' });
            continue;
          }
          const tries = (wait?.tries ?? 0) + 1;
          this.startWait.set(paperId, { tries, nextAt: now + (kind === 'wait' ? LONG_WAIT_MS : backoff(tries)) });
          return false;
        }
        this.startWait.delete(paperId);
        open = { id: started.uploadId, owner: this.owner, paperId, files: 0, full: false, finish: false, tries: 0, nextAt: 0 };
      }
      const fileNo = open.files + 1;
      await this.store.put('upload', { ...open, files: fileNo });
      await this.store.put('batch', { ...b, uploadId: open.id, fileNo });
      batches = batches.map((x) => (x.id === b.id ? { ...x, uploadId: open!.id, fileNo } : x));
    }

    // 2. The pages, a request's worth at a time, upload by upload, in the order they were taken.
    const byBatch = new Map(batches.map((b) => [b.id, b]));
    const fileOf = (p: OutboxPage) => byBatch.get(p.batchId)!.fileNo as number;
    const toSend = pages.filter((p) => ready(p) && byBatch.get(p.batchId)?.uploadId).sort(inOrder);
    const confirmed = async (chunk: readonly OutboxPage[]) => {
      // Confirmed by the server: off the phone.
      for (const p of chunk) {
        await this.store.remove('page', p.id);
        const b = byBatch.get(p.batchId)!;
        byBatch.set(p.batchId, { ...b, sent: b.sent + 1 });
      }
      for (const id of new Set(chunk.map((p) => p.batchId))) await this.store.put('batch', byBatch.get(id)!);
      result.sent += chunk.length;
    };
    // A failed request: true when the pass goes on (a refusal of these pages only), false when it waits.
    const failed = async (chunk: readonly OutboxPage[], answer: ApiFailure): Promise<boolean> => {
      const kind = failureKind(answer);
      if (answer.code === 'upload_closed') {
        // Its upload was closed from elsewhere: the files with pages still here start again in a new upload (a person
        // then settles two scripts for one child, never a script moved); the rest are done with.
        const gone = byBatch.get(chunk[0].batchId)!.uploadId as string;
        await this.store.remove('upload', gone);
        const here = new Set((await this.mine('page')).map((p) => p.batchId));
        for (const b of [...byBatch.values()].filter((x) => x.uploadId === gone)) {
          if (here.has(b.id)) {
            byBatch.set(b.id, { ...b, uploadId: null, fileNo: null });
            await this.store.put('batch', byBatch.get(b.id)!);
          } else {
            byBatch.delete(b.id);
            await this.store.remove('batch', b.id);
          }
        }
        return true;
      }
      for (const p of chunk) {
        const tries = p.tries + 1;
        await this.store.put('page', kind === 'refused' ? { ...p, tries, refused: answer.code ?? 'refused' } : { ...p, tries, nextAt: now + (kind === 'wait' ? LONG_WAIT_MS : backoff(tries)) });
      }
      return kind === 'refused';
    };
    const send = (uploadId: string, chunk: readonly OutboxPage[]) => this.api.send(uploadId, chunk.map((p) => ({ fileNo: fileOf(p), pageNo: p.seq, childId: p.childId, bytes: p.bytes })));
    for (const uploadId of [...new Set(toSend.map((p) => byBatch.get(p.batchId)!.uploadId as string))]) {
      const batcher = new PageBatcher<{ page: OutboxPage; bytes: number }>(PAGES_PER_REQUEST, REQUEST_MAX_BYTES);
      const chunks: OutboxPage[][] = [];
      for (const p of toSend.filter((x) => byBatch.get(x.batchId)!.uploadId === uploadId)) {
        const full = batcher.add({ page: p, bytes: p.bytes.byteLength });
        if (full) chunks.push(full.map((x) => x.page));
      }
      const rest = batcher.flush();
      if (rest) chunks.push(rest.map((x) => x.page));
      for (const chunk of chunks) {
        const answer = await send(uploadId, chunk);
        if (answer.ok) {
          await confirmed(chunk);
          continue;
        }
        if (failureKind(answer) === 'refused' && answer.code !== 'upload_closed' && chunk.length > 1) {
          // Any one page of the request may be the one refused: each goes on its own.
          for (const p of chunk) {
            const one = await send(uploadId, [p]);
            if (one.ok) await confirmed([p]);
            else if (!(await failed([p], one))) return false;
          }
          continue;
        }
        if (!(await failed(chunk, answer))) return false;
      }
    }

    // 3. Uploads whose children are all moved on from and whose pages are all in: closed (the reading starts).
    const left = await this.mine('page');
    const lastTaken = Math.max(0, ...batches.map((b) => b.lastAt));
    for (const u of (await this.mine('upload')).filter((x) => x.paperId === paperId)) {
      const mine = [...byBatch.values()].filter((b) => b.uploadId === u.id);
      const settled = mine.every((b) => b.done && !left.some((p) => p.batchId === b.id && !p.refused));
      const due = u.full || u.finish || now - lastTaken >= IDLE_CLOSE_MS;
      if (!settled || !due || u.nextAt > now || mine.length === 0) continue;
      const closed = await this.api.close(u.id);
      if (!closed.ok) {
        const kind = failureKind(closed);
        if (kind !== 'refused') {
          await this.store.put('upload', { ...u, tries: u.tries + 1, nextAt: now + (kind === 'retry' ? backoff(u.tries + 1) : LONG_WAIT_MS) });
          return false;
        }
        // Refused for good (the class was published, the upload is gone): nothing more can go into it.
      }
      await this.store.remove('upload', u.id);
      for (const b of mine) {
        // A page the server refused stays for the teacher to see; its file has nowhere to go now.
        if (!left.some((p) => p.batchId === b.id)) await this.store.remove('batch', b.id);
      }
      result.closed++;
    }
    return true;
  }

  // Everything of this person's on the phone (their sign-out also deletes the whole outbox: clearScanOutbox).
  async clearMine(): Promise<void> {
    for (const kind of ['page', 'batch', 'upload'] as const) for (const r of await this.mine(kind)) await this.store.remove(kind, r.id);
  }
}

const inOrder = (a: OutboxPage, b: OutboxPage) => a.takenAt - b.takenAt || a.seq - b.seq;
