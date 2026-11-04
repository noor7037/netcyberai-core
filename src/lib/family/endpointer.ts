import { MIN_LOUD_FRAMES, SPEECH_RMS } from './voice-energy';

// When has the child finished speaking? (W19-B) The microphone no longer waits for a tap: the recorder feeds this the
// loudness (RMS) of each frame the EnergyMeter already measures, about ten a second, and stops by itself on `done`.
//   speaking  the frame is a voice
//   silence   a quiet frame (before the child begins, or a pause between words)
//   done      a voice was heard and then 1.1 s of quiet followed it; or the cap; or nothing at all was said for 8 s
// A pause between words is shorter than 1.1 s; the end of a question is longer. `heard` says whether a voice came at all:
// a `done` with nothing heard is a quiet room and is not sent (the server's own nothing_heard stays behind it).
// Pure arithmetic, no browser API, so it is tested on its own.

export const ENDPOINT_SILENCE_MS = 1100;
export const ENDPOINT_NO_SPEECH_MS = 8000;
// A little under the speech line, so a voice trailing off does not flicker between speaking and silence.
const QUIET_FACTOR = 0.8;

export type EndpointState = 'speaking' | 'silence' | 'done';
export type EndpointOptions = { frameMs?: number; silenceMs?: number; noSpeechMs?: number; maxMs?: number; speechRms?: number; minSpeechFrames?: number };

export class Endpointer {
  private readonly frameMs: number;
  private readonly silenceMs: number;
  private readonly noSpeechMs: number;
  private readonly maxMs: number;
  private readonly loudLine: number;
  private readonly quietLine: number;
  private readonly minSpeech: number;
  private elapsed = 0;
  private loud = 0;
  private quietRun = 0;
  private wasLoud = false;
  private finished = false;

  constructor({ frameMs = 100, silenceMs = ENDPOINT_SILENCE_MS, noSpeechMs = ENDPOINT_NO_SPEECH_MS, maxMs = 60_000, speechRms = SPEECH_RMS, minSpeechFrames = MIN_LOUD_FRAMES }: EndpointOptions = {}) {
    this.frameMs = frameMs;
    this.silenceMs = silenceMs;
    this.noSpeechMs = noSpeechMs;
    this.maxMs = maxMs;
    this.loudLine = speechRms;
    this.quietLine = speechRms * QUIET_FACTOR;
    this.minSpeech = minSpeechFrames;
  }

  // A voice has been heard: enough loud frames that it is not one click or knock.
  get heard(): boolean {
    return this.loud >= this.minSpeech;
  }

  push(rms: number): EndpointState {
    if (this.finished) return 'done';
    this.elapsed += this.frameMs;
    const r = Number.isFinite(rms) ? rms : 0;
    // Hysteresis: once loud, a frame stays a voice until it falls under the lower line.
    const loud = r >= this.loudLine || (this.wasLoud && r >= this.quietLine);
    this.wasLoud = loud;
    if (loud) {
      this.loud++;
      this.quietRun = 0;
    } else this.quietRun += this.frameMs;
    if (this.elapsed >= this.maxMs) return this.end();
    if (this.heard && this.quietRun >= this.silenceMs) return this.end();
    // No voice yet after 8 s (a click or two is not one), and not in the middle of a sound: the room is quiet.
    if (!this.heard && this.elapsed >= this.noSpeechMs && this.quietRun >= this.silenceMs) return this.end();
    return loud ? 'speaking' : 'silence';
  }

  private end(): EndpointState {
    this.finished = true;
    return 'done';
  }
}
