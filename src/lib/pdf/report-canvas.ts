'use client';

import type { ReportTone, ToolReport } from '@/lib/free-tools/report';
import { A4_300DPI } from './jpeg-pdf';
import { canvasToJpeg, pdfBlob } from './browser';

// Lays a ToolReport out on A4 canvases at 300 DPI and returns a PDF. All
// layout is done here with measured text, so the PDF looks the same in
// every browser and supports the rupee sign and Hindi text through the
// device's own fonts (the standard PDF fonts cannot).

const MM = A4_300DPI.w / 210; // pixels per millimetre at 300 DPI
const MARGIN = 16 * MM;
const FONT = 'Helvetica, Arial, "Noto Sans", "Noto Sans Devanagari", sans-serif';

const INK = '#1e293b';
const MUTED = '#475569';
const RULE = '#cbd5e1';
const BRAND = '#002357';
const TONE: Record<ReportTone, string> = { good: '#047857', warn: '#92400e', bad: '#991b1b', neutral: INK };
const TONE_BG: Record<ReportTone, string> = { good: '#ecfdf5', warn: '#fffbeb', bad: '#fef2f2', neutral: '#f8fafc' };

interface Meta {
  generatedOn: string;
  sourceLine: string;
  rulesUpdated: string;
}

class Pager {
  pages: HTMLCanvasElement[] = [];
  ctx!: CanvasRenderingContext2D;
  y = 0;
  readonly width = A4_300DPI.w - 2 * MARGIN;
  readonly bottom = A4_300DPI.h - MARGIN - 8 * MM;

  constructor(private meta: Meta, private title: string) {
    this.newPage();
  }

  newPage() {
    const c = document.createElement('canvas');
    c.width = A4_300DPI.w;
    c.height = A4_300DPI.h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Your browser could not create a drawing surface.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.textBaseline = 'top';
    this.pages.push(c);
    this.ctx = ctx;
    this.y = MARGIN;
    if (this.pages.length > 1) {
      this.font(9, false);
      this.ctx.fillStyle = MUTED;
      this.ctx.fillText(`${this.title} (continued)`, MARGIN, this.y);
      this.y += 8 * MM;
    }
  }

  font(pt: number, bold: boolean) {
    this.ctx.font = `${bold ? '700' : '400'} ${Math.round((pt / 72) * 300)}px ${FONT}`;
  }

  lineHeight(pt: number) {
    return (pt / 72) * 300 * 1.35;
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

  text(text: string, pt: number, opts: { bold?: boolean; color?: string; x?: number; width?: number; gapAfter?: number } = {}) {
    this.font(pt, Boolean(opts.bold));
    const lh = this.lineHeight(pt);
    for (const line of this.wrap(text, opts.width ?? this.width)) {
      this.ensure(lh);
      this.ctx.fillStyle = opts.color ?? INK;
      this.ctx.fillText(line, opts.x ?? MARGIN, this.y);
      this.y += lh;
    }
    this.y += opts.gapAfter ?? 0;
  }

  rule(color = RULE, weight = 0.3 * MM) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(MARGIN, this.y, this.width, weight);
    this.y += weight;
  }

  footers() {
    this.pages.forEach((c, i) => {
      const ctx = c.getContext('2d')!;
      ctx.font = `400 ${Math.round((7.5 / 72) * 300)}px ${FONT}`;
      ctx.fillStyle = MUTED;
      ctx.textBaseline = 'alphabetic';
      const y = A4_300DPI.h - MARGIN + 2 * MM;
      ctx.fillText(this.meta.sourceLine, MARGIN, y);
      const pageText = `Page ${i + 1} of ${this.pages.length}`;
      ctx.fillText(pageText, A4_300DPI.w - MARGIN - ctx.measureText(pageText).width, y);
    });
  }
}

function drawStats(p: Pager, items: { label: string; value: string; tone?: ReportTone; note?: string }[]) {
  const cols = 3;
  const gap = 4 * MM;
  const w = (p.width - gap * (cols - 1)) / cols;
  for (let i = 0; i < items.length; i += cols) {
    const row = items.slice(i, i + cols);
    // Measure the tallest card in the row first so the row is even.
    const heights = row.map((it) => {
      p.font(8.5, false);
      const labelLines = p.wrap(it.label, w - 6 * MM).length;
      p.font(15, true);
      const valueLines = p.wrap(it.value, w - 6 * MM).length;
      p.font(7.5, false);
      const noteLines = it.note ? p.wrap(it.note, w - 6 * MM).length : 0;
      return 6 * MM + labelLines * p.lineHeight(8.5) + valueLines * p.lineHeight(15) + noteLines * p.lineHeight(7.5);
    });
    const h = Math.max(...heights);
    p.ensure(h + gap);
    const top = p.y;
    row.forEach((it, j) => {
      const x = MARGIN + j * (w + gap);
      const tone = it.tone ?? 'neutral';
      p.ctx.fillStyle = TONE_BG[tone];
      p.ctx.fillRect(x, top, w, h);
      p.ctx.fillStyle = TONE[tone];
      p.ctx.fillRect(x, top, 1 * MM, h);
      p.y = top + 3 * MM;
      p.text(it.label, 8.5, { color: MUTED, x: x + 3.5 * MM, width: w - 6 * MM });
      p.text(it.value, 15, { bold: true, color: TONE[tone], x: x + 3.5 * MM, width: w - 6 * MM });
      if (it.note) p.text(it.note, 7.5, { color: MUTED, x: x + 3.5 * MM, width: w - 6 * MM });
    });
    p.y = top + h + gap;
  }
}

