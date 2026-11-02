// The server's text PDF for cards that hold more than Latin-1 (W17-B5). text-pdf.ts draws with the PDF's own Helvetica,
// so a Hindi name, subject or remark prints as "?". Devanagari cannot be fixed by embedding a font in that hand-written
// writer: matras and conjuncts are placed by the font's OpenType GSUB/GPOS rules, which need a text shaper. pdfkit's
// fontkit engine is that shaper, so a card with any character outside WinAnsi is drawn here with Noto Sans Devanagari
// (OFL, public/fonts; it also holds the Latin letters, so one face serves every run). A card of Latin text keeps the
// small writer; nothing else in the app uses this file. Same TextBlock kinds, A4, margins, column widths and wrapping.

import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { winAnsi, type TextBlock } from './text-pdf';

const PAGE = { w: 595.28, h: 841.89 };
const MARGIN = 48;
const WIDTH = PAGE.w - 2 * MARGIN;
const CELL_PAD = 4;

// True when any string of the documents has a character the PDF's own encoding would turn into "?". The rupee sign is
// not one: text-pdf writes it as "Rs" and this writer prints the sign itself, both are right.
export function needsUnicode(documents: readonly (readonly TextBlock[])[]): boolean {
  const lossy = (s: string) => {
    for (const ch of s.normalize('NFC').replace(/₹/g, 'Rs ')) if (ch !== '?' && winAnsi(ch)[0] === 63) return true;
    return false;
  };
  return documents.some((blocks) =>
    blocks.some((b) => (b.kind === 'table' ? b.columns.some(lossy) || b.rows.some((r) => r.some((c) => lossy(c ?? ''))) : lossy(b.text)))
  );
}

// The faces are static TTFs in the repository (notofonts/devanagari release, OFL 1.1, public/fonts/OFL-NotoSansDevanagari.txt)
// and are traced into the API routes by next.config.js (outputFileTracingIncludes). A missing file throws, so the job
// is retried rather than a card with "?" being stored.
let faces: { regular: Buffer; bold: Buffer } | null = null;
function loadFaces() {
  if (!faces) {
    const dir = path.join(process.cwd(), 'public', 'fonts');
    faces = { regular: fs.readFileSync(path.join(dir, 'NotoSansDevanagari-Regular.ttf')), bold: fs.readFileSync(path.join(dir, 'NotoSansDevanagari-Bold.ttf')) };
  }
  return faces;
}

// A word cut at a width must not split a letter from its matras or a conjunct: cut by grapheme cluster.
const graphemes = (s: string): string[] => {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter;
  return Seg ? Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment) : Array.from(s);
};

type Doc = InstanceType<typeof PDFDocument>;

