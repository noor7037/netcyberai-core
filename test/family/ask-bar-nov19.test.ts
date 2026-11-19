// 19 Nov 2026 (founder, phone report): the Ask bar stayed up after the keyboard closed, its side buttons disappeared,
// Send needed two taps (the tap landed on the Study tab), the bar was hard to see, and the phone's Back closed the app.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { keyboardLift, type LiftInput } from '@/components/family/tutor/keyboard-lift';
import { famBack, onBack } from '@/components/family/useBackClose';

const SRC = (p: string) => readFileSync(p, 'utf8');
// An Android app page that reports nothing about the keyboard: the old estimate path.
const silent: LiftInput = { typing: true, innerHeight: 800, baseline: 800, vvHeight: 800, vvOffsetTop: 0, scale: 1, phone: true, settled: true, lastKnown: 0, trusted: false };

describe('the keyboard', () => {
  it('without a report the pill is lifted by a guess, and only the focus could end it (the bug)', () => {
    expect(keyboardLift(silent)).toMatchObject({ open: true, source: 'estimate' });
  });
  it("with the app's own report (APK 3) the pill follows the keyboard exactly, and drops the moment it closes, focus or not", () => {
    expect(keyboardLift({ ...silent, native: 310 })).toEqual({ open: true, lift: 310, source: 'native' });
    expect(keyboardLift({ ...silent, native: 0 })).toEqual({ open: false, lift: 0, source: 'none' });
    expect(keyboardLift({ ...silent, native: 310, typing: false })).toEqual({ open: false, lift: 0, source: 'none' });
  });
  it('the Android app reports the keyboard and the page listens', () => {
    const java = SRC('android/app/src/main/java/com/netcyberai/family/MainActivity.java');
    expect(java).toContain("new CustomEvent('fam-ime',{detail:{height:");
    expect(java).toContain('WindowInsetsCompat.Type.ime()');
    expect(SRC('src/components/family/tutor/keyboard-lift.ts')).toContain('window.addEventListener(IME_EVENT, onIme);');
  });
});

describe('the Ask bar', () => {
  const composer = SRC('src/components/family/tutor/Composer.tsx');
  it('never hides its side buttons while typing, so the row never moves under a finger (one-tap Send)', () => {
    expect(composer).not.toMatch(/\bcompact\b/);
    expect(composer).toContain('data-tutor-attach');
    expect(composer).toContain('data-voice-input');
    expect(composer).toContain('data-tutor-pill-toggle');
    // The press guard stays: a tap on a button in the bar does not take the focus from the field.
    expect(composer).toContain('onMouseDown={keepFocus}');
  });
  it('a tap or a scroll outside the bar lets go of the field, so a bar the phone never reported closing comes down', () => {
    expect(composer).toContain("document.addEventListener('pointerdown', letGo, true);");
    expect(composer).toContain("document.addEventListener('touchmove', letGo, { capture: true, passive: true });");
  });
  it('wears a 2 px teal ring at rest and the saffron ring while typing', () => {
    const css = SRC('src/app/(family)/family/family.css');
    expect(css).toMatch(/\.fam-composer \{\n  transition: box-shadow 160ms ease;\n  box-shadow:[\s\S]*?inset 0 0 0 2px #0f766e;/);
    expect(css).toMatch(/\.fam-composer:focus-within \{[\s\S]*?inset 0 0 0 2px #c2410c;/);
  });
});

describe("the phone's Back", () => {
  it('closes the newest open panel first, then reports nothing open', () => {
    const closed: string[] = [];
    expect(famBack()).toBe(false);
    onBack(() => closed.push('menu'));
    const removeSheet = onBack(() => closed.push('sheet'));
    expect(famBack()).toBe(true);
    expect(closed).toEqual(['sheet']);
    removeSheet();
    expect(famBack()).toBe(true);
    expect(closed).toEqual(['sheet', 'menu']);
    expect(famBack()).toBe(false);
  });
  it('the app asks the page, then goes back a page, and leaves only from the first page', () => {
    const java = SRC('android/app/src/main/java/com/netcyberai/family/MainActivity.java');
    expect(java).toContain('window.famBack && window.famBack()');
    expect(java).toContain('if (web.canGoBack()) web.goBack();');
    expect(java).toContain('getOnBackPressedDispatcher().addCallback');
    expect(SRC('src/components/family/tutor/Composer.tsx')).toContain('useBackClose(menu || sheet !== null');
  });
});
