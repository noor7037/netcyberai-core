import { createElement as h, type ReactElement, type ReactNode } from 'react';
import { LangProvider } from '@/components/app-shell/LangContext';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords, type PageRoute } from '@/components/app-shell/page-words';
import { shellWords } from '@/components/app-shell/shell-words';
import type { Lang } from '@/lib/i18n';

// A component as its page draws it (C402): in the page's language, with the shell's picked words and the page's own
// (page-words.ts), so a test also reads what the page really picks.
export const withWords = (lang: Lang, route: PageRoute | null, el: ReactElement): ReactElement =>
  h(LangProvider, { lang, children: h(WordsProvider, { words: { ...shellWords(lang).words, ...(route ? pageWords(lang, route) : {}) }, children: el }) });

// A page's content inside ModulePage, past the WordsProvider the page wraps it in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pageContent = (page: any): ReactNode => {
  const c = page.props.children;
  return c && typeof c === 'object' && 'type' in c && c.type === WordsProvider ? c.props.children : c;
};
