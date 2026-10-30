"use client";

import { Switch } from "@/components/ui/Switch";
import { CARD, type Send, type T } from "./shared";

// Testing mode (W8-AI): the founder's one switch for the testing phase, at the top of Control → AI. On, it says so in
// a warning card (amber bar, the words, never the colour alone); off, a quiet card. The route behind it is the
// founder's only (super_admin with the authenticator, src/lib/ai/control-guard.ts), like every save on this screen.
export function TestingModeBanner({ on, busy, send, t }: { on: boolean; busy: boolean; send: Send; t: T }) {
  return (
    <section
      data-ai-testing-mode={on ? "on" : "off"}
      className={`${CARD} border-l-4 ${on ? "border-l-amber bg-sunshine/15" : "border-l-slate/30"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-lg font-bold">{t("control.ai.testing.title")}</h2>
          <p role={on ? "alert" : undefined} className={on ? "font-semibold text-slate" : "text-slate/80"}>
            {on ? t("control.ai.testing.onText") : t("control.ai.testing.offText")}
          </p>
        </div>
        <Switch
          id="ai-testing-mode"
          data-ai-testing-switch=""
          label={t("control.ai.testing.switch")}
          stateText={on ? t("control.ai.testing.stateOn") : t("control.ai.testing.stateOff")}
          checked={on}
          disabled={busy}
          onChange={() => send({ action: "testing_mode", on: !on }, on ? "control.ai.testing.savedOff" : "control.ai.testing.savedOn")}
        />
      </div>
    </section>
  );
}
