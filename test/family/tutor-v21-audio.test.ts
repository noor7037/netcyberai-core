import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { elaborationBlock, type Elaboration } from '@/lib/family/elaboration';
import { withPics } from '@/lib/family/elaboration-pics';
import { ANSWER_FIRST_MAX, ANSWER_NEXT_MAX, answerParts, chunkEnd } from '@/lib/family/call';
import { checkParentSettingsPatch, checkSettingsPatch, DEFAULT_CHILD_SETTINGS, loadChildSettings, parseChildSettings, saveChildSettings } from '@/lib/family/child-settings';
import { familyWords } from '@/lib/family/words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import { TUTOR_KEYS } from '@/lib/family/tutor-words';

// Tutor v21, read aloud: one listen button (the answer's own, at the top), a fresh answer read by itself for every class
// unless the parent switched it off, a blocked start pulses the button, and the parts join without a gap or a click.
// Made-up content; no network, no database.

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>) => {
    const src = String(loader);
    if (src.includes('AnswerSpeaker')) return (props: Record<string, unknown>) => h(src.includes('TeachMe') ? speakerModule.TeachMe : speakerModule.AnswerSpeaker, props as never);
    return () => null;
  },
}));
const speakerModule = await import('@/components/family/voice/AnswerSpeaker');
const { ElaborationView } = await import('@/components/family/blocks/ElaborationView');
const { KeptAnswer } = await import('@/components/family/tutor/TutorWindow');

const raw = {
  type: 'elaboration',
  term: 'Equal fractions',
  definition: { text: 'Equal fractions name the same part of a whole.', say: 'Equal fractions name the same part of a whole.' },
  levels: { basic: 'Half a roti and two quarters are the same.', intermediate: 'Multiply top and bottom by the same number.', advanced: 'a/b = ka/kb.', say: 'Half and two quarters are the same.' },
  real_life: { text: 'Half a kilo of laddoos weighs the same as two quarter kilo packets.', say: 'Half a kilo is two quarter kilos.' },
  try_it: { question: 'Is 2/4 equal to 1/2?', options: ['Yes', 'No'], answer: 0, right: 'Cut each half again.', hint: 'Draw a roti.', say: 'Is two quarters one half?' },
  future: { text: 'You will use equal fractions to add fractions.', say: 'Equal fractions help you add fractions.' },
};

