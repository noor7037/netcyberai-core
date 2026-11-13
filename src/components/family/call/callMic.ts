// The call's one microphone (C511): opened once, inside the child's tap on Call, and kept open for the whole call.
//
// Why inside the tap: the tap on Call is the only moment the phone is sure a person asked for sound. The microphone's
// permission, the stream and the audio context all start there (primeCallMic), while the call page is still loading;
// the call screen then takes what is already open (openCallMic) instead of asking again after the page has drawn. A
// phone that leaves an audio context asleep until a tap (iOS) gets it woken in the same tap.
//
// One stream for the whole call, with the phone's echo canceller, noise suppression and automatic gain on: the
// tutor's own voice from the speaker is taken out of the microphone, so the child can talk over it. Nothing here keeps
// any sound: the analyser reads the loudness only, and each turn's recording is made and dropped by the call (useCall).
// A microphone opened in the tap and never taken (a call page that refused, a tap that went nowhere) is closed after
// PRIME_HOLD_MS, or at once by releasePrimedMic(); no microphone is ever left open.

export const MIC_CONSTRAINTS: MediaStreamConstraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } };
export const PRIME_HOLD_MS = 15_000;

type Ctor = typeof AudioContext;
type Primed = { ctx: AudioContext | null; stream: Promise<MediaStream | null>; timer: ReturnType<typeof setTimeout> | null };

let primed: Primed | null = null;

const audioCtor = (): Ctor | undefined => (typeof window === 'undefined' ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext);
const canAsk = () => typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';

const stopStream = (s: MediaStream | null) => s?.getTracks().forEach((t) => t.stop());
const closeCtx = (c: AudioContext | null) => void c?.close().catch(() => undefined);

function newContext(): AudioContext | null {
  try {
    const C = audioCtor();
    if (!C) return null;
    const ctx = new C();
    void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

// Inside the tap on Call (and on Call again): the permission, the stream and the audio context, all started at once.
// Synchronous on purpose: getUserMedia is called before the tap's event handler returns.
export function primeCallMic(): void {
  if (!canAsk()) return;
  releasePrimedMic();
  const ctx = newContext();
  const stream = navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS).catch(() => null);
  const p: Primed = { ctx, stream, timer: null };
  p.timer = setTimeout(() => {
    if (primed === p) releasePrimedMic();
  }, PRIME_HOLD_MS);
  primed = p;
}

// A microphone primed in a tap and not taken by a call: closed.
export function releasePrimedMic(): void {
  const p = primed;
  primed = null;
  if (!p) return;
  if (p.timer) clearTimeout(p.timer);
  closeCtx(p.ctx);
  void p.stream.then(stopStream);
}

// Every Call link in the Family app (Study's composer, the Tutor Hall) primes the microphone in its own tap: one
// listener on the document, in the capture phase, so the links themselves need nothing. Returns its removal.
export const CALL_LINK = 'a[href^="/family/call"]';
export function installCallPrime(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const onTap = (e: Event) => {
    const el = e.target as Element | null;
    if (el && typeof el.closest === 'function' && el.closest(CALL_LINK)) primeCallMic();
  };
  document.addEventListener('click', onTap, true);
  return () => document.removeEventListener('click', onTap, true);
}

export type CallMic = {
  stream: MediaStream;
  ctx: AudioContext | null;
  analyser: AnalyserNode | null;
  // The loudness of the last few milliseconds (the RMS of what the analyser reads); 0 without an analyser.
  level: () => number;
  // Mute: the microphone's track sends silence (the stream stays open, so unmuting is instant).
  setMuted: (muted: boolean) => void;
  // Every track stopped and the audio context closed.
  close: () => void;
  closed: () => boolean;
};

export type OpenMic = { ok: true; mic: CallMic } | { ok: false; error: 'unsupported' | 'denied' };

// The call screen takes the microphone primed in the tap, or (a page opened directly, a reload) asks for it now.
export async function openCallMic(): Promise<OpenMic> {
  const p = primed;
  primed = null;
  if (p?.timer) clearTimeout(p.timer);
  if (!canAsk() || typeof MediaRecorder === 'undefined') {
    if (p) {
      closeCtx(p.ctx);
      void p.stream.then(stopStream);
    }
    return { ok: false, error: 'unsupported' };
  }
  const stream = p ? await p.stream : await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS).catch(() => null);
  if (!stream) {
    closeCtx(p?.ctx ?? null);
    return { ok: false, error: 'denied' };
  }
  const ctx = p?.ctx ?? newContext();
  let analyser: AnalyserNode | null = null;
  try {
    if (ctx) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
    }
  } catch {
    analyser = null;
  }
  const buf = analyser ? new Float32Array(analyser.fftSize) : null;
  let gone = false;
  const mic: CallMic = {
    stream,
    ctx,
    analyser,
    level: () => {
      if (!analyser || !buf) return 0;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      return Math.sqrt(sum / buf.length);
    },
    setMuted: (muted) => stream.getAudioTracks().forEach((t) => (t.enabled = !muted)),
    close: () => {
      if (gone) return;
      gone = true;
      stopStream(stream);
      closeCtx(ctx);
    },
    closed: () => gone,
  };
  return { ok: true, mic };
}
