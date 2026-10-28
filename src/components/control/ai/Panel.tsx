"use client";

import { useId, useState, type ReactNode } from "react";
import { InfoTip } from "@/components/app-ui/InfoTip";
import { CARD } from "./shared";

// A section of the right-hand column (W6-C, C397): always open on a laptop (1280 px and up, by CSS alone), a folded
// section with a 44 px header below that. `marker` is the section's data attribute (data-ai-prices, and so on).
export function Panel({ title, how, marker, children }: { title: string; how?: string; marker: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const body = useId();
  return (
    <section {...{ [marker]: "" }} className={CARD}>
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 className="hidden text-lg font-bold xl:block">{title}</h2>
        <h2 className="min-w-0 flex-1 xl:hidden">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={body}
            onClick={() => setOpen(!open)}
            className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left text-lg font-bold"
          >
            <span>{title}</span>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-5 w-5 shrink-0 text-slate/70 transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}>
              <path d="M6 8l4 4 4-4" />
            </svg>
          </button>
        </h2>
        {how && <InfoTip>{how}</InfoTip>}
      </div>
      <div id={body} className={`flex flex-col gap-3 ${open ? "" : "hidden xl:flex"}`}>
        {children}
      </div>
    </section>
  );
}
