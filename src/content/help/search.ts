import { HELP_ARTICLES, type HelpArticle } from './articles';

// Search over the guides (C129): every word typed must appear somewhere in
// a guide (title, summary, steps, tips or its extra search words), in
// either language, so "हाज़िरी", "haziri" and "attendance" all find the
// same guide. Titles and search words count most. No network, no index to
// build: there are few guides and they ship with the page.

// Lower case, with Devanagari nuktas and marks that people leave out when
// typing removed (हाज़िरी = हाजिरी), and punctuation turned into spaces.
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[़‌‍]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

type Indexed = { article: HelpArticle; title: string; keywords: string; summary: string; body: string };

const INDEX: Indexed[] = HELP_ARTICLES.map((a) => ({
  article: a,
  title: normalise(`${a.title.en} ${a.title.hi}`),
  keywords: normalise(a.keywords.join(' ')),
  summary: normalise(`${a.summary.en} ${a.summary.hi}`),
  body: normalise([...a.steps, ...(a.tips ?? [])].map((s) => `${s.en} ${s.hi}`).join(' ')),
}));

export function searchHelp(query: string): HelpArticle[] {
  const words = normalise(query).split(' ').filter(Boolean).slice(0, 8);
  if (words.length === 0) return [...HELP_ARTICLES];
  return INDEX.map((i) => {
    let score = 0;
    for (const w of words) {
      const s = (i.title.includes(w) ? 5 : 0) + (i.keywords.includes(w) ? 4 : 0) + (i.summary.includes(w) ? 2 : 0) + (i.body.includes(w) ? 1 : 0);
      if (s === 0) return { article: i.article, score: 0 };
      score += s;
    }
    return { article: i.article, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.article);
}
