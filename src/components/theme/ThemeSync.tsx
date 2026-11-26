'use client';

import { useEffect } from 'react';

// Pop-ups and menus drawn outside the school app's wrapper (at the page's root) take the same theme and mode while the
// school app is open, and lose them when it closes, so the website and the Family app keep their own colours (C553).
export function ThemeSync({ theme, mode }: { theme: string; mode: string }) {
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.ncaTheme = theme;
    html.dataset.ncaMode = mode;
    return () => {
      delete html.dataset.ncaTheme;
      delete html.dataset.ncaMode;
    };
  }, [theme, mode]);
  return null;
}
