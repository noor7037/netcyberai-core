"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/Switch";
import type { ModelList, PaidRoute as PaidRouteRow } from "@/lib/ai/control";
import type { Slot } from "@/lib/ai/ledger-view";
import { hasDuplicate, validModel } from "@/lib/ai/model-options";
import { ModelSelect } from "./ModelSelect";
import { PRIMARY, SLOT_WORDS, type Send, type T } from "./shared";

// A text feature's paid route (C504): a second set of slots, Primary and up to two backups, with its own switch. Used
// only for a paying customer, while the month's paid spend is under the limit and every model in it has a price;
// otherwise the feature's own route answers. Saved with one request, checked and audited as any route.

const SLOTS = 3;
const slotsOf = (r: PaidRouteRow | null): Slot[] => {
  const route: Slot[] = r?.providerId ? [{ provider: r.providerId, model: r.model ?? "" }, ...r.fallback] : [];
  return Array.from({ length: SLOTS }, (_, i) => route[i] ?? { provider: "", model: "" });
};

type Props = {
  profileId: string;
  route: PaidRouteRow | null;
  providerChoices: string[];
  modelLists: Record<string, ModelList>;
  // The prices the founder entered, as "provider|model": a paid model with none is never used.
  priced: Set<string>;
  busy: boolean;
  send: Send;
  t: T;
};

export function PaidRoute({ profileId, route, providerChoices, modelLists, priced, busy, send, t }: Props) {
  const [slots, setSlots] = useState<Slot[]>(() => slotsOf(route));
  const [enabled, setEnabled] = useState(route?.enabled === true);
  const used = slots.filter((s) => s.provider);
  const saved = slotsOf(route).filter((s) => s.provider);
  const key = (x: Slot[]) => x.map((s) => `${s.provider}|${s.model.trim()}`).join(",");
  const dirty = key(used) !== key(saved) || enabled !== (route?.enabled === true);
  const duplicate = hasDuplicate(used);
  const noModel = used.some((s) => !validModel(s.model));
  const unpriced = used.filter((s) => s.model.trim() && !priced.has(`${s.provider}|${s.model.trim()}`));
  const valid = !duplicate && !noModel && !(enabled && used.length === 0);

  return (
    <details data-ai-paid-route={profileId} className="rounded-lg border border-sapphire/30">
      <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 px-3 text-sm font-semibold">
        {t("control.ai.paid.route.title")}
        <span data-ai-paid-route-on={route?.enabled ? "on" : "off"} className="font-normal text-slate/80">
          {route?.enabled ? t("control.ai.profile.on") : t("control.ai.profile.off")}
        </span>
      </summary>
      <div className="flex flex-col gap-3 p-3 pt-1">
        <p className="text-xs text-slate/80">{t("control.ai.paid.route.how")}</p>
        {slots.map((s, i) => (
          <div key={i} className="min-w-[17rem]">
            <ModelSelect
              id={`paid-${profileId}-${i}`}
              label={t("control.ai.paid.route.slot", { slot: t(SLOT_WORDS[i]) })}
              value={s}
              providers={providerChoices}
              lists={modelLists}
              taken={slots.filter((_, k) => k !== i)}
              none={t("control.ai.route.slotEmpty")}
              disabled={busy}
              need="text"
              t={t}
              onChange={(slot) => setSlots(slots.map((x, k) => (k === i ? slot : x)))}
            />
          </div>
        ))}
        {duplicate && (
          <p role="alert" className="text-xs font-semibold text-red-800">
            {t("control.ai.slot.duplicate")}
          </p>
        )}
        {noModel && dirty && (
          <p role="alert" className="text-xs font-semibold text-red-800">
            {t("control.ai.slot.needsModel")}
          </p>
        )}
        {unpriced.length > 0 && (
          <p data-ai-paid-unpriced className="text-xs font-semibold text-coral-deep">
            {t("control.ai.paid.route.unpriced", { list: unpriced.map((s) => `${s.provider} · ${s.model.trim()}`).join(", ") })}
          </p>
        )}
        <Switch
          id={`paid-enabled-${profileId}`}
          label={t("control.ai.paid.route.enabled")}
          stateText={enabled ? t("control.ai.profile.on") : t("control.ai.profile.off")}
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <button
          type="button"
          data-ai-paid-route-save
          disabled={busy || !dirty || !valid}
          className={`${PRIMARY} self-start`}
          onClick={() =>
            void send(
              {
                action: "paid_route",
                profileId,
                providerId: used[0]?.provider ?? null,
                model: used[0]?.model.trim() || null,
                fallback: used.slice(1).map((x) => ({ provider: x.provider, model: x.model.trim() })),
                enabled,
              },
              "control.ai.saved",
            )
          }
        >
          {t("control.ai.paid.route.save")}
        </button>
      </div>
    </details>
  );
}
