'use client';

import { setSpeechVolume, speak, stopSpeaking } from '../english/speech';
import { avatarState, setAvatarLevel, setAvatarMood } from '@/lib/family/avatar-state';

// Which voice reads a line aloud (C386): the server voice when Control has set one up, else the phone's own (speech.ts).
// The server voice reads only a line the server holds, named here by where it comes from (src/lib/family/voice-out.ts);
// the phone never sends the words. The audio is played from memory and dropped when the line ends or is stopped; the
// response is never cached. When the server voice is not set up, or the family's turns are used up, the rest of the
// visit uses the phone's voice and the screen says so; a single failure reads that one line with the phone's voice.

export type LineSource = { kind: 'chapter'; chapterKey: string; blockId: string; sentence: number } | { kind: 'live_line'; token: string } | { kind: 'live_turn'; sessionId: string; position: number } | { kind: 'call_line'; token: string } | { kind: 'tutor_answer'; messageId: string; from?: number; max?: number };
export type VoiceMode = 'server' | 'phone';
// v21: `blocked`, the browser would not start the sound without a tap (NotAllowedError): nothing was read, the voice stays
// the same, and the screen asks for a tap (the top button pulses) instead of an error.
export type Spoken = { cancelled: boolean; mode: VoiceMode; blocked?: true };

let generation = 0;
// `cancel`: ends the part's wait when it is stopped (its handlers are taken off the shared element first).
let playing: { audio: HTMLAudioElement; url: string; cancel?: () => void } | null = null;

// C511: the call's Speaker button: loud (1) or quiet. Applies to the server voice's audio, the line playing now included,
// and to the phone's own voice (speech.ts).
let volume = 1;
export function setLineVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (playing) playing.audio.volume = volume;
  setSpeechVolume(volume);
}

// W19-A: the tutor's mouth follows the voice. The server voice is measured: one AudioContext and AnalyserNode for the
// visit (made on the first line, resumed on each), the voice's <audio> routed through it, and the loudness (RMS) handed
// to the avatar every frame. v21: ONE <audio> element for the visit, routed into the analyser ONCE (a media element can
// be given to createMediaElementSource only once; a new element per part, routed after it had started playing, switched
// the sound's output mid-play: the click at each join), through a gain that fades each part in and out (~40 ms). The audio is routed only once the context runs, so a web view that will not start it plays
// as before. The phone's voice cannot be measured: each spoken word is a short pulse, and an engine that reports no
// words (or a context that will not run) gets a soft babble so the mouth still moves. Nothing here may break a line.
type Meter = { ctx: AudioContext; an: AnalyserNode; buf: Uint8Array };
type Route = { m: Meter; gain: GainNode | null };
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

// The one element the server voice plays through, made on the first line (or in the child's tap, unlockVoice).
let shared: HTMLAudioElement | null = null;
function element(): HTMLAudioElement {
  if (!shared) shared = new Audio();
  return shared;
}
// Routed once: the route once it is, `false` when it cannot be (the element then plays straight to the speaker).
let routed: Route | null | false = null;
function routeNow(audio: HTMLAudioElement): Route | null {
  if (routed) return routed;
  if (routed === false) return null;
  const m = getMeter();
  if (!m || m.ctx.state !== 'running') return null;
  try {
    const src = m.ctx.createMediaElementSource(audio);
    const gain = typeof m.ctx.createGain === 'function' ? m.ctx.createGain() : null;
    if (gain) {
      src.connect(gain);
      gain.connect(m.an);
    } else src.connect(m.an);
    routed = { m, gain };
    return routed;
  } catch {
    routed = false;
    return null;
  }
}
async function route(audio: HTMLAudioElement): Promise<Route | null> {
  if (routed || routed === false) return routed || null;
  const m = getMeter();
  if (!m) return null;
  try {
    if (m.ctx.state !== 'running') await m.ctx.resume();
  } catch {
    return null;
  }
  return routeNow(audio);
}
const FADE = 0.04;
// A part fades in from silence, and out over its last ~40 ms (`left`: the seconds still to play at this rate).
function fade(r: Route | null, left: number) {
  const g = r?.gain?.gain;
  if (!g || !r) return;
  try {
    const t = r.m.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(1, t + FADE);
    if (Number.isFinite(left) && left > FADE * 3) {
      g.setValueAtTime(1, t + left - FADE);
      g.linearRampToValueAtTime(0, t + left);
    }
  } catch {
    // A fade is a nicety; the line plays without it.
  }
}

