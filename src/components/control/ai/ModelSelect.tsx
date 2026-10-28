"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { ModelList } from "@/lib/ai/control";
import { groupsFor, optionValue, otherValue, parseOption, selectedValue, validModel } from "@/lib/ai/model-options";
import type { MessageKey } from "@/lib/i18n";

// The model picker (G6, C379; one drop-down since W6-C, C397): a single "provider · model" select built from the
// fetched model lists, an optgroup per provider. The only free typing is the "Other…" item in a group, for a model
// the list does not have (or a service with no list); what is typed is held to the same model rule as on the server.
// `none`: the words of the "no choice" item (a slot may be left empty); without it the first item is a prompt.

type T = (key: MessageKey, params?: Record<string, string | number>) => string;
export type Choice = { provider: string; model: string };

export function ModelSelect({
  id,
  label,
  value,
  onChange,
  providers,
  lists,
  taken = [],
  none,
  disabled,
  t,
}: {
  id: string;
  label: string;
  value: Choice;
  onChange: (next: Choice) => void;
  providers: string[];
  lists: Record<string, ModelList>;
  // The choices the other slots already hold: offered greyed out, so the same pair cannot be picked twice.
  taken?: Choice[];
  none?: string;
  disabled?: boolean;
  t: T;
}) {
  const [typing, setTyping] = useState(false);
  const groups = groupsFor(providers, lists, [value.provider]);
  const shown = selectedValue(groups, value, typing);
  const other = parseOption(shown)?.model === null;
  const list = lists[value.provider];
  const bad = other && value.model.trim() !== "" && !validModel(value.model);
  const isTaken = (provider: string, model: string) => taken.some((x) => x.provider === provider && x.model.trim() === model);
  const note = other
    ? !list
      ? "control.ai.models.notLoaded"
      : !list.ok
        ? "control.ai.models.unavailable"
        : list.models.length === 0
          ? "control.ai.models.empty"
          : null
    : null;

  return (
    <div className="flex min-w-0 flex-col gap-2" data-model-picker={!value.provider ? "none" : other ? "other" : "list"}>
      <Select
        id={id}
        label={label}
        value={shown}
        disabled={disabled}
        onChange={(e) => {
          const p = parseOption(e.target.value);
          if (!p) {
            setTyping(false);
            return onChange({ provider: "", model: "" });
          }
          if (p.model === null) {
            setTyping(true);
            return onChange({ provider: p.provider, model: p.provider === value.provider ? value.model : "" });
          }
          setTyping(false);
          onChange({ provider: p.provider, model: p.model });
        }}
      >
        <option value="">{none ?? t("control.ai.pick.choose")}</option>
        {groups.map((g) => (
          <optgroup key={g.provider} label={g.provider}>
            {g.models.map((m) => (
              <option key={m} value={optionValue(g.provider, m)} disabled={isTaken(g.provider, m)}>
                {g.provider} · {m}
              </option>
            ))}
            <option value={otherValue(g.provider)}>{t("control.ai.pick.other")}</option>
          </optgroup>
        ))}
      </Select>
      {other && (
        <>
          <Input
            id={`${id}-other`}
            maxLength={80}
            spellCheck={false}
            autoComplete="off"
            label={t("control.ai.pick.otherField", { provider: value.provider })}
            value={value.model}
            disabled={disabled}
            error={bad ? t("control.ai.pick.badModel") : undefined}
            onChange={(e) => onChange({ provider: value.provider, model: e.target.value })}
            onBlur={() => value.model.trim() && setTyping(false)}
          />
          {note && (
            <p className="text-xs text-slate/80" data-model-list-note>
              {t(note as MessageKey)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
