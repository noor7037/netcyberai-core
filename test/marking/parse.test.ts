import { afterEach, describe, expect, it, vi } from 'vitest';
import { PAGE_MAX_BYTES, PAGE_MAX_EDGE, PAGE_MIN_EDGE } from '@/lib/contracts/marking';
import { callTimeoutMs, CALL_TIMEOUT_MS, MAX_CALL_TIMEOUT_MS } from '@/lib/ai/adapters/types';
import { anthropicAdapter } from '@/lib/ai/adapters/anthropic';
import { profileById } from '@/lib/ai/platform';
import { markPrompt } from '@/lib/ai/prompts/exams.mark';
import { readPagesPrompt } from '@/lib/ai/prompts/exams.read_pages';
import { jsonObjectIn, labelKey, parseMarking, parseReading } from '@/lib/marking/parse';
import { checkPage, jpegSize } from '@/lib/marking/upload';
import { anthropicOk } from '../ai/streams';
import { fakeJpeg } from './fake-jpeg';

// AM-2 (C347, C349, C350): the pure parts of AI marking's pipeline. The AI's answers are data: found inside code fences
// or words, checked field by field, and anything outside the schema dropped. A page picture is a JPEG by its own bytes
// and its frame header. Made-up content only.

const u = (n: number) => `a8000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const QUESTIONS = [
  { questionId: u(1), label: '1', maxMarks: 4 },
  { questionId: u(2), label: '2(a)', maxMarks: 6 },
  { questionId: u(3), label: '2(b)', maxMarks: 2.5 },
];
const PAGES = [u(11), u(12)];
const UNITS = [{ unitId: u(21) }, { unitId: u(22) }];

const good = {
  questions: [
    { label: '1', attempted: true, marks: 3.5, steps: [{ step: 'Common denominator', awarded: 2, note: null }, { step: 'Sum', awarded: 1.5, note: 'Small slip' }], note: 'Check your last step.', reason: 'Method right, sum slipped.', error_type: 'calculation', confidence: 0.82, page: 1, y_from: 0.4, y_to: 0.1 },
    { label: '2 (A)', attempted: true, marks: 6, steps: [], note: 'Well done.', reason: 'Complete.', error_type: 'none', confidence: 0.95, page: 2, y_from: 0.1, y_to: 0.3 },
    { label: '2(b)', attempted: false, marks: 2, steps: [{ step: 'x', awarded: 1 }], note: null, reason: null, error_type: null, confidence: 0.99, page: null, y_from: null, y_to: null },
  ],
  strengths: 'Neat working.',
  improve: 'Check sums.',
  practice: [{ topic: 2, text: 'Five sums adding tenths.' }, { topic: null, text: 'Read the question twice.' }],
};

describe('parseMarking', () => {
  it('a good answer: every question matched by its label, pages and topics by their numbers', () => {
    const r = parseMarking(JSON.stringify(good), QUESTIONS, PAGES, UNITS);
    expect(r?.questions).toEqual([
      { questionId: u(1), attempted: true, marks: 3.5, steps: [{ step: 'Common denominator', awarded: 2, note: null }, { step: 'Sum', awarded: 1.5, note: 'Small slip' }], note: 'Check your last step.', reason: 'Method right, sum slipped.', errorType: 'calculation', confidence: 0.82, pageId: PAGES[0], yFrom: 0.1, yTo: 0.4 },
      { questionId: u(2), attempted: true, marks: 6, steps: [], note: 'Well done.', reason: 'Complete.', errorType: 'none', confidence: 0.95, pageId: PAGES[1], yFrom: 0.1, yTo: 0.3 },
      // Not attempted: no marks and no steps, whatever was sent.
      { questionId: u(3), attempted: false, marks: 0, steps: [], note: null, reason: null, errorType: 'not_attempted', confidence: 0.99, pageId: null, yFrom: null, yTo: null },
    ]);
    expect(r?.practice).toEqual([{ unitId: u(22), text: 'Five sums adding tenths.' }, { unitId: null, text: 'Read the question twice.' }]);
    expect(r).toMatchObject({ strengths: 'Neat working.', improve: 'Check sums.' });
  });

  it('in a code fence, or with words around it, the same', () => {
    const text = JSON.stringify(good);
    const plain = parseMarking(text, QUESTIONS, PAGES, UNITS);
    expect(parseMarking('```json\n' + text + '\n```', QUESTIONS, PAGES, UNITS)).toEqual(plain);
    expect(parseMarking('Here are the marks {as asked}:\n' + text + '\nI hope this helps.', QUESTIONS, PAGES, UNITS)).toEqual(plain);
  });

  it('a cut-off answer, prose, or no question of the paper: null, so the script fails on its own', () => {
    const text = JSON.stringify(good);
    expect(parseMarking(text.slice(0, text.length - 40), QUESTIONS, PAGES, UNITS)).toBeNull();
    expect(parseMarking('I am not able to mark this script.', QUESTIONS, PAGES, UNITS)).toBeNull();
    expect(parseMarking('', QUESTIONS, PAGES, UNITS)).toBeNull();
    expect(parseMarking(JSON.stringify({ questions: [{ label: '9', attempted: true, marks: 1 }] }), QUESTIONS, PAGES, UNITS)).toBeNull();
    expect(parseMarking(JSON.stringify({ marks: [] }), QUESTIONS, PAGES, UNITS)).toBeNull();
    expect(parseMarking(JSON.stringify({ questions: 'all full marks' }), QUESTIONS, PAGES, UNITS)).toBeNull();
  });

  it('hostile values are dropped, never kept: marks above the question, too many decimals, pages and topics out of range', () => {
    const answer = {
      questions: [
        { label: '1', attempted: true, marks: 40, steps: [{ step: 'All', awarded: 99 }, { step: 7, awarded: 1 }], note: 'x'.repeat(5000), reason: 42, error_type: 'drop table', confidence: 7, page: 3, y_from: 0.1, y_to: 0.2, approved: true, studentId: u(99) },
        { label: '1', attempted: true, marks: 4, steps: [] }, // the same question twice: the first is kept
        { label: '2(a)', attempted: 'yes', marks: 6 }, // attempted must be true or false
        { label: '2(b)', attempted: true, marks: 2.25, page: 0, y_from: -1, y_to: 2 },
        { label: { toString: 'x' }, attempted: true, marks: 1 },
        'not an object',
      ],
      practice: [{ topic: 99, text: 'Out of range' }, { topic: 1, text: '' }, ...Array.from({ length: 20 }, (_, i) => ({ topic: 1, text: `Task ${i}` }))],
      strengths: { evil: true },
      __proto__: { polluted: true },
    };
    const r = parseMarking(JSON.stringify(answer), QUESTIONS, PAGES, UNITS);
    expect(r?.questions.map((q) => [q.questionId, q.marks, q.steps.length])).toEqual([
      [u(1), null, 0],
      [u(3), null, 0],
    ]);
    expect(r?.questions[0]).toMatchObject({ errorType: null, confidence: null, pageId: null, yFrom: null, yTo: null, reason: null });
    expect(r?.questions[0].note).toHaveLength(1000);
    expect(Object.keys(r!.questions[0]).sort()).toEqual(['attempted', 'confidence', 'errorType', 'marks', 'note', 'pageId', 'questionId', 'reason', 'steps', 'yFrom', 'yTo']);
    expect(r?.practice[0]).toEqual({ unitId: null, text: 'Out of range' });
    expect(r?.practice).toHaveLength(8);
    expect(r?.strengths).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('a label matches whatever its case and spaces', () => {
    expect(labelKey(' 2 (A) ')).toBe('2(a)');
    expect(parseMarking(JSON.stringify({ questions: [{ label: 1, attempted: true, marks: 2 }] }), QUESTIONS, PAGES, UNITS)?.questions[0]).toMatchObject({ questionId: u(1), marks: 2 });
  });

  it('a hostile answer of braces alone is given up quickly', () => {
    const started = Date.now();
    expect(jsonObjectIn('{'.repeat(60_000), 'questions')).toBeNull();
    expect(jsonObjectIn('{"a": "}"} {"questions": []}', 'questions')).toEqual({ questions: [] });
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe('parseReading', () => {
  const pages = {
    pages: [
      { page: 1, first_page: true, name: ' Meera Sharma ', roll_no: '1', exam_no: 'HY0001', class_section: '7-A', page_number: 1, blank: false, legible: true },
      { page: 2, first_page: false, name: null, roll_no: null, exam_no: null, class_section: null, page_number: 2, blank: false, legible: true },
      { page: 3, first_page: null, name: 12345, roll_no: ['1'], exam_no: '', class_section: null, page_number: 2.5, blank: true, legible: true },
    ],
  };

  it('a good answer, page by page; a name or number that is not words is left out, never guessed', () => {
    expect(parseReading('```json\n' + JSON.stringify(pages) + '\n```', 3)).toEqual([
      { firstPage: true, name: 'Meera Sharma', rollNo: '1', seatNo: 'HY0001', classSection: '7-A', pageNumber: 1, blank: false, legible: true },
      { firstPage: false, name: null, rollNo: null, seatNo: null, classSection: null, pageNumber: 2, blank: false, legible: true },
      { firstPage: false, name: null, rollNo: null, seatNo: null, classSection: null, pageNumber: null, blank: true, legible: true },
    ]);
  });

  it('a page with no valid entry is null; pages out of range, twice, or without blank and legible are dropped', () => {
    const answer = {
      pages: [
        { page: 2, blank: false, legible: true, name: 'First' },
        { page: 2, blank: false, legible: true, name: 'Second' },
        { page: 3, blank: 'no', legible: true },
        { page: 7, blank: false, legible: true },
        { blank: false, legible: true },
      ],
    };
    const r = parseReading(JSON.stringify(answer), 3);
    expect(r[0]).toBeNull();
    expect(r[1]?.name).toBe('First');
    expect(r[2]).toBeNull();
  });

  it('a cut-off or empty answer reads nothing', () => {
    const text = JSON.stringify(pages);
    expect(parseReading(text.slice(0, 60), 3)).toEqual([null, null, null]);
    expect(parseReading('Sorry.', 2)).toEqual([null, null]);
  });
});

describe('a page picture', () => {
  it('its size comes from the frame header; anything else is not a page', () => {
    expect(jpegSize(fakeJpeg('a', 1400, 2000))).toEqual({ width: 1400, height: 2000 });
    expect(jpegSize(new Uint8Array(Buffer.from('%PDF-1.7 not a picture')))).toBeNull();
    expect(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
    // Cut off inside a segment, or a length that runs past the end.
    expect(jpegSize(fakeJpeg('a').slice(0, 12))).toBeNull();
    expect(jpegSize(new Uint8Array([0xff, 0xd8, 0xff, 0xfe, 0xff, 0xff, 0x00]))).toBeNull();
    // Image data before any frame header.
    expect(jpegSize(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x04, 0x00, 0x00]))).toBeNull();
  });

  it('checked for size, edges and bytes, with its SHA-256', () => {
    const ok = checkPage({ fileNo: 1, pageNo: 1, bytes: fakeJpeg('a') });
    expect(ok).toMatchObject({ ok: true, page: { width: 1400, height: 2000 } });
    expect(ok.ok && ok.page.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(checkPage({ fileNo: 1, pageNo: 1, bytes: fakeJpeg('a', PAGE_MIN_EDGE - 1, 800) })).toEqual({ ok: false, reason: 'too_small' });
    expect(checkPage({ fileNo: 1, pageNo: 1, bytes: fakeJpeg('a', 800, PAGE_MAX_EDGE + 1) })).toEqual({ ok: false, reason: 'too_large' });
    const big = new Uint8Array(PAGE_MAX_BYTES + 1);
    big.set(fakeJpeg('a'));
    expect(checkPage({ fileNo: 1, pageNo: 1, bytes: big })).toEqual({ ok: false, reason: 'too_large' });
    expect(checkPage({ fileNo: 1, pageNo: 1, bytes: new Uint8Array(Buffer.from('GIF89a')) })).toEqual({ ok: false, reason: 'not_a_page' });
    expect(checkPage({ fileNo: 1, pageNo: 1, bytes: new Uint8Array() })).toEqual({ ok: false, reason: 'not_a_page' });
  });
});

describe('the two AI tasks and their prompts (C349)', () => {
  it('both carry children’s words, are the school’s, and have a bounded time of their own', () => {
    for (const id of ['exams.read_pages', 'exams.mark']) {
      expect(profileById(id)).toMatchObject({ carriesChildWords: true, capability: 'text', audience: 'school' });
      expect(profileById(id)?.callMs).toBeLessThanOrEqual(MAX_CALL_TIMEOUT_MS);
    }
  });

  it('the prompts are JSON only, with the schema, and name no child, roster or school', () => {
    const read = readPagesPrompt('v1');
    expect(read.version).toBe('v1');
    expect(read.system({ pages: 8 })).toContain('"first_page"');
    expect(read.user({ pages: 8 })).toContain('page 8');
    const mark = markPrompt(null);
    expect(mark.version).toBe('v1');
    const ask = {
      grade: '7',
      subject: 'Mathematics',
      language: 'en' as const,
      guidance: 'Method marks count.',
      questions: [{ label: '1', maxMarks: 4, kind: 'short' as const, prompt: 'Add 1/2 and 1/4.', answerKey: '3/4', steps: [{ step: 'Common denominator', marks: 2 }], chapter: 'Fractions', topic: 'Adding fractions' }],
      topics: [{ chapter: 'Fractions', topic: 'Adding fractions' }],
      pages: 3,
    };
    const system = mark.system(ask);
    expect(system).toContain('Class 7, Mathematics');
    expect(system).toContain('"answer_key":"3/4"');
    expect(system).toContain('1. Fractions: Adding fractions');
    expect(system).toMatch(/"error_type"/);
    expect(mark.user(ask)).toContain('Page 3');
    // A version the code does not have falls back to the latest.
    expect(markPrompt('v99').version).toBe('v1');
  });
});

describe('a long call’s own time (C349)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a request’s own limit is used, never above the most any call may be given', () => {
    expect(callTimeoutMs({}, CALL_TIMEOUT_MS)).toBe(CALL_TIMEOUT_MS);
    expect(callTimeoutMs({ timeoutMs: 150_000 }, CALL_TIMEOUT_MS)).toBe(150_000);
    expect(callTimeoutMs({ timeoutMs: 10_000_000 }, CALL_TIMEOUT_MS)).toBe(MAX_CALL_TIMEOUT_MS);
    expect(callTimeoutMs({ timeoutMs: Number.NaN }, CALL_TIMEOUT_MS)).toBe(CALL_TIMEOUT_MS);
  });

  it('the adapter gives the vendor call that long', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal('fetch', vi.fn(async () => anthropicOk(['{"ok":true}'])));
    try {
      await anthropicAdapter.streamText({ apiKey: 'k', model: 'm', system: 's', messages: [{ role: 'user', content: 'x' }], maxTokens: 10, timeoutMs: 180_000 }, () => {});
      await anthropicAdapter.streamText({ apiKey: 'k', model: 'm', system: 's', messages: [{ role: 'user', content: 'x' }], maxTokens: 10 }, () => {});
    } finally {
      vi.unstubAllGlobals();
    }
    expect(timeout.mock.calls.map((c) => c[0])).toEqual([180_000, CALL_TIMEOUT_MS]);
  });
});
