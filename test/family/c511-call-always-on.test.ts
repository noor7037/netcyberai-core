import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bargeIn, CallEar, carryWords, speechLine, TurnDetector, VAD, type VadEvent } from '@/lib/family/call-vad';
import { CALL_KEYS } from '@/lib/family/call-words';
import { familyWords } from '@/lib/family/words';
import type { CallPhase, CallStatus } from '@/components/family/call/useCall';

// C511: the tutor call is a real call. The microphone opens in the tap on Call and stays open; the turn detector decides
// the turns from the loudness; the child talks over the tutor by voice; the bar has Mute, Speaker, Captions, Type and End.

const ROOT = path.resolve(__dirname, '../..');
const src = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const F = VAD.frameMs;
const frames = (ms: number) => Math.round(ms / F);
const run = (seq: [number, number][], opts: { tutor?: boolean; det?: TurnDetector } = {}) => {
  const det = opts.det ?? new TurnDetector();
  const out: { at: number; ev: VadEvent }[] = [];
  let at = 0;
  for (const [rms, ms] of seq)
    for (let i = 0; i < frames(ms); i++) {
      at += F;
      const ev = det.push(rms, opts.tutor ?? false);
      if (ev) out.push({ at, ev });
    }
  return { det, out, evs: out.map((e) => e.ev) };
};
const QUIET = 0.002;
const VOICE = 0.06;

describe('the turn detector (call-vad.ts)', () => {
  it('a question: onset, a voice after 150 ms, the end after 0.9 s of quiet; nothing before the room is learnt', () => {
    const { out, evs } = run([[QUIET, 1000], [VOICE, 1200], [QUIET, 1200]]);
    expect(evs).toEqual(['onset', 'start', 'end']);
    expect(out[1].at - out[0].at).toBe(VAD.onsetMs - F);
    expect(out[2].at - (1000 + 1200)).toBe(VAD.endSilenceMs);
    expect(run([[VOICE, VAD.calibrateMs]]).evs).toEqual([]);
  });

  it('a pause between words shorter than 0.9 s does not end the turn', () => {
    const { evs } = run([[QUIET, 500], [VOICE, 800], [QUIET, 600], [VOICE, 800], [QUIET, 1000]]);
    expect(evs).toEqual(['onset', 'start', 'end']);
  });

  it('a cough (200 ms) is a voice but too short to be a question: dropped; a knock (100 ms) never becomes a voice', () => {
    expect(run([[QUIET, 500], [0.1, 200], [QUIET, 1200]]).evs).toEqual(['onset', 'start', 'drop']);
    expect(run([[QUIET, 500], [0.1, 100], [QUIET, 1200]]).evs).toEqual(['onset', 'cancel']);
  });

  it('a turn is cut at the maximum length while the child still talks, and at the day’s seconds when fewer', () => {
    // Talking without a long pause: words of 450 ms with 100 ms between them.
    const talk = (ms: number) => Array.from({ length: Math.ceil(ms / 550) }, () => [[VOICE, 450], [QUIET, 100]] as [number, number][]).flat();
    const { out } = run([[QUIET, 500], ...talk(VAD.maxTurnMs + 2000)]);
    expect(out.find((e) => e.ev === 'end')!.at - 500).toBe(VAD.maxTurnMs);
    const det = new TurnDetector();
    det.setMaxTurn(5000);
    const short = run([[QUIET, 500], ...talk(8000)], { det });
    expect(short.out.find((e) => e.ev === 'end')!.at - 500).toBe(5000);
  });

  it('the noise floor adapts: a steady fan from the start is no voice, a voice over it still is, and a fan switched on mid-call stops being a turn', () => {
    const fan = 0.02;
    const { det, evs } = run([[fan, 3000]]);
    expect(evs).toEqual([]);
    expect(det.floor).toBeGreaterThan(fan * 0.8);
    expect(run([[fan, 3000], [0.2, 1000], [fan, 1500]]).evs).toEqual(['onset', 'start', 'end']);
    const later = run([[QUIET, 1000], [0.03, 20_000]]);
    expect(later.evs).toEqual(['onset', 'start', 'end']);
    expect(later.out[2].at).toBeLessThan(VAD.maxTurnMs);
    // In a quiet room the line is the quietest voice; it never falls under it.
    const quiet = run([[0.0005, 2000]]).det;
    expect(speechLine(quiet.floor, false)).toBe(VAD.minSpeechRms);
  });

  it('a voice trailing off under the line still counts (hysteresis)', () => {
    const { evs } = run([[QUIET, 500], [VOICE, 600], [VAD.minSpeechRms * 0.8, 800], [QUIET, 1000]]);
    expect(evs).toEqual(['onset', 'start', 'end']);
  });
});

