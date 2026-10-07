'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AUDIENCE_LABEL, HELP_CATEGORIES, HELP_TEXT, type HelpArticle, type HelpLang } from '@/content/help/articles';
import { searchHelp } from '@/content/help/search';
import { HindiNotice, LanguageSwitch, StillStuck } from './HelpParts';
import { helpHrefs, type HelpMode } from './help-routes';

// The Help Center's front page (C129): search, then the guides by topic.
// Searching works in English, Hindi and Hinglish at once.
export function HelpIndex({ lang, mode, initialQuery = '' }: { lang: HelpLang; mode: HelpMode; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const hrefs = helpHrefs(mode);
  const searching = query.trim() !== '';
  const found = useMemo(() => searchHelp(query), [query]);

  const card = (a: HelpArticle) => (
    <li key={a.slug}>
      <Link href={hrefs.article(a.slug, lang)} className="nca-lift flex min-h-[44px] flex-col gap-1 rounded-xl border border-slate/10 bg-white p-4">
        <span className="font-semibold text-sapphire">{a.title[lang]}</span>
        <span className="text-sm text-slate">{a.summary[lang]}</span>
        <span className="text-xs text-slate/70">
          {AUDIENCE_LABEL[a.audience][lang]} · {a.steps.length} {HELP_TEXT.steps[lang].toLowerCase()}
        </span>
      </Link>
    </li>
  );

  return (
    <div lang={lang} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate">{HELP_TEXT.intro[lang]}</p>
        <LanguageSwitch lang={lang} hrefs={{ en: hrefs.index('en'), hi: hrefs.index('hi') }} />
      </div>
      <HindiNotice lang={lang} />

      <form role="search" onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-1">
        <label htmlFor="help-search" className="text-sm font-semibold text-slate">
          {HELP_TEXT.search[lang]}
        </label>
        <input
          id="help-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={HELP_TEXT.searchHint[lang]}
          maxLength={80}
          autoComplete="off"
          className="min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-base text-slate"
        />
        <p aria-live="polite" className="text-sm text-slate/70">
          {searching ? `${found.length} ${(found.length === 1 ? HELP_TEXT.resultOne : HELP_TEXT.results)[lang]}` : ''}
        </p>
      </form>

      {searching ? (
        found.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">{found.map(card)}</ul>
        ) : (
          <div role="status" className="rounded-xl border border-slate/10 bg-white p-5">
            <p className="font-semibold text-slate">{HELP_TEXT.noResults[lang]}</p>
            <p className="text-sm text-slate">{HELP_TEXT.noResultsDo[lang]}</p>
          </div>
        )
      ) : (
        HELP_CATEGORIES.map((c) => (
          <section key={c.id} aria-labelledby={`help-cat-${c.id}`} className="flex flex-col gap-3">
            <h2 id={`help-cat-${c.id}`} className="text-lg font-bold text-slate">
              {c.label[lang]}
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">{found.filter((a) => a.category === c.id).map(card)}</ul>
          </section>
        ))
      )}

      <StillStuck lang={lang} ticketHref={hrefs.ticket} />
    </div>
  );
}
