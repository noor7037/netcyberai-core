"use client";

import { useState } from "react";
import { InfoTip } from "@/components/app-ui/InfoTip";
import { Input } from "@/components/ui/Input";
import { priceRows } from "@/lib/ai/prices";
import { CARD, INNER, TAP, when, type Data, type Send, type T } from "./shared";

// Prices (G5, C373): for each provider and model in a route, the ledger or a saved price, what it costs in US dollars
// per million tokens in and out, as the founder reads it on the vendor's price page. From the next attempt on, the
// ledger writes each attempt's cost; the Quality Lab shows its answers' cost at today's price. A model with no price
// keeps "cost unknown": nothing is estimated.

const NUMBER = /^\d{1,4}(\.\d{1,6})?$/;
const ok = (v: string) => NUMBER.test(v.trim()) && Number(v) <= 1000;

export function PriceList({ data, busy, send, t }: { data: Data; busy: boolean; send: Send; t: T }) {
  const rows = priceRows(data);
  const [drafts, setDrafts] = useState<Record<string, { inUsd: string; outUsd: string }>>({});
  const keyOf = (r: { providerId: string; model: string }) => `${r.providerId} ${r.model}`;

  return (
    <section data-ai-prices className={CARD}>
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 className="text-lg font-bold">{t("control.ai.price.title")}</h2>
        <InfoTip>{t("control.ai.price.how")}</InfoTip>
      </div>
      {rows.length === 0 && <p data-ai-prices-empty>{t("control.ai.price.none")}</p>}
      <ul className="grid gap-3 xl:grid-cols-2">
        {rows.map((r) => {
          const k = keyOf(r);
          const d = drafts[k] ?? { inUsd: r.price ? String(r.price.inUsd) : "", outUsd: r.price ? String(r.price.outUsd) : "" };
          const set = (next: Partial<typeof d>) => setDrafts((all) => ({ ...all, [k]: { ...d, ...next } }));
          const id = `price-${k.replace(/[^A-Za-z0-9]/g, "-")}`;
          return (
            <li key={k} data-ai-price={k} className={INNER}>
              <p className="break-all font-bold">{t("control.ai.price.link", { provider: r.providerId, model: r.model })}</p>
              <p data-ai-price-current className="text-slate/80">
                {r.price
                  ? t("control.ai.price.current", {
                      inUsd: r.price.inUsd,
                      outUsd: r.price.outUsd,
                      date: when(r.price.setAt),
                      name: r.price.setByName ?? t("control.ai.someone"),
                    })
                  : t("control.ai.price.notSet")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input id={`${id}-in`} inputMode="decimal" label={t("control.ai.price.in")} value={d.inUsd} onChange={(e) => set({ inUsd: e.target.value })} />
                <Input id={`${id}-out`} inputMode="decimal" label={t("control.ai.price.out")} value={d.outUsd} onChange={(e) => set({ outUsd: e.target.value })} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-ai-price-save
                  className={TAP}
                  disabled={busy || !ok(d.inUsd) || !ok(d.outUsd)}
                  onClick={() =>
                    void send({ action: "price", providerId: r.providerId, model: r.model, inUsd: Number(d.inUsd), outUsd: Number(d.outUsd) }, "control.ai.saved", () =>
                      setDrafts((all) => {
                        const { [k]: _gone, ...rest } = all;
                        return rest;
                      }),
                    )
                  }
                >
                  {t("control.ai.price.save")}
                </button>
                {r.price && (
                  <button
                    type="button"
                    data-ai-price-remove
                    className={TAP}
                    disabled={busy}
                    onClick={() => void send({ action: "price", providerId: r.providerId, model: r.model, price: null }, "control.ai.saved")}
                  >
                    {t("control.ai.price.remove")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
