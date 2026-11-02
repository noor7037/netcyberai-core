"use client";

import { useState } from "react";
import { StatusPill } from "@/components/app-ui/StatusPill";
import type { TryResult } from "@/lib/ai/platform";
import type { MessageKey } from "@/lib/i18n";
import { INNER, TAP, outcomeWords, type T } from "./shared";

// A feature card's "Try it" (W17-B1): one live call of the feature's current route with made-up inputs and no child's
// data (POST /api/control/ai/try), the answer shown in the card. It changes no setting, so it neither asks for the
// authenticator nor reads the page again. The answer lives in this component only; leaving the page drops it.

const REASONS = ["not_switched_on", "not_cleared_for_minors", "not_capable", "failed", "profile", "request"];

// A failure in plain words: a refusal before anything was sent, or the class of the last attempt (the ledger's words).
function failureWords(t: T, failure: string): string {
  if (REASONS.includes(failure)) return t(`control.ai.try.reason.${failure}` as MessageKey);
  return outcomeWords(t, failure);
}

export function TryIt({ profileId, t }: { profileId: string; t: T }) {
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<TryResult | null>(null);

  const run = async () => {
    setBusy(true);
    setGot(null);
    const res = await fetch("/api/control/ai/try", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId }),
    }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as TryResult | null) : null;
    setGot(body && typeof body.ok === "boolean" ? body : { ok: false, provider: null, model: null, ms: 0, backupUsed: false, failure: "request" });
    setBusy(false);
  };

  const out = got?.output;
  return (
    <div data-ai-try-box className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-ai-try={profileId}
          disabled={busy}
          aria-busy={busy}
          className={TAP}
          onClick={() => void run()}
        >
          {busy ? t("control.ai.try.busy") : t("control.ai.try.button")}
        </button>
        <p className="text-xs text-slate/80">{t("control.ai.try.lead")}</p>
      </div>
      {got && (
        <div data-ai-try-result={got.ok ? "ok" : "failed"} role="status" className={INNER}>
          {got.ok && got.provider && (
            <p className="flex flex-wrap items-center gap-2 break-all text-xs font-semibold">
              <span>
                {t("control.ai.try.answeredBy", { provider: got.provider, model: got.model ?? "", ms: got.ms })}
              </span>
              {got.backupUsed && (
                <span data-ai-try-backup>
                  <StatusPill tone="info">{t("control.ai.try.backupUsed")}</StatusPill>
                </span>
              )}
            </p>
          )}
          {!got.ok && (
            <>
              <p data-ai-try-failed className="text-sm font-semibold text-red-800">
                {t("control.ai.try.failed", { reason: failureWords(t, got.failure ?? "failed") })}
              </p>
              {got.provider && (
                <p className="break-all text-xs text-slate/80">
                  {t("control.ai.try.failedAt", { provider: got.provider, model: got.model ?? "", ms: got.ms })}
                </p>
              )}
            </>
          )}
          {out?.kind === "text" && <p data-ai-try-text className="whitespace-pre-wrap break-words">{out.text}</p>}
          {out?.kind === "json" && (
            <pre data-ai-try-json className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate/5 p-2 text-xs">
              {JSON.stringify(out.json, null, 2)}
            </pre>
          )}
          {out?.kind === "audio" &&
            out.clips.map((c) => (
              <figure key={c.language} data-ai-try-audio={c.language} className="flex flex-col gap-1">
                <figcaption className="text-xs">
                  {t("control.ai.try.audio", { language: t(`control.ai.try.lang.${c.language}` as MessageKey) })}
                </figcaption>
                <audio controls src={`data:${c.mediaType};base64,${c.audioBase64}`} className="w-full max-w-sm" />
              </figure>
            ))}
          {out?.kind === "token" && (
            <p data-ai-try-token>
              {t("control.ai.try.token", {
                minutes: Math.max(0, Math.round((Date.parse(out.expiresAt) - Date.now()) / 60_000)),
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
