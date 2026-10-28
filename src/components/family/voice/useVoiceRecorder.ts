'use client';

import { useEffect, useRef, useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { familyApi } from '../client';

// Voice input's logic (M2-7, C281), shared by VoiceInput (the English course's talk) and the tutor composer's
// microphone (W6-A, C395): tap, speak (30 seconds at most, never more than the seconds left of the child's day), tap
// Stop. The recording goes once to the server and is dropped there; only the words come back. The page shows the
// microphone only with the parent's voice consent and the module on; the server checks both again.

export const VOICE_MAX_SECONDS = 30;
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

const ERROR_KEY: Record<string, string> = {
  ai_not_switched_on: 'ai.not_switched_on',
  ai_cap_reached: 'ai.cap_reached',
  ai_not_cleared_for_minors: 'ai.not_cleared_for_minors',
  ai_not_capable: 'ai.not_capable',
  ai_failed: 'ai.failed',
  too_big: 'fam.voice.err.not_audio',
};

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export type VoiceState = 'idle' | 'recording' | 'sending';

export function useVoiceRecorder({ w, onText, secondsLeft = VOICE_MAX_SECONDS, endpoint = '/api/family/voice' }: { w: Words; onText: (text: string) => void; secondsLeft?: number; endpoint?: string }) {
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

  const say = (code: string) => fill(w[ERROR_KEY[code] ?? `fam.voice.err.${code}`] ?? w['fam.err.network']);

  const release = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
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
    const r = await familyApi<{ text: string; maxSeconds: number }>(endpoint, 'POST', { audio: await toBase64(blob), seconds });
    setState('idle');
    busy.current = false;
    // The server says how long the next recording may be (the seconds left today, 30 at most).
    if (typeof r.data.maxSeconds === 'number') setLimit(Math.max(0, Math.min(VOICE_MAX_SECONDS, r.data.maxSeconds)));
    if (!r.ok) return setError(say(r.error));
    onText(r.data.text);
    setHeard(true);
  };

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
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
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
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
      const seconds = Math.max(1, Math.ceil((Date.now() - started.current) / 1000));
      release();
      recorder.current = null;
      const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
      chunks.length = 0;
      // Never more than the time this recording was allowed (the timer may stop it a moment late).
      void send(blob, Math.min(seconds, max));
    };
    recorder.current = rec;
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

  return { state, elapsed, limit, max: Math.max(1, limit), error, heard, start, stop, say, clearError: () => setError(null) };
}
