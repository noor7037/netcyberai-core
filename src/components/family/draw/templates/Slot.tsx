'use client';

import type { StudioOpen } from '@/lib/family/draw-contract';

// C513: the Draw tab's one slot for the templates (their shelf of pictures to colour and label), between the "Start
// drawing" hero and My drawings. A stub that shows nothing: the templates slice replaces this file. The host hands it
// the child's class and `onOpen`, which opens the studio with a template (draw-contract.ts StudioOpen) under the same
// daily limit as a free drawing.
export type DrawTemplatesSlotProps = { classLevel: number; onOpen: (open: StudioOpen) => void };

export function DrawTemplatesSlot(_props: DrawTemplatesSlotProps): null {
  return null;
}
