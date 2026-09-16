import { Card } from '@/components/ui/Card';
import {
  demoFeeStructure,
  demoParent,
  demoPulseMessages,
  demoRecognitionEvents,
  demoStudents,
  demoWeeklyBrief,
  demoComprehensionTiers,
} from '@/demo-fixture/sunrise-public-school';

const exceptionLabel: Record<string, string> = {
  taught: 'Taught',
  delayed: 'Delayed',
  partial: 'Partial',
  not_taught: 'Not taught',
};

export function ParentView() {
  const child = demoStudents.find((s) => s.id === demoParent.childId)!;
  const recognition = demoRecognitionEvents.find((e) => e.studentId === child.id);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <p className="text-sm font-semibold text-sapphire">{child.name}</p>
        <p className="text-xs text-slate/70">Roll no. {child.rollNo} · Attendance {child.attendancePercent}%</p>
        <p className="mt-2 text-xs text-slate/70">
          You can see only your own child’s records — never another family’s.
        </p>
      </Card>

      <div>
        <h2 className="text-lg font-bold text-slate">Fees</h2>
        <Card className="mt-3">
          <ul className="space-y-1 text-sm text-slate">
            {demoFeeStructure.map((head) => (
              <li key={head.head} className="flex justify-between">
                <span>{head.head} ({head.frequency})</span>
                <span>₹{(head.amountPaise / 100).toLocaleString('en-IN')}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 inline-block rounded bg-emerald/15 px-2 py-0.5 text-slate text-sm font-semibold">
            {child.feeBalancePaise === 0 ? 'No balance due' : `₹${(child.feeBalancePaise / 100).toLocaleString('en-IN')} due`}
          </p>
        </Card>
      </div>

      {recognition && (
        <div>
          <h2 className="text-lg font-bold text-slate">Recognition</h2>
          <Card className="mt-3 border-emerald/40 bg-emerald/5">
            <p className="text-sm font-semibold text-slate">Personal Best</p>
            <p className="mt-1 text-sm text-slate">{recognition.note}</p>
          </Card>
        </div>
      )}

      <div>
        <h2 className="text-lg font-bold text-slate">Daily Learning Pulse</h2>
        <p className="mt-1 text-xs text-slate/70">Shown here as WhatsApp would display it.</p>
        <div className="mt-3 flex flex-col gap-4">
          {demoPulseMessages.map((msg) => (
            <div key={msg.date} className="rounded-lg border border-slate/10 bg-white p-4 shadow-sm">
              <p className="inline-block rounded bg-emerald/15 px-2 py-0.5 text-slate text-xs font-semibold">{exceptionLabel[msg.exceptionState]}</p>
              <p className="mt-1 text-sm text-slate">{msg.bodyHinglish}</p>
              {msg.exceptionState === 'taught' && (
                <div className="mt-3 flex flex-col gap-2">
                  {demoComprehensionTiers.map((tier) => (
                    <button
                      key={tier.tier}
                      disabled
                      className="min-h-[44px] w-full cursor-not-allowed rounded-md border border-sapphire/40 px-3 py-2 text-sm font-medium text-sapphire"
                    >
                      {tier.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-slate">Weekly Confidence Brief</h2>
        <div className="mt-3 rounded-lg border border-slate/10 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-sapphire">Week of{' '}
            {new Date(demoWeeklyBrief.weekOf).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <p className="mt-1 text-sm text-slate">{demoWeeklyBrief.bodyHinglish}</p>
        </div>
      </div>
    </div>
  );
}
