import type { ReactNode } from 'react';

// A plain 16:9 frame for a video or a simulation (founder, 18 Nov 2026: no "Full screen" overlay button on videos). The
// browser's own player and the lab's own controls do their own fullscreen; nothing is drawn over the picture here.
export function MediaFrame({ children }: { children: ReactNode }) {
  return (
    <div data-media-frame className="relative aspect-video w-full overflow-hidden bg-slate sm:rounded-2xl">
      {children}
    </div>
  );
}
