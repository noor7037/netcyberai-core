// The Draw studio's engagement mode for the youngest (C517, founder 13 Nov): LKG to Class 4 get a guided studio that
// plays short sounds, reads its words aloud and walks the child through a template one step at a time; Class 5 and up
// get the standard studio. Everything here runs on the phone: the sounds are made by the browser's own audio (no sound
// files to download or license), the voice is the phone's own text-to-speech (no AI call, no cost), and the on/off
// choice is kept on the phone. Nothing is sent anywhere.

import { voiceTagOf, type LangCode } from './languages';

export const ENGAGE_UPTO_CLASS = 4;
export const engageMode = (classLevel: number): boolean => classLevel <= ENGAGE_UPTO_CLASS;

// ---- guided steps -----------------------------------------------------------------------------------------------------

// One instruction: the words (already in the child's language) and, optionally, a point on the outline (its 400 x 400
// viewBox) where a ring shows the child where to work.
export type GuideStep = { text: string; at?: { x: number; y: number } };

// A template's own steps when it has them; otherwise built from its task and word bank: the task, one step per label
// (at most five, so a small child is not given a list), then the finish.
export function guidedSteps(
  t: { task: string; labels: readonly string[]; steps?: readonly GuideStep[] },
  words: { colourIt: string; finish: string }
): GuideStep[] {
  const end: GuideStep = { text: words.finish };
  if (t.steps && t.steps.length > 0) return [...t.steps, end];
  return [{ text: t.task }, ...t.labels.slice(0, 5).map((word) => ({ text: words.colourIt.replace('{word}', word) })), end];
}

// The next step may open only after the child has drawn something on this one (no skipping ahead); the last step has no
// next.
export const canAdvance = (index: number, total: number, drewThisStep: boolean): boolean => index < total - 1 && drewThisStep;

// ---- sound on or off, per phone ------------------------------------------------------------------------------------

const SOUND_KEY = 'ncf.draw.sound';
// On unless the child or a parent turned it off on this phone (founder: on by default).
export function readSoundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function writeSoundOn(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Not kept: on again next time.
  }
}

// ---- the sounds ---------------------------------------------------------------------------------------------------------

export type Sfx = 'tap' | 'stroke' | 'step' | 'success';
// Each sound is a few short notes (Hz, start s, length s): soft, short and never loud. The volume follows the phone's
// media volume; a silenced phone stays silent.
export const SFX: Record<Sfx, readonly [number, number, number][]> = {
  tap: [[660, 0, 0.06]],
  stroke: [[520, 0, 0.07], [780, 0.05, 0.08]],
  step: [[523, 0, 0.1], [659, 0.09, 0.1], [784, 0.18, 0.14]],
  success: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1047, 0.3, 0.3]],
};

let ctx: AudioContext | null = null;

