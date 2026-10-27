'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { CHILD_BOARDS, CHILD_CLASSES, type BoardOption } from '@/lib/family/children';
import { STREAMS, STREAM_FROM_CLASS } from '@/lib/family/subjects';
import { classText, type Words } from '@/lib/family/fill';
import { errorWords, familyApi } from './client';

// Add or change a child (M1-2, C248; C263): first name only, the class (Nursery to Class 12), the board, the app's
// language, the explanation style and the state. Class, board and state start empty: the parent chooses them (there
// is no default).
export type ChildFormValue = { firstName: string; classLevel: number | null; board: string; language: 'en' | 'hi'; style: 'en' | 'hi' | 'hinglish'; stateCode: string; stream?: string };

export function ChildForm({
  w,
  states,
  boards,
  initial,
  childId,
  submitLabel,
  onDone,
}: {
  w: Words;
  states: { code: string; name: string }[];
  // The boards Control keeps (content.boards), by id and name; the built-in list only if the page could not read them.
  boards?: BoardOption[];
  initial?: ChildFormValue;
  childId?: string;
  submitLabel: string;
  onDone: () => void;
}) {
  const [v, setV] = useState<ChildFormValue>(initial ?? { firstName: '', classLevel: null, board: '', language: 'hi', style: 'hinglish', stateCode: '' });
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
        requiredText={w['fam.child.required']}
        value={v.firstName}
        onChange={(e) => setV({ ...v, firstName: e.target.value })}
        error={has('first_name') ? w['fam.err.first_name'] : undefined}
      />
      <Select
        id={`${prefix}-class`}
        label={w['fam.child.class']}
        required
        requiredText={w['fam.child.required']}
        value={v.classLevel === null ? '' : String(v.classLevel)}
        onChange={(e) => setV({ ...v, classLevel: e.target.value === '' ? null : Number(e.target.value) })}
        error={has('class') ? w['fam.err.class'] : undefined}
      >
        <option value="" disabled>
          {w['fam.err.class']}
        </option>
        {CHILD_CLASSES.map((n) => (
          <option key={n} value={String(n)}>
            {classText((k) => w[k], n)}
          </option>
        ))}
      </Select>
      <Select id={`${prefix}-board`} label={w['fam.child.board']} required requiredText={w['fam.child.required']} value={v.board} onChange={(e) => setV({ ...v, board: e.target.value })} error={has('board') ? w['fam.err.board'] : undefined}>
        <option value="" disabled>
          {w['fam.child.boardPick']}
        </option>
        {(boards && boards.length ? boards : CHILD_BOARDS.map((b) => ({ boardId: b, name: '' }))).map((b) => (
          // Board abbreviations are names, the same in every language; a board added in Control has its stored name.
          <option key={b.boardId} value={b.boardId} lang={b.boardId === 'STATE' || b.boardId === 'CAIE' ? undefined : 'en'}>
            {w[`fam.board.${b.boardId}`] || b.name || b.boardId}
          </option>
        ))}
      </Select>
      {v.classLevel !== null && v.classLevel >= STREAM_FROM_CLASS && (
        <Select
          id={`${prefix}-stream`}
          label={w['fam.child.stream']}
          helperText={w['fam.child.streamHelp']}
          value={v.stream ?? ''}
          onChange={(e) => setV({ ...v, stream: e.target.value })}
          error={has('stream') ? w['fam.err.stream'] : undefined}
        >
          <option value="">{w['fam.child.streamPick']}</option>
          {STREAMS.map((x) => (
            <option key={x} value={x}>
              {w[`fam.stream.${x}`]}
            </option>
          ))}
        </Select>
      )}
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
      <Select id={`${prefix}-state`} label={w['fam.child.state']} required requiredText={w['fam.child.required']} value={v.stateCode} onChange={(e) => setV({ ...v, stateCode: e.target.value })} error={has('state') ? w['fam.err.state'] : undefined}>
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
