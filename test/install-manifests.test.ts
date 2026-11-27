import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';

// The installable apps (C552): each owns its own part of the site, so all of them install on one phone. An app whose
// scope is the whole site ("/") made Chrome treat every page as already installed, so the next app never offered to
// install. Each starts inside its own scope and has its own id.

const ROOT = path.resolve(__dirname, '..');
const files = readdirSync(path.join(ROOT, 'public')).filter((f) => f.endsWith('.webmanifest'));
const apps = [
  ...files.map((f) => ({ name: f, ...(JSON.parse(readFileSync(path.join(ROOT, 'public', f), 'utf8')) as { id?: string; scope: string; start_url: string }) })),
  { name: 'src/app/manifest.ts', ...(manifest() as { id?: string; scope: string; start_url: string }) },
];
const within = (url: string, scope: string) => url === scope || url.startsWith(scope.endsWith('/') ? scope : `${scope}/`);

describe('installable apps', () => {
  it('none claims the whole site, each starts inside its own scope, each has an id', () => {
    for (const a of apps) {
      expect(a.scope, a.name).not.toBe('/');
      expect(within(a.start_url.split('?')[0], a.scope), a.name).toBe(true);
      expect(a.id, a.name).toBeTruthy();
    }
  });
  it('two different apps never overlap; the same app (same id) may be described twice', () => {
    for (const a of apps) for (const b of apps) {
      if (a === b || a.id === b.id) continue;
      expect(within(a.scope, b.scope) || within(b.scope, a.scope), `${a.name} and ${b.name}`).toBe(false);
    }
  });
});
