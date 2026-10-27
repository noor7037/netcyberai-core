"use client";

import { useState } from "react";
import { InfoTip } from "@/components/app-ui/InfoTip";
import { StatusPill } from "@/components/app-ui/StatusPill";
import { Input } from "@/components/ui/Input";
import { CAPABILITIES, type Capabilities } from "@/lib/ai/adapters/types";
import {
  cleanWorkersAccount,
  cleanWorkersToken,
  workersAccountLooksRight,
  workersTokenLooksRight,
} from "@/lib/ai/adapters/workers-key";
import type { ProviderStateResult } from "@/lib/ai/provider-state";
import type { LedgerAttempt } from "@/lib/contracts/ai-gateway";
import {
  CAPABILITY_WORDS,
  CARD,
  INNER,
  STATE_TONE,
  TAP,
  TERMS_NOTE,
  day,
  outcomeWords,
  stateWhy,
  stateWords,
  when,
  type Data,
  type Send,
  type T,
} from "./shared";

// The AI services (C249; G0–G3): each one's state (derived, never guessed), its key (write-only: its last four
// characters), Cloudflare's key in two parts, its address for the OpenAI-compatible adapter, its clearance for
// children's words with the terms note beside the switch, and the key test.

type Props = {
  data: Data;
  busy: boolean;
  send: Send;
  test: (providerId: string, video: boolean) => Promise<void>;
  t: T;
  states: Record<string, ProviderStateResult>;
  // Each provider's newest attempt in the ledger, when it has one.
  lastAttempt: Record<string, LedgerAttempt>;
};

