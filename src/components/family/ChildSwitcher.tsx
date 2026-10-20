'use client';

import React from 'react';
import type { FamilyChild } from '@/lib/contracts/family-types';
import { t, type Lang } from '@/lib/i18n';

interface ChildSwitcherProps {
  childrenList: FamilyChild[];
  activeChildId: string;
  onSelectChild: (childId: string) => void;
  lang: Lang;
}

export function ChildSwitcher({
  childrenList,
  activeChildId,
  onSelectChild,
  lang,
}: ChildSwitcherProps) {
  if (childrenList.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold text-slate/70 uppercase tracking-wider">
        {t(lang, 'fam.switcher.title')}
      </span>
      <div className="flex items-center gap-1.5 overflow-x-auto py-1">
        {childrenList.map((c) => {
          const isActive = c.childId === activeChildId;
          return (
            <button
              key={c.childId}
              type="button"
              onClick={() => onSelectChild(c.childId)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                isActive
                  ? 'bg-sapphire text-white shadow-sm ring-2 ring-sapphire/30'
                  : 'bg-white text-slate border border-slate/15 hover:bg-slate/5'
              }`}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">
                {c.firstName.charAt(0).toUpperCase()}
              </span>
              <span>{c.firstName}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate/10 text-slate/80'
                }`}
              >
                {t(lang, 'fam.class.short', { grade: c.grade })}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
