'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { readChildSettings } from '@/lib/family/child-settings';
import { fill, type Words } from '@/lib/family/fill';
import { ANSWER_SPOKEN_MAX, chunkEnd, sentenceAtChar } from '@/lib/family/call';
import type { VoiceMode } from './lineVoice';
import { markSentence, markWord } from './highlight';

// W17-B2: a speaker button on a tutor's kept answer. It asks the server voice for the answer by its message id (the
// words never leave the server), or, when the server voice is not set up, reads the same spoken text with the phone's
// own voice. The voice engine is loaded on the first tap so the Study page does not carry it. No animation, so there is
// nothing to switch off for reduced motion. One answer is read at a time: starting one resets the other buttons.
// W18-P1: while it reads, it tells the answer which sentence is being spoken (`onSentence`, its place in the spoken
// sentences, call.ts spokenSentences), so the answer's board moves with the voice. "Teach me" (TeachMe below) is the
// same voice with the sentence highlighted in the text, and pause and replay.

const STARTED = 'fam:answer-speaking';

// W22-S3: where each answer's reading stopped (the sentence), shared by both buttons of an answer and kept for the visit:
// a tap after a stop goes on from there; a reading that ends clears it, so the next tap starts again from the top.
const places = new Map<string, number>();

type VoiceInput = { messageId: string; sentences: readonly string[]; lang?: 'en' | 'hi'; serverVoice: boolean; onSentence?: (i: number | undefined) => void; root?: RefObject<HTMLElement | null>; onReading?: (r: Reading) => void };

// W22-S3: what the answer owner needs to keep the tutor's face on screen while the answer is read: whether the voice is
// speaking, and how much of the answer has been read (0 to 100).
export type Reading = { speaking: boolean; percent: number };

// The answer's language: the one given, else the nearest `lang` on the page (an answer streamed this visit is drawn
// inside the child's language).
function langOf(given: 'en' | 'hi' | undefined, el: HTMLElement | null): 'en' | 'hi' {
  if (given) return given;
  return el?.closest('[lang]')?.getAttribute('lang') === 'hi' ? 'hi' : 'en';
}

// The voice both buttons share. W22-S3: the whole answer is read. The voice takes about 600 characters a request, and
// the answer used to be cut there (the rest was never read, and a second tap began again at the same place); now it is
// read in parts of whole sentences (call.ts chunkEnd), each asked for by the sentence it starts at, so a stop can be
// resumed from the sentence it reached. The server voice reports no word boundaries, so its sentence is found from how
// much of the audio has played; the phone's own voice reads one sentence at a time and reports words where it can. The
// sentence is highlighted (and its word, when known) and kept on screen.
function useAnswerVoice({ messageId, sentences, lang, serverVoice, onSentence, root, onReading }: VoiceInput) {
  const [speaking, setSpeaking] = useState(false);
  const [place, setPlace] = useState(() => places.get(messageId) ?? 0);
  // W19-C: the child's own switches: read aloud off hides the buttons; slow halves the pace.
  const [on, setOn] = useState(true);
  const prefs = useRef({ rate: 0.9 });
  useEffect(() => {
    let live = true;
    void readChildSettings().then((s) => {
      if (!live) return;
      setOn(s.readAloud);
      prefs.current = { rate: s.voiceSpeed === 'slow' ? 0.75 : 0.9 };
    });
    return () => {
      live = false;
    };
  }, []);
  const [mode, setMode] = useState<VoiceMode>(serverVoice ? 'server' : 'phone');
  const run = useRef(0);
  const me = `${messageId}:${useId()}`;
  const tell = useRef(onSentence);
  tell.current = onSentence;
  const el = useRef<HTMLDivElement>(null);
  const at = useRef<number | undefined>(undefined);
  const total = sentences.reduce((n, t) => n + t.length + 1, 0);
  const share = (i: number) => (total === 0 ? 0 : Math.min(100, Math.round((100 * sentences.slice(0, i).reduce((n, t) => n + t.length + 1, 0)) / total)));

  const reach = (i: number | undefined) => {
    if (at.current === i) return;
    at.current = i;
    tell.current?.(i);
    markSentence(root?.current ?? null, i === undefined ? null : sentences[i] ?? null);
    if (i !== undefined) {
      places.set(messageId, i);
      setPlace(i);
    }
  };
  const word = (i: number, c: number) => markWord(root?.current ?? null, sentences[i] ?? null, c);

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
      if (at.current !== undefined) markSentence(null, null);
    };
  }, [me]);

  const stop = async () => {
    run.current++;
    setSpeaking(false);
    (await import('./lineVoice')).stopLine();
    // The place is kept (the sentence it reached); the mark goes, the board stays.
    markSentence(null, null);
  };

  // Reading is finished: the next tap starts again at the top.
  const finish = () => {
    places.delete(messageId);
    setPlace(0);
    setSpeaking(false);
    markSentence(null, null);
  };

  const start = async () => {
    const voice = await import('./lineVoice');
    const mine = ++run.current;
    window.dispatchEvent(new CustomEvent(STARTED, { detail: me }));
    setSpeaking(true);
    const words = langOf(lang, el.current);
    // A tap goes on from the sentence the last one stopped at (the first, for a new answer or one that was read to the end).
    const saved = places.get(messageId) ?? 0;
    let i = saved < sentences.length ? saved : 0;
    at.current = undefined;
    reach(i);
    let used = mode;
    while (i < sentences.length) {
      if (used === 'server') {
        const end = chunkEnd(sentences, i, ANSWER_SPOKEN_MAX);
        const part = sentences.slice(i, end);
        const text = part.join(' ');
        const first = i;
        const spoken = await voice.speakLine('server', { kind: 'tutor_answer', messageId, from: first }, {
          text,
          lang: words,
          rate: prefs.current.rate,
          onProgress: (played) => run.current === mine && reach(first + Math.max(0, sentenceAtChar(part, played * text.length))),
        });
        if (run.current !== mine || spoken.cancelled) return;
        if (spoken.mode === 'phone') {
          // The server voice turned off or failed: this part was read by the phone's own voice, and the rest of the visit is.
          used = 'phone';
          setMode('phone');
        }
        i = end;
        if (i < sentences.length) reach(i);
      } else {
        reach(i);
        const at0 = i;
        const spoken = await voice.speakLine('phone', { kind: 'tutor_answer', messageId, from: at0 }, { text: sentences[i], lang: words, rate: prefs.current.rate, onWord: (c) => run.current === mine && word(at0, c) });
        if (run.current !== mine || spoken.cancelled) return;
        i++;
      }
    }
    finish();
  };

  const percent = share(place);
  const told = useRef(onReading);
  told.current = onReading;
  useEffect(() => {
    told.current?.({ speaking, percent });
  }, [speaking, percent]);
  useEffect(
    () => () => {
      told.current?.({ speaking: false, percent: 0 });
    },
    [],
  );

  return { speaking, mode, start, stop, el, on, percent, started: place > 0 };
}

