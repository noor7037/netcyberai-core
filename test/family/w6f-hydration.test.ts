import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sameInkOnBothSides } from '@/lib/family/day-text';

const ROOT = path.resolve(__dirname, '../..');

// W6-F: Node's ICU writes October in Hindi as "अक्टू॰", Chromium's as "अक्तू॰"; a client component that formats a date
// with Intl then fails to hydrate (the parent area in Hindi). The parent area's date helpers go through one spelling.
describe('the parent area dates hydrate the same in Hindi', () => {
  it('writes October with the browser spelling', () => {
    expect(sameInkOnBothSides('24 अक्टू॰')).toBe('24 अक्तू॰');
    expect(sameInkOnBothSides('24 अक्तू॰')).toBe('24 अक्तू॰');
    expect(sameInkOnBothSides('24 Oct')).toBe('24 Oct');
  });
  it('is used by every date helper of the parent area sections', () => {
    for (const f of ['SchoolSection', 'HomePlanSection', 'ChildPhoneSection']) {
      const src = readFileSync(path.join(ROOT, `src/components/family/${f}.tsx`), 'utf8');
      const helpers = src.split('\n').filter((l) => /^const (day|when|weekdayName) = /.test(l));
      expect(helpers.length).toBeGreaterThan(0);
      for (const l of helpers) expect(l).toContain('sameInkOnBothSides(');
    }
  });
});
