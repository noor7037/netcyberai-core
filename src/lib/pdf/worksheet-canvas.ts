'use client';

import type { ReportSchool } from '@/lib/free-tools/report';
import type { Worksheet, WorksheetItem } from '@/lib/free-tools/lesson-plan';
import { A4_300DPI, type JpegPage } from './jpeg-pdf';
import { canvasToJpeg, pdfBlob } from './browser';

// Lays a worksheet out on A4 canvases at 300 DPI and returns a PDF: the
// school's header, the title, lines for the student's name, roll number
// and date, the numbered questions with room to answer, and the answer key
// on its own page so the questions can be handed out without it. Same
// approach as report-canvas.ts: measured text in the device's own fonts,
// so Hindi and the rupee sign print correctly.

const MM = A4_300DPI.w / 210; // pixels per millimetre at 300 DPI
const MARGIN = 16 * MM;
const FONT = 'Helvetica, Arial, "Noto Sans", "Noto Sans Devanagari", sans-serif';

const INK = '#1e293b';
const MUTED = '#475569';
const LINE = '#64748b';
const RULE = '#cbd5e1';
const BRAND = '#002357';

class Sheet {
  pages: HTMLCanvasElement[] = [];
  ctx!: CanvasRenderingContext2D;
  y = 0;
  readonly width = A4_300DPI.w - 2 * MARGIN;
  readonly bottom = A4_300DPI.h - MARGIN - 6 * MM;
  running = '';

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
    if (this.running) {
      this.font(9, false);
      this.ctx.fillStyle = MUTED;
      this.ctx.fillText(this.running, MARGIN, this.y);
      this.y += 8 * MM;
    }
  }

  font(pt: number, bold: boolean) {
    this.ctx.font = `${bold ? '700' : '400'} ${Math.round((pt / 72) * 300)}px ${FONT}`;
  }

  lineHeight(pt: number) {
    return (pt / 72) * 300 * 1.4;
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

  // A writing line from x, w wide, with its foot at the current y.
  writeLine(x: number, w: number) {
    this.ctx.fillStyle = LINE;
    this.ctx.fillRect(x, this.y, w, 0.25 * MM);
  }

  rule() {
    this.ctx.fillStyle = RULE;
    this.ctx.fillRect(MARGIN, this.y, this.width, 0.3 * MM);
    this.y += 0.3 * MM;
  }

  footers() {
    this.pages.forEach((c, i) => {
      const ctx = c.getContext('2d') as CanvasRenderingContext2D;
      ctx.font = `400 ${Math.round((7.5 / 72) * 300)}px ${FONT}`;
      ctx.fillStyle = MUTED;
      ctx.textBaseline = 'alphabetic';
      const pageText = `Page ${i + 1} of ${this.pages.length}`;
      ctx.fillText(pageText, A4_300DPI.w - MARGIN - ctx.measureText(pageText).width, A4_300DPI.h - MARGIN + 2 * MM);
    });
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}

// The saved school's logo, name and lines, as on the reports.
async function drawSchool(s: Sheet, school: ReportSchool, compact: boolean) {
  const top = s.y;
  const logoH = (compact ? 10 : 16) * MM;
  let indent = 0;
  if (school.logo && school.logoAspect) {
    try {
      const img = await loadImage(school.logo);
      const w = Math.min(logoH * school.logoAspect, 40 * MM);
      s.ctx.drawImage(img, MARGIN, top, w, w / school.logoAspect);
      indent = w + 4 * MM;
    } catch {
      // A logo that will not load is left out; the name still prints.
    }
  }
  const at = { x: MARGIN + indent, width: s.width - indent };
  s.text(school.name, compact ? 11 : 13, { ...at, bold: true, gapAfter: 0.8 * MM });
  if (!compact) for (const l of school.lines) s.text(l, 8.5, { ...at, color: MUTED, gapAfter: 0.3 * MM });
  s.y = Math.max(s.y, top + (indent ? logoH : 0)) + 3 * MM;
}

function drawHeading(s: Sheet, title: string, subtitle: string) {
  s.text(title, 16, { bold: true, color: BRAND, gapAfter: 1 * MM });
  if (subtitle) s.text(subtitle, 10, { color: MUTED, gapAfter: 3 * MM });
  s.rule();
  s.y += 5 * MM;
}

// Name, roll number and date, each with a line to write on.
function drawStudentLines(s: Sheet) {
  s.font(10.5, false);
  const gap = 5 * MM;
  const fields: [string, number][] = [
    ['Name', 0.5],
    ['Roll No.', 0.22],
    ['Date', 0.28],
  ];
  let x = MARGIN;
  const base = s.y + s.lineHeight(10.5);
  for (const [label, share] of fields) {
    const w = s.width * share - gap;
    s.ctx.fillStyle = INK;
    s.ctx.fillText(`${label}:`, x, s.y);
    const lw = s.ctx.measureText(`${label}: `).width;
    const y = s.y;
    s.y = base - 1 * MM;
    s.writeLine(x + lw, w - lw);
    s.y = y;
    x += w + gap;
  }
  s.y = base + 7 * MM;
}

const QUESTION_PT = 11;
const OPTION_PT = 10.5;
const NUM_W = 9 * MM;
const ANSWER_ROW = 9 * MM;

function itemHeight(s: Sheet, it: WorksheetItem): number {
  const w = s.width - NUM_W;
  s.font(QUESTION_PT, false);
  let h = s.wrap(it.text, w).length * s.lineHeight(QUESTION_PT);
  if (it.type === 'mcq') {
    s.font(OPTION_PT, false);
    for (const o of it.options) h += s.wrap(`(${o.label})  ${o.text}`, w - 6 * MM).length * s.lineHeight(OPTION_PT);
  } else if (it.type === 'truefalse') h += s.lineHeight(OPTION_PT) + 1 * MM;
  else if (it.type === 'short') h += 2 * ANSWER_ROW;
  return h + 6 * MM;
}

function drawItem(s: Sheet, it: WorksheetItem) {
  s.ensure(itemHeight(s, it));
  const x = MARGIN + NUM_W;
  const w = s.width - NUM_W;
  s.font(QUESTION_PT, true);
  s.ctx.fillStyle = INK;
  s.ctx.fillText(`${it.no}.`, MARGIN, s.y);
  s.text(it.text, QUESTION_PT, { x, width: w });
  if (it.type === 'mcq') {
    s.y += 1 * MM;
    for (const o of it.options) s.text(`(${o.label})  ${o.text}`, OPTION_PT, { x: x + 3 * MM, width: w - 6 * MM });
  } else if (it.type === 'truefalse') {
    s.y += 1 * MM;
    s.text('True  /  False      (circle one)', OPTION_PT, { x: x + 3 * MM, width: w - 6 * MM, color: MUTED });
  } else if (it.type === 'short') {
    for (let i = 0; i < 2; i++) {
      s.y += ANSWER_ROW;
      s.writeLine(x, w);
    }
  }
  s.y += 6 * MM;
}

export async function worksheetPdf(ws: Worksheet, school?: ReportSchool): Promise<Blob> {
  const s = new Sheet();
  s.newPage();
  s.ctx.fillStyle = BRAND;
  s.ctx.fillRect(MARGIN, s.y, s.width, 1.2 * MM);
  s.y += 5 * MM;
  if (school) await drawSchool(s, school, false);
  drawHeading(s, ws.title, ws.subtitle);
  drawStudentLines(s);
  s.running = `${ws.title} (continued)`;
  for (const it of ws.items) drawItem(s, it);

  // The answer key always starts a page of its own.
  s.running = '';
  s.newPage();
  s.running = `Answer key: ${ws.title} (continued)`;
  if (school) await drawSchool(s, school, true);
  drawHeading(s, 'Answer key', [ws.title, ws.subtitle].filter(Boolean).join(' · '));
  for (const it of ws.items) {
    s.font(QUESTION_PT, true);
    s.ensure(s.lineHeight(QUESTION_PT));
    s.ctx.fillStyle = INK;
    s.ctx.fillText(`${it.no}.`, MARGIN, s.y);
    s.text(it.answer, QUESTION_PT, { x: MARGIN + NUM_W, width: s.width - NUM_W, gapAfter: 2.5 * MM });
  }
  s.footers();

  const pages: JpegPage[] = [];
  for (const c of s.pages) {
    pages.push(await canvasToJpeg(c, 0.9));
    c.width = c.height = 0; // release the page's memory
  }
  return pdfBlob(pages, ws.title);
}
