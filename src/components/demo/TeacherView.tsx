'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { demoClassName, demoStudents, demoTeacher } from '@/demo-fixture/sunrise-public-school';

type AttendanceMark = 'present' | 'absent' | 'late';

const nextMark: Record<AttendanceMark, AttendanceMark> = {
  present: 'absent',
  absent: 'late',
  late: 'present',
};

// Uses only the five locked design tokens (colors.ts) — no ad-hoc colors.
const markStyle: Record<AttendanceMark, string> = {
  present: 'bg-emerald text-slate',
  absent: 'bg-slate text-off-white',
  late: 'bg-amber text-slate',
};

const markLabel: Record<AttendanceMark, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
};

type SyllabusState = 'taught' | 'delayed' | 'partial' | 'not_taught';

const syllabusOptions: { id: SyllabusState; label: string }[] = [
  { id: 'taught', label: 'Taught' },
  { id: 'delayed', label: 'Delayed' },
  { id: 'partial', label: 'Partial' },
  { id: 'not_taught', label: 'Not taught' },
];

export function TeacherView() {
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>(() =>
    Object.fromEntries(demoStudents.map((s) => [s.id, 'present' as AttendanceMark]))
  );
  const [syllabusState, setSyllabusState] = useState<SyllabusState>('taught');
  const [confirmed, setConfirmed] = useState(false);

  function toggleMark(studentId: string) {
    setMarks((prev) => ({ ...prev, [studentId]: nextMark[prev[studentId]] }));
    setConfirmed(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <p className="text-sm font-semibold text-sapphire">{demoTeacher.name}</p>
        <p className="text-xs text-slate/70">{demoTeacher.role}</p>
      </Card>

      <div>
        <h2 className="text-lg font-bold text-slate">Today’s topic — {demoTeacher.subject}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {syllabusOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSyllabusState(opt.id)}
              className={`min-h-[44px] rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                syllabusState === opt.id
                  ? 'bg-sapphire text-off-white'
                  : 'bg-white text-slate border border-slate/20'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate">Attendance — {demoClassName}</h2>
          <span className="text-xs text-slate/70">Tap a name to cycle status</span>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {demoStudents.map((student) => {
            const mark = marks[student.id];
            return (
              <button
                key={student.id}
                onClick={() => toggleMark(student.id)}
                className="flex min-h-[44px] items-center justify-between rounded-md border border-slate/10 bg-white px-4 py-2 text-left"
              >
                <span className="text-sm font-medium text-slate">
                  {student.rollNo}. {student.name}
                </span>
                <span className={`rounded px-3 py-1 text-xs font-semibold ${markStyle[mark]}`}>
                  {markLabel[mark]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => setConfirmed(true)}
        className="min-h-[44px] rounded-md bg-sapphire px-6 py-3 text-base font-semibold text-off-white"
      >
        Mark attendance
      </button>
      {confirmed && (
        <p className="border-l-4 border-emerald pl-3 text-sm text-slate" role="status">
          Demo only — this was not sent or stored anywhere, and it resets when you reload the page.
        </p>
      )}
    </div>
  );
}
