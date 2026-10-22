'use client';

import type { Words } from '@/lib/family/fill';
import { useDataSaver } from '../useDataSaver';

// The data-saver switch (M2-9, C283): per phone, off by default, and its state said in words. A phone that asks to save
// data turns it on until the family chooses.
// `compact` (D1): a small pill under the page header, so the switch is easy to find without taking the screen's best
// space; its state is still said to screen readers.
export function DataSaverSwitch({ w, id = 'fam-data-saver', compact = false }: { w: Words; id?: string; compact?: boolean }) {
  const { state, set } = useDataSaver();
  if (compact) {
    return (
      <div data-data-saver={state.on ? 'on' : 'off'} className="flex items-center gap-2 rounded-full bg-white py-1 pl-3 pr-1 shadow-sm ring-1 ring-slate/10">
        <span id={`${id}-title`} className="text-sm font-bold text-slate">
          {w['fam.dataSaver.title']}
        </span>
        <span id={`${id}-state`} className="sr-only">
          {state.on ? w['fam.dataSaver.on'] : w['fam.dataSaver.off']}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={state.on}
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-state`}
          onClick={() => set(!state.on)}
          className={`relative inline-flex h-11 w-[4.5rem] shrink-0 items-center rounded-full ring-2 transition-colors motion-reduce:transition-none ${state.on ? 'bg-royal ring-royal' : 'bg-white ring-slate'}`}
        >
          <span
            aria-hidden="true"
            className={`absolute h-8 w-8 rounded-full transition-transform motion-reduce:transition-none ${state.on ? 'translate-x-[2.1rem] bg-white' : 'translate-x-1.5 bg-slate'}`}
          />
        </button>
      </div>
    );
  }
  return (
    <div data-data-saver={state.on ? 'on' : 'off'} className="flex items-center justify-between gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate/10">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p id={`${id}-title`} className="text-base font-bold text-slate">
          {w['fam.dataSaver.title']}
        </p>
        <p id={`${id}-state`} className="text-sm text-slate">
          {state.on ? w['fam.dataSaver.on'] : w['fam.dataSaver.off']}
        </p>
        {state.on && state.source === 'phone' && <p className="text-sm text-slate">{w['fam.dataSaver.phone']}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={state.on}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-state`}
        onClick={() => set(!state.on)}
        className={`relative inline-flex h-11 w-[4.5rem] shrink-0 items-center rounded-full ring-2 transition-colors motion-reduce:transition-none ${state.on ? 'bg-royal ring-royal' : 'bg-white ring-slate'}`}
      >
        <span
          aria-hidden="true"
          className={`absolute h-8 w-8 rounded-full transition-transform motion-reduce:transition-none ${state.on ? 'translate-x-[2.1rem] bg-white' : 'translate-x-1.5 bg-slate'}`}
        />
      </button>
    </div>
  );
}
