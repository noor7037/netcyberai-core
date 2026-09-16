import { Card } from '@/components/ui/Card';
import {
  demoClassName,
  demoCertificateRequests,
  demoStudents,
  demoTeacherImpact,
  demoRecognitionEvents,
  demoForm6Advisory,
} from '@/demo-fixture/sunrise-public-school';

const stageLabel: Record<string, string> = {
  applied: 'Applied',
  finance_clearance: 'Finance clearance',
  remarks: 'Remarks',
  principal_signed: 'Awaiting your signature',
  delivered: 'Delivered',
};

export function PrincipalView() {
  const attendanceExceptions = demoStudents.filter((s) => s.attendancePercent < 75).length;
  const overdueCount = demoStudents.filter((s) => s.feeStatus === 'overdue').length;
  const pendingSignature = demoCertificateRequests.filter((c) => c.stage === 'finance_clearance' || c.stage === 'principal_signed');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-bold text-slate">What needs your decision today</h2>
        <div className="mt-3 flex flex-col gap-3">
          <Card className="border-amber/40 bg-amber/5">
            <p className="text-sm text-slate">
              <span className="font-semibold text-slate">{attendanceExceptions} student{attendanceExceptions === 1 ? '' : 's'}</span> in{' '}
              {demoClassName} crossed the attendance threshold this week.
            </p>
          </Card>
          <Card className="border-amber/40 bg-amber/5">
            <p className="text-sm text-slate">
              <span className="font-semibold text-slate">{overdueCount} fee balance{overdueCount === 1 ? '' : 's'}</span> overdue past D+7 — ready for a follow-up call.
            </p>
          </Card>
          {pendingSignature.map((req) => (
            <Card key={req.id}>
              <p className="text-sm text-slate">
                <span className="font-semibold text-sapphire">{req.certType}</span> for {req.studentName} —{' '}
                {stageLabel[req.stage]}.
              </p>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-slate">Recognition this fortnight</h2>
        <div className="mt-3 flex flex-col gap-3">
          {demoRecognitionEvents.map((event) => (
            <Card key={event.studentId}>
              <p className="text-sm text-slate">
                <span className="rounded bg-emerald/15 px-1.5 font-semibold text-slate">Personal Best</span> — {event.studentName}: {event.note}
              </p>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-slate">Teacher Impact Card (principal-only view)</h2>
        <Card className="mt-3">
          <p className="text-sm font-semibold text-sapphire">{demoTeacherImpact.teacherName} — {demoTeacherImpact.subject}</p>
          <ul className="mt-2 space-y-1 text-sm text-slate">
            <li>Class attendance average: {demoTeacherImpact.classAvgAttendance}%</li>
            <li>Syllabus completion: {demoTeacherImpact.syllabusCompletionPercent}%</li>
            <li>Parent feedback: {demoTeacherImpact.parentFeedbackOutOf5} / 5</li>
          </ul>
          <p className="mt-2 text-xs text-slate/70">Visible only to this teacher and you — never to other teachers.</p>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-bold text-slate">Haryana Form 6 fee advisory</h2>
        <Card className="mt-3 border-amber/40 bg-amber/5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">
            {demoForm6Advisory.cpiConfigured ? 'Within advisory range' : 'CPI not configured'}
          </p>
          <p className="mt-2 text-sm text-slate">
            Enter this year’s CPI figure and its source to see your proposed fee increase checked
            against the advisory range. Advisory only — never blocking, never legal advice.
          </p>
        </Card>
      </div>
    </div>
  );
}
