'use client';

import { useState } from 'react';
import { colors } from '@/lib/design-tokens';
import { canvasToJpeg, downloadBlob, pdfBlob, safeFilename } from '@/lib/pdf/browser';
import type { JpegPage } from '@/lib/pdf/jpeg-pdf';

// "Download as PDF" on the private report link (C351): made in this browser from the page pictures already on the
// page, each drawn on an A4 page with the marks the teacher approved written in its margin, as on the screen. Nothing
// is uploaded; the file never leaves the phone.

export type PdfMark = { label: string; marks: number | null; max: number; counted: boolean; place: { pageId: string; yFrom: number; yTo: number } | null };
export type PdfPaper = { subject: string; pages: { pageId: string; src: string }[]; marks: PdfMark[] };

const A4 = { w: 1240, h: 1754 }; // 150 dots an inch
const shown = (n: number | null) => (n === null ? '–' : Number.isInteger(n) ? String(n) : n.toFixed(1));

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('page'));
    img.src = src;
  });
}

// One page: the picture fitted to A4 on white, then each mark as a rounded badge at the top of its answer, in the
// right margin, with a thin line beside the answer it is for.
async function drawPage(src: string, pageId: string, marks: readonly PdfMark[], caption: string): Promise<JpegPage> {
  const img = await load(src);
  const canvas = document.createElement('canvas');
  canvas.width = A4.w;
  canvas.height = A4.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, A4.w, A4.h);
  const scale = Math.min((A4.w - 40) / img.naturalWidth, (A4.h - 70) / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const x = (A4.w - w) / 2;
  const y = 50;
  ctx.drawImage(img, x, y, w, h);
  ctx.fillStyle = colors.slate;
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(caption, x, 26);
  let lastY = -1000;
  for (const m of [...marks].filter((k) => k.place?.pageId === pageId).sort((a, b) => a.place!.yFrom - b.place!.yFrom)) {
    const top = y + m.place!.yFrom * h;
    const bottom = y + Math.max(m.place!.yFrom, m.place!.yTo) * h;
    ctx.globalAlpha = m.counted ? 0.45 : 0.2;
    ctx.fillStyle = m.counted ? colors.royal : colors.slate;
    ctx.fillRect(x + w - 10, top, 6, Math.max(8, bottom - top));
    ctx.globalAlpha = 1;
    const text = `${m.label} · ${m.counted ? `${shown(m.marks)}/${shown(m.max)}` : '–'}`;
    ctx.font = 'bold 26px system-ui, sans-serif';
    const tw = ctx.measureText(text).width + 24;
    const by = Math.max(top, lastY + 44);
    lastY = by;
    const full = m.counted && m.marks !== null && m.marks >= m.max;
    const some = m.counted && m.marks !== null && m.marks > 0;
    // The same colours as the badges on the screen (MarkedScript), from the design tokens.
    ctx.fillStyle = !m.counted ? '#ffffff' : full ? colors.emerald : some ? colors.sunshine : colors.slate;
    ctx.strokeStyle = colors.slate;
    ctx.lineWidth = !m.counted ? 2 : 0;
    const bx = x + w - 20 - tw;
    ctx.beginPath();
    ctx.roundRect(bx, by, tw, 38, 10);
    ctx.fill();
    if (!m.counted) ctx.stroke();
    ctx.fillStyle = full || (!some && m.counted) ? '#ffffff' : colors.slate;
    ctx.fillText(text, bx + 12, by + 20);
  }
  return canvasToJpeg(canvas, 0.85);
}

export function ReportPdf({ papers, fileName, title, words }: { papers: PdfPaper[]; fileName: string; title: string; words: { pdf: string; making: string; failed: string; page: string } }) {
  const [state, setState] = useState<'idle' | 'making' | 'failed'>('idle');
  if (!papers.some((p) => p.pages.length)) return null;
  const make = async () => {
    setState('making');
    try {
      const out: JpegPage[] = [];
      for (const p of papers) {
        for (const [i, g] of p.pages.entries()) out.push(await drawPage(g.src, g.pageId, p.marks, `${p.subject} · ${words.page.replace('{n}', String(i + 1)).replace('{total}', String(p.pages.length))}`));
      }
      downloadBlob(pdfBlob(out, title), safeFilename(fileName, 'pdf'));
      setState('idle');
    } catch {
      setState('failed');
    }
  };
  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={() => void make()} disabled={state === 'making'} data-report-pdf className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-sapphire px-5 text-base font-semibold text-white disabled:opacity-60">
        {state === 'making' ? words.making : words.pdf}
      </button>
      {state === 'failed' && (
        <p role="alert" className="text-sm font-semibold text-slate">
          {words.failed}
        </p>
      )}
    </div>
  );
}
