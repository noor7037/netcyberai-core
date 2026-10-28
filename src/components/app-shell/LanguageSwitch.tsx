'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { errorMessage, explainError } from '@/lib/errors/catalogue';
import { isLang, LANG_NAME, LANGS, type Lang } from '@/lib/i18n/lang';
import { useLang } from './lang-core';
import { useWords } from './Words';

// English | हिन्दी (docs/19 rule 3, C134). Each name is written in its own
// language, so a person who cannot read the current one still finds theirs.
// The choice is saved on the person's account and the page is redrawn in
// place. If it cannot be saved, a plain sentence says so and how to fix it
// (the error catalogue), where everyone can see it.
//
// `known` false: this browser has no language cookie for this person (a
// first visit, a new sign-in, or someone else used the computer before).
// The switch then asks their account once and redraws only if they had
// chosen something other than what is showing.

async function save(lang: Lang): Promise<Response> {
  const send = () => fetch('/api/auth/language', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang }) });
  const res = await send();
  if (res.status !== 401) return res;
  // The short sign-in pass ran out while the page sat open: renew it, once.
  const renewed = await fetch('/api/auth/refresh', { method: 'POST' }).catch(() => null);
  return renewed?.ok ? send() : res;
}

// `saved`: "Saved: <language>" in each language, picked on the server (C395), so it is said in the language chosen.
export function LanguageSwitch({ known = true, saved }: { known?: boolean; saved: Record<Lang, string> }) {
  const lang = useLang();
  const { t } = useWords();
  const router = useRouter();
  const [busy, setBusy] = useState<Lang | null>(null);
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');
  // While the account is being asked, the buttons wait: a quick tap must
  // not be overtaken by the answer to the question.
  const [asking, setAsking] = useState(!known);
  const asked = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    if (known || asked.current) return setAsking(false);
    asked.current = true;
    fetch('/api/auth/language')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (isLang(body?.lang) && body.lang !== lang) router.refresh();
      })
      .catch(() => undefined) // English stays; asked again when the app is next opened
      .finally(() => setAsking(false));
  }, [known, lang, router]);

  // A message about the last try does not follow the person to another page.
  useEffect(() => setProblem(''), [pathname]);

  async function choose(next: Lang) {
    if (next === lang || busy || asking) return;
    setBusy(next);
    setSaid('');
    setProblem('');
    try {
      const res = await save(next);
      if (!res.ok) {
        setProblem(explainError(await res.json().catch(() => null), errorMessage('not_saved', {}, lang), lang, res.status));
        return;
      }
      setSaid(saved[next].replace('{language}', LANG_NAME[next]));
      router.refresh();
    } catch {
      setProblem(errorMessage('not_saved', {}, lang));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative flex items-center">
      <div role="group" aria-label={t('lang.label')} className="flex rounded-md border border-slate/20 bg-white">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={l === lang}
            disabled={busy !== null || asking}
            onClick={() => choose(l)}
            className={`min-h-[44px] min-w-[44px] rounded px-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal ${l === lang ? 'bg-sapphire text-white' : 'bg-white text-slate hover:bg-slate/5'}`}
          >
            {LANG_NAME[l]}
          </button>
        ))}
      </div>
      <span role="status" className="sr-only">
        {said}
      </span>
      {problem && (
        <p role="alert" className="absolute right-0 top-full z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-red-800/30 bg-white p-3 text-sm text-red-800 shadow-lg">
          {problem}
        </p>
      )}
    </div>
  );
}
