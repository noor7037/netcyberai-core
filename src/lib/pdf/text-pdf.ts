// A small text PDF writer for the server (W14-F): a report card made by a job, where no browser draws a canvas. Every
// other PDF of the app is drawn in the browser (./browser.ts) and keeps Hindi through the device's fonts; this one
// uses the PDF's own Helvetica, so it prints Latin letters only: anything else becomes "?". A4 pages, a title, lines,
// headings, notes and ruled tables, a document's blocks each starting a new page. Pure: no database, no file, no fetch.

export type TextBlock =
  | { kind: 'title'; text: string }
  | { kind: 'subtitle'; text: string }
  | { kind: 'line'; text: string; strong?: boolean }
  | { kind: 'heading'; text: string }
  | { kind: 'table'; columns: string[]; rows: string[][]; numeric: boolean[]; totalRow: boolean }
  | { kind: 'note'; text: string };

const PAGE = { w: 595.28, h: 841.89 };
const MARGIN = 48;
const WIDTH = PAGE.w - 2 * MARGIN;
const CELL_PAD = 4;

// Helvetica's widths (per 1000 of the size) of the printable ASCII letters, from its font metrics; anything else is
// measured as an "n". Bold is a little wider, which the wrapping allows for.
const W = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778,
  722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const charWidth = (c: number) => (c >= 32 && c <= 126 ? W[c - 32] : 556);

// The PDF's own encoding (WinAnsi): Latin-1, a few typographic marks, and "?" for the rest.
const WIN: Record<number, number> = { 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2026: 0x85, 0x20ac: 0x80 };
export function winAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text.normalize('NFC').replace(/₹/g, 'Rs ')) {
    const c = ch.codePointAt(0) ?? 63;
    if (c >= 32 && c <= 126) out.push(c);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else if (WIN[c]) out.push(WIN[c]);
    else if (c === 9 || c === 10) out.push(32);
    else out.push(63);
  }
  return out;
}
const widthOf = (text: string, size: number, bold: boolean) => (winAnsi(text).reduce((s, c) => s + charWidth(c), 0) * size * (bold ? 1.06 : 1)) / 1000;

// A PDF literal string, ASCII only: the three special characters escaped, the rest of WinAnsi as octal.
function literal(text: string): string {
  let s = '(';
  for (const c of winAnsi(text)) {
    if (c === 40 || c === 41 || c === 92) s += `\\${String.fromCharCode(c)}`;
    else if (c < 128) s += String.fromCharCode(c);
    else s += `\\${c.toString(8).padStart(3, '0')}`;
  }
  return `${s})`;
}

// Words wrapped to a width; a word wider than the width is cut.
export function wrap(text: string, size: number, bold: boolean, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (widthOf(next, size, bold) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      let rest = word;
      while (widthOf(rest, size, bold) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && widthOf(rest.slice(0, cut), size, bold) > width) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();

class Pages {
  pages: string[][] = [];
  y = 0;
  constructor() {
    this.page();
  }
  page() {
    this.pages.push([]);
    this.y = PAGE.h - MARGIN;
  }
  get ops() {
    return this.pages[this.pages.length - 1];
  }
  room(h: number) {
    if (this.y - h < MARGIN) this.page();
  }
  text(x: number, y: number, s: string, size: number, bold: boolean, grey = 0) {
    this.ops.push(`${grey} g BT /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${n(x)} ${n(y)} Td ${literal(s)} Tj ET`);
  }
  para(s: string, size: number, bold: boolean, gapBefore: number, grey = 0) {
    const lead = size * 1.35;
    const lines = wrap(s, size, bold, WIDTH);
    this.y -= gapBefore;
    for (const l of lines) {
      this.room(lead);
      this.y -= lead;
      this.text(MARGIN, this.y + size * 0.3, l, size, bold, grey);
    }
  }
  table(b: Extract<TextBlock, { kind: 'table' }>) {
    const size = 9;
    const lead = size * 1.3;
    const cols = b.columns.length;
    if (!cols) return;
    // Each column as wide as its widest cell, the first (the names) at least a third; narrowed in proportion to fit.
    const natural = b.columns.map((c, i) => Math.max(widthOf(c, size, true), ...b.rows.map((r) => widthOf(r[i] ?? '', size, false))) + 2 * CELL_PAD);
    natural[0] = Math.max(natural[0], WIDTH / 3);
    const sum = natural.reduce((s, v) => s + v, 0);
    const widths = sum > WIDTH ? natural.map((v) => (v * WIDTH) / sum) : natural.map((v) => v + (WIDTH - sum) / cols);
    const row = (cells: string[], bold: boolean, fill: boolean) => {
      const wrapped = cells.map((c, i) => wrap(c ?? '', size, bold, widths[i] - 2 * CELL_PAD));
      const h = Math.max(...wrapped.map((w) => w.length)) * lead + 2 * CELL_PAD;
      this.room(h);
      const top = this.y;
      if (fill) this.ops.push(`0.93 g ${n(MARGIN)} ${n(top - h)} ${n(WIDTH)} ${n(h)} re f`);
      let x = MARGIN;
      wrapped.forEach((lines, i) => {
        lines.forEach((l, j) => {
          const right = b.numeric[i] && i > 0;
          const tx = right ? x + widths[i] - CELL_PAD - widthOf(l, size, bold) : x + CELL_PAD;
          this.text(tx, top - CELL_PAD - (j + 1) * lead + size * 0.3, l, size, bold);
        });
        x += widths[i];
      });
      this.ops.push(`0.75 G 0.5 w ${n(MARGIN)} ${n(top - h)} m ${n(MARGIN + WIDTH)} ${n(top - h)} l S`);
      this.y = top - h;
    };
    this.y -= 6;
    row(b.columns, true, true);
    b.rows.forEach((r, i) => {
      const last = b.totalRow && i === b.rows.length - 1;
      // A row that starts a new page repeats the column names above it.
      const h = Math.max(...r.map((c, k) => wrap(c ?? '', size, last, widths[k] - 2 * CELL_PAD).length)) * lead + 2 * CELL_PAD;
      if (this.y - h < MARGIN) {
        this.page();
        row(b.columns, true, true);
      }
      row(r, last, false);
    });
  }
  block(b: TextBlock) {
    if (b.kind === 'title') this.para(b.text, 16, true, 0);
    else if (b.kind === 'subtitle') this.para(b.text, 12.5, true, 2);
    else if (b.kind === 'line') this.para(b.text, 10.5, !!b.strong, 3);
    else if (b.kind === 'heading') this.para(b.text, 11.5, true, 12);
    else if (b.kind === 'note') this.para(b.text, 8.5, false, 6, 0.35);
    else this.table(b);
  }
}

// One PDF: each document (a child's card) starts on a new page.
export function textPdf(documents: readonly (readonly TextBlock[])[], opts: { title?: string } = {}): Uint8Array {
  const p = new Pages();
  documents.forEach((blocks, i) => {
    if (i > 0) p.page();
    for (const b of blocks) p.block(b);
  });
  const enc = new TextEncoder();
  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1 catalog, 2 pages, 3 and 4 the fonts, 5 the information, then a page and its contents for each page.
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  objects.push(`<< /Producer (NetCyberAI) /Title ${literal(opts.title ?? '')} >>`);
  for (const ops of p.pages) {
    const content = ops.join('\n');
    const pageId = objects.length + 1;
    pageIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
    objects.push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(enc.encode(out).length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = enc.encode(out).length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return enc.encode(out);
}
