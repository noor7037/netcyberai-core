import type { SchoolCheckedPaper } from '@/lib/contracts/school-link';
import { colors } from '@/lib/design-tokens';
import { canvasToJpeg, downloadBlob, pdfBlob } from '@/lib/pdf/browser';
import type { JpegPage } from '@/lib/pdf/jpeg-pdf';
import { PDF_MAX_BYTES, PDF_STEPS, PDF_TARGET_BYTES, type CheckedPdfInput, type PdfStep, type Say } from './checked-pdf-shape';
import { layoutBadges, type BadgeKind } from './margin';

export { CHECKED_PDF_WORD_KEYS, PDF_MAX_BYTES, PDF_STEPS, PDF_TARGET_BYTES, pdfFileName, type CheckedPdfInput, type CheckedPdfWordKey, type PdfStep, type Say } from './checked-pdf-shape';

// A child's checked papers of one publication as one PDF (C366), drawn in the browser like every PDF of the app
// (src/lib/pdf: canvases made into JPEG pages; Hindi through the device's own fonts; nothing sent anywhere while it is
// made). The office's browser makes it at "Tell parents on WhatsApp"; a family's browser makes the same one from what
// it is already shown (the Family app's checked paper). Browser only.
//
//   - First the summary: the school, the child, the exam; then each paper with its parts' totals, the marks of every
//     question (internal choice said), its topic, what went well, what to work on and what to practise next.
//   - Then every checked page, the picture in grey to keep the file small, with each question's mark in the margin
//     beside its answer (the places of src/lib/marking/margin.ts, the colours of the Family app's margin marks: no red).
//   - The pictures are drawn at PDF_STEPS' sizes, the first that keeps the PDF at PDF_TARGET_BYTES (1.5 MB) or under,
//     else the smallest (never over PDF_MAX_BYTES); each picture is fetched once and decoded one at a time, so a long
//     paper does not fill the device's memory.
// Nothing compares the child with anyone: no average, no rank (C76).

// The picture of one page, as the caller fetches it (its own route, which checks who asks), or null when it is gone.
export type LoadPage = (pageId: string) => Promise<Blob | null>;
export type Progress = (done: number, total: number) => void;

const FONT = 'Helvetica, Arial, "Noto Sans", "Noto Sans Devanagari", sans-serif';
const INK = colors.slate;
const BRAND = colors.sapphire;
const WHITE = '#FFFFFF';
const SUMMARY_DPI = 150;
const SW = Math.round((210 / 25.4) * SUMMARY_DPI);
const SH = Math.round((297 / 25.4) * SUMMARY_DPI);
const MM = SW / 210;
const MARGIN = 14 * MM;
const SUMMARY_QUALITY = 0.72;

const shown = (n: number | null) => (n === null ? '–' : Number.isInteger(n) ? String(n) : n.toFixed(1));
const dayWords = (iso: string, lang: 'en' | 'hi') => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
};

function canvasOf(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not create a drawing surface.');
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'top';
  return { canvas, ctx };
}

// ---- the summary --------------------------------------------------------------------------------------------------

class Summary {
  pages: HTMLCanvasElement[] = [];
  ctx!: CanvasRenderingContext2D;
  y = 0;
  readonly width = SW - 2 * MARGIN;
  readonly bottom = SH - MARGIN - 8 * MM;

