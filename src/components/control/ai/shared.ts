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

// The visual system (W6-C, C397): one card elevation and radius for the whole screen, tabular figures for numbers,
// 44 px targets, and CSS-only transitions that stop under prefers-reduced-motion.
const MOTION = "transition duration-150 motion-reduce:transition-none";
export const TAP = `min-h-[44px] rounded-lg border border-slate/20 px-4 text-sm font-semibold text-slate hover:bg-slate/5 active:scale-[0.98] disabled:opacity-60 disabled:hover:bg-transparent disabled:active:scale-100 motion-reduce:active:scale-100 ${MOTION}`;
export const PRIMARY = `min-h-[44px] rounded-lg bg-sapphire px-5 text-sm font-semibold text-white hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:hover:brightness-100 disabled:active:scale-100 motion-reduce:active:scale-100 ${MOTION}`;
export const CARD = `flex flex-col gap-3 rounded-2xl border border-slate/10 bg-white p-4 shadow-sm ${MOTION}`;
export const INNER = "flex flex-col gap-2 rounded-xl border border-slate/10 p-3";
// A workload card: the same elevation as CARD, lifting a little on hover.
export const TILE = `flex flex-col gap-3 rounded-2xl border border-slate/10 bg-white p-4 shadow-sm hover:shadow-md ${MOTION}`;
export const NUM = "tabular-nums";

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

// The providers a feature's card offers (C386): only those whose adapters declare everything it needs (the server voice
// only OpenAI and Google Cloud Text-to-Speech; a voice-only provider never for text). A choice Control has no row for
// (the stand-in) is left to the server's own check, which refuses any provider without an adapter of the capability.
export const choicesFor = (
  data: Pick<Data, "providerChoices" | "providers">,
  needs: readonly Capability[],
): string[] =>
  data.providerChoices.filter((c) => {
    const caps = data.providers.find((x) => x.providerId === c)?.capabilities;
    return !caps || needs.every((n) => caps[n]);
  });
