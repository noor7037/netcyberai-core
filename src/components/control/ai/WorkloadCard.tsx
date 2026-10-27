"use client";

import { useState } from "react";
import { StatusPill } from "@/components/app-ui/StatusPill";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { promote, type Slot } from "@/lib/ai/ledger-view";
import type { ProviderStateResult } from "@/lib/ai/provider-state";
import type { RouteRevision } from "@/lib/contracts/ai-gateway";
import { isMessageKey, type MessageKey } from "@/lib/i18n";
import {
  CAPABILITY_WORDS,
  INNER,
  PRIMARY,
  SLOT_WORDS,
  STATE_TONE,
  TAP,
  profileName,
  stateWords,
  when,
  type Data,
  type Send,
  type T,
} from "./shared";

// One feature's route (G3, C371; the brief's §4.4): Primary, Backup 1 and Backup 2 (the server refuses a third backup),
// the prompt version and the switch. "Make Primary" and "Go back" are each one request and one server transaction
// (a profile save, or a rollback to a revision); going back asks first.

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
  const route = routeOf(p);
  const active = revisions.find((r) => r.active) ?? null;
  // The revision "Go back one step" restores: the newest one before the active one.
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
    const used = slots.filter((s) => s.provider);
    void send(
      {
        action: "profile",
        profileId: p.profileId,
        providerId: used[0]?.provider ?? null,
        model: used[0]?.model.trim() || null,
        promptVersion: base.promptVersion.trim(),
        enabled: base.enabled,
        fallback: used
          .slice(1)
          .map((s) => ({ provider: s.provider, model: s.model.trim() })),
      },
      how,
    );
  };
  const options = (
    <>
      <option value="">{t("control.ai.profile.none")}</option>
      {providerChoices.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </>
  );

  return (
    <article data-ai-profile={p.profileId} className={INNER}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{profileName(t, p.profileId)}</h3>
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
      {isMessageKey(about) && <p data-ai-profile-about>{t(about)}</p>}
      {p.carriesChildWords && (
        <p className="text-slate/80">{t("control.ai.profile.childWords")}</p>
      )}
      {p.needs.length > 0 && (
        <p data-ai-profile-needs className="text-slate/80">
          {t("control.ai.profile.needs", {
            list: p.needs.map((k) => t(CAPABILITY_WORDS[k])).join(", "),
          })}
        </p>
      )}

      {/* The route that runs now, slot by slot, with each service's state. */}
      <h4 className="font-semibold">{t("control.ai.route.now")}</h4>
      {route.length === 0 ? (
        <p data-ai-route-empty className="rounded-md bg-slate/5 p-2">
          {t("control.ai.route.empty")}
        </p>
      ) : (
        <ol data-ai-route className="flex flex-col gap-2">
          {route.map((s, i) => {
            const st = states[s.provider];
            return (
              <li
                key={`${i}-${s.provider}`}
                data-ai-slot={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate/5 p-2"
              >
                <span className="min-w-0 break-all">
                  <span className="font-semibold">{t(SLOT_WORDS[i])}:</span>{" "}
                  {s.provider} · {s.model}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {st && (
                    <StatusPill tone={STATE_TONE[st.state]}>
                      {t(stateWords(st.state))}
                    </StatusPill>
                  )}
                  {i > 0 && (
                    <button
                      type="button"
                      data-ai-promote={i}
                      disabled={busy}
                      className={TAP}
                      onClick={() =>
                        save(promote(route, i), "control.ai.promoted", p)
                      }
                    >
                      {t("control.ai.route.promote")}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
          {route.length < SLOTS &&
            Array.from({ length: SLOTS - route.length }, (_, k) => (
              <li
                key={`empty-${k}`}
                data-ai-slot-empty={route.length + k}
                className="rounded-md border border-dashed border-slate/20 p-2 text-slate/80"
              >
                <span className="font-semibold">
                  {t(SLOT_WORDS[route.length + k])}:
                </span>{" "}
                {t("control.ai.route.slotEmpty")}
              </li>
            ))}
        </ol>
      )}

      {/* Change the route: the three slots, the prompt version and the switch, saved together. */}
      <details data-ai-route-edit className="rounded-md border border-slate/10">
        <summary className="flex min-h-[44px] cursor-pointer items-center px-3 font-semibold">
          {t("control.ai.route.change")}
        </summary>
        <div className="flex flex-col gap-3 p-3 pt-0">
          <div className="grid gap-3 sm:grid-cols-2">
            {d.slots.map((s, i) => (
              <div key={i} className="contents">
                <Select
                  id={`slot-${p.profileId}-${i}`}
                  label={t("control.ai.slot.service", {
                    slot: t(SLOT_WORDS[i]),
                  })}
                  value={s.provider}
                  onChange={(e) =>
                    setDraft({
                      ...d,
                      slots: d.slots.map((x, k) =>
                        k === i ? { ...x, provider: e.target.value } : x,
                      ),
                    })
                  }
                >
                  {options}
                </Select>
                <Input
                  id={`slot-model-${p.profileId}-${i}`}
                  maxLength={80}
                  spellCheck={false}
                  label={t("control.ai.slot.model", { slot: t(SLOT_WORDS[i]) })}
                  value={s.model}
                  onChange={(e) =>
                    setDraft({
                      ...d,
                      slots: d.slots.map((x, k) =>
                        k === i ? { ...x, model: e.target.value } : x,
                      ),
                    })
                  }
                />
              </div>
            ))}
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
          </div>
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
          <button
            type="button"
            data-ai-profile-save
            disabled={busy}
            className={`${PRIMARY} self-start`}
            onClick={() => save(d.slots, "control.ai.saved")}
          >
            {t("control.ai.profile.save")}
          </button>
        </div>
      </details>

      {/* Earlier versions of the route, newest first, with "Go back". */}
      <details data-ai-revisions className="rounded-md border border-slate/10">
        <summary className="flex min-h-[44px] cursor-pointer items-center px-3 font-semibold">
          {t("control.ai.revision.title", { count: revisions.length })}
        </summary>
        <div className="flex flex-col gap-2 p-3 pt-0">
          {revisions.length === 0 ? (
            <p data-ai-revisions-empty>{t("control.ai.revision.none")}</p>
          ) : (
            <>
              {previous ? (
                <button
                  type="button"
                  data-ai-rollback-previous
                  disabled={busy}
                  className={`${TAP} self-start`}
                  onClick={() => setConfirm({ revisionId: null })}
                >
                  {t("control.ai.revision.backOne")}
                </button>
              ) : (
                <p data-ai-revisions-no-earlier>
                  {t("control.ai.revision.noEarlier")}
                </p>
              )}
              <ul className="flex flex-col gap-2">
                {revisions.map((r) => (
                  <li
                    key={r.revisionId}
                    data-ai-revision={r.revisionId}
                    className="flex flex-col gap-1 rounded-md bg-slate/5 p-2"
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
                        onClick={() => setConfirm({ revisionId: r.revisionId })}
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
          role="group"
          aria-labelledby={`confirm-${p.profileId}`}
          className="flex flex-col gap-2 rounded-md border border-tangerine/40 bg-tangerine/10 p-3"
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
              onClick={() => setConfirm(null)}
            >
              {t("control.ai.revision.confirmNo")}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
