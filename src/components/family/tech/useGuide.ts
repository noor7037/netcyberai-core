'use client';

// Guided Teacher Mode (C557): one tap starts the lesson read aloud, in order: the opening, each See step and its beats
// (the picture moves to the step and lights the part being explained), every Understand card, and the summary. It uses
// the Reader's own lines and voice (readLines, speakLine), one sentence at a time, so captions follow the sentence
// being said; the voice gives no word timings, so nothing claims word-level sync. Pause, resume, replay, previous,
// next and stop (back to reading by hand) are always there, and no sound starts without the child's tap. When no voice
// can be heard, each sentence still stays on screen for a reading time, so the lesson goes on as captions.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { guideTimeline, type GuideSegment } from '@/lib/family/tech/blocks';
import type { TechPersonal } from '@/lib/family/tech/personal';
import { voiceLang, type TechLang } from '@/lib/family/tech/text';
import type { TechLesson } from '@/lib/family/tech/types';
import { rateOf } from '@/components/family/reader/narration';
import { speakLine, stopLine, type VoiceMode } from '@/components/family/voice/lineVoice';
import { readLines } from './read-lines';

export type GuideState = { on: boolean; paused: boolean; index: number; total: number; caption: string; done: boolean };

// The least time a sentence stays up when it was not heard: about a slow reader's pace, never under two seconds.
const readingMs = (text: string) => Math.max(2000, text.split(/\s+/).length * 330);

export function useGuide({ lesson, lang, personal, voice, onSegment }: { lesson: TechLesson; lang: TechLang; personal?: TechPersonal; voice: VoiceMode; onSegment: (segment: GuideSegment) => void }) {
  const segments = useMemo(() => guideTimeline(lesson, personal), [lesson, personal]);
  const lines = useMemo(() => readLines(lesson, lang, personal), [lesson, lang, personal]);
  const [state, setState] = useState<GuideState>({ on: false, paused: false, index: 0, total: segments.length, caption: '', done: false });
  const run = useRef(0);
  const mode = useRef<VoiceMode>(voice);
  const show = useRef(onSegment);
  show.current = onSegment;

  const halt = useCallback(() => {
    run.current += 1;
    stopLine();
  }, []);

  const play = useCallback(
    async (from: number) => {
      halt();
      const mine = run.current;
      const alive = () => run.current === mine;
      for (let index = Math.max(0, from); index < segments.length; index++) {
        if (!alive()) return;
        const segment = segments[index];
        show.current(segment);
        setState((s) => ({ ...s, on: true, paused: false, done: false, index, total: segments.length }));
        for (const line of lines.get(segment.blockId) ?? []) {
          if (!alive()) return;
          setState((s) => ({ ...s, caption: line.text }));
          const started = Date.now();
          const spoken = await speakLine(line.phoneOnly ? 'phone' : mode.current, { kind: 'techlab', lessonId: lesson.id, blockId: line.blockId, sentence: line.sentence, lang }, { text: line.text, lang: voiceLang(lang), rate: rateOf(1) });
          if (!alive() || spoken.cancelled) return;
          if (spoken.blocked) {
            // The browser wants a tap before sound: wait for Resume, on this same sentence's segment.
            setState((s) => ({ ...s, paused: true }));
            return;
          }
          if (!line.phoneOnly) mode.current = spoken.mode;
          const left = readingMs(line.text) - (Date.now() - started);
          if (left > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, left));
            if (!alive()) return;
          }
        }
      }
      if (alive()) setState((s) => ({ ...s, on: true, paused: true, done: true, caption: '', index: segments.length }));
    },
    [halt, segments, lines, lesson.id, lang]
  );

  useEffect(() => () => halt(), [halt]);
  // A new language starts the reading again from the same place, in the new language.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    halt();
    setState((s) => (s.on ? { ...s, paused: true, caption: '' } : s));
  }, [lang, halt]);

  const at = Math.min(state.index, Math.max(0, segments.length - 1));
  return {
    state,
    segments,
    start: () => void play(0),
    // From one segment (Listen to all the cards starts at the first Understand card).
    playFrom: (index: number) => void play(index),
    resume: () => void play(state.done ? 0 : at),
    pause: () => {
      halt();
      setState((s) => ({ ...s, paused: true }));
    },
    replay: () => void play(at),
    next: () => void play(Math.min(at + 1, segments.length - 1)),
    previous: () => void play(Math.max(at - 1, 0)),
    // Back to reading by hand: the voice stops, the screen stays where it is.
    stop: () => {
      halt();
      setState((s) => ({ ...s, on: false, paused: false, caption: '', done: false }));
    },
    // A tap elsewhere in the lesson (Next, a phase): the guide pauses, never fights the child for the screen.
    yieldToChild: () => {
      if (!state.on || state.paused) return;
      halt();
      setState((s) => ({ ...s, paused: true }));
    },
  };
}
