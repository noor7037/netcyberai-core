'use client';

import { useState } from 'react';

// Light, dark or "like my phone" (C553): the person's own choice, kept on this device (a cookie the layout reads, so the
// first screen already has the right colours). One tap moves to the next.
const ORDER = ['light', 'dark', 'system'] as const;
type Mode = (typeof ORDER)[number];
const WORDS: Record<string, Record<Mode, string>> = {
  en: { light: 'Light', dark: 'Dark', system: 'Like my phone' },
  hi: { light: 'हल्का', dark: 'गहरा', system: 'फ़ोन जैसा' },
};
const ICON: Record<Mode, string> = { light: '☀', dark: '☾', system: '◐' };

export function ModeSwitch({ mode, lang }: { mode: string; lang: string }) {
  const [now, setNow] = useState<Mode>((ORDER as readonly string[]).includes(mode) ? (mode as Mode) : 'light');
  const w = WORDS[lang === 'hi' ? 'hi' : 'en'];
  function next() {
    const m = ORDER[(ORDER.indexOf(now) + 1) % ORDER.length];
    setNow(m);
    document.cookie = `nca_mode=${m}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.dataset.ncaMode = m;
    document.querySelectorAll<HTMLElement>('[data-school-app]').forEach((el) => (el.dataset.ncaMode = m));
  }
  return (
    <button type="button" onClick={next} aria-label={w[now]} title={w[now]} data-mode-switch={now} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/15 text-lg font-bold text-white ring-1 ring-white/30">
      <span aria-hidden="true">{ICON[now]}</span>
    </button>
  );
}
