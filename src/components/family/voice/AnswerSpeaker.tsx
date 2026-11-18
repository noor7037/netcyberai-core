'use client';

import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { readChildSettings } from '@/lib/family/child-settings';
import { fill, type Words } from '@/lib/family/fill';
import { answerParts, sentenceAtChar } from '@/lib/family/call';
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
// C508: `auto`, a fresh answer: read aloud once by itself as soon as the child's settings are read, when read aloud is on
// and no other voice is reading. If it cannot start, the button stays as always. v21: every class (Class 3 and below as
// before), unless the parent switched it off (`autoPlay`, the parent area).
export const startsByItself = (a: { auto: boolean; readAloud: boolean; sentences: number; busy: boolean; autoPlay?: boolean }) => a.auto && a.readAloud && a.autoPlay !== false && a.sentences > 0 && !a.busy;

// W22-S3: what the answer owner needs to keep the tutor's face on screen while the answer is read: whether the voice is
// speaking, and how much of the answer has been read (0 to 100).
// W23-A: also whether a reading was begun (so a pause keeps the controls), and the controls themselves: `toggle` plays or
// pauses, `from(i)` reads from spoken sentence i (a tap on a word or paragraph). They are the same functions for the
// life of the answer.
export type Reading = { speaking: boolean; percent: number; started?: boolean; toggle?: () => void; from?: (sentence: number) => void };

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
function useAnswerVoice({ messageId, sentences, lang, serverVoice, onSentence, root, onReading, auto = false, onAutoStart }: VoiceInput & { auto?: boolean; onAutoStart?: () => void }) {
  const [speaking, setSpeaking] = useState(false);
  const [ready, setReady] = useState(false);
  const [place, setPlace] = useState(() => places.get(messageId) ?? 0);
  // W19-C: the child's own switches: read aloud off hides the buttons; slow halves the pace.
  const [on, setOn] = useState(true);
  const [autoPlay, setAutoPlay] = useState(true);
  // v21: the browser would not start the sound by itself (no tap): the button pulses until it is tapped.
  const [blocked, setBlocked] = useState(false);
  const prefs = useRef({ rate: 0.9 });
  useEffect(() => {
    let live = true;
    void readChildSettings().then((s) => {
      if (!live) return;
      setOn(s.readAloud);
      setAutoPlay(s.autoPlay !== false);
      prefs.current = { rate: s.voiceSpeed === 'slow' ? 0.75 : 0.9 };
      setReady(true);
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

  const start = async (fromSentence?: number) => {
    const voice = await import('./lineVoice');
    const mine = ++run.current;
    setBlocked(false);
    window.dispatchEvent(new CustomEvent(STARTED, { detail: me }));
    setSpeaking(true);
    const words = langOf(lang, el.current);
    // A tap goes on from the sentence the last one stopped at (the first, for a new answer or one that was read to the end).
    if (fromSentence !== undefined && fromSentence >= 0 && fromSentence < sentences.length) places.set(messageId, fromSentence);
    const saved = places.get(messageId) ?? 0;
    let i = saved < sentences.length ? saved : 0;
    at.current = undefined;
    reach(i);
    let used = mode;
    // The first part of a reading is short (about 200 characters of whole sentences) so speech starts fast; the rest are
    // near its size (call.ts answerParts). v21: two parts ahead are asked for: the next one with this one, and while this
    // one plays the one after, so a part is ready when the one before it ends (no silent gap).
    const parts = answerParts(sentences, i);
    const ask = (q: { from: number; max: number }) => ({ kind: 'tutor_answer' as const, messageId, from: q.from, max: q.max });
    let k = 0;
    while (i < sentences.length) {
      if (used === 'server' && parts[k]?.from === i) {
        const p = parts[k];
        const end = p.end;
        const part = sentences.slice(i, end);
        const text = part.join(' ');
        const first = i;
        const ahead = k;
        if (parts[ahead + 1]) voice.prefetchLine(ask(parts[ahead + 1]));
        const spoken = await voice.speakLine('server', ask(p), {
          text,
          lang: words,
          rate: prefs.current.rate,
          onPlaying: () => {
            if (run.current === mine) for (const q of parts.slice(ahead + 1, ahead + 3)) voice.prefetchLine(ask(q));
          },
          onProgress: (played) => run.current === mine && reach(first + Math.max(0, sentenceAtChar(part, played * text.length))),
        });
        if (run.current !== mine || spoken.cancelled) return;
        if (spoken.blocked) {
          // Nothing was read: the place stays, the button pulses and a tap starts it.
          setSpeaking(false);
          setBlocked(true);
          markSentence(null, null);
          return;
        }
        if (spoken.mode === 'phone') {
          // The server voice turned off or failed: this part was read by the phone's own voice, and the rest of the visit is.
          used = 'phone';
          setMode('phone');
        }
        k++;
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

  // C508: once, for this answer only.
  const autoDone = useRef(false);
  const onAuto = useRef(onAutoStart);
  onAuto.current = onAutoStart;
  useEffect(() => {
    if (!auto || !ready || autoDone.current) return;
    autoDone.current = true;
    void import('./lineVoice').then((m) => {
      if (startsByItself({ auto, readAloud: on, autoPlay, sentences: sentences.length, busy: m.voiceBusy() })) {
        onAuto.current?.();
        void start();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, ready, on, autoPlay, sentences.length]);

  const percent = share(place);
  const told = useRef(onReading);
  told.current = onReading;
  const started = place > 0;
  const act = useRef({ speaking, start, stop });
  act.current = { speaking, start, stop };
  const controls = useMemo(
    () => ({
      toggle: () => void (act.current.speaking ? act.current.stop() : act.current.start()),
      from: (i: number) => void act.current.start(i),
    }),
    [],
  );
  useEffect(() => {
    // Read aloud switched off by the child: no controls, so no strip button and no "read from here".
    told.current?.({ speaking, percent, started, ...(on ? controls : {}) });
  }, [speaking, percent, started, controls, on]);
  // Focus Reading (useFocusReading) rests the bars while any answer is read aloud: it listens for this.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('fam-reading', { detail: { id: messageId, speaking } }));
  }, [speaking, messageId]);
  useEffect(
    () => () => {
      told.current?.({ speaking: false, percent: 0, started: false });
      window.dispatchEvent(new CustomEvent('fam-reading', { detail: { id: messageId, speaking: false } }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { speaking, mode, start, stop, el, on, percent, started, blocked };
}

export function AnswerSpeaker({ w, messageId, sentences, lang, serverVoice, onSentence, root, onReading, auto = false }: { w: Words; auto?: boolean } & VoiceInput) {
  const v = useAnswerVoice({ messageId, sentences, lang, serverVoice, onSentence, root, onReading, auto });
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
        {/* C508: while it reads, the Stop is said in words too, so a child who did not tap it sees how to stop it. */}
        {v.speaking && <span data-speaker-stop>{w['fam.tutor.stopAloud']}</span>}
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
// stays on screen while it reads: the owner of the answer draws it (StickyTutorFace) from `onReading`.
// v21: the answer's one listen button. `auto`: a fresh answer is read once by itself (every class, unless the parent
// switched it off), and the button then says Replay ("फिर से सुनो"). When the browser will not start sound without a
// tap, the button pulses gently (none under reduced motion) and no error is shown.
export function TeachMe({ w, messageId, sentences, lang, serverVoice, onSentence, root, onReading, auto = false }: { w: Words; tutorKey?: string | null; auto?: boolean } & VoiceInput) {
  const [used, setUsed] = useState(false);
  const v = useAnswerVoice({ messageId, sentences, lang, serverVoice, onSentence, root, onReading, auto, onAutoStart: () => setUsed(true) });
  const label = v.speaking ? w['fam.tutor.pause'] : v.started ? w['fam.tutor.resume'] : used ? w['fam.tutor.replay'] : w['fam.tutor.teachMe'];
  return (
    <div ref={v.el} className="flex flex-col items-start gap-2">
      <button
        type="button"
        data-teach-me={messageId}
        data-voice-blocked={v.blocked || undefined}
        onClick={() => {
          setUsed(true);
          void (v.speaking ? v.stop() : v.start());
        }}
        className={`fam-press inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-full bg-saffron px-4 text-sm font-bold text-ink${v.blocked ? ' animate-pulse ring-4 ring-saffron/40 motion-reduce:animate-none' : ''}`}
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
