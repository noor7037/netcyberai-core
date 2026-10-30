'use client';

import type { Videos } from '@/lib/family/blocks';
import type { Words } from '@/lib/family/fill';
import { VideoList } from '../VideoPicks';

// The chapter's checked videos as an answer's last block (W9-C, docs/39 §3): up to four picks the server took from
// content.video_picks. Drawn by the honest player that already shows a topic's videos (VideoPicks.tsx, C279): a card
// drawn here first (title, channel, length), and nothing from YouTube loads until the child taps, not even a
// thumbnail. A block the server has not filled is never drawn.
export function VideosView({ b, w, saver = false }: { b: Videos; w: Words; saver?: boolean }) {
  if (!b.items?.length) return null;
  return <VideoList w={w} saver={saver} tag="videos" videos={b.items.map((v) => ({ videoId: v.videoId, title: v.title, channelTitle: v.channel, durationS: v.seconds, startS: 0 }))} />;
}
