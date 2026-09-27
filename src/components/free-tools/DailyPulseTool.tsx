'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { CopyOutput } from '@/components/free-tools/CopyOutput';
import { dailyPulseMessage, type PulseSubject } from '@/lib/free-tools/messages';

const MAX_SUBJECTS = 6;

export function DailyPulseTool() {
  const [student, setStudent] = useState('');
  const [cls, setCls] = useState('');
  const [school, setSchool] = useState('');
  const [subjects, setSubjects] = useState<PulseSubject[]>([{ subject: '', topic: '', question: '' }]);
  const text = dailyPulseMessage({ studentName: student, className: cls, schoolName: school, subjects });

  const update = (i: number, k: keyof PulseSubject, value: string) => setSubjects((list) => list.map((s, n) => (n === i ? { ...s, [k]: value } : s)));

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <form className="flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-6" onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input id="pulse-student" label="Student" value={student} onChange={(e) => setStudent(e.target.value)} />
          <Input id="pulse-class" label="Class" placeholder="5A" value={cls} onChange={(e) => setCls(e.target.value)} />
          <Input id="pulse-school" label="School" value={school} onChange={(e) => setSchool(e.target.value)} />
        </div>
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-sm font-bold text-slate">Today’s subjects</legend>
          {subjects.map((s, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-2xl border border-slate/10 bg-off-white p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input id={`pulse-subj-${i}`} label={`Subject ${i + 1}`} placeholder="Maths" value={s.subject} onChange={(e) => update(i, 'subject', e.target.value)} />
                <Input id={`pulse-topic-${i}`} label="Topic taught" placeholder="Fractions" value={s.topic} onChange={(e) => update(i, 'topic', e.target.value)} />
              </div>
              <Input id={`pulse-q-${i}`} label="One question to ask at home" placeholder="Which is bigger, 3/4 or 5/8?" value={s.question} onChange={(e) => update(i, 'question', e.target.value)} />
              {subjects.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSubjects((list) => list.filter((_, n) => n !== i))}
                  className="self-start text-sm font-semibold text-coral-deep underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
                >
                  {`Remove subject ${i + 1}`}
                </button>
              )}
            </div>
          ))}
          {subjects.length < MAX_SUBJECTS && (
            <button
              type="button"
              onClick={() => setSubjects((list) => [...list, { subject: '', topic: '', question: '' }])}
              className="inline-flex min-h-[44px] w-fit items-center rounded-md border-2 border-royal px-4 text-sm font-semibold text-royal hover:bg-royal/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
            >
              Add another subject
            </button>
          )}
        </fieldset>
      </form>
      <div className="flex flex-col gap-4">
        <CopyOutput id="pulse-out" label="Parent update" text={text} />
        <p className="rounded-2xl bg-off-white p-4 text-sm text-slate/70">
          NetCyberAI is built so this update comes from what teachers mark as taught, goes only to parents who agreed to
          receive it, and each 1, 2 or 3 reply is counted for the class teacher.
        </p>
      </div>
    </div>
  );
}
