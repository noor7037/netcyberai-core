import { describe, expect, it } from 'vitest';
import { PAGE_MAX_BYTES, PAGE_MAX_EDGE, PAGES_PER_REQUEST, type PageUploadResult } from '@/lib/contracts/marking';
import { ENCODE_ATTEMPTS, PageBatcher, REQUEST_MAX_BYTES, UploadError, fileKind, fitWithin, inReadingOrder, isRetryable, pdfRenderScale, tooSmall, withRetry } from '@/lib/marking/browser-plan';
import { BADGE_GAP, badgeKind, badgeText, cleanPlace, layoutBadges } from '@/lib/marking/margin';
import { FileFailure, initialStates, sendFiles, type FileState, type OpenedFile, type PageJob } from '@/lib/marking/upload-run';

// What the teacher's browser does before and while a class's scripts go up (C350), and where a mark sits in the margin of
// a scanned page (C347). No browser and no network here: the drawing and the sending are stood in for, so the sizes, the
// batches, the retries, the order of things and the placement are proven alone. Every name and number is made up.

describe('the size of a page picture', () => {
  it('keeps the longest side within the limit and the shape the page had', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1500, height: 2000 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1500, height: 2000 });
    expect(fitWithin(2480, 3508, 1000)).toEqual({ width: 707, height: 1000 });
  });
  it('never makes a small page larger', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(PAGE_MAX_EDGE, 100)).toEqual({ width: PAGE_MAX_EDGE, height: 100 });
  });
  it('never gives a side of nothing', () => {
    expect(fitWithin(20000, 3)).toEqual({ width: 2000, height: 1 });
    expect(fitWithin(0, 0)).toEqual({ width: 1, height: 1 });
  });
  it('a picture whose longest side is under the floor is too small to read', () => {
    expect(tooSmall(150, 190)).toBe(true);
    expect(tooSmall(100, 800)).toBe(false);
    expect(tooSmall(200, 200)).toBe(false);
  });
  it('a PDF page is drawn so its longest side is the limit, within a floor and a ceiling', () => {
    expect(pdfRenderScale(595, 842)).toBeCloseTo(2000 / 842, 5);
    expect(pdfRenderScale(2480, 3508)).toBeCloseTo(2000 / 3508, 5);
    expect(pdfRenderScale(1, 1)).toBe(6);
    expect(pdfRenderScale(100000, 100000)).toBe(0.05);
    expect(pdfRenderScale(0, 0)).toBe(1);
  });
  it('squeezes a page that is too heavy in steps: quality first, then a smaller picture, down to the last resort', () => {
    expect(ENCODE_ATTEMPTS[0]).toEqual({ quality: 0.85, shrink: 1 });
    for (let i = 1; i < ENCODE_ATTEMPTS.length; i++) {
      expect(ENCODE_ATTEMPTS[i].quality).toBeLessThan(ENCODE_ATTEMPTS[i - 1].quality);
      expect(ENCODE_ATTEMPTS[i].shrink).toBeLessThanOrEqual(ENCODE_ATTEMPTS[i - 1].shrink);
    }
    expect(ENCODE_ATTEMPTS[ENCODE_ATTEMPTS.length - 1].shrink).toBeGreaterThanOrEqual(0.5);
  });
});

describe('the files a person picks', () => {
  it('tells a PDF from a photo by its type, else by its name', () => {
    expect(fileKind({ name: 'scan.pdf', type: 'application/pdf' })).toBe('pdf');
    expect(fileKind({ name: 'SCAN.PDF', type: '' })).toBe('pdf');
    expect(fileKind({ name: 'IMG_1.jpg', type: 'image/jpeg' })).toBe('image');
    expect(fileKind({ name: 'IMG_1.HEIC', type: '' })).toBe('image');
    expect(fileKind({ name: 'notes.docx', type: 'application/msword' })).toBeNull();
  });
  it('puts photos in the order they were taken: 2 before 10', () => {
    const names = inReadingOrder([{ name: 'IMG_10.jpg' }, { name: 'IMG_2.jpg' }, { name: 'IMG_1.jpg' }]).map((f) => f.name);
    expect(names).toEqual(['IMG_1.jpg', 'IMG_2.jpg', 'IMG_10.jpg']);
  });
});