export function ProviderList({
  data,
  busy,
  send,
  test,
  t,
  states,
  lastAttempt,
}: Props) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  // Cloudflare's key in two boxes (C317): the Account ID and the API token.
  const [cf, setCf] = useState({ account: "", token: "" });
  // A box says what is wrong only once the founder has left it, never while it is still being filled in.
  const [cfLeft, setCfLeft] = useState({ account: false, token: false });
  const [terms, setTerms] = useState<Record<string, string>>({});
  // The OpenAI-compatible adapter's address (G1), per provider, as typed.
  const [urls, setUrls] = useState<Record<string, string>>({});

  const name = (n: string | null) => n ?? t("control.ai.someone");
  const canDo = (c: Capabilities | null) => {
    const list = c
      ? CAPABILITIES.filter((k) => c[k]).map((k) => t(CAPABILITY_WORDS[k]))
      : [];
    return list.length
      ? t("control.ai.capabilities", { list: list.join(", ") })
      : t("control.ai.capabilities.none");
  };

  return (
    <section data-ai-providers className={CARD}>
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 className="text-lg font-bold">{t("control.ai.providers.title")}</h2>
        <InfoTip>{t("control.ai.providers.how")}</InfoTip>
      </div>
      <ul className="flex flex-col gap-3">
        {data.providers.map((p) => {
          const s = states[p.providerId];
          const last = lastAttempt[p.providerId];
          return (
            <li
              key={p.providerId}
              data-ai-provider={p.providerId}
              className={INNER}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="break-all font-bold">{p.providerId}</p>
                {s && p.capability !== "video" && (
                  <span data-ai-provider-state={s.state}>
                    <StatusPill tone={STATE_TONE[s.state]}>
                      {t(stateWords(s.state))}
                    </StatusPill>
                  </span>
                )}
              </div>
              {s && p.capability !== "video" && (
                <p data-ai-provider-why className="text-slate/80">
                  {t(stateWhy(s.state), { models: s.openModels.join(", ") })}
                </p>
              )}
              {last && p.capability !== "video" && (
                <p data-ai-provider-last className="text-slate/80">
                  {t("control.ai.provider.lastAttempt", {
                    date: when(last.at),
                    outcome: outcomeWords(t, last.outcome),
                  })}
                </p>
              )}
              {!p.hasAdapter && <p>{t("control.ai.provider.noAdapter")}</p>}
              {p.capability === "video" && (
                <p data-ai-video-provider>{t("control.video.ai.provider")}</p>
              )}
              {p.capability === "text" && (
                <p
                  data-ai-capabilities={
                    p.capabilities
                      ? CAPABILITIES.filter((k) => p.capabilities?.[k]).join(
                          " ",
                        )
                      : ""
                  }
                >
                  {canDo(p.capabilities)}
                </p>
              )}
              {p.needsBaseUrl && (
                <div data-ai-endpoint className="flex flex-col gap-2">
                  <p data-ai-endpoint-current className="break-all">
                    {p.baseUrl
                      ? t("control.ai.endpoint.current", { url: p.baseUrl })
                      : t("control.ai.endpoint.none")}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                    <Input
                      id={`endpoint-${p.providerId}`}
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={500}
                      label={t("control.ai.endpoint.label")}
                      helperText={t("control.ai.endpoint.help")}
                      value={urls[p.providerId] ?? ""}
                      onChange={(e) =>
                        setUrls({ ...urls, [p.providerId]: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      data-ai-endpoint-save
                      disabled={busy || !(urls[p.providerId] ?? "").trim()}
                      className={TAP}
                      onClick={() =>
                        void send(
                          {
                            action: "endpoint",
                            providerId: p.providerId,
                            baseUrl: (urls[p.providerId] ?? "").trim(),
                          },
                          "control.ai.saved",
                          () => setUrls((u) => ({ ...u, [p.providerId]: "" })),
                        )
                      }
                    >
                      {t("control.ai.endpoint.save")}
                    </button>
                    {p.baseUrl && (
                      <button
                        type="button"
                        data-ai-endpoint-clear
                        disabled={busy}
                        className={TAP}
                        onClick={() =>
                          void send(
                            {
                              action: "endpoint",
                              providerId: p.providerId,
                              baseUrl: null,
                            },
                            "control.ai.saved",
                          )
                        }
                      >
                        {t("control.ai.endpoint.clear")}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {p.capability !== "video" && p.termsNote && (
                <p
                  data-ai-terms-note={p.termsNote}
                  className="rounded-md border border-slate/15 bg-slate/5 p-2"
                >
                  {t(TERMS_NOTE[p.termsNote])}
                </p>
              )}
              {p.capability === "video" ? null : p.clearedForMinors ? (
                <>
                  <p>
                    {t("control.ai.provider.cleared", {
                      date: day(p.clearedAt),
                      name: name(p.clearedByName),
                    })}
                  </p>
                  {p.termsUrl && (
                    <p className="break-all text-slate/70">
                      {t("control.ai.provider.terms", { url: p.termsUrl })}
                    </p>
                  )}
                  <button
                    type="button"
                    data-ai-withdraw
                    disabled={busy}
                    className={`${TAP} self-start`}
                    onClick={() =>
                      void send(
                        {
                          action: "clearance",
                          providerId: p.providerId,
                          cleared: false,
                        },
                        "control.ai.saved",
                      )
                    }
                  >
                    {t("control.ai.provider.withdraw")}
                  </button>
                </>
              ) : (
                <>
                  <p>{t("control.ai.provider.notCleared")}</p>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <Input
                      id={`terms-${p.providerId}`}
                      type="url"
                      inputMode="url"
                      maxLength={500}
                      label={t("control.ai.provider.termsUrl")}
                      value={terms[p.providerId] ?? ""}
                      onChange={(e) =>
                        setTerms({ ...terms, [p.providerId]: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      data-ai-clear
                      disabled={busy || !(terms[p.providerId] ?? "").trim()}
                      className={TAP}
                      onClick={() =>
                        void send(
                          {
                            action: "clearance",
                            providerId: p.providerId,
                            cleared: true,
                            termsUrl: terms[p.providerId],
                          },
                          "control.ai.saved",
                        )
                      }
                    >
                      {t("control.ai.provider.clear")}
                    </button>
                  </div>
                </>
              )}
              {p.hasAdapter && (
                <>
                  <p data-ai-key-meta>
                    {p.credential
                      ? t("control.ai.key.set", {
                          date: day(p.credential.setAt),
                          name: name(p.credential.setByName),
                          last4: p.credential.keyLast4,
                        })
                      : t("control.ai.key.none")}
                  </p>
                  {p.providerId === "workers-ai" ? (
                    <div
                      data-ai-key-cloudflare
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start"
                    >
                      <Input
                        id="key-workers-ai-account"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={200}
                        label={t("control.ai.key.account")}
                        helperText={t("control.ai.key.accountHelp")}
                        error={
                          cfLeft.account &&
                          cf.account.trim() &&
                          !workersAccountLooksRight(
                            cleanWorkersAccount(cf.account),
                          )
                            ? t("control.ai.err.account_id_format")
                            : undefined
                        }
                        onBlur={() => setCfLeft({ ...cfLeft, account: true })}
                        disabled={!data.keyReady}
                        value={cf.account}
                        onChange={(e) =>
                          setCf({ ...cf, account: e.target.value })
                        }
                      />
                      <Input
                        id="key-workers-ai-token"
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={400}
                        label={t("control.ai.key.token")}
                        helperText={t("control.ai.key.tokenHelp")}
                        error={
                          cfLeft.token &&
                          cf.token.trim() &&
                          !workersTokenLooksRight(cleanWorkersToken(cf.token))
                            ? t("control.ai.err.token_format")
                            : undefined
                        }
                        onBlur={() => setCfLeft({ ...cfLeft, token: true })}
                        disabled={!data.keyReady}
                        value={cf.token}
                        onChange={(e) =>
                          setCf({ ...cf, token: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        data-ai-key-save
                        disabled={
                          busy ||
                          !data.keyReady ||
                          !workersAccountLooksRight(
                            cleanWorkersAccount(cf.account),
                          ) ||
                          !workersTokenLooksRight(cleanWorkersToken(cf.token))
                        }
                        className={`${TAP} sm:mt-7`}
                        onClick={() =>
                          void send(
                            {
                              action: "credential",
                              providerId: "workers-ai",
                              accountId: cf.account,
                              token: cf.token,
                            },
                            "control.ai.saved",
                            () => {
                              setCf({ account: "", token: "" });
                              setCfLeft({ account: false, token: false });
                            },
                          )
                        }
                      >
                        {t("control.ai.key.save")}
                      </button>
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <Input
                        id={`key-${p.providerId}`}
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={400}
                        label={t("control.ai.key.new")}
                        helperText={t("control.ai.key.help")}
                        disabled={!data.keyReady}
                        value={keys[p.providerId] ?? ""}
                        onChange={(e) =>
                          setKeys({ ...keys, [p.providerId]: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        data-ai-key-save
                        disabled={
                          busy ||
                          !data.keyReady ||
                          !(keys[p.providerId] ?? "").trim()
                        }
                        className={TAP}
                        onClick={() =>
                          void send(
                            {
                              action: "credential",
                              providerId: p.providerId,
                              apiKey: keys[p.providerId],
                            },
                            "control.ai.saved",
                            () =>
                              setKeys((k) => ({ ...k, [p.providerId]: "" })),
                          )
                        }
                      >
                        {t("control.ai.key.save")}
                      </button>
                    </div>
                  )}
                  {p.testable && p.credential && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        data-ai-key-test
                        disabled={busy}
                        className={TAP}
                        onClick={() =>
                          void test(p.providerId, p.capability === "video")
                        }
                      >
                        {t("control.video.ai.test")}
                      </button>
                      {p.credential.testedAt && (
                        <span data-ai-key-tested>
                          {t(
                            p.credential.testOk
                              ? "control.video.ai.testedOk"
                              : "control.video.ai.testedFailed",
                            { date: day(p.credential.testedAt) },
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
