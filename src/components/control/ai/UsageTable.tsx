"use client";

import { InfoTip } from "@/components/app-ui/InfoTip";
import type { Counts } from "@/lib/ai/control";
import { splitUsage, totals } from "@/lib/ai/usage-view";
import { CARD, NUM, profileName, type Data, type T } from "./shared";

// Use (W6-C, C397): one compact table in place of a paragraph for each workload. A workload with no use today and none
// this month collapses into one line; the counts are the server's (control.ai_usage), and the day's cost is the one
// total the ledger keeps (the use counts carry no price, so no cost is shown per workload).

const n = (v: number) => v.toLocaleString("en-IN");
const TH = "px-2 py-2 text-right font-semibold";
const TD = `px-2 py-2 text-right ${NUM}`;

function Cells({ c }: { c: Counts }) {
  return (
    <>
      <td className={TD}>{n(c.requests)}</td>
      <td className={TD}>{n(c.failures)}</td>
      <td className={TD}>{n(c.capRefusals)}</td>
    </>
  );
}

export function UsageTable({ data, t }: { data: Data; t: T }) {
  const { active, idle } = splitUsage(data.usage);
  const sum = totals(data.usage);
  return (
    <section data-ai-usage className={CARD}>
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 className="text-lg font-bold">{t("control.ai.usage.title")}</h2>
        <InfoTip>{t("control.ai.usage.how")}</InfoTip>
      </div>
      {active.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr>
                <th rowSpan={2} className="px-2 py-2 text-left font-semibold align-bottom">{t("control.ai.usage.col.workload")}</th>
                <th colSpan={3} className="border-b border-slate/15 px-2 py-1 text-center font-semibold">{t("control.ai.usage.today")}</th>
                <th colSpan={3} className="border-b border-slate/15 px-2 py-1 text-center font-semibold">{t("control.ai.usage.month")}</th>
              </tr>
              <tr className="border-b border-slate/20 text-xs text-slate/80">
                {[0, 1].map((k) => (
                  <HeadCells key={k} t={t} />
                ))}
              </tr>
            </thead>
            <tbody>
              {active.map((u) => (
                <tr key={u.profileId} data-ai-usage-profile={u.profileId} className="border-b border-slate/10 last:border-0 hover:bg-slate/5">
                  <th scope="row" className="px-2 py-2 text-left font-semibold">{profileName(t, u.profileId)}</th>
                  <Cells c={u.today} />
                  <Cells c={u.month} />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate/20 font-bold">
                <th scope="row" className="px-2 py-2 text-left">{t("control.ai.usage.total")}</th>
                <Cells c={sum.today} />
                <Cells c={sum.month} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p data-ai-usage-cost className={NUM}>
        {t("control.ai.spend.today", { value: data.spentToday.usd.toFixed(2), unpriced: data.spentToday.unpriced })}
      </p>
      {idle.length > 0 && (
        <p data-ai-usage-none className="text-slate/80">
          {active.length === 0 ? t("control.ai.usage.none") : t("control.ai.usage.noneNames", { names: idle.map((u) => profileName(t, u.profileId)).join(", ") })}
        </p>
      )}
    </section>
  );
}

function HeadCells({ t }: { t: T }) {
  return (
    <>
      <th className={TH}>{t("control.ai.usage.col.requests")}</th>
      <th className={TH}>{t("control.ai.usage.col.failed")}</th>
      <th className={TH}>{t("control.ai.usage.col.stopped")}</th>
    </>
  );
}
