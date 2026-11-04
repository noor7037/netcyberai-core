// The tutor's mood (W19-A, C464): one small store every screen writes and the avatar reads. Pure: no React, no
// network, no words. The screens say what is happening (the child is speaking, the tutor is thinking, speaking, a
// right answer landed); the avatar decides how to look. `level` is the loudness of the sound being played or heard,
// 0 to 1, set by whoever holds the AnalyserNode, so the mouth moves with the real voice and the ear with the child's.

export type AvatarMood =
  | 'idle' // nothing happening: blinks, breathes, glances
  | 'listening' // the microphone is open: leans in, ear glows with `level`
  | 'thinking' // an answer is being made: eyes up, a small pulse
  | 'speaking' // the voice is playing: the mouth follows `level`
  | 'reading' // the child is reading the answer: calm, follows the highlight
  | 'celebrating' // a right answer or a finished session: confetti once, big smile
  | 'encouraging' // a wrong answer or a stumble: warm, a nod, never a frown
  | 'sleeping'; // the tab is hidden or the room is quiet for a while

export type AvatarState = { mood: AvatarMood; level: number; since: number };

type Listener = (s: AvatarState) => void;

let state: AvatarState = { mood: 'idle', level: 0, since: 0 };
const listeners = new Set<Listener>();

const emit = () => {
  for (const l of listeners) l(state);
};

export function avatarState(): AvatarState {
  return state;
}

// Sets the mood. The same mood again is not an event (the avatar does not restart its animation).
export function setAvatarMood(mood: AvatarMood): void {
  if (state.mood === mood) return;
  state = { mood, level: mood === 'speaking' || mood === 'listening' ? state.level : 0, since: Date.now() };
  emit();
}

// Sets the loudness, 0 to 1, clamped. Called often (every animation frame while a voice plays): listeners must be cheap.
export function setAvatarLevel(level: number): void {
  const v = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  if (Math.abs(v - state.level) < 0.01) return;
  state = { ...state, level: v };
  emit();
}

// A one-off moment: celebrate or encourage, then back to the mood before it after `ms`. Returns a cancel.
export function avatarMoment(mood: 'celebrating' | 'encouraging', ms = 1800): () => void {
  const before = state.mood === 'celebrating' || state.mood === 'encouraging' ? 'idle' : state.mood;
  setAvatarMood(mood);
  const t = setTimeout(() => {
    if (state.mood === mood) setAvatarMood(before);
  }, ms);
  return () => clearTimeout(t);
}

export function subscribeAvatar(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// Tests and the harness: back to the start.
export function resetAvatar(): void {
  state = { mood: 'idle', level: 0, since: 0 };
  emit();
}
