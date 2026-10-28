'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_LANG, type Lang } from '@/lib/i18n/lang';

// The page's language for client components (C134), with nothing of the message table (C395): LangContext.tsx adds
// useT on top of it for screens that still read the whole table.
const LangContext = createContext<Lang>(DEFAULT_LANG);

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}
