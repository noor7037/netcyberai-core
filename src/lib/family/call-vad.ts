import { SPEECH_RMS } from './voice-energy';

// The call's open microphone (C511): who is talking, and when has the child finished? The microphone stays open for the
// whole call; this decides the turns from the loudness (RMS) of each frame the call's analyser measures, about twenty
// a second. Pure arithmetic, no browser API, so it is tested on its own with made-up loudness sequences.
//
//   idle      nobody is talking; the room's own noise is learnt here (the noise floor)
//   onset     a frame rose above the speech line: the call starts recording, but this may still be a cough or a door
//   speech    the voice lasted long enough to be a voice (`start`): this is where the tutor is interrupted
//   trailing  quiet after the voice: a pause between words, or the end of the turn
//
// `push` returns what changed: `onset` (begin recording), `cancel` (the onset faded: throw the recording away), `start`
// (a voice: interrupt the tutor), `end` (the turn is over: send it), `drop` (it was too short to be a question: a
// cough, a knock; throw it away). The microphone keeps listening after each of them.

export const VAD = {
  frameMs: 50,
  // The speech line is this many times the room's noise floor, and never under the quietest voice (SPEECH_RMS, -36 dBFS).
  noiseRatio: 3,
  minSpeechRms: SPEECH_RMS,
  // The first frames of the call only learn the room (a fan, a road): their mean is the first noise floor.
  calibrateMs: 300,
  // The noise floor falls fast to a quieter room and rises slowly to a louder one, within these bounds; during a sound
  // it still creeps up, very slowly, so a noise that starts mid-call (a fan switched on) stops being a voice.
  floorStart: 0.004,
  floorMin: 0.002,
  floorMax: 0.05,
  floorFall: 0.2,
  floorRise: 0.02,
  floorCreep: 0.003,
  // Once a voice, a frame stays a voice down to this share of the line (a voice trailing off is not silence).
  holdFactor: 0.7,
  // How long a sound must last to be a voice: longer while the tutor's own audio plays (echo, C511 barge-in).
  onsetMs: 150,
  tutorOnsetMs: 300,
  // While the tutor's audio plays the speech line is raised this many times: the echo canceller removes most of the
  // speaker from the microphone, and what is left is quieter than a child talking over it.
  tutorFactor: 2,
  // A quiet frame inside the onset is forgiven up to this long (a consonant).
  onsetGapMs: 100,
  // Shorter than this from onset to the last voiced frame is not a question.
  minSpeechMs: 400,
  // This much quiet after the voice ends the turn (a pause between words is shorter).
  endSilenceMs: 900,
  // A turn is sent at this length even if the child is still talking; the next words begin the next turn.
  maxTurnMs: 30_000,
} as const;

export type VadState = 'idle' | 'onset' | 'speech' | 'trailing';
export type VadEvent = 'onset' | 'cancel' | 'start' | 'end' | 'drop' | null;
export type VadOptions = Partial<{ -readonly [K in keyof typeof VAD]: number }>;

// The speech line for a frame: above the room's noise, raised while the tutor's audio plays.
export function speechLine(floor: number, tutorPlaying: boolean, o: typeof VAD = VAD): number {
  const line = Math.max(o.minSpeechRms, floor * o.noiseRatio);
  return tutorPlaying ? line * o.tutorFactor : line;
}

export class TurnDetector {
  private readonly o: typeof VAD;
  private maxTurn: number;
  state: VadState = 'idle';
  floor: number;
  private calibrated = 0;
  private calSum = 0;
  private turnMs = 0;
  private onsetRun = 0;
  private gap = 0;
  private voicedMs = 0;
  private quiet = 0;

  constructor(options: VadOptions = {}) {
    this.o = { ...VAD, ...options } as typeof VAD;
    this.floor = this.o.floorStart;
    this.maxTurn = this.o.maxTurnMs;
  }

  // The day's speaking seconds can make a turn shorter than maxTurnMs.
  setMaxTurn(ms: number) {
    this.maxTurn = Math.max(this.o.frameMs, Math.min(this.o.maxTurnMs, ms));
  }

  // Muting, or the call ending: whatever was being heard is forgotten (the noise floor is kept).
  reset() {
    this.state = 'idle';
    this.turnMs = this.onsetRun = this.gap = this.voicedMs = this.quiet = 0;
  }

  // How long the turn has been heard so far (onset to now), for the seconds the turn is counted as.
  get heardMs(): number {
    return this.turnMs;
  }