  constructor(private readonly footer: string) {
    this.newPage();
  }
  newPage() {
    const { canvas, ctx } = canvasOf(SW, SH);
    this.pages.push(canvas);
    this.ctx = ctx;
    this.y = MARGIN;
    this.font(8, false);
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.75;
    ctx.fillText(this.footer, MARGIN, SH - MARGIN - 4 * MM);
    ctx.globalAlpha = 1;
  }
  font(pt: number, bold: boolean) {
    this.ctx.font = `${bold ? '700' : '400'} ${Math.round((pt / 72) * SUMMARY_DPI)}px ${FONT}`;
  }
  lineHeight(pt: number) {
    return (pt / 72) * SUMMARY_DPI * 1.4;
  }
  ensure(h: number) {
    if (this.y + h > this.bottom) this.newPage();
  }
  wrap(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
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
  text(text: string, pt: number, opts: { bold?: boolean; color?: string; gapAfter?: number; indent?: number } = {}) {
    this.font(pt, Boolean(opts.bold));
    const lh = this.lineHeight(pt);
    const x = MARGIN + (opts.indent ?? 0);
    for (const line of this.wrap(text, this.width - (opts.indent ?? 0))) {
      this.ensure(lh);
      this.ctx.fillStyle = opts.color ?? INK;
      this.ctx.fillText(line, x, this.y);
      this.y += lh;
    }
    this.y += opts.gapAfter ?? 0;
  }
  rule() {
    this.ctx.fillStyle = INK;
    this.ctx.globalAlpha = 0.2;
    this.ctx.fillRect(MARGIN, this.y, this.width, Math.max(1, 0.3 * MM));
    this.ctx.globalAlpha = 1;
  }
  // A table of rows of cells, each column a share of the width; the head row shaded and repeated on a new page.
  table(head: string[], rows: string[][], shares: number[]) {
    const pt = 9.5;
    const pad = 1.6 * MM;
    const lh = this.lineHeight(pt);
    const widths = shares.map((s) => s * this.width);
    const draw = (cells: string[], bold: boolean, shade: boolean) => {
      this.font(pt, bold);
      const wrapped = cells.map((c, i) => this.wrap(c, widths[i] - 2 * pad));
      const h = Math.max(...wrapped.map((l) => l.length)) * lh + 2 * pad;
      const fresh = this.y + h > this.bottom;
      if (fresh) {
        this.newPage();
        if (!bold) draw(head, true, true);
        this.font(pt, bold);
      }
      if (shade) {
        this.ctx.fillStyle = colors.offWhite;
        this.ctx.fillRect(MARGIN, this.y, this.width, h);
      }
      let x = MARGIN;
      wrapped.forEach((lines, i) => {
        this.ctx.fillStyle = INK;
        lines.forEach((line, li) => this.ctx.fillText(line, x + pad, this.y + pad + li * lh));
        x += widths[i];
      });
      this.y += h;
      this.rule();
    };
    draw(head, true, true);
    for (const r of rows) draw(r, false, false);
  }
}

function drawSummary(input: CheckedPdfInput, say: Say): HTMLCanvasElement[] {
  const s = new Summary(say('mk.pdf.footer'));
  const { ctx } = s;
  // The head: a band in the brand's navy with the title and the school, then the child and the exam.
  const band = 24 * MM;
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, SW, band);
  s.font(18, true);
  ctx.fillStyle = WHITE;
  ctx.fillText(say('mk.pdf.title'), MARGIN, 6 * MM);
  s.font(11, false);
  ctx.fillText(input.school.slice(0, 120), MARGIN, 14.5 * MM);
  s.y = band + 7 * MM;
  // The family's own copy names no child or class (the app already knows whose it is): its head is the exam.
  if (input.child) s.text(input.rollNo ? say('mk.pdf.child', { name: input.child, class: input.className, roll: input.rollNo }) : say('mk.pdf.childNoRoll', { name: input.child, class: input.className }), 13, { bold: true, gapAfter: 1 * MM });
  s.text(say('mk.pdf.published', { exam: input.exam, date: dayWords(input.publishedOn, input.lang) }), 11, { gapAfter: 5 * MM });

  for (const paper of input.papers) {
    s.ensure(30 * MM);
    s.rule();
    s.y += 3 * MM;
    s.text(paper.subject, 15, { bold: true, color: BRAND, gapAfter: 1 * MM });
    for (const p of paper.parts) s.text(`${p.name}: ${say('fam.marks.partScore', { score: shown(p.score), max: shown(p.max) })}`, 12, { bold: true });
    s.y += 2 * MM;
    s.table(
      [say('mk.pdf.colQuestion'), say('mk.pdf.colMarks'), say('mk.pdf.colTopic')],
      paper.questions.map((q) => [
        q.label,
        !q.counted ? say('fam.marks.notCounted') : q.marks === null ? say('fam.marks.noMark') : say('fam.marks.markOf', { marks: shown(q.marks), max: shown(q.max) }),
        q.topic ? (q.chapter ? `${q.chapter} · ${q.topic}` : q.topic) : q.chapter ?? '',
      ]),
      [0.16, 0.3, 0.54]
    );
    s.y += 3 * MM;
    const said = (title: string, text: string | null) => {
      if (!text) return;
      s.text(title, 11, { bold: true });
      s.text(text, 10.5, { gapAfter: 2 * MM });
    };
    said(say('fam.marks.strengths'), paper.strengths);
    said(say('fam.marks.improve'), paper.improve);
    if (paper.practice.length) {
      s.text(say('fam.marks.practice'), 11, { bold: true });
      for (const p of paper.practice) s.text(`• ${p.topic ? `${p.chapter ? `${p.chapter} · ` : ''}${p.topic}: ` : ''}${p.text}`, 10.5, { indent: 2 * MM });
      s.y += 2 * MM;
    }
    if (!paper.pages.length) s.text(say('fam.marks.noPages'), 10, { gapAfter: 2 * MM });
  }
  if (input.papers.some((p) => p.pages.length)) {
    s.y += 2 * MM;
    s.text(say('mk.pdf.pagesFollow'), 10.5, { bold: true });
  }
  return s.pages;
}

