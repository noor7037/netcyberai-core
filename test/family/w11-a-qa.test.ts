import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { KEYBOARD_MIN, isTyping, keyboardInset, watchKeyboard, type KeyboardWindow } from '@/components/family/tutor/useKeyboardInset';

// W11-A (C416): the Family app QA fixes of 30-31 Oct.
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

describe('the guessed parent-area addresses', () => {
  // W19-C: /family/progress is now the child's own Progress screen (test/family/w19-c-look.test.ts).
  it('/family/children opens the parent area on Children', async () => {
    const children = (await import('@/app/(family)/family/(app)/children/page')).default;
    expect(() => children()).toThrow('redirect:/family/parent#children');
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

  it('takes the larger layout height, so an iOS that shrinks innerHeight is not read as no keyboard; a bar settling is 0', () => {
    // innerHeight already shrunk to the visible part, the layout viewport (clientHeight) still full: the keyboard is there.
    expect(keyboardInset(500, { height: 500, offsetTop: 0, scale: 1 }, 800)).toBe(300);
    // Android Chrome with resizes-content: the page itself shrank, both heights agree: nothing to add (no double offset).
    expect(keyboardInset(500, { height: 500, offsetTop: 0, scale: 1 }, 500)).toBe(0);
    // A browser toolbar growing by 56 px is not a keyboard.
    expect(keyboardInset(800, { height: 744, offsetTop: 0, scale: 1 })).toBe(0);
    expect(keyboardInset(800, { height: 800 - KEYBOARD_MIN, offsetTop: 0, scale: 1 })).toBe(KEYBOARD_MIN);
  });

  it('is 0 with no text field focused, and reads again when the focus moves (iOS reports a closed keyboard late)', () => {
    vi.useFakeTimers();
    const vv = fakeViewport(500);
    const on = new Map<string, () => void>();
    let typing = true;
    const win = { innerHeight: 800, visualViewport: vv, addEventListener: (t: string, f: () => void) => void on.set(t, f), removeEventListener: (t: string) => void on.delete(t) } as unknown as KeyboardWindow;
    const seen: number[] = [];
    const stop = watchKeyboard(win, (px) => seen.push(px), () => typing);
    expect(seen).toEqual([300]);
    typing = false;
    on.get('focusout')?.();
    vi.advanceTimersByTime(100);
    expect(seen).toEqual([300, 0]);
    stop();
    expect(on.size).toBe(0);
    vi.useRealTimers();
  });

  it('counts a textarea and a text input as typing, not a button or a checkbox', () => {
    const el = (tagName: string, type = '') => ({ tagName, type }) as unknown as Element;
    expect(isTyping(el('TEXTAREA'))).toBe(true);
    expect(isTyping(el('INPUT', 'text'))).toBe(true);
    expect(isTyping(el('INPUT', 'checkbox'))).toBe(false);
    expect(isTyping(el('BUTTON'))).toBe(false);
    expect(isTyping(null)).toBe(false);
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
