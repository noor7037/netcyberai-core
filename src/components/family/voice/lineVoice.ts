'use client';

import { speak, stopSpeaking } from '../english/speech';
import { avatarState, setAvatarLevel, setAvatarMood } from '@/lib/family/avatar-state';

// Which voice reads a line aloud (C386): the server voice when Control has set one up, else the phone's own (speech.ts).
// The server voice reads only a line the server holds, named here by where it comes from (src/lib/family/voice-out.ts);
// the phone never sends the words. The audio is played from memory and dropped when the line ends or is stopped; the
// response is never cached. When the server voice is not set up, or the family's turns are used up, the rest of the
// visit uses the phone's voice and the screen says so; a single failure reads that one line with the phone's voice.

export type LineSource = { kind: 'chapter'; chapterKey: string; blockId: string; sentence: number } | { kind: 'live_line'; token: string } | { kind: 'live_turn'; sessionId: string; position: number } | { kind: 'call_line'; token: string } | { kind: 'tutor_answer'; messageId: string; from?: number };
export type VoiceMode = 'server' | 'phone';
export type Spoken = { cancelled: boolean; mode: VoiceMode };

let generation = 0;
let playing: { audio: HTMLAudioElement; url: string } | null = null;

// W19-A: the tutor's mouth follows the voice. The server voice is measured: one AudioContext and AnalyserNode for the
// visit (made on the first line, resumed on each), each line's <audio> routed through it, and the loudness (RMS) handed
// to the avatar every frame. The audio is routed only once the context runs, so a web view that will not start it plays
// as before. The phone's voice cannot be measured: each spoken word is a short pulse, and an engine that reports no
// words (or a context that will not run) gets a soft babble so the mouth still moves. Nothing here may break a line.
type Meter = { ctx: AudioContext; an: AnalyserNode; buf: Uint8Array };
let meter: Meter | null | undefined;
let frame = 0;
let word = -1e9;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const nextFrame = (f: () => void) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(f) : (setTimeout(f, 16) as unknown as number));
const cancelFrame = (id: number) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));

function getMeter(): Meter | null {
  if (meter !== undefined) return meter;
  meter = null;
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (C) {
      const ctx = new C();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      an.connect(ctx.destination);
      meter = { ctx, an, buf: new Uint8Array(an.fftSize) };
    }
  } catch {
    meter = null;
  }
  return meter;
}

async function route(audio: HTMLAudioElement): Promise<Meter | null> {
  const m = getMeter();
  if (!m) return null;
  try {
    if (m.ctx.state !== 'running') await m.ctx.resume();
    if (m.ctx.state !== 'running') return null;
    m.ctx.createMediaElementSource(audio).connect(m.an);
    return m;
  } catch {
    return null;
  }
}

const rms = (m: Meter) => {
  m.an.getByteTimeDomainData(m.buf);
  let sum = 0;
  for (const b of m.buf) sum += ((b - 128) / 128) ** 2;
  return Math.min(1, Math.sqrt(sum / m.buf.length) * 4);
};
// A word's pulse (0.6, fading over ~150 ms); with no word for a while, a babble of syllables.
const synth = () => {
  const t = now();
  const since = t - word;
  return since < 700 ? 0.6 * Math.exp(-since / 150) : 0.2 + 0.25 * Math.abs(Math.sin(t / 95));
};

function drive(read: () => number) {
  cancelFrame(frame);
  setAvatarMood('speaking');
  let smooth = 0;
  const tick = () => {
    smooth = smooth * 0.55 + read() * 0.45;
    setAvatarLevel(smooth);
    frame = nextFrame(tick);
  };
  frame = nextFrame(tick);
}

function quiet() {
  cancelFrame(frame);
  frame = 0;
  setAvatarLevel(0);
  if (avatarState().mood === 'speaking') setAvatarMood('reading');
}

function drop() {
  quiet();
  if (!playing) return;
  playing.audio.pause();
  playing.audio.removeAttribute('src');
  URL.revokeObjectURL(playing.url);
  playing = null;
}

// Stops whatever is being read, by either voice; a line still on its way is not played.
export function stopLine() {
  generation++;
  drop();
  stopSpeaking();
}

type Played = 'played' | 'off' | 'failed' | 'cancelled';

async function playServer(source: LineSource, rate: number, mine: number, onPlaying?: () => void, onProgress?: (played: number) => void): Promise<Played> {
  let res: Response;
  try {
    res = await fetch('/api/family/voice/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(source), credentials: 'same-origin', cache: 'no-store' });
  } catch {
    return generation === mine ? 'failed' : 'cancelled';
  }
  if (generation !== mine) return 'cancelled';
  if (!res.ok || !/^audio\//.test(res.headers.get('content-type') ?? '')) {
    const error = (await res.json().catch(() => ({})))?.error;
    return error === 'not_set_up' || error === 'voice_allowance_reached' ? 'off' : 'failed';
  }
  const blob = await res.blob().catch(() => null);
  if (generation !== mine) return 'cancelled';
  if (!blob) return 'failed';
  drop();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.playbackRate = rate;
  playing = { audio, url };
  return new Promise<Played>((resolve) => {
    const end = (how: Played) => {
      if (playing?.audio === audio) drop();
      resolve(generation === mine ? how : 'cancelled');
    };
    // W16-A4: the call measures the time to the first sound.
    audio.onplaying = () => {
      onPlaying?.();
      void route(audio).then((m) => {
        if (playing?.audio === audio && !audio.paused) drive(m ? () => rms(m) : synth);
      });
    };
    // W18-P1: how much of the line has played (0 to 1), for a screen that follows the voice (the server voice reports no
    // word boundaries, so an answer read as one line finds its sentence by this share of its text).
    audio.ontimeupdate = () => {
      if (onProgress && Number.isFinite(audio.duration) && audio.duration > 0) onProgress(Math.min(1, audio.currentTime / audio.duration));
    };
    audio.onended = () => end('played');
    // A phone that cannot decode the audio, or will not play it without a tap, would refuse every line the same way:
    // the rest of the visit uses its own voice, so no further line is asked for (each one takes a daily place).
    audio.onerror = () => end('off');
    audio.onpause = () => {
      if (generation !== mine) end('cancelled');
    };
    audio.play().catch(() => end('off'));
  });
}

// Reads one line: with the server voice when `mode` is 'server', else (or when it cannot) with the phone's own.
// Resolves when the line ends, with the voice to use for the next line; `cancelled` when stopLine() came first.
export async function speakLine(mode: VoiceMode, source: LineSource, phone: { text: string; lang: 'en' | 'hi'; rate: number; onWord?: (charIndex: number) => void; onPlaying?: () => void; onProgress?: (played: number) => void }): Promise<Spoken> {
  stopLine();
  const mine = generation;
  let next: VoiceMode = mode;
  if (mode === 'server') {
    const played = await playServer(source, phone.rate, mine, phone.onPlaying, phone.onProgress);
    if (played === 'played') return { cancelled: false, mode };
    if (played === 'cancelled') return { cancelled: true, mode };
    if (played === 'off') next = 'phone';
  }
  // The phone's own voice starts at once (the engine queues it); the call counts that as the first sound.
  phone.onPlaying?.();
  word = -1e9;
  drive(synth);
  await speak(phone.text, phone.lang, phone.rate, (c) => {
    word = now();
    phone.onWord?.(c);
  });
  if (generation === mine) quiet();
  return { cancelled: generation !== mine, mode: next };
}
