'use client';

import { t as translate, tCount } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n';
import { useLang } from './lang-core';
export { LangProvider, useLang } from './lang-core';

// The page's language, for client components (C134). The shell provides it once; a screen asks with useT() and never
// keeps its own words. useT() reads the whole message table, so every page that uses it carries the table (about 380
// kB): a screen that must stay light takes picked words through useWords() (./Words, C395) instead.
export function useT() {
  const lang = useLang();
  return {
    lang,
    t: (key: MessageKey, params?: Record<string, string | number>) => translate(lang, key, params),
    tCount: (base: string, count: number) => tCount(lang, base, count),
  };
}
