'use client';

import type { SheetLayout } from '@/lib/bubbles/layout';
import type { BubblePageResult, BubbleReading, PageUploadResult } from '@/lib/contracts/marking';
import { UploadError } from '@/lib/marking/browser-plan';
import type { OpenedFile, PageJob, RunDeps } from '@/lib/marking/upload-run';
import { openFile } from '../marking/render-pages';
import type { BubbleWorker } from './bubble-worker';

// Bubble sheets chosen as files (C364): PDFs from a scanner or photos. Each page is turned into a picture as for answer
// books (../marking/render-pages.ts), read in the scan worker against the paper's layout, and only a page read as a
// sheet of this paper is sent, as its straightened picture with what was read. A page that is not one (no corner squares
// found) is counted and never sent. The sending, the batches and the retries are upload-run.ts's own.

export type BubbleFileTally = { notSheets: number; results: BubblePageResult[] };

export function bubbleFileDeps(uploadId: string, layout: SheetLayout, worker: BubbleWorker, tally: BubbleFileTally, cancelled: () => boolean): RunDeps<File> {
  const readings = new WeakMap<Blob, BubbleReading>();
  return {
    async open(file: File): Promise<OpenedFile> {
      const opened = await openFile(file);
      async function* pages(): AsyncGenerator<{ pageNo: number; blob: Blob }> {
        for await (const page of opened.pages) {
          const read = await worker.read(await createImageBitmap(page.blob), layout);
          if (!read.ok) {
            tally.notSheets += 1;
            continue;
          }
          readings.set(read.jpeg, read.reading);
          yield { pageNo: page.pageNo, blob: read.jpeg };
        }
      }
      return { total: opened.total, pages: pages(), close: opened.close };
    },
    async send(batch: PageJob[]): Promise<PageUploadResult> {
      const form = new FormData();
      for (const p of batch) {
        const reading = readings.get(p.blob);
        if (!reading) throw new UploadError(400, 'reading');
        form.append('fileNo', String(p.fileNo));
        form.append('pageNo', String(p.pageNo));
        form.append('reading', JSON.stringify(reading));
        form.append('page', p.blob, `sheet-${p.fileNo}-${p.pageNo}.jpg`);
      }
      const res = await fetch(`/api/app/marking/uploads/${uploadId}/bubbles`, { method: 'POST', body: form }).catch(() => null);
      if (!res) throw new UploadError(0);
      const body = (await res.json().catch(() => null)) as { pages?: BubblePageResult[]; code?: string } | null;
      if (!res.ok || !body || !Array.isArray(body.pages)) throw new UploadError(res.status, typeof body?.code === 'string' ? body.code : null);
      for (const r of body.pages) if (!tally.results.some((x) => x.pageId === r.pageId)) tally.results.push(r);
      return { pages: body.pages.map((r) => ({ fileNo: r.fileNo, pageNo: r.pageNo, pageId: r.pageId, duplicate: r.outcome === 'duplicate' })) };
    },
    cancelled,
  };
}
