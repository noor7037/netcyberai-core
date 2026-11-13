'use client';

import { useEffect, useRef, useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { Endpointer } from '@/lib/family/endpointer';
import { EnergyMeter } from '@/lib/family/voice-energy';
import { familyApi } from '../client';

// Voice input's logic (M2-7, C281), shared by VoiceInput (the English course's talk) and the tutor composer's
// microphone (W6-A, C395): tap and speak; the recording stops by itself when the child stops speaking (W19-B: about a
// second of quiet after the voice, endpointer.ts), or on a tap, or at 60 seconds (never more than the seconds left of
// the child's day). The recording goes once to the server and is dropped there; only the words come back. The page shows the
// microphone only with the parent's voice consent and the module on; the server checks both again.

export const VOICE_MAX_SECONDS = 60;
export const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

const ERROR_KEY: Record<string, string> = {
  ai_not_switched_on: 'ai.not_switched_on',
  ai_cap_reached: 'ai.cap_reached',
  ai_not_cleared_for_minors: 'ai.not_cleared_for_minors',
  ai_not_capable: 'ai.not_capable',
  ai_failed: 'ai.failed',
  too_big: 'fam.voice.err.not_audio',
  nothing_heard: 'fam.voice.nothingHeard',
};

// The voice route's refusal in the child's words (the call says them the same way, C511).
export const voiceSay = (w: Words, code: string) => fill(w[ERROR_KEY[code] ?? `fam.voice.err.${code}`] ?? w['fam.err.network']);

// Shorter than this is a tap, not a question (W17-B4).
const MIN_RECORDING_MS = 600;
// How often the sound is measured while recording.
const SAMPLE_MS = 100;

export async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export type VoiceState = 'idle' | 'recording' | 'sending';
// The tutor's sealed acknowledgement of the words (W19-B), made by the voice route; spoken first on a call.
export type VoiceAck = { text: string; token: string };

export function useVoiceRecorder({ w, onText, secondsLeft = VOICE_MAX_SECONDS, endpoint = '/api/family/voice' }: { w: Words; onText: (text: string, ack?: VoiceAck) => void; secondsLeft?: number; endpoint?: string }) {
  const [state, setState] = useState<VoiceState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [limit, setLimit] = useState(Math.max(0, Math.min(VOICE_MAX_SECONDS, secondsLeft)));
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [heard, setHeard] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(0);
  const meter = useRef<EnergyMeter | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const meterTick = useRef<ReturnType<typeof setInterval> | null>(null);
  // Set by cancel(): the recording that is stopping is thrown away, not sent (the call's Pause).
  const discard = useRef(false);

  const say = (code: string) => voiceSay(w, code);

  const release = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (meterTick.current) clearInterval(meterTick.current);
    meterTick.current = null;
    void audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(
    () => () => {
      if (recorder.current && recorder.current.state !== 'inactive') {
        recorder.current.ondataavailable = null;
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      release();
    },
    []
  );

  const send = async (blob: Blob, seconds: number) => {
    setState('sending');
    const r = await familyApi<{ text: string; maxSeconds: number; ack?: VoiceAck }>(endpoint, 'POST', { audio: await toBase64(blob), seconds });
    setState('idle');
    busy.current = false;
    // The server says how long the next recording may be (the seconds left today, 60 at most).
    if (typeof r.data.maxSeconds === 'number') setLimit(Math.max(0, Math.min(VOICE_MAX_SECONDS, r.data.maxSeconds)));
    if (!r.ok) return setError(say(r.error));
    const ack = r.data.ack && typeof r.data.ack.text === 'string' && typeof r.data.ack.token === 'string' ? r.data.ack : undefined;
    onText(r.data.text, ack);
    setHeard(true);
  };

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  };

  // Stops listening and sends nothing: no seconds are counted and no error is shown.
  const cancel = () => {
    if (recorder.current && recorder.current.state !== 'inactive') {
      discard.current = true;
      stop();
    }
  };

  const start = async () => {
    // One recording at a time: a second tap while the microphone is opening does nothing.
    if (busy.current) return;
    setHeard(false);
    // The day's speaking time is used up: say so, and open nothing.
    if (limit < 1) return setError(say('voice_cap'));
    busy.current = true;
    setError(null);
    const fail = (code: string) => {
      release();
      recorder.current = null;
      busy.current = false;
      setState('idle');
      setError(say(code));
    };
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return fail('unsupported');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return fail('denied');
    }
    const max = Math.max(1, limit);
    const mimeType = RECORDING_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    } catch {
      return fail('unsupported');
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      const ms = Date.now() - started.current;
      const seconds = Math.max(1, Math.ceil(ms / 1000));
      // Without a Web Audio API (an old web view) there is no meter and the recording goes as it always did.
      // A context the phone left suspended (iOS can) measured nothing, so its silence proves nothing either.
      const quiet = meter.current !== null && audioCtx.current?.state === 'running' && !meter.current.heardSpeech();
      release();
      recorder.current = null;
      meter.current = null;
      if (discard.current) {
        discard.current = false;
        chunks.length = 0;
        busy.current = false;
        setState('idle');
        return;
      }
      // No voice in the sound, or a tap: nothing is sent or counted, and the microphone is already released.
      if (quiet || ms < MIN_RECORDING_MS) {
        chunks.length = 0;
        busy.current = false;
        setState('idle');
        return setError(say('nothing_heard'));
      }
      const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
      chunks.length = 0;
      // Never more than the time this recording was allowed (the timer may stop it a moment late).
      void send(blob, Math.min(seconds, max));
    };
    recorder.current = rec;
    meter.current = null;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        audioCtx.current = ctx;
        void ctx.resume().catch(() => undefined);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        ctx.createMediaStreamSource(stream.current).connect(analyser);
        const m = new EnergyMeter();
        const ep = new Endpointer({ frameMs: SAMPLE_MS, maxMs: max * 1000 });
        const buf = new Float32Array(analyser.fftSize);
        meter.current = m;
        meterTick.current = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          const level = m.add(buf);
          // W19-B: the end of the question stops the recording by itself. Only while the context really runs: a
          // suspended one measures silence that is not there, and then the tap and the timer stop it as before.
          if (ctx.state === 'running' && ep.push(level) === 'done') stop();
        }, SAMPLE_MS);
      }
    } catch {
      // The check is a saving, never a gate that can break recording: without it the recording is sent as before.
      meter.current = null;
    }
    started.current = Date.now();
    setElapsed(0);
    try {
      rec.start();
    } catch {
      return fail('unsupported');
    }
    setState('recording');
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - started.current) / 1000);
      setElapsed(Math.min(s, max));
      if (s >= max) stop();
    }, 250);
  };

  return { state, elapsed, limit, max: Math.max(1, limit), error, heard, start, stop, cancel, say, clearError: () => setError(null) };
}
