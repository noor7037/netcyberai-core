import { describe, expect, it } from 'vitest';
import type { BubblePageResult, BubbleReading } from '@/lib/contracts/marking';
import { ruleMarks } from '@/lib/bubbles/apply';
import { BubbleSender, httpBubbleApi, type BubbleApi } from '@/lib/marking/scan-flow';
import { clampMark, parseMark, stepMark } from '@/lib/marking/review-view';

// The phone's bubble sender (C364): sheets sent at once with what was read, a few a request, tried again after a network
// failure, kept for the teacher when refused, let go once the school has them; the same sheet number is not taken twice.
// And the rules of a read sheet's marks, and a teacher's mark below nothing where the paper takes marks off.

const reading = (sheetNo: number | null, extra: Partial<BubbleReading> = {}): BubbleReading => ({ layout: 'v1-4-0123abcd', sheetNo, roll: null, rollUnclear: false, answers: {}, unclear: [], multiple: [], confidence: 0.95, ...extra });

function fakeApi(script: ('ok' | 'network' | 'layout' | 'upload_closed')[]) {
  const calls: { kind: string; uploadId?: string; pages?: number[] }[] = [];
  let uploads = 0;
  const api: BubbleApi = {
    async start() {
      calls.push({ kind: 'start' });
      return { ok: true, uploadId: `u${++uploads}` };
    },
    async send(uploadId, pages) {
      calls.push({ kind: 'send', uploadId, pages: pages.map((p) => p.pageNo) });
      const next = script.shift() ?? 'ok';
      if (next === 'network') return { ok: false, status: 0, code: null };
      if (next === 'layout') return { ok: false, status: 409, code: 'layout' };
      if (next === 'upload_closed') return { ok: false, status: 409, code: 'upload_closed' };
      return { ok: true, pages: pages.map((p): BubblePageResult => ({ fileNo: 1, pageNo: p.pageNo, pageId: `${uploadId}-${p.pageNo}`, outcome: 'script', sheetNo: p.reading.sheetNo, child: null, flagged: false })) };
    },
    async close(uploadId) {
      calls.push({ kind: 'close', uploadId });
      return { ok: true };
    },
  };
  return { api, calls };
}

describe('the phone’s bubble sender (C364)', () => {
  it('sends at once, a few a request, and lets each sheet go once the school has it', async () => {
    const { api, calls } = fakeApi([]);
    const s = new BubbleSender(api, 'p1', () => 0);
    for (let n = 1; n <= 8; n++) s.add(new ArrayBuffer(10), reading(n));
    expect(await s.sync()).toBe(false);
    expect(calls).toEqual([{ kind: 'start' }, { kind: 'send', uploadId: 'u1', pages: [1, 2, 3, 4, 5, 6] }, { kind: 'send', uploadId: 'u1', pages: [7, 8] }]);
    expect(s.items.every((i) => i.result && i.bytes === null)).toBe(true);
    expect(s.counts()).toEqual({ waiting: 0, refused: 0, sent: 8, flagged: 0 });
    expect(await s.finish()).toBe(true);
    expect(calls.at(-1)).toEqual({ kind: 'close', uploadId: 'u1' });
  });

  it('the same sheet number is taken once; a sheet with no number read is taken each time', () => {
    const s = new BubbleSender(fakeApi([]).api, 'p1', () => 0);
    expect(s.add(new ArrayBuffer(1), reading(4))).not.toBeNull();
    expect(s.add(new ArrayBuffer(1), reading(4))).toBeNull();
    expect(s.add(new ArrayBuffer(1), reading(null))).not.toBeNull();
    expect(s.add(new ArrayBuffer(1), reading(null))).not.toBeNull();
  });

  it('a network failure waits and goes again under the same number; a refusal is kept for the teacher', async () => {
    let now = 0;
    const { api, calls } = fakeApi(['network', 'ok', 'layout']);
    const s = new BubbleSender(api, 'p1', () => now);
    s.add(new ArrayBuffer(1), reading(1));
    expect(await s.sync()).toBe(true);
    expect(s.items[0]).toMatchObject({ tries: 1, refused: null, result: null, pageNo: 1 });
    expect(await s.sync()).toBe(true); // not yet due
    now = 10_000;
    expect(await s.sync()).toBe(false);
    expect(calls.filter((c) => c.kind === 'send').map((c) => c.pages)).toEqual([[1], [1]]);
    s.add(new ArrayBuffer(1), reading(2));
    await s.sync();
    expect(s.items[1]).toMatchObject({ refused: 'layout', bytes: null });
    expect(s.counts()).toMatchObject({ refused: 1, sent: 1 });
    s.remove(s.items[1].id);
    expect(s.items).toHaveLength(1);
  });

  it('a closed upload: the sheets go again under a new one', async () => {
    const { api, calls } = fakeApi(['upload_closed']);
    const s = new BubbleSender(api, 'p1', () => 0);
    s.add(new ArrayBuffer(1), reading(1));
    await s.sync();
    expect(calls.map((c) => c.kind)).toEqual(['start', 'send', 'start', 'send']);
    expect(s.items[0].result?.pageId).toBe('u2-1');
  });

  it('the routes it calls', async () => {
    const seen: { url: string; body: unknown }[] = [];
    const api = httpBubbleApi(async (url, init) => {
      seen.push({ url, body: init?.body instanceof FormData ? [...(init.body as FormData).keys()] : JSON.parse(String(init?.body ?? 'null')) });
      return new Response(JSON.stringify(url.endsWith('/bubbles') && url.includes('/papers/') ? { uploadId: 'u9' } : { pages: [] }), { status: url.includes('/papers/') ? 201 : 200 });
    });
    expect(await api.start('p1')).toEqual({ ok: true, uploadId: 'u9' });
    expect(await api.send('u9', [{ pageNo: 1, bytes: new ArrayBuffer(3), reading: reading(1) }])).toEqual({ ok: true, pages: [] });
    expect(seen).toEqual([
      { url: '/api/app/marking/papers/p1/bubbles', body: { action: 'upload', mode: 'combined', files: 1 } },
      { url: '/api/app/marking/uploads/u9/bubbles', body: ['fileNo', 'pageNo', 'reading', 'page'] },
    ]);
  });
});

