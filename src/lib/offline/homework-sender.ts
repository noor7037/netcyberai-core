import type { Operation, SendResult } from './outbox';
import type { DeviceStore } from './store';

// How homework completion marked on the phone reaches the server (docs/20
// 5e, C150). The server keeps one answer per student of an assignment, so
// the same submission arriving twice changes nothing, and the later of two
// submissions stands.

export const HOMEWORK_CHECK = 'homework.check';
export type HomeworkCheck = { targetId: string; entries: { studentId: string; done: boolean }[] };
export const HOMEWORK_KEY = 'homework:list';
export const homeworkRosterKey = (targetId: string) => `homework:roster:${targetId}`;

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export async function sendHomeworkCheck(op: Operation, _store: DeviceStore | null, doFetch: Fetch = fetch): Promise<SendResult> {
  const check = op.payload as HomeworkCheck;
  let res: Response;
  try {
    res = await doFetch(`/api/app/homework/targets/${check.targetId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: check.entries }) });
  } catch {
    return { ok: false, kind: 'retry' };
  }
  if (res.status === 401 || res.status === 429 || res.status >= 500) return { ok: false, kind: 'retry' };
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => null)) as { code?: string; rule?: string } | null;
  return { ok: false, kind: 'refused', reason: body?.code ?? body?.rule ?? `http_${res.status}`, detail: { targetId: check.targetId } };
}
