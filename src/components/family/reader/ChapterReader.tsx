'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Block, NarrationLine } from '@/lib/family/blocks';
import { fill, type Words } from '@/lib/family/fill';
import { DiagramView, EnglishMomentView, ExplanationView, KeyPointsView, SourcesView, WorkedExampleView } from '../blocks/BlockViews';
import { NO_VOICE_EVENT, speak, stopSpeaking } from '../english/speech';
import { SPEEDS, occurrence, progressPercent, rateOf, wordAt, type Speed } from './narration';
import { TableView } from './TableView';
import { TutorDrawer } from '../tutor/TutorDrawer';
import type { TutorReaderContext } from '../tutor/TutorWindow';
import type { Subject } from '@/lib/family/subjects';

// The chapter reader (S1, C374; docs/37 §4 Wave 2): the chapter's blocks in order through the block renderer, and
// sticky narration controls (play and pause, a sentence back or forward, a slider over every sentence, speed 0.75–1.5×),
// resuming where this child stopped. Narration reads only the script the server built (blocks.ts narrationScript), so
// a diagram, table or interactive is never read. The voice is the phone's own (english/speech.ts): the browser's
// speech engine, or the Android app's. The sentence being read is highlighted in the text, and its word too only when
// the speech engine reports real word boundaries; nothing is timed or guessed. The page scrolls to the sentence being
// read, without smooth motion under prefers-reduced-motion. The interactive blocks load only when the chapter has one.

const InteractiveView = dynamic(() => import('../blocks/InteractiveViews').then((m) => m.InteractiveView));

// `tutor` (S2, C375): the doubt drawer, the shared tutor window over the chapter, for the chapter's subject; null hides it.
type Props = {
  chapterKey: string;
  lang: 'en' | 'hi';
  blocks: Block[];
  ids: string[];
  script: NarrationLine[];
  start: number;
  resumed: boolean;
  w: Words;
  tone: string;
  chapterTitle?: string;
  tutor?: { subject: Subject; voice: { secondsLeft: number } | null; files: boolean; homework: boolean } | null;
  // S3 (C376): the studio's preview: the same reader, the child's place never saved.
  preview?: boolean;
};

// The CSS Custom Highlight API, where the browser has it (a phone without it still gets the block's ring and the
// sentence shown in the controls).
type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void };
const highlights = (): { registry: HighlightRegistry; make: (...r: Range[]) => unknown } | null => {
  if (typeof window === 'undefined') return null;
  const registry = (globalThis.CSS as unknown as { highlights?: HighlightRegistry } | undefined)?.highlights;
  const H = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  return registry && H ? { registry, make: (...r) => new H(...r) } : null;
};