describe('a read sheet’s marks by rules (C364)', () => {
  const q = (label: string, keys: string[], correct: string[] | null) =>
    ({ questionId: `q${label}`, label, kind: 'objective', maxMarks: 2, position: Number(label), options: keys.map((k) => ({ key: k, text: k })), correct: correct ? { keys: correct } : null }) as never;
  it('right, wrong, blank, unclear, two marks, choose-all and no key', () => {
    const out = ruleMarks(
      [q('1', ['A', 'B', 'C'], ['B']), q('2', ['A', 'B'], ['A']), q('3', ['A', 'B'], ['A']), q('4', ['A', 'B'], ['A']), q('5', ['A', 'B', 'C'], ['A']), q('6', ['A', 'B', 'C'], ['A', 'C']), q('7', ['A', 'B'], null)],
      { answers: { '1': ['B'], '2': ['B'], '4': ['A'], '5': ['A', 'B'], '6': ['A', 'C'], '7': ['B'] }, unclear: ['4'], confidence: 0.9 },
      0.5
    );
    expect(out.map((o) => [o.marks, o.attempted, o.errorType, o.flagged])).toEqual([
      [2, true, 'none', false],
      [-0.5, true, null, false],
      [0, false, 'not_attempted', false],
      [null, true, null, true],
      [null, true, null, true],
      [2, true, 'none', false],
      [null, true, null, false],
    ]);
  });
});

describe('a teacher’s mark below nothing (C361)', () => {
  it('only as low as the question allows', () => {
    expect(parseMark('-1', 2)).toEqual({ kind: 'bad' });
    expect(parseMark('-0.5', 2, -1)).toEqual({ kind: 'ok', value: -0.5 });
    expect(parseMark('−1', 2, -1)).toEqual({ kind: 'ok', value: -1 });
    expect(parseMark('-1.5', 2, -1)).toEqual({ kind: 'bad' });
    expect(stepMark(0, -0.5, 2, -1)).toBe(-0.5);
    expect(stepMark(-1, -0.5, 2, -1)).toBe(-1);
    expect(stepMark(0, -0.5, 2)).toBe(0);
    expect(clampMark(-3, 2, -1)).toBe(-1);
  });
});
