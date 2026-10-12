'use client';

import { useCallback, useEffect, useState } from 'react';
import { TeachEmpty } from '@/components/app-ui/TeachEmpty';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { MessageKey } from '@/lib/i18n';
import { FREQUENCIES, minorToRupees, rupeesToMinor, yearlyTotalMinor, type Frequency } from '@/lib/fees/money';

// Fee heads and structures (docs/23 6a, C157). The office names what it
// charges for (heads) and sets what each class pays (a structure). A
// structure is never changed: a new version starts from a date, and the
// earlier one stays on the page with its dates. Amounts are typed in rupees
// and kept as whole paise.

type Head = { head_id: string; name: string; is_mandatory: boolean; rte_covered: boolean; is_active: boolean };
type Item = { head_id: string; head_name: string; amount_minor: number; frequency: Frequency };
type Structure = { structure_id: string; class_id: string; session_id: string | null; academic_year: string; effective_from: string; items: Item[] };
type Data = { today: string; heads: Head[]; structures: Structure[]; classes: { class_id: string; name: string }[]; sessions: { session_id: string; label: string; start_date: string; end_date: string; is_current: boolean }[] };
type Row = { amount: string; frequency: Frequency };
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

export function FeesSetupView() {
  const { t, lang } = useT();
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [headName, setHeadName] = useState('');
  const [classId, setClassId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [from, setFrom] = useState('');
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/app/fees/setup');
      const body = (await res.json()) as Data;
      if (!res.ok) throw new Error('not loaded');
      setData(body);
      setSessionId((s) => s || body.sessions.find((x) => x.is_current)?.session_id || body.sessions[0]?.session_id || '');
      setState('ready');
    } catch {
      setState('failed');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function send(url: string, method: string, body: unknown): Promise<{ ok: boolean; code?: string }> {
    setBusy(true);
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    return { ok: !!res?.ok, code: answer.code };
  }

  async function addHead() {
    if (!headName.trim()) return;
    const r = await send('/api/app/fees/heads', 'POST', { name: headName });
    if (!r.ok) {
      toast.show(t(r.code === 'exists' ? 'fee.head.exists' : 'fee.failed'), 'danger');
      return;
    }
    setHeadName('');
    toast.show(t('fee.head.added'), 'success');
    void load();
  }

  async function retire(h: Head) {
    const r = await send(`/api/app/fees/heads/${h.head_id}`, 'PATCH', { isActive: !h.is_active });
    if (!r.ok) toast.show(t('fee.failed'), 'danger');
    void load();
  }

  async function setMandatory(h: Head, isMandatory: boolean) {
    const r = await send(`/api/app/fees/heads/${h.head_id}`, 'PATCH', { isMandatory });
    if (!r.ok) toast.show(t('fee.failed'), 'danger');
    void load();
  }

  async function setRteCovered(h: Head, rteCovered: boolean) {
    const r = await send(`/api/app/fees/heads/${h.head_id}`, 'PATCH', { rteCovered });
    if (!r.ok) toast.show(t('fee.failed'), 'danger');
    void load();
  }

  if (state === 'loading')
    return (
      <p role="status" lang={lang} className="text-sm text-slate/70">
        {t('fee.loading')}
      </p>
    );
  if (state === 'failed' || !data) return <TeachEmpty id="not-loaded" />;

  const active = data.heads.filter((h) => h.is_active);
  const versions = data.structures.filter((s) => s.class_id === classId && s.session_id === sessionId);
  const inForce = versions.find((v) => v.effective_from <= data.today) ?? null;
  const session = data.sessions.find((s) => s.session_id === sessionId);
  const freqWord = (f: Frequency) => t(`fee.freq.${f}` as MessageKey);
  const typed = active.map((h) => ({ head: h, row: rows[h.head_id] ?? { amount: '', frequency: 'monthly' as Frequency } }));
  const parsed = typed.map((x) => ({ ...x, minor: x.row.amount.trim() === '' ? 0 : rupeesToMinor(x.row.amount) }));
  const invalid = parsed.some((x) => x.minor === null);
  const newItems = parsed.filter((x) => (x.minor ?? 0) > 0).map((x) => ({ headId: x.head.head_id, amountMinor: x.minor as number, frequency: x.row.frequency }));

  async function saveVersion() {
    if (!classId || !sessionId || !from || invalid || newItems.length === 0) {
      toast.show(t(invalid ? 'fee.amount.bad' : 'fee.version.missing'), 'danger');
      return;
    }
    const r = await send('/api/app/fees/structures', 'POST', { classId, sessionId, effectiveFrom: from, items: newItems });
    if (!r.ok) {
      toast.show(t(r.code === 'version_exists' ? 'fee.version.exists' : r.code === 'outside_session' ? 'fee.version.outside' : 'fee.failed'), 'danger');
      return;
    }
    toast.show(t('fee.version.saved'), 'success');
    setRows({});
    setFrom('');
    void load();
  }

  // Start a new version from the one in force, so only what changes is retyped.
  const copyFrom = (v: Structure) => setRows(Object.fromEntries(v.items.map((i) => [i.head_id, { amount: minorToRupees(i.amount_minor).replace(/,/g, ''), frequency: i.frequency }])));

  return (
    <section lang={lang} className="flex flex-col gap-6">
      <p className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('fee.notYet')}</p>

      <div data-fee-heads className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        <h2 className="text-base font-bold text-slate">{t('fee.heads')}</h2>
        <p className="text-sm text-slate/70">{t('fee.head.mandatory.help')}</p>
        {data.heads.length === 0 && <TeachEmpty id="fee-heads" compact />}
        <ul className="flex flex-col gap-2">
          {data.heads.map((h) => (
            <li key={h.head_id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate">
              <span className="flex items-center gap-2 font-semibold">
                {h.name}
                {!h.is_active && <Badge variant="neutral">{t('fee.head.retired')}</Badge>}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 font-normal">
                  <input type="checkbox" data-mandatory className="h-5 w-5" checked={h.is_mandatory} disabled={busy} onChange={(e) => void setMandatory(h, e.target.checked)} />
                  {t('fee.head.mandatory')}
                </label>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 font-normal">
                  <input type="checkbox" data-rte-covered className="h-5 w-5" checked={h.rte_covered} disabled={busy} onChange={(e) => void setRteCovered(h, e.target.checked)} />
                  {t('fee.head.rteCovered')}
                </label>
                <button type="button" disabled={busy} className={TAP} onClick={() => void retire(h)}>
                  {t(h.is_active ? 'fee.head.retire' : 'fee.head.restore')}
                </button>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input id="fee-head-name" label={t('fee.head.new')} maxLength={60} value={headName} onChange={(e) => setHeadName(e.target.value)} />
          </div>
          <button type="button" data-add-head disabled={busy || !headName.trim()} className={PRIMARY} onClick={() => void addHead()}>
            {t('fee.head.add')}
          </button>
        </div>
      </div>

      <div data-fee-structures className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        <h2 className="text-base font-bold text-slate">{t('fee.structures')}</h2>
        {data.classes.length === 0 || data.sessions.length === 0 ? (
          <TeachEmpty id="fee-no-classes" compact />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select id="fee-class" label={t('fee.class')} value={classId} onChange={(e) => (setClassId(e.target.value), setRows({}))}>
                <option value="">{t('fee.class.choose')}</option>
                {data.classes.map((c) => (
                  <option key={c.class_id} value={c.class_id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select id="fee-session" label={t('fee.session')} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                {data.sessions.map((s) => (
                  <option key={s.session_id} value={s.session_id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>

            {classId && versions.length === 0 && <TeachEmpty id="fee-structure" compact />}
            {classId &&
              versions.map((v) => (
                <div key={v.structure_id} data-version={v.effective_from} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3 text-sm text-slate">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {t('fee.version.from', { date: v.effective_from })}
                    {v === inForce && <Badge variant="success">{t('fee.version.inForce')}</Badge>}
                    {v.effective_from > data.today && <Badge variant="warning">{t('fee.version.future')}</Badge>}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {v.items.map((i) => (
                      <li key={i.head_id} className="flex flex-wrap justify-between gap-2">
                        <span>{i.head_name}</span>
                        <span className="font-semibold">{t('fee.amount', { amount: minorToRupees(i.amount_minor), frequency: freqWord(i.frequency) })}</span>
                      </li>
                    ))}
                  </ul>
                  <p data-yearly className="border-t border-slate/10 pt-2 font-semibold">
                    {t('fee.yearly', { amount: minorToRupees(yearlyTotalMinor(v.items)) })}
                  </p>
                  {v === versions[0] && (
                    <button type="button" className={`${TAP} self-start`} onClick={() => copyFrom(v)}>
                      {t('fee.version.copy')}
                    </button>
                  )}
                </div>
              ))}

            {classId && active.length > 0 && (
              <div data-new-version className="flex flex-col gap-3 border-t border-slate/10 pt-3">
                <h3 className="text-sm font-bold text-slate">{t(versions.length ? 'fee.version.new' : 'fee.version.first')}</h3>
                <p className="text-sm text-slate/70">{t('fee.version.how')}</p>
                <div className="max-w-xs">
                  <Input id="fee-from" type="date" label={t('fee.version.fromDate')} min={session?.start_date} max={session?.end_date} value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                {typed.map(({ head, row }) => (
                  <div key={head.head_id} className="grid items-end gap-2 sm:grid-cols-[1fr_10rem_12rem]">
                    <span className="text-sm font-semibold text-slate">{head.name}</span>
                    <Input id={`fee-amount-${head.head_id}`} label={t('fee.rupees')} inputMode="decimal" value={row.amount} onChange={(e) => setRows((r) => ({ ...r, [head.head_id]: { ...row, amount: e.target.value } }))} error={row.amount.trim() !== '' && rupeesToMinor(row.amount) === null ? t('fee.amount.bad') : undefined} />
                    <Select id={`fee-freq-${head.head_id}`} label={t('fee.frequency')} value={row.frequency} onChange={(e) => setRows((r) => ({ ...r, [head.head_id]: { ...row, frequency: e.target.value as Frequency } }))}>
                      {FREQUENCIES.map((f) => (
                        <option key={f} value={f}>
                          {freqWord(f)}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
                {newItems.length > 0 && !invalid && <p className="text-sm font-semibold text-slate">{t('fee.yearly', { amount: minorToRupees(yearlyTotalMinor(newItems.map((i) => ({ amount_minor: i.amountMinor, frequency: i.frequency })))) })}</p>}
                <button type="button" data-save-version disabled={busy} className={`${PRIMARY} self-start`} onClick={() => void saveVersion()}>
                  {t('fee.version.save')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
