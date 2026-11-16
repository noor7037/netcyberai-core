"use client";

import type { Words } from "@/lib/family/fill";
import { FamIcon } from "../FamIcon";
import { useDataSaver } from "../useDataSaver";

// The data-saver switch (M2-9, C283): per phone, off by default, and its state said in words. A phone that asks to save
// data turns it on until the family chooses.
// F2 on D1 (C230-Q): a D1 card with its own drawn mark.
export function DataSaverSwitch({
  w,
  id = "fam-data-saver",
}: {
  w: Words;
  id?: string;
}) {
  const { state, set } = useDataSaver();
  return (
    <div
      data-data-saver={state.on ? "on" : "off"}
      className="fam-card fam-rise flex items-center justify-between gap-3 bg-white p-4"
    >
      <span
        aria-hidden="true"
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${state.on ? "bg-emerald text-white" : "bg-saffron/10 text-ink"}`}
      >
        <FamIcon name="saver" className="h-5 w-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p
          id={`${id}-title`}
          className="bg-white text-base font-bold text-slate"
        >
          {w["fam.dataSaver.title"]}
        </p>
        <p id={`${id}-state`} className="bg-white text-sm text-slate">
          {state.on ? w["fam.dataSaver.on"] : w["fam.dataSaver.off"]}
        </p>
        {state.on && state.source === "phone" && (
          <p className="bg-white text-sm text-slate">
            {w["fam.dataSaver.phone"]}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={state.on}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-state`}
        onClick={() => set(!state.on)}
        // The state is written on the switch itself (On, green; Off, grey), not only in the knob's place.
        className={`relative inline-flex h-11 w-[5.5rem] shrink-0 items-center rounded-full text-sm font-extrabold ring-2 transition-colors motion-reduce:transition-none ${state.on ? "justify-start bg-emerald pl-4 text-white ring-emerald" : "justify-end bg-off-white pr-4 text-slate ring-slate"}`}
      >
        <span data-saver-word aria-hidden="true">
          {state.on ? w["fam.dataSaver.badgeOn"] : w["fam.dataSaver.badgeOff"]}
        </span>
        <span
          aria-hidden="true"
          className={`absolute top-1.5 h-8 w-8 rounded-full shadow-md transition-all motion-reduce:transition-none ${state.on ? "right-1.5 bg-white" : "left-1.5 bg-slate"}`}
        />
      </button>
    </div>
  );
}