// v21: per-part timings, to measure the gaps between parts: request start, audio ready, the server's own generation
// time (Server-Timing), the part's length and the silence before it. Logged in development, or on a phone with
// localStorage "fam:voice-debug" = "1"; never the words.
export type PartTiming = { key: string; asked: number; ready?: number; genMs?: number; playing?: number; ended?: number; seconds?: number; gapMs?: number };
export const voiceTimings: PartTiming[] = [];
let lastEnded = 0;
function debugOn(): boolean {
  try {
    if (process.env.NODE_ENV === 'development') return true;
    return typeof localStorage !== 'undefined' && localStorage.getItem('fam:voice-debug') === '1';
  } catch {
    return false;
  }
}
function timing(key: string): PartTiming {
  let t = voiceTimings.find((x) => x.key === key && x.ended === undefined);
  if (!t) {
    t = { key, asked: now() };
    voiceTimings.push(t);
    if (voiceTimings.length > 40) voiceTimings.shift();
  }
  return t;
}
function report(t: PartTiming) {
  if (!debugOn()) return;
  // eslint-disable-next-line no-console
  console.info('[voice]', { part: t.key.replace(/"messageId":"[^"]*",?/, ''), readyMs: t.ready !== undefined ? Math.round(t.ready - t.asked) : null, genMs: t.genMs ?? null, seconds: t.seconds ?? null, gapMs: t.gapMs ?? null });
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
  const p = playing;
  playing = null;
  const a = p.audio;
  a.onplaying = a.ontimeupdate = a.onended = a.onerror = a.onpause = null;
  a.pause();
  URL.revokeObjectURL(p.url);
  p.cancel?.();
}

// C508: whether a voice is reading now (a server line, a call's line or the phone's own): an answer read aloud by
// itself never starts over it.
export function voiceBusy(): boolean {
  try {
    return playing !== null || (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking);
  } catch {
    return false;
  }
}

// C508: called inside the child's own tap (Send, Try again). A phone that lets sound start only from a tap (iOS) then
// lets the answer's voice start by itself when it arrives: the phone's voice speaks an empty line, the audio context
// resumes. Silent; nothing here may break the tap.
export function unlockVoice() {
  try {
    const s = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    if (s && !s.speaking && typeof SpeechSynthesisUtterance === 'function') {
      const blank = new SpeechSynthesisUtterance('');
      blank.volume = 0;
      s.speak(blank);
    }
    const m = getMeter();
    // v21: the voice's one element is made inside the tap and routed once the context runs, so a phone that lets sound
    // start only from a tap lets this element play the answer when it arrives.
    const a = element();
    if (m) void Promise.resolve(m.ctx.state !== 'running' ? m.ctx.resume() : undefined).then(() => routeNow(a)).catch(() => undefined);
  } catch {
    // A phone with no voice engine: the Read aloud button stays.
  }
}

// Stops whatever is being read, by either voice; a line still on its way is not played.
export function stopLine() {
  prefetched.clear();
  halt();
}
function halt() {
  generation++;
  drop();
  stopSpeaking();
}

type Played = 'played' | 'off' | 'failed' | 'cancelled' | 'blocked';

// The next part's audio, asked for while the current part plays, so there is no silent gap between parts. Keyed by the line's
// source; taken (and removed) by playServer; dropped by stopLine.
type Got = { blob: Blob } | { off: true } | { failed: true };
const prefetched = new Map<string, Promise<Got>>();
async function getAudio(source: LineSource): Promise<Got> {
  const t = timing(JSON.stringify(source));
  const got = await askAudio(source, t);
  t.ready = now();
  return got;
}
async function askAudio(source: LineSource, t: PartTiming): Promise<Got> {
  let res: Response;
  try {
    res = await fetch('/api/family/voice/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(source), credentials: 'same-origin', cache: 'no-store' });
  } catch {
    return { failed: true };
  }
  if (!res.ok || !/^audio\//.test(res.headers.get('content-type') ?? '')) {
    const error = (await res.json().catch(() => ({})))?.error;
    return error === 'not_set_up' || error === 'voice_allowance_reached' ? { off: true } : { failed: true };
  }
  const gen = /dur=([\d.]+)/.exec(res.headers.get('server-timing') ?? '');
  if (gen) t.genMs = Math.round(Number(gen[1]));
  const blob = await res.blob().catch(() => null);
  return blob ? { blob } : { failed: true };
}
export function prefetchLine(source: LineSource): void {
  const key = JSON.stringify(source);
  if (!prefetched.has(key)) prefetched.set(key, getAudio(source));
}

async function playServer(source: LineSource, rate: number, mine: number, onPlaying?: () => void, onProgress?: (played: number) => void): Promise<Played> {
  const key = JSON.stringify(source);
  const got = await (prefetched.get(key) ?? getAudio(source));
  prefetched.delete(key);
  if (generation !== mine) return 'cancelled';
  if ('off' in got) return 'off';
  if ('failed' in got) return 'failed';
  const blob = got.blob;
  const t = timing(key);
  drop();
  const url = URL.createObjectURL(blob);
  const audio = element();
  // Routed before it plays when the context already runs (the child's tap started it), so no part switches output mid-play.
  routeNow(audio);
  audio.src = url;
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
  audio.volume = volume;
  const mineNow: NonNullable<typeof playing> = { audio, url };
  playing = mineNow;
  return new Promise<Played>((resolve) => {
    let settled = false;
    mineNow.cancel = () => end('cancelled');
    const end = (how: Played) => {
      if (settled) return;
      settled = true;
      if (playing?.audio === audio && playing.url === url) drop();
      if (how === 'played') {
        t.ended = lastEnded = now();
        report(t);
      }
      resolve(generation === mine ? how : 'cancelled');
    };
    // W16-A4: the call measures the time to the first sound.
    audio.onplaying = () => {
      if (t.playing === undefined) {
        t.playing = now();
        if (lastEnded > 0 && t.playing - lastEnded < 60_000) t.gapMs = Math.round(t.playing - lastEnded);
        if (Number.isFinite(audio.duration)) t.seconds = Math.round(audio.duration * 10) / 10;
      }
      onPlaying?.();
      void route(audio).then((r) => {
        if (playing?.audio !== audio || playing.url !== url || audio.paused) return;
        fade(r, (audio.duration - audio.currentTime) / (audio.playbackRate || 1));
        drive(r ? () => rms(r.m) : synth);
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
    // v21: a browser that will not start sound without a tap says NotAllowedError: the line is not read and the screen
    // asks for a tap; the server voice stays on. Anything else is a phone that cannot play it (the phone's voice).
    audio.play().catch((e: unknown) => end((e as { name?: string } | null)?.name === 'NotAllowedError' ? 'blocked' : 'off'));
  });
}

// Reads one line: with the server voice when `mode` is 'server', else (or when it cannot) with the phone's own.
// Resolves when the line ends, with the voice to use for the next line; `cancelled` when stopLine() came first.
export async function speakLine(mode: VoiceMode, source: LineSource, phone: { text: string; lang: 'en' | 'hi'; rate: number; onWord?: (charIndex: number) => void; onPlaying?: () => void; onProgress?: (played: number) => void }): Promise<Spoken> {
  halt();
  const mine = generation;
  let next: VoiceMode = mode;
  if (mode === 'server') {
    const played = await playServer(source, phone.rate, mine, phone.onPlaying, phone.onProgress);
    if (played === 'played') return { cancelled: false, mode };
    if (played === 'cancelled') return { cancelled: true, mode };
    if (played === 'blocked') return { cancelled: false, mode, blocked: true };
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
