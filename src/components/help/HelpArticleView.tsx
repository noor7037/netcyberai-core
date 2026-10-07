import Link from 'next/link';
import { AUDIENCE_LABEL, HELP_CATEGORIES, HELP_TEXT, helpArticle, type HelpArticle, type HelpLang } from '@/content/help/articles';
import { HindiNotice, LanguageSwitch, StillStuck } from './HelpParts';
import { helpHrefs, type HelpMode } from './help-routes';

// One guide (C129): what it is for, the numbered steps, things worth
// knowing, where the task starts, related guides, and the way to a ticket.
export function HelpArticleView({ article, lang, mode }: { article: HelpArticle; lang: HelpLang; mode: HelpMode }) {
  const hrefs = helpHrefs(mode);
  const category = HELP_CATEGORIES.find((c) => c.id === article.category)!;
  const related = article.related.map(helpArticle).filter((a): a is HelpArticle => a !== null);

  return (
    <article lang={lang} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={hrefs.index(lang)} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-sapphire underline">
          ← {HELP_TEXT.back[lang]}
        </Link>
        <LanguageSwitch lang={lang} hrefs={{ en: hrefs.article(article.slug, 'en'), hi: hrefs.article(article.slug, 'hi') }} />
      </div>
      <HindiNotice lang={lang} />

      <header className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-slate/70">
          {category.label[lang]} · {AUDIENCE_LABEL[article.audience][lang]}
        </p>
        <h2 className="text-2xl font-extrabold text-slate">{article.title[lang]}</h2>
        <p className="text-base text-slate">{article.summary[lang]}</p>
        {article.start && (
          <p className="text-sm text-slate">
            {HELP_TEXT.startHere[lang]}:{' '}
            <Link href={article.start.href} className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline">
              {article.start.label[lang]}
            </Link>
          </p>
        )}
      </header>

      <section aria-labelledby="help-steps" className="rounded-xl border border-slate/10 bg-white p-4 md:p-5">
        <h3 id="help-steps" className="mb-3 text-base font-bold text-slate">
          {HELP_TEXT.steps[lang]}
        </h3>
        <ol className="flex flex-col gap-3">
          {article.steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-base text-slate">
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sapphire text-sm font-bold text-white">
                {i + 1}
              </span>
              <span className="pt-1">
                <span className="sr-only">{i + 1}. </span>
                {s[lang]}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {article.tips && article.tips.length > 0 && (
        <section aria-labelledby="help-tips" className="rounded-xl border border-slate/10 bg-white p-4 md:p-5">
          <h3 id="help-tips" className="mb-2 text-base font-bold text-slate">
            {HELP_TEXT.tips[lang]}
          </h3>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-slate">
            {article.tips.map((t, i) => (
              <li key={i}>{t[lang]}</li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <nav aria-labelledby="help-related" className="flex flex-col gap-2">
          <h3 id="help-related" className="text-base font-bold text-slate">
            {HELP_TEXT.related[lang]}
          </h3>
          <ul className="grid gap-2 md:grid-cols-2">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={hrefs.article(r.slug, lang)} className="flex min-h-[44px] items-center rounded-lg border border-slate/10 bg-white px-4 py-2 text-sm font-semibold text-sapphire">
                  {r.title[lang]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <StillStuck lang={lang} ticketHref={hrefs.ticket} />
    </article>
  );
}
