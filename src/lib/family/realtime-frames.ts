// The Gemini Live wire format (W19-B, B2), pure: what the phone sends on the constrained socket and what it makes of
// what comes back. The socket is opened with the ephemeral token the server minted (POST /api/family/voice/call/token);
// the token's `bidiGenerateContentSetup` already holds the model, the audio-only answer, the child-safety instruction
// and the two transcriptions, so the phone's setup names the model and nothing else (no system text from the phone).
//
// Field names follow Google's Live API reference (https://ai.google.dev/api/live); the lines below are recalled from it,
// not copied, because the page could not be fetched from the build session (ai.google.dev is outside its network):
//   "BidiGenerateContentSetup ... model: Required. The model's resource name ... Format: models/{model}"
//   "BidiGenerateContentRealtimeInput ... audio: These form the realtime audio input stream." (a Blob: mimeType, data)
//   "audioStreamEnd: Indicates that the audio stream has ended, e.g. because the microphone was turned off."
//   "BidiGenerateContentServerContent ... modelTurn, turnComplete, interrupted, generationComplete,
//    inputTranscription, outputTranscription"
//   "GoAway ... timeLeft: The remaining time before the connection will be terminated as ABORTED."
// Input audio is "raw 16 bit PCM audio at 16kHz little-endian"; output audio is 24 kHz, the same encoding.
// UNVERIFIED against a live socket: confirm each name against the reference page; the founder's phone is the test.

export const LIVE_IN_RATE = 16_000;
export const LIVE_OUT_RATE = 24_000;
export const LIVE_IN_MIME = `audio/pcm;rate=${LIVE_IN_RATE}`;

export type LiveEvent =
  | { t: 'ready' }
  | { t: 'audio'; data: string; rate: number }
  | { t: 'heard'; text: string }
  | { t: 'said'; text: string }
  | { t: 'interrupted' }
  | { t: 'turn_complete' }
  | { t: 'go_away'; ms: number | null }
  | { t: 'error'; message: string };

// The socket's address with the token: an ephemeral token goes as `access_token`, never as `key`.
export function liveSocketUrl(url: string, token: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
}

export function setupMessage(model: string): string {
  return JSON.stringify({ setup: { model: model.startsWith('models/') ? model : `models/${model}` } });
}

export function audioMessage(base64: string): string {
  return JSON.stringify({ realtimeInput: { audio: { mimeType: LIVE_IN_MIME, data: base64 } } });
}

// Sent when the child pauses the microphone, so the model does not wait for more sound.
export function audioEndMessage(): string {
  return JSON.stringify({ realtimeInput: { audioStreamEnd: true } });
}

const rateOf = (mime: unknown): number => {
  const m = typeof mime === 'string' ? /rate=(\d+)/.exec(mime) : null;
  return m ? Number(m[1]) : LIVE_OUT_RATE;
};

// "10s", "1.5s" (protobuf Duration as JSON) to milliseconds.
const durationMs = (v: unknown): number | null => {
  if (typeof v !== 'string') return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(v);
  return m ? Math.round(Number(m[1]) * 1000) : null;
};

const textOf = (v: unknown): string | null => {
  const t = (v as { text?: unknown } | null)?.text;
  return typeof t === 'string' && t ? t : null;
};

// One server message (already JSON-parsed, or its text) into the events it carries, in the order the phone must act on
// them: an interruption before anything else, audio and words, then the end of the turn. Anything unknown is ignored.
export function parseLiveFrame(frame: unknown): LiveEvent[] {
  let msg: unknown = frame;
  if (typeof frame === 'string') {
    try {
      msg = JSON.parse(frame);
    } catch {
      return [];
    }
  }
  if (!msg || typeof msg !== 'object') return [];
  const m = msg as Record<string, unknown>;
  const out: LiveEvent[] = [];
  if (m.setupComplete !== undefined) out.push({ t: 'ready' });
  const sc = m.serverContent as Record<string, unknown> | undefined;
  if (sc && typeof sc === 'object') {
    if (sc.interrupted === true) out.push({ t: 'interrupted' });
    const heard = textOf(sc.inputTranscription);
    if (heard) out.push({ t: 'heard', text: heard });
    const parts = (sc.modelTurn as { parts?: unknown } | undefined)?.parts;
    if (Array.isArray(parts)) {
      for (const p of parts) {
        const inline = (p as { inlineData?: { mimeType?: unknown; data?: unknown } } | null)?.inlineData;
        if (inline && typeof inline.data === 'string' && inline.data && (typeof inline.mimeType !== 'string' || inline.mimeType.startsWith('audio/'))) {
          out.push({ t: 'audio', data: inline.data, rate: rateOf(inline.mimeType) });
        }
      }
    }
    const said = textOf(sc.outputTranscription);
    if (said) out.push({ t: 'said', text: said });
    if (sc.turnComplete === true) out.push({ t: 'turn_complete' });
  }
  if (m.goAway !== undefined) out.push({ t: 'go_away', ms: durationMs((m.goAway as { timeLeft?: unknown } | null)?.timeLeft) });
  const err = m.error as { message?: unknown } | undefined;
  if (err && typeof err === 'object') out.push({ t: 'error', message: typeof err.message === 'string' ? err.message : 'error' });
  return out;
}

// ---- PCM -----------------------------------------------------------------------------------------------------------

// The microphone's float samples (any rate) to 16 kHz PCM16 little-endian, by averaging each output sample's span
// (a cheap low-pass, enough for speech). Returns the bytes; the caller base64s them.
export function toPcm16(samples: Float32Array, inRate: number, outRate = LIVE_IN_RATE): Uint8Array {
  const ratio = inRate / outRate;
  const n = ratio > 0 ? Math.floor(samples.length / ratio) : 0;
  const out = new Uint8Array(n * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < n; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.max(from + 1, Math.min(samples.length, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let k = from; k < to; k++) sum += samples[k]!;
    const v = Math.max(-1, Math.min(1, sum / (to - from)));
    view.setInt16(i * 2, v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff), true);
  }
  return out;
}

// PCM16 little-endian bytes to floats, for an AudioBuffer.
export function fromPcm16(bytes: Uint8Array): Float32Array {
  const n = Math.floor(bytes.length / 2);
  const out = new Float32Array(n);
  const view = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
  for (let i = 0; i < n; i++) {
    const v = view.getInt16(i * 2, true);
    out[i] = v < 0 ? v / 0x8000 : v / 0x7fff;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// Seconds of a call counted against the child's day: whole seconds, rounded up, from the milliseconds the microphone
// was open on the live socket. The phone posts them in pieces (at most LIVE_SECONDS_PIECE each) as the call goes.
export const LIVE_SECONDS_PIECE = 30;
export function wholeSeconds(ms: number): number {
  return ms > 0 && Number.isFinite(ms) ? Math.ceil(ms / 1000) : 0;
}
