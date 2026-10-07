import Link from 'next/link';
import { HELP_LANGS, HELP_TEXT, HINDI_REVIEWED, type HelpLang } from '@/content/help/articles';

// Pieces every Help Center screen shares (C129).

const LANG_NAME: Record<HelpLang, string> = { en: 'English', hi: 'हिन्दी' };

// English / हिन्दी. `hrefFor` gives this same screen in the other language.
export function LanguageSwitch({ lang, hrefs }: { lang: HelpLang; hrefs: Record<HelpLang, string> }) {
  return (
    <nav aria-label={HELP_TEXT.language[lang]} className="flex gap-2">
      {HELP_LANGS.map((l) => (
        <Link
          key={l}
          href={hrefs[l]}
          lang={l}
          aria-current={l === lang ? 'true' : undefined}
          className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-semibold ${l === lang ? 'border-sapphire bg-sapphire text-white' : 'border-slate/20 bg-white text-slate'}`}
        >
          {LANG_NAME[l]}
        </Link>
      ))}
    </nav>
  );
}

// Shown on every Hindi screen until the founder has reviewed the Hindi text.
export function HindiNotice({ lang }: { lang: HelpLang }) {
  if (lang !== 'hi' || HINDI_REVIEWED) return null;
  return (
    <div role="note" className="rounded-md border border-tangerine/40 bg-tangerine/10 p-3 text-sm text-slate">
      <p lang="hi">{HELP_TEXT.unreviewed.hi}</p>
      <p lang="hi" className="mt-1">
        {HELP_TEXT.screensInEnglish.hi}
      </p>
      <p lang="en" className="mt-1 text-slate/70">
        {HELP_TEXT.unreviewed.en}
      </p>
    </div>
  );
}

export function StillStuck({ lang, ticketHref }: { lang: HelpLang; ticketHref: string }) {
  return (
    <section aria-labelledby="help-stuck" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sapphire/20 bg-sapphire/5 p-4">
      <div>
        <h2 id="help-stuck" className="text-base font-bold text-slate">
          {HELP_TEXT.stuck[lang]}
        </h2>
        <p className="text-sm text-slate">{HELP_TEXT.stuckDo[lang]}</p>
      </div>
      <Link href={ticketHref} className="inline-flex min-h-[44px] items-center rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
        {HELP_TEXT.raise[lang]}
      </Link>
    </section>
  );
}
