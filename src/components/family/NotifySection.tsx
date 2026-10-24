'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/Switch';
import type { Words } from '@/lib/family/fill';
import { familyApi } from './client';

// What the app tells the parent about (M3-8a, C338): the school's new homework, notices and results, and tonight's
// practice and plan. An off kind is not counted as new on the home, and is never pushed.
const KINDS = ['homework', 'notices', 'results', 'tonight'] as const;

export function NotifySection({ w, off }: { w: Words; off: readonly string[] }) {
  const [state, setState] = useState<Record<string, boolean>>(Object.fromEntries(KINDS.map((k) => [k, !off.includes(k)])));
  const [error, setError] = useState('');
  const flip = async (kind: (typeof KINDS)[number], on: boolean) => {
    setError('');
    setState((s) => ({ ...s, [kind]: on }));
    const r = await familyApi('/api/family/notify', 'POST', { kind, on });
    if (!r.ok) {
      setState((s) => ({ ...s, [kind]: !on }));
      setError(w['fam.school.saveError']);
    }
  };
  return (
    <section data-notify-section className="fam-card fam-rise flex flex-col gap-2 bg-white p-4 sm:p-5">
      <h2 className="text-lg font-extrabold text-slate">{w['fam.notify.title']}</h2>
      <p className="text-sm text-slate">{w['fam.notify.lead']}</p>
      {KINDS.map((k) => (
        <Switch
          key={k}
          id={`fam-notify-${k}`}
          label={w[`fam.notify.${k}`]}
          stateText={state[k] ? w['fam.notify.on'] : w['fam.notify.off']}
          checked={state[k]}
          onChange={(e) => void flip(k, e.target.checked)}
        />
      ))}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
