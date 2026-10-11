import type { Operation, SendResult } from './outbox';
import type { DeviceStore } from './store';

// How a "taught today" tap made on the phone reaches the server (docs/20 5d,
// C147). The server keeps one row per class, subject and day, so the same
// tap arriving twice changes nothing; two taps for one lesson are sent in
// order and the later one stands.

export const TAUGHT_MARK = 'syllabus.mark';
export type TaughtStatus = 'taught' | 'partial' | 'delayed' | 'not_taught';
export type TaughtMark = { classId: string; subjectId: string; topic: string; status: TaughtStatus; unitId: string | null; note: string | null; teacherId?: string };
export const TAUGHT_KEY = 'syllabus:today';

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export async function sendTaughtMark(op: Operation, _store: DeviceStore | null, doFetch: Fetch = fetch): Promise<SendResult> {
  const mark = op.payload as TaughtMark;
  let res: Response;
  try {
    res = await doFetch('/api/app/syllabus', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...mark, date: op.forDate }) });
  } catch {
    return { ok: false, kind: 'retry' };
  }
  if (res.status === 401 || res.status === 429 || res.status >= 500) return { ok: false, kind: 'retry' };
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => null)) as { code?: string; rule?: string; error?: string } | null;
  // A lesson recorded more than a week late, or for a class that is no longer theirs: it stays visible.
  return { ok: false, kind: 'refused', reason: body?.code ?? body?.rule ?? (res.status === 400 ? 'not_accepted' : `http_${res.status}`), detail: { classId: mark.classId, subjectId: mark.subjectId, topic: mark.topic } };
}
