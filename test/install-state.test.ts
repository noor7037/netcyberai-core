import { describe, expect, it } from 'vitest';
import { decideInstallView } from '@/lib/install/install-state';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';

describe('decideInstallView', () => {
  it('installed wins over everything', () => {
    expect(decideInstallView({ installed: true, hasPrompt: true, userAgent: ANDROID })).toBe('installed');
  });
  it('a captured prompt gives the one-tap install', () => {
    expect(decideInstallView({ installed: false, hasPrompt: true, userAgent: ANDROID })).toBe('prompt');
  });
  it('iPhone and iPad (including iPadOS posing as a Mac) get the Share hint', () => {
    expect(decideInstallView({ installed: false, hasPrompt: false, userAgent: IPHONE })).toBe('ios-hint');
    expect(decideInstallView({ installed: false, hasPrompt: false, userAgent: IPAD_AS_MAC, maxTouchPoints: 5 })).toBe('ios-hint');
  });
  it('a desktop browser without a prompt is told to use the phone; a real Mac is not mistaken for an iPad', () => {
    expect(decideInstallView({ installed: false, hasPrompt: false, userAgent: DESKTOP })).toBe('desktop-hint');
    expect(decideInstallView({ installed: false, hasPrompt: false, userAgent: IPAD_AS_MAC, maxTouchPoints: 0 })).toBe('desktop-hint');
  });
  it('an Android browser with no prompt gets the menu hint', () => {
    expect(decideInstallView({ installed: false, hasPrompt: false, userAgent: ANDROID })).toBe('menu-hint');
  });
});