describe('sending pages a few at a time', () => {
  const page = (bytes: number) => ({ bytes });
  it('hands back a batch of the request limit, and the rest at the end', () => {
    const b = new PageBatcher<{ bytes: number }>();
    const out: number[] = [];
    for (let i = 0; i < 14; i++) {
      const full = b.add(page(300_000));
      if (full) out.push(full.length);
    }
    const rest = b.flush();
    if (rest) out.push(rest.length);
    expect(out).toEqual([PAGES_PER_REQUEST, PAGES_PER_REQUEST, 2]);
    expect(b.pending).toBe(0);
    expect(b.flush()).toBeNull();
  });
  it('keeps a request under the host’s body limit even when pages are heavy', () => {
    const b = new PageBatcher<{ bytes: number }>();
    const sizes: number[] = [];
    for (let i = 0; i < 9; i++) {
      const full = b.add(page(PAGE_MAX_BYTES));
      if (full) sizes.push(full.reduce((s, p) => s + p.bytes, 0));
    }
    const rest = b.flush();
    if (rest) sizes.push(rest.reduce((s, p) => s + p.bytes, 0));
    expect(Math.max(...sizes)).toBeLessThanOrEqual(REQUEST_MAX_BYTES);
    expect(sizes.reduce((s, n) => s + n, 0)).toBe(9 * PAGE_MAX_BYTES);
    // A page alone always fits.
    expect(PAGE_MAX_BYTES).toBeLessThanOrEqual(REQUEST_MAX_BYTES);
  });
});

describe('trying a request again', () => {
  const wait = () => {
    const waited: number[] = [];
    return { waited, sleep: async (ms: number) => void waited.push(ms) };
  };
  it('tries the network and the server’s own failures again, and a refusal not at all', () => {
    for (const s of [0, 408, 429, 500, 502, 503]) expect(isRetryable(s), String(s)).toBe(true);
    for (const s of [400, 401, 403, 404, 409, 413, 422]) expect(isRetryable(s), String(s)).toBe(false);
  });
  it('goes on after a failure and gives the answer when it comes', async () => {
    const w = wait();
    let calls = 0;
    const got = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new UploadError(503);
        return 'ok';
      },
      { sleep: w.sleep }
    );
    expect(got).toBe('ok');
    expect(calls).toBe(3);
    expect(w.waited).toEqual([800, 2500]);
  });
  it('gives up after the last wait, and at once for a refusal', async () => {
    const w = wait();
    let calls = 0;
    await expect(withRetry(async () => { calls += 1; throw new UploadError(0); }, { sleep: w.sleep })).rejects.toMatchObject({ status: 0 });
    expect(calls).toBe(3);
    calls = 0;
    await expect(withRetry(async () => { calls += 1; throw new UploadError(413); }, { sleep: w.sleep })).rejects.toMatchObject({ status: 413 });
    expect(calls).toBe(1);
  });
  it('treats a network failure that is not ours (a thrown TypeError) as the network', async () => {
    const w = wait();
    let calls = 0;
    const got = await withRetry(async () => { calls += 1; if (calls === 1) throw new TypeError('Failed to fetch'); return calls; }, { sleep: w.sleep });
    expect(got).toBe(2);
  });
  it('does not wait when the teacher has stopped', async () => {
    const w = wait();
    await expect(withRetry(async () => { throw new UploadError(503); }, { sleep: w.sleep, cancelled: () => true })).rejects.toBeInstanceOf(UploadError);
    expect(w.waited).toEqual([]);
  });
});

// ---- the whole send, with the drawing and the network stood in for --------------------------------------------

const blob = (n: number) => new Blob([new Uint8Array(n)]);
function opened(total: number, made: { n: number }, bytes = 200_000): OpenedFile & { closed: boolean } {
  const o = {
    total,
    closed: false,
    close() {
      o.closed = true;
    },
    pages: (async function* () {
      for (let i = 1; i <= total; i++) {
        made.n += 1;
        yield { pageNo: i, blob: blob(bytes) };
      }
    })(),
  };
  return o;
}

