'use client';

import { useState } from 'react';
import type { Words } from '@/lib/family/fill';
import { fill } from '@/lib/family/fill';
import type { TechSettings } from '@/lib/family/tech/settings';
import { classWord } from '@/lib/family/tech/words';

const CLASSES = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// The parent's choices for one child's Tech & AI Lab (C557): the class the course is shown for (the child's own by
// default) and the topic areas on. An area switched off is hidden from the child; nothing is deleted.
export function TechParentSettings({ w, lang, childId, name, childClass, initial, strands, passed, labs }: { w: Words; lang: 'en' | 'hi'; childId: string; name: string; childClass: number; initial: TechSettings; strands: { id: string; e: string; name: string }[]; passed: number; labs: number }) {
  const [courseClass, setCourseClass] = useState<number | null>(initial.courseClass);
  const [off, setOff] = useState<string[]>(initial.strandsOff);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const onCount = strands.filter((s) => !off.includes(s.id)).length;
  const save = async () => {
    setState('saving');
    const res = await fetch('/api/family/tech/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ childId, courseClass, strandsOff: off }) }).catch(() => null);
    setState(res?.ok ? 'saved' : 'failed');
  };
  return (
    <div className="flex flex-col gap-4" data-tech-parent>
      <p className="text-base font-semibold text-slate">{fill(w['fam.tech.parent.progress'], { d: passed, l: labs })}</p>
      <label className="flex flex-col gap-2 text-base font-semibold text-slate">
        {w['fam.tech.parent.class']}
        <select className="fam-row bg-white" value={courseClass == null ? '' : String(courseClass)} onChange={(event) => { setState('idle'); setCourseClass(event.target.value === '' ? null : Number(event.target.value)); }}>
          <option value="">{`${fill(w['fam.tech.parent.ownClass'], { name })} (${classWord(lang, childClass)})`}</option>
          {CLASSES.map((c) => <option key={c} value={String(c)}>{classWord(lang, c)}</option>)}
        </select>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-base font-bold text-slate">{w['fam.tech.parent.areas']}</legend>
        <p className="text-sm text-slate">{fill(w['fam.tech.parent.areasHelp'], { name })}</p>
        {strands.map((s) => {
          const on = !off.includes(s.id);
          return (
            <label key={s.id} className="fam-row justify-between bg-white text-base font-semibold text-slate">
              <span>{`${s.e} ${s.name}`}</span>
              <input
                type="checkbox"
                className="h-6 w-6"
                checked={on}
                disabled={on && onCount <= 1}
                onChange={() => { setState('idle'); setOff((current) => (on ? [...current, s.id] : current.filter((id) => id !== s.id))); }}
              />
            </label>
          );
        })}
        {onCount <= 1 && <p className="text-sm text-slate">{w['fam.tech.parent.keepOne']}</p>}
      </fieldset>
      <button type="button" className="fam-press flex min-h-[48px] w-full items-center justify-center gap-1 rounded-full bg-emerald px-3 text-base font-bold text-white disabled:opacity-60" disabled={state === 'saving'} onClick={() => void save()} data-tech-parent-save>
        {state === 'saving' ? w['fam.tech.parent.saving'] : w['fam.tech.parent.save']}
      </button>
      {state === 'saved' && <p role="status" className="text-base font-semibold text-slate">{fill(w['fam.tech.parent.saved'], { name })}</p>}
      {state === 'failed' && <p role="alert" className="text-base font-semibold text-slate">{w['fam.tech.parent.failed']}</p>}
    </div>
  );
}
