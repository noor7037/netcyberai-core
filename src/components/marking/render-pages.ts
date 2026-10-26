import { PAGE_MAX_BYTES } from '@/lib/contracts/marking';
import { ENCODE_ATTEMPTS, fileKind, fitWithin, pdfRenderScale, tooSmall } from '@/lib/marking/browser-plan';
import { FileFailure, type OpenedFile } from '@/lib/marking/upload-run';

// Turning a file into page pictures in the browser (C350): a photo becomes one JPEG, a PDF one JPEG a page, each at
// most PAGE_MAX_EDGE pixels on its longest side and PAGE_MAX_BYTES in size. A page is drawn only when it is asked
// for and let go once it is a picture, so a long scan is never all in memory. PDF.js (pdfjs-dist) is loaded only when
// a PDF is chosen, and runs in its own worker (a file the build bundles). The sizes and the squeeze steps are
// src/lib/marking/browser-plan.ts's, tested alone; this file is the part that needs a browser.

const canvasOf = (width: number, height: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
};
const release = (c: HTMLCanvasElement) => {
  c.width = 0;
  c.height = 0;
};

// The canvas as a JPEG within the page limit: the usual quality first, then less, then a smaller picture as well.
async function encode(source: HTMLCanvasElement): Promise<Blob> {
  for (const { quality, shrink } of ENCODE_ATTEMPTS) {
    let target = source;
    if (shrink < 1) {
      target = canvasOf(Math.max(1, Math.round(source.width * shrink)), Math.max(1, Math.round(source.height * shrink)));
      target.getContext('2d')?.drawImage(source, 0, 0, target.width, target.height);
    }
    const blob = await new Promise<Blob | null>((resolve) => target.toBlob(resolve, 'image/jpeg', quality));
    if (target !== source) release(target);
    if (!blob) throw new FileFailure('unreadable');
    if (blob.size <= PAGE_MAX_BYTES) return blob;
  }
  throw new FileFailure('page_too_big');
}

// A photo, the right way up (the camera's own turn is applied), as a canvas no larger than a page picture.
async function drawPhoto(file: File): Promise<HTMLCanvasElement> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let done: () => void;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    done = () => bitmap.close();
  } catch {
    // A browser without the option: the picture element applies the camera's turn itself.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      source = img;
      width = img.naturalWidth;
      height = img.naturalHeight;
      done = () => URL.revokeObjectURL(url);
    } catch {
      URL.revokeObjectURL(url);
      throw new FileFailure('unreadable');
    }
  }
  try {
    if (tooSmall(width, height)) throw new FileFailure('page_too_small');
    const size = fitWithin(width, height);
    const canvas = canvasOf(size.width, size.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new FileFailure('unreadable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    done();
  }
}

async function* photoPages(file: File): AsyncGenerator<{ pageNo: number; blob: Blob }> {
  const canvas = await drawPhoto(file);
  try {
    yield { pageNo: 1, blob: await encode(canvas) };
  } finally {
    release(canvas);
  }
}

async function openPdf(file: File): Promise<OpenedFile> {
  // Loaded only now, and only for a PDF; the worker is a separate file the build puts in the app's own assets.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  // The file is read from its blob in pieces as pages are asked for, not copied into memory whole.
  const url = URL.createObjectURL(file);
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    doc = await pdfjs.getDocument({ url, isEvalSupported: false }).promise;
  } catch {
    URL.revokeObjectURL(url);
    throw new FileFailure('unreadable');
  }
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    URL.revokeObjectURL(url);
    void doc.destroy();
  };
  async function* pages(): AsyncGenerator<{ pageNo: number; blob: Blob }> {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const k = pdfRenderScale(base.width, base.height);
      const size = fitWithin(base.width * k, base.height * k);
      if (tooSmall(size.width, size.height)) throw new FileFailure('page_too_small');
      const viewport = page.getViewport({ scale: size.width / base.width });
      const canvas = canvasOf(size.width, size.height);
      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new FileFailure('unreadable');
        // A PDF page has no background of its own: a picture of it is on white, as paper is.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        yield { pageNo: n, blob: await encode(canvas) };
      } finally {
        page.cleanup();
        release(canvas);
      }
    }
  }
  return { total: doc.numPages, pages: pages(), close };
}

// A file as a count of pages and the pictures, one when asked for. A photo is one page.
export async function openFile(file: File): Promise<OpenedFile> {
  const kind = fileKind(file);
  if (kind === 'pdf') return openPdf(file);
  if (kind === 'image') return { total: 1, pages: photoPages(file), close: () => undefined };
  throw new FileFailure('unreadable');
}
