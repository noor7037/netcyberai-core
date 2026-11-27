'use client';

import { useMemo, useRef } from 'react';
import { blockIds, narrationScript } from '@/lib/family/blocks';
import type { Words } from '@/lib/family/fill';
import { techlabToBlocks } from '@/lib/family/tech/blocks';
import { voiceLang, type TechLang } from '@/lib/family/tech/text';
import type { TechLesson } from '@/lib/family/tech/types';
import { rateOf } from '@/components/family/reader/narration';
import { speakLine, stopLine, type VoiceMode } from '@/components/family/voice/lineVoice';
import { WordTapLayer } from '@/components/family/words/WordTapLayer';

// See and Understand, read the way Study reads a chapter: tap a sentence, then the server voice (the phone's voice
// if the server voice is not set up). The line the server speaks is looked up by lesson, block and sentence.
export function TechRead({ lesson, blockId, lang, label, words, voice }: { lesson: TechLesson; blockId: string; lang: TechLang; label: string; words: Words; voice: VoiceMode }) {
  const root = useRef<HTMLDivElement>(null);
  const mode = useRef<VoiceMode>(voice);
  const lines = useMemo(() => {
    const blocks = techlabToBlocks(lesson, lang);
    const ids = blockIds(blocks);
    const at = blocks.findIndex((block) => block.id === blockId);
    if (at < 0) return [];
    return narrationScript(blocks).filter((line) => line.blockId === ids[at]);
  }, [lesson, lang, blockId]);

  const readFrom = (from: number) => {
    stopLine();
    const run = async () => {
      for (let index = from; index < lines.length; index++) {
        const line = lines[index];
        const spoken = await speakLine(mode.current, { kind: 'techlab', lessonId: lesson.id, blockId: line.blockId, sentence: line.sentence, lang }, { text: line.text, lang: voiceLang(lang), rate: rateOf(1) });
        if (spoken.cancelled || spoken.blocked) return;
        mode.current = spoken.mode;
      }
    };
    void run();
  };

  if (!lines.length) return null;
  return (
    <div ref={root} className="tl-read">
      <WordTapLayer root={root} w={words} lang={voiceLang(lang)} sentences={lines.map((line) => line.text)} onReadFrom={readFrom} />
      {lines.map((line) => (
        <p key={`${line.blockId}-${line.sentence}`} className="tl-caption">{line.text}</p>
      ))}
      <button type="button" className="tl-btn tl-btn-soft" onClick={() => readFrom(0)}>{`🔊 ${label}`}</button>
    </div>
  );
}
