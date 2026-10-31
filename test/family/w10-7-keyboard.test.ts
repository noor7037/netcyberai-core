import { describe, expect, it } from 'vitest';
import { viewport } from '@/app/(family)/family/layout';

// C415: the composer sits in a fixed dock at the bottom. On Android the keyboard covers a fixed element unless the page
// asks the keyboard to shrink the page; the family layout's viewport says so, and keeps the edge-to-edge setting.
describe('the Family layout viewport (C415)', () => {
  it('asks the keyboard to shrink the page, so the composer stays in view while typing', () => {
    expect(viewport.interactiveWidget).toBe('resizes-content');
    expect(viewport.viewportFit).toBe('cover');
  });
});
