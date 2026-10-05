'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AppCard } from '@/components/app-ui/Card';
import { DataList, type DataColumn } from '@/components/app-ui/DataList';
import { ErrorState, Skeleton } from '@/components/app-ui/States';
import { StatusPill } from '@/components/app-ui/StatusPill';
import type { StatusTone } from '@/components/app-ui/tones';
import { Modal } from '@/components/ui/Modal';
import {
  accessModeLabel,
  describeEntitlementChange,
  isAlwaysOn,
  type AccessMode,
  type EntitlementHistoryEntry,
  type PlanSummary,
  type SchoolEntitlements,
} from '@/lib/contracts/entitlements';
import { MODULE_GROUPS, MODULE_REGISTRY, type ModuleDefinition } from '@/lib/contracts/modules';

// Control → a school → Modules & access (C123): apply a plan, switch a
// module on or off, set the access mode (with a grace end date), each with
// a required reason, and see who changed what and when (from the audit
// log). Everything goes through the entitlements API, which checks the
// founder's session and writes the audit row; this screen only asks.

export type EntitlementsData = { entitlements: SchoolEntitlements; plans: PlanSummary[]; history: EntitlementHistoryEntry[] };
export type EntitlementsApi = { load(): Promise<EntitlementsData>; change(body: Record<string, unknown>): Promise<void> };

export function entitlementsApi(schoolId: string): EntitlementsApi {
  const url = `/api/control/schools/${schoolId}/entitlements`;
  return {
    async load() {
      const r = await fetch(`${url}?history=1`, { cache: 'no-store' });
      if (!r.ok) throw new Error('Could not load this school’s modules.');
      const body = await r.json();
      return { entitlements: body.entitlements, plans: body.plans ?? [], history: body.history ?? [] };
    },
    async change(payload) {
      const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'The change was not saved.');
    },
  };
}

const ACCESS_MODES: AccessMode[] = ['full', 'grace', 'read_only', 'suspended'];
const ACCESS_TONE: Record<AccessMode, StatusTone> = { full: 'success', grace: 'warning', read_only: 'alert', suspended: 'alert' };
const ACCESS_HELP: Record<AccessMode, string> = {
  full: 'Everything the school has switched on works.',
  grace: 'Everything works until the end date, then the school becomes read only by itself.',
  read_only: 'People can view and export, but not change anything.',
  suspended: 'Only Help Center and Raise Ticket stay open.',
};
const field = 'mt-1 min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-sm font-normal text-slate';
const button = 'min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white disabled:opacity-60';
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });
const validReason = (r: string) => r.trim().length >= 3 && r.trim().length <= 500;

function Reason({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <label htmlFor={id} className="text-sm font-semibold text-slate">
      Reason (only you can read it; the school never sees it)
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={500} required className={field} />
    </label>
  );
}

