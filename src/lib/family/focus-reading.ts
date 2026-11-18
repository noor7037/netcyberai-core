// Focus Reading (founder, 18 Nov 2026): while a child scrolls down to read, or an answer is read aloud, the bottom
// cluster (the Ask pill and the tab dock) rests out of the way; a tap on the page or a scroll up brings it back, and
// it rests again after a few quiet seconds. These are the plain rules; the hook (tutor/useFocusReading.ts) applies them.

export const HIDE_AFTER_MS = 2500;
// A scroll smaller than this is jitter, not a direction.
export const SCROLL_STEP = 10;
// Near the top of the page the bars always stay: there is nothing to read past yet.
export const TOP_ZONE = 120;

export type ScrollIntent = 'down' | 'up' | 'none';

export function scrollIntent(prev: number, now: number): ScrollIntent {
  const d = now - prev;
  return d > SCROLL_STEP ? 'down' : d < -SCROLL_STEP ? 'up' : 'none';
}

// What a scroll does to the bars: `null` = leave them as they are.
export function chromeOnScroll(intent: ScrollIntent, y: number, held: boolean): 'hide' | 'show' | null {
  if (y <= TOP_ZONE) return 'show';
  if (intent === 'up') return 'show';
  if (intent === 'down' && !held) return 'hide';
  return null;
}

// Whether the quiet timer may hide the bars: never while a hand or the keyboard is on them, near the top of the page,
// or for someone who asked for less motion (they use the Focus button instead).
export function mayAutoHide(o: { held: boolean; y: number; reading: boolean; reduced: boolean }): boolean {
  if (o.reduced || o.held) return false;
  return o.reading || o.y > TOP_ZONE;
}

const INTERACTIVE = 'a,button,input,textarea,select,summary,label,iframe,video,audio,[role="button"],[role="tab"],[role="slider"],[contenteditable="true"],[data-fam-dock],[data-tutor-composer]';
// A tap that is not on a control: the page itself.
export function isPageTap(target: Element | null): boolean {
  return !!target && !target.closest(INTERACTIVE);
}
