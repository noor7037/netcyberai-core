import { MAX_FILES_PER_UPLOAD, MAX_PAGES_PER_FILE, MAX_PAGES_PER_UPLOAD, type PageUploadResult } from '@/lib/contracts/marking';
import { PageBatcher, UploadError, withRetry } from './browser-plan';

// Sending a class's scripts (C350), one file at a time: each page is made into a picture only when its turn comes,
// held with at most a request's worth of others, sent, and let go. Progress is kept per file. A file that cannot be
// read or sent is marked failed and the next one goes on; the teacher sees which and may try that file again. The
// drawing and the network are handed in (`deps`), so the order of things, the batches and the retries are tested
// without a browser (test/marking/upload-run.test.ts).

export type FileLike = { name: string; size: number };

export type FileState = {
  fileNo: number;
  name: string;
  status: 'waiting' | 'reading' | 'sending' | 'done' | 'failed';
  pagesTotal: number | null; // known once the file is opened
  pagesDone: number; // pictures the server has taken
  duplicates: number; // of them, ones it already had
  error: FileProblem | null;
};

// Why a file failed, as a code a screen puts into words.
export type FileProblem = 'unreadable' | 'too_many_pages' | 'page_too_small' | 'page_too_big' | 'refused' | 'network' | 'upload_total';

// A file opened for reading: how many pages, and the pictures one by one. `close` lets go of the document.
export type OpenedFile = {
  total: number;
  pages: AsyncIterable<{ pageNo: number; blob: Blob }>;
  close: () => void;
};

// Thrown by the opener for a file that cannot be turned into pictures.
export class FileFailure extends Error {
  constructor(readonly problem: FileProblem) {
    super(problem);
  }
}

export type PageJob = { fileNo: number; pageNo: number; blob: Blob; bytes: number };

export type RunDeps<F extends FileLike> = {
  open: (file: F) => Promise<OpenedFile>;
  send: (batch: PageJob[]) => Promise<PageUploadResult>;
  sleep?: (ms: number) => Promise<void>;
  cancelled?: () => boolean;
};

export const initialStates = (files: readonly FileLike[], firstNo = 1): FileState[] =>
  files.map((f, i) => ({ fileNo: firstNo + i, name: f.name, status: 'waiting', pagesTotal: null, pagesDone: 0, duplicates: 0, error: null }));

// The limits a selection must keep before anything is sent (the server holds the same).
export function selectionProblem(count: number): 'none' | 'too_many_files' {
  return count === 0 ? 'none' : count > MAX_FILES_PER_UPLOAD ? 'too_many_files' : 'none';
}

// Sends the given files (numbered from their `fileNo`), updating `states` in place and telling `onChange` after each
// step. `already` is the number of pages this upload has sent before (for the upload's total).
export async function sendFiles<F extends FileLike>(
  files: readonly { file: F; state: FileState }[],
  deps: RunDeps<F>,
  onChange: () => void,
  already = 0
): Promise<{ sent: number }> {
  let sentAll = already;
  const cancelled = deps.cancelled ?? (() => false);
  for (const { file, state } of files) {
    if (cancelled()) break;
    Object.assign(state, { status: 'reading', pagesTotal: null, pagesDone: 0, duplicates: 0, error: null } satisfies Partial<FileState>);
    onChange();
    let opened: OpenedFile | null = null;
    try {
      opened = await deps.open(file);
      if (opened.total > MAX_PAGES_PER_FILE) throw new FileFailure('too_many_pages');
      if (sentAll + opened.total > MAX_PAGES_PER_UPLOAD) throw new FileFailure('upload_total');
      state.pagesTotal = opened.total;
      state.status = 'sending';
      onChange();
      const batcher = new PageBatcher<PageJob>();
      const post = async (batch: PageJob[]) => {
        const result = await withRetry(() => deps.send(batch), { sleep: deps.sleep, cancelled });
        for (const p of result.pages) if (p.duplicate) state.duplicates += 1;
        state.pagesDone += batch.length;
        sentAll += batch.length;
        onChange();
      };
      for await (const page of opened.pages) {
        if (cancelled()) break;
        const job: PageJob = { fileNo: state.fileNo, pageNo: page.pageNo, blob: page.blob, bytes: page.blob.size };
        const full = batcher.add(job);
        if (full) await post(full);
      }
      const rest = cancelled() ? null : batcher.flush();
      if (rest) await post(rest);
      state.status = cancelled() ? 'waiting' : 'done';
    } catch (err) {
      state.status = 'failed';
      state.error = err instanceof FileFailure ? err.problem : err instanceof UploadError ? (err.status === 0 || err.status >= 500 || err.status === 408 || err.status === 429 ? 'network' : err.status === 413 ? 'page_too_big' : 'refused') : 'unreadable';
    } finally {
      opened?.close();
    }
    onChange();
  }
  return { sent: sentAll };
}
