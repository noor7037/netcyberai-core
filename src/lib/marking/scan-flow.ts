import { MAX_PAGES_PER_FILE, PAGES_PER_REQUEST, type BubblePageResult, type BubbleReading, type MarkingOverview, type PageState, type RosterChild } from '@/lib/contracts/marking';
import { isRetryable } from './browser-plan';
import { backoff, type ApiFailure, type OutboxApi } from './outbox';
import { bucketCounts } from './review-view';

// The scan screen's rules (C230-AJ), free of the browser so they are tested (test/marking/scan-flow.test.ts): which
// child comes next in roll order, what each child's state is, the live progress strip's numbers, and the outbox's calls
// to the server. Nothing ranks a child: the order is always the roll's.

// Where a child stands on this scan: a script already on the server (done), marked absent, pages taken on this phone
// (scanning), skipped for now, or still to do.
export type ChildStatus = 'done' | 'absent' | 'scanning' | 'skipped' | 'todo';

export type ScanState = {
  withScript: ReadonlySet<string>; // children with a live script on the server
  absent: ReadonlySet<string>;
  onPhone: Readonly<Record<string, number>>; // pages taken on this phone, by child
  skipped: ReadonlySet<string>;
};

export function childStatus(childId: string, s: ScanState): ChildStatus {
  if (s.absent.has(childId)) return 'absent';
  if ((s.onPhone[childId] ?? 0) > 0) return 'scanning';
  if (s.withScript.has(childId)) return 'done';
  if (s.skipped.has(childId)) return 'skipped';
  return 'todo';
}

// The state from the server's overview and this phone's outbox.
export function scanState(o: Pick<MarkingOverview, 'sheets' | 'absent'>, onPhone: Readonly<Record<string, number>>, skipped: ReadonlySet<string>): ScanState {
  return {
    withScript: new Set(o.sheets.filter((s) => s.student && s.state !== 'set_aside').map((s) => s.student!.studentId)),
    absent: new Set(o.absent),
    onPhone,
    skipped,
  };
}

// The child to scan after `current`, in roll order: the next one still to do; after the last, the ones skipped, from
// the top. Null when every child is done, absent or scanned.
export function nextChild(roster: readonly RosterChild[], current: string | null, s: ScanState): RosterChild | null {
  const at = current ? roster.findIndex((c) => c.studentId === current) : -1;
  const after = [...roster.slice(at + 1), ...roster.slice(0, Math.max(0, at + 1))].filter((c) => c.studentId !== current);
  return after.find((c) => childStatus(c.studentId, s) === 'todo') ?? after.find((c) => childStatus(c.studentId, s) === 'skipped') ?? null;
}

// The first child to offer when the screen opens: the first still to do in roll order (or skipped), else none.
export const firstChild = (roster: readonly RosterChild[], s: ScanState): RosterChild | null =>
  roster.find((c) => childStatus(c.studentId, s) === 'todo') ?? roster.find((c) => childStatus(c.studentId, s) === 'skipped') ?? null;

// ---- the live progress strip --------------------------------------------------------------------------------------------

export type Strip = { onPhone: number; uploaded: number; read: number; marked: number; needsLook: number };

export function progressStrip(o: Pick<MarkingOverview, 'pages' | 'sheets'>, onPhone: number): Strip {
  const pages = o.pages as Record<PageState, number>;
  const kept = Object.entries(pages).reduce((n, [state, k]) => (state === 'duplicate' || state === 'removed' ? n : n + k), 0);
  return {
    onPhone,
    uploaded: kept,
    read: kept - (pages.new ?? 0),
    marked: o.sheets.filter((s) => s.state === 'marked' || s.state === 'approved').length,
    needsLook: bucketCounts(o.sheets).needs,
  };
}

// ---- the outbox's calls to the server -------------------------------------------------------------------------------------

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const failure = async (res: Response | null): Promise<ApiFailure> => {
  if (!res) return { ok: false, status: 0, code: null };
  const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
  return { ok: false, status: res.status, code: typeof body?.code === 'string' ? body.code : null };
};

