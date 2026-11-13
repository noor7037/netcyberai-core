// A template's outline SVG, made safe before the studio draws it (C513). The outline comes from our own templates, but
// the studio treats it as untrusted all the same: it is read tag by tag against an allow-list and written out again from
// the allowed parts only (nothing of the input is passed through as it came). Anything outside the list (a script, a
// foreignObject, an image, a link, a <use>, a style sheet, an event handler, a url(...) reference, an entity or a
// DOCTYPE) refuses the whole outline: the studio then shows the free paper, never half a template. The clean SVG is
// drawn as an <img> (a data URL), where a browser runs no script whatever it holds: two locks, not one.

const ELEMENTS = new Set(['svg', 'g', 'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse', 'text', 'tspan', 'title', 'desc']);
const TEXT_ELEMENTS = new Set(['text', 'tspan', 'title', 'desc']);
const ATTRS = new Set([
  'xmlns', 'viewBox', 'width', 'height', 'd', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'dx', 'dy',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-opacity', 'fill-opacity', 'fill-rule',
  'opacity', 'transform', 'font-size', 'font-weight', 'font-family', 'text-anchor', 'dominant-baseline', 'vector-effect', 'stroke-miterlimit',
]);
// A value may hold numbers, words, colours and path data; never a reference, a script or markup.
const SAFE_VALUE = /^[-\w\s.,#%()+]*$/;
const UNSAFE_VALUE = /url\s*\(|javascript:|data:|expression|&|<|>/i;
export const OUTLINE_MAX_CHARS = 200_000;

export type CleanOutline = { svg: string; width: number; height: number };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TAG = /<\/?([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/y;
const ATTR = /\s*([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;

export function sanitiseOutline(raw: unknown): CleanOutline | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > OUTLINE_MAX_CHARS) return null;
  let src = raw.trim();
  // An XML declaration and comments say nothing; a DOCTYPE or CDATA could, so they refuse it.
  if (/<!DOCTYPE|<!\[CDATA\[|<!ENTITY/i.test(src)) return null;
  src = src.replace(/^<\?xml[^?]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '');
  const out: string[] = [];
  const open: string[] = [];
  let i = 0;
  let rootSeen = false;
  let viewBox: number[] | null = null;
  while (i < src.length) {
    if (src[i] !== '<') {
      const end = src.indexOf('<', i);
      const text = src.slice(i, end < 0 ? src.length : end);
      i = end < 0 ? src.length : end;
      if (text.trim().length === 0) continue;
      if (!TEXT_ELEMENTS.has(open[open.length - 1] ?? '')) return null;
      // Words inside <text>: written again with every special character escaped.
      out.push(esc(text.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e] ?? '')));
      continue;
    }
    TAG.lastIndex = i;
    const m = TAG.exec(src);
    if (!m) return null;
    i = TAG.lastIndex;
    const closing = src[m.index + 1] === '/';
    const name = m[1];
    if (!ELEMENTS.has(name)) return null;
    if (closing) {
      if (open.pop() !== name) return null;
      out.push(`</${name}>`);
      continue;
    }
    if (!rootSeen && name !== 'svg') return null;
    if (rootSeen && name === 'svg') return null;
    rootSeen = true;
    // Every attribute is read; one not on the list, or a value that is not plainly safe, refuses the outline.
    const attrs: string[] = [];
    const body = m[2];
    let j = 0;
    while (j < body.length) {
      if (/\s/.test(body[j])) {
        j++;
        continue;
      }
      ATTR.lastIndex = j;
      const a = ATTR.exec(body);
      if (!a) return null;
      j = ATTR.lastIndex;
      const key = a[1];
      const value = a[2] ?? a[3] ?? '';
      // The SVG namespace is the one address allowed (and written again by us below, not copied).
      if (key === 'xmlns') {
        if (name !== 'svg' || value !== 'http://www.w3.org/2000/svg') return null;
        continue;
      }
      if (!ATTRS.has(key) || UNSAFE_VALUE.test(value) || !SAFE_VALUE.test(value.replace(/["']/g, ''))) return null;
      if (name === 'svg' && key === 'viewBox') {
        const v = value.trim().split(/[\s,]+/).map(Number);
        if (v.length !== 4 || v.some((n) => !Number.isFinite(n)) || v[2] <= 0 || v[3] <= 0) return null;
        viewBox = v;
      }
      attrs.push(` ${key}="${esc(value)}"`);
    }
    const selfClosing = m[3] === '/';
    if (name === 'svg') attrs.unshift(' xmlns="http://www.w3.org/2000/svg"');
    out.push(`<${name}${attrs.join('')}${selfClosing ? '/' : ''}>`);
    if (!selfClosing) open.push(name);
  }
  if (!rootSeen || open.length > 0 || !viewBox) return null;
  return { svg: out.join(''), width: viewBox[2], height: viewBox[3] };
}

// The clean outline as an image address the <img> and the canvas both draw.
export const outlineDataUrl = (clean: CleanOutline): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean.svg)}`;
