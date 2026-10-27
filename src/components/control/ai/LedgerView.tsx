"use client";

import { InfoTip } from "@/components/app-ui/InfoTip";
import { StatusPill } from "@/components/app-ui/StatusPill";
import { groupRequests, summariseByProvider } from "@/lib/ai/ledger-view";
import type { LedgerAttempt } from "@/lib/contracts/ai-gateway";
import {
  CARD,
  INNER,
  SLOT_WORDS,
  duration,
  outcomeTone,
  outcomeWords,
  profileName,
  when,
  type T,
} from "./shared";

// The recent attempts from the usage ledger (G2's control.ai_usage_ledger; G3, C371): per service, counts and
// measured times only; then the latest requests, each as its route was tried, Primary → Backup 1 → Backup 2. Cost is
// "unknown" while no price is set. No question, answer or child's words is in the ledger, so none can be shown.

const SHOWN = 20;

export function LedgerView({ ledger, t }: { ledger: LedgerAttempt[]; t: T }) {
  const groups = groupRequests(ledger);
  const summary = summariseByProvider(ledger);
  const slot = (position: number) =>
    SLOT_WORDS[position]
      ? t(SLOT_WORDS[position])
      : t("control.ai.slot.other", { n: position });
  return (
    <section data-ai-ledger className={CARD}>
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 className="text-lg font-bold">{t("control.ai.ledger.title")}</h2>
        <InfoTip>{t("control.ai.ledger.how")}</InfoTip>
      </div>
      {ledger.length === 0 ? (
        <p data-ai-ledger-empty className="rounded-md bg-slate/5 p-3">
          {t("control.ai.ledger.empty")}
        </p>
      ) : (
        <>
          <p>{t("control.ai.ledger.from", { count: ledger.length })}</p>
          <ul data-ai-ledger-summary className="grid gap-2 md:grid-cols-2">
            {summary.map((s) => (
              <li
                key={s.providerId}
                data-ai-ledger-provider={s.providerId}
                className={INNER}
              >
                <p className="break-all font-bold">{s.providerId}</p>
                <p>
                  {t("control.ai.ledger.counts", {
                    attempts: s.attempts,
                    answered: s.answered,
                    failed: s.failed,
                    skipped: s.skipped,
                  })}
                </p>
                <p>
                  {s.medianMs === null
                    ? t("control.ai.ledger.noTime")
                    : t("control.ai.ledger.median", {
                        time: duration(t, s.medianMs),
                      })}
                </p>
                <p>
                  {t("control.ai.ledger.tokens", {
                    tokensIn: s.tokensIn,
                    tokensOut: s.tokensOut,
                  })}
                </p>
                <p
                  data-ai-ledger-cost={s.costUsd === null ? "unknown" : "known"}
                >
                  {s.costUsd === null
                    ? t("control.ai.ledger.costUnknown")
                    : t("control.ai.ledger.cost", {
                        value: s.costUsd.toFixed(4),
                      })}
                </p>
              </li>
            ))}
          </ul>

          <h3 className="font-bold">{t("control.ai.timeline.title")}</h3>
          <p className="text-slate/80">{t("control.ai.timeline.how")}</p>
          <ol data-ai-timeline className="flex flex-col gap-2">
            {groups.slice(0, SHOWN).map((g) => (
              <li
                key={g.key}
                data-ai-request={g.key}
                data-ai-request-fellback={g.fellBack ? "yes" : "no"}
                className={INNER}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {profileName(t, g.profileId)} · {when(g.at)}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {g.fellBack && (
                      <StatusPill tone="info">
                        {t("control.ai.timeline.fellBack")}
                      </StatusPill>
                    )}
                    <StatusPill tone={outcomeTone(g.outcome)}>
                      {outcomeWords(t, g.outcome)}
                    </StatusPill>
                  </span>
                </div>
                <ol className="flex flex-col gap-1">
                  {g.attempts.map((a, i) => (
                    <li
                      key={a.attemptId}
                      data-ai-attempt={a.position}
                      className="flex flex-wrap items-baseline gap-x-2 break-all"
                    >
                      <span aria-hidden="true">{i === 0 ? "•" : "→"}</span>
                      <span className="font-semibold">{slot(a.position)}:</span>
                      <span>
                        {a.providerId} · {a.model}
                      </span>
                      <span>· {outcomeWords(t, a.outcome)}</span>
                      {a.latencyMs !== null && (
                        <span>· {duration(t, a.latencyMs)}</span>
                      )}
                      {(a.tokensIn > 0 || a.tokensOut > 0) && (
                        <span>
                          ·{" "}
                          {t("control.ai.timeline.tokens", {
                            tokensIn: a.tokensIn,
                            tokensOut: a.tokensOut,
                          })}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
          {groups.length > SHOWN && (
            <p className="text-slate/80">
              {t("control.ai.timeline.more", {
                shown: SHOWN,
                total: groups.length,
              })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
