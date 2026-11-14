'use client';

import { useEffect, useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { isLangCode, languageInfo, type LangCode } from '@/lib/family/languages';
import { embedUrl, type VideoPick } from '@/lib/family/videos';
import { FamIcon } from './FamIcon';
import { BLOCK_TONE } from './blocks/BlockViews';

// The honest player (docs/family-app/02 §5; M2-5, C279), under a topic's response when the video finder has picks.
// A card first (title, channel, length); nothing from YouTube is loaded until the child taps — not even its thumbnail
// picture, which would tell Google the child's address before any tap (so the card is drawn here, C279); then
// YouTube's privacy-enhanced embed, no autoplay, starting at the chapter that matches the topic. The note says plainly
// that the video comes from YouTube, which may show ads and suggestions: we do not hide them (the provider's terms).
// No picks, an error, or videos switched off: nothing is drawn, and the response stands on its own.
// F2 on D1 (C230-Q): a D1 card; the drawn card before the tap is a dark gradient with a drawn play mark (never a
// device emoji), and it presses like every D1 tile.

// Its words come with Understand's (src/lib/family/understand-words.ts): fam.video.*.
const ID = /^[A-Za-z0-9_-]{11}$/;
const length = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

// The provider's words (a title, a channel's name) are marked with their own script's language.
const script = (text: string) => (/[ऀ-ॿ]/.test(text) ? 'hi' : 'en');

export { embedUrl };

// C522: an answer's cards ask the server first ("See video", POST /api/family/videos/click): the tap is counted for the
// child and the embed comes back. Only the privacy-enhanced embed is ever loaded, whatever the answer says.
const EMBED = /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}(\?[A-Za-z0-9=&_-]*)?$/;
export type SeeVideo = { topicKey: string; lang: LangCode };
async function askEmbed(see: SeeVideo, videoId: string): Promise<string | null> {
  const r = await fetch('/api/family/videos/click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ topicKey: see.topicKey, videoId, lang: see.lang }) }).catch(() => null);
  const got = r?.ok ? ((await r.json().catch(() => null)) as { embed?: unknown } | null) : null;
  return typeof got?.embed === 'string' && EMBED.test(got.embed) ? got.embed : null;
}

export function VideoPicks({ w, topicKey }: { w: Words; topicKey: string }) {
  const [videos, setVideos] = useState<VideoPick[]>([]);

  useEffect(() => {
    const ask = new AbortController();
    fetch(`/api/family/videos?topic=${encodeURIComponent(topicKey)}`, { cache: 'no-store', signal: ask.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((got: { videos?: VideoPick[] } | null) => setVideos((got?.videos ?? []).filter((v) => ID.test(v.videoId)).slice(0, 3)))
      .catch(() => {});
    return () => ask.abort();
  }, [topicKey]);

  return <VideoList w={w} videos={videos} />;
}

// The list itself, from picks already in hand (S5, C378: a chapter's reviewer-chosen picks are read on the server and
// passed in). `saver`: the data-saver is on; the card is drawn here and nothing of the video loads until the tap, so
// the note only says so. `title`: a heading other than the topic's.
// `tag`: drawn as an answer's block (W9-C), with that block type's colour bar.
// `see`: an answer's block (C522): each card has a "See video" button, and the tap is counted on the server first.
// `wanted`: the child's language had too few videos, so these are in `see.lang`; the note says so.
export function VideoList({ w, videos, saver = false, title, tag, see, wanted }: { w: Words; videos: VideoPick[]; saver?: boolean; title?: string; tag?: string; see?: SeeVideo; wanted?: LangCode }) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [embed, setEmbed] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!videos.length) return null;
  const open = async (v: VideoPick) => {
    if (!see) return setPlaying(v.videoId);
    if (busy) return;
    setBusy(v.videoId);
    setFailed(null);
    const url = await askEmbed(see, v.videoId);
    setBusy(null);
    if (!url) return setFailed(v.videoId);
    setEmbed(url);
    setPlaying(v.videoId);
  };
  return (
    <section data-videos data-block={tag} className={`fam-card fam-rise flex flex-col gap-3 bg-white p-5 text-slate ${tag && BLOCK_TONE[tag] ? `border-l-[6px] ${BLOCK_TONE[tag].bar}` : ''}`} aria-labelledby="videos-title">
      <h2 id="videos-title" className="flex items-center gap-3 text-lg font-extrabold">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-coral-deep bg-gradient-to-br from-coral-deep to-grape-deep text-white shadow-md">
          <FamIcon name="video" className="h-5 w-5" />
        </span>
        {title ?? w['fam.video.title']}
      </h2>
      <p data-video-note className="text-sm">
        {w['fam.video.note']}
      </p>
      {wanted && see && isLangCode(wanted) && (
        <p data-video-fallback className="text-sm font-semibold">
          {fill(w['fam.video.fallback'], { wanted: languageInfo(wanted).native, shown: languageInfo(see.lang).native })}
        </p>
      )}
      {saver && (
        <p data-video-saver className="text-sm font-semibold">
          {w['fam.video.saver']}
        </p>
      )}
      <ul className="flex flex-col gap-4">
        {videos.map((v) => (
          <li key={v.videoId} data-video={v.videoId} className="flex flex-col gap-2">
            {playing === v.videoId ? (
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slate">
                <iframe
                  data-video-frame
                  className="absolute inset-0 h-full w-full"
                  src={see && embed ? embed : embedUrl(v)}
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
                onClick={() => void open(v)}
                className="fam-press group relative isolate block aspect-video w-full overflow-hidden rounded-2xl bg-ink focus:outline-none focus-visible:ring-4 focus-visible:ring-ink/60"
              >
                <span className="sr-only">
                  {w['fam.video.play']} <span lang={script(v.title)}>{v.title}</span>
                </span>
                <span aria-hidden="true" className="fam-band-dots" />
                <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-ink shadow-lg">
                    <FamIcon name="play" className="ml-1 h-7 w-7" />
                  </span>
                </span>
                <span aria-hidden="true" className="absolute bottom-2 right-2 rounded-md bg-slate px-2 py-0.5 text-xs font-bold text-white">{length(v.durationS)}</span>
              </button>
            )}
            <p className="font-bold" lang={script(v.title)}>
              {v.title}
            </p>
            {see && playing !== v.videoId && (
              <button
                type="button"
                data-video-see={v.videoId}
                onClick={() => void open(v)}
                disabled={busy === v.videoId}
                className="fam-press min-h-[44px] self-start rounded-2xl bg-ink px-5 py-2 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-4 focus-visible:ring-ink/60"
              >
                {w['fam.video.see']}
              </button>
            )}
            {failed === v.videoId && (
              <p data-video-failed role="status" className="text-sm font-semibold">
                {w['fam.video.failed']}
              </p>
            )}
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
