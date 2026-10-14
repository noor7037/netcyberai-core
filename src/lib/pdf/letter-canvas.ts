'use client';

import type { ReportSchool } from '@/lib/free-tools/report';
import { LETTER_TITLE, type CorrectionLetter } from '@/lib/free-tools/student-data-check';
import { A4_300DPI } from './jpeg-pdf';
import { canvasToJpeg, pdfBlob } from './browser';

// The Student Data Check's correction letters as one PDF: one A4 page per
// letter at 300 DPI, drawn with measured text on a canvas (as
// report-canvas.ts does), so names in any script and the school's logo
// come out the same in every browser. Laid out from the same
// CorrectionLetter object the printed letter uses
// (src/components/free-tools/StudentDataCheckLetter.tsx).

const MM = A4_300DPI.w / 210;
const MARGIN = 18 * MM;
const FONT = 'Helvetica, Arial, "Noto Sans", "Noto Sans Devanagari", sans-serif';
const INK = '#1e293b';
const MUTED = '#475569';
const RULE = '#94a3b8';
const BRAND = '#002357';

export interface LetterMeta {
  school?: ReportSchool;
  dateLine: string;
  signOff: string[];
}

class Sheet {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  y = MARGIN;
  readonly width = A4_300DPI.w - 2 * MARGIN;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = A4_300DPI.w;
    this.canvas.height = A4_300DPI.h;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not create a drawing surface.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.textBaseline = 'top';
    this.ctx = ctx;
  }

  font(pt: number, bold = false) {
    this.ctx.font = `${bold ? '700' : '400'} ${Math.round((pt / 72) * 300)}px ${FONT}`;
  }

  lh(pt: number) {
    return (pt / 72) * 300 * 1.4;
  }

  wrap(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (this.ctx.measureText(next).width <= maxWidth || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
    return lines;
  }

  text(text: string, pt: number, o: { bold?: boolean; color?: string; x?: number; width?: number; gap?: number } = {}) {
    this.font(pt, o.bold);
    this.ctx.fillStyle = o.color ?? INK;
    for (const line of this.wrap(text, o.width ?? this.width)) {
      this.ctx.fillText(line, o.x ?? MARGIN, this.y);
      this.y += this.lh(pt);
    }
    this.y += o.gap ?? 0;
  }

  box(x: number, y: number) {
    this.ctx.strokeStyle = INK;
    this.ctx.lineWidth = 0.35 * MM;
    this.ctx.strokeRect(x, y, 4 * MM, 4 * MM);
  }

  line(x: number, y: number, w: number, color = RULE) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, 0.3 * MM);
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    // A logo that will not load is left out; the school's name still prints.
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawLetterhead(p: Sheet, school: ReportSchool, logo: HTMLImageElement | null) {
  const top = p.y;
  const logoH = 18 * MM;
  let indent = 0;
  if (logo && school.logoAspect) {
    const w = Math.min(logoH * school.logoAspect, 45 * MM);
    p.ctx.drawImage(logo, MARGIN, top, w, w / school.logoAspect);
    indent = w + 5 * MM;
  }
  const at = { x: MARGIN + indent, width: p.width - indent };
  p.text(school.name, 15, { ...at, bold: true, color: BRAND, gap: 0.8 * MM });
  for (const l of school.lines) p.text(l, 8.5, { ...at, color: MUTED, gap: 0.2 * MM });
  p.y = Math.max(p.y, top + (indent ? logoH : 0)) + 3 * MM;
  p.line(MARGIN, p.y, p.width, BRAND);
  p.y += 6 * MM;
}

