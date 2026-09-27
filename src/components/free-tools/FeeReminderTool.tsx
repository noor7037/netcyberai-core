'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { CopyOutput } from '@/components/free-tools/CopyOutput';
import { feeReminderMessage, type FeeReminderInput } from '@/lib/free-tools/messages';

const START: FeeReminderInput = {
  parentName: '',
  studentName: '',
  className: '',
  feeLabel: 'term fee',
  amount: '',
  dueDate: '',
  schoolName: '',
  paymentNote: '',
  stage: 'gentle',
};

export function FeeReminderTool() {
  const [v, setV] = useState<FeeReminderInput>(START);
  const set = <K extends keyof FeeReminderInput>(k: K, value: FeeReminderInput[K]) => setV((s) => ({ ...s, [k]: value }));
  const out = feeReminderMessage(v);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <form className="flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-6" onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input id="fee-parent" label="Parent’s name" placeholder="Sharma ji" value={v.parentName} onChange={(e) => set('parentName', e.target.value)} />
          <Input id="fee-student" label="Student’s name" value={v.studentName} onChange={(e) => set('studentName', e.target.value)} />
          <Input id="fee-class" label="Class" placeholder="5A" value={v.className} onChange={(e) => set('className', e.target.value)} />
          <Input id="fee-label" label="Which fee" value={v.feeLabel} onChange={(e) => set('feeLabel', e.target.value)} />
          <Input id="fee-amount" label="Amount (₹)" inputMode="numeric" value={v.amount} onChange={(e) => set('amount', e.target.value)} />
          <Input id="fee-due" label="Due date" placeholder="10 October" value={v.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </div>
        <Input id="fee-school" label="School name" value={v.schoolName} onChange={(e) => set('schoolName', e.target.value)} />
        <Input
          id="fee-pay"
          label="How to pay (optional)"
          placeholder="by UPI to school@bank, or at the school office"
          value={v.paymentNote}
          onChange={(e) => set('paymentNote', e.target.value)}
        />
        <Select id="fee-stage" label="Reminder type" value={v.stage} onChange={(e) => set('stage', e.target.value as FeeReminderInput['stage'])}>
          <option value="gentle">Before the due date</option>
          <option value="due-today">On the due date</option>
          <option value="overdue">After the due date</option>
        </Select>
        <p className="rounded-2xl bg-off-white p-4 text-sm text-slate/70">
          Send this to one family at a time. Never post fee reminders in a class group, and never name a child in front of
          other parents.
        </p>
      </form>
      <div className="flex flex-col gap-6">
        <CopyOutput id="fee-out-en" label="English" text={out.english} />
        <CopyOutput id="fee-out-hi" label="Hinglish" text={out.hinglish} />
      </div>
    </div>
  );
}
