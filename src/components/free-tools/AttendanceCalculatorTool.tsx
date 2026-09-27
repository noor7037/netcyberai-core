'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { calculateAttendance } from '@/lib/free-tools/attendance';

export function AttendanceCalculatorTool() {
  const [attended, setAttended] = useState('');
  const [total, setTotal] = useState('');
  const [target, setTarget] = useState('75');
  const filled = attended !== '' && total !== '' && target !== '';
  const r = filled ? calculateAttendance({ attended: Number(attended), total: Number(total), targetPercent: Number(target) }) : null;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <form className="flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-6" onSubmit={(e) => e.preventDefault()}>
        <Input id="att-attended" label="Days attended" type="number" inputMode="numeric" min={0} value={attended} onChange={(e) => setAttended(e.target.value)} />
        <Input id="att-total" label="Working days so far" type="number" inputMode="numeric" min={1} value={total} onChange={(e) => setTotal(e.target.value)} />
        <Input
          id="att-target"
          label="Target attendance (%)"
          type="number"
          inputMode="decimal"
          min={1}
          max={99}
          helperText="75 is common; check your board’s current rule."
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
      </form>
      <div aria-live="polite" className="flex flex-col gap-4">
        {!r && <p className="rounded-3xl border border-dashed border-slate/20 p-6 text-slate/70">Enter the days attended and working days to see the result.</p>}
        {r && !r.ok && <p role="alert" className="rounded-3xl border border-red-600 bg-white p-6 font-semibold text-red-800">{r.error}</p>}
        {r && r.ok && (
          <>
            <div className="rounded-3xl bg-sapphire p-6 text-white">
              <p className="text-sm font-semibold opacity-80">Current attendance</p>
              <p className="text-5xl font-extrabold">{`${r.currentPercent}%`}</p>
              <p className="mt-1 text-sm opacity-90">{r.meetsTarget ? `At or above the ${target}% target.` : `Below the ${target}% target.`}</p>
            </div>
            {r.meetsTarget ? (
              <div className="rounded-3xl border border-slate/10 bg-white p-6">
                <p className="text-sm font-semibold text-slate/70">Days that can still be missed</p>
                <p className="text-4xl font-extrabold text-emerald">{r.canMiss}</p>
                <p className="mt-1 text-sm text-slate/70">Missing more than this in a row, with no present days in between, takes the student below the target.</p>
              </div>
            ) : (
              <div className="rounded-3xl border border-slate/10 bg-white p-6">
                <p className="text-sm font-semibold text-slate/70">Days to attend in a row to reach the target</p>
                <p className="text-4xl font-extrabold text-tangerine-deep">{r.daysNeeded}</p>
                <p className="mt-1 text-sm text-slate/70">This assumes every one of those working days is attended.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
