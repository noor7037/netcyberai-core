import { describe, expect, it } from 'vitest';
import { SIDEBAR_KEY, readSidebarHidden, writeSidebarHidden } from '@/components/app-shell/sidebar-preference';

// A store the test can look into; `fail` makes every call throw, the way a blocked or full browser store does.
function store(initial: Record<string, string> = {}, fail = false) {
  const data = new Map(Object.entries(initial));
  const boom = () => {
    throw new Error('storage is blocked');
  };
  return {
    data,
    getItem: (k: string) => (fail ? boom() : (data.get(k) ?? null)),
    setItem: (k: string, v: string) => (fail ? boom() : void data.set(k, v)),
    removeItem: (k: string) => (fail ? boom() : void data.delete(k)),
  };
}

describe('the sidebar preference (F1-2)', () => {
  it('shows the sidebar when nothing is stored, and hides it only for the one stored word', () => {
    expect(readSidebarHidden(store())).toBe(false);
    expect(readSidebarHidden(store({ [SIDEBAR_KEY]: 'hidden' }))).toBe(true);
    expect(readSidebarHidden(store({ [SIDEBAR_KEY]: 'shown' }))).toBe(false);
    expect(readSidebarHidden(store({ [SIDEBAR_KEY]: '1' }))).toBe(false);
    expect(readSidebarHidden(store({ [SIDEBAR_KEY]: '' }))).toBe(false);
  });

  it('reads as shown, without throwing, when the store is missing or throws', () => {
    expect(readSidebarHidden(null)).toBe(false);
    expect(readSidebarHidden(store({ [SIDEBAR_KEY]: 'hidden' }, true))).toBe(false);
    // Outside a browser there is no store at all.
    expect(readSidebarHidden()).toBe(false);
  });

  it('writes the choice, and clears the key when the sidebar is shown again', () => {
    const s = store();
    writeSidebarHidden(true, s);
    expect(s.data.get(SIDEBAR_KEY)).toBe('hidden');
    expect(readSidebarHidden(s)).toBe(true);
    writeSidebarHidden(false, s);
    expect(s.data.has(SIDEBAR_KEY)).toBe(false);
    expect(readSidebarHidden(s)).toBe(false);
  });

  it('a write that fails, or has no store, does nothing and does not throw', () => {
    expect(() => writeSidebarHidden(true, store({}, true))).not.toThrow();
    expect(() => writeSidebarHidden(false, store({}, true))).not.toThrow();
    expect(() => writeSidebarHidden(true, null)).not.toThrow();
    expect(() => writeSidebarHidden(true)).not.toThrow();
  });
});