// ---- the checked pages ---------------------------------------------------------------------------------------------

// The Family app's margin marks (src/components/app-ui/MarkedScript.tsx): calm, with no red.
const BADGE: Record<BadgeKind, { bg: string; fg: string; line: string; border: boolean }> = {
  full: { bg: colors.emerald, fg: WHITE, line: colors.emerald, border: false },
  part: { bg: colors.sunshine, fg: colors.slate, line: colors.amber, border: false },
  none: { bg: colors.slate, fg: WHITE, line: colors.slate, border: false },
  unmarked: { bg: WHITE, fg: colors.slate, line: colors.slate, border: true },
  out: { bg: WHITE, fg: colors.slate, line: colors.slate, border: true },
};

async function decode(blob: Blob): Promise<{ img: CanvasImageSource; width: number; height: number; done: () => void }> {
  // A JPEG is decoded off the page's thread where the browser can; anything it cannot decode so is drawn as an image.
  const bmp = typeof createImageBitmap === 'function' ? await createImageBitmap(blob).catch(() => null) : null;
  if (bmp) return { img: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('The page picture could not be read.'));
    img.src = url;
  });
  return { img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
}

function drawPage(paper: SchoolCheckedPaper, index: number, picture: Awaited<ReturnType<typeof decode>> | null, step: PdfStep, say: Say): HTMLCanvasElement {
  const H = step.longEdge;
  const W = Math.round(step.longEdge / Math.SQRT2);
  const k = step.longEdge / 1200;
  const { canvas, ctx } = canvasOf(W, H);
  const pad = Math.round(16 * k);
  const head = Math.round(40 * k);
  const marginCol = Math.round(W * 0.17);
  const page = paper.pages[index];
  ctx.font = `700 ${Math.round(15 * k)}px ${FONT}`;
  ctx.fillStyle = BRAND;
  ctx.fillText(say('mk.pdf.page', { subject: paper.subject, n: index + 1, total: paper.pages.length }).slice(0, 140), pad, Math.round(12 * k));
  const boxW = W - marginCol - 2 * pad;
  const boxH = H - head - pad;
  const iw = picture?.width ?? page.width;
  const ih = picture?.height ?? page.height;
  const scale = Math.min(boxW / iw, boxH / ih);
  const dw = Math.round(iw * scale);
  const dh = Math.round(ih * scale);
  const dx = pad;
  const dy = head;
  if (picture) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Grey keeps the file small and prints well; a browser without canvas filters draws it in colour.
    ctx.filter = 'grayscale(1)';
    ctx.drawImage(picture.img, dx, dy, dw, dh);
    ctx.filter = 'none';
  } else {
    ctx.fillStyle = colors.offWhite;
    ctx.fillRect(dx, dy, dw, dh);
    ctx.fillStyle = INK;
    ctx.font = `400 ${Math.round(14 * k)}px ${FONT}`;
    ctx.fillText(say('fam.marks.noPages').slice(0, 120), dx + pad, dy + pad);
  }
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = Math.max(1, Math.round(k));
  ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
  ctx.globalAlpha = 1;

  // The marks in the margin, beside their answers: a line the height of the answer, and the question's mark.
  const marks = paper.questions.map((q) => ({ questionId: q.label, place: q.place, final: q.marks, max: q.max, counted: q.counted }));
  const fontPx = Math.round(14 * k);
  ctx.font = `700 ${fontPx}px ${FONT}`;
  const badgeH = Math.round(fontPx * 1.6);
  const slotW = Math.floor((marginCol - Math.round(10 * k)) / 2);
  for (const b of layoutBadges(marks).filter((x) => x.pageId === page.pageId)) {
    const look = BADGE[b.kind];
    const q = paper.questions.find((x) => x.label === b.questionId);
    const y = Math.min(dy + Math.round((b.top / 100) * dh), dy + dh - badgeH);
    const lineH = Math.max(Math.round((b.height / 100) * dh), badgeH);
    ctx.fillStyle = look.line;
    ctx.fillRect(dx + dw + Math.round(3 * k), y, Math.max(2, Math.round(3 * k)), Math.min(lineH, dy + dh - y));
    const text = `${b.questionId} · ${q && !q.counted ? '–' : `${shown(q?.marks ?? null)}/${shown(q?.max ?? null)}`}`;
    const tw = Math.min(ctx.measureText(text).width + Math.round(10 * k), slotW * 2 - 2);
    const x = Math.min(dx + dw + Math.round(10 * k) + b.slot * slotW, W - tw - 2);
    ctx.fillStyle = look.bg;
    ctx.fillRect(x, y, tw, badgeH);
    if (look.border) {
      ctx.strokeStyle = look.fg;
      ctx.lineWidth = Math.max(1, Math.round(1.5 * k));
      ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, badgeH - 1);
    }
    ctx.fillStyle = look.fg;
    ctx.fillText(text, x + Math.round(5 * k), y + Math.round((badgeH - fontPx) / 2), tw - Math.round(10 * k));
  }
  return canvas;
}

