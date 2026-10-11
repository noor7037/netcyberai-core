'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import type { AttendanceStatus } from '@/lib/attendance/attendance';

// Mirrors src/lib/attendance/attendance.ts's FREE_EDIT_WINDOW_MINUTES for
// display only -- that module pulls in the `pg` driver (server-only) and
// must never be imported at runtime from a client component.
const FREE_EDIT_WINDOW_MINUTES_DISPLAY = 10;

type ClassOption = { class_id: string; name: string };
type RosterRow = {
  student_id: string;
  name: string;
  admission_no: string;
  attendance_id: string | null;
  status: AttendanceStatus | null;
  editable_without_note: boolean;
  locked: boolean;
};

const STATUS_VARIANT: Record<AttendanceStatus, 'success' | 'danger' | 'warning'> = {
  present: 'success',
  absent: 'danger',
  late: 'warning',
};

// 04_SYSTEM_DESIGN_PRD.md Sec3.2's primary capture mode: everyone
// defaults to present, the teacher taps only the exceptions. This is
// the pre-submit local state for students not yet marked today --
// once submitted, every further change is a correction (PATCH), not
// part of this draft.
export function AttendanceView({ canManage, initialClassId }: { canManage: boolean; initialClassId?: string }) {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState(initialClassId ?? '');
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [correctTarget, setCorrectTarget] = useState<{ row: RosterRow; status: AttendanceStatus } | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch('/api/app/classes')
      .then((r) => r.json())
      .then((body) => setClasses(body.classes ?? []));
  }, []);

  async function loadRoster(id: string) {
    setLoading(true);
    const res = await fetch(`/api/app/attendance?classId=${id}`);
    const body = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast.show(body.error ?? 'could not load roster', 'danger');
      return;
    }
    setRoster(body.roster);
    const nextDraft: Record<string, AttendanceStatus> = {};
    for (const row of body.roster as RosterRow[]) {
      if (!row.attendance_id) nextDraft[row.student_id] = 'present';
    }
    setDraft(nextDraft);
  }

  useEffect(() => {
    if (classId) loadRoster(classId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const unmarked = roster.filter((r) => !r.attendance_id);

  async function handleSubmit() {
    const entries = unmarked.map((r) => ({ studentId: r.student_id, status: draft[r.student_id] ?? 'present' }));
    const res = await fetch('/api/app/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId, entries }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.show(body.error ?? 'could not submit attendance', 'danger');
      return;
    }
    toast.show(`Attendance submitted for ${entries.length} student(s)`, 'success');
    loadRoster(classId);
  }

  async function handleCorrect(row: RosterRow, status: AttendanceStatus, note?: string) {
    const res = await fetch(`/api/app/attendance/${row.attendance_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (body.noteRequired) {
        setCorrectTarget({ row, status }); // fall through to the note modal below
        return;
      }
      toast.show(body.error ?? 'could not correct attendance', 'danger');
      return;
    }
    toast.show('Attendance corrected', 'success');
    setCorrectTarget(null);
    loadRoster(classId);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="max-w-xs">
        <Select
          id="attendance-class"
          label="Class"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          <option value="">Select a class…</option>
          {classes.map((c) => (
            <option key={c.class_id} value={c.class_id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {loading && <p className="text-sm text-slate/70">Loading…</p>}

      {!loading && classId && roster.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {roster.map((row) => {
              const isUnmarked = !row.attendance_id;
              const current = isUnmarked ? draft[row.student_id] ?? 'present' : row.status!;
              return (
                <li key={row.student_id} className="flex items-center justify-between rounded-md border border-slate/10 p-3 text-sm">
                  <div>
                    <p className="font-semibold text-slate">{row.name}</p>
                    <p className="text-xs text-slate/70">{row.admission_no}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[current]}>{current}</Badge>
                    {canManage && isUnmarked && (
                      <div className="flex gap-1">
                        {(['present', 'absent', 'late'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setDraft((d) => ({ ...d, [row.student_id]: s }))}
                            className={`min-h-[44px] rounded-md border px-3 text-xs font-semibold ${
                              current === s ? 'border-sapphire bg-sapphire/10 text-sapphire' : 'border-slate/10 text-slate hover:bg-slate/5'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                    {canManage && !isUnmarked && row.locked && (
                      <span className="text-xs text-slate/70">Locked (past date)</span>
                    )}
                    {canManage && !isUnmarked && !row.locked && (
                      <div className="flex gap-1">
                        {(['present', 'absent', 'late'] as const)
                          .filter((s) => s !== current)
                          .map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => handleCorrect(row, s)}
                              className="min-h-[44px] rounded-md border border-slate/10 px-3 text-xs font-semibold text-slate hover:bg-slate/5"
                            >
                              → {s}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {canManage && unmarked.length > 0 && (
            <button
              type="button"
              onClick={handleSubmit}
              className="min-h-[44px] self-start rounded-md bg-sapphire px-6 text-sm font-semibold text-white hover:bg-sapphire/90"
            >
              Submit attendance ({unmarked.length} student{unmarked.length === 1 ? '' : 's'})
            </button>
          )}
        </>
      )}

      {!loading && classId && roster.length === 0 && <p className="text-sm text-slate/70">No active students in this class.</p>}

      <Modal open={correctTarget !== null} onClose={() => setCorrectTarget(null)} title="Correction note required">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const note = new FormData(e.currentTarget).get('note');
            if (correctTarget && typeof note === 'string') {
              handleCorrect(correctTarget.row, correctTarget.status, note);
            }
          }}
          className="flex flex-col gap-3"
        >
          <p className="text-sm text-slate/70">
            More than {FREE_EDIT_WINDOW_MINUTES_DISPLAY} minutes have passed since this was marked — a note is
            required to change it to <strong>{correctTarget?.status}</strong>.
          </p>
          <Input id="note" name="note" label="Reason for correction" required />
          <button type="submit" className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
            Save correction
          </button>
        </form>
      </Modal>
    </section>
  );
}