class Layout {
  y = MARGIN;
  constructor(private doc: Doc) {}
  private face(bold: boolean) {
    return bold ? 'Noto-Bold' : 'Noto';
  }
  width(text: string, size: number, bold: boolean) {
    return this.doc.font(this.face(bold)).fontSize(size).widthOfString(text);
  }
  wrap(text: string, size: number, bold: boolean, width: number): string[] {
    const lines: string[] = [];
    for (const para of text.replace(/\t/g, ' ').split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (this.width(next, size, bold) <= width) {
          line = next;
          continue;
        }
        if (line) lines.push(line);
        let rest = graphemes(word);
        while (rest.length > 1 && this.width(rest.join(''), size, bold) > width) {
          let cut = rest.length - 1;
          while (cut > 1 && this.width(rest.slice(0, cut).join(''), size, bold) > width) cut--;
          lines.push(rest.slice(0, cut).join(''));
          rest = rest.slice(cut);
        }
        line = rest.join('');
      }
      lines.push(line);
    }
    return lines;
  }
  page() {
    this.doc.addPage();
    this.y = MARGIN;
  }
  room(h: number) {
    if (this.y + h > PAGE.h - MARGIN) this.page();
  }
  // y is the top of the line box.
  text(x: number, y: number, s: string, size: number, bold: boolean, grey = 0) {
    this.doc.fillColor([grey * 255, grey * 255, grey * 255]).font(this.face(bold)).fontSize(size).text(s, x, y, { lineBreak: false });
  }
  para(s: string, size: number, bold: boolean, gapBefore: number, grey = 0) {
    const lead = size * 1.5;
    this.y += gapBefore;
    for (const l of this.wrap(s, size, bold, WIDTH)) {
      this.room(lead);
      this.text(MARGIN, this.y + (lead - size) / 2, l, size, bold, grey);
      this.y += lead;
    }
  }
  table(b: Extract<TextBlock, { kind: 'table' }>) {
    const size = 9;
    const lead = size * 1.5;
    const cols = b.columns.length;
    if (!cols) return;
    // As text-pdf: each column as wide as its widest cell, the first at least a third; narrowed in proportion to fit.
    const natural = b.columns.map((c, i) => Math.max(this.width(c, size, true), ...b.rows.map((r) => this.width(r[i] ?? '', size, false))) + 2 * CELL_PAD);
    natural[0] = Math.max(natural[0], WIDTH / 3);
    const sum = natural.reduce((s, v) => s + v, 0);
    const widths = sum > WIDTH ? natural.map((v) => (v * WIDTH) / sum) : natural.map((v) => v + (WIDTH - sum) / cols);
    const rowHeight = (cells: string[], bold: boolean) => Math.max(...cells.map((c, i) => this.wrap(c ?? '', size, bold, widths[i] - 2 * CELL_PAD).length)) * lead + 2 * CELL_PAD;
    const row = (cells: string[], bold: boolean, fill: boolean) => {
      const wrapped = cells.map((c, i) => this.wrap(c ?? '', size, bold, widths[i] - 2 * CELL_PAD));
      const h = rowHeight(cells, bold);
      this.room(h);
      const top = this.y;
      if (fill) this.doc.save().rect(MARGIN, top, WIDTH, h).fill([237, 237, 237]).restore();
      let x = MARGIN;
      wrapped.forEach((lines, i) => {
        lines.forEach((l, j) => {
          const right = b.numeric[i] && i > 0;
          const tx = right ? x + widths[i] - CELL_PAD - this.width(l, size, bold) : x + CELL_PAD;
          this.text(tx, top + CELL_PAD + j * lead + (lead - size) / 2, l, size, bold);
        });
        x += widths[i];
      });
      this.doc.save().lineWidth(0.5).strokeColor([191, 191, 191]).moveTo(MARGIN, top + h).lineTo(MARGIN + WIDTH, top + h).stroke().restore();
      this.y = top + h;
    };
    this.y += 6;
    row(b.columns, true, true);
    b.rows.forEach((r, i) => {
      const last = b.totalRow && i === b.rows.length - 1;
      // A row that starts a new page repeats the column names above it.
      if (this.y + rowHeight(r, last) > PAGE.h - MARGIN) {
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
export async function unicodePdf(documents: readonly (readonly TextBlock[])[], opts: { title?: string } = {}): Promise<Uint8Array> {
  const f = loadFaces();
  // `font` is given as the file's bytes so pdfkit does not load its default Helvetica from node_modules/pdfkit/js/data.
  const doc = new PDFDocument({ size: [PAGE.w, PAGE.h], margin: 0, autoFirstPage: false, font: f.regular as unknown as string, info: { Title: opts.title ?? '', Producer: 'NetCyberAI' } });
  doc.registerFont('Noto', f.regular);
  doc.registerFont('Noto-Bold', f.bold);
  const chunks: Buffer[] = [];
  const done = new Promise<Uint8Array>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on('error', reject);
  });
  const lay = new Layout(doc);
  doc.addPage();
  documents.forEach((blocks, i) => {
    if (i > 0) lay.page();
    for (const b of blocks) lay.block(b);
  });
  doc.end();
  return done;
}
