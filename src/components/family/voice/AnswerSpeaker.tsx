'use client';

import { useEffect, useRef, useState } from 'react';
import type { Words } from '@/lib/family/fill';
import type { VoiceMode } from './lineVoice';

// W17-B2: a speaker button on a tutor's kept answer. It asks the server voice for the answer by its message id (the
// words never leave the server), or, when the server voice is not set up, reads the same spoken text with the phone's
// own voice. The voice engine is loaded on the first tap so the Study page does not carry it. No animation, so there is
// nothing to switch off for reduced motion. One answer is read at a time: starting one resets the other buttons.

const STARTED = 'fam:answer-speaking';

export function AnswerSpeaker({ w, messageId, text, lang, serverVoice }: { w: Words; messageId: string; text: string; lang: 'en' | 'hi'; serverVoice: boolean }) {
  const [speaking, setSpeaking] = useState(false);
  const [mode, setMode] = useState<VoiceMode>(serverVoice ? 'server' : 'phone');
  const run = useRef(0);

  useEffect(() => {
    const other = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== messageId) {
        run.current++;
        setSpeaking(false);
      }
    };
    window.addEventListener(STARTED, other);
    return () => {
      window.removeEventListener(STARTED, other);
      // Leaving the screen while this answer is read stops it.
      if (run.current > 0) void import('./lineVoice').then((m) => m.stopLine());
    };
  }, [messageId]);

  const toggle = async () => {
    const voice = await import('./lineVoice');
    if (speaking) {
      run.current++;
      voice.stopLine();
      return setSpeaking(false);
    }
    const mine = ++run.current;
    window.dispatchEvent(new CustomEvent(STARTED, { detail: messageId }));
    setSpeaking(true);
    const spoken = await voice.speakLine(mode, { kind: 'tutor_answer', messageId }, { text, lang, rate: 0.9 });
    if (run.current !== mine) return;
    // The server voice turned off or failed: the rest of the visit uses the phone's own voice, and the line says so.
    if (spoken.mode !== mode) setMode(spoken.mode);
    setSpeaking(false);
  };

  return (
    <div data-answer-speaker={messageId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-pressed={speaking}
        aria-label={w[speaking ? 'fam.tutor.stopAloud' : 'fam.tutor.readAloud']}
        className="flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-full bg-grape-deep px-3 text-sm font-bold text-white"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          {speaking ? (
            <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
          ) : (
            <>
              <path d="M4 9v6h4l5 4V5L8 9H4z" />
              <path d="M16 9a3 3 0 0 1 0 6" />
            </>
          )}
        </svg>
      </button>
      <p data-voice-in-use={mode} className="text-xs text-slate/80">
        {w[mode === 'server' ? 'fam.voiceOut.server' : 'fam.voiceOut.phone']}
      </p>
    </div>
  );
}
