'use client';

import { useEffect, useState } from 'react';
import { decideInstallView, type InstallView } from '@/lib/install/install-state';
import { INSTALL_WORDS, type InstallLang } from '@/lib/install/install-words';

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// One page, one big button (founder, C230): install the app from the phone's browser. `lang` is the server's choice
// when it knows one (the Family cookie); otherwise the phone's own language decides after load.
export function InstallPage({ app, startUrl, lang }: { app: 'family' | 'teacher' | 'school'; startUrl: string; lang?: InstallLang }) {
  const [chosen, setChosen] = useState<InstallLang>(lang ?? 'en');
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [view, setView] = useState<InstallView | null>(null);
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (!lang && navigator.language?.toLowerCase().startsWith('hi')) setChosen('hi');
    setAddress(window.location.href);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    if (standalone) setInstalled(true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [lang]);

  useEffect(() => {
    setView(decideInstallView({ installed, hasPrompt: prompt !== null, userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }));
  }, [installed, prompt]);

  async function install() {
    if (!prompt) return;
    const p = prompt;
    setPrompt(null);
    await p.prompt();
    // The browser asks once per event; `appinstalled` follows an accepted install.
    await p.userChoice.catch(() => undefined);
  }

  const w = INSTALL_WORDS[chosen];
  const a = w[app];
  const btn =
    'flex min-h-[64px] w-full items-center justify-center rounded-2xl bg-royal px-6 text-xl font-extrabold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal';

  return (
    <div lang={chosen} className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col gap-6 px-4 py-10">
      <div className="flex justify-end gap-2" role="group" aria-label="Language">
        {(['en', 'hi'] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setChosen(l)}
            aria-pressed={chosen === l}
            className={`min-h-[44px] min-w-[44px] rounded-xl px-3 text-sm font-bold ${chosen === l ? 'bg-slate text-white' : 'bg-white text-slate ring-1 ring-slate/20'}`}
          >
            {l === 'en' ? 'English' : 'हिन्दी'}
          </button>
        ))}
      </div>
      <section className="flex flex-col gap-3 rounded-3xl bg-white p-6 text-slate shadow-sm ring-1 ring-slate/10">
        <h1 className="text-3xl font-extrabold">{a.name}</h1>
        <p className="text-base">{a.what}</p>
        <div className="mt-2 flex flex-col gap-3">
          {view === 'installed' && (
            <>
              <a href={startUrl} className={btn}>
                {w.open}
              </a>
              <p className="text-center text-sm">{w.installedNote}</p>
            </>
          )}
          {view === 'prompt' && (
            <button type="button" onClick={install} className={btn}>
              {w.install}
            </button>
          )}
          {view === 'ios-hint' && <p className="rounded-2xl bg-off-white p-4 text-lg font-bold">{w.ios}</p>}
          {view === 'menu-hint' && <p className="rounded-2xl bg-off-white p-4 text-lg font-bold">{w.menu}</p>}
          {view === 'desktop-hint' && (
            <div className="rounded-2xl bg-off-white p-4">
              <p className="text-lg font-bold">{w.desktop}</p>
              <p className="mt-2 text-sm">{w.address}:</p>
              <p className="select-all break-all text-sm font-semibold">{address}</p>
            </div>
          )}
          {view === null && (
            <span className={`${btn} opacity-60`} aria-hidden="true">
              {w.install}
            </span>
          )}
        </div>
      </section>
      <section aria-labelledby="after-title" className="text-slate">
        <h2 id="after-title" className="text-lg font-extrabold">
          {w.after}
        </h2>
        <ol className="mt-2 list-decimal space-y-2 pl-6 text-base">
          {a.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
