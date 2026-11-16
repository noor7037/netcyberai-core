"use client";

import { EXTRA_KEYS, type ElabExtras, type ExtraKey } from "@/lib/family/elaboration";
import { type Words } from "@/lib/family/fill";

// The creative extras after the five steps (prompt v21): an activity at home, a fun fact, the India link, a memory trick and a
// "what if" question. Plain reading cards: no sound, no buttons, so nothing here competes with the steps' own Listen buttons.
const ICON: Record<ExtraKey, string> = { home: "🏠", fact: "✨", india: "🇮🇳", trick: "🧠", whatif: "🤔" };

export function ElabExtrasView({ extras, w }: { extras: ElabExtras; w: Words }) {
  const rows = EXTRA_KEYS.filter((k) => extras[k]);
  if (rows.length === 0) return null;
  return (
    <section data-elab-extras aria-labelledby="elab-extras-h" className="mt-3 flex flex-col gap-2">
      <h3 id="elab-extras-h" className="text-base font-extrabold text-slate">
        {w["fam.elab.extras"]}
      </h3>
      <ul className="flex flex-col gap-2">
        {rows.map((k) => (
          <li key={k} data-elab-extra={k} className="flex min-h-[44px] gap-3 rounded-2xl bg-lesson-butter p-3 ring-1 ring-slate/10">
            <span aria-hidden="true" className="text-xl leading-none">
              {ICON[k]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-slate">{w[`fam.elab.extra.${k}`]}</p>
              <p className="break-words text-base font-semibold text-slate">{extras[k]}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
