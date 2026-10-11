import type { Operation, SendResult } from './outbox';
import type { DeviceStore } from './store';

// How an attendance submission made on the phone reaches the server
// (docs/20 §4, C144). The operation's own id goes with it on every try, so
// the server applies it once however often it arrives.

export const ATTENDANCE_MARK = 'attendance.mark';
export type MarkStatus = 'present' | 'absent' | 'late' | 'leave';
export type AttendanceMark = {
  classId: string;
  entries: { studentId: string; status: MarkStatus; leaveCode?: string | null }[];
  secondsToMark: number | null;
};
// A mark the server already had, and differently: the first saved one stays.
export type Difference = { studentId: string; attendanceId: string; saved: MarkStatus; yours: MarkStatus };
// What the phone keeps of a class for the day: names and roll numbers, no more.
export type KeptRosterRow = {
  student_id: string;
  name: string;
  admission_no: string;
  roll_no: string | null;
  consent_pending: boolean;
  attendance_id: string | null;
  status: MarkStatus | null;
  leave_code: string | null;
  editable_without_note: boolean;
  locked: boolean;
};
export type KeptRoster = { date: string; roster: KeptRosterRow[] };

export const rosterKey = (classId: string) => `attendance:roster:${classId}`;
export const differencesKey = (classId: string, date: string) => `attendance:differences:${classId}:${date}`;
export const CLASSES_KEY = 'attendance:classes';

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export async function sendAttendanceMark(op: Operation, store: DeviceStore | null, doFetch: Fetch = fetch): Promise<SendResult> {
  const mark = op.payload as AttendanceMark;
  let res: Response;
  try {
    res = await doFetch('/api/app/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId: mark.classId, entries: mark.entries, secondsToMark: mark.secondsToMark, operationId: op.id, forDate: op.forDate }),
    });
  } catch {
    return { ok: false, kind: 'retry' }; // no network: it waits
  }
  // The session ended, or the server is unwell: it stays on the phone and is
  // sent after the next sign-in by the same person, or when the server answers.
  if (res.status === 401 || res.status === 429 || res.status >= 500) return { ok: false, kind: 'retry' };
  const body = (await res.json().catch(() => null)) as { code?: string; rule?: string; differences?: Difference[]; alreadyMarked?: string[] } | null;
  if (!res.ok) return { ok: false, kind: 'refused', reason: body?.code ?? body?.rule ?? `http_${res.status}`, detail: { classId: mark.classId } };

  if (store) {
    // The kept list now shows these marks as saved, so with the network gone
    // again the class does not look unmarked.
    const kept = await store.get<KeptRoster>(rosterKey(mark.classId)).catch(() => undefined);
    if (kept && kept.date === op.forDate) {
      const already = new Set(body?.alreadyMarked ?? []);
      const sent = new Map(mark.entries.filter((e) => !already.has(e.studentId)).map((e) => [e.studentId, e]));
      await store.put(rosterKey(mark.classId), { ...kept, roster: kept.roster.map((r) => (sent.has(r.student_id) && !r.status ? { ...r, status: sent.get(r.student_id)!.status, leave_code: sent.get(r.student_id)!.leaveCode ?? null } : r)) }).catch(() => undefined);
    }
    if (body?.differences?.length) {
      const key = differencesKey(mark.classId, op.forDate);
      const before = (await store.get<Difference[]>(key).catch(() => undefined)) ?? [];
      const seen = new Set(body.differences.map((d) => d.studentId));
      await store.put(key, [...before.filter((d) => !seen.has(d.studentId)), ...body.differences]).catch(() => undefined);
    }
  }
  return { ok: true };
}