// The sentence's place in the block's text: the `nth` time it appears, inside one text node (each field of a block is
// one text node, and a sentence never crosses fields).
function findSentence(root: HTMLElement, text: string, nth: number): { node: Text; at: number } | null {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
    for (let at = n.data.indexOf(text); at >= 0; at = n.data.indexOf(text, at + 1)) {
      if (seen === nth) return { node: n, at };
      seen++;
    }
  }
  return null;
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function ChapterReader({ chapterKey, lang, blocks, ids, script, start, resumed, w, tone, chapterTitle = '', tutor = null, preview = false }: Props) {
  const [doubt, setDoubt] = useState<TutorReaderContext | null>(null);
  const [index, setIndex] = useState(Math.min(Math.max(start, 0), Math.max(script.length - 1, 0)));
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [word, setWord] = useState<{ start: number; end: number } | null>(null);
  const run = useRef(0);
  const stoppedAt = useRef(0);
  const blockEls = useRef(new Map<string, HTMLElement>());
  const total = script.length;
  const line = script[index];

  // Speaking: one sentence at a time; the next starts when it ends. Pausing, seeking or a new speed stops the sentence
  // being read (its end is then ignored) and, while playing, starts the new one.
  useEffect(() => {
    if (!playing || !line) return;
    const mine = ++run.current;
    setWord(null);
    void speak(line.text, lang, rateOf(speed), (charIndex) => {
      if (run.current === mine) setWord(wordAt(line.text, charIndex));
    }).then(() => {
      if (run.current !== mine) return;
      setWord(null);
      if (index + 1 < total) setIndex(index + 1);
      else {
        setPlaying(false);
        setDone(true);
      }
    });
    return () => {
      run.current++;
      stoppedAt.current = Date.now();
      stopSpeaking();
    };
  }, [playing, index, speed, line, lang, total]);

  // Nothing on this phone can read aloud: the layout says so (NoVoiceNotice); the reader stops instead of racing
  // through the chapter. A notice right after our own stop is the engine answering that stop, not a missing voice.
  useEffect(() => {
    const on = () => {
      if (Date.now() - stoppedAt.current > 1000) setPlaying(false);
    };
    window.addEventListener(NO_VOICE_EVENT, on);
    return () => window.removeEventListener(NO_VOICE_EVENT, on);
  }, []);

  // Stop the voice when the reader closes.
  useEffect(
    () => () => {
      run.current++;
      stopSpeaking();
      const h = highlights();
      h?.registry.delete('nc-sentence');
      h?.registry.delete('nc-word');
    },
    []
  );

  // The highlight: the sentence, and the word when the engine reported one.
  useEffect(() => {
    const h = highlights();
    if (!h) return;
    h.registry.delete('nc-sentence');
    h.registry.delete('nc-word');
    const el = line && started ? blockEls.current.get(line.blockId) : undefined;
    if (!el || !line) return;
    const found = findSentence(el, line.text, occurrence(script, index));
    if (!found) return;
    const r = document.createRange();
    r.setStart(found.node, found.at);
    r.setEnd(found.node, found.at + line.text.length);
    h.registry.set('nc-sentence', h.make(r));
    if (word) {
      const wr = document.createRange();
      wr.setStart(found.node, found.at + word.start);
      wr.setEnd(found.node, found.at + word.end);
      h.registry.set('nc-word', h.make(wr));
    }
  }, [line, index, word, started, script]);

  // Follow the voice: bring the sentence into the part of the screen the controls do not cover.
  useEffect(() => {
    if (!started || !line) return;
    const el = blockEls.current.get(line.blockId);
    if (!el) return;
    const found = findSentence(el, line.text, occurrence(script, index));
    let rect = el.getBoundingClientRect();
    if (found) {
      const r = document.createRange();
      r.setStart(found.node, found.at);
      r.setEnd(found.node, found.at + line.text.length);
      rect = r.getBoundingClientRect();
    }
    const top = 72;
    const bottom = window.innerHeight - 280;
    if (rect.top < top || rect.bottom > bottom) window.scrollTo({ top: window.scrollY + rect.top - Math.max(top, window.innerHeight * 0.25), behavior: reduced() ? 'auto' : 'smooth' });
  }, [index, started, line, script]);

  // The place is kept for this child a moment after it settles, and when the voice stops.
  const save = useCallback(
    (i: number) => {
      const at = script[i];
      // The studio's preview (S3, C376) renders this same reader but keeps no one's place.
      if (!at || preview) return;
      void fetch('/api/family/reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterKey, blockId: at.blockId, sentence: at.sentence }),
        credentials: 'same-origin',
        keepalive: true,
      }).catch(() => undefined);
    },
    [chapterKey, script, preview]
  );
  useEffect(() => {
    if (!started) return;
    const t = window.setTimeout(() => save(done ? 0 : index), 1500);
    return () => window.clearTimeout(t);
  }, [index, started, done, save]);

  const play = () => {
    if (total === 0) return;
    if (done) {
      setDone(false);
      setIndex(0);
    }
    setStarted(true);
    setPlaying(true);
  };
  const pause = () => {
    setPlaying(false);
    save(index);
  };
  const seek = (i: number) => {
    setStarted(true);
    setDone(false);
    setIndex(Math.min(Math.max(i, 0), total - 1));
  };

  const activeBlock = started ? line?.blockId : undefined;

  // The doubt drawer asks about the block being read aloud, or else the first block still on screen.
  const openDoubt = () => {
    // Reading aloud pauses while the child asks (the microphone must not hear the phone's own voice).
    if (playing) pause();
    let at = activeBlock ? ids.indexOf(activeBlock) : -1;
    if (at < 0) {
      at = ids.findIndex((id) => (blockEls.current.get(id)?.getBoundingClientRect().bottom ?? -1) > 96);
      if (at < 0) at = 0;
    }
    const b = blocks[at];
    const section = b && 'title' in b && typeof b.title === 'string' && b.title ? b.title : chapterTitle;
    if (ids[at]) setDoubt({ chapterKey, blockId: ids[at], section });
  };
  const pct = started || resumed ? progressPercent(index, total) : 0;
  const playLabel = playing ? w['fam.reader.pause'] : done ? w['fam.reader.again'] : resumed && !started ? w['fam.reader.resume'] : started ? w['fam.reader.continue'] : w['fam.reader.listen'];

  return (
    <div className="flex flex-col gap-4">
      {total > 0 && (
        <p data-reader-silent className="rounded-2xl bg-white px-4 py-3 text-sm text-slate ring-1 ring-slate/10">
          {w['fam.reader.silentNote']}
        </p>
      )}
      {blocks.map((b, i) => {
        const id = ids[i];
        const view = renderBlock(b, w, tone);
        if (!view) return null;
        return (
          <div
            key={id}
            data-block-id={id}
            ref={(el) => {
              if (el) blockEls.current.set(id, el);
              else blockEls.current.delete(id);
            }}
            className={`rounded-[1.9rem] ${activeBlock === id ? 'ring-4 ring-sunshine' : ''}`}
          >
            {view}
          </div>
        );
      })}
      {done && (
        <p role="status" data-reader-done className="fam-card bg-white p-4 text-base font-bold text-slate">
          {w['fam.reader.done']}
        </p>
      )}
      {total > 0 && (
        <section aria-label={w['fam.reader.controls']} data-reader-controls className="fam-card sticky bottom-[calc(var(--fam-bottom,0px)+5.75rem)] z-20 flex flex-col gap-2 bg-white p-3">
          {started && line && (
            <p data-reader-line lang={lang} className="line-clamp-2 text-sm text-slate">
              {word ? (
                <>
                  {line.text.slice(0, word.start)}
                  <mark className="rounded bg-sunshine px-0.5 text-slate">{line.text.slice(word.start, word.end)}</mark>
                  {line.text.slice(word.end)}
                </>
              ) : (
                line.text
              )}
            </p>
          )}
          <div role="progressbar" aria-label={w['fam.reader.progress']} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 overflow-hidden rounded-full bg-slate/10">
            <div className="h-2 rounded-full bg-royal" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => seek(index - 1)} disabled={index === 0} aria-label={w['fam.reader.prev']} className="flex h-11 w-11 items-center justify-center rounded-full text-slate hover:bg-off-white disabled:opacity-40">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 5v14M18 6l-9 6 9 6V6z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={playing ? pause : play}
                data-reader-play
                className="flex min-h-[48px] items-center gap-2 rounded-full bg-royal-deep px-5 text-base font-bold text-white"
              >
                {playing ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                    <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                    <path d="M7 4.5v15l13-7.5z" />
                  </svg>
                )}
                {playLabel}
              </button>
              <button type="button" onClick={() => seek(index + 1)} disabled={index >= total - 1} aria-label={w['fam.reader.next']} className="flex h-11 w-11 items-center justify-center rounded-full text-slate hover:bg-off-white disabled:opacity-40">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 5v14M6 6l9 6-9 6V6z" />
                </svg>
              </button>
            </div>
            <div role="group" aria-label={w['fam.reader.speed']} className="flex items-center gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={speed === s}
                  onClick={() => setSpeed(s)}
                  className={`flex h-11 min-w-[44px] items-center justify-center rounded-full px-2 text-sm font-bold ${speed === s ? 'bg-royal-deep text-white' : 'bg-off-white text-slate'}`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
          {tutor && (
            <button
              type="button"
              onClick={openDoubt}
              data-reader-doubt
              className="fam-press flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-white px-4 text-base font-bold text-royal-deep ring-1 ring-royal/20 hover:bg-off-white"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
                <path d="M9.5 9.5a2.5 2.5 0 0 1 4.6 1.3c0 1.7-2.1 2-2.1 3.4M12 17h.01" />
              </svg>
              {w['fam.tutor.doubt']}
            </button>
          )}
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate">
            <span>{fill(w['fam.reader.position'], { n: index + 1, total })}</span>
            <input type="range" min={0} max={Math.max(total - 1, 0)} step={1} value={index} onChange={(e) => seek(Number(e.target.value))} aria-label={w['fam.reader.seek']} className="h-11 w-full accent-royal" />
          </label>
          <p className="text-xs text-slate/80">{w['fam.block.deviceVoice']}</p>
        </section>
      )}
      {tutor && doubt && (
        <TutorDrawer open onClose={() => setDoubt(null)} w={w} subject={tutor.subject} tone={tone} reader={doubt} voice={tutor.voice} files={tutor.files} homework={tutor.homework} />
      )}
    </div>
  );
}

// The block renderer's own views; a check or practice needs the server's sealed items and is not part of a chapter.
function renderBlock(b: Block, w: Words, tone: string): React.ReactNode {
  switch (b.type) {
    case 'explanation':
      return <ExplanationView b={b} w={w} tone={tone} />;
    case 'worked_example':
      return <WorkedExampleView b={b} w={w} tone={tone} />;
    case 'key_points':
      return <KeyPointsView b={b} w={w} tone={tone} />;
    case 'diagram':
      return <DiagramView b={b} tone={tone} />;
    case 'table':
      return <TableView b={b} tone={tone} />;
    case 'graph':
    case 'number_line':
    case 'fraction_model':
    case 'geometry':
    case 'simulation':
      return <InteractiveView b={b} w={w} tone={tone} />;
    case 'english_moment':
      return <EnglishMomentView b={b} w={w} tone={tone} />;
    case 'sources':
      return <SourcesView b={b} w={w} tone={tone} />;
    default:
      return null;
  }
}
