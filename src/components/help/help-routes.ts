import type { HelpLang } from '@/content/help/articles';

// Where the Help Center's links go: the school app, or the development
// preview (same screens on a query-string route).
export type HelpMode = 'app' | 'preview';

const PREVIEW = '/design-system/shell/help';

export function helpHrefs(mode: HelpMode) {
  const q = (lang: HelpLang, extra = '') => {
    const parts = [extra, lang === 'hi' ? 'lang=hi' : ''].filter(Boolean);
    return parts.length ? `?${parts.join('&')}` : '';
  };
  return {
    index: (lang: HelpLang) => (mode === 'app' ? `/app/help${q(lang)}` : `${PREVIEW}${q(lang)}`),
    article: (slug: string, lang: HelpLang) => (mode === 'app' ? `/app/help/${slug}${q(lang)}` : `${PREVIEW}${q(lang, `article=${slug}`)}`),
    ticket: mode === 'app' ? '/app/help/ticket/new' : '/design-system/shell/tickets?side=school&view=new',
  };
}
