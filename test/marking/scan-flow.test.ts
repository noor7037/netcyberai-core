import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { MarkingOverview, RosterChild, SheetRow } from '@/lib/contracts/marking';
import { assignClaimed, claimAgrees, claimedGroups, type ClaimedPage } from '@/lib/marking/matching';
import { childStatus, firstChild, httpOutboxApi, nextChild, progressStrip, scanState } from '@/lib/marking/scan-flow';

// The scan screen's rules (C230-AJ): roll order, a child's state, the progress strip, the outbox's calls; the claim
// checked against what the sheet reads; and which pages the service worker may send in the background.

const kid = (n: number, name: string, seatNo: string | null = null): RosterChild => ({ studentId: `k${n}`, name, rollNo: String(n), seatNo });
const ROSTER = [kid(1, 'Meera Sharma'), kid(2, 'Zoya Khan'), kid(3, 'Dev Patel'), kid(4, 'Anaya Rao')];
const sheet = (studentId: string, state: SheetRow['state'] = 'marked', flags: SheetRow['flags'] = []): SheetRow => ({
  sheetId: `s-${studentId}`,
  student: ROSTER.find((c) => c.studentId === studentId) ?? null,
  matchedBy: 'teacher',
  state,
  flags,
  failure: null,
  pages: 2,
  total: null,
  max: 10,
  confidence: null,
  approvedAt: null,
});

describe('roll order on the scan screen', () => {
  it('the first child still to do, then the next after the current; skipped ones come at the end; none left is null', () => {
    const s = scanState({ sheets: [sheet('k1')], absent: ['k3'] }, { k2: 2 }, new Set());
    expect(['k1', 'k2', 'k3', 'k4'].map((id) => childStatus(id, s))).toEqual(['done', 'scanning', 'absent', 'todo']);
    expect(firstChild(ROSTER, s)?.studentId).toBe('k4');
    expect(nextChild(ROSTER, 'k2', s)?.studentId).toBe('k4');
    const skipped = scanState({ sheets: [sheet('k1')], absent: ['k3'] }, { k2: 2 }, new Set(['k4']));
    expect(nextChild(ROSTER, 'k2', skipped)?.studentId).toBe('k4');
    expect(nextChild(ROSTER, 'k4', skipped)).toBeNull();
    // A script set aside is not a script: that child is to do again.
    expect(childStatus('k1', scanState({ sheets: [sheet('k1', 'set_aside')], absent: [] }, {}, new Set()))).toBe('todo');
  });
});

describe('the live progress strip', () => {
  it('pages on the phone, uploaded (duplicates and pages taken out left out), read, scripts marked, and those needing a look', () => {
    const o = {
      pages: { new: 3, read: 10, blank: 1, unreadable: 1, duplicate: 2, failed: 0, not_answer: 1, removed: 1 },
      sheets: [sheet('k1'), sheet('k2', 'approved'), sheet('k3', 'marked', ['mismatch']), sheet('k4', 'waiting')],
    } as Pick<MarkingOverview, 'pages' | 'sheets'>;
    expect(progressStrip(o, 4)).toEqual({ onPhone: 4, uploaded: 16, read: 13, marked: 3, needsLook: 1 });
  });
});

describe('the outbox’s calls to the app’s routes', () => {
  it('a by_child upload, its pages each naming the child, and closing; a refusal carries its status and code', async () => {
    const seen: { url: string; method: string; body: unknown }[] = [];
    const api = httpOutboxApi(async (url, init) => {
      seen.push({ url, method: String(init?.method), body: init?.body instanceof FormData ? [...init.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : 'file']) : init?.body ? JSON.parse(String(init.body)) : null });
      if (url.endsWith('/uploads')) return new Response(JSON.stringify({ uploadId: 'u1' }), { status: 201 });
      if (url.endsWith('/close')) return new Response(JSON.stringify({ code: 'ai_off' }), { status: 409 });
      return new Response(JSON.stringify({ pages: [] }), { status: 200 });
    });
    expect(await api.start('p1', 1)).toEqual({ ok: true, uploadId: 'u1' });
    expect(await api.send('u1', [{ fileNo: 2, pageNo: 1, childId: 'k2', bytes: new Uint8Array([0xff, 0xd8]).buffer }])).toEqual({ ok: true });
    expect(await api.close('u1')).toEqual({ ok: false, status: 409, code: 'ai_off' });
    expect(seen[0]).toEqual({ url: '/api/app/marking/papers/p1/uploads', method: 'POST', body: { mode: 'by_child', files: 1 } });
    expect(seen[1].body).toEqual([['fileNo', '2'], ['pageNo', '1'], ['childId', 'k2'], ['page', 'file']]);
    const offline = httpOutboxApi(async () => {
      throw new TypeError('network');
    });
    expect(await offline.send('u1', [])).toEqual({ ok: false, status: 0, code: null });
  });
});