export function SchoolEntitlementsPanel({
  api,
  initial,
  initialDialog,
}: {
  api: EntitlementsApi;
  initial?: EntitlementsData;
  // Render tests only: the switch dialog open for a module, with an error.
  initialDialog?: { moduleId: string; error?: string };
}) {
  const [data, setData] = useState<EntitlementsData | null>(initial ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialDialog?.error ?? null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<AccessMode>(initial?.entitlements.accessMode ?? 'full');
  const [graceDate, setGraceDate] = useState('');
  const [accessReason, setAccessReason] = useState('');
  const [planId, setPlanId] = useState('');
  const [planReason, setPlanReason] = useState('');
  const [toggle, setToggle] = useState<ModuleDefinition | null>(MODULE_REGISTRY.find((m) => m.id === initialDialog?.moduleId) ?? null);
  const [toggleReason, setToggleReason] = useState('');

  const load = useCallback(() => {
    setLoadError(null);
    api
      .load()
      .then((d) => {
        setData(d);
        setMode(d.entitlements.accessMode);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [api]);
  useEffect(() => {
    if (!initial) load();
  }, [initial, load]);

  // One change at a time; on success the screen reloads the server's truth.
  async function change(body: Record<string, unknown>, done: () => void) {
    setBusy(true);
    setError(null);
    try {
      await api.change(body);
      done();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The change was not saved.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!data) return <Skeleton lines={6} />;

  const { entitlements: ent, plans, history } = data;
  const isOn = (m: ModuleDefinition) => isAlwaysOn(m.id) || ent.modules[m.id]?.enabled === true;
  const onCount = MODULE_REGISTRY.filter(isOn).length;
  const label = (id: string) => MODULE_REGISTRY.find((m) => m.id === id)?.label ?? id;
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const plan = plans.find((p) => p.planId === planId);

  const setAccess = (e: FormEvent) => {
    e.preventDefault();
    // The grace period runs to the end of that day, India time.
    change({ accessMode: mode, ...(mode === 'grace' ? { graceEndsAt: `${graceDate}T23:59:59+05:30` } : {}), reason: accessReason.trim() }, () => setAccessReason(''));
  };
  const applyPlan = (e: FormEvent) => {
    e.preventDefault();
    change({ applyPlan: planId, reason: planReason.trim() }, () => setPlanReason(''));
  };

  // Shown on the page, or inside the switch dialog while it is open (a
  // modal dialog covers the page, so an error behind it would not be seen).
  const errorBox = (
    <p role="alert" className="rounded-md border border-coral/40 bg-coral/10 p-3 text-sm text-slate">
      {error}
    </p>
  );
  const closeToggle = () => {
    setToggle(null);
    setError(null);
  };

  const columns: DataColumn<EntitlementHistoryEntry>[] = [
    { key: 'what', header: 'What changed', primary: true, render: (h) => describeEntitlementChange(h, label) },
    { key: 'who', header: 'Who', render: (h) => h.actorName ?? 'NetCyberAI (automatic)' },
    { key: 'when', header: 'When', render: (h) => when(h.at) },
    { key: 'why', header: 'Reason', render: (h) => h.reason ?? '—' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {error && !toggle && errorBox}

      <AppCard title="Plan and access" tone="sapphire" description={`${onCount} of ${MODULE_REGISTRY.length} modules are on for this school.`}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate">
          <StatusPill tone="info">Plan: {ent.plan}</StatusPill>
          <StatusPill tone={ACCESS_TONE[ent.accessMode]}>{accessModeLabel(ent.accessMode)}</StatusPill>
          {ent.graceEndsAt && <span>{new Date(ent.graceEndsAt) > new Date() ? `Grace ends ${day(ent.graceEndsAt)}` : `Grace ended ${day(ent.graceEndsAt)}`}</span>}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <form onSubmit={setAccess} className="flex flex-col gap-3 rounded-lg border border-slate/10 p-3">
            <label htmlFor="access-mode" className="text-sm font-semibold text-slate">
              Access mode
              <select id="access-mode" value={mode} onChange={(e) => setMode(e.target.value as AccessMode)} className={field}>
                {ACCESS_MODES.map((m) => (
                  <option key={m} value={m}>
                    {accessModeLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-slate/70">{ACCESS_HELP[mode]}</p>
            {mode === 'grace' && (
              <label htmlFor="grace-date" className="text-sm font-semibold text-slate">
                Grace ends on (end of that day)
                <input id="grace-date" type="date" required min={tomorrow} value={graceDate} onChange={(e) => setGraceDate(e.target.value)} className={field} />
              </label>
            )}
            <Reason id="access-reason" value={accessReason} onChange={setAccessReason} />
            <button type="submit" disabled={busy || !validReason(accessReason) || (mode === 'grace' && !graceDate)} className={`${button} self-start`}>
              Set access
            </button>
          </form>

          <form onSubmit={applyPlan} className="flex flex-col gap-3 rounded-lg border border-slate/10 p-3">
            <label htmlFor="plan" className="text-sm font-semibold text-slate">
              Apply a plan
              <select id="plan" value={planId} onChange={(e) => setPlanId(e.target.value)} required className={field}>
                <option value="">Choose…</option>
                {plans.map((p) => (
                  <option key={p.planId} value={p.planId}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-slate/70">
              {plan ? `Switches on ${plan.moduleIds.length} modules: ${plan.moduleIds.map(label).join(', ')}. ` : ''}
              Modules you switched by hand keep your choice.
            </p>
            <Reason id="plan-reason" value={planReason} onChange={setPlanReason} />
            <button type="submit" disabled={busy || !planId || !validReason(planReason)} className={`${button} self-start`}>
              Apply plan
            </button>
          </form>
        </div>
      </AppCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {[...MODULE_GROUPS]
          .sort((a, b) => a.order - b.order)
          .map((g) => (
            <AppCard key={g.id} title={g.label} tone={g.tone[0]}>
              <ul className="flex flex-col divide-y divide-slate/10">
                {MODULE_REGISTRY.filter((m) => m.group === g.id).map((m) => {
                  const e = ent.modules[m.id];
                  const on = isOn(m);
                  const always = isAlwaysOn(m.id);
                  return (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate">{m.label}</p>
                        <p className="text-xs text-slate/70">
                          {always ? 'Always on for every school' : !e ? 'Not switched on' : e.source === 'founder_override' ? 'Set by hand' : e.source === 'trial' ? 'Trial' : e.enabled ? 'From the plan' : 'Off in the plan'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusPill tone={on ? 'success' : 'neutral'}>{on ? 'On' : 'Off'}</StatusPill>
                        {!always && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setToggleReason('');
                              setError(null);
                              setToggle(m);
                            }}
                            aria-label={`Switch ${on ? 'off' : 'on'} ${m.label}`}
                            className="min-h-[44px] rounded-md border border-sapphire bg-white px-3 text-sm font-semibold text-sapphire disabled:opacity-60"
                          >
                            Switch {on ? 'off' : 'on'}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </AppCard>
          ))}
      </div>

      <AppCard title="History" description="Every change to this school’s plan, modules and access, from the audit log.">
        <DataList
          caption="Entitlement changes"
          columns={columns}
          rows={history}
          rowKey={(h) => h.id}
          empty={{ title: 'No changes yet', whatToDo: 'Changes you make above appear here with your name, the time and the reason.' }}
        />
      </AppCard>

      <Modal open={!!toggle} onClose={closeToggle} title={toggle ? `Switch ${isOn(toggle) ? 'off' : 'on'} ${toggle.label}?` : ''}>
        {toggle && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              change({ moduleId: toggle.id, enabled: !isOn(toggle), reason: toggleReason.trim() }, () => setToggle(null));
            }}
          >
            <p className="text-sm text-slate/70">
              {isOn(toggle) ? 'People at this school will stop seeing this module in their menu, and its screens will say it is not switched on.' : 'People whose role may use this module will see it in their menu.'}
            </p>
            <Reason id="toggle-reason" value={toggleReason} onChange={setToggleReason} />
            {error && errorBox}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy || !validReason(toggleReason)} className={button}>
                {busy ? 'Saving…' : `Switch ${isOn(toggle) ? 'off' : 'on'}`}
              </button>
              <button type="button" onClick={closeToggle} className="min-h-[44px] px-4 text-sm font-semibold text-slate">
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// The panel on the real API, for the school page (a server page cannot
// pass functions, so the client is built here, once per school).
export function SchoolEntitlements({ schoolId }: { schoolId: string }) {
  const api = useMemo(() => entitlementsApi(schoolId), [schoolId]);
  return <SchoolEntitlementsPanel api={api} />;
}
