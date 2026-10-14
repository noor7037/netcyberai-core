'use client';

import { useEffect, useId, useRef } from 'react';
import { CUSTOM, NEXT_STEPS, REMARK_MAX, STRENGTHS, firstName, percentProblem, type RemarkStudent } from '@/lib/free-tools/remarks';
import { btn, btnQuiet } from './ReportActions';

export const inputCls =
  'min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';
const areaCls =
  'w-full rounded-md border border-slate/20 bg-white px-3 py-2 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';
const labelCls = 'text-sm font-medium text-slate';
const btnRemove = `${btn} border border-slate/20 bg-white text-red-800 hover:bg-off-white`;

// One student: the inputs on one side and the editable draft on the
// other, stacked on a phone. "Draft again" replaces any edit with the
// next wording from the phrase bank.
export function RemarksBuilderStudent({
  s,
  index,
  remark,
  edited,
  focusName,
  onChange,
  onEdit,
  onDraftAgain,
  onRemove,
}: {
  s: RemarkStudent;
  index: number;
  remark: string;
  edited: boolean;
  focusName: boolean;
  onChange: (patch: Partial<RemarkStudent>) => void;
  onEdit: (text: string) => void;
  onDraftAgain: () => void;
  onRemove: () => void;
}) {
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusName) nameRef.current?.focus();
  }, [focusName]);
  const who = firstName(s.name) || `student ${index + 1}`;
  const percent = (key: 'overall' | 'attendance', label: string) => {
    const problem = percentProblem(s[key]);
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-${key}`} className={labelCls}>
          {label}
        </label>
        <input
          id={`${id}-${key}`}
          inputMode="decimal"
          maxLength={8}
          className={inputCls}
          value={s[key]}
          aria-invalid={Boolean(problem)}
          aria-describedby={problem ? `${id}-${key}-err` : undefined}
          onChange={(ev) => onChange({ [key]: ev.target.value } as Partial<RemarkStudent>)}
        />
        {problem && (
          <p id={`${id}-${key}-err`} className="text-xs font-semibold text-red-800">
            {problem}
          </p>
        )}
      </div>
    );
  };
  const choice = (key: 'strength' | 'nextStep', textKey: 'strengthText' | 'nextStepText', label: string, sets: typeof STRENGTHS, ownLabel: string, ownHelp: string) => (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <label htmlFor={`${id}-${key}`} className={labelCls}>
        {label}
      </label>
      <select id={`${id}-${key}`} className={inputCls} value={s[key]} onChange={(ev) => onChange({ [key]: ev.target.value } as Partial<RemarkStudent>)}>
        <option value="">None</option>
        {sets.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
        <option value={CUSTOM}>Other (type your own)</option>
      </select>
      {s[key] === CUSTOM && (
        <>
          <label htmlFor={`${id}-${textKey}`} className={labelCls}>
            {ownLabel}
          </label>
          <input
            id={`${id}-${textKey}`}
            className={inputCls}
            maxLength={REMARK_MAX.custom}
            value={s[textKey]}
            aria-describedby={`${id}-${textKey}-help`}
            onChange={(ev) => onChange({ [textKey]: ev.target.value } as Partial<RemarkStudent>)}
          />
          <p id={`${id}-${textKey}-help`} className="text-xs text-slate/70">
            {ownHelp}
          </p>
        </>
      )}
    </div>
  );

  return (
    <li className="grid grid-cols-1 gap-4 rounded-2xl border border-slate/10 bg-white p-4 lg:grid-cols-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={`${id}-name`} className={labelCls}>
            Student’s name
          </label>
          <input id={`${id}-name`} ref={nameRef} className={inputCls} maxLength={REMARK_MAX.name} autoComplete="off" value={s.name} onChange={(ev) => onChange({ name: ev.target.value })} />
        </div>
        {percent('overall', 'Overall %')}
        {percent('attendance', 'Attendance %')}
        {choice('strength', 'strengthText', 'One strength', STRENGTHS, 'The strength, in your words', 'A short phrase, such as “careful science diagrams”.')}
        {choice('nextStep', 'nextStepText', 'One next step', NEXT_STEPS, 'The next step, in your words', 'A short phrase, such as “learning new spellings each week”.')}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-remark`} className={labelCls}>
          Remark for {who} {edited ? '(edited by you)' : '(draft)'}
        </label>
        <textarea
          id={`${id}-remark`}
          rows={6}
          maxLength={REMARK_MAX.remark}
          className={areaCls}
          value={remark}
          placeholder={s.name.trim() ? '' : 'Type the student’s name to draft a remark.'}
          onChange={(ev) => onEdit(ev.target.value)}
        />
        {edited && <p className="text-xs text-slate/70">Your edit is kept. Draft again replaces it with new wording.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnQuiet} disabled={!s.name.trim()} onClick={onDraftAgain}>
            Draft again<span className="sr-only"> for {who}</span>
          </button>
          <button type="button" className={btnRemove} onClick={onRemove}>
            Remove<span className="sr-only"> {who}</span>
          </button>
        </div>
      </div>
    </li>
  );
}
