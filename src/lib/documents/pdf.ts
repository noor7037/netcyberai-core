'use client';

import { FONTS, type Measure } from '@/lib/certificates/render';
import { A4_300DPI, type JpegPage } from '@/lib/pdf/jpeg-pdf';
import { canvasToJpeg, pdfBlob, svgToCanvas } from '@/lib/pdf/browser';
import { certificateSvg, type IssuedForPrint, type Marks } from './cert-doc';

// Certificates of the register as one PDF, drawn on this device (as the studio and the report cards are): one A4 page
// per certificate at 300 DPI. A batch is one file of all its pages, in the order given (roll order); one certificate
// is a file of its own, which is also what goes to its family.

let ctx: CanvasRenderingContext2D | null = null;
// The browser's own font measurements, as the studio lays its certificates out.
export const canvasMeasure: Measure = (text, size, bold, serif) => {
  if (!ctx && typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * size * 0.5;
  ctx.font = `${bold ? 700 : 400} 100px ${serif ? FONTS.SERIF : FONTS.SANS}`;
  return (ctx.measureText(text).width / 100) * size;
};

async function page(svg: string): Promise<JpegPage> {
  const sized = svg.replace('width="210mm" height="297mm"', `width="${A4_300DPI.w}" height="${A4_300DPI.h}"`);
  const canvas = await svgToCanvas(sized);
  try {
    return await canvasToJpeg(canvas, 0.9);
  } finally {
    canvas.width = canvas.height = 0;
  }
}

export async function certificatesPdf(list: readonly IssuedForPrint[], marks: Marks, title: string): Promise<Blob> {
  const pages: JpegPage[] = [];
  for (const c of list) pages.push(await page(certificateSvg(c, marks, canvasMeasure)));
  return pdfBlob(pages, title);
}
