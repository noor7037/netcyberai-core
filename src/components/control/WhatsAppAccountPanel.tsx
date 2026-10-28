'use client';

import { useStepUp } from '@/components/auth/StepUp';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import type { MessageKey } from '@/lib/i18n';
import { ACCOUNT_FIELDS, ACCOUNT_SHAPE, PROBLEM_FIELD, VERIFY_TOKEN_LENGTH, fieldFault, makeVerifyToken, type AccountField, type AccountProblem } from '@/lib/whatsapp/account-shape';

// Control → the platform's WhatsApp account (docs/25 slice 7e, C186). The secrets are typed here and never shown
// again: the screen says which number is connected, the last four characters of the token, and who saved it.
// Saved switched off; "Test the connection" asks Meta about the number and sends nothing; the switch needs a
// test that passed.
//
// Each field says, while it is typed, what belongs in it and what is wrong with it (the one rule in
// src/lib/whatsapp/account-shape.ts, the same the server refuses with), so a paste slip is named before Save is
// pressed; a refusal keeps what was typed and marks the field. The verify token is not a secret (Meta sends it
// back in the clear), so it is shown as typed and can be made here; the two real secrets can be shown on
// request, since a long token pasted blind cannot be checked. "new-password" keeps a browser's saved passwords
// out of the boxes.

type Account = { phoneNumberId: string; wabaId: string; tokenLast4: string; enabled: boolean; savedAt: string; savedByName: string | null; testedAt: string | null; testOk: boolean | null; testMessage: string | null };
type State = { account: Account | null; keyAvailable: boolean; webhookPath: string; unknownSenders?: number };
type Note = { tone: 'ok' | 'bad'; text: string };
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const EMPTY: Record<AccountField, string> = { phoneNumberId: '', wabaId: '', accessToken: '', appSecret: '', verifyToken: '' };
const PROBLEMS = ['no_encryption_key', 'phone_number_id', 'waba_id', 'access_token', 'app_secret', 'verify_token', 'not_tested', 'no_account'];
const FIELD_PROBLEMS: AccountProblem[] = ['phone_number_id', 'waba_id', 'access_token', 'app_secret', 'verify_token'];
const HIDDEN: AccountField[] = ['accessToken', 'appSecret'];
const NUMERIC: AccountField[] = ['phoneNumberId', 'wabaId'];
const CHARS_KEY: Record<AccountField, MessageKey> = { phoneNumberId: 'wa.fault.digits', wabaId: 'wa.fault.digits', accessToken: 'wa.fault.chars.accessToken', appSecret: 'wa.fault.chars.appSecret', verifyToken: 'wa.fault.chars.verifyToken' };

