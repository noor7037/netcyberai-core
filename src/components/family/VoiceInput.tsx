'use client';

import { useEffect, useRef, useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { familyApi } from './client';

// Voice input (M2-7, C281): tap the microphone, speak a question (30 seconds at most, a timer shows), tap Stop. The
// recording goes once to /api/family/voice and is dropped there; only the words come back, into the question box, for
// the child to check and edit before asking. Shown only when the parent said yes to voice and the module is on (the
// server page decides). Nothing here keeps the recording after it is sent.
// F2 on D1 (C230-Q): the buttons press like every D1 button, and look disabled while they cannot be pressed.

const MAX_SECONDS = 30;
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

type State = 'idle' | 'recording' | 'sending';

// `secondsLeft`: what the server says is left of today's speaking time, so a recording never runs past it.
export function VoiceInput({ w, onText, secondsLeft = MAX_SECONDS }: { w: Words; onText: (text: string) => void; secondsLeft?: number }) {
  const [state, setState] = useState<State>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [limit, setLimit] = useState(Math.max(0, Math.min(MAX_SECONDS, secondsLeft)));
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
  useEffect(() => () => {
    if (recorder.current && recorder.current.state !== 'inactive') {
      recorder.current.ondataavailable = null;
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    release();
  }, []);

  const send = async (blob: Blob, seconds: number) => {
    setState('sending');
    const r = await familyApi<{ text: string; maxSeconds: number }>('/api/family/voice', 'POST', { audio: await toBase64(blob), seconds });
    setState('idle');
    busy.current = false;
    // The server says how long the next recording may be (the seconds left today, 30 at most).
    if (typeof r.data.maxSeconds === 'number') setLimit(Math.max(0, Math.min(MAX_SECONDS, r.data.maxSeconds)));
    if (!r.ok) return setError(say(r.error));
    onText(r.data.text);
    setHeard(true);
  };

  const start = async () => {
    // One recording at a time: a second tap while the microphone is opening does nothing.
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setHeard(false);
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

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  };

  const max = Math.max(1, limit);
  return (
    <div className="flex flex-col gap-2" data-voice-input data-voice-state={state}>
      {state === 'recording' ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={stop}
            aria-label={w['fam.voice.stop']}
            className="fam-press flex min-h-[44px] items-center gap-2 rounded-full bg-coral-deep px-5 text-base font-bold text-white shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-deep"
          >
            <span aria-hidden="true" className="h-3 w-3 rounded-sm bg-white" />
            {w['fam.voice.stop']}
          </button>
          <p role="status" className="flex items-center gap-2 text-base font-semibold text-slate">
            <span aria-hidden="true" className="h-3 w-3 animate-pulse rounded-full bg-coral-deep motion-reduce:animate-none" />
            {fill(w['fam.voice.recording'], { s: elapsed, max })}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void start()}
            disabled={state === 'sending' || limit < 1}
            aria-label={w['fam.voice.speak']}
            className="fam-press flex min-h-[44px] items-center gap-2 rounded-full bg-white py-1 pl-1 pr-4 text-base font-bold text-royal ring-1 ring-royal/40 hover:bg-royal/5 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
          >
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-royal-deep bg-gradient-to-br from-royal to-violet text-white">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </span>
            {w['fam.voice.speak']}
          </button>
          {state === 'sending' && (
            <p role="status" className="text-sm font-semibold text-royal">
              {w['fam.voice.sending']}
            </p>
          )}
        </div>
      )}
      <p className="text-sm text-slate/80">{w['fam.voice.privacy']}</p>
      {limit < 1 && !error && state === 'idle' && <p className="rounded-2xl bg-slate/5 px-3 py-2 text-sm text-slate">{say('voice_cap')}</p>}
      {heard && (
        <p role="status" className="rounded-2xl bg-sunshine/30 px-3 py-2 text-sm text-slate">
          {w['fam.voice.check']}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-2xl bg-coral/10 px-3 py-2 text-sm font-semibold text-slate">
          {error}
        </p>
      )}
    </div>
  );
}
