'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import type { MessageKey } from '@/lib/i18n';

// Control → the platform's WhatsApp account (docs/25 slice 7e, C186). The secrets are typed here and never shown
// again: the screen says which number is connected, the last four characters of the token, and who saved it.
// Saved switched off; "Test the connection" asks Meta about the number and sends nothing; the switch needs a
// test that passed.

type Account = { phoneNumberId: string; wabaId: string; tokenLast4: string; enabled: boolean; savedAt: string; savedByName: string | null; testedAt: string | null; testOk: boolean | null; testMessage: string | null };
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const EMPTY = { phoneNumberId: '', wabaId: '', accessToken: '', appSecret: '', verifyToken: '' };
const PROBLEMS = ['no_encryption_key', 'phone_number_id', 'waba_id', 'access_token', 'app_secret', 'verify_token', 'not_tested', 'no_account'];

export function WhatsAppAccountPanel() {
  const { t, lang } = useT();
  const [state, setState] = useState<{ account: Account | null; keyAvailable: boolean; webhookPath: string; unknownSenders?: number } | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/control/whatsapp').catch(() => null);
    setState(res?.ok ? await res.json().catch(() => null) : null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>, done: (a: Record<string, unknown>) => string) {
    setBusy(true);
    const res = await fetch('/api/control/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    setNote(res?.ok ? done(answer) : t(PROBLEMS.includes(answer.code) ? (`wa.bad.${answer.code}` as MessageKey) : 'wa.bad'));
    if (res?.ok && body.action === 'save') setForm(EMPTY);
    void load();
  }

  if (!state) return null;
  const a = state.account;
  const field = (key: keyof typeof EMPTY, secret = false) => <Input id={`wa-${key}`} label={t(`wa.field.${key}` as MessageKey)} type={secret ? 'password' : 'text'} autoComplete="off" maxLength={secret ? 700 : 40} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />;
  return (
    <section lang={lang} data-whatsapp-account className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4 text-sm text-slate">
        <p>{t('wa.how')}</p>
        {!state.keyAvailable && <p role="alert" data-wa-no-key className="rounded-md border border-tangerine/40 bg-off-white px-3 py-2 font-semibold">{t('wa.noKey')}</p>}
        <p data-wa-unknown className="text-slate/80">{t('wa.unknown', { count: state.unknownSenders ?? 0 })}</p>
        {note && <p role="status" data-wa-note className="rounded-md bg-off-white px-3 py-2 font-semibold">{note}</p>}
      </div>

      <div data-wa-current className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4 text-sm text-slate">
        <h2 className="text-base font-bold">{t('wa.current')}</h2>
        {!a ? (
          <p className="rounded-md bg-off-white px-3 py-2">{t('wa.none')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={a.enabled ? 'success' : 'neutral'}>{t(a.enabled ? 'wa.on' : 'wa.off')}</Badge>
              <Badge variant={a.testOk === true ? 'success' : a.testOk === false ? 'danger' : 'warning'}>{t(a.testOk === true ? 'wa.test.passed' : a.testOk === false ? 'wa.test.failed' : 'wa.test.none')}</Badge>
            </div>
            <p>{t('wa.saved', { phone: a.phoneNumberId, waba: a.wabaId, last4: a.tokenLast4, by: a.savedByName ?? '—' })}</p>
            {a.testMessage && <p className="text-slate/80">{a.testMessage}</p>}
            <p className="text-slate/80">{t('wa.webhook', { path: state.webhookPath })}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-wa-test disabled={busy} className={TAP} onClick={() => void post({ action: 'test' }, (r) => String(r.message ?? ''))}>{t('wa.test')}</button>
              {a.enabled ? (
                <button type="button" data-wa-off disabled={busy} className={TAP} onClick={() => void post({ action: 'off' }, () => t('wa.switchedOff'))}>{t('wa.switchOff')}</button>
              ) : (
                <button type="button" data-wa-on disabled={busy || a.testOk !== true} className={PRIMARY} onClick={() => void post({ action: 'on' }, () => t('wa.switchedOn'))}>{t('wa.switchOn')}</button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4 text-sm text-slate">
        <h2 className="text-base font-bold">{t(a ? 'wa.replace' : 'wa.enter')}</h2>
        <p className="text-slate/70">{t('wa.enter.how')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('phoneNumberId')}
          {field('wabaId')}
          {field('accessToken', true)}
          {field('appSecret', true)}
          {field('verifyToken', true)}
        </div>
        <button type="button" data-wa-save disabled={busy || !state.keyAvailable || Object.values(form).some((v) => !v.trim())} className={`${PRIMARY} self-start`} onClick={() => void post({ action: 'save', ...form }, () => t('wa.savedNow'))}>
          {t('wa.save')}
        </button>
      </div>
    </section>
  );
}