describe('sending a class’s files', () => {
  const files = [
    { name: 'a.pdf', size: 10 },
    { name: 'b.pdf', size: 10 },
    { name: 'c.pdf', size: 10 },
  ];
  const wrap = (states: FileState[]) => files.map((file, i) => ({ file, state: states[i] }));
  const ok = (batch: PageJob[]): PageUploadResult => ({ pages: batch.map((p) => ({ fileNo: p.fileNo, pageNo: p.pageNo, pageId: `p${p.fileNo}-${p.pageNo}`, duplicate: false })) });

  it('sends each file’s pages in batches in order, numbering files from 1 and pages from 1', async () => {
    const states = initialStates(files);
    const batches: { fileNo: number; pages: number[] }[] = [];
    const made = { n: 0 };
    const sizes = [14, 3, 7];
    const handles: ReturnType<typeof opened>[] = [];
    const r = await sendFiles(
      wrap(states),
      {
        open: async (f) => {
          const h = opened(sizes[files.indexOf(f)], made);
          handles.push(h);
          return h;
        },
        send: async (batch) => {
          batches.push({ fileNo: batch[0].fileNo, pages: batch.map((p) => p.pageNo) });
          return ok(batch);
        },
      },
      () => undefined
    );
    expect(batches.map((b) => [b.fileNo, b.pages.length])).toEqual([[1, 6], [1, 6], [1, 2], [2, 3], [3, 6], [3, 1]]);
    expect(batches[0].pages).toEqual([1, 2, 3, 4, 5, 6]);
    expect(states.map((s) => [s.status, s.pagesTotal, s.pagesDone])).toEqual([['done', 14, 14], ['done', 3, 3], ['done', 7, 7]]);
    expect(r.sent).toBe(24);
    expect(handles.every((h) => h.closed)).toBe(true);
  });

  it('draws a page only when its turn comes: never more than a request’s worth is held at once', async () => {
    const states = initialStates(files.slice(0, 1));
    const made = { n: 0 };
    let sent = 0;
    let mostHeld = 0;
    await sendFiles(
      wrap(states).slice(0, 1),
      {
        open: async () => opened(40, made),
        send: async (batch) => {
          mostHeld = Math.max(mostHeld, made.n - sent);
          sent += batch.length;
          return ok(batch);
        },
      },
      () => undefined
    );
    expect(sent).toBe(40);
    expect(mostHeld).toBeLessThanOrEqual(PAGES_PER_REQUEST + 1);
  });

  it('tries a failed request again and counts the pages the server already had', async () => {
    const states = initialStates(files.slice(0, 1));
    let calls = 0;
    await sendFiles(
      wrap(states).slice(0, 1),
      {
        open: async () => opened(4, { n: 0 }),
        send: async (batch) => {
          calls += 1;
          if (calls === 1) throw new UploadError(503);
          return { pages: batch.map((p, i) => ({ fileNo: p.fileNo, pageNo: p.pageNo, pageId: `x${p.pageNo}`, duplicate: i === 0 })) };
        },
        sleep: async () => undefined,
      },
      () => undefined
    );
    expect(calls).toBe(2);
    expect(states[0]).toMatchObject({ status: 'done', pagesDone: 4, duplicates: 1, error: null });
  });

  it('marks a file failed and goes on to the next: one bad file does not stop the class', async () => {
    const states = initialStates(files);
    const seen: number[] = [];
    await sendFiles(
      wrap(states),
      {
        open: async (f) => {
          if (f.name === 'a.pdf') throw new FileFailure('unreadable');
          return opened(2, { n: 0 });
        },
        send: async (batch) => {
          seen.push(batch[0].fileNo);
          if (batch[0].fileNo === 2) throw new UploadError(413);
          return ok(batch);
        },
        sleep: async () => undefined,
      },
      () => undefined
    );
    expect(states.map((s) => [s.status, s.error])).toEqual([['failed', 'unreadable'], ['failed', 'page_too_big'], ['done', null]]);
    expect(seen).toEqual([2, 3]);
  });

  it('refuses a file with too many pages, and an upload whose pages in all are too many, before sending any', async () => {
    const states = initialStates(files.slice(0, 2));
    const sent: number[] = [];
    await sendFiles(
      wrap(states).slice(0, 2),
      { open: async () => opened(201, { n: 0 }), send: async (b) => (sent.push(b.length), ok(b)) },
      () => undefined
    );
    expect(states[0].error).toBe('too_many_pages');
    expect(sent).toEqual([]);
    const more = initialStates(files.slice(0, 1));
    await sendFiles(wrap(more).slice(0, 1), { open: async () => opened(150, { n: 0 }), send: async (b) => ok(b) }, () => undefined, 1400);
    expect(more[0].error).toBe('upload_total');
  });

  it('a network that stays down fails the file as a network problem, ready to try again', async () => {
    const states = initialStates(files.slice(0, 1));
    await sendFiles(
      wrap(states).slice(0, 1),
      { open: async () => opened(3, { n: 0 }), send: async () => { throw new UploadError(0); }, sleep: async () => undefined },
      () => undefined
    );
    expect(states[0]).toMatchObject({ status: 'failed', error: 'network', pagesDone: 0 });
  });

  it('stops when the teacher stops, leaving the rest waiting', async () => {
    const states = initialStates(files);
    let stop = false;
    await sendFiles(
      wrap(states),
      { open: async () => opened(3, { n: 0 }), send: async (b) => ((stop = true), ok(b)), cancelled: () => stop },
      () => undefined
    );
    expect(states.map((s) => s.status)).toEqual(['waiting', 'waiting', 'waiting']);
  });

  it('tells the screen after every step', async () => {
    const states = initialStates(files.slice(0, 1));
    const seen: string[] = [];
    await sendFiles(wrap(states).slice(0, 1), { open: async () => opened(7, { n: 0 }), send: async (b) => ok(b) }, () => seen.push(`${states[0].status}:${states[0].pagesDone}`));
    expect(seen).toEqual(['reading:0', 'sending:0', 'sending:6', 'sending:7', 'done:7']);
  });
});

