'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { MessageKey } from '@/lib/i18n';

// How a school takes fees (docs/24 §3.2, §3.8, C171): its ways of paying, on
// or off, and the payment gateway's keys. The same panel serves the school's
// Settings (principal or school admin) and Control (NetCyberAI staff, with a
// reason). Keys are typed here and never shown again: the server answers
// with the last four characters of the key id, who saved it and when.
// C235-C: each part's explanation is behind the ⓘ beside its title.

type Method = { method: string; enabled: boolean; sortOrder: number; settings?: Record<string, unknown> };
const VERIFIERS = ['accountant', 'principal', 'school_admin'] as const;
const UPI_EMPTY = { upiId: '', payeeName: '', bankName: '', accountLast4: '', ifsc: '', verifiers: ['accountant', 'principal'] as string[], limitRupees: '0', notify: 'digest' };
type Saved = { configId: string; provider: string; mode: 'test' | 'live'; keyLast4: string; savedAt: string; savedByName: string | null; savedFrom: 'school' | 'control'; testedAt: string | null; testOk: boolean | null; testMessage: string | null; webhookPath: string };
type Gateway = { credentials: Saved[]; allowed: boolean; canSave: boolean; testSchool: boolean };
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

export function PaymentRailsPanel({ scope, schoolId }: { scope: 'school' | 'control'; schoolId?: string }) {
  const { t, lang } = useT();
  // What just happened, said in the panel itself: Control's shell has no toasts.
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const toast = { show: (text: string, tone: 'success' | 'danger') => setNote({ text, bad: tone === 'danger' }) };
  const api = scope === 'school' ? '/api/app/fees/payment-setup' : `/api/control/schools/${schoolId}/payments`;
  const [methods, setMethods] = useState<Method[]>([]);
  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [mayEdit, setMayEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ mode: 'test', keyId: '', keySecret: '', webhookSecret: '', reason: '' });
  const [upi, setUpi] = useState(UPI_EMPTY);

  const load = useCallback(async () => {
    const res = await fetch(api).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (!body) return;
    setMethods(body.methods ?? []);
    const saved = ((body.methods ?? []) as Method[]).find((m) => m.method === 'direct_upi')?.settings;
    if (saved && typeof saved.upiId === 'string')
      setUpi({ upiId: String(saved.upiId), payeeName: String(saved.payeeName ?? ''), bankName: String(saved.bankName ?? ''), accountLast4: String(saved.accountLast4 ?? ''), ifsc: String(saved.ifsc ?? ''), verifiers: Array.isArray(saved.verifiers) ? (saved.verifiers as string[]) : UPI_EMPTY.verifiers, limitRupees: String(Math.floor(Number(saved.principalLimitMinor ?? 0) / 100)), notify: saved.notify === 'each' ? 'each' : 'digest' });
    setGateway(body.gateway ?? null);
    setMayEdit(scope === 'control' || body.mayEdit === true);
  }, [api, scope]);
  useEffect(() => {
    void load();
  }, [load]);

  async function send(method: 'PUT' | 'POST', body: unknown): Promise<{ ok: boolean; code?: string }> {
    setBusy(true);
    const res = await fetch(api, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    void load();
    return { ok: !!res?.ok, code: answer.code };
  }

  async function toggle(m: Method) {
    const r = await send('PUT', { method: m.method, enabled: !m.enabled, sortOrder: m.sortOrder });
    if (!r.ok) toast.show(t(r.code === 'gateway_not_ready' ? 'rails.gateway.notReady' : 'fee.failed'), 'danger');
  }

  async function saveKeys(e: FormEvent) {
    e.preventDefault();
    const r = await send('POST', { action: 'credentials', provider: 'razorpay', mode: form.mode, keyId: form.keyId, keySecret: form.keySecret, webhookSecret: form.webhookSecret, reason: form.reason });
    if (r.ok) {
      // What was typed is dropped at once: it is not kept in the page.
      setForm({ mode: form.mode, keyId: '', keySecret: '', webhookSecret: '', reason: '' });
      toast.show(t('rails.keys.saved'), 'success');
    } else toast.show(t(`rails.keys.error.${['no_encryption_key', 'wrong_mode', 'key_id', 'key_secret', 'webhook_secret', 'reason'].includes(r.code ?? '') ? r.code : 'other'}` as MessageKey), 'danger');
  }

  async function saveUpi(enabled: boolean) {
    const limit = /^\d{1,9}$/.test(upi.limitRupees.trim()) ? Number(upi.limitRupees) * 100 : -1;
    const r = await send('PUT', { method: 'direct_upi', enabled, settings: { upiId: upi.upiId, payeeName: upi.payeeName, bankName: upi.bankName, accountLast4: upi.accountLast4, ifsc: upi.ifsc, verifiers: upi.verifiers, principalLimitMinor: limit, notify: upi.notify } });
    toast.show(t(r.ok ? 'rails.upi.saved' : (`rails.upi.error.${['upi_id', 'payee', 'bank', 'last4', 'ifsc', 'verifiers', 'limit'].includes(r.code ?? '') ? r.code : 'upi_id'}` as MessageKey)), r.ok ? 'success' : 'danger');
  }

  async function testKeys(mode: string) {
    setBusy(true);
    const res = await fetch(scope === 'school' ? `${api}/test` : api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test', mode }) }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    setNote({ text: typeof answer.message === 'string' ? answer.message : t('fee.failed'), bad: answer.ok !== true });
    void load();
  }

  async function setAccess(allowed: boolean) {
    const r = await send('POST', { action: 'access', allowed, reason: form.reason });
    if (!r.ok) toast.show(t('rails.keys.error.reason'), 'danger');
  }

  if (!gateway) return null;
  const date = (iso: string) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

  return (
    <section lang={lang} data-payment-rails className="flex flex-col gap-4 rounded-2xl border border-slate/10 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 className="text-lg font-bold text-slate">{t('rails.title')}</h2>
        <InfoTip>{t('rails.how')}</InfoTip>
      </div>

      {scope === 'school' && (
        <ul className="flex flex-col gap-2">
          {methods.map((m) => (
            <li key={m.method} data-method={m.method} className="flex flex-wrap items-center gap-2 border-t border-slate/10 pt-2 text-sm text-slate">
              <span className="min-w-0 flex-1 font-semibold">{t(`rails.method.${m.method}` as MessageKey)}</span>
              <span className="flex items-center gap-2">
                <Badge variant={m.enabled ? 'success' : 'neutral'}>{t(m.enabled ? 'set.on' : 'set.off')}</Badge>
                {mayEdit && m.method !== 'counter' && m.method !== 'direct_upi' && (
                  <button type="button" data-method-toggle disabled={busy} className={TAP} onClick={() => void toggle(m)}>
                    {t(m.enabled ? 'rails.switchOff' : 'rails.switchOn')}
                  </button>
                )}
              </span>
              <InfoTip label={t(`rails.method.${m.method}` as MessageKey)}>{t(`rails.method.${m.method}.what` as MessageKey)}</InfoTip>
            </li>
          ))}
        </ul>
      )}

      {note && (
        <p role={note.bad ? 'alert' : 'status'} data-rails-note className={`rounded-md px-3 py-2 text-sm font-semibold ${note.bad ? 'bg-tangerine/10 text-slate' : 'bg-emerald/10 text-slate'}`}>
          {note.text}
        </p>
      )}

      {scope === 'school' && (
        <div data-upi-setup className="flex flex-col gap-3 border-t border-slate/10 pt-3">
          <div className="flex flex-wrap items-center gap-x-1">
            <h3 className="text-base font-bold text-slate">{t('rails.upi.title')}</h3>
            <InfoTip>{t('rails.upi.how')}</InfoTip>
          </div>
          <fieldset disabled={!mayEdit || busy} className="grid gap-3 sm:grid-cols-2">
            <Input id="upi-id" label={t('rails.upi.upiId')} helperText={t('rails.upi.upiId.hint')} autoComplete="off" value={upi.upiId} onChange={(e) => setUpi({ ...upi, upiId: e.target.value })} />
            <Input id="upi-payee" label={t('rails.upi.payee')} maxLength={80} value={upi.payeeName} onChange={(e) => setUpi({ ...upi, payeeName: e.target.value })} />
            <Input id="upi-bank" label={t('rails.upi.bank')} maxLength={60} value={upi.bankName} onChange={(e) => setUpi({ ...upi, bankName: e.target.value })} />
            <Input id="upi-last4" label={t('rails.upi.last4')} inputMode="numeric" maxLength={4} value={upi.accountLast4} onChange={(e) => setUpi({ ...upi, accountLast4: e.target.value })} />
            <Input id="upi-ifsc" label={t('rails.upi.ifsc')} maxLength={11} value={upi.ifsc} onChange={(e) => setUpi({ ...upi, ifsc: e.target.value.toUpperCase() })} />
            <Input id="upi-limit" label={t('rails.upi.limit')} helperText={t('rails.upi.limit.hint')} inputMode="numeric" value={upi.limitRupees} onChange={(e) => setUpi({ ...upi, limitRupees: e.target.value })} />
            <div className="flex flex-col gap-1 text-sm text-slate">
              <span className="font-semibold">{t('rails.upi.verifiers')}</span>
              {VERIFIERS.map((role) => (
                <Checkbox key={role} id={`upi-verifier-${role}`} label={t(`role.${role}` as MessageKey)} checked={upi.verifiers.includes(role)} onChange={(e) => setUpi({ ...upi, verifiers: e.target.checked ? [...upi.verifiers, role] : upi.verifiers.filter((v) => v !== role) })} />
              ))}
            </div>
            <Select id="upi-notify" label={t('rails.upi.notify')} value={upi.notify} onChange={(e) => setUpi({ ...upi, notify: e.target.value })}>
              <option value="digest">{t('rails.upi.notify.digest')}</option>
              <option value="each">{t('rails.upi.notify.each')}</option>
            </Select>
          </fieldset>
          {mayEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" data-upi-save disabled={busy} className={PRIMARY} onClick={() => void saveUpi(true)}>
                {t('rails.upi.save')}
              </button>
              <button type="button" disabled={busy} className={TAP} onClick={() => void saveUpi(false)}>
                {t('rails.upi.saveOff')}
              </button>
            </div>
          )}
        </div>
      )}

      <div data-gateway className="flex flex-col gap-3 border-t border-slate/10 pt-3">
        <div className="flex flex-wrap items-center gap-x-1">
          <h3 className="text-base font-bold text-slate">{t('rails.gateway.title')}</h3>
          <InfoTip>
            {t('rails.gateway.how')} {!gateway.testSchool && <span data-test-keys-note>{t('rails.keys.testOnly')}</span>} {mayEdit && t('rails.keys.writeOnly')}
          </InfoTip>
        </div>
        <p data-gateway-allowed className="text-sm font-semibold text-slate">{t(gateway.allowed ? 'rails.gateway.allowed' : 'rails.gateway.notAllowed')}</p>
        {gateway.credentials.map((c) => (
          <div key={c.configId} data-saved-keys={c.mode} className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">
            <p className="font-semibold">
              {t(c.mode === 'live' ? 'rails.mode.live' : 'rails.mode.test')}: {t('rails.keys.ending', { last4: c.keyLast4, date: date(c.savedAt), by: c.savedFrom === 'control' ? t('rails.keys.byNetCyberAI') : (c.savedByName ?? '') })}
            </p>
            <p className="text-slate/70">{c.testOk === null ? t('rails.keys.notTested') : c.testOk ? t('rails.keys.testOk', { date: date(c.testedAt as string) }) : t('rails.keys.testFailed', { message: c.testMessage ?? '' })}</p>
            {mayEdit && (
              <button type="button" data-test-keys={c.mode} disabled={busy} className={`${TAP} my-1`} onClick={() => void testKeys(c.mode)}>
                {t('rails.keys.test')}
              </button>
            )}
            <p className="break-all text-xs text-slate/70">{t('rails.keys.webhook', { url: `${typeof window === 'undefined' ? '' : window.location.origin}${c.webhookPath}` })}</p>
          </div>
        ))}
        {!gateway.canSave && <p role="status" data-no-key className="rounded-md bg-tangerine/10 px-3 py-2 text-sm font-semibold text-slate">{t('rails.keys.error.no_encryption_key')}</p>}
        {mayEdit && (
          <form onSubmit={saveKeys} className="grid gap-3 sm:grid-cols-2" autoComplete="off">
            <Select id="rails-mode" label={t('rails.mode')} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              <option value="test">{t('rails.mode.test')}</option>
              <option value="live">{t('rails.mode.live')}</option>
            </Select>
            <Input id="rails-key-id" label={t('rails.keys.keyId')} autoComplete="off" value={form.keyId} onChange={(e) => setForm({ ...form, keyId: e.target.value })} required />
            <Input id="rails-key-secret" label={t('rails.keys.keySecret')} type="password" autoComplete="new-password" value={form.keySecret} onChange={(e) => setForm({ ...form, keySecret: e.target.value })} required />
            <Input id="rails-webhook-secret" label={t('rails.keys.webhookSecret')} type="password" autoComplete="new-password" value={form.webhookSecret} onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })} required />
            {scope === 'control' && <Input id="rails-reason" label={t('rails.reason')} maxLength={300} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />}
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
              <button type="submit" data-save-keys disabled={busy || !gateway.canSave} className={PRIMARY}>
                {t('rails.keys.save')}
              </button>
              {scope === 'control' && (
                <button type="button" data-gateway-access disabled={busy || !form.reason.trim()} className={TAP} onClick={() => void setAccess(!gateway.allowed)}>
                  {t(gateway.allowed ? 'rails.gateway.stop' : 'rails.gateway.allow')}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
