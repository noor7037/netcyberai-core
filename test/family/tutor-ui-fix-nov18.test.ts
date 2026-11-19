import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { HIDE_AFTER_MS, TOP_ZONE, chromeOnScroll, isPageTap, mayAutoHide, scrollIntent } from '@/lib/family/focus-reading';

const SRC = (p: string) => readFileSync(p, 'utf8');
const win = SRC('src/components/family/tutor/TutorWindow.tsx');
const composer = SRC('src/components/family/tutor/Composer.tsx');

describe('§1 the Conversation clock is the chat / chapters toggle again', () => {
  it('matches the toggle at 1e666aae and opens no history sheet', () => {
    const old = execSync('git show 1e666aae227a9a8fecca67b7a2f6755f17fa43ba:src/components/family/tutor/TutorWindow.tsx', { encoding: 'utf8' });
    for (const part of ['historyOpen={open && shown}', 'historyFor={ids.feed}', 'setOpen((o) => !o);', 'if (!open) toNewest();', "${open && shown ? 'flex' : 'hidden'}"]) expect(old).toContain(part);
    for (const part of ['historyOpen={open && shown}', 'historyFor={ids.feed}', 'setOpen((o) => !o);', 'if (!open) toNewest();']) expect(win).toContain(part);
    expect(win).toMatch(/open && \(shown \|\| place\) \? 'flex' : 'hidden'/);
    expect(win).not.toContain('ConversationList');
    expect(win).toContain('{children}');
    expect(composer).toContain('aria-expanded={p.historyOpen}');
    expect(composer).toContain('aria-controls={p.historyFor}');
  });
});

describe('§2 Focus Reading rules', () => {
  it('hides on a scroll down past the top, returns on a scroll up, never near the top', () => {
    expect(scrollIntent(0, 40)).toBe('down');
    expect(scrollIntent(100, 80)).toBe('up');
    expect(scrollIntent(100, 104)).toBe('none');
    expect(chromeOnScroll('down', TOP_ZONE + 200, false)).toBe('hide');
    expect(chromeOnScroll('down', TOP_ZONE + 200, true)).toBeNull();
    expect(chromeOnScroll('up', TOP_ZONE + 200, false)).toBe('show');
    expect(chromeOnScroll('down', 30, false)).toBe('show');
    expect(HIDE_AFTER_MS).toBeGreaterThanOrEqual(2000);
    expect(HIDE_AFTER_MS).toBeLessThanOrEqual(3000);
  });
  it('the quiet timer waits for a hand, the keyboard, the top of the page, and reduced motion', () => {
    expect(mayAutoHide({ held: false, y: 500, reading: false, reduced: false })).toBe(true);
    expect(mayAutoHide({ held: true, y: 500, reading: true, reduced: false })).toBe(false);
    expect(mayAutoHide({ held: false, y: 10, reading: false, reduced: false })).toBe(false);
    expect(mayAutoHide({ held: false, y: 10, reading: true, reduced: false })).toBe(true);
    expect(mayAutoHide({ held: false, y: 900, reading: true, reduced: true })).toBe(false);
  });
  it('a tap on a control is not a page tap', () => {
    const el = (html: string) => ({ closest: (sel: string) => (html === 'button' && sel.includes('button') ? {} : null) }) as unknown as Element;
    expect(isPageTap(el('button'))).toBe(false);
    expect(isPageTap(el('p'))).toBe(true);
  });
  it('the stylesheet hides the dock and the pill and gives the bottom room back; reduced motion has a Focus button', () => {
    const css = SRC('src/app/(family)/family/family.css');
    expect(css).toContain("html[data-fam-chrome='hidden'] [data-fam-dock]");
    expect(css).toContain("html[data-fam-chrome='hidden'] [data-tutor-composer][data-pinned='dock']");
    expect(css).toMatch(/\[data-family-settings\] \{\s*padding-bottom: var\(--fam-bottom/);
    expect(win).toContain('data-focus-toggle');
    expect(win).toContain('focus.reduced');
    expect(SRC('src/components/family/tutor/useFocusReading.ts')).toContain('isTyping');
  });
});

describe('§3 the number puck', () => {
  const puck = SRC('src/components/family/tutor/QuestionPuck.tsx');
  it('floats mid-right, shows while scrolling, lists three at a time and goes to a question', () => {
    expect(puck).toContain('fixed right-2 top-[42vh]');
    expect(puck).toContain("addEventListener('scroll'");
    expect(puck).toContain('ROW * 3');
    expect(puck).toContain('onGo(c.n)');
    expect(win).toContain('<QuestionPuck');
    expect(win).toContain("fill(w['fam.tutor.questionN'], { n })");
  });
});

describe('§4 §5 full-bleed and the Ask pill', () => {
  it('the dock and the page are wide, not a 3xl island; the pill opens into the composer', () => {
    expect(composer).not.toContain('max-w-3xl');
    expect(SRC('src/components/family/FamilyTabs.tsx')).not.toContain('lg:max-w-3xl');
    expect(SRC('src/components/family/FamilyTabs.tsx')).toContain('--fam-dock-h');
    expect(composer).toContain('data-tutor-pill-toggle');
    expect(composer).toContain("pill = p.pinned === 'dock'");
    expect(composer).toContain('setExpanded(false)');
    expect(composer).toContain('data-tutor-history');
  });
});

describe('§6 §7 video and lab frame (no Full screen overlay, 18 Nov 2026 fourth report)', () => {
  it('the video and the sim use a plain 16:9 frame with no overlay button, no handler and no strings', () => {
    const sim = SRC('src/components/family/blocks/SimCard.tsx');
    const vid = SRC('src/components/family/VideoPicks.tsx');
    const frame = SRC('src/components/family/MediaFrame.tsx');
    expect(frame).toContain('aspect-video');
    expect(frame).not.toContain('<button');
    expect(sim).toContain('MediaFrame');
    expect(sim).not.toMatch(/min-h-\[(260|320)px\]|h-\[(420|560|640)px\]/);
    expect(sim).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-forms"');
    expect(vid).toContain('MediaFrame');
    expect(vid).toContain('allowFullScreen');
    expect(existsSync(join(process.cwd(), 'src/components/family/FullscreenStage.tsx'))).toBe(false);
    for (const f of ['src/lib/i18n/messages/en.ts', 'src/lib/i18n/messages/hi.ts', 'src/lib/family/understand-words.ts']) expect(SRC(f)).not.toMatch(/fam\.media\.(fullscreen|exit|turnPhone)/);
  });
});