// The app's own routes (src/app/api/app/marking/**): a by_child upload started, its pages sent as a form (each naming
// its child), and closed.
export function httpOutboxApi(fetchImpl: Fetch = (u, i) => fetch(u, i)): OutboxApi {
  const call = (url: string, init: RequestInit) => fetchImpl(url, { credentials: 'same-origin', ...init }).catch(() => null);
  return {
    async start(paperId, files) {
      const res = await call(`/api/app/marking/papers/${paperId}/uploads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'by_child', files }) });
      if (!res?.ok) return failure(res);
      const body = (await res.json().catch(() => null)) as { uploadId?: unknown } | null;
      return typeof body?.uploadId === 'string' ? { ok: true, uploadId: body.uploadId } : { ok: false, status: 0, code: null };
    },
    async send(uploadId, pages) {
      const form = new FormData();
      for (const p of pages) {
        form.append('fileNo', String(p.fileNo));
        form.append('pageNo', String(p.pageNo));
        form.append('childId', p.childId);
        form.append('page', new Blob([p.bytes], { type: 'image/jpeg' }), `page-${p.fileNo}-${p.pageNo}.jpg`);
      }
      const res = await call(`/api/app/marking/uploads/${uploadId}/pages`, { method: 'POST', body: form });
      return res?.ok ? { ok: true } : failure(res);
    },
    async close(uploadId) {
      const res = await call(`/api/app/marking/uploads/${uploadId}/close`, { method: 'POST' });
      return res?.ok ? { ok: true } : failure(res);
    },
  };
}

// ---- bubble sheets (C364) ---------------------------------------------------------------------------------------------------

// A bubble sheet is read on the phone the moment it is taken (src/lib/bubbles/read.ts, in the scan worker) and sent at
// once with what was read: its own printed number names the child, so there is no child to choose and nothing to hold
// back. The sheets wait here, in this screen's memory only, until the school confirms each one, and are let go then;
// nothing of them is written to the phone's storage (C230-AJ: pages are children's work). A failure of the network or the
// server is tried again after longer waits; a refusal (the questions changed, a sheet printed for other questions) is kept
// for the teacher to see. One upload takes up to MAX_PAGES_PER_FILE sheets, then the next begins.

export type BubbleApi = {
  start: (paperId: string) => Promise<{ ok: true; uploadId: string } | ApiFailure>;
  send: (uploadId: string, pages: { pageNo: number; bytes: ArrayBuffer; reading: BubbleReading }[]) => Promise<{ ok: true; pages: BubblePageResult[] } | ApiFailure>;
  close: (uploadId: string) => Promise<{ ok: true } | ApiFailure>;
};

export type BubbleItem = {
  id: number;
  reading: BubbleReading;
  bytes: ArrayBuffer | null; // let go once the school has it
  uploadId: string | null;
  pageNo: number | null;
  tries: number;
  nextAt: number;
  refused: string | null; // the server's refusal, kept for the teacher
  result: BubblePageResult | null;
};

export class BubbleSender {
  readonly items: BubbleItem[] = [];
  private uploadId: string | null = null;
  private nextPage = 1;
  private seq = 0;
  private busy = false;

  constructor(
    private readonly api: BubbleApi,
    private readonly paperId: string,
    private readonly now: () => number = () => Date.now()
  ) {}

  // A sheet just read, to send. A sheet number already taken on this screen is not taken twice (the camera may see one
  // sheet twice); null when it was.
  add(bytes: ArrayBuffer, reading: BubbleReading): BubbleItem | null {
    if (reading.sheetNo !== null && this.items.some((i) => i.reading.sheetNo === reading.sheetNo && !i.refused)) return null;
    const item: BubbleItem = { id: ++this.seq, reading, bytes, uploadId: null, pageNo: null, tries: 0, nextAt: 0, refused: null, result: null };
    this.items.push(item);
    return item;
  }

  // A refused sheet taken off this screen.
  remove(id: number): void {
    const at = this.items.findIndex((i) => i.id === id && (i.refused || i.result));
    if (at >= 0) this.items.splice(at, 1);
  }

  counts(): { waiting: number; refused: number; sent: number; flagged: number } {
    return {
      waiting: this.items.filter((i) => !i.result && !i.refused).length,
      refused: this.items.filter((i) => i.refused).length,
      sent: this.items.filter((i) => i.result).length,
      flagged: this.items.filter((i) => i.result?.flagged).length,
    };
  }

  // Sends what is due, a few sheets a request, in the order they were taken. Answers whether anything is left to send.
  async sync(): Promise<boolean> {
    if (this.busy) return this.counts().waiting > 0;
    this.busy = true;
    try {
      for (;;) {
        const due = this.items.filter((i) => !i.result && !i.refused && i.nextAt <= this.now());
        if (!due.length) break;
        if (!this.uploadId || this.nextPage > MAX_PAGES_PER_FILE) {
          if (this.uploadId) await this.api.close(this.uploadId);
          const started = await this.api.start(this.paperId);
          if (!started.ok) {
            this.wait(due, started);
            break;
          }
          this.uploadId = started.uploadId;
          this.nextPage = 1;
        }
        // Each sheet keeps the upload and number it was first sent under, so a retry is answered as the first try was.
        const batch = due.filter((i) => i.uploadId === null || i.uploadId === this.uploadId).slice(0, PAGES_PER_REQUEST);
        const stale = due.filter((i) => i.uploadId !== null && i.uploadId !== this.uploadId);
        for (const i of stale) (i.uploadId = null), (i.pageNo = null);
        if (!batch.length) continue;
        for (const i of batch) {
          if (i.pageNo === null) {
            i.uploadId = this.uploadId;
            i.pageNo = this.nextPage++;
          }
        }
        const r = await this.api.send(this.uploadId as string, batch.map((i) => ({ pageNo: i.pageNo as number, bytes: i.bytes as ArrayBuffer, reading: i.reading })));
        if (r.ok) {
          for (const i of batch) {
            i.result = r.pages.find((p) => p.pageNo === i.pageNo) ?? null;
            if (i.result) i.bytes = null;
            else this.wait([i], { ok: false, status: 0, code: null });
          }
          continue;
        }
        if (r.code === 'upload_closed' || r.code === 'too_many_pages') {
          // That upload is done with: the sheets go again under a new one.
          for (const i of batch) (i.uploadId = null), (i.pageNo = null);
          this.uploadId = null;
          continue;
        }
        this.wait(batch, r);
        if (!isRetryable(r.status)) continue;
        break;
      }
    } finally {
      this.busy = false;
    }
    return this.counts().waiting > 0;
  }

  // Everything sent: the upload closed. Answers whether all went.
  async finish(): Promise<boolean> {
    const left = await this.sync();
    if (left) return false;
    if (this.uploadId) {
      const r = await this.api.close(this.uploadId);
      if (!r.ok && isRetryable(r.status)) return false;
      this.uploadId = null;
    }
    return true;
  }

  private wait(items: BubbleItem[], f: ApiFailure) {
    for (const i of items) {
      if (isRetryable(f.status)) {
        i.tries += 1;
        i.nextAt = this.now() + backoff(i.tries);
      } else {
        i.refused = f.code ?? 'other';
        i.bytes = null;
      }
    }
  }
}

// The app's own routes (src/app/api/app/marking/**): a bubble upload started, its sheets sent with their readings, closed.
export function httpBubbleApi(fetchImpl: Fetch = (u, i) => fetch(u, i)): BubbleApi {
  const call = (url: string, init: RequestInit) => fetchImpl(url, { credentials: 'same-origin', ...init }).catch(() => null);
  return {
    async start(paperId) {
      const res = await call(`/api/app/marking/papers/${paperId}/bubbles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'upload', mode: 'combined', files: 1 }) });
      if (!res?.ok) return failure(res);
      const body = (await res.json().catch(() => null)) as { uploadId?: unknown } | null;
      return typeof body?.uploadId === 'string' ? { ok: true, uploadId: body.uploadId } : { ok: false, status: 0, code: null };
    },
    async send(uploadId, pages) {
      const form = new FormData();
      for (const p of pages) {
        form.append('fileNo', '1');
        form.append('pageNo', String(p.pageNo));
        form.append('reading', JSON.stringify(p.reading));
        form.append('page', new Blob([p.bytes], { type: 'image/jpeg' }), `sheet-${p.pageNo}.jpg`);
      }
      const res = await call(`/api/app/marking/uploads/${uploadId}/bubbles`, { method: 'POST', body: form });
      if (!res?.ok) return failure(res);
      const body = (await res.json().catch(() => null)) as { pages?: unknown } | null;
      return Array.isArray(body?.pages) ? { ok: true, pages: body.pages as BubblePageResult[] } : { ok: false, status: 0, code: null };
    },
    async close(uploadId) {
      const res = await call(`/api/app/marking/uploads/${uploadId}/close`, { method: 'POST' });
      return res?.ok ? { ok: true } : failure(res);
    },
  };
}
