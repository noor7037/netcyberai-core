'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { MessageKey } from '@/lib/i18n';
import { countWord, fillWord, type Words } from '@/lib/i18n/words';
import { useLang } from './lang-core';

// Picked words for client components (C401). The server picks the messages a part of the page shows (pickWords) and
// a WordsProvider hands them down; a nested provider adds to its parent's. useWords() answers like useT(), from those
// words only, so the page never carries the whole message table. The shell provides its own words and the
// authenticator check's; a page adds what its own client components show.
const WordsContext = createContext<Words>({});

export function WordsProvider({ words, children }: { words: Words; children: ReactNode }) {
  const parent = useContext(WordsContext);
  const merged = useMemo(() => ({ ...parent, ...words }), [parent, words]);
  return <WordsContext.Provider value={merged}>{children}</WordsContext.Provider>;
}

export function useWords() {
  const lang = useLang();
  const words = useContext(WordsContext);
  return {
    lang,
    words,
    t: (key: MessageKey, params?: Record<string, string | number>) => fillWord(words, key, params),
    tCount: (base: string, count: number) => countWord(words, base, count),
    // Whether a key built at run time was picked, in place of isMessageKey (which needs the whole table).
    has: (key: string): key is MessageKey => Object.prototype.hasOwnProperty.call(words, key),
  };
}
