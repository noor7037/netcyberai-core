'use client';

import { useT } from './LangContext';
import { useOffline } from './OfflineContext';

// The sync line (docs/20 §2, C143): one small line that always tells the
// truth about what was done on this phone: saved, waiting to send (with a
// count), sending, or not saved (with a way to see why and try again).
// While everything is saved and the network is there it stays out of the
// way; a screen reader is told each change.
export function SyncLine() {
  const { t, tCount, lang } = useT();
  const { ready, sync, sendNow, online } = useOffline();
  if (!ready) return null;

  const words =
    sync.state === 'saved'
      ? t('sync.saved')
      : sync.state === 'offline'
        ? t('sync.offline')
        : sync.state === 'sending'
          ? tCount('sync.sending', sync.count)
          : sync.state === 'waiting'
            ? `${tCount('sync.waiting', sync.count)}${sync.offline ? ` ${t('sync.waiting.offline')}` : ''}`
            : tCount('sync.failed', sync.count);
  const tone = sync.state === 'failed' ? 'border-red-800/30 bg-white text-red-800' : sync.state === 'saved' ? 'border-slate/10 bg-white text-slate/70' : 'border-tangerine/40 bg-tangerine/10 text-slate';
  const canSend = online && (sync.state === 'waiting' || sync.state === 'failed');

  return (
    <div lang={lang} data-sync={sync.state} className={`flex min-h-[44px] items-center gap-2 rounded-md border px-3 text-sm font-semibold ${tone}`}>
      <span role="status">{words}</span>
      {canSend && (
        <button type="button" onClick={() => void sendNow()} className="min-h-[44px] px-1 text-sm font-semibold text-sapphire underline">
          {t('sync.sendNow')}
        </button>
      )}
    </div>
  );
}
