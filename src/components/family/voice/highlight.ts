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
  if (!root || !text) return;
  const found = findSentence(root, text, 0);
  if (!found) return;
  const r = document.createRange();
  r.setStart(found.node, found.at);
  r.setEnd(found.node, found.at + text.length);
  h.registry.set('nc-sentence', h.make(r));
}