function drawField(p: Sheet, f: CorrectionLetter['fields'][number], choices: string[]) {
  const top = p.y;
  const pad = 4 * MM;
  const inner = p.width - 2 * pad;
  const half = (inner - 6 * MM) / 2;
  p.y += pad;
  p.text(f.label, 11.5, { bold: true, x: MARGIN + pad, gap: 1.5 * MM });
  const row = p.y;
  p.text('In the school record', 8.5, { color: MUTED, x: MARGIN + pad, width: half });
  p.text(f.school, 11.5, { bold: true, x: MARGIN + pad, width: half });
  const leftEnd = p.y;
  p.y = row;
  p.text('On Aadhaar', 8.5, { color: MUTED, x: MARGIN + pad + half + 6 * MM, width: half });
  p.text(f.aadhaar, 11.5, { bold: true, x: MARGIN + pad + half + 6 * MM, width: half });
  p.y = Math.max(p.y, leftEnd) + 3 * MM;

  // The first two choices side by side, the third on its own line with
  // room to write the correct details.
  p.font(10);
  p.ctx.fillStyle = INK;
  let x = MARGIN + pad;
  for (const c of choices.slice(0, 2)) {
    p.box(x, p.y);
    p.ctx.fillText(c, x + 6 * MM, p.y);
    x += half + 6 * MM;
  }
  p.y += 7 * MM;
  const last = choices[2];
  p.box(MARGIN + pad, p.y);
  p.ctx.fillText(last, MARGIN + pad + 6 * MM, p.y);
  const after = MARGIN + pad + 6 * MM + p.ctx.measureText(last).width + 3 * MM;
  p.line(after, p.y + 4 * MM, MARGIN + pad + inner - after);
  p.y += 9 * MM;
  p.line(MARGIN + pad, p.y, inner);
  p.y += pad;

  p.ctx.strokeStyle = RULE;
  p.ctx.lineWidth = 0.3 * MM;
  p.ctx.strokeRect(MARGIN, top, p.width, p.y - top);
  p.y += 4 * MM;
}

function drawLetter(letter: CorrectionLetter, meta: LetterMeta, logo: HTMLImageElement | null): HTMLCanvasElement {
  const p = new Sheet();
  if (meta.school) drawLetterhead(p, meta.school, logo);
  p.font(10);
  p.ctx.fillStyle = INK;
  p.ctx.fillText(meta.dateLine, MARGIN + p.width - p.ctx.measureText(meta.dateLine).width, p.y);
  p.y += p.lh(10) + 4 * MM;

  p.text(LETTER_TITLE, 15, { bold: true, color: BRAND, gap: 2 * MM });
  const who = [`Student: ${letter.student}`, letter.className && `Class ${letter.className}`, letter.admissionNo && `Admission No. ${letter.admissionNo}`].filter(Boolean).join('   ·   ');
  p.text(who, 10.5, { bold: true, gap: 4 * MM });
  p.text(letter.salutation, 10.5, { gap: 2 * MM });
  for (const para of letter.paragraphs) p.text(para, 10.5, { gap: 2.5 * MM });
  p.y += 2 * MM;
  for (const f of letter.fields) drawField(p, f, letter.choices);
  for (const c of letter.closing) p.text(c, 10.5, { gap: 2 * MM });

  p.y += 3 * MM;
  p.text('Yours sincerely,', 10.5, { gap: 10 * MM });
  for (const l of meta.signOff) p.text(l, 10.5, { bold: l === meta.signOff[0] });

  // The family's signature lines, at the foot of the page.
  const cols = letter.signLines.length;
  const gap = 8 * MM;
  const w = (p.width - gap * (cols - 1)) / cols;
  const y = Math.max(p.y + 16 * MM, A4_300DPI.h - MARGIN - 14 * MM);
  letter.signLines.forEach((l, i) => {
    const x = MARGIN + i * (w + gap);
    p.line(x, y, w, INK);
    p.font(9);
    p.ctx.fillStyle = MUTED;
    p.ctx.fillText(l, x, y + 2 * MM);
  });
  return p.canvas;
}

export async function lettersPdf(letters: CorrectionLetter[], meta: LetterMeta): Promise<Blob> {
  if (letters.length === 0) throw new Error('There are no letters to make.');
  const logo = meta.school?.logo ? await loadImage(meta.school.logo) : null;
  const pages = [];
  for (const l of letters) {
    const c = drawLetter(l, meta, logo);
    pages.push(await canvasToJpeg(c, 0.8));
    // Free each page's pixels as soon as its JPEG exists.
    c.width = 0;
    c.height = 0;
  }
  return pdfBlob(pages, 'Correction letters');
}
