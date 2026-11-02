'use client';

import type { PublicBlock } from '@/lib/family/resolver';
import { unfilled } from '@/lib/family/blocks';
import { BOARD_HIDDEN } from '@/lib/family/call';
import type { Words } from '@/lib/family/fill';
import { AnswerBlock } from '../UnderstandView';

// The call's board (W16-A4): the answer's teaching blocks, drawn as they arrive with the lesson page's own renderer
// (UnderstandView's AnswerBlock), so a figure, a worked example or a chart looks the same here as in Study. Questions to
// answer, the video list and the source list stay on the lesson page: on a call the child answers by speaking. Loaded on
// its own (next/dynamic in CallView), only once the first block arrives, so the call screen itself stays small.
// `sentence` (W18-P1): the sentence the voice is speaking, from useCall; each board draws up to the step it reaches.
export default function CallBoard({ w, blocks, tone, sentence }: { w: Words; blocks: PublicBlock[]; tone: string; sentence?: number }) {
  const shown = blocks.filter((b) => !unfilled(b) && !BOARD_HIDDEN.includes(b.type));
  const lead = shown.find((b) => b.type === 'explanation');
  return (
    <div data-call-board className="fam-lesson flex flex-col gap-3">
      {shown.map((b, i) => (
        <AnswerBlock key={i} b={b} w={w} tone={tone} lead={b === lead} onRetry={() => {}} sentence={sentence} />
      ))}
    </div>
  );
}