export function AnswerSpeaker({ w, messageId, sentences, lang, serverVoice, onSentence, root, onReading }: { w: Words } & VoiceInput) {
  const v = useAnswerVoice({ messageId, sentences, lang, serverVoice, onSentence, root, onReading });
  if (!v.on) return null;
  return (
    <div ref={v.el} data-answer-speaker={messageId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={() => void (v.speaking ? v.stop() : v.start())}
        aria-pressed={v.speaking}
        aria-label={w[v.speaking ? 'fam.tutor.stopAloud' : v.started ? 'fam.tutor.resume' : 'fam.tutor.readAloud']}
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
      {(v.speaking || v.started) && (
        <p data-read-percent={v.percent} className="text-xs font-bold text-ink">
          {fill(w['fam.tutor.readPercent'], { n: String(v.percent) })}
        </p>
      )}
    </div>
  );
}

// W18-P1: "Teach me": the answer read aloud with the sentence being spoken highlighted in its text (the chapter reader's
// highlight) and the board moving with it. One button: Teach me, then Pause while it speaks (the voice stops; the board
// and the highlight stay where they were), then Resume from that sentence, and Replay after the end. The tutor's face
// stays on screen while it reads: the owner of the answer draws it (StickyTutorFace) from `onReading`. No animation.
export function TeachMe({ w, messageId, sentences, lang, serverVoice, onSentence, root, onReading }: { w: Words; tutorKey?: string | null } & VoiceInput) {
  const v = useAnswerVoice({ messageId, sentences, lang, serverVoice, onSentence, root, onReading });
  const [used, setUsed] = useState(false);
  const label = v.speaking ? w['fam.tutor.pause'] : v.started ? w['fam.tutor.resume'] : used ? w['fam.tutor.replay'] : w['fam.tutor.teachMe'];
  return (
    <div ref={v.el} className="flex flex-col items-start gap-2">
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
      {(v.speaking || v.started) && (
        <p data-read-percent={v.percent} className="text-xs font-bold text-ink">
          {fill(w['fam.tutor.readPercent'], { n: String(v.percent) })}
        </p>
      )}
    </div>
  );
}