// ---- the margin -----------------------------------------------------------------------------------------------

describe('a mark in the margin of the page', () => {
  const q = (questionId: string, yFrom: number, yTo: number, final: number | null, max: number, counted = true, pageId = 'pg1') => ({ questionId, place: { pageId, yFrom, yTo }, final, max, counted });

  it('sits at the answer’s place on its page, as a share of the page’s height', () => {
    const [b] = layoutBadges([q('q1', 0.16, 0.26, 2, 2)]);
    expect(b).toMatchObject({ questionId: 'q1', pageId: 'pg1', slot: 0, kind: 'full', text: '2/2' });
    expect(b.top).toBeCloseTo(16, 6);
    expect(b.height).toBeCloseTo(10, 6);
  });
  it('is coloured full, part or nothing, grey for a question internal choice left out, and plain when there is no mark yet', () => {
    expect(badgeKind(4, 4, true)).toBe('full');
    expect(badgeKind(3, 4, true)).toBe('part');
    expect(badgeKind(0.5, 4, true)).toBe('part');
    expect(badgeKind(0, 4, true)).toBe('none');
    expect(badgeKind(null, 4, true)).toBe('unmarked');
    expect(badgeKind(4, 4, false)).toBe('out');
    expect(badgeKind(null, 4, false)).toBe('out');
  });
  it('says the mark as a fraction of the question: "3/4", "3.5/4", "–/4" before a mark', () => {
    expect(badgeText(3, 4)).toBe('3/4');
    expect(badgeText(3.5, 4)).toBe('3.5/4');
    expect(badgeText(null, 4)).toBe('–/4');
    expect(badgeText(0.1 + 0.2, 1)).toBe('0.3/1');
  });
  it('keeps a place within the page and the right way up; a place that is not one is not drawn', () => {
    expect(cleanPlace({ pageId: 'p', yFrom: 0.5, yTo: 0.3 })).toEqual({ pageId: 'p', yFrom: 0.3, yTo: 0.5 });
    expect(cleanPlace({ pageId: 'p', yFrom: -0.2, yTo: 1.4 })).toEqual({ pageId: 'p', yFrom: 0, yTo: 1 });
    expect(cleanPlace({ pageId: 'p', yFrom: Number.NaN, yTo: 0.4 })).toBeNull();
    expect(cleanPlace(null)).toBeNull();
    expect(layoutBadges([{ questionId: 'x', place: null, final: 1, max: 2, counted: true }])).toEqual([]);
  });
  it('puts a second answer for the same place one column further out, so neither covers the other', () => {
    // 6(a) and 6(b) are of one place on the page; internal choice leaves one of them out.
    const out = layoutBadges([q('a', 0.28, 0.58, 8, 10), q('b', 0.28, 0.58, 3, 10, false)]);
    expect(out.map((b) => [b.questionId, b.slot, b.kind])).toEqual([['a', 0, 'part'], ['b', 1, 'out']]);
  });
  it('lets a badge go back to the first column once the one above has cleared it', () => {
    const out = layoutBadges([q('a', 0.1, 0.2, 1, 2), q('b', 0.1, 0.2, 1, 2), q('c', 0.1 + BADGE_GAP + 0.001, 0.4, 1, 2), q('d', 0.7, 0.8, 1, 2)]);
    const slot = Object.fromEntries(out.map((b) => [b.questionId, b.slot]));
    expect(slot).toEqual({ a: 0, b: 1, c: 0, d: 0 });
  });
  it('keeps the pages apart: the same height on two pages is not a clash', () => {
    const out = layoutBadges([q('a', 0.2, 0.3, 1, 2, true, 'pg1'), q('b', 0.2, 0.3, 1, 2, true, 'pg2')]);
    expect(out.map((b) => b.slot)).toEqual([0, 0]);
    expect(out.map((b) => b.pageId).sort()).toEqual(['pg1', 'pg2']);
  });
});
