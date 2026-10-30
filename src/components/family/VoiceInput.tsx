'use client';

import { fill, type Words } from '@/lib/family/fill';
import { useVoiceRecorder, VOICE_MAX_SECONDS } from './voice/useVoiceRecorder';

// Voice input (M2-7, C281): tap the microphone, speak a question (30 seconds at most, a timer shows), tap Stop. The
// recording goes once to /api/family/voice and is dropped there; only the words come back, into the question box, for
// the child to check and edit before asking. Shown only when the parent said yes to voice and the module is on (the
// server page decides). Nothing here keeps the recording after it is sent. The logic is useVoiceRecorder (W6-A, C395),
// shared with the tutor composer's microphone.
// F2 on D1 (C230-Q): the buttons press like every D1 button, and look disabled while they cannot be pressed.

// `secondsLeft`: what the server says is left of today's speaking time, so a recording never runs past it.
// `endpoint`: where the recording goes; the live English tutor sends it to its own ear (E1, C382), the same path.
export function VoiceInput({ w, onText, secondsLeft = VOICE_MAX_SECONDS, endpoint = '/api/family/voice' }: { w: Words; onText: (text: string) => void; secondsLeft?: number; endpoint?: string }) {
  const { state, elapsed, limit, max, error, heard, start, stop, say } = useVoiceRecorder({ w, onText, secondsLeft, endpoint });
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
            className="fam-press flex min-h-[44px] items-center gap-2 rounded-full bg-white py-1 pl-1 pr-4 text-base font-bold text-ink ring-1 ring-ink/40 hover:bg-saffron/5 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-white">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </span>
            {w['fam.voice.speak']}
          </button>
          {state === 'sending' && (
            <p role="status" className="text-sm font-semibold text-ink">
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
