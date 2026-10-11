'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_LANG, t as translate, tCount, type Lang, type MessageKey } from '@/lib/i18n';

// The page's language, for client components (C134). The shell provides it
// once; a screen asks with useT() and never keeps its own words.
const LangContext = createContext<Lang>(DEFAULT_LANG);

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

export function useT() {
  const lang = useContext(LangContext);
  return {
    lang,
    t: (key: MessageKey, params?: Record<string, string | number>) => translate(lang, key, params),
    tCount: (base: string, count: number) => tCount(lang, base, count),
  };
}
