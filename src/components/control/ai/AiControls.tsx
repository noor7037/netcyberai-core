"use client";

import { useStepUp } from "@/components/auth/StepUp";
import { useCallback, useMemo, useState } from "react";
import { useT } from "@/components/app-shell/LangContext";
import { InfoTip } from "@/components/app-ui/InfoTip";
import { StatusPill } from "@/components/app-ui/StatusPill";
import { Input } from "@/components/ui/Input";
import type { Counts } from "@/lib/ai/control";
import {
  PROVIDER_STATES,
  providerState,
  type ProviderStateResult,
} from "@/lib/ai/provider-state";
import type { LedgerAttempt } from "@/lib/contracts/ai-gateway";
import type { MessageKey } from "@/lib/i18n";
import Link from "next/link";
import { LedgerView } from "./LedgerView";
import { PriceList } from "./PriceList";
import { ProviderList } from "./ProviderList";
import {
  CARD,
  choicesFor,
  STATE_TONE,
  TAP,
  day,
  profileName,
  stateWords,
  type Data,
} from "./shared";
import { WorkloadCard, draftOf } from "./WorkloadCard";

// Control → AI (C249; G3, C371). Every save goes to /api/control/ai and the page's data is read again from there,
// so what is shown is always what the database holds. A key is typed into a password field, sent once and cleared:
// the page never receives one back. Each service's state is derived from the server's records only
// (src/lib/ai/provider-state.ts); every number shown is a count, a measured time or a token count.

const ERRORS = [
  "account_id_format",
  "token_format",
  "no_encryption_key",
  "provider",
  "key_format",
  "terms_url",
  "in_use",
  "profile",
  "model",
  "prompt_version",
  "incomplete",
  "not_cleared_for_minors",
  "cap",
  "not_found",
  "cannot_restore_key",
  "request",
  "aal2",
  "capability",
  "base_url",
  "base_url_private",
  "base_url_dns",
  "no_base_url",
  "no_revision",
  "price",
];
// M2-5: a content provider's key test (their words are under control.video.ai.err.*).
const TEST_ERRORS = ["no_key", "not_testable"];

