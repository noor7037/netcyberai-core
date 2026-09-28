'use client';

import { A4_300DPI, jpegPagesToPdf, type JpegPage } from './jpeg-pdf';

// Browser-only helpers around jpeg-pdf.ts. Nothing here touches the
// network: SVG and canvases are turned into JPEG bytes in memory, and
// every object URL is revoked as soon as it has been used.

export async function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.92): Promise<JpegPage> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Your browser could not create the page image.');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), widthPx: canvas.width, heightPx: canvas.height };
}

// Draws an SVG document (with every image already inlined as a data URL,
// since an SVG loaded as an image may not fetch anything) onto a white
// canvas of the given pixel size.
export async function svgToCanvas(svg: string, width = A4_300DPI.w, height = A4_300DPI.h): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('The page could not be drawn.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not create a drawing surface.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function pdfBlob(pages: JpegPage[], title: string): Blob {
  return new Blob([jpegPagesToPdf(pages, { title })], { type: 'application/pdf' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download, then release it.
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// A filename made only of safe characters; never includes typed personal
// details unless the caller passes them deliberately.
export function safeFilename(base: string, ext: string): string {
  const clean = base.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'document';
  return `${clean}.${ext}`;
}

// Web Share with a file where the device supports it (most phones), so a
// PDF can go straight to WhatsApp or email. Returns false when sharing a
// file is not supported, so the caller can fall back to a download.
export async function shareFile(blob: Blob, filename: string, title: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (!nav.share || !nav.canShare?.({ files: [file] })) return false;
  try {
    await nav.share({ files: [file], title });
    return true;
  } catch (e) {
    // The visitor closing the share sheet is not an error.
    return (e as DOMException)?.name === 'AbortError';
  }
}
