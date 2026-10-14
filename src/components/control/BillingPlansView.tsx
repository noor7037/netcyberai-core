'use client';

import { useCallback, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import type { BillingOverview } from '@/lib/control/billing';
import type { ModuleId } from '@/lib/contracts/modules';
import type { MessageKey } from '@/lib/i18n';
import { BillingSchools } from './BillingSchools';

// Control → Billing & Plans (docs/26 slice 8e, C204). The plans, typed here and kept in the database (no name and
// no price is written in code); which plan a new school gets; and below, every school by plan and state. Each
// change is one person's tap, sent to the Control API, which checks the session and writes the audit row.

type Plan = BillingOverview['plans'][number];
type Draft = { editing: string | null; planId: string; idTyped: boolean; name: string; priceRupees: string; period: string; graceDays: string; allWorking: boolean; moduleIds: ModuleId[]; limits: Record<string, string> };
const ERRORS = ['plan_id', 'name', 'price', 'period', 'grace_days', 'modules', 'limits', 'id_taken', 'name_taken', 'not_found', 'is_default', 'retired', 'no_plan', 'amount', 'paid_on', 'covers_until', 'reference', 'note', 'corrects', 'reason', 'plan'];
const PERIODS = ['month', 'quarter', 'year'];
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const FIELD = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-3 text-sm text-slate';
const CHOICE = 'flex min-h-[44px] items-center gap-2 text-sm text-slate';
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const limitId = (moduleId: string, key: string) => `${moduleId}.${key}`;
// The typed name in lower case with dashes: a suggestion for the short id, which the person can change before saving.
const suggestId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function BillingPlansView({ initial }: { initial: BillingOverview }) {
  const { t, tCount, lang } = useT();
  const [data, setData] = useState<BillingOverview>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const moduleLabel = (id: string) => t(`module.${id}` as MessageKey);

  const load = useCallback(async () => {
    const res = await fetch('/api/control/billing', { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as BillingOverview | null) : null;
    if (got) setData(got);
  }, []);

  // One change at a time; on success the screen reloads the server's truth. `done` is the line shown afterwards, or
  // a choice of line from what the server answered.
  const send = async (url: string, payload: unknown, done: MessageKey | ((answer: Record<string, unknown>) => MessageKey)): Promise<boolean> => {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) {
      setNote({ ok: false, text: ERRORS.includes(got?.code) ? t(`billing.err.${got.code}` as MessageKey) : t('billing.err.other') });
      return false;
    }
    setNote({ ok: true, text: t(typeof done === 'function' ? done(typeof got === 'object' && got !== null ? got : {}) : done) });
    await load();
    return true;
  };

  const startNew = () => setDraft({ editing: null, planId: '', idTyped: false, name: '', priceRupees: '', period: '', graceDays: '', allWorking: true, moduleIds: [], limits: {} });
  const startEdit = (p: Plan) =>
    setDraft({
      editing: p.planId,
      planId: p.planId,
      idTyped: true,
      name: p.name,
      priceRupees: p.priceMinor === null ? '' : String(p.priceMinor / 100),
      period: p.period ?? '',
      graceDays: String(p.graceDays),
      allWorking: p.allWorkingModules,
      moduleIds: p.allWorkingModules ? [] : p.moduleIds,
      limits: Object.fromEntries(Object.entries(p.limits).flatMap(([m, values]) => Object.entries(values ?? {}).map(([k, v]) => [limitId(m, k), String(v)]))),
    });
  const given = (d: Draft) => (d.allWorking ? data.workingModules : d.moduleIds);
  const save = async (d: Draft) => {
    const limits: Record<string, Record<string, number>> = {};
    for (const c of data.limitChoices) {
      const typed = (d.limits[limitId(c.moduleId, c.key)] ?? '').trim();
      if (typed !== '' && given(d).includes(c.moduleId)) (limits[c.moduleId] ??= {})[c.key] = Number(typed);
    }
    const body = { name: d.name, priceRupees: d.priceRupees.trim(), period: d.period || null, graceDays: d.graceDays.trim() === '' ? null : Number(d.graceDays), allWorkingModules: d.allWorking, moduleIds: d.allWorking ? [] : d.moduleIds, limits };
    const ok = d.editing ? await send(`/api/control/billing/plans/${d.editing}`, { action: 'edit', ...body }, 'billing.plan.saved') : await send('/api/control/billing', { planId: d.planId.trim(), ...body }, 'billing.plan.added');
    if (ok) setDraft(null);
  };

  return (
    <div lang={lang} className="flex flex-col gap-5 text-sm text-slate">
      {note && (
        <p role="status" data-billing-note className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}

      <section data-billing-plans className="flex flex-col gap-3 rounded-xl border border-slate/10 bg-white p-4">
        <div>
          <h2 className="text-lg font-bold">{t('billing.plans.title')}</h2>
          <p className="max-w-prose text-slate/70">{t('billing.plans.how')}</p>
        </div>
        {data.plans.length === 0 && <p className="rounded-md bg-off-white px-3 py-2">{t('billing.plans.none')}</p>}
        <ul className="flex flex-col gap-3">
          {data.plans.map((p) => (
            <li key={p.planId} data-billing-plan={p.planId} className="flex flex-col gap-1 rounded-md border border-slate/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-bold">{p.name}</p>
                {data.defaultPlanId === p.planId && <Badge variant="success">{t('billing.plan.default')}</Badge>}
                {p.retired && <Badge>{t('billing.plan.retired')}</Badge>}
              </div>
              <p className="text-slate/70">{t('billing.plan.id', { id: p.planId })}</p>
              <p data-billing-price>{p.priceMinor === null || p.period === null ? t('billing.price.none') : t(`billing.price.${p.period}` as MessageKey, { price: rupees(p.priceMinor) })}</p>
              <p>{tCount('billing.plan.grace', p.graceDays)}</p>
              <p>{p.allWorkingModules ? tCount('billing.plan.modules.all', p.moduleIds.length) : t('billing.plan.modules.chosen', { modules: p.moduleIds.map(moduleLabel).join(', ') })}</p>
              {data.limitChoices.map((c) => {
                const value = p.limits[c.moduleId]?.[c.key];
                return value === undefined ? null : (
                  <p key={limitId(c.moduleId, c.key)}>
                    {t(`billing.limit.${c.moduleId}.${c.key}` as MessageKey)}: {value.toLocaleString('en-IN')}
                  </p>
                );
              })}
              <p className="text-slate/70">{tCount('billing.plan.schools', p.schools)}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <button type="button" data-billing-plan-edit disabled={busy} className={TAP} onClick={() => startEdit(p)}>
                  {t('billing.plan.edit')}
                </button>
                {!p.retired && data.defaultPlanId !== p.planId && (
                  <button type="button" disabled={busy} className={TAP} onClick={() => void send(`/api/control/billing/plans/${p.planId}`, { action: 'default' }, 'billing.plan.madeDefault')}>
                    {t('billing.plan.makeDefault')}
                  </button>
                )}
                <button type="button" data-billing-plan-retire disabled={busy} className={TAP} onClick={() => void send(`/api/control/billing/plans/${p.planId}`, { action: p.retired ? 'restore' : 'retire' }, p.retired ? 'billing.plan.restored' : 'billing.plan.retiredDone')}>
                  {t(p.retired ? 'billing.plan.restore' : 'billing.plan.retire')}
                </button>
              </div>
            </li>
          ))}
        </ul>
        {!draft && (
          <button type="button" data-billing-plan-add disabled={busy} className={`${PRIMARY} self-start`} onClick={startNew}>
            {t('billing.plans.add')}
          </button>
        )}

        {draft && (
          <form
            data-billing-plan-form
            className="flex flex-col gap-3 rounded-md border border-slate/10 bg-off-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save(draft);
            }}
          >
            <h3 className="text-base font-bold">{draft.editing ? t('billing.form.editTitle', { name: draft.name }) : t('billing.form.newTitle')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input id="plan-name" label={t('billing.form.name')} maxLength={60} required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value, planId: draft.idTyped ? draft.planId : suggestId(e.target.value) })} />
              {!draft.editing && <Input id="plan-id" label={t('billing.form.id')} helperText={t('billing.form.idHelp')} maxLength={40} required value={draft.planId} onChange={(e) => setDraft({ ...draft, planId: e.target.value, idTyped: true })} />}
              <Input id="plan-price" inputMode="decimal" label={t('billing.form.price')} helperText={t('billing.form.priceHelp')} value={draft.priceRupees} onChange={(e) => setDraft({ ...draft, priceRupees: e.target.value })} />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="plan-period" className="text-sm font-medium text-slate">
                  {t('billing.form.period')}
                </label>
                <select id="plan-period" className={FIELD} value={draft.period} onChange={(e) => setDraft({ ...draft, period: e.target.value })}>
                  <option value="">{t('billing.form.periodNone')}</option>
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {t(`billing.period.${p}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </div>
              <Input id="plan-grace" inputMode="numeric" label={t('billing.form.grace')} helperText={t('billing.form.graceHelp', { max: data.maxGraceDays })} required value={draft.graceDays} onChange={(e) => setDraft({ ...draft, graceDays: e.target.value })} />
            </div>

            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-medium text-slate">{t('billing.form.modules')}</legend>
              <label className={CHOICE}>
                <input type="radio" name="plan-modules" checked={draft.allWorking} onChange={() => setDraft({ ...draft, allWorking: true })} />
                {tCount('billing.form.modulesAll', data.workingModules.length)}
              </label>
              <label className={CHOICE}>
                <input type="radio" name="plan-modules" data-billing-modules-chosen checked={!draft.allWorking} onChange={() => setDraft({ ...draft, allWorking: false })} />
                {t('billing.form.modulesChosen')}
              </label>
              {!draft.allWorking && (
                <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data.workingModules.map((m) => (
                    <label key={m} className={CHOICE}>
                      <input type="checkbox" data-billing-module={m} checked={draft.moduleIds.includes(m)} onChange={(e) => setDraft({ ...draft, moduleIds: e.target.checked ? [...draft.moduleIds, m] : draft.moduleIds.filter((x) => x !== m) })} />
                      {moduleLabel(m)}
                    </label>
                  ))}
                </div>
              )}
              <p className="max-w-prose text-slate/70">{t('billing.form.modulesHelp')}</p>
            </fieldset>

            {data.limitChoices.filter((c) => given(draft).includes(c.moduleId)).length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.limitChoices
                  .filter((c) => given(draft).includes(c.moduleId))
                  .map((c) => (
                    <Input
                      key={limitId(c.moduleId, c.key)}
                      id={`plan-limit-${c.moduleId}-${c.key}`}
                      inputMode="numeric"
                      label={t(`billing.limit.${c.moduleId}.${c.key}` as MessageKey)}
                      helperText={t('billing.form.limitHelp')}
                      value={draft.limits[limitId(c.moduleId, c.key)] ?? ''}
                      onChange={(e) => setDraft({ ...draft, limits: { ...draft.limits, [limitId(c.moduleId, c.key)]: e.target.value } })}
                    />
                  ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="submit" data-billing-plan-save disabled={busy || !draft.name.trim() || !draft.planId.trim() || draft.graceDays.trim() === ''} className={PRIMARY}>
                {t('billing.form.save')}
              </button>
              <button type="button" disabled={busy} className={TAP} onClick={() => setDraft(null)}>
                {t('billing.form.cancel')}
              </button>
            </div>
          </form>
        )}
      </section>

      <BillingSchools data={data} busy={busy} send={send} />
    </div>
  );
}
