import { RECORD_FILE_MAX_BYTES, recordFileTypeOf, type RecordFileType, type RecordUploadTicket } from '@/lib/contracts/record-documents';

// The browser's half of a direct upload (C235-D2, src/lib/documents/record-direct-upload.ts): the file is checked
// here first (the server checks everything again), then the server is asked for a link, the file is sent to the file
// store with its progress shown, and the server is asked to confirm it. The file never passes through the app's server.

export type FileCheckProblem = 'file_missing' | 'file_empty' | 'file_too_large' | 'file_type';

// Before anything is asked: a file, not empty, at most 10 MB, and a PDF, JPEG or PNG by its own first bytes.
export async function checkBeforeSending(file: File | null | undefined): Promise<{ ok: true; mime: RecordFileType } | { ok: false; problem: FileCheckProblem }> {
  if (!file) return { ok: false, problem: 'file_missing' };
  if (file.size === 0) return { ok: false, problem: 'file_empty' };
  if (file.size > RECORD_FILE_MAX_BYTES) return { ok: false, problem: 'file_too_large' };
  const mime = recordFileTypeOf(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  return mime ? { ok: true, mime } : { ok: false, problem: 'file_type' };
}

export type SendProgress = { phase: 'sending'; percent: number } | { phase: 'checking' };
export type SendResult =
  | { ok: true; documentId: string; versionNo: number }
  // ask/confirm: the server's refusal, to be said in the person's language; send: the file store did not take it
  // (`tooLarge`: it said the file is too large; otherwise the connection failed).
  | { ok: false; step: 'ask' | 'confirm'; res: Response | null }
  | { ok: false; step: 'send'; tooLarge: boolean };

// The file to the link, as its body, with the type the server was told (the store records it, and the server checks
// it again). XMLHttpRequest, not fetch: only it reports how much of a file has been sent.
function sendToStore(url: string, file: File, contentType: string, onPercent: (percent: number) => void): Promise<{ ok: true } | { ok: false; status: number }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onPercent(Math.min(100, Math.floor((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300 ? { ok: true } : { ok: false, status: xhr.status });
    xhr.onerror = () => resolve({ ok: false, status: 0 });
    xhr.onabort = () => resolve({ ok: false, status: 0 });
    xhr.ontimeout = () => resolve({ ok: false, status: 0 });
    xhr.send(file);
  });
}

const postJson = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);

// `base`: .../record-documents of the record. `paper`: a new paper's kind and name, or the paper a new version is for.
export async function sendRecordFile(
  base: string,
  file: File,
  mime: RecordFileType,
  paper: { kind: string; title: string } | { documentId: string },
  onProgress: (p: SendProgress) => void
): Promise<SendResult> {
  onProgress({ phase: 'sending', percent: 0 });
  const asked = await postJson(`${base}/upload`, { ...paper, fileName: file.name, sizeBytes: file.size, mimeType: mime });
  if (!asked || !asked.ok) return { ok: false, step: 'ask', res: asked };
  const ticket = (await asked.json().catch(() => null)) as RecordUploadTicket | null;
  if (!ticket || typeof ticket.uploadUrl !== 'string' || typeof ticket.pendingId !== 'string') return { ok: false, step: 'ask', res: null };
  const sent = await sendToStore(ticket.uploadUrl, file, ticket.contentType, (percent) => onProgress({ phase: 'sending', percent }));
  // The store's own size limit answers 413, or 400 naming the size.
  if (!sent.ok) return { ok: false, step: 'send', tooLarge: sent.status === 413 };
  onProgress({ phase: 'checking' });
  const confirmed = await postJson(`${base}/confirm`, { pendingId: ticket.pendingId });
  if (!confirmed || !confirmed.ok) return { ok: false, step: 'confirm', res: confirmed };
  const done = (await confirmed.json().catch(() => ({}))) as { documentId?: string; versionNo?: number };
  return { ok: true, documentId: String(done.documentId ?? ''), versionNo: Number(done.versionNo ?? 0) };
}
