'use client';

import { CORNERS, CORNER_SIZE, DIGIT_LABEL_X, HEADER, LABEL_RIGHT, ORIENT, ROLL_DIGITS, ROLL_GRID_X, SHEET_DIGITS, SHEET_GRID_X, shadableRoll, sheetDigits, sheetLayout, type Bubble } from '@/lib/bubbles/layout';
import type { BubblePrint } from '@/lib/contracts/marking';
import { canvasToJpeg, pdfBlob } from '@/lib/pdf/browser';
import type { JpegPage } from '@/lib/pdf/jpeg-pdf';

// The bubble sheets of a paper as one PDF (docs/36 §1.2, C364), drawn on A4 canvases in the browser and made into a PDF
// with src/lib/pdf, as every PDF of the app is made: no server, no upload, Hindi through the device's own fonts. One page
// a sheet: the candidates in roll order, then the blank sheets. Everything is placed by the layout the reader reads with
// (src/lib/bubbles/layout.ts). Print it at full size ("actual size"); the reader finds the corner squares whatever the
// scale, but a sheet cut off at the edges cannot be read.

const DPI = 200;
const W = Math.round((210 / 25.4) * DPI);
const H = Math.round((297 / 25.4) * DPI);
const MM = W / 210;
const FONT = 'Helvetica, Arial, "Noto Sans", "Noto Sans Devanagari", sans-serif';
// Print colours: black ink, a grey for the bubbles' rings and a light grey for the letters inside them (light enough that
// an empty bubble reads as empty).
const INK = '#000000';
const RING = '#3a3a3a';
const SOFT = '#a8a8a8';
const MUTED = '#4a4a4a';

export type SheetWords = {
  name: string;
  roll: string;
  examNo: string;
  sheetNo: string;
  rollGrid: string;
  blank: string;
  rules: string[];
  footer: (sheetNo: string) => string;
  date: string | null;
};

const px = (mm: number) => mm * MM;
const pad4 = (n: number) => String(n).padStart(4, '0');

function font(ctx: CanvasRenderingContext2D, pt: number, bold = false) {
  ctx.font = `${bold ? '700' : '400'} ${Math.round((pt / 72) * DPI)}px ${FONT}`;
}
// Text cut to a width, with an ellipsis, so a long name never runs into the grids.
function fit(ctx: CanvasRenderingContext2D, text: string, maxMm: number): string {
  if (ctx.measureText(text).width <= px(maxMm)) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > px(maxMm)) t = t.slice(0, -1);
  return `${t}…`;
}
function wrap(ctx: CanvasRenderingContext2D, text: string, maxMm: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= px(maxMm) || !line) line = next;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}
function ring(ctx: CanvasRenderingContext2D, b: Bubble) {
  ctx.beginPath();
  ctx.arc(px(b.x), px(b.y), px(b.r), 0, Math.PI * 2);
  ctx.strokeStyle = RING;
  ctx.lineWidth = px(0.28);
  ctx.stroke();
}
function solid(ctx: CanvasRenderingContext2D, b: Bubble) {
  ctx.beginPath();
  ctx.arc(px(b.x), px(b.y), px(b.r + 0.1), 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
}
function inside(ctx: CanvasRenderingContext2D, b: Bubble, text: string) {
  font(ctx, 6);
  ctx.fillStyle = SOFT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, px(b.x), px(b.y) + px(0.1));
}

