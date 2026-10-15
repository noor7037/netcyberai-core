// The words a person can see on a screen (C235-C): what the declutter pass is
// measured by. Runs inside the page (page.evaluate), so it is self-contained.
//
// Counted: every rendered text node in <main> (headings, labels, buttons,
// chart labels), the chosen option of each <select>, and a placeholder while
// it is showing. Not counted: the shell around the screen (the menu, the
// search-and-language bar, a header or menu bar fixed to the window), text a
// reader cannot see -- screen-reader-only text, a closed disclosure,
// display:none, visibility:hidden, opacity 0 -- and tokens with no letter or
// digit ("·", "→").
export function visibleWords() {
  const main = document.querySelector('main') ?? document.body;
  const shell = (el) => {
    if (el.closest('aside, [data-shell-lang]')) return true;
    const bar = el.closest('header, nav');
    if (!bar) return false;
    const p = getComputedStyle(bar).position;
    return p === 'fixed' || p === 'sticky';
  };
  const hiddenCache = new Map();
  const clipped = (el) => {
    if (!el || el === main.parentElement) return false;
    if (hiddenCache.has(el)) return hiddenCache.get(el);
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const tiny = (r.width <= 1 || r.height <= 1) && (cs.overflow === 'hidden' || cs.clip !== 'auto' || cs.position === 'absolute');
    const hidden = tiny || clipped(el.parentElement);
    hiddenCache.set(el, hidden);
    return hidden;
  };
  const seen = (el) => !shell(el) && el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) && !clipped(el);
  const out = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim();
    const el = n.parentElement;
    if (!text || !el || el.closest('script, style, noscript, template, option, select')) continue;
    range.selectNodeContents(n);
    if (![...range.getClientRects()].some((r) => r.width > 1 && r.height > 1)) continue;
    if (seen(el)) out.push(text);
  }
  for (const s of main.querySelectorAll('select')) if (seen(s) && s.selectedOptions[0]) out.push(s.selectedOptions[0].textContent.trim());
  for (const f of main.querySelectorAll('input[placeholder], textarea[placeholder]')) {
    if (f.value || !seen(f)) continue;
    const c = getComputedStyle(f, '::placeholder').color;
    if (!/rgba\([^)]*,\s*0\)$/.test(c) && c !== 'transparent') out.push(f.placeholder);
  }
  return out.join(' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
}
