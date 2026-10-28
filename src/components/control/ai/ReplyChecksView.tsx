import type { ReplyChecks } from '@/lib/ai/gateway/ledger';
import { t, type Lang, type MessageKey } from '@/lib/i18n';
import { CARD, INNER, profileName } from './shared';

// The safety checks each real reply took over the last week (C230-AS; Decision Log C390), per profile that made the
// reply: live English checks a reply sentence by sentence, so its count is the cost to watch. Counts only, from
// control.ai_reply_checks; nothing anyone wrote or read is there to show.
export function ReplyChecksView({ rows, lang }: { rows: ReplyChecks[]; lang: Lang }) {
  const tt = (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params);
  return (
    <section data-reply-checks className={`${CARD} mt-6`}>
      <h2 className="text-lg font-bold">{tt('control.ai.checks.title')}</h2>
      <p>{tt('control.ai.checks.lead')}</p>
      {rows.length === 0 ? (
        <p data-reply-checks-empty className="rounded-md bg-slate/5 p-3">
          {tt('control.ai.checks.empty')}
        </p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.replyProfile ?? 'none'} data-reply-checks-profile={r.replyProfile ?? 'none'} className={INNER}>
              <p className="break-all font-bold">{r.replyProfile ? profileName(tt as never, r.replyProfile) : tt('control.ai.checks.unnamed')}</p>
              <p>{tt('control.ai.checks.counts', { replies: r.replies, average: r.average, most: r.most, checks: r.checks })}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
