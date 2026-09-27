import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Public-website copy must not describe planned work as live. Full data
// export is a Constitution commitment but is not built yet
// (docs/03_ARCHITECTURE_PLAIN.md "Per-tenant export"), and the site is
// past Phase 0 (a live database, sign-in and lead intake exist), so
// either kind of wording is a false statement to a prospective school.
const ROOTS = ['src/app', 'src/components', 'src/content'];
const SKIP = [/\(admin\)/, /\(school\)/, /\.test\.ts$/, /\/api\//];

const BANNED: { pattern: RegExp; why: string }[] = [
  { pattern: /fully exportable/i, why: 'full export is planned, not live' },
  {
    pattern: /export(?:ed)?\b[^.'"]{0,60}\b(?:at any time|whenever (?:you|it)|on request|available now)/i,
    why: 'full export is planned, not live',
  },
  { pattern: /Phase 0/, why: 'the platform is past Phase 0' },
  { pattern: /no live (?:school )?database/i, why: 'the database is live' },
  { pattern: /(?:web|parent) portal exists/i, why: 'there is no parent portal (Decision Log C13)' },
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|txt)$/.test(name) ? [path] : [];
  });
}

describe('public website honesty', () => {
  const targets = ROOTS.flatMap(files).filter((f) => !SKIP.some((s) => s.test(f)));

  it('scans the public website sources', () => {
    expect(targets.length).toBeGreaterThan(20);
  });

  for (const { pattern, why } of BANNED) {
    it(`no copy matches ${pattern} (${why})`, () => {
      const hits = targets.flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => ({ f, line: i + 1, text: line.trim() }))
          .filter(({ text }) => pattern.test(text))
      );
      expect(hits, hits.map((h) => `${h.f}:${h.line} ${h.text}`).join('\n')).toEqual([]);
    });
  }
});