function drawTable(p: Pager, columns: string[], rows: string[][], numeric: boolean[] = [], rowTones: (ReportTone | undefined)[] = []) {
  const pt = columns.length > 7 ? 7 : 8.5;
  const pad = 1.6 * MM;
  // Column widths from the widest content, capped, then scaled to fit.
  p.font(pt, true);
  const natural = columns.map((c, ci) => {
    let w = p.ctx.measureText(c).width;
    p.font(pt, false);
    for (const r of rows) w = Math.max(w, p.ctx.measureText(r[ci] ?? '').width);
    p.font(pt, true);
    return Math.min(w, p.width * 0.45) + 2 * pad;
  });
  const sum = natural.reduce((a, b) => a + b, 0);
  const widths = natural.map((w) => (w / sum) * p.width);
  const lh = p.lineHeight(pt);

  const drawRow = (cells: string[], bold: boolean, fill?: string, color?: string) => {
    p.font(pt, bold);
    const wrapped = cells.map((c, ci) => p.wrap(c ?? '', widths[ci] - 2 * pad));
    const h = Math.max(...wrapped.map((l) => l.length)) * lh + 2 * pad;
    if (p.y + h > p.bottom) {
      p.newPage();
      if (!bold) drawRow(columns, true, '#e2e8f0');
      p.font(pt, bold);
    }
    const top = p.y;
    if (fill) {
      p.ctx.fillStyle = fill;
      p.ctx.fillRect(MARGIN, top, p.width, h);
    }
    let x = MARGIN;
    wrapped.forEach((lines, ci) => {
      lines.forEach((line, li) => {
        p.ctx.fillStyle = color ?? INK;
        const tw = p.ctx.measureText(line).width;
        const tx = numeric[ci] ? x + widths[ci] - pad - tw : x + pad;
        p.ctx.fillText(line, tx, top + pad + li * lh);
      });
      x += widths[ci];
    });
    p.y = top + h;
    p.ctx.fillStyle = RULE;
    p.ctx.fillRect(MARGIN, p.y, p.width, 0.2 * MM);
  };

  drawRow(columns, true, '#e2e8f0');
  rows.forEach((r, i) => {
    const tone = rowTones[i];
    drawRow(r, false, tone && tone !== 'neutral' ? TONE_BG[tone] : i % 2 ? '#f8fafc' : undefined, tone ? TONE[tone] : undefined);
  });
  p.y += 4 * MM;
}

export async function reportPdf(report: ToolReport, meta: Meta): Promise<Blob> {
  const p = new Pager(meta, report.title);
  // Header band.
  p.ctx.fillStyle = BRAND;
  p.ctx.fillRect(MARGIN, p.y, p.width, 1.2 * MM);
  p.y += 5 * MM;
  p.text(report.title, 18, { bold: true, color: BRAND, gapAfter: 1 * MM });
  if (report.subtitle) p.text(report.subtitle, 10, { color: MUTED, gapAfter: 1 * MM });
  p.text(`Prepared on ${meta.generatedOn} · Rules last updated ${meta.rulesUpdated}`, 8, { color: MUTED, gapAfter: 3 * MM });
  p.rule();
  p.y += 4 * MM;

  for (const s of report.sections) {
    if (s.kind !== 'stats' || s.heading) {
      p.ensure(p.lineHeight(11) * 3);
      if (s.heading) p.text(s.heading, 11, { bold: true, color: BRAND, gapAfter: 1.5 * MM });
    }
    if (s.kind === 'stats') drawStats(p, s.items);
    else if (s.kind === 'table') drawTable(p, s.columns, s.rows, s.numeric, s.rowTones);
    else if (s.kind === 'notes') {
      for (const it of s.items) p.text(`•  ${it}`, 9, { color: s.tone ? TONE[s.tone] : INK, gapAfter: 0.8 * MM });
      p.y += 3 * MM;
    } else p.text(s.text, 9.5, { gapAfter: 3 * MM });
  }

  p.ensure(p.lineHeight(10) * 4);
  p.rule();
  p.y += 3 * MM;
  p.text('Assumptions', 10, { bold: true, color: BRAND, gapAfter: 1 * MM });
  for (const a of report.assumptions) p.text(`•  ${a}`, 8, { color: MUTED, gapAfter: 0.5 * MM });
  p.y += 2 * MM;
  p.text(report.disclaimer, 8, { color: MUTED });
  p.footers();

  const pages = [];
  for (const c of p.pages) pages.push(await canvasToJpeg(c, 0.9));
  return pdfBlob(pages, report.title);
}
