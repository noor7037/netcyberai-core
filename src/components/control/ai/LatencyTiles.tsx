import { StatusPill } from '@/components/app-ui/StatusPill';
import type { StatusTone } from '@/components/app-ui/tones';
import type { LatencyMetric, LatencyStatus, LatencyTile } from '@/lib/ai/latency';
import { t, type Lang, type MessageKey } from '@/lib/i18n';
import { CARD, INNER, NUM, profileName } from './shared';

// The speed of answers on the Control AI dashboard (W16-A5): a tile for each family service with the middle (p50) and
// the slow end (p95) of the first words and of the whole answer over the last 24 hours, against its target. The colour
// only repeats the words (the existing status tones). The numbers are the server's (src/lib/ai/latency.ts).

const TONE: Record<LatencyStatus, StatusTone> = { none: 'neutral', ok: 'success', slow: 'warning', over: 'alert' };
const STATUS_WORDS: Record<LatencyStatus, MessageKey> = {
  none: 'control.ai.latency.status.none',
  ok: 'control.ai.latency.status.ok',
  slow: 'control.ai.latency.status.slow',
  over: 'control.ai.latency.status.over',
};
const seconds = (ms: number) => (ms / 1000).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Metric({ wording, m, emptyWording, lang }: { wording: MessageKey; m: LatencyMetric; emptyWording: MessageKey; lang: Lang }) {
  const tt = (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{tt(wording)}</p>
        <StatusPill tone={TONE[m.status]}>{tt(STATUS_WORDS[m.status])}</StatusPill>
      </div>
      {m.spread ? (
        <p className={NUM}>
          {tt('control.ai.latency.spread', { p50: seconds(m.spread.p50), p95: seconds(m.spread.p95), count: m.spread.n })}
        </p>
      ) : (
        <p className="text-slate/80">{tt(emptyWording)}</p>
      )}
      <p className={`text-sm text-slate/80 ${NUM}`}>{m.targetMs === null ? tt('control.ai.latency.targetNone') : tt('control.ai.latency.target', { value: seconds(m.targetMs) })}</p>
    </div>
  );
}

export function LatencyTiles({ tiles, lang }: { tiles: LatencyTile[]; lang: Lang }) {
  const tt = (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params);
  return (
    <section data-ai-latency className={`${CARD} mb-6`}>
      <h2 className="text-lg font-bold">{tt('control.ai.latency.title')}</h2>
      <p>{tt('control.ai.latency.lead')}</p>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.profileId} data-ai-latency-profile={tile.profileId} data-ai-latency-status={tile.status} className={INNER}>
            <p className="break-words font-bold">{profileName(tt as never, tile.profileId)}</p>
            {(tile.firstText.targetMs !== null || tile.firstText.spread) && <Metric wording="control.ai.latency.firstText" m={tile.firstText} emptyWording="control.ai.latency.firstTextEmpty" lang={lang} />}
            <Metric wording="control.ai.latency.whole" m={tile.whole} emptyWording="control.ai.latency.wholeEmpty" lang={lang} />
          </li>
        ))}
      </ul>
    </section>
  );
}
