import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { viewport } from '@/app/(family)/family/layout';

// C415: the composer sits in a fixed dock at the bottom. On Android the keyboard covers a fixed element unless the page
// asks the keyboard to shrink the page; the family layout's viewport says so, and keeps the edge-to-edge setting.
describe('the Family layout viewport (C415)', () => {
  it('asks the keyboard to shrink the page, so the composer stays in view while typing', () => {
    expect(viewport.interactiveWidget).toBe('resizes-content');
    expect(viewport.viewportFit).toBe('cover');
  });

  // 17 Nov 2026: while the child types on a phone the tab dock steps aside and the Ask bar sits on the keyboard; when the
  // keyboard closes (the field loses the focus) the bar is back above the dock.
  it('hides the tab dock while the composer is typed in on a touch phone, and drops the bar to the keyboard', () => {
    const css = readFileSync(path.join(__dirname, '../../src/app/(family)/family/family.css'), 'utf8');
    // 18 Nov 2026: html[data-fam-kb] (keyboard-lift.ts) replaces :has(textarea:focus) + bottom: 0, which left the bar under the keys.
    expect(css).toMatch(/html\[data-fam-kb='open'\] \[data-fam-dock\] \{\s*display: none;/);
    expect(css).toMatch(/html\[data-fam-kb='open'\] body \[data-tutor-composer\]\[data-pinned='dock'\] \{\s*bottom: var\(--fam-kb-lift, 0px\);/);
    const tabs = readFileSync(path.join(__dirname, '../../src/components/family/FamilyTabs.tsx'), 'utf8');
    expect(tabs).toContain('data-fam-dock');
    const composer = readFileSync(path.join(__dirname, '../../src/components/family/tutor/Composer.tsx'), 'utf8');
    expect(composer).toContain('data-pinned={p.pinned}');
    expect(composer).toContain('data-lifted={lifted || undefined}');
  });
});
