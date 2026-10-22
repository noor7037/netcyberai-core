'use client';

import { useEffect, useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import type { VideoPick } from '@/lib/family/videos';

// The honest player (docs/family-app/02 §5; M2-5, C279), under a topic's response when the video finder has picks.
// A card first (thumbnail, title, channel, length); nothing from the video is loaded until the child taps; then
// YouTube's privacy-enhanced embed, no autoplay, starting at the chapter that matches the topic. The note says plainly
// that the video comes from YouTube, which may show ads and suggestions: we do not hide them (the provider's terms).
// No picks, an error, or videos switched off: nothing is drawn, and the response stands on its own.

// Its words come with Understand's (src/lib/family/understand-words.ts): fam.video.*.
const ID = /^[A-Za-z0-9_-]{11}$/;
const length = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

// The provider's words (a title, a channel's name) are marked with their own script's language.
const script = (text: string) => (/[\u0900-\u097F]/.test(text) ? 'hi' : 'en');

export function embedUrl(p: Pick<VideoPick, 'videoId' | 'startS'>): string {
  const q = new URLSearchParams({ rel: '0', modestbranding: '1' });
  if (p.startS > 0) q.set('start', String(Math.floor(p.startS)));
  return `https://www.youtube-nocookie.com/embed/${p.videoId}?${q.toString()}`;
}

export function VideoPicks({ w, topicKey }: { w: Words; topicKey: string }) {
  const [videos, setVideos] = useState<VideoPick[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    const ask = new AbortController();
    fetch(`/api/family/videos?topic=${encodeURIComponent(topicKey)}`, { cache: 'no-store', signal: ask.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((got: { videos?: VideoPick[] } | null) => setVideos((got?.videos ?? []).filter((v) => ID.test(v.videoId)).slice(0, 3)))
      .catch(() => {});
    return () => ask.abort();
  }, [topicKey]);

  if (!videos.length) return null;
  return (
    <section data-videos className="flex flex-col gap-3 rounded-3xl bg-white p-5 text-slate shadow-sm ring-1 ring-slate/10" aria-labelledby="videos-title">
      <h2 id="videos-title" className="text-lg font-bold">
        {w['fam.video.title']}
      </h2>
      <p data-video-note className="text-sm">
        {w['fam.video.note']}
      </p>
      <ul className="flex flex-col gap-4">
        {videos.map((v) => (
          <li key={v.videoId} data-video={v.videoId} className="flex flex-col gap-2">
            {playing === v.videoId ? (
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slate">
                <iframe
                  data-video-frame
                  className="absolute inset-0 h-full w-full"
                  src={embedUrl(v)}
                  title={fill(w['fam.video.frame'], { title: v.title })}
                  allow="encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  loading="lazy"
                />
              </div>
            ) : (
              <button
                type="button"
                data-video-play
                onClick={() => setPlaying(v.videoId)}
                aria-label={fill(w['fam.video.play'], { title: v.title })}
                className="group relative block aspect-video w-full overflow-hidden rounded-2xl bg-slate focus:outline-none focus-visible:ring-4 focus-visible:ring-royal-deep/60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- the provider's own thumbnail, at its fixed address */}
                <img src={`https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" />
                <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl text-royal-deep shadow-md">▶</span>
                </span>
                <span aria-hidden="true" className="absolute bottom-2 right-2 rounded-md bg-slate px-2 py-0.5 text-xs font-bold text-white">{length(v.durationS)}</span>
              </button>
            )}
            <p className="font-bold" lang={script(v.title)}>
              {v.title}
            </p>
            <p className="text-sm">
              {w['fam.video.by']}{' '}
              <span lang={script(v.channelTitle)}>{v.channelTitle}</span> · {fill(w['fam.video.length'], { length: length(v.durationS) })}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
