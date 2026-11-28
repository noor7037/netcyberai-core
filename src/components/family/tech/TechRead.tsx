'use client';

import { useMemo, useRef } from 'react';
import type { Words } from '@/lib/family/fill';
import { readLines } from './read-lines';
import type { TechPersonal } from '@/lib/family/tech/personal';
import { voiceLang, type TechLang } from '@/lib/family/tech/text';
import type { TechLesson } from '@/lib/family/tech/types';
import { rateOf } from '@/components/family/reader/narration';
import { speakLine, stopLine, type VoiceMode } from '@/components/family/voice/lineVoice';
import { WordTapLayer } from '@/components/family/words/WordTapLayer';

// See and Understand, read the way Study reads a chapter: tap a sentence, then the server voice (the phone's voice
// if the server voice is not set up). The line the server speaks is looked up by lesson, block and sentence.
// The opening, the summary and any sentence that holds the child's name are read by the phone's own voice, so the name
// never leaves the phone (the server's copy of the lesson has no name in it). `showText` false: the card already shows
// the words (Understand), so only the Listen button is added.
export function TechRead({ lesson, blockId, lang, label, words, voice, personal, showText = true }: { lesson: TechLesson; blockId: string; lang: TechLang; label: string; words: Words; voice: VoiceMode; personal?: TechPersonal; showText?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const mode = useRef<VoiceMode>(voice);
  const lines = useMemo(() => readLines(lesson, lang, personal).get(blockId) ?? [], [lesson, lang, blockId, personal]);

  const readFrom = (from: number) => {
    stopLine();
    const run = async () => {
      for (let index = from; index < lines.length; index++) {
        const line = lines[index];
        const spoken = await speakLine(line.phoneOnly ? 'phone' : mode.current, { kind: 'techlab', lessonId: lesson.id, blockId: line.blockId, sentence: line.sentence, lang }, { text: line.text, lang: voiceLang(lang), rate: rateOf(1) });
        if (spoken.cancelled || spoken.blocked) return;
        if (!line.phoneOnly) mode.current = spoken.mode;
      }
    };
    void run();
  };

  if (!lines.length) return null;
  return (
    <div ref={root} className="tl-read">
      <WordTapLayer root={root} w={words} lang={voiceLang(lang)} sentences={lines.map((line) => line.text)} onReadFrom={readFrom} />
      {showText && lines.map((line) => (
        <p key={`${line.blockId}-${line.sentence}`} className="tl-caption">{line.text}</p>
      ))}
      <button type="button" className="tl-btn tl-btn-soft" onClick={() => readFrom(0)}>{`🔊 ${label}`}</button>
    </div>
  );
}
