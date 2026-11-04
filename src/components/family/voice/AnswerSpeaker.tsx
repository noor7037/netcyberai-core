'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { Words } from '@/lib/family/fill';
import { sentenceAtChar } from '@/lib/family/call';
import type { VoiceMode } from './lineVoice';
import { markSentence } from './highlight';
import { TutorFace } from '../avatar/TutorFace';

// W17-B2: a speaker button on a tutor's kept answer. It asks the server voice for the answer by its message id (the
// words never leave the server), or, when the server voice is not set up, reads the same spoken text with the phone's
// own voice. The voice engine is loaded on the first tap so the Study page does not carry it. No animation, so there is
// nothing to switch off for reduced motion. One answer is read at a time: starting one resets the other buttons.
// W18-P1: while it reads, it tells the answer which sentence is being spoken (`onSentence`, its place in the spoken
// sentences, call.ts spokenSentences), so the answer's board moves with the voice. "Teach me" (TeachMe below) is the
// same voice with the sentence highlighted in the text, and pause and replay.

const STARTED = 'fam:answer-speaking';

type VoiceInput = { messageId: string; sentences: readonly string[]; lang?: 'en' | 'hi'; serverVoice: boolean; onSentence?: (i: number | undefined) => void; root?: RefObject<HTMLElement | null>; highlight?: boolean };

// The answer's language: the one given, else the nearest `lang` on the page (an answer streamed this visit is drawn
// inside the child's language).
function langOf(given: 'en' | 'hi' | undefined, el: HTMLElement | null): 'en' | 'hi' {
  if (given) return given;
  return el?.closest('[lang]')?.getAttribute('lang') === 'hi' ? 'hi' : 'en';
}

// The voice both buttons share. The server voice reads the answer as one line and reports no word boundaries, so the
// sentence is found from how much of the audio has played (near enough to move a board, not to mark a word). The phone's
// own voice reads one sentence at a time, so its place is exact even where the engine reports no word boundaries (the
// Android app's).
function useAnswerVoice({ messageId, sentences, lang, serverVoice, onSentence, root, highlight = false }: VoiceInput) {
  const [speaking, setSpeaking] = useState(false);
  const [mode, setMode] = useState<VoiceMode>(serverVoice ? 'server' : 'phone');
  const run = useRef(0);
  const me = `${messageId}:${useId()}`;
  const tell = useRef(onSentence);
  tell.current = onSentence;
  const el = useRef<HTMLDivElement>(null);
  const at = useRef<number | undefined>(undefined);

  const reach = (i: number | undefined) => {
    if (at.current === i) return;
    at.current = i;
    tell.current?.(i);
    if (highlight) markSentence(root?.current ?? null, i === undefined ? null : sentences[i] ?? null);
  };

  useEffect(() => {
    const other = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== me) {
        run.current++;
        setSpeaking(false);
      }
    };
    window.addEventListener(STARTED, other);
    return () => {
      window.removeEventListener(STARTED, other);
      // Leaving the screen while this answer is read stops it.
      if (run.current > 0) void import('./lineVoice').then((m) => m.stopLine());
      if (highlight && at.current !== undefined) markSentence(null, null);
    };
  }, [me, highlight]);

  const stop = async () => {
    run.current++;
    setSpeaking(false);
    (await import('./lineVoice')).stopLine();
  };

  const start = async () => {
    const voice = await import('./lineVoice');
    const mine = ++run.current;
    window.dispatchEvent(new CustomEvent(STARTED, { detail: me }));
    setSpeaking(true);
    const words = langOf(lang, el.current);
    // A start always begins at the first sentence: the board draws from its first step again.
    at.current = undefined;
    reach(0);
    let used = mode;
    if (used === 'server') {
      const text = sentences.join(' ');
      const spoken = await voice.speakLine('server', { kind: 'tutor_answer', messageId }, {
        text,
        lang: words,
        rate: 0.9,
        onProgress: (played) => run.current === mine && reach(sentenceAtChar(sentences, played * text.length)),
        onWord: (c) => run.current === mine && reach(sentenceAtChar(sentences, c)),
      });
      if (run.current !== mine) return;
      used = spoken.mode;
    } else {
      for (let i = 0; i < sentences.length; i++) {
        reach(i);
        const spoken = await voice.speakLine('phone', { kind: 'tutor_answer', messageId }, { text: sentences[i], lang: words, rate: 0.9 });
        if (run.current !== mine || spoken.cancelled) return;
      }
    }
    // The server voice turned off or failed: the rest of the visit uses the phone's own voice, and the line says so.
    if (used !== mode) setMode(used);
    setSpeaking(false);
    if (highlight) markSentence(null, null);
  };

  return { speaking, mode, start, stop, el };
}

export function AnswerSpeaker({ w, messageId, sentences, lang, serverVoice, onSentence }: { w: Words } & Omit<VoiceInput, 'root' | 'highlight'>) {
  const v = useAnswerVoice({ messageId, sentences, lang, serverVoice, onSentence });
  return (
    <div ref={v.el} data-answer-speaker={messageId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={() => void (v.speaking ? v.stop() : v.start())}
        aria-pressed={v.speaking}
        aria-label={w[v.speaking ? 'fam.tutor.stopAloud' : 'fam.tutor.readAloud']}
        className="flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-full bg-grape-deep px-3 text-sm font-bold text-white"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          {v.speaking ? (
            <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
          ) : (
            <>
              <path d="M4 9v6h4l5 4V5L8 9H4z" />
              <path d="M16 9a3 3 0 0 1 0 6" />
            </>
          )}
        </svg>
      </button>
      <p data-voice-in-use={v.mode} className="text-xs text-slate/80">
        {w[v.mode === 'server' ? 'fam.voiceOut.server' : 'fam.voiceOut.phone']}
      </p>
    </div>
  );
}

// W18-P1: "Teach me": the answer read aloud with the sentence being spoken highlighted in its text (the chapter reader's
// highlight) and the board moving with it. One button: Teach me, then Pause while it speaks (the voice stops; the board
// and the highlight stay where they were), then Replay from the start. No animation.
export function TeachMe({ w, messageId, sentences, lang, serverVoice, onSentence, root, tutorKey = null }: { w: Words; tutorKey?: string | null } & Omit<VoiceInput, 'highlight'>) {
  const v = useAnswerVoice({ messageId, sentences, lang, serverVoice, onSentence, root, highlight: true });
  const [used, setUsed] = useState(false);
  const label = v.speaking ? w['fam.tutor.pause'] : used ? w['fam.tutor.replay'] : w['fam.tutor.teachMe'];
  return (
    <div ref={v.el} className="flex flex-col items-start gap-2">
      {/* W19-A: once Teach me is used, the tutor's face teaches: its mouth moves with the voice (lineVoice.ts). */}
      {used && <TutorFace size="lg" tutorKey={tutorKey} className="self-center" />}
      <button
        type="button"
        data-teach-me={messageId}
        onClick={() => {
          setUsed(true);
          void (v.speaking ? v.stop() : v.start());
        }}
        className="fam-press inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-full bg-saffron px-4 text-sm font-bold text-ink"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          {v.speaking ? (
            <>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </>
          ) : (
            <path d="M7 5v14l12-7z" />
          )}
        </svg>
        {label}
      </button>
    </div>
  );
}