// Made on the first tap (browsers allow sound only after one), then reused: nothing to load later.
function audio(): AudioContext | null {
  if (ctx) return ctx;
  const W = typeof window === 'undefined' ? null : (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
  const C = W?.AudioContext ?? W?.webkitAudioContext;
  if (!C) return null;
  try {
    ctx = new C();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function playSfx(kind: Sfx, on: boolean): void {
  if (!on || !unlocked) return;
  const a = audio();
  if (!a) return;
  try {
    if (a.state === 'suspended') void a.resume();
    const now = a.currentTime;
    for (const [hz, at, len] of SFX[kind]) {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'sine';
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, now + at);
      g.gain.exponentialRampToValueAtTime(0.12, now + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + at + len);
      o.connect(g);
      g.connect(a.destination);
      o.start(now + at);
      o.stop(now + at + len + 0.02);
    }
  } catch {
    // No sound on this phone: the studio works the same.
  }
}

// ---- the unlock (C519) -------------------------------------------------------------------------------------------------

// iOS Safari and Android Chrome allow sound and speech only after a tap. Until the child's first tap in the studio nothing
// is spoken or played; that tap (the speaker, or the first touch on the studio) resumes the audio and primes the voice.
let unlocked = false;
export const isUnlocked = (): boolean => unlocked;

// Called inside a tap. Returns true on the call that unlocked (the first one); later calls only keep the audio running.
export function unlockSound(): boolean {
  const first = !unlocked;
  unlocked = true;
  try {
    const a = audio();
    if (a) {
      if (a.state === 'suspended') void a.resume();
      if (first) {
        // A silent blip: some phones open the output only once something has been started in the tap.
        const o = a.createOscillator();
        const g = a.createGain();
        g.gain.value = 0;
        o.connect(g);
        g.connect(a.destination);
        o.start();
        o.stop(a.currentTime + 0.02);
      }
    }
    if (first && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  } catch {
    // No audio on this phone: the studio works the same.
  }
  return first;
}

// ---- the music (C519) --------------------------------------------------------------------------------------------------

// A soft looping melody made from the browser's audio (no file): sixteen notes of a gentle pentatonic scale, one every
// MELODY_BEAT seconds, each a sine with a slow attack and release, far quieter than the effects.
export const MELODY_BEAT = 0.7;
const PENTATONIC_HZ = [262, 294, 330, 392, 440, 523] as const;
const PHRASE = [0, 2, 4, 2, 1, 3, 2, 0, 4, 3, 2, 1, 0, 1, 2, 2] as const;
export const MELODY_LENGTH = PHRASE.length;
export const MUSIC_LEVEL = 0.035;
const MUSIC_DUCKED = 0.3;

// The notes whose beat is in [fromBeat, fromBeat + count): the phrase repeats for ever.
export function melodySchedule(fromBeat: number, count: number): { hz: number; beat: number; len: number }[] {
  const out: { hz: number; beat: number; len: number }[] = [];
  for (let b = fromBeat; b < fromBeat + count; b++) out.push({ hz: PENTATONIC_HZ[PHRASE[((b % MELODY_LENGTH) + MELODY_LENGTH) % MELODY_LENGTH]], beat: b, len: MELODY_BEAT * 1.3 });
  return out;
}

let musicGain: GainNode | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;
export const musicPlaying = (): boolean => musicTimer !== null;

export function startMusic(): void {
  if (musicTimer || !unlocked) return;
  const a = audio();
  if (!a) return;
  try {
    if (a.state === 'suspended') void a.resume();
    if (!musicGain) {
      musicGain = a.createGain();
      musicGain.connect(a.destination);
    }
    musicGain.gain.value = speaking ? MUSIC_DUCKED : 1;
    const out = musicGain;
    const t0 = a.currentTime + 0.1;
    let next = 0;
    const tick = () => {
      while (t0 + next * MELODY_BEAT < a.currentTime + 1.5) {
        const [n] = melodySchedule(next, 1);
        const at = t0 + n.beat * MELODY_BEAT;
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = 'sine';
        o.frequency.value = n.hz;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(MUSIC_LEVEL, at + 0.12);
        g.gain.linearRampToValueAtTime(0.0001, at + n.len);
        o.connect(g);
        g.connect(out);
        o.start(at);
        o.stop(at + n.len + 0.02);
        next += 1;
      }
    };
    tick();
    musicTimer = setInterval(tick, 300);
  } catch {
    stopMusic();
  }
}

export function stopMusic(): void {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

// ---- the voice --------------------------------------------------------------------------------------------------------

export type VoiceLike = { lang: string };

// The phone's voice for a language: one in the language's Indian tag (hi-IN) first, then any voice of the language
// (en-GB for English). Null when the phone has none, as for Odia on most phones.
export function pickVoice<T extends VoiceLike>(voices: readonly T[], lang: LangCode): T | null {
  const tag = voiceTagOf(lang).toLowerCase();
  const norm = (v: T) => v.lang.toLowerCase().replace('_', '-');
  return voices.find((v) => norm(v) === tag) ?? voices.find((v) => norm(v).split('-')[0] === lang) ?? null;
}

// What the server voice is asked: a template's id, the step's place and the language, never words.
export type DrawLineAsk = { templateId: string; step: number; lang: 'en' | 'hi' };
// Each (template, step, language) is fetched once per page.
export const lineKey = (a: DrawLineAsk): string => `${a.templateId}#${a.step}#${a.lang}`;

// How a line was spoken: 'locked' (no tap yet, nothing spoken), by the 'phone' voice, by the 'server' voice, or 'none'
// (no voice anywhere: the screen says so).
export type SpeakOutcome = 'locked' | 'phone' | 'server' | 'none';

export type SpeechDeps = {
  unlocked: () => boolean;
  voices: () => Promise<VoiceLike[]>;
  phone: (text: string, lang: LangCode, voice: VoiceLike) => Promise<void>;
  server: (ask: DrawLineAsk) => Promise<boolean>;
  stale: () => boolean;
};

// The order a line is spoken in: nothing before the first tap; the phone's own voice when it has one for the language;
// otherwise the server voice (only for a template step, which the server holds); otherwise 'none'.
export async function speakWith(deps: SpeechDeps, text: string, lang: LangCode, ask: DrawLineAsk | null): Promise<SpeakOutcome> {
  if (!text.trim() || !deps.unlocked()) return 'locked';
  const voice = pickVoice(await deps.voices(), lang);
  if (deps.stale()) return 'locked';
  if (voice) {
    await deps.phone(text, lang, voice);
    return 'phone';
  }
  if (ask && (await deps.server(ask))) return 'server';
  return 'none';
}

const hasSynth = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

let voiceCache: SpeechSynthesisVoice[] = [];
let voicesWaited = false;
// Chrome lists its voices a moment after the page starts: wait for `voiceschanged` once, but not for ever (a phone with no
// voice at all is not waited for again on the next line).
function loadVoices(timeoutMs = 1500): Promise<VoiceLike[]> {
  if (!hasSynth()) return Promise.resolve([]);
  const s = window.speechSynthesis;
  if (voiceCache.length > 0) return Promise.resolve(voiceCache);
  const now = s.getVoices();
  if (now.length > 0) return Promise.resolve((voiceCache = now));
  if (voicesWaited) return Promise.resolve([]);
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const done = () => {
      if (timer) clearTimeout(timer);
      voicesWaited = true;
      s.removeEventListener?.('voiceschanged', done);
      resolve((voiceCache = s.getVoices()));
    };
    s.addEventListener?.('voiceschanged', done);
    timer = setTimeout(done, timeoutMs);
  });
}

// ---- speaking state and the music's ducking ----

let speaking = false;
const speakingListeners = new Set<(on: boolean) => void>();
export function onSpeaking(cb: (on: boolean) => void): () => void {
  speakingListeners.add(cb);
  return () => void speakingListeners.delete(cb);
}
function setSpeaking(on: boolean): void {
  if (speaking === on) return;
  speaking = on;
  try {
    if (musicGain && ctx) musicGain.gain.setTargetAtTime(on ? MUSIC_DUCKED : 1, ctx.currentTime, 0.15);
  } catch {
    // The music stays at its level.
  }
  speakingListeners.forEach((cb) => cb(on));
}

// ---- the server voice, one fetch per line ----

const lineAudio = new Map<string, Promise<AudioBuffer | null>>();
let lineSource: AudioBufferSourceNode | null = null;

function fetchLine(ask: DrawLineAsk): Promise<AudioBuffer | null> {
  const key = lineKey(ask);
  const kept = lineAudio.get(key);
  if (kept) return kept;
  const p = (async () => {
    const a = audio();
    if (!a) return null;
    const res = await fetch('/api/family/voice/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'draw', ...ask }), credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    return await new Promise<AudioBuffer>((ok, bad) => void a.decodeAudioData(bytes, ok, bad));
  })().catch(() => null);
  lineAudio.set(key, p);
  // A failure is not kept: the next ask tries again.
  void p.then((b) => b === null && lineAudio.delete(key));
  return p;
}

async function playServerLine(ask: DrawLineAsk, stale: () => boolean): Promise<boolean> {
  const buffer = await fetchLine(ask);
  const a = audio();
  if (!buffer || !a) return false;
  if (stale()) return true;
  try {
    if (a.state === 'suspended') void a.resume();
    const src = a.createBufferSource();
    src.buffer = buffer;
    src.connect(a.destination);
    src.onended = () => {
      if (lineSource === src) {
        lineSource = null;
        setSpeaking(false);
      }
    };
    lineSource = src;
    setSpeaking(true);
    src.start();
    return true;
  } catch {
    return false;
  }
}

// ---- the phone's voice ----

// Chrome drops a line spoken straight after cancel(): wait a moment between them.
export const CANCEL_GAP_MS = 120;

function phoneSpeak(text: string, lang: LangCode, voice: VoiceLike, stale: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    try {
      const s = window.speechSynthesis;
      s.cancel();
      setTimeout(() => {
        if (stale()) return resolve();
        try {
          const u = new SpeechSynthesisUtterance(text);
          u.lang = voiceTagOf(lang);
          u.voice = voice as SpeechSynthesisVoice;
          u.rate = 0.9;
          u.pitch = 1.1;
          u.onstart = () => setSpeaking(true);
          u.onend = () => setSpeaking(false);
          u.onerror = () => setSpeaking(false);
          s.speak(u);
        } catch {
          setSpeaking(false);
        }
        resolve();
      }, CANCEL_GAP_MS);
    } catch {
      resolve();
    }
  });
}

let seq = 0;

// Reads words aloud (after the first tap), in the child's language: the phone's voice when it has one, else the server's
// for a template step. A new line stops the one before. The result says how it went, so the screen can tell the child
// when no sound is possible.
export async function speak(text: string, lang: LangCode, on: boolean, ask: DrawLineAsk | null = null): Promise<SpeakOutcome> {
  if (!on) return 'locked';
  const mine = ++seq;
  stopSpeakingNow();
  try {
    return await speakWith(
      { unlocked: isUnlocked, voices: loadVoices, phone: (t, l, v) => phoneSpeak(t, l, v, () => mine !== seq), server: (q) => playServerLine(q, () => mine !== seq), stale: () => mine !== seq },
      text,
      lang,
      ask
    );
  } catch {
    return 'none';
  }
}

function stopSpeakingNow(): void {
  try {
    if (hasSynth()) window.speechSynthesis.cancel();
    if (lineSource) {
      const s = lineSource;
      lineSource = null;
      s.onended = null;
      s.stop();
    }
  } catch {
    // Nothing to stop.
  }
  setSpeaking(false);
}

export function stopSpeaking(): void {
  seq += 1;
  stopSpeakingNow();
}

// Stops the music and the voice while the page is hidden, and starts the music again when it is back (if it is wanted).
export function watchVisibility(musicWanted: () => boolean): () => void {
  if (typeof document === 'undefined') return () => {};
  const on = () => {
    if (document.hidden) {
      stopMusic();
      stopSpeaking();
    } else if (musicWanted()) startMusic();
  };
  document.addEventListener('visibilitychange', on);
  return () => document.removeEventListener('visibilitychange', on);
}

// ---- the guide's place, per child and class, on this phone -------------------------------------------------------------

// Where the child stopped in a template's steps, so it opens on the same step next time. Completed templates are counted
// by the server already (family.draw_completions, C514) and sent when the phone is online (done-queue.ts).
const STEP_KEY = (child: string, classLevel: number) => `ncf.draw.steps.${child}.${classLevel}`;

export function readStep(child: string, classLevel: number, templateId: string): number {
  try {
    const v = JSON.parse(localStorage.getItem(STEP_KEY(child, classLevel)) ?? '{}') as Record<string, unknown>;
    const n = v[templateId];
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}
export function writeStep(child: string, classLevel: number, templateId: string, index: number): void {
  try {
    const v = JSON.parse(localStorage.getItem(STEP_KEY(child, classLevel)) ?? '{}') as Record<string, number>;
    v[templateId] = index;
    localStorage.setItem(STEP_KEY(child, classLevel), JSON.stringify(v));
  } catch {
    // Not kept: the template opens on its first step.
  }
}
