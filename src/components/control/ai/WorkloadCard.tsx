"use client";

import { useEffect, useRef, useState } from "react";
import { StatusPill } from "@/components/app-ui/StatusPill";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import type { ModelList } from "@/lib/ai/control";
import { promote, type Slot } from "@/lib/ai/ledger-view";
import { hasDuplicate, validModel } from "@/lib/ai/model-options";
import type { ProviderStateResult } from "@/lib/ai/provider-state";
import type { RouteRevision } from "@/lib/contracts/ai-gateway";
import { isMessageKey, type MessageKey } from "@/lib/i18n";
import { ModelSelect } from "./ModelSelect";
import {
  CAPABILITY_WORDS,
  PRIMARY,
  SLOT_WORDS,
  STATE_TONE,
  TAP,
  TILE,
  profileName,
  stateWords,
  when,
  type Data,
  type Send,
  type T,
} from "./shared";

// One feature's route (G3, C371; the brief's §4.4; a dashboard card since W6-C, C397): Primary, Backup 1 and Backup 2
// (the server refuses a third backup), each one drop-down of "provider · model", with the service's state. "Make
// Primary" and "Roll back" are each one request and one server transaction (a profile save, or a rollback to a
// revision); rolling back asks first. The prompt version and the switch sit in a folded part of the card.

type Profile = Data["profiles"][number];
type Draft = { slots: Slot[]; promptVersion: string; enabled: boolean };
const SLOTS = 3;

const routeOf = (p: {
  providerId: string | null;
  model: string | null;
  fallback: Slot[];
}): Slot[] =>
  p.providerId
    ? [
        { provider: p.providerId, model: p.model ?? "" },
        ...p.fallback.map((f) => ({ provider: f.provider, model: f.model })),
      ]
    : [];
export const draftOf = (p: Profile): Draft => {
  const route = routeOf(p);
  return {
    slots: Array.from(
      { length: SLOTS },
      (_, i) => route[i] ?? { provider: "", model: "" },
    ),
    promptVersion: p.promptVersion,
    enabled: p.enabled,
  };
};

const ACTIVATION: Record<RouteRevision["activation"], MessageKey> = {
  baseline: "control.ai.revision.baseline",
  set: "control.ai.revision.set",
  undo: "control.ai.revision.undo",
  rollback: "control.ai.revision.rollback",
};

type Props = {
  profile: Profile;
  revisions: RouteRevision[];
  providerChoices: string[];
  // G6 (C379): each provider's model ids for the picker.
  modelLists: Record<string, ModelList>;
  states: Record<string, ProviderStateResult>;
  busy: boolean;
  send: Send;
  t: T;
  draft: Draft;
  setDraft: (d: Draft) => void;
};

