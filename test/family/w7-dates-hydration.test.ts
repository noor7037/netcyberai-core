import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sameInkOnBothSides } from '@/lib/family/day-text';
import { dayLabel } from '@/lib/family/plan';
import { focusTimeLabel } from '@/lib/family/focus';

const ROOT = path.resolve(__dirname, '../..');
const DIRS = ['src/components/family', 'src/app/(family)', 'src/lib/family'];

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) ? [p] : [];
  });

// W7 (after W6-F): every Family screen that writes a date in Hindi goes through sameInkOnBothSides, so the server
// (Node's ICU, "अक्टू॰") and the phone's browser (Chromium's ICU, "अक्तू॰") write October the same way and the page
// hydrates. The scan finds every Intl date formatter given 'hi-IN' and asks for the helper on its line or the one before.
describe('Family dates hydrate the same in Hindi on every screen', () => {
  it('writes October with the browser spelling, short and long', () => {
    expect(sameInkOnBothSides('24 अक्टू॰')).toBe('24 अक्तू॰');
    expect(sameInkOnBothSides('24 अक्टूबर')).toBe('24 अक्तूबर');
  });

  it('the shared date helpers give the browser spelling whatever Node writes', () => {
    expect(dayLabel('2026-10-24', 'hi')).not.toContain('अक्टू');
    expect(dayLabel('2026-10-24', 'hi')).toContain('अक्तू');
    expect(focusTimeLabel('2026-10-24T06:30:00Z', 'hi')).not.toContain('अक्टू');
  });

  it('no Hindi date formatter on a Family screen skips the helper', () => {
    const found: string[] = [];
    const missing: string[] = [];
    for (const dir of DIRS) {
      for (const f of files(path.join(ROOT, dir))) {
        const lines = readFileSync(f, 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (!/new Intl\.DateTimeFormat\(|\.toLocale(?:Date|Time)?String\(/.test(line) || !line.includes('hi-IN')) return;
          const at = `${path.relative(ROOT, f)}:${i + 1}`;
          found.push(at);
          if (!`${lines[i - 1] ?? ''}\n${line}`.includes('sameInkOnBothSides(')) missing.push(at);
        });
      }
    }
    expect(found.length).toBeGreaterThanOrEqual(19);
    expect(missing).toEqual([]);
  });
});