function drawSheet(print: BubblePrint, sheet: BubblePrint['sheets'][number], words: SheetWords): HTMLCanvasElement {
  const layout = sheetLayout(print.questions);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // The corner squares and the mark that says which way up.
  ctx.fillStyle = INK;
  for (const k of CORNERS) ctx.fillRect(px(k.x - CORNER_SIZE / 2), px(k.y - CORNER_SIZE / 2), px(CORNER_SIZE), px(CORNER_SIZE));
  ctx.fillRect(px(ORIENT.x - ORIENT.size / 2), px(ORIENT.y - ORIENT.size / 2), px(ORIENT.size), px(ORIENT.size));

  // The header.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  font(ctx, 12, true);
  ctx.fillText(fit(ctx, print.school, HEADER.textRight - HEADER.left), px(HEADER.left), px(HEADER.school));
  font(ctx, 9.5, true);
  ctx.fillText(fit(ctx, `${print.examName} · ${print.className} · ${print.subjectName}`, HEADER.textRight - HEADER.textLeft), px(HEADER.textLeft), px(HEADER.exam));
  if (words.date) {
    font(ctx, 9);
    ctx.fillStyle = MUTED;
    ctx.fillText(fit(ctx, words.date, HEADER.textRight - HEADER.textLeft), px(HEADER.textLeft), px(HEADER.paper));
  }
  // The child's box.
  const box = HEADER.childBox;
  ctx.strokeStyle = INK;
  ctx.lineWidth = px(0.3);
  ctx.strokeRect(px(HEADER.textLeft), px(box.y), px(HEADER.textRight - HEADER.textLeft), px(box.h));
  const lines: [string, string | null][] = [
    [words.name, sheet.child?.name ?? null],
    [words.roll, sheet.child ? (sheet.child.rollNo ?? '—') : null],
    [words.examNo, sheet.child ? (sheet.child.seatNo ?? '—') : null],
  ];
  lines.forEach(([label, value], i) => {
    const y = box.y + 6 + i * 8.5;
    ctx.fillStyle = MUTED;
    font(ctx, 8.5);
    ctx.fillText(label, px(HEADER.textLeft + 3), px(y));
    const x0 = HEADER.textLeft + 26;
    if (value === null) {
      ctx.strokeStyle = SOFT;
      ctx.lineWidth = px(0.25);
      ctx.beginPath();
      ctx.moveTo(px(x0), px(y + 2.5));
      ctx.lineTo(px(HEADER.textRight - 4), px(y + 2.5));
      ctx.stroke();
    } else {
      ctx.fillStyle = INK;
      font(ctx, i === 0 ? 11 : 10, true);
      ctx.fillText(fit(ctx, value, HEADER.textRight - 4 - x0), px(x0), px(y));
    }
  });
  // The rules (and, on a blank sheet, what to do first).
  font(ctx, 7.5);
  ctx.fillStyle = INK;
  let y = HEADER.instructions;
  for (const rule of [...(sheet.child ? [] : [words.blank]), ...words.rules]) {
    for (const line of wrap(ctx, `• ${rule}`, HEADER.textRight - HEADER.textLeft)) {
      if (y > 99) break;
      ctx.fillText(line, px(HEADER.textLeft), px(y));
      y += 3.6;
    }
  }

  // The sheet number: printed in its boxes and pre-shaded; the roll number: shaded by the child on a blank sheet,
  // pre-shaded on a named one when it is a number of up to four digits.
  const digits = sheetDigits(sheet.sheetNo);
  const roll = sheet.child ? shadableRoll(sheet.child.rollNo) : null;
  const grids: { title: string; x: number; columns: Bubble[][]; printed: (number | null)[]; letters: boolean }[] = [
    { title: words.sheetNo, x: SHEET_GRID_X, columns: layout.sheetNo, printed: digits, letters: false },
    { title: words.rollGrid, x: ROLL_GRID_X, columns: layout.roll, printed: roll ? roll.split('').map(Number) : Array.from({ length: ROLL_DIGITS }, () => null), letters: !roll },
  ];
  grids.forEach((g, gi) => {
    const last = g.columns[g.columns.length - 1][0].x;
    font(ctx, 7.5, true);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText(g.title, px((g.x + last) / 2), px(HEADER.gridTitle));
    g.columns.forEach((col, ci) => {
      const bx = col[0].x;
      ctx.strokeStyle = INK;
      ctx.lineWidth = px(0.25);
      ctx.strokeRect(px(bx - 2.4), px(HEADER.gridBoxes.y), px(4.8), px(HEADER.gridBoxes.h));
      const d = g.printed[ci];
      if (d !== null && d !== undefined) {
        font(ctx, 9, true);
        ctx.fillStyle = INK;
        ctx.fillText(String(d), px(bx), px(HEADER.gridBoxes.y + HEADER.gridBoxes.h / 2));
      }
      col.forEach((b, digit) => {
        ring(ctx, b);
        if (d === digit) solid(ctx, b);
        else if (g.letters) inside(ctx, b, String(digit));
      });
    });
    // The digits beside the grid.
    font(ctx, 6.5);
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'center';
    g.columns[0].forEach((b, digit) => ctx.fillText(String(digit), px(gi === 0 ? DIGIT_LABEL_X.sheet : DIGIT_LABEL_X.roll), px(b.y)));
  });
  // The check digit's column is told apart by a line above it.
  const check = layout.sheetNo[SHEET_DIGITS][0].x;
  ctx.strokeStyle = INK;
  ctx.lineWidth = px(0.25);
  ctx.beginPath();
  ctx.moveTo(px(check - 2.4), px(HEADER.gridBoxes.y - 1));
  ctx.lineTo(px(check + 2.4), px(HEADER.gridBoxes.y - 1));
  ctx.stroke();

  // The answers.
  for (const q of layout.questions) {
    font(ctx, q.label.length > 4 ? 6.5 : 8.5, true);
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(q.label, px(q.row.x + LABEL_RIGHT), px(q.bubbles[0].y));
    q.bubbles.forEach((b, i) => {
      ring(ctx, b);
      inside(ctx, b, q.keys[i]);
    });
  }

  // The footer: the sheet's number in words a person reads, and how to keep the sheet.
  font(ctx, 7);
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.fillText(fit(ctx, words.footer(pad4(sheet.sheetNo)), 150 - HEADER.left), px(HEADER.left), px(HEADER.footer));
  return c;
}

// One PDF of every sheet printed, in order.
export async function bubbleSheetsPdf(print: BubblePrint, words: SheetWords, title: string): Promise<Blob> {
  const pages: JpegPage[] = [];
  for (const sheet of print.sheets) {
    const canvas = drawSheet(print, sheet, words);
    pages.push(await canvasToJpeg(canvas, 0.9));
    canvas.width = 0;
    canvas.height = 0;
  }
  return pdfBlob(pages, title);
}
