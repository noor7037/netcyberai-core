'use client';

import React from 'react';
import type { ParentDailyCard } from '@/lib/contracts/family-types';
import { t, type Lang, type MessageKey } from '@/lib/i18n';

interface ParentCalmCardProps {
  card: ParentDailyCard;
  lang: Lang;
}

const STATUS_COLOR: Record<string, string> = {
  introduced: 'bg-slate/10 text-slate',
  practised: 'bg-amber-100 text-amber-900 border border-amber-300',
  checked: 'bg-emerald/15 text-emerald-text border border-emerald/30',
  mastered: 'bg-emerald text-white',
};

export function ParentCalmCard({ card, lang }: ParentCalmCardProps) {
  return (
    <section
      aria-label={t(lang, 'fam.calm.title')}
      className="relative overflow-hidden rounded-2xl border border-slate/15 bg-gradient-to-br from-white to-off-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate/10 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sapphire/10 text-sm">
            🌙
          </span>
          <h2 className="text-base font-extrabold text-slate">
            {t(lang, 'fam.calm.title')}
          </h2>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
            STATUS_COLOR[card.masteryStatus] || 'bg-slate/10 text-slate'
          }`}
        >
          {t(lang, `fam.calm.status.${card.masteryStatus}` as MessageKey)}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2.5">
        <div>
          <span className="text-xs font-semibold text-slate/70">
            {t(lang, 'fam.calm.topic')}
          </span>
          <p className="text-sm font-bold text-slate">{card.practisedTopic}</p>
        </div>

        <div className="rounded-xl bg-sapphire/5 border border-sapphire/15 p-3.5">
          <span className="block text-xs font-extrabold text-sapphire uppercase tracking-wider">
            {t(lang, 'fam.calm.talkQuestion')}
          </span>
          <p className="mt-1 text-sm font-medium text-slate">
            {card.tonightTalkQuestion}
          </p>
        </div>

        <p className="text-xs text-slate/80 italic">{card.calmInsight}</p>
      </div>
    </section>
  );
}
