'use client';

import { useCallback, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { PRIMARY_ACTION, QUIET_ACTION } from '@/components/app-ui/ModulePage';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { ControlVideoPick, VideoChannelKind, VideoReview } from '@/lib/content/video-picks';
import type { MessageKey } from '@/lib/i18n';

// Control → Content → Videos (M2-5, C279). The video finder's picks per topic: pin one to keep it through every refresh
// and serve it first, or reject one so it is never shown. And the channel lists: official and approved channels are
// searched first and ranked higher; a blocked channel is never shown (blocking it rejects its picks). Provider data and
// review states only; no child's data is on this screen.

const SECTION = 'flex flex-col gap-3 rounded-md border border-slate/10 bg-white p-4';
const KINDS: VideoChannelKind[] = ['official', 'approved', 'blocked'];
const length = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};
const ERRORS = ['not_found', 'bad_request', 'blocked_channel'];
const statusVariant = (s: ControlVideoPick['status']) => (s === 'pinned' ? 'success' : s === 'rejected' ? 'danger' : 'neutral');

export function VideoPicksView({ initial }: { initial: VideoReview }) {
  const { t } = useT();
  const [data, setData] = useState(initial);
  const [topic, setTopic] = useState('');
  const [channel, setChannel] = useState({ channelId: '', title: '', kind: 'official' as VideoChannelKind });
  const [chapter, setChapter] = useState({ chapterKey: '', language: 'en', videoId: '', channelId: '', channelTitle: '', title: '', durationS: '' });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (filter: string) => {
    const res = await fetch(`/api/control/content/videos${filter.trim() ? `?topic=${encodeURIComponent(filter.trim())}` : ''}`, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as VideoReview | null) : null;
    if (got) setData(got);
  }, []);

  async function act(body: Record<string, string | number>, done: MessageKey) {
    setBusy(true);
    setNote(null);
    const res = await fetch('/api/control/content/videos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    // The list is read again either way, so what is shown is what the database holds.
    await load(topic);
    if (res?.ok) setNote({ ok: true, text: t(done) });
    else setNote({ ok: false, text: t(ERRORS.includes(got?.code) ? (`control.video.err.${got.code}` as MessageKey) : 'control.video.err.other') });
    setBusy(false);
  }

  return (
    <section className={SECTION} aria-labelledby="video-picks">
      <h2 id="video-picks" className="text-lg font-bold text-slate">
        {t('control.video.title')}
      </h2>
      <p className="text-sm text-slate">{t('control.video.how')}</p>
      <p data-video-searches className="text-sm text-slate">
        {t('control.video.searchesToday', { n: data.searchesToday })}
      </p>
      {note && (
        <p role="status" className={`rounded-md p-3 text-sm ${note.ok ? 'bg-turquoise/10 text-slate' : 'bg-coral/10 text-slate'}`}>
          {note.text}
        </p>
      )}

      <form
        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void load(topic);
        }}
      >
        <Input id="video-topic" label={t('control.video.filter')} value={topic} maxLength={120} spellCheck={false} onChange={(e) => setTopic(e.target.value)} />
        <button type="submit" className={QUIET_ACTION}>
          {t('control.video.filterGo')}
        </button>
      </form>

      {data.picks.length === 0 && <p className="text-sm text-slate">{t('control.video.none')}</p>}
      <ul className="flex flex-col gap-3">
        {data.picks.map((p) => (
          <li key={`${p.topicKey}:${p.language}:${p.videoId}`} data-video-pick={p.videoId} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="break-all font-semibold text-slate">{p.topicKey}</span>
              <Badge variant="neutral">{t(p.language === 'hi' ? 'control.video.lang.hi' : 'control.video.lang.en')}</Badge>
              <Badge variant={statusVariant(p.status)}>{t(`control.video.status.${p.status}` as MessageKey)}</Badge>
            </div>
            <p className="text-sm font-semibold text-slate">{p.title}</p>
            <p className="text-sm text-slate">
              {t('control.video.meta', { channel: p.channelTitle, length: length(p.durationS), start: length(p.startS), score: p.score })}
              {p.captions ? ` · ${t('control.video.captions')}` : ''}
            </p>
            <a className="inline-flex min-h-[44px] items-center self-start text-sm font-semibold text-royal-deep underline underline-offset-4" href={`https://www.youtube.com/watch?v=${p.videoId}`} target="_blank" rel="noopener noreferrer">
              {t('control.video.open')}
            </a>
            <div className="flex flex-wrap gap-2">
              {p.status !== 'pinned' && (
                <button type="button" data-video-pin disabled={busy} className={PRIMARY_ACTION} onClick={() => void act({ action: 'pin', topicKey: p.topicKey, language: p.language, videoId: p.videoId }, 'control.video.done.pinned')}>
                  {t('control.video.pin')}
                </button>
              )}
              {p.status !== 'rejected' && (
                <button type="button" data-video-reject disabled={busy} className={QUIET_ACTION} onClick={() => void act({ action: 'reject', topicKey: p.topicKey, language: p.language, videoId: p.videoId }, 'control.video.done.rejected')}>
                  {t('control.video.reject')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <h3 className="text-base font-bold text-slate">{t('control.video.chapter.title')}</h3>
      <p className="text-sm text-slate">{t('control.video.chapter.how')}</p>
      <form
        data-video-chapter-form
        className="grid gap-2 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ action: 'chapter', ...chapter, durationS: Number(chapter.durationS) }, 'control.video.done.chapter');
        }}
      >
        <Input id="video-chapter-key" label={t('control.video.chapter.key')} value={chapter.chapterKey} maxLength={120} spellCheck={false} onChange={(e) => setChapter({ ...chapter, chapterKey: e.target.value.trim() })} />
        <Select id="video-chapter-lang" label={t('control.video.chapter.language')} value={chapter.language} onChange={(e) => setChapter({ ...chapter, language: e.target.value })}>
          <option value="en">{t('control.video.lang.en')}</option>
          <option value="hi">{t('control.video.lang.hi')}</option>
        </Select>
        <Input id="video-chapter-id" label={t('control.video.chapter.videoId')} value={chapter.videoId} maxLength={11} spellCheck={false} onChange={(e) => setChapter({ ...chapter, videoId: e.target.value.trim() })} />
        <Input id="video-chapter-title" label={t('control.video.chapter.videoTitle')} value={chapter.title} maxLength={200} onChange={(e) => setChapter({ ...chapter, title: e.target.value })} />
        <Input id="video-chapter-channel-id" label={t('control.video.channelId')} value={chapter.channelId} maxLength={40} spellCheck={false} onChange={(e) => setChapter({ ...chapter, channelId: e.target.value.trim() })} />
        <Input id="video-chapter-channel-title" label={t('control.video.channelTitle')} value={chapter.channelTitle} maxLength={120} onChange={(e) => setChapter({ ...chapter, channelTitle: e.target.value })} />
        <Input id="video-chapter-seconds" label={t('control.video.chapter.seconds')} inputMode="numeric" value={chapter.durationS} maxLength={5} onChange={(e) => setChapter({ ...chapter, durationS: e.target.value.replace(/\D/g, '') })} />
        <button
          type="submit"
          data-video-chapter-add
          disabled={busy || !chapter.chapterKey || !chapter.videoId || !chapter.channelId || !chapter.channelTitle.trim() || !chapter.title.trim() || !chapter.durationS}
          className={`${PRIMARY_ACTION} md:self-end`}
        >
          {t('control.video.chapter.add')}
        </button>
      </form>

      <h3 className="text-base font-bold text-slate">{t('control.video.channels')}</h3>
      <p className="text-sm text-slate">{t('control.video.channelsHow')}</p>
      {data.channels.length === 0 && <p className="text-sm text-slate">{t('control.video.noChannels')}</p>}
      <ul className="flex flex-col gap-2">
        {data.channels.map((c) => (
          <li key={c.channelId} data-video-channel={c.channelId} className="flex flex-wrap items-center gap-2 rounded-md border border-slate/10 p-3">
            <span className="font-semibold text-slate">{c.title}</span>
            <span className="break-all text-sm text-slate">{c.channelId}</span>
            <Badge variant={c.kind === 'blocked' ? 'danger' : c.kind === 'official' ? 'success' : 'neutral'}>{t(`control.video.kind.${c.kind}` as MessageKey)}</Badge>
            <button type="button" data-video-channel-remove disabled={busy} className={`${QUIET_ACTION} ml-auto`} onClick={() => void act({ action: 'remove_channel', channelId: c.channelId }, 'control.video.done.removed')}>
              {t('control.video.remove')}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ action: 'channel', ...channel }, 'control.video.done.channel');
        }}
      >
        <Input id="video-channel-id" label={t('control.video.channelId')} value={channel.channelId} maxLength={40} spellCheck={false} onChange={(e) => setChannel({ ...channel, channelId: e.target.value.trim() })} />
        <Input id="video-channel-title" label={t('control.video.channelTitle')} value={channel.title} maxLength={120} onChange={(e) => setChannel({ ...channel, title: e.target.value })} />
        <Select id="video-channel-kind" label={t('control.video.kind')} value={channel.kind} onChange={(e) => setChannel({ ...channel, kind: e.target.value as VideoChannelKind })}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`control.video.kind.${k}` as MessageKey)}
            </option>
          ))}
        </Select>
        <button type="submit" data-video-channel-add disabled={busy || !channel.channelId || !channel.title.trim()} className={PRIMARY_ACTION}>
          {t('control.video.add')}
        </button>
      </form>
    </section>
  );
}
