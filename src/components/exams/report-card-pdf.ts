'use client';

import { canvasToJpeg, pdfBlob } from '@/lib/pdf/browser';
import type { JpegPage } from '@/lib/pdf/jpeg-pdf';
import type { CardBlock } from '@/lib/exams/report-card-text';

// Draws report cards (docs/27 row 9c, C215) on A4 canvases in the browser and makes one PDF with src/lib/pdf, as
// every PDF of the app is made: no server, no upload, and Hindi and the rupee sign through the device's own fonts.
// Each card starts on a new page. The words are the card's blocks (src/lib/exams/report-card-text.ts), the same the
// screen shows. 200 dots an inch keeps a whole class's PDF small enough to send on.

const DPI = 200;
const W = Math.round((210 / 25.4) * DPI);
const H = Math.round((297 / 25.4) * DPI);
const MM = W / 210;
const MARGIN = 15 * MM;
const FONT = 'Helvetica, Arial, "Noto Sans", "Noto Sans Devanagari", sans-serif';
const INK = '#1e293b';
const MUTED = '#475569';
const RULE = '#cbd5e1';
const BRAND = '#002357';
const SHADE = '#f1f5f9';

class Pager {
  pages: HTMLCanvasElement[] = [];
  ctx!: CanvasRenderingContext2D;
  y = 0;
  readonly width = W - 2 * MARGIN;
  readonly bottom = H - MARGIN;

  constructor(private footer: string) {}

  newPage() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'top';
    this.pages.push(c);
    this.ctx = ctx;
    this.y = MARGIN;
  }

  font(pt: number, bold: boolean) {
    this.ctx.font = `${bold ? '700' : '400'} ${Math.round((pt / 72) * DPI)}px ${FONT}`;
  }
  lineHeight(pt: number) {
    return (pt / 72) * DPI * 1.35;
  }
  ensure(h: number) {
    if (this.y + h > this.bottom) this.newPage();
  }
  wrap(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (this.ctx.measureText(next).width <= maxWidth || !line) line = next;
        else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  }
  text(text: string, pt: number, opts: { bold?: boolean; color?: string; gapAfter?: number } = {}) {
    this.font(pt, Boolean(opts.bold));
    const lh = this.lineHeight(pt);
    for (const line of this.wrap(text, this.width)) {
      this.ensure(lh);
      this.ctx.fillStyle = opts.color ?? INK;
      this.ctx.fillText(line, MARGIN, this.y);
      this.y += lh;
    }
    this.y += opts.gapAfter ?? 0;
  }
  table(b: Extract<CardBlock, { kind: 'table' }>) {
    const pt = b.columns.length > 6 ? 8 : 9.5;
    const pad = 1.6 * MM;
    this.font(pt, true);
    const natural = b.columns.map((c, ci) => {
      let w = this.ctx.measureText(c).width;
      this.font(pt, false);
      for (const r of b.rows) w = Math.max(w, this.ctx.measureText(r[ci] ?? '').width);
      this.font(pt, true);
      return Math.min(w, this.width * 0.4) + 2 * pad;
    });
    const sum = natural.reduce((a, x) => a + x, 0);
    const widths = natural.map((w) => (w / sum) * this.width);
    const lh = this.lineHeight(pt);
    const row = (cells: string[], bold: boolean, fill?: string) => {
      this.font(pt, bold);
      const wrapped = cells.map((c, ci) => this.wrap(c ?? '', widths[ci] - 2 * pad));
      const h = Math.max(...wrapped.map((l) => l.length)) * lh + 2 * pad;
      this.ensure(h);
      const top = this.y;
      if (fill) {
        this.ctx.fillStyle = fill;
        this.ctx.fillRect(MARGIN, top, this.width, h);
      }
      let x = MARGIN;
      wrapped.forEach((lines, ci) => {
        lines.forEach((line, li) => {
          this.ctx.fillStyle = INK;
          const tw = this.ctx.measureText(line).width;
          this.ctx.fillText(line, b.numeric[ci] ? x + widths[ci] - pad - tw : x + pad, top + pad + li * lh);
        });
        x += widths[ci];
      });
      this.y = top + h;
      this.ctx.fillStyle = RULE;
      this.ctx.fillRect(MARGIN, this.y, this.width, 0.25 * MM);
    };
    row(b.columns, true, '#e2e8f0');
    b.rows.forEach((r, i) => row(r, b.totalRow && i === b.rows.length - 1, b.totalRow && i === b.rows.length - 1 ? SHADE : undefined));
    this.y += 4 * MM;
  }
  footers() {
    this.pages.forEach((c, i) => {
      const ctx = c.getContext('2d')!;
      ctx.font = `400 ${Math.round((7.5 / 72) * DPI)}px ${FONT}`;
      ctx.fillStyle = MUTED;
      ctx.textBaseline = 'alphabetic';
      const y = H - MARGIN / 2;
      ctx.fillText(this.footer, MARGIN, y);
      const n = `${i + 1} / ${this.pages.length}`;
      ctx.fillText(n, W - MARGIN - ctx.measureText(n).width, y);
    });
  }
}

function drawCard(p: Pager, blocks: readonly CardBlock[]) {
  p.newPage();
  p.ctx.fillStyle = BRAND;
  p.ctx.fillRect(MARGIN, p.y, p.width, 1.2 * MM);
  p.y += 4 * MM;
  for (const b of blocks) {
    if (b.kind === 'title') p.text(b.text, 17, { bold: true, color: BRAND, gapAfter: 1 * MM });
    else if (b.kind === 'subtitle') p.text(b.text, 12, { bold: true, gapAfter: 1.5 * MM });
    else if (b.kind === 'heading') {
      p.y += 2 * MM;
      p.text(b.text, 10.5, { bold: true, color: BRAND, gapAfter: 1 * MM });
    } else if (b.kind === 'line') p.text(b.text, 10, { bold: b.strong, gapAfter: 1 * MM });
    else if (b.kind === 'note') p.text(b.text, 8, { color: MUTED, gapAfter: 0.6 * MM });
    else {
      p.y += 2 * MM;
      p.table(b);
    }
  }
}

// One PDF of one or more cards, each a list of blocks.
export async function reportCardsPdf(cards: readonly (readonly CardBlock[])[], title: string, footer: string): Promise<Blob> {
  const p = new Pager(footer);
  for (const blocks of cards) drawCard(p, blocks);
  p.footers();
  const pages: JpegPage[] = [];
  for (const c of p.pages) pages.push(await canvasToJpeg(c, 0.85));
  return pdfBlob(pages, title);
}
