'use client';

import { useRef } from 'react';
import type { PendingCounts } from '@/lib/content/career-review';

export type ApproveWords = {
  open: string;
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  careers: string;
  fields: string;
  steps: string;
  actions: string;
  courses: string;
  crosses: string;
  laterals: string;
};

export function ApproveAll({ counts, words }: { counts: PendingCounts; words: ApproveWords }) {
  const ref = useRef<HTMLDialogElement>(null);
  const rows = [
    [words.careers, counts.careers],
    [words.fields, counts.fields],
    [words.steps, counts.steps],
    [words.actions, counts.actions],
    [words.courses, counts.courses],
    [words.crosses, counts.crosses],
    [words.laterals, counts.laterals],
  ] as const;
  return (
    <div className="mt-4 rounded-xl bg-lesson-butter p-3">
      <button type="button" className="min-h-[44px] rounded-lg bg-saffron px-3 text-sm font-extrabold text-ink" onClick={() => ref.current?.showModal()}>{words.open}</button>
      <dialog ref={ref} data-approve-all className="w-[min(24rem,92vw)] rounded-2xl bg-paper p-4 text-ink">
        <h2 className="text-base font-extrabold">{words.title}</h2>
        <p className="mt-1 text-sm">{words.body}</p>
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {rows.map(([label, n]) => (
            <li key={label} className="flex justify-between gap-3"><span>{label}</span><span className="font-extrabold">{n}</span></li>
          ))}
        </ul>
        <form method="post" action="/api/control/content/careers" className="mt-4 flex flex-wrap gap-2">
          <input type="hidden" name="action" value="approve-all" />
          <input type="hidden" name="confirm" value="approve-pending" />
          <button type="submit" className="min-h-[44px] rounded-lg bg-saffron px-3 text-sm font-extrabold text-ink">{words.confirm}</button>
          <button type="button" className="min-h-[44px] rounded-lg bg-white px-3 text-sm font-extrabold text-ink ring-1 ring-slate/30" onClick={() => ref.current?.close()}>{words.cancel}</button>
        </form>
      </dialog>
    </div>
  );
}