describe('barge-in (C511)', () => {
  it('talking over the answer interrupts it; before the answer began, the words are carried into the next turn', () => {
    expect(bargeIn('idle', false)).toBe('none');
    expect(bargeIn('speaking', true)).toBe('interrupt');
    expect(bargeIn('speaking', false)).toBe('continue');
    expect(bargeIn('thinking', false)).toBe('continue');
    expect(bargeIn('hearing', false)).toBe('continue');
    expect(carryWords('what is a fraction', ' and why ')).toBe('what is a fraction and why');
    expect(carryWords('', 'hello')).toBe('hello');
  });

  it('echo: while the tutor plays, the line is doubled and the voice must last 300 ms', () => {
    expect(speechLine(0.01, true)).toBe(speechLine(0.01, false) * VAD.tutorFactor);
    // The tutor's leftover echo, at a level that would be a voice with the tutor quiet, is not one while it plays.
    const echo = 0.025;
    expect(run([[QUIET, 500], [echo, 2000], [QUIET, 1200]], { tutor: true }).evs).toEqual([]);
    expect(run([[QUIET, 500], [echo, 2000], [QUIET, 1200]]).evs).toEqual(['onset', 'start', 'end']);
    // A 250 ms burst over the tutor is no voice; the child really talking over it is, after 300 ms.
    expect(run([[QUIET, 500], [0.2, 250], [QUIET, 1200]], { tutor: true }).evs).toEqual(['onset', 'cancel']);
    const over = run([[QUIET, 500], [0.2, 1000], [QUIET, 1200]], { tutor: true });
    expect(over.evs).toEqual(['onset', 'start', 'end']);
    expect(over.out[1].at - over.out[0].at).toBe(VAD.tutorOnsetMs - F);
  });

  it('useCall stops the voice and the answer on a confirmed voice, and drops the unsaid sentences', () => {
    const code = src('src/components/family/call/useCall.ts');
    expect(code).toMatch(/ev === 'start'\) \{\s*beginRecording\(\);\s*interrupt\(\);/);
    expect(code).toMatch(/const interrupt = useCallback[\s\S]*?bargeIn\(busyRef\.current, turn\.current\.started > 0\)[\s\S]*?cancel\(\);/);
    expect(code).toMatch(/const cancel = useCallback[\s\S]*?t\.queue = \[\];[\s\S]*?stopLine\(\);/);
    // The tutor's audio playing raises the line (the second argument of the frame).
    expect(code).toContain('ear.current.frame(lv, turn.current.playing)');
  });
});

describe('mute', () => {
  it('muted, no frame is heard and no turn is sent; unmuted, the next voice is a turn again', () => {
    const ear = new CallEar();
    const feed = (rms: number, ms: number) => Array.from({ length: frames(ms) }, () => ear.frame(rms)).filter(Boolean);
    feed(QUIET, 500);
    expect(feed(VOICE, 300)).toEqual(['onset', 'start']);
    expect(ear.mute(true)).toBe(true);
    expect(feed(VOICE, 2000)).toEqual([]);
    expect(feed(QUIET, 2000)).toEqual([]);
    ear.mute(false);
    expect([...feed(VOICE, 1000), ...feed(QUIET, 1000)]).toEqual(['onset', 'start', 'end']);
  });

  it('the call mutes the track itself, so nothing is sent from it', () => {
    const code = src('src/components/family/call/callMic.ts');
    expect(code).toContain('setMuted: (muted) => stream.getAudioTracks().forEach((t) => (t.enabled = !muted))');
  });
});

