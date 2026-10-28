import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { SHELL_WORD_KEYS, SHELL_WORD_PREFIXES } from '@/components/app-shell/shell-words';
import { PAGE_WORDS } from '@/components/app-shell/page-words';
import { en } from '@/lib/i18n/messages/en';
import { clientWords } from './client-words-trace';

// C402: picked words cover what each page shows, and no Control page carries the whole message table. Each page's
// client files are followed from its page.tsx. On a Control page none may import the table (`t` from '@/lib/i18n', or
// useT), and every key any of them names must be picked. On any other page, the components that read picked words
// (useWords) must find theirs. Picked by the shell (shell-words.ts), by the page, or by a layout above it
// (page-words.ts, a route ending in `/*`). A word nobody picked would show as nothing.

const ROOT = path.resolve(__dirname, '../..');
const walk = (dir: string, name: string): string[] =>
  readdirSync(path.join(ROOT, dir)).flatMap((n) => {
    const p = `${dir}/${n}`;
    return statSync(path.join(ROOT, p)).isDirectory() ? walk(p, name) : n === name ? [p] : [];
  });
// src/app/(admin)/control/ai/page.tsx → /control/ai: route groups are not in the address.
const routeOf = (file: string) => file.replace(/^src\/app/, '').replace(/\/\([^/]+\)/g, '').replace(/\/(page|layout)\.tsx$/, '') || '/';

const KEYS = new Set(Object.keys(en));
const ROUTES = PAGE_WORDS as Record<string, readonly string[]>;
const PAGES = walk('src/app', 'page.tsx');
const LAYOUTS = walk('src/app', 'layout.tsx');
const LIGHT = /from '(?:@\/components\/app-shell\/Words|@\/lib\/i18n\/words|\.\/words)'/;

const picksFor = (route: string) => [
  ...SHELL_WORD_PREFIXES,
  ...(ROUTES[route] ?? []),
  ...Object.entries(ROUTES).flatMap(([r, p]) => (r.endsWith('/*') && (route === r.slice(0, -2) || route.startsWith(r.slice(0, -1))) ? p : [])),
];

describe('picked words cover every page', () => {
  it('finds the pages', () => expect(PAGES.filter((p) => routeOf(p).startsWith('/control')).length).toBeGreaterThan(25));

  for (const page of PAGES) {
    const route = routeOf(page);
    const control = route === '/control' || route.startsWith('/control/');
    const found = clientWords(page, KEYS);
    const checked = control ? found.files : found.files.filter((f) => LIGHT.test(readFileSync(path.join(ROOT, f), 'utf8')));
    if (!control && checked.length === 0) continue;
    it(route, () => {
      if (control) expect(found.tableUsers, 'client files that import the whole message table').toEqual([]);
      const picks = picksFor(route);
      const covered = (k: string) => (SHELL_WORD_KEYS as readonly string[]).includes(k) || picks.some((p) => k.startsWith(p));
      const inChecked = (f: string) => checked.includes(f);
      const missing = [
        ...[...found.quoted].filter(([k, f]) => inChecked(f) && !covered(k)).map(([k, f]) => `${k} (${f})`),
        ...[...found.built].filter(([b, f]) => inChecked(f) && !picks.some((p) => b.startsWith(p))).map(([b, f]) => `${b}… (${f})`),
      ];
      expect(missing, 'keys nobody picks').toEqual([]);
    });
  }

  it('every route in the map is picked where it says', () => {
    for (const r of Object.keys(ROUTES)) {
      const layout = r.endsWith('/*');
      const file = (layout ? LAYOUTS : PAGES).find((f) => routeOf(f) === (layout ? r.slice(0, -2) : r));
      expect(file, r).toBeDefined();
      expect(readFileSync(path.join(ROOT, file!), 'utf8'), r).toMatch(new RegExp(`pageWords\\((?:lang|'en'), '${r.replace(/[[\]*]/g, '\\$&')}'\\)`));
    }
  });
});
