import type { TutorUseToday } from '@/lib/ai/tutor-use';
import { t, type Lang, type MessageKey } from '@/lib/i18n';
import { CARD, INNER, NUM, profileName } from './shared';

// "Tutor use today" on the Control AI dashboard (W16-B4): one row of tiles with what children used of the tutor today,
// and under it the cost the usage ledger gives for each family service. Counts and money only (src/lib/ai/tutor-use.ts).

const TILES: { id: keyof Omit<TutorUseToday, 'day' | 'cost'>; label: MessageKey }[] = [
  { id: 'children', label: 'control.ai.use.children' },
  { id: 'textTurns', label: 'control.ai.use.text' },
  { id: 'voiceMinutes', label: 'control.ai.use.voice' },
  { id: 'photoDoubts', label: 'control.ai.use.photo' },
  { id: 'quizzes', label: 'control.ai.use.quizzes' },
  { id: 'reports', label: 'control.ai.use.reports' },
];

export function TutorUseTiles({ use, lang }: { use: TutorUseToday; lang: Lang }) {
  const tt = (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params);
  return (
    <section data-ai-tutor-use={use.day} className={`${CARD} mb-6`}>
      <h2 className="text-lg font-bold">{tt('control.ai.use.title')}</h2>
      <p>{tt('control.ai.use.lead')}</p>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {TILES.map((tile) => (
          <li key={tile.id} data-ai-tutor-use-tile={tile.id} className={INNER}>
            <p className={`text-2xl font-bold ${NUM}`}>{use[tile.id].toLocaleString('en-IN')}</p>
            <p className="text-sm font-semibold">{tt(tile.label)}</p>
          </li>
        ))}
      </ul>
      <h3 className="font-bold">{tt('control.ai.use.costTitle')}</h3>
      {use.cost.length === 0 ? (
        <p className="text-slate/80">{tt('control.ai.use.costEmpty')}</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {use.cost.map((c) => (
            <li key={c.profileId} data-ai-tutor-use-cost={c.profileId} className={`${INNER} flex flex-wrap items-center justify-between gap-2`}>
              <span className="break-words font-semibold">{profileName(tt as never, c.profileId)}</span>
              <span className={NUM}>{c.usd === null ? tt('control.ai.use.costNone') : tt('control.ai.use.cost', { usd: c.usd.toFixed(2) })}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
