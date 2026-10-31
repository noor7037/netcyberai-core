import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { keyboardInset, watchKeyboard, type KeyboardWindow } from '@/components/family/tutor/useKeyboardInset';

// W11-A (C416): the Family app QA fixes of 30-31 Oct.
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

describe('the guessed parent-area addresses', () => {
  it('/family/children opens the parent area on Children, /family/progress on Overview', async () => {
    const children = (await import('@/app/(family)/family/(app)/children/page')).default;
    const progress = (await import('@/app/(family)/family/(app)/progress/page')).default;
    expect(() => children()).toThrow('redirect:/family/parent#children');
    expect(() => progress()).toThrow('redirect:/family/parent#overview');
  });
});

describe('the composer above the keyboard', () => {
  // A visual viewport the test moves, as a phone's keyboard does.
  const fakeViewport = (height: number, offsetTop = 0, scale = 1) => {
    const on = new Map<string, Set<() => void>>();
    const vv = {
      height,
      offsetTop,
      scale,
      addEventListener: (t: string, f: () => void) => void (on.get(t) ?? on.set(t, new Set()).get(t)!).add(f),
      removeEventListener: (t: string, f: () => void) => void on.get(t)?.delete(f),
      fire: (t: string) => on.get(t)?.forEach((f) => f()),
      count: () => [...on.values()].reduce((n, s) => n + s.size, 0),
    };
    return vv;
  };

  it('the inset is the part of the page the keyboard covers, never below 0, and 0 while pinch-zoomed', () => {
    expect(keyboardInset(800, { height: 800, offsetTop: 0, scale: 1 })).toBe(0);
    expect(keyboardInset(800, { height: 480, offsetTop: 0, scale: 1 })).toBe(320);
    expect(keyboardInset(800, { height: 480, offsetTop: 100, scale: 1 })).toBe(220);
    expect(keyboardInset(600, { height: 640, offsetTop: 0, scale: 1 })).toBe(0);
    expect(keyboardInset(800, { height: 400, offsetTop: 0, scale: 2 })).toBe(0);
  });

  it('follows the keyboard opening, the page panning and the keyboard closing; stops when unsubscribed', () => {
    const vv = fakeViewport(800);
    const win = { innerHeight: 800, visualViewport: vv } as unknown as KeyboardWindow;
    const seen: number[] = [];
    const stop = watchKeyboard(win, (px) => seen.push(px));
    expect(seen).toEqual([0]);
    vv.height = 500;
    vv.fire('resize');
    vv.offsetTop = 40;
    vv.fire('scroll');
    vv.height = 800;
    vv.offsetTop = 0;
    vv.fire('resize');
    expect(seen).toEqual([0, 300, 260, 0]);
    stop();
    expect(vv.count()).toBe(0);
  });

  it('does nothing where the browser has no visualViewport', () => {
    const seen: number[] = [];
    watchKeyboard({ innerHeight: 800 }, (px) => seen.push(px))();
    expect(seen).toEqual([]);
  });

  it('the dock sets --fam-keyboard, rises by it in both pinned modes, and keeps the field in view', () => {
    const src = readFileSync(path.join(__dirname, '../../src/components/family/tutor/Composer.tsx'), 'utf8');
    expect(src).toMatch(/const keyboard = useKeyboardInset\(\)/);
    expect(src).toMatch(/'--fam-keyboard': `\$\{keyboard\}px`/);
    expect(src).toMatch(/paddingBottom: 'calc\(var\(--fam-keyboard\) \+ 0\.25rem\)'/);
    expect(src).toMatch(/\$\{lifted \? 'bottom-0' : p\.pinned === 'dock'/);
    expect(src).toMatch(/scrollIntoView\(\{ block: 'nearest' \}\)/);
    expect(src).toMatch(/onFocus=\{keepInView\}/);
  });
});