describe('the claim, checked against what the sheet reads', () => {
  it('agrees, disagrees by roll number, exam number or a plainly different name, or reads nothing', () => {
    const zoya = { ...kid(2, 'Zoya Khan', 'HY-07') };
    expect(claimAgrees({ name: 'Zoya Khan', rollNo: '02', seatNo: null }, zoya)).toBe('agrees');
    expect(claimAgrees({ name: null, rollNo: '3', seatNo: null }, zoya)).toBe('mismatch');
    expect(claimAgrees({ name: null, rollNo: null, seatNo: 'HY-08' }, zoya)).toBe('mismatch');
    expect(claimAgrees({ name: 'Dev Patel', rollNo: null, seatNo: null }, zoya)).toBe('mismatch');
    expect(claimAgrees({ name: 'Z. Khan', rollNo: null, seatNo: null }, zoya)).toBe('agrees');
    expect(claimAgrees(null, zoya)).toBe('nothing');
  });

  it('each file is one script, its child the claim; another child’s roll number on any page flags it; a child scanned twice waits', () => {
    const read = (rollNo: string | null, pageNumber: number) => ({ firstPage: rollNo !== null, name: null, rollNo, seatNo: null, classSection: null, pageNumber, blank: false, legible: true, answerPage: true, idDocument: false });
    const pages: ClaimedPage[] = [
      { pageId: 'a1', fileNo: 1, pageNo: 1, state: 'read', reading: read('1', 1), claimed: 'k1' },
      { pageId: 'a2', fileNo: 1, pageNo: 2, state: 'read', reading: read(null, 2), claimed: 'k1' },
      { pageId: 'b1', fileNo: 2, pageNo: 1, state: 'read', reading: read(null, 1), claimed: 'k2' },
      { pageId: 'b2', fileNo: 2, pageNo: 2, state: 'read', reading: read('3', 1), claimed: 'k2' }, // another child's first page
      { pageId: 'c1', fileNo: 3, pageNo: 1, state: 'duplicate', reading: null, claimed: 'k4' },
      { pageId: 'd1', fileNo: 4, pageNo: 1, state: 'read', reading: read(null, 1), claimed: 'k1' },
    ];
    const files = claimedGroups(pages);
    expect(files.map((f) => [f.fileNo, f.claimed, f.pages.map((p) => p.pageId)])).toEqual([[1, 'k1', ['a1', 'a2']], [2, 'k2', ['b1', 'b2']], [4, 'k1', ['d1']]]);
    const out = assignClaimed(files, ROSTER, new Set(['k4']));
    // Meera's two files: both wait, with Meera offered (one live script a child).
    expect(out[0].match).toMatchObject({ studentId: null, candidates: ['k1'] });
    expect(out[0].match.flags).toContain('two_scripts');
    // Zoya's file reads Dev's roll number on its second page: flagged, and still Zoya's.
    expect(out[1].match).toMatchObject({ studentId: 'k2', by: 'teacher' });
    expect(out[1].match.flags).toContain('mismatch');
    // A child no longer a candidate: a person chooses.
    expect(assignClaimed([{ fileNo: 9, claimed: 'gone', pages: [pages[0]] }], ROSTER, new Set())[0].match).toMatchObject({ studentId: null, flags: ['identity'] });
  });
});

describe('the service worker sends only what may go (public/sw.js)', () => {
  const sw = createRequire(import.meta.url)(path.join(__dirname, '../../public/sw.js')) as {
    scanPagesToSend: (pages: unknown[], batches: unknown[], owner: string | null, now: number) => { page: { id: string } }[];
  };
  it('the owner’s pages, due, not refused, whose file has its upload, in the order taken', () => {
    const batches = [
      { id: 'b1', owner: 'me', uploadId: 'u1', fileNo: 1 },
      { id: 'b2', owner: 'me', uploadId: null, fileNo: null },
      { id: 'b3', owner: 'other', uploadId: 'u2', fileNo: 1 },
    ];
    const p = (id: string, batchId: string, owner: string, takenAt: number, extra: Record<string, unknown> = {}) => ({ id, batchId, owner, takenAt, seq: 1, nextAt: 0, refused: null, ...extra });
    const pages = [p('late', 'b1', 'me', 20), p('early', 'b1', 'me', 10), p('no-upload', 'b2', 'me', 5), p('theirs', 'b3', 'other', 1), p('refused', 'b1', 'me', 2, { refused: 'not_a_page' }), p('waiting', 'b1', 'me', 3, { nextAt: 999 })];
    expect(sw.scanPagesToSend(pages, batches, 'me', 100).map((x) => x.page.id)).toEqual(['early', 'late']);
    expect(sw.scanPagesToSend(pages, batches, null, 100)).toEqual([]);
  });
});
