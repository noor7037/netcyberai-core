import { lastChildSettings } from '@/lib/family/child-settings';
// The sentence being read aloud, highlighted in the text through the CSS Custom Highlight API (family.css
// ::highlight(nc-sentence)): nothing moves and the text is never rewritten. Shared by the chapter reader (S1, C374) and an
// answer's "Teach me" (W18-P1). A phone without the API still hears the voice and sees the board move.

type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void };

export const highlights = (): { registry: HighlightRegistry; make: (...r: Range[]) => unknown } | null => {
  if (typeof window === 'undefined') return null;
  const registry = (globalThis.CSS as unknown as { highlights?: HighlightRegistry } | undefined)?.highlights;
  const H = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  return registry && H ? { registry, make: (...r) => new H(...r) } : null;
};

// The sentence's place in the text under `root`: the `nth` time it appears, inside one text node (each field of a block
// is one text node, and a sentence never crosses fields).
export function findSentence(root: HTMLElement, text: string, nth: number): { node: Text; at: number } | null {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
    for (let at = n.data.indexOf(text); at >= 0; at = n.data.indexOf(text, at + 1)) {
      if (seen === nth) return { node: n, at };
      seen++;
    }
  }
  return null;
}

// Highlights `text` (its first appearance) under `root` as the sentence being read; null or not found clears it.
export function markSentence(root: HTMLElement | null, text: string | null): void {
  const h = highlights();
  if (!h) return;
  h.registry.delete('nc-sentence');
  h.registry.delete('nc-word');
  if (!root || !text) return;
  const found = findSentence(root, text, 0);
  if (!found) return;
  const r = document.createRange();
  r.setStart(found.node, found.at);
  r.setEnd(found.node, found.at + text.length);
  h.registry.set('nc-sentence', h.make(r));
  keepInView(r);
}

// W22-S3: the word being spoken, when the voice reports word boundaries (`charIndex` in the sentence's own text): the
// word from there to the next space, marked inside the sentence's mark. No boundaries, no word mark.
export function markWord(root: HTMLElement | null, text: string | null, charIndex: number): void {
  const h = highlights();
  if (!h) return;
  h.registry.delete('nc-word');
  if (!root || !text || !Number.isFinite(charIndex) || charIndex < 0 || charIndex >= text.length) return;
  const found = findSentence(root, text, 0);
  if (!found) return;
  const rest = text.slice(charIndex);
  const len = rest.search(/\s/);
  const r = document.createRange();
  r.setStart(found.node, found.at + charIndex);
  r.setEnd(found.node, found.at + charIndex + (len < 0 ? rest.length : len));
  if (r.collapsed) return;
  h.registry.set('nc-word', h.make(r));
}

// W22-S3: the line being read stays on screen without the child touching anything. If the sentence's first line is out of
// the band between the top of the screen (under the tutor's face) and the bottom (above the composer), the nearest
// scrolling parent moves it to the middle. Calm: instant under reduced motion, a short smooth scroll otherwise.
const BAND = { top: 90, bottom: 140 };
export function keepInView(r: Range): void {
  if (typeof window === 'undefined') return;
  // The child switched following off in Settings (W23): the highlight still moves, the page does not.
  if (lastChildSettings()?.autoScroll === false) return;
  const box = r.getClientRects()[0] ?? r.getBoundingClientRect();
  if (!box || (box.width === 0 && box.height === 0)) return;
  if (box.top >= BAND.top && box.bottom <= window.innerHeight - BAND.bottom) return;
  const el = r.startContainer.parentElement;
  const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el?.scrollIntoView?.({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
}