export function AiControls({ initial }: { initial: Data }) {
  const { stepUpFetch } = useStepUp();
  const { t, lang } = useT();
  const [data, setData] = useState<Data>(initial);
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(initial.profiles.map((p) => [p.profileId, draftOf(p)])),
  );
  const [cap, setCap] = useState(
    initial.cap === null ? "" : String(initial.cap),
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  // The time the states are judged at: when the data was read.
  const [readAt, setReadAt] = useState(() => Date.now());

  const read = useCallback(async () => {
    const res = await fetch("/api/control/ai", { cache: "no-store" }).catch(
      () => null,
    );
    const got = res?.ok
      ? ((await res.json().catch(() => null)) as Data | null)
      : null;
    if (got) {
      setData(got);
      setDrafts(
        Object.fromEntries(got.profiles.map((p) => [p.profileId, draftOf(p)])),
      );
      setCap(got.cap === null ? "" : String(got.cap));
      setReadAt(Date.now());
    }
  }, []);

  const send = async (
    payload: Record<string, unknown>,
    done: MessageKey,
    after?: () => void,
  ) => {
    setBusy(true);
    setNote(null);
    const res = await stepUpFetch("/api/control/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    after?.();
    if (!res?.ok) {
      setBusy(false);
      return setNote({
        ok: false,
        text: ERRORS.includes(got?.code)
          ? t(`control.ai.err.${got.code}` as MessageKey)
          : t("control.ai.err.other"),
      });
    }
    await read();
    setBusy(false);
    setNote({ ok: true, text: t(done) });
  };

  // A provider's key test (M2-5, G1): the answer says whether the provider took the key, never the key.
  const test = async (providerId: string, video: boolean) => {
    setBusy(true);
    setNote(null);
    const res = await stepUpFetch("/api/control/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test", providerId }),
    }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    await read();
    setBusy(false);
    if (!res?.ok) {
      const code = got?.code;
      return setNote({
        ok: false,
        text: TEST_ERRORS.includes(code)
          ? t(`control.video.ai.err.${code}` as MessageKey)
          : ERRORS.includes(code)
            ? t(`control.ai.err.${code}` as MessageKey)
            : t("control.ai.err.other"),
      });
    }
    setNote(
      got?.works
        ? { ok: true, text: t("control.video.ai.works") }
        : {
            ok: false,
            text: t(
              video ? "control.video.ai.fails" : "control.ai.test.fails",
              { code: String(got?.code ?? "") },
            ),
          },
    );
  };

  const { states, lastAttempt } = useMemo(() => {
    const { health, ledger } = data.routing;
    const states: Record<string, ProviderStateResult> = {};
    const lastAttempt: Record<string, LedgerAttempt> = {};
    for (const a of ledger)
      if (
        !lastAttempt[a.providerId] ||
        Number(a.attemptId) > Number(lastAttempt[a.providerId].attemptId)
      )
        lastAttempt[a.providerId] = a;
    for (const p of data.providers) {
      states[p.providerId] = providerState({
        enabled: p.enabled,
        needsKey: p.needsKey,
        hasKey: p.credential !== null,
        test: p.credential
          ? { at: p.credential.testedAt, ok: p.credential.testOk }
          : null,
        health: health.filter((h) => h.providerId === p.providerId),
        attempts: ledger.filter((a) => a.providerId === p.providerId),
        now: readAt,
      });
    }
    return { states, lastAttempt };
  }, [data, readAt]);

  const name = (n: string | null) => n ?? t("control.ai.someone");
  const usageLine = (c: Counts) =>
    t("control.ai.usage.line", {
      requests: c.requests,
      failures: c.failures,
      capRefusals: c.capRefusals,
      tokensIn: c.tokensIn,
      tokensOut: c.tokensOut,
    });
  // The overview: counts of what the server holds, nothing else.
  const textProviders = data.providers.filter((p) => p.capability !== "video");
  const stateCounts = PROVIDER_STATES.map((s) => ({
    s,
    n: textProviders.filter((p) => states[p.providerId]?.state === s).length,
  })).filter((x) => x.n > 0);
  const features = {
    total: data.profiles.length,
    on: data.profiles.filter((p) => p.enabled).length,
    primary: data.profiles.filter((p) => p.providerId).length,
    backup: data.profiles.filter((p) => p.fallback.length > 0).length,
  };

  return (
    <div lang={lang} className="flex flex-col gap-5 text-sm text-slate">
      {/* The outcome of a save sits at the bottom of the window, wherever the page is scrolled (C319). */}
      {note && (
        <p
          role="status"
          data-ai-note
          className={`fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-md py-1 pl-4 pr-1 font-semibold shadow-lg ${note.ok ? "border border-slate/20 bg-white text-slate" : "border border-coral-deep/30 bg-white text-coral-deep"}`}
        >
          <span className="flex-1 py-2">{note.text}</span>
          <button
            type="button"
            data-ai-note-close
            className={TAP}
            onClick={() => setNote(null)}
          >
            {t("control.ai.note.close")}
          </button>
        </p>
      )}

      <section data-ai-overview className={CARD}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-lg font-bold">
            {t("control.ai.overview.title")}
          </h2>
          <InfoTip>{t("control.ai.overview.how")}</InfoTip>
        </div>
        <p data-ai-overview-features>
          {t("control.ai.overview.features", features)}
        </p>
        {/* G5 (C373): the Quality Lab, from the screen itself (the header's link is easy to miss). */}
        <Link
          href="/control/ai/lab"
          data-ai-overview-lab
          className="inline-flex min-h-[44px] items-center self-start rounded-md border border-slate/20 px-4 font-semibold text-sapphire underline"
        >
          {t("control.ai.overview.lab")}
        </Link>
        <ul data-ai-overview-states className="flex flex-wrap gap-2">
          {stateCounts.map(({ s, n }) => (
            <li key={s} data-ai-overview-state={s}>
              <StatusPill tone={STATE_TONE[s]}>
                {t("control.ai.overview.stateCount", {
                  state: t(stateWords(s)),
                  count: n,
                })}
              </StatusPill>
            </li>
          ))}
        </ul>
      </section>

      <section data-ai-profiles className={CARD}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-lg font-bold">{t("control.ai.profile.title")}</h2>
          <InfoTip>{t("control.ai.profile.how")}</InfoTip>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {data.profiles.map((p) => (
            <WorkloadCard
              key={p.profileId}
              profile={p}
              revisions={data.routing.revisions.filter(
                (r) => r.profileId === p.profileId,
              )}
              providerChoices={choicesFor(data, p.needs)}
              modelLists={data.modelLists}
              states={states}
              busy={busy}
              send={send}
              t={t}
              draft={drafts[p.profileId] ?? draftOf(p)}
              setDraft={(d) =>
                setDrafts((all) => ({ ...all, [p.profileId]: d }))
              }
            />
          ))}
        </div>
      </section>

      <ProviderList
        data={data}
        busy={busy}
        send={send}
        test={test}
        t={t}
        states={states}
        lastAttempt={lastAttempt}
      />

      <LedgerView ledger={data.routing.ledger} t={t} />

      <PriceList data={data} busy={busy} send={send} t={t} />

      <section data-ai-usage className={CARD}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-lg font-bold">{t("control.ai.usage.title")}</h2>
          <InfoTip>{t("control.ai.usage.how")}</InfoTip>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {data.usage.map((u) => (
            <div
              key={u.profileId}
              data-ai-usage-profile={u.profileId}
              className="flex flex-col gap-1"
            >
              <p className="font-bold">{profileName(t, u.profileId)}</p>
              <p>
                <span className="font-semibold">
                  {t("control.ai.usage.today")}
                </span>
                : {usageLine(u.today)}
              </p>
              <p>
                <span className="font-semibold">
                  {t("control.ai.usage.month")}
                </span>
                : {usageLine(u.month)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section data-ai-cap className={CARD}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-lg font-bold">{t("control.ai.cap.title")}</h2>
          <InfoTip>{t("control.ai.cap.how")}</InfoTip>
        </div>
        <p>
          {data.cap === null
            ? t("control.ai.cap.notSet")
            : t("control.ai.cap.current", { value: data.cap })}
        </p>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_auto] sm:items-end">
          <Input
            id="ai-cap"
            inputMode="numeric"
            label={t("control.ai.cap.label")}
            value={cap}
            onChange={(e) => setCap(e.target.value)}
          />
          <button
            type="button"
            data-ai-cap-save
            disabled={busy || !/^\d{1,4}$/.test(cap.trim())}
            className={`${TAP} sm:justify-self-start`}
            onClick={() =>
              void send(
                { action: "cap", value: Number(cap.trim()) },
                "control.ai.saved",
              )
            }
          >
            {t("control.ai.cap.save")}
          </button>
        </div>
      </section>

      <section data-ai-changes className={CARD}>
        <h2 className="text-lg font-bold">{t("control.ai.changes.title")}</h2>
        {data.changes.length === 0 && <p>{t("control.ai.changes.none")}</p>}
        <ul className="flex flex-col gap-2">
          {data.changes.map((c) => (
            <li
              key={c.auditId}
              data-ai-change
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 p-3"
            >
              <span>
                {t("control.ai.changes.line", {
                  what: t(`control.ai.change.${c.action}` as MessageKey),
                  target: c.target ?? "",
                  date: day(c.at),
                  name: name(c.byName),
                })}
              </span>
              {c.canUndo ? (
                <button
                  type="button"
                  data-ai-undo
                  disabled={busy}
                  className={TAP}
                  onClick={() =>
                    void send(
                      { action: "undo", auditId: c.auditId },
                      "control.ai.undone",
                    )
                  }
                >
                  {t("control.ai.changes.undo")}
                </button>
              ) : (
                c.action === "ai.credential_set" && (
                  <span className="text-slate/70">
                    {t("control.ai.changes.keyNoUndo")}
                  </span>
                )
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
