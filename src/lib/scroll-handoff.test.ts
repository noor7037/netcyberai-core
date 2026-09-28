import { describe, expect, it } from 'vitest';
import { splitScroll } from './scroll-handoff';

// The wheel hand-off from a preview's scroll area to the page (C85).
describe('splitScroll', () => {
  it('keeps the whole movement inside while the area can still scroll', () => {
    expect(splitScroll(100, 500, 40)).toEqual({ inside: 40, rest: 0 });
    expect(splitScroll(100, 500, -40)).toEqual({ inside: -40, rest: 0 });
  });
  it('passes the remainder to the page in the same event at the bottom edge', () => {
    expect(splitScroll(480, 500, 100)).toEqual({ inside: 20, rest: 80 });
  });
  it('passes the remainder to the page in the same event at the top edge', () => {
    expect(splitScroll(30, 500, -100)).toEqual({ inside: -30, rest: -70 });
  });
  it('sends everything to the page once the area is at its edge', () => {
    expect(splitScroll(500, 500, 100)).toEqual({ inside: 0, rest: 100 });
    expect(splitScroll(0, 500, -100)).toEqual({ inside: -0, rest: -100 });
  });
  it('ignores sub-pixel leftovers', () => {
    expect(splitScroll(499.7, 500, 0.6).rest).toBe(0);
  });
});