describe('one listen button', () => {
  it('no step card draws its own Listen button (en and hi)', () => {
    const b = withPics(elaborationBlock(raw, false) as Elaboration, [], 'What are equal fractions?', 3);
    for (const lang of ['en', 'hi'] as const) {
      const html = renderToStaticMarkup(h(ElaborationView, { b, w: familyWords(lang, UNDERSTAND_KEYS), tone: 'mathematics' }));
      expect(html.match(/data-elab-step="/g)?.length).toBe(5);
      expect(html).not.toContain('data-elab-listen');
    }
  });
  it('a kept elaboration answer has one top button (Teach me / Replay) and no per-step one', () => {
    const b = elaborationBlock(raw, false) as Elaboration;
    const w = familyWords('en', [...UNDERSTAND_KEYS, ...TUTOR_KEYS]);
    const html = renderToStaticMarkup(h(KeptAnswer, { b: [b], w, tone: 'mathematics', lang: 'en', speak: { id: 'f2100000-0000-4000-8000-000000000001', serverVoice: true } }));
    expect(html.match(/data-teach-me=/g)?.length).toBe(1);
    expect(html).not.toContain('data-elab-listen');
  });
});

describe('a fresh answer reads itself, for every class', () => {
  const src = readFileSync('src/components/family/UnderstandView.tsx', 'utf8');
  it('the window reads any fresh answer by itself (not only autoRead), on the top button', () => {
    expect(src).toContain("setAutoRead(typeof e.messageId === 'string')");
    expect(src).toMatch(/<TeachMe [^>]*auto=\{autoRead/);
    expect(src).not.toMatch(/<AnswerSpeaker [^>]*auto=/);
  });
  it.each([3, 5, 9])('Class %i: reads by itself with the parent switch on, not with it off', (classLevel) => {
    // The done line: the server still marks Class 3 and below (C508); the phone reads every fresh answer.
    const done = { t: 'done', messageId: 'm', ...(classLevel <= 3 ? { autoRead: true } : {}) };
    const auto = typeof done.messageId === 'string';
    const base = { auto, readAloud: true, sentences: 4, busy: false };
    expect(speakerModule.startsByItself({ ...base, autoPlay: true })).toBe(true);
    expect(speakerModule.startsByItself({ ...base, autoPlay: false })).toBe(false);
    // The child's own read-aloud switch still wins, and an older settings object (no autoPlay) means on.
    expect(speakerModule.startsByItself({ ...base, readAloud: false, autoPlay: true })).toBe(false);
    expect(speakerModule.startsByItself(base)).toBe(true);
  });
  it('the blocked button pulses (none under reduced motion), with no error words', () => {
    const s = readFileSync('src/components/family/voice/AnswerSpeaker.tsx', 'utf8');
    expect(s).toContain('data-voice-blocked');
    expect(s).toContain('animate-pulse');
    expect(s).toContain('motion-reduce:animate-none');
    expect(s).not.toMatch(/blocked[^\n]*fam\.err/);
  });
});

describe('the parent switch (autoPlay)', () => {
  it('defaults on; parsed only as a boolean', () => {
    expect(DEFAULT_CHILD_SETTINGS.autoPlay).toBe(true);
    expect(parseChildSettings({}).autoPlay).toBe(true);
    expect(parseChildSettings({ autoPlay: false }).autoPlay).toBe(false);
    expect(parseChildSettings({ autoPlay: 'no' }).autoPlay).toBe(true);
  });
  it('only the parent can change it: the child patch refuses it, the parent patch takes only it', () => {
    expect(checkSettingsPatch({ autoPlay: false })).toBeNull();
    expect(checkParentSettingsPatch({ autoPlay: false })).toEqual({ autoPlay: false });
    expect(checkParentSettingsPatch({ autoPlay: 'off' })).toBeNull();
    expect(checkParentSettingsPatch({ autoPlay: true, readAloud: false })).toBeNull();
    expect(checkParentSettingsPatch({})).toBeNull();
  });
  it('round-trips through the child settings row, and a child change keeps it', async () => {
    const rows = new Map<string, unknown>();
    const db = {
      query: async (sql: string, p: unknown[] = []) => {
        if (sql.includes('from family.children')) return { rows: p[1] === 'c1' ? [{ '?column?': 1 }] : [] };
        if (sql.startsWith('select settings')) return { rows: rows.has(String(p[1])) ? [{ settings: rows.get(String(p[1])) }] : [] };
        rows.set(String(p[1]), JSON.parse(String(p[2])));
        return { rows: [] };
      },
    };
    expect((await loadChildSettings(db, 'a1', 'c1')).autoPlay).toBe(true);
    expect(await saveChildSettings(db, 'a1', 'c1', checkParentSettingsPatch({ autoPlay: false })!)).toMatchObject({ autoPlay: false });
    expect((await loadChildSettings(db, 'a1', 'c1')).autoPlay).toBe(false);
    await saveChildSettings(db, 'a1', 'c1', checkSettingsPatch({ voiceSpeed: 'slow' })!);
    expect(await loadChildSettings(db, 'a1', 'c1')).toMatchObject({ autoPlay: false, voiceSpeed: 'slow' });
    expect(await saveChildSettings(db, 'a1', 'other', { autoPlay: true })).toBe('not_found');
  });
  it('the parent route needs the parent PIN and checks the body', () => {
    const r = readFileSync('src/app/api/family/children/[childId]/settings/route.ts', 'utf8');
    expect(r).toContain('requireParent(req)');
    expect(r).toContain('checkParentSettingsPatch');
  });
});

// ---- the voice: parts, prefetch, one element ------------------------------------------------------------------------

// Measured on the dev project (control.ai_usage_ledger, family.text_to_speech, 14 days, outcome ok): Gemini TTS takes
// about 2.5 s plus 16 ms a character (r = 0.97); speech plays at about 79 ms a character.
const genMs = (chars: number) => 2500 + 16 * chars;
const playMs = (chars: number) => 79 * chars;

type Fake = { onplaying: (() => void) | null; onended: (() => void) | null; onpause: (() => void) | null; src: string; paused: boolean };
function stage(sentences: string[], opts: { running?: boolean; blocked?: boolean } = {}) {
  const g = globalThis as Record<string, unknown>;
  const audios: Fake[] = [];
  const plays: number[] = [];
  const ends: number[] = [];
  const asked: { from: number; max?: number; at: number }[] = [];
  const sizes = new Map<string, number>();
  let n = 0;
  class FakeAudio implements Fake {
    playbackRate = 1; defaultPlaybackRate = 1; volume = 1; paused = true; currentTime = 0; src = '';
    onplaying: (() => void) | null = null; onended: (() => void) | null = null; onpause: (() => void) | null = null;
    ontimeupdate: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor() { audios.push(this); }
    get duration() { return playMs(sizes.get(this.src) ?? 0) / 1000; }
    play() {
      if (opts.blocked) return Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
      plays.push(Date.now());
      this.paused = false;
      const src = this.src;
      queueMicrotask(() => this.onplaying?.());
      setTimeout(() => {
        if (this.src === src && !this.paused) {
          ends.push(Date.now());
          this.onended?.();
        }
      }, playMs(sizes.get(src) ?? 0));
      return Promise.resolve();
    }
    pause() { this.paused = true; }
    removeAttribute() {}
  }
  const created = { sources: 0, gains: 0 };
  const ramps: number[] = [];
  class FakeContext {
    state = opts.running ? 'running' : 'suspended';
    currentTime = 0;
    destination = {};
    createAnalyser = () => ({ fftSize: 0, connect: () => undefined, getByteTimeDomainData: () => undefined });
    createMediaElementSource = () => {
      created.sources++;
      return { connect: () => undefined };
    };
    createGain = () => {
      created.gains++;
      return { connect: () => undefined, gain: { cancelScheduledValues: () => undefined, setValueAtTime: () => undefined, linearRampToValueAtTime: (v: number) => ramps.push(v) } };
    };
    resume = async () => {
      this.state = 'running';
    };
  }
  g.window = globalThis;
  g.Audio = FakeAudio;
  g.AudioContext = opts.running === undefined ? undefined : FakeContext;
  g.requestAnimationFrame = (f: () => void) => setTimeout(f, 16) as unknown as number;
  g.cancelAnimationFrame = (id: number) => clearTimeout(id);
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
    const url = `blob:${++n}`;
    sizes.set(url, (b as Blob).size);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();
  g.fetch = vi.fn((_u: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { from: number; max?: number };
    asked.push({ ...body, at: Date.now() });
    const chars = sentences.slice(body.from, chunkEnd(sentences, body.from, body.max ?? 600)).join(' ').length;
    // A plain stand-in for the response (a real Response reads its body on timers the fake clock holds).
    const headers = new Map([['content-type', 'audio/mpeg'], ['server-timing', `tts;dur=${genMs(chars)}`]]);
    const res = { ok: true, headers: { get: (k: string) => headers.get(k) ?? null }, blob: async () => new Blob(['x'.repeat(chars)]), json: async () => ({}) };
    return new Promise((resolve) => setTimeout(() => resolve(res), genMs(chars)));
  });
  const gaps = () => plays.slice(1).map((p, i) => p - ends[i]);
  return { audios, plays, ends, asked, gaps, created, ramps };
}

// A real answer's shape: a short first sentence, then longer ones.
const SENTENCES = ['A fraction names a part of a whole thing, like a roti cut up.', 'x'.repeat(149) + '.', ...Array.from({ length: 8 }, (_, i) => `Sentence ${i} `.padEnd(89, 'y') + '.')];

// The reading loop before v21 (first part 200 characters, then 600, one part ahead asked for when a part starts playing).
async function readBefore(v: typeof import('@/components/family/voice/lineVoice'), sentences: string[]) {
  let i = 0;
  let first = true;
  while (i < sentences.length) {
    const end = chunkEnd(sentences, i, first ? ANSWER_FIRST_MAX : 600);
    const at = i;
    await v.speakLine('server', { kind: 'tutor_answer', messageId: 'm', from: at, ...(first ? { max: ANSWER_FIRST_MAX } : {}) }, { text: '', lang: 'en', rate: 1, onPlaying: () => end < sentences.length && v.prefetchLine({ kind: 'tutor_answer', messageId: 'm', from: end }) });
    first = false;
    i = end;
  }
}
// The v21 loop, as AnswerSpeaker runs it: answerParts, the next part asked with this one, two ahead while it plays.
async function readNow(v: typeof import('@/components/family/voice/lineVoice'), sentences: string[]) {
  const parts = answerParts(sentences, 0);
  const ask = (q: { from: number; max: number }) => ({ kind: 'tutor_answer' as const, messageId: 'm', from: q.from, max: q.max });
  for (let k = 0; k < parts.length; k++) {
    if (parts[k + 1]) v.prefetchLine(ask(parts[k + 1]));
    const r = await v.speakLine('server', ask(parts[k]), { text: '', lang: 'en', rate: 1, onPlaying: () => parts.slice(k + 1, k + 3).forEach((q) => v.prefetchLine(ask(q))) });
    if (r.cancelled || r.blocked) return r;
  }
  return null;
}

describe('read-aloud stutter (v21)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('parts after the first are near its size, and every part is asked with its max (so the prefetch key matches)', () => {
    const parts = answerParts(SENTENCES, 0);
    expect(parts[0].max).toBe(ANSWER_FIRST_MAX);
    expect(parts.slice(1).every((p) => p.max === ANSWER_NEXT_MAX)).toBe(true);
    expect(parts.map((p) => p.from)).toEqual([0, ...parts.slice(0, -1).map((p) => p.end)]);
    expect(parts.at(-1)!.end).toBe(SENTENCES.length);
    for (const p of parts.slice(1)) expect(SENTENCES.slice(p.from, p.end).join(' ').length).toBeLessThanOrEqual(ANSWER_NEXT_MAX);
  });

  it('before v21: part 2 (600 characters) is not ready when a short part 1 ends: seconds of silence', async () => {
    const s = stage(SENTENCES);
    const v = await import('@/components/family/voice/lineVoice');
    const done = readBefore(v, SENTENCES);
    await vi.advanceTimersByTimeAsync(200_000);
    await done;
    // Part 1 (61 characters) plays ~4.8 s from ~3.5 s; part 2 (~500 characters, ~10.6 s to make) is asked at ~3.5 s.
    expect(Math.max(...s.gaps())).toBeGreaterThan(5000);
  });

  it('v21: no gap: two parts ahead, similar sizes', async () => {
    const s = stage(SENTENCES);
    const v = await import('@/components/family/voice/lineVoice');
    const done = readNow(v, SENTENCES);
    await vi.advanceTimersByTimeAsync(200_000);
    await done;
    expect(s.plays.length).toBe(answerParts(SENTENCES, 0).length);
    expect(Math.max(...s.gaps())).toBeLessThan(50);
    // Part 2 is asked together with part 1; part 3 while part 1 plays (two ahead), never twice.
    expect(s.asked[0].at).toBe(s.asked[1].at);
    expect(s.asked[2].at).toBeLessThan(s.ends[0]);
    expect(new Set(s.asked.map((a) => a.from)).size).toBe(s.asked.length);
  });

  it('one <audio> element for every part, routed into the analyser once, with a fade at each join', async () => {
    const s = stage(SENTENCES, { running: true });
    const v = await import('@/components/family/voice/lineVoice');
    const done = readNow(v, SENTENCES);
    await vi.advanceTimersByTimeAsync(200_000);
    await done;
    expect(s.plays.length).toBeGreaterThan(2);
    expect(s.audios.length).toBe(1);
    expect(s.created.sources).toBe(1);
    expect(s.created.gains).toBe(1);
    // Each part fades in (to 1) and out (to 0).
    expect(s.ramps.filter((r) => r === 1).length).toBe(s.plays.length);
    expect(s.ramps.filter((r) => r === 0).length).toBe(s.plays.length);
  });

  it('stop ends the part at once and the next reading starts on the same element', async () => {
    const s = stage(SENTENCES, { running: true });
    const v = await import('@/components/family/voice/lineVoice');
    const first = readNow(v, SENTENCES);
    await vi.advanceTimersByTimeAsync(6000);
    v.stopLine();
    await expect(first).resolves.toMatchObject({ cancelled: true });
    const again = readNow(v, SENTENCES);
    await vi.advanceTimersByTimeAsync(200_000);
    await again;
    expect(s.audios.length).toBe(1);
    expect(s.created.sources).toBe(1);
  });

  it('a browser that blocks the start: blocked, the server voice kept, no phone voice', async () => {
    stage(SENTENCES, { blocked: true });
    const speech = await import('@/components/family/english/speech');
    const said = vi.spyOn(speech, 'speak');
    const v = await import('@/components/family/voice/lineVoice');
    const done = readNow(v, SENTENCES);
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(done).resolves.toEqual({ cancelled: false, mode: 'server', blocked: true });
    expect(said).not.toHaveBeenCalled();
  });
});
