import type { MarkingOverview, PageState, RosterChild } from '@/lib/contracts/marking';
import { bucketCounts } from './review-view';
import type { ApiFailure, OutboxApi } from './outbox';

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