export function WorkloadCard({
  profile: p,
  revisions,
  providerChoices,
  modelLists,
  states,
  busy,
  send,
  t,
  draft: d,
  setDraft,
}: Props) {
  // The rollback waiting for the founder's yes: null (the previous revision) or a revision id.
  const [confirm, setConfirm] = useState<{ revisionId: string | null } | null>(
    null,
  );
  // Keyboard focus (G5, C373): the question takes focus when it opens, so a keyboard or screen-reader user lands on
  // it; "No" gives focus back to the button that asked.
  const confirmRef = useRef<HTMLDivElement>(null);
  const askedFrom = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (confirm) confirmRef.current?.focus();
  }, [confirm]);
  const ask = (revisionId: string | null, from: HTMLElement) => {
    askedFrom.current = from;
    setConfirm({ revisionId });
  };
  const route = routeOf(p);
  const active = revisions.find((r) => r.active) ?? null;
  // The revision "Roll back" restores: the newest one before the active one.
  const previous =
    revisions.find(
      (r) =>
        !r.active &&
        (active === null || Number(r.revisionId) < Number(active.revisionId)),
    ) ?? null;
  const about = `control.ai.profile.about.${p.profileId}`;
  const chain = (r: {
    providerId: string | null;
    model: string | null;
    fallback: Slot[];
  }) => {
    const slots = routeOf(r);
    return slots.length
      ? slots
          .map((s, i) =>
            t("control.ai.route.link", {
              slot: t(SLOT_WORDS[i]),
              provider: s.provider,
              model: s.model,
            }),
          )
          .join(" → ")
      : t("control.ai.route.none");
  };
  // `base`: the draft for a save; the saved route's own prompt version and switch for "Make Primary".
  const save = (
    slots: Slot[],
    how: MessageKey,
    base: { promptVersion: string; enabled: boolean } = d,
  ) => {
    const filled = slots.filter((s) => s.provider);
    void send(
      {
        action: "profile",
        profileId: p.profileId,
        providerId: filled[0]?.provider ?? null,
        model: filled[0]?.model.trim() || null,
        promptVersion: base.promptVersion.trim(),
        enabled: base.enabled,
        fallback: filled
          .slice(1)
          .map((s) => ({ provider: s.provider, model: s.model.trim() })),
      },
      how,
    );
  };
  // The draft's filled slots, in order (an empty slot between two filled ones is closed up on save).
  const used = d.slots.filter((s) => s.provider);
  const key = (x: Slot[]) => x.map((s) => `${s.provider}|${s.model.trim()}`).join(",");
  const dirty =
    key(used) !== key(route) ||
    d.promptVersion.trim() !== p.promptVersion ||
    d.enabled !== p.enabled;
  const duplicate = hasDuplicate(used);
  const valid = used.every((s) => validModel(s.model)) && !duplicate;
  const setSlot = (i: number, slot: Slot) =>
    setDraft({ ...d, slots: d.slots.map((x, k) => (k === i ? slot : x)) });

  return (
    <article data-ai-profile={p.profileId} className={TILE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold">{profileName(t, p.profileId)}</h3>
        <div className="flex flex-wrap gap-2">
          {p.carriesChildWords && (
            <span data-ai-child-words>
              <StatusPill tone="ai">
                {t("control.ai.profile.childWordsMark")}
              </StatusPill>
            </span>
          )}
          <span data-ai-profile-on={p.enabled ? "on" : "off"}>
            <StatusPill tone={p.enabled ? "success" : "neutral"}>
              {p.enabled
                ? t("control.ai.profile.on")
                : t("control.ai.profile.off")}
            </StatusPill>
          </span>
        </div>
      </div>
      {isMessageKey(about) && (
        <p data-ai-profile-about className="text-xs text-slate/80">
          {t(about)}
        </p>
      )}
      {p.carriesChildWords && (
        <p className="text-xs text-slate/80">{t("control.ai.profile.childWords")}</p>
      )}
      {p.needs.length > 0 && (
        <p data-ai-profile-needs className="text-xs text-slate/80">
          {t("control.ai.profile.needs", {
            list: p.needs.map((k) => t(CAPABILITY_WORDS[k])).join(", "),
          })}
        </p>
      )}

      {/* The route: three slots, each one drop-down of "provider · model", with the service's state. */}
      <div data-ai-route-edit className="flex flex-col gap-3 pt-2">
        {d.slots.map((s, i) => {
          const saved = route[i];
          const st = s.provider ? states[s.provider] : undefined;
          return (
            <div
              key={i}
              {...(saved ? { "data-ai-slot": i } : { "data-ai-slot-empty": i })}
              className="flex flex-wrap items-start gap-x-3 gap-y-2"
            >
              <div className="min-w-[17rem] flex-1">
                <ModelSelect
                  id={`slot-${p.profileId}-${i}`}
                  label={t(SLOT_WORDS[i])}
                  value={s}
                  providers={providerChoices}
                  lists={modelLists}
                  taken={d.slots.filter((_, k) => k !== i)}
                  none={t("control.ai.route.slotEmpty")}
                  disabled={busy}
                  t={t}
                  onChange={(slot) => setSlot(i, slot)}
                />
              </div>
              <span className="flex min-h-[48px] items-center gap-2">
                {st && (
                  <StatusPill tone={STATE_TONE[st.state]}>
                    {t(stateWords(st.state))}
                  </StatusPill>
                )}
                {i > 0 && saved && (
                  <button
                    type="button"
                    data-ai-promote={i}
                    disabled={busy || dirty}
                    className={TAP}
                    onClick={() =>
                      save(promote(route, i), "control.ai.promoted", p)
                    }
                  >
                    {t("control.ai.route.promote")}
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {duplicate && (
        <p data-ai-duplicate role="alert" className="text-xs font-semibold text-red-800">
          {t("control.ai.slot.duplicate")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-ai-profile-save
          disabled={busy || !dirty || !valid}
          className={PRIMARY}
          onClick={() => save(d.slots, "control.ai.saved")}
        >
          {t("control.ai.profile.save")}
        </button>
        <button
          type="button"
          data-ai-rollback-previous
          disabled={busy || !previous}
          className={TAP}
          onClick={(e) => ask(null, e.currentTarget)}
        >
          {t("control.ai.route.rollback")}
        </button>
      </div>

      {/* The switch and the prompt version, saved with the route. */}
      <details data-ai-settings className="rounded-lg border border-slate/10">
        <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-sm font-semibold">
          {t("control.ai.card.settings")}
        </summary>
        <div className="flex flex-col gap-3 p-3 pt-2">
          {p.usesPrompt && (
            <Input
              id={`prompt-${p.profileId}`}
              maxLength={32}
              spellCheck={false}
              label={t("control.ai.profile.promptVersion")}
              value={d.promptVersion}
              onChange={(e) =>
                setDraft({ ...d, promptVersion: e.target.value })
              }
            />
          )}
          <Switch
            id={`enabled-${p.profileId}`}
            label={t("control.ai.profile.enabled")}
            stateText={
              d.enabled
                ? t("control.ai.profile.on")
                : t("control.ai.profile.off")
            }
            checked={d.enabled}
            onChange={(e) => setDraft({ ...d, enabled: e.target.checked })}
          />
        </div>
      </details>

      {/* Earlier versions of the route, newest first, with "Go back". */}
      <details data-ai-revisions className="rounded-lg border border-slate/10">
        <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-sm font-semibold">
          {t("control.ai.revision.title", { count: revisions.length })}
        </summary>
        <div className="flex flex-col gap-2 p-3 pt-1">
          {revisions.length === 0 ? (
            <p data-ai-revisions-empty>{t("control.ai.revision.none")}</p>
          ) : (
            <>
              {!previous && (
                <p data-ai-revisions-no-earlier>
                  {t("control.ai.revision.noEarlier")}
                </p>
              )}
              <ul className="flex flex-col gap-2">
                {revisions.map((r) => (
                  <li
                    key={r.revisionId}
                    data-ai-revision={r.revisionId}
                    className="flex flex-col gap-1 rounded-lg bg-slate/5 p-2"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">
                        {t("control.ai.revision.line", {
                          id: r.revisionId,
                          how: t(ACTIVATION[r.activation]),
                          date: when(r.activatedAt),
                          name: r.activatedByName ?? t("control.ai.someone"),
                        })}
                      </span>
                      {r.active && (
                        <StatusPill tone="success">
                          {t("control.ai.revision.active")}
                        </StatusPill>
                      )}
                    </span>
                    <span className="break-all">{chain(r)}</span>
                    <span className="text-slate/80">
                      {t(
                        r.enabled
                          ? "control.ai.revision.wasOn"
                          : "control.ai.revision.wasOff",
                        { prompt: r.promptVersion },
                      )}
                    </span>
                    {!r.active && (
                      <button
                        type="button"
                        data-ai-rollback={r.revisionId}
                        disabled={busy}
                        className={`${TAP} self-start`}
                        onClick={(e) => ask(r.revisionId, e.currentTarget)}
                      >
                        {t("control.ai.revision.backTo", { id: r.revisionId })}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </details>

      {confirm && (
        <div
          data-ai-rollback-confirm
          ref={confirmRef}
          tabIndex={-1}
          role="group"
          aria-labelledby={`confirm-${p.profileId}`}
          className="flex flex-col gap-2 rounded-lg border border-tangerine/40 bg-tangerine/10 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-sapphire"
        >
          <p id={`confirm-${p.profileId}`} className="font-semibold">
            {(() => {
              const target = confirm.revisionId
                ? revisions.find((r) => r.revisionId === confirm.revisionId)
                : previous;
              return t("control.ai.revision.confirm", {
                id: target?.revisionId ?? "",
                route: target ? chain(target) : "",
              });
            })()}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-ai-rollback-yes
              disabled={busy}
              className={PRIMARY}
              onClick={() => {
                const revisionId = confirm.revisionId;
                setConfirm(null);
                void send(
                  {
                    action: "rollback",
                    profileId: p.profileId,
                    ...(revisionId ? { revisionId } : {}),
                  },
                  "control.ai.rolledBack",
                );
              }}
            >
              {t("control.ai.revision.confirmYes")}
            </button>
            <button
              type="button"
              data-ai-rollback-no
              className={TAP}
              onClick={() => {
                setConfirm(null);
                askedFrom.current?.focus();
              }}
            >
              {t("control.ai.revision.confirmNo")}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