// ---- the PDF -------------------------------------------------------------------------------------------------------

// The PDF at one step's size. Each page picture is fetched once (`blobs` keeps the fetched files between steps) and
// decoded only while its page is drawn.
export async function makeCheckedPdf(input: CheckedPdfInput, say: Say, loadPage: LoadPage, step: PdfStep = PDF_STEPS[0], onProgress?: Progress, blobs: Map<string, Blob | null> = new Map()): Promise<Blob> {
  const total = input.papers.reduce((n, p) => n + p.pages.length, 0) + 1;
  let done = 0;
  const jpegs: JpegPage[] = [];
  for (const c of drawSummary(input, say)) jpegs.push(await canvasToJpeg(c, SUMMARY_QUALITY));
  onProgress?.(++done, total);
  for (const paper of input.papers) {
    for (let i = 0; i < paper.pages.length; i++) {
      const id = paper.pages[i].pageId;
      if (!blobs.has(id)) blobs.set(id, await loadPage(id).catch(() => null));
      const blob = blobs.get(id) ?? null;
      const picture = blob ? await decode(blob).catch(() => null) : null;
      try {
        jpegs.push(await canvasToJpeg(drawPage(paper, i, picture, step, say), step.quality));
      } finally {
        picture?.done();
      }
      onProgress?.(++done, total);
    }
  }
  return pdfBlob(jpegs, 'Checked answer sheets');
}

// The PDF at the first step that keeps it at PDF_TARGET_BYTES or under; when none does (a long publication), the
// smallest, which must still be under PDF_MAX_BYTES; null when even that is not.
export async function makeFittedCheckedPdf(input: CheckedPdfInput, say: Say, loadPage: LoadPage, onProgress?: Progress): Promise<{ blob: Blob; step: PdfStep } | null> {
  const blobs = new Map<string, Blob | null>();
  let kept: { blob: Blob; step: PdfStep } | null = null;
  for (const step of PDF_STEPS) {
    const blob = await makeCheckedPdf(input, say, loadPage, step, onProgress, blobs);
    if (blob.size <= PDF_MAX_BYTES) kept = { blob, step };
    if (blob.size <= PDF_TARGET_BYTES) break;
  }
  return kept;
}

// The PDF saved on the device, under a name of the exam and subject only.
export const downloadPdf = (blob: Blob, filename: string) => downloadBlob(blob, filename);

// A page picture through one of the app's own picture routes (the office's or the family's), which check who asks.
export const pageFrom = (src: (pageId: string) => string): LoadPage => async (pageId) => {
  const res = await fetch(src(pageId), { cache: 'no-store', credentials: 'same-origin' }).catch(() => null);
  return res?.ok ? res.blob() : null;
};