// A phone's microphone, faked: getUserMedia counts its calls, tracks count their stops.
function fakePhone() {
  const calls: MediaStreamConstraints[] = [];
  const tracks = [{ stopped: false, enabled: true, stop() { this.stopped = true; } }];
  const stream = { getTracks: () => tracks, getAudioTracks: () => tracks } as unknown as MediaStream;
  const ctxs: { closed: boolean; state: string }[] = [];
  class Ctx {
    closed = false;
    state = 'running';
    constructor() {
      ctxs.push(this);
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      this.closed = true;
      return Promise.resolve();
    }
    createAnalyser() {
      return { fftSize: 1024, getFloatTimeDomainData: (b: Float32Array) => b.fill(0.1) };
    }
    createMediaStreamSource() {
      return { connect: () => undefined };
    }
  }
  const listeners: Record<string, (e: Event) => void> = {};
  vi.stubGlobal('window', { AudioContext: Ctx });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: (c: MediaStreamConstraints) => (calls.push(c), Promise.resolve(stream)) } });
  vi.stubGlobal('MediaRecorder', class {});
  vi.stubGlobal('document', { addEventListener: (k: string, f: (e: Event) => void) => (listeners[k] = f), removeEventListener: () => undefined });
  return { calls, tracks, ctxs, listeners };
}

