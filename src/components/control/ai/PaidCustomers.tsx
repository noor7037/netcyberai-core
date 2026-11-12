"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { TAP, day, type Data, type Send, type T } from "./shared";

// The paid route's limit and its customers (C504). The limit is US dollars of known cost a month (India time); with
// none set the paid route is off for everyone. A family is added by its account email, a school by picking it; a
// family linked to a paying school is paying too. Every change is one request, audited and undoable.

type Props = { data: Data; busy: boolean; send: Send; t: T };

export function PaidCustomers({ data, busy, send, t }: Props) {
  const [limit, setLimit] = useState(data.paidLimit === null ? "" : String(data.paidLimit));
  const [email, setEmail] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const listedSchools = new Set(data.paidCustomers.filter((c) => c.kind === "school").map((c) => c.customerId));
  const limitOk = /^\d{1,5}(\.\d{1,2})?$/.test(limit.trim()) && Number(limit.trim()) > 0;

  return (
    <div data-ai-paid className="flex flex-col gap-3">
      <p data-ai-paid-limit>
        {data.paidLimit === null
          ? t("control.ai.paid.limit.off")
          : t("control.ai.paid.limit.current", { value: data.paidLimit.toFixed(2) })}
      </p>
      <p data-ai-paid-spent>
        {t("control.ai.paid.limit.spent", { value: data.paidSpentMonth.toFixed(2) })}
      </p>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_auto_auto] sm:items-end">
        <Input
          id="ai-paid-limit"
          inputMode="decimal"
          label={t("control.ai.paid.limit.label")}
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        />
        <button
          type="button"
          data-ai-paid-limit-save
          disabled={busy || !limitOk}
          className={`${TAP} sm:justify-self-start`}
          onClick={() => void send({ action: "paid_limit", value: Number(limit.trim()) }, "control.ai.saved")}
        >
          {t("control.ai.paid.limit.save")}
        </button>
        {data.paidLimit !== null && (
          <button
            type="button"
            data-ai-paid-limit-off
            disabled={busy}
            className={`${TAP} sm:justify-self-start`}
            onClick={() => {
              setLimit("");
              void send({ action: "paid_limit", value: null }, "control.ai.saved");
            }}
          >
            {t("control.ai.paid.limit.turnOff")}
          </button>
        )}
      </div>

      <h3 className="pt-2 text-base font-bold">{t("control.ai.paid.customers.title")}</h3>
      {data.paidCustomers.length === 0 ? (
        <p data-ai-paid-none>{t("control.ai.paid.customers.none")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.paidCustomers.map((c) => (
            <li
              key={`${c.kind}:${c.customerId}`}
              data-ai-paid-customer={c.kind}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 p-3"
            >
              <span className="break-all">
                {t(c.kind === "school" ? "control.ai.paid.customers.school" : "control.ai.paid.customers.family", {
                  name: c.label ?? "",
                  date: day(c.since),
                })}
              </span>
              <button
                type="button"
                data-ai-paid-remove
                disabled={busy}
                className={TAP}
                onClick={() => void send({ action: "paid_customer", kind: c.kind, customerId: c.customerId, listed: false }, "control.ai.saved")}
              >
                {t("control.ai.paid.customers.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Input
          id="ai-paid-family"
          type="email"
          autoComplete="off"
          label={t("control.ai.paid.customers.familyLabel")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          type="button"
          data-ai-paid-add-family
          disabled={busy || !/^[^\s@]+@[^\s@]+$/.test(email.trim())}
          className={`${TAP} sm:justify-self-start`}
          onClick={() => void send({ action: "paid_customer", kind: "family", email: email.trim(), listed: true }, "control.ai.saved", () => setEmail(""))}
        >
          {t("control.ai.paid.customers.add")}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-sm font-semibold" htmlFor="ai-paid-school">
          {t("control.ai.paid.customers.schoolLabel")}
          <select
            id="ai-paid-school"
            value={schoolId}
            disabled={busy}
            onChange={(e) => setSchoolId(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate/30 bg-white px-3 font-normal"
          >
            <option value="">{t("control.ai.paid.customers.schoolPick")}</option>
            {data.schools
              .filter((s) => !listedSchools.has(s.schoolId))
              .map((s) => (
                <option key={s.schoolId} value={s.schoolId}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          data-ai-paid-add-school
          disabled={busy || !schoolId}
          className={`${TAP} sm:justify-self-start`}
          onClick={() => void send({ action: "paid_customer", kind: "school", customerId: schoolId, listed: true }, "control.ai.saved", () => setSchoolId(""))}
        >
          {t("control.ai.paid.customers.add")}
        </button>
      </div>
    </div>
  );
}
