'use client';

import React from 'react';
import type { CatalogSubject, CatalogTopic } from '@/lib/contracts/family-types';
import { t, type Lang } from '@/lib/i18n';

interface SubjectCardProps {
  subject: CatalogSubject;
  topics: CatalogTopic[];
  onSelectTopic: (topicId: string) => void;
  lang: Lang;
}

export function SubjectCard({
  subject,
  topics,
  onSelectTopic,
  lang,
}: SubjectCardProps) {
  const isHindi = lang === 'hi';
  const isEmerald = subject.colorHue === 'emerald';

  return (
    <div className="flex flex-col rounded-2xl border border-slate/15 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate/10 pb-3">
        <div className="flex items-center gap-2.5">
          <span
            className={
              isEmerald
                ? 'flex h-8 w-8 items-center justify-center rounded-xl bg-emerald font-bold text-white'
                : 'flex h-8 w-8 items-center justify-center rounded-xl bg-sapphire font-bold text-white'
            }
          >
            {isEmerald ? '🔬' : '📐'}
          </span>
          <h3 className="text-base font-extrabold text-slate">
            {isHindi ? subject.nameHi : subject.nameEn}
          </h3>
        </div>
        <span className="text-xs font-bold text-slate/80">
          {t(lang, 'fam.chapters.count', { count: topics.length })}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {topics.map((tItem) => {
          const title = isHindi ? tItem.topicTitleHi : tItem.topicTitleEn;
          const chapter = isHindi ? tItem.chapterTitleHi : tItem.chapterTitleEn;
          return (
            <button
              key={tItem.id}
              type="button"
              onClick={() => onSelectTopic(tItem.id)}
              className="flex items-center justify-between rounded-xl border border-slate/10 bg-off-white/50 p-3 text-left transition-all hover:border-sapphire/30 hover:bg-white hover:shadow-sm"
            >
              <div className="min-w-0 flex-1 pr-2">
                <span className="block text-[11px] font-bold text-slate/80">
                  {t(lang, 'fam.chapter.prefix', { number: tItem.chapterNumber, title: chapter })}
                </span>
                <span className="block truncate text-sm font-bold text-slate">
                  {title}
                </span>
              </div>
              <span className="shrink-0 rounded-lg bg-sapphire px-2.5 py-1 text-xs font-extrabold text-white">
                {t(lang, 'fam.subjects.explore')} →
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