export function WhatsAppAccountPanel() {
  const { stepUpFetch } = useStepUp();
  const { t, lang } = useWords();
  // undefined while loading; null when the server did not answer.
  const [state, setState] = useState<State | null | undefined>(undefined);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [refused, setRefused] = useState<AccountField | null>(null);
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const noteRef = useRef<HTMLParagraphElement>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/control/whatsapp').catch(() => null);
    setState(res?.ok ? ((await res.json().catch(() => null)) as State | null) : null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // The outcome is the first thing to read after any button.
  useEffect(() => {
    if (note) noteRef.current?.scrollIntoView({ block: 'nearest' });
  }, [note]);

  async function post(body: Record<string, unknown>, done: (a: Record<string, unknown>) => string) {
    setBusy(true);
    const res = await stepUpFetch('/api/control/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    const code = typeof answer.code === 'string' ? answer.code : '';
    if (res?.ok) {
      // A connection test answers 200 with ok:false when Meta refused: that is a red banner, not a green one.
      setNote({ tone: answer.ok === false ? 'bad' : 'ok', text: done(answer) });
      if (body.action === 'save' || body.action === 'secret') {
        setForm(EMPTY);
        setRefused(null);
      }
    } else {
      const field = FIELD_PROBLEMS.includes(code as AccountProblem) ? PROBLEM_FIELD[code as AccountProblem] : null;
      setRefused(field);
      const why = t(PROBLEMS.includes(code) ? (`wa.bad.${code}` as MessageKey) : 'wa.bad');
      setNote({ tone: 'bad', text: field ? `${why} ${t('wa.refused')}` : why });
    }
    void load();
  }

  // Checked here first, so the reason is on the screen before anything is sent.
  function save() {
    for (const field of ACCOUNT_FIELDS) {
      if (fieldFault(field, form[field]) !== null) {
        setRefused(field);
        setNote({ tone: 'bad', text: `${t(`wa.bad.${ACCOUNT_SHAPE[field].problem}` as MessageKey)} ${t('wa.refused')}` });
        return;
      }
    }
    void post({ action: 'save', ...form }, () => t('wa.savedNow'));
  }

  // A saved account whose App Secret alone is typed again: only that is replaced.
  function saveSecret() {
    if (fieldFault('appSecret', form.appSecret) !== null) {
      setRefused('appSecret');
      setNote({ tone: 'bad', text: `${t('wa.bad.app_secret')} ${t('wa.refused')}` });
      return;
    }
    void post({ action: 'secret', appSecret: form.appSecret }, () => t('wa.secretSavedNow'));
  }

  function makeToken() {
    const bytes = new Uint8Array(VERIFY_TOKEN_LENGTH);
    crypto.getRandomValues(bytes);
    setForm({ ...form, verifyToken: makeVerifyToken(bytes) });
    if (refused === 'verifyToken') setRefused(null);
  }

  function copy(text: string) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }

  if (state === undefined) return null;
  if (state === null) {
    return (
      <p role="alert" data-wa-load-failed lang={lang} className="rounded-md border-2 border-red-600 bg-white px-4 py-3 text-base font-bold text-red-800">
        {t('wa.loadFailed')}
      </p>
    );
  }
  const a = state.account;
  const secretOnly = a !== null && form.appSecret.trim() !== '' && ACCOUNT_FIELDS.every((f) => f === 'appSecret' || !form[f].trim());
  const webhookUrl = `${window.location.origin}${state.webhookPath}`;

  const field = (key: AccountField) => {
    const shape = ACCOUNT_SHAPE[key];
    const value = form[key];
    const fault = fieldFault(key, value);
    const secret = HIDDEN.includes(key);
    const n = value.length;
    const error =
      fault === 'space' ? t('wa.fault.space') : fault === 'chars' ? t(CHARS_KEY[key]) : fault === 'short' ? t('wa.fault.short', { n, min: shape.min }) : fault === 'long' ? t('wa.fault.long', { n, max: shape.max }) : refused === key ? t(`wa.bad.${shape.problem}` as MessageKey) : undefined;
    return (
      <Input
        id={`wa-${key}`}
        label={t(`wa.field.${key}` as MessageKey)}
        type={secret && !show ? 'password' : 'text'}
        autoComplete={secret ? 'new-password' : 'off'}
        spellCheck={false}
        inputMode={NUMERIC.includes(key) ? 'numeric' : undefined}
        maxLength={shape.max + 100}
        value={value}
        error={error}
        success={fault === null && !error ? t('wa.fault.ok', { n }) : undefined}
        helperText={fault === 'empty' ? t(`wa.hint.${key}` as MessageKey) : undefined}
        onChange={(e) => {
          // No id, token or secret Meta gives has a space or a line break in it: a pasted one loses them here (C230-D).
          setForm({ ...form, [key]: e.target.value.replace(/\s+/g, '') });
          if (refused === key) setRefused(null);
        }}
      />
    );
  };

  return (
    <section lang={lang} data-whatsapp-account className="flex flex-col gap-4">
      {note && (
        <p ref={noteRef} role={note.tone === 'bad' ? 'alert' : 'status'} data-wa-note data-tone={note.tone} className={`rounded-md border-2 bg-white px-4 py-3 text-base font-bold ${note.tone === 'ok' ? 'border-emerald-text text-emerald-text' : 'border-red-600 text-red-800'}`}>
          {note.text}
        </p>
      )}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate/10 bg-white p-4 text-sm text-slate shadow-sm">
        {!state.keyAvailable && <p role="alert" data-wa-no-key className="rounded-md border border-tangerine/40 bg-off-white px-3 py-2 font-semibold">{t('wa.noKey')}</p>}
        <div className="flex flex-wrap items-center gap-x-1">
          <p data-wa-unknown className="text-slate/80">{t('wa.unknown', { count: state.unknownSenders ?? 0 })}</p>
          <InfoTip>{t('wa.unknown.how')}</InfoTip>
        </div>
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
        <div data-wa-webhook className="mt-2 flex flex-col gap-2 rounded-md bg-off-white p-3">
          <div className="flex flex-wrap items-center gap-x-1">
            <p className="font-semibold">{t('wa.webhook.url')}</p>
            <InfoTip tone="white">
              {t('wa.webhook.where')} {t('wa.webhook.when')}
            </InfoTip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-white px-2 py-1 text-sm">{webhookUrl}</code>
            <button type="button" data-wa-copy className={TAP} onClick={() => copy(webhookUrl)}>{t(copied ? 'wa.copied' : 'wa.copy')}</button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4 text-sm text-slate">
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold">{t(a ? 'wa.replace' : 'wa.enter')}</h2>
          <InfoTip>{t('wa.enter.how')}</InfoTip>
        </div>
        {a && <p data-wa-secret-only>{t('wa.secretOnly')}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {field('phoneNumberId')}
          {field('wabaId')}
          {field('accessToken')}
          {field('appSecret')}
          <div className="flex flex-col gap-2 sm:col-span-2">
            {field('verifyToken')}
            <button type="button" data-wa-make-token className={`${TAP} self-start`} onClick={makeToken}>{t('wa.makeToken')}</button>
          </div>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm font-medium">
          <input type="checkbox" data-wa-show className="h-5 w-5" checked={show} onChange={(e) => setShow(e.target.checked)} />
          {t('wa.show')}
        </label>
        <button type="button" data-wa-save disabled={busy || !state.keyAvailable || (!secretOnly && ACCOUNT_FIELDS.some((f) => !form[f].trim()))} className={`${PRIMARY} self-start`} onClick={secretOnly ? saveSecret : save}>
          {t(secretOnly ? 'wa.saveSecret' : 'wa.save')}
        </button>
      </div>
    </section>
  );
}