  push(rms: number, tutorPlaying = false): VadEvent {
    const o = this.o;
    const f = o.frameMs;
    const r = Number.isFinite(rms) && rms > 0 ? rms : 0;
    if (this.calibrated < o.calibrateMs) {
      this.calibrated += f;
      this.calSum += r;
      if (this.calibrated >= o.calibrateMs) this.floor = this.clampFloor(this.calSum / (this.calibrated / f));
      return null;
    }
    const line = speechLine(this.floor, tutorPlaying, o);
    if (this.state === 'idle') {
      if (r >= line) {
        this.state = 'onset';
        this.turnMs = f;
        this.onsetRun = f;
        this.gap = 0;
        return this.onsetRun >= this.need(tutorPlaying) ? this.confirm() : 'onset';
      }
      // The room's noise: falls fast to a quiet room, rises slowly (a voice never moves it, being above the line).
      this.floor = this.clampFloor(this.floor + (r - this.floor) * (r < this.floor ? o.floorFall : o.floorRise));
      return null;
    }
    this.floor = this.clampFloor(this.floor + (r - this.floor) * (r < this.floor ? o.floorFall : o.floorCreep));
    this.turnMs += f;
    if (this.state === 'onset') {
      if (r >= line) {
        this.onsetRun += f;
        this.gap = 0;
        if (this.onsetRun >= this.need(tutorPlaying)) return this.confirm();
        return null;
      }
      this.gap += f;
      if (this.gap > o.onsetGapMs) {
        this.reset();
        return 'cancel';
      }
      return null;
    }
    // speech or trailing: hysteresis, a voice trailing off under the line still counts down to holdFactor of it.
    if (r >= line * o.holdFactor) {
      this.voicedMs = this.turnMs;
      this.quiet = 0;
      this.state = 'speech';
    } else {
      this.quiet += f;
      this.state = 'trailing';
    }
    if (this.turnMs >= this.maxTurn) return this.finish();
    if (this.quiet >= o.endSilenceMs) return this.finish();
    return null;
  }

  private clampFloor(v: number) {
    return Math.min(this.o.floorMax, Math.max(this.o.floorMin, v));
  }

  private need(tutorPlaying: boolean) {
    return tutorPlaying ? this.o.tutorOnsetMs : this.o.onsetMs;
  }

  private confirm(): VadEvent {
    this.state = 'speech';
    this.voicedMs = this.turnMs;
    this.quiet = 0;
    return 'start';
  }

  private finish(): VadEvent {
    const long = this.voicedMs >= this.o.minSpeechMs;
    this.reset();
    return long ? 'end' : 'drop';
  }
}

// Barge-in (C511): the child's voice is confirmed (`start`) while the tutor is busy. What happens to the tutor's turn:
//   none       the tutor was idle: this is simply the next turn
//   continue   the tutor had not begun its answer (the words were still being heard, the answer was being written, or
//              only the short acknowledgement was playing): the child had not finished, so the voice and the answer are
//              stopped and the words already heard are carried into this turn, asked as one question
//   interrupt  the tutor was saying its answer: the voice stops at once, the unsaid sentences are dropped, and the
//              child's speech is the next turn
export type TutorBusy = 'idle' | 'hearing' | 'thinking' | 'speaking';
export function bargeIn(busy: TutorBusy, answerStarted: boolean): 'none' | 'continue' | 'interrupt' {
  if (busy === 'idle') return 'none';
  if (busy === 'speaking' && answerStarted) return 'interrupt';
  return 'continue';
}

// The words carried from a turn the child talked over before the answer began, joined with the new ones.
export function carryWords(carried: string, text: string): string {
  return [carried, text].map((s) => s.trim()).filter(Boolean).join(' ');
}

// The call's ear (C511): the turn detector behind the Mute switch. Muted, no frame is heard and no turn is sent; muting
// forgets whatever was being heard (`mute` returns true when a recording under way must be thrown away).
export class CallEar {
  readonly detector: TurnDetector;
  private muted = false;
  private listening = false;
  constructor(options: VadOptions = {}) {
    this.detector = new TurnDetector(options);
  }
  get isMuted() {
    return this.muted;
  }
  mute(on: boolean): boolean {
    this.muted = on;
    const hearing = this.detector.state !== 'idle' || this.listening;
    this.detector.reset();
    this.listening = false;
    return hearing;
  }
  frame(rms: number, tutorPlaying = false): VadEvent {
    if (this.muted) return null;
    const ev = this.detector.push(rms, tutorPlaying);
    if (ev === 'onset' || ev === 'start') this.listening = true;
    else if (ev) this.listening = false;
    return ev;
  }
}
