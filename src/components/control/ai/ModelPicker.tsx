"use client";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { ModelList } from "@/lib/ai/control";
import type { MessageKey } from "@/lib/i18n";

// The model picker (G6, C379): the provider's own model ids as a list to choose from, with free typing kept beside it
// (a model the list does not have, or a service with no list). The list is the one Control keeps from the provider's
// latest key test or health probe; when that fetch failed it says so, and never guesses ids. Whatever is typed is still
// held to the same model rule by the server.

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

const when = (v: string) =>
  new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function ModelPicker({
  id,
  label,
  provider,
  value,
  onChange,
  list,
  disabled,
  t,
}: {
  id: string;
  label: string;
  provider: string;
  value: string;
  onChange: (model: string) => void;
  list: ModelList | undefined;
  disabled?: boolean;
  t: T;
}) {
  const models = list?.ok ? list.models : [];
  const state = !provider ? "none" : !list ? "not_loaded" : !list.ok ? "unavailable" : models.length ? "ready" : "empty";
  return (
    <div className="flex min-w-0 flex-col gap-2" data-model-picker={state}>
      {state === "ready" && (
        <Select
          id={`${id}-list`}
          label={t("control.ai.models.choose", { provider })}
          value={models.includes(value) ? value : ""}
          disabled={disabled}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        >
          <option value="">{t("control.ai.models.pick")}</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      )}
      <Input id={id} maxLength={80} spellCheck={false} autoComplete="off" label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      {state !== "none" && (
        <p className="text-xs text-slate/80" data-model-list-note>
          {state === "ready"
            ? t("control.ai.models.ready", { count: models.length, date: when(list!.fetchedAt) })
            : state === "unavailable"
              ? t("control.ai.models.unavailable")
              : state === "empty"
                ? t("control.ai.models.empty")
                : t("control.ai.models.notLoaded")}
        </p>
      )}
    </div>
  );
}
