import type { StatusTone } from "@/components/app-ui/tones";
import type { AiOverview, AiRouting } from "@/lib/ai/control";
import type { Capability, TermsNote } from "@/lib/ai/adapters/types";
import type { ProviderState } from "@/lib/ai/provider-state";
import { isMessageKey, type MessageKey } from "@/lib/i18n";

// Control → AI's parts share these (G3, C371): the page's data, the styles, and the words for each code.

export type Data = AiOverview & {
  providerChoices: string[];
  routing: AiRouting;
};
// Sends one change to /api/control/ai and reads the page again; `done` is the words shown when it worked.
export type Send = (
  payload: Record<string, unknown>,
  done: MessageKey,
  after?: () => void,
) => Promise<void>;
export type T = (
  key: MessageKey,
  params?: Record<string, string | number>,
) => string;

export const TAP =
  "min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60";
export const PRIMARY =
  "min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60";
export const CARD =
  "flex flex-col gap-3 rounded-xl border border-slate/10 bg-white p-4";
export const INNER =
  "flex flex-col gap-2 rounded-md border border-slate/10 p-3";

// What the vendor's terms say for a product children use (C368): advice beside the switch, never a block.
export const TERMS_NOTE: Record<TermsNote, MessageKey> = {
  minors_with_safeguards:
    "control.ai.provider.termsNote.minors_with_safeguards",
  no_under_13: "control.ai.provider.termsNote.no_under_13",
  adults_only: "control.ai.provider.termsNote.adults_only",
  no_bar_found: "control.ai.provider.termsNote.no_bar_found",
};

// What an adapter declares it can do (G1, C369), in the founder's words.
export const CAPABILITY_WORDS: Record<Capability, MessageKey> = {
  text: "control.ai.capability.text",
  vision: "control.ai.capability.vision",
  stream: "control.ai.capability.stream",
  json: "control.ai.capability.json",
  stt: "control.ai.capability.stt",
  tts: "control.ai.capability.tts",
};

// A provider's state (src/lib/ai/provider-state.ts): its colour only repeats the words.
export const STATE_TONE: Record<ProviderState, StatusTone> = {
  disabled: "neutral",
  not_configured: "neutral",
  circuit_open: "alert",
  quota: "warning",
  degraded: "warning",
  healthy: "success",
  test_failed: "alert",
  tested: "info",
  saved: "info",
  no_key_needed: "neutral",
};
export const stateWords = (s: ProviderState): MessageKey =>
  `control.ai.state.${s}` as MessageKey;
export const stateWhy = (s: ProviderState): MessageKey =>
  `control.ai.state.why.${s}` as MessageKey;

// An attempt's outcome class (gateway/taxonomy.ts), in plain words; an unknown class is shown as its code.
export const outcomeWords = (t: T, outcome: string) => {
  const key = `control.ai.outcome.${outcome}`;
  return isMessageKey(key) ? t(key) : outcome;
};
export const outcomeTone = (outcome: string): StatusTone =>
  outcome === "ok"
    ? "success"
    : outcome === "content_rejected"
      ? "info"
      : outcome.startsWith("skipped_")
        ? "neutral"
        : outcome === "rate_limited" || outcome === "quota_exhausted"
          ? "warning"
          : "alert";

export const profileName = (t: T, profileId: string) => {
  const key = `control.ai.profile.name.${profileId}`;
  return isMessageKey(key) ? t(key) : profileId;
};

// Route slots by position: Primary, Backup 1, Backup 2.
export const SLOT_WORDS: MessageKey[] = [
  "control.ai.slot.primary",
  "control.ai.slot.backup1",
  "control.ai.slot.backup2",
];

export const day = (v: string | null) =>
  v
    ? new Date(v).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      })
    : "";
export const when = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Kolkata",
      })
    : "";
// A measured time: milliseconds under a second, else seconds to one decimal.
export const duration = (t: T, ms: number) =>
  ms < 1000
    ? t("control.ai.time.ms", { value: ms })
    : t("control.ai.time.seconds", { value: (ms / 1000).toFixed(1) });
