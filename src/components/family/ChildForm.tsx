'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import type { Words } from '@/lib/family/fill';
import { errorWords, familyApi } from './client';

// Add or change a child (M1-2, C248): first name only, class 6–10, CBSE, the app's language, the explanation style and
// the state. The state starts empty: the parent chooses it (there is no default).
export type ChildFormValue = { firstName: string; classLevel: number; language: 'en' | 'hi'; style: 'en' | 'hi' | 'hinglish'; stateCode: string };

export function ChildForm({
  w,
  states,
  initial,
  childId,
  submitLabel,
  onDone,
}: {
  w: Words;
  states: { code: string; name: string }[];
  initial?: ChildFormValue;
  childId?: string;
  submitLabel: string;
  onDone: () => void;
}) {
  const [v, setV] = useState<ChildFormValue>(initial ?? { firstName: '', classLevel: 0, language: 'hi', style: 'hinglish', stateCode: '' });
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const has = (p: string) => problems.includes(p);
  const prefix = childId ? `fam-child-${childId.slice(0, 8)}` : 'fam-child-new';

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const r = childId ? await familyApi(`/api/family/children/${childId}`, 'PATCH', v) : await familyApi('/api/family/children', 'POST', v);
        setBusy(false);
        if (r.ok) return onDone();
        setProblems(Array.isArray(r.data.problems) ? (r.data.problems as string[]) : []);
        if (r.error !== 'invalid') setError(errorWords(w, r.error));
      }}
    >
      <Input
        id={`${prefix}-name`}
        label={w['fam.child.firstName']}
        helperText={w['fam.child.firstNameHelp']}
        autoComplete="off"
        maxLength={30}
        required
        value={v.firstName}
        onChange={(e) => setV({ ...v, firstName: e.target.value })}
        error={has('first_name') ? w['fam.err.first_name'] : undefined}
      />
      <SegmentedControl
        id={`${prefix}-class`}
        label={w['fam.child.class']}
        value={String(v.classLevel)}
        options={[6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: String(n) }))}
        onChange={(c) => setV({ ...v, classLevel: Number(c) })}
      />
      {has('class') && <p className="-mt-3 text-sm font-semibold text-red-800">{w['fam.err.class']}</p>}
      <p className="-mt-2 rounded-xl bg-slate/5 px-3 py-2 text-sm text-slate">{w['fam.child.board']}</p>
      <SegmentedControl
        id={`${prefix}-language`}
        label={w['fam.child.language']}
        value={v.language}
        options={[
          { value: 'en', label: w['fam.lang.en'] },
          { value: 'hi', label: w['fam.lang.hi'] },
        ]}
        onChange={(language) => setV({ ...v, language })}
      />
      <SegmentedControl
        id={`${prefix}-style`}
        label={w['fam.child.style']}
        value={v.style}
        options={[
          { value: 'en', label: w['fam.style.en'] },
          { value: 'hi', label: w['fam.style.hi'] },
          { value: 'hinglish', label: w['fam.style.hinglish'] },
        ]}
        onChange={(style) => setV({ ...v, style })}
      />
      <Select id={`${prefix}-state`} label={w['fam.child.state']} required value={v.stateCode} onChange={(e) => setV({ ...v, stateCode: e.target.value })} error={has('state') ? w['fam.err.state'] : undefined}>
        <option value="" disabled>
          {w['fam.child.statePick']}
        </option>
        {states.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </Select>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
