// The Draw studio's engagement mode for the youngest (C517, founder 13 Nov): LKG to Class 4 get a guided studio that
// plays short sounds, reads its words aloud and walks the child through a template one step at a time; Class 5 and up
// get the standard studio. Everything here runs on the phone: the sounds are made by the browser's own audio (no sound
// files to download or license), the voice is the phone's own text-to-speech (no AI call, no cost), and the on/off
// choice is kept on the phone. Nothing is sent anywhere.

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
  if (!on) return;
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

// ---- the voice --------------------------------------------------------------------------------------------------------

// Reads words aloud with the phone's own voice, in the child's language (an Indian voice when the phone has one). A new
// line stops the one before, so the voice never talks over itself.
export function speak(text: string, lang: 'en' | 'hi', on: boolean): void {
  if (!on || !text.trim() || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const s = window.speechSynthesis;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    const voice = s.getVoices().find((v) => v.lang === u.lang) ?? s.getVoices().find((v) => v.lang.startsWith(lang));
    if (voice) u.voice = voice;
    u.rate = 0.9;
    u.pitch = 1.1;
    s.speak(u);
  } catch {
    // No voice on this phone: the words stay on screen.
  }
}

export function stopSpeaking(): void {
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  } catch {
    // Nothing to stop.
  }
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