describe('start-up (callMic.ts)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetModules();
  });

  it('the microphone is asked for inside the tap, once, with the echo canceller on; the call screen takes that stream', async () => {
    const phone = fakePhone();
    const mic = await import('@/components/family/call/callMic');
    mic.primeCallMic();
    // Synchronous: asked for before the tap's handler returned, with the audio context made in the same tap.
    expect(phone.calls).toHaveLength(1);
    expect(phone.ctxs).toHaveLength(1);
    expect(phone.calls[0].audio).toMatchObject({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    const opened = await mic.openCallMic();
    expect(opened.ok).toBe(true);
    expect(phone.calls).toHaveLength(1);
    if (!opened.ok) return;
    expect(opened.mic.level()).toBeCloseTo(0.1, 5);
    // End call: every track stopped and the context closed.
    opened.mic.close();
    expect(phone.tracks.every((t) => t.stopped)).toBe(true);
    expect(phone.ctxs[0].closed).toBe(true);
  });

  it('a tap on a Call link primes it (one listener for the app); a microphone primed and not taken is closed', async () => {
    vi.useFakeTimers();
    const phone = fakePhone();
    const mic = await import('@/components/family/call/callMic');
    const off = mic.installCallPrime();
    const link = { closest: (sel: string) => (sel === mic.CALL_LINK ? {} : null) };
    phone.listeners.click({ target: link } as unknown as Event);
    expect(phone.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(mic.PRIME_HOLD_MS + 10);
    expect(phone.tracks.every((t) => t.stopped)).toBe(true);
    off();
  });

  it('a page opened directly asks for the microphone at once; nothing waits on the realtime leg, a token or a probe', async () => {
    const phone = fakePhone();
    const mic = await import('@/components/family/call/callMic');
    const opened = await mic.openCallMic();
    expect(opened.ok).toBe(true);
    expect(phone.calls).toHaveLength(1);
    const call = src('src/components/family/call/useCall.ts');
    const page = src('src/app/(family)/family/(app)/call/page.tsx');
    for (const code of [call, page, src('src/components/family/call/CallView.tsx')]) {
      expect(code).not.toMatch(/RealtimeLeg|openRealtimeLeg|realtimeReady|voice\/call\/token/);
    }
    // The start awaits the microphone only, then listens.
    const start = call.slice(call.indexOf('const start = useCallback'), call.indexOf('// The call opens with the screen'));
    expect(start.match(/await /g)).toHaveLength(2);
    expect(start).toContain('await openCallMic()');
    expect(start).toContain('await m.ctx.resume()');
  });

  it('leaving the screen ends the call: page hidden, page gone, another page', () => {
    const call = src('src/components/family/call/useCall.ts');
    expect(call).toContain("document.addEventListener('visibilitychange', hide)");
    expect(call).toContain("window.addEventListener('pagehide', gone)");
    expect(call).toMatch(/return \(\) => \{[\s\S]*?endRef\.current\(\);/);
    const end = call.slice(call.indexOf('const end = useCallback'), call.indexOf('const endRef'));
    expect(end).toContain('mic.current?.close()');
    expect(end).toContain('stopLine()');
    expect(end).toContain('releaseWake()');
  });
});

describe('the call screen (CallScreen.tsx)', () => {
  const w = familyWords('en', CALL_KEYS);
  const base = {
    w, lang: 'en' as const, tutorName: 'Riya', status: 'live' as CallStatus, phase: 'listening' as CallPhase, elapsed: 75, heard: '', ack: '', lines: [], current: -1,
    board: null, boardFull: false, problem: '', refusal: '', muted: false, loud: true, showSpeaker: true, recording: false, stopped: false, levelOf: () => 0,
    endHref: '/family/study', onEnd: () => undefined, onMute: () => undefined, onSpeaker: () => undefined, onTalk: () => undefined, onWake: () => undefined, onAgain: () => undefined, onType: () => undefined,
  };
  const render = async (p: Partial<typeof base> & Record<string, unknown> = {}) => {
    const { CallScreen } = await import('@/components/family/call/CallScreen');
    return renderToStaticMarkup(h(CallScreen, { ...base, ...p } as never));
  };

  it('has the five call buttons with accessible names, End call red and last; no Talk button while the microphone is open', async () => {
    const html = await render();
    const bar = html.slice(html.indexOf('data-call-bar'));
    const names = [...bar.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(['Mute microphone', 'Volume: loud. Tap for quiet', 'Captions', 'Type instead', 'End call']);
    expect(bar).toMatch(/data-call-end[^>]*bg-coral-deep text-white|bg-coral-deep text-white[^>]*data-call-end/);
    expect(html).not.toContain('data-call-talk');
    expect(html).toContain('Listening…');
    expect(html).toContain('Riya');
    expect(html).toContain('01:15');
    expect(html).toMatch(/data-call-captions[^-]/);
    expect(html).toContain('h-14 w-14');
  });

  it('muted looks muted and says Unmute; Speaker is hidden where it cannot work (the Android app)', async () => {
    const html = await render({ muted: true, phase: 'muted', showSpeaker: false });
    expect(html).toContain('aria-label="Unmute microphone"');
    expect(html).toContain('Muted');
    expect(html).not.toContain('data-call-speaker');
  });

  it('a phone with no loudness to listen with gets a Talk button (the fallback); a sleeping one a tap to start', async () => {
    expect(await render({ status: 'manual', phase: 'idle' })).toContain('data-call-talk');
    expect(await render({ status: 'asleep', phase: 'idle' })).toContain('Tap to start listening');
  });

  it('every word the screen uses is picked for it, in English and Hindi', () => {
    const code = src('src/components/family/call/CallScreen.tsx');
    const used = [...new Set([...code.matchAll(/'(fam\.call\.[a-zA-Z.]+)'/g)].map((m) => m[1]))];
    expect(used.length).toBeGreaterThan(15);
    for (const k of used) expect(CALL_KEYS, k).toContain(k);
    const hi = familyWords('hi', CALL_KEYS);
    for (const k of used) expect(hi[k], k).toMatch(/[ऀ-ॿ]/);
  });
});
