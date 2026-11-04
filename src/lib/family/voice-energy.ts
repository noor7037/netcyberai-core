// Is there a voice in the recording? (W17-B4) Whisper turns a quiet room into words ("Thank you." on 2 Nov 2026), and
// the transcription is already paid for by the time the words are checked. So the phone measures the sound while it
// records and sends nothing when no voice was there. Pure arithmetic, no browser API: the recorder feeds it the
// analyser's time-domain samples (-1 to 1) about ten times a second.

// About -36 dBFS (20 * log10(0.015)): a phone held at arm's length in a room speaks well above it, and room hiss, a fan
// or a hum sits well below it.
export const SPEECH_RMS = 0.015;
// 300 ms of voice at one sample every 100 ms: a single click or knock is one loud frame and is not speech.
export const MIN_LOUD_FRAMES = 3;

export function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export class EnergyMeter {
  private top = 0;
  private loud = 0;
  // The frame's loudness, returned too, so the endpointer (W19-B) reads the same number without measuring again.
  add(samples: Float32Array): number {
    const r = rms(samples);
    if (r > this.top) this.top = r;
    if (r >= SPEECH_RMS) this.loud++;
    return r;
  }
  get peak(): number {
    return this.top;
  }
  get loudFrames(): number {
    return this.loud;
  }
  heardSpeech(): boolean {
    return this.loud >= MIN_LOUD_FRAMES;
  }
}
