'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type { TutorWindow as Window } from './TutorWindow';

// The Study hub's tutor window as its own chunk (W19, the lead): the hub's first load carries the subjects, the plan and
// the chapters, and the window (the composer, the voice, the face, the sketch pad, the models' part keys) arrives a
// moment later, as the reader's drawer already does (TutorDrawer). The placeholder keeps the window's place so nothing
// jumps. Type-only imports pull no code.
const Loaded = dynamic(() => import('./TutorWindow').then((m) => m.TutorWindow), {
  ssr: false,
  loading: () => <div className="fam-card min-h-[12rem] bg-white" aria-hidden="true" />,
});

export function TutorWindowLazy(props: ComponentProps<typeof Window>) {
  return <Loaded {...props} />;
}
