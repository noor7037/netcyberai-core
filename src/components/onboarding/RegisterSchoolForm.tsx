'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Script from 'next/script';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Honeypot } from '@/components/marketing/Honeypot';
import { BOARDS, BOARD_LABELS, INDIAN_STATES } from '@/lib/onboarding/states';

// "Register your school" (C98): the application, then the 6-digit code
// from the email we send to confirm the address. Cloudflare Turnstile
// shows only when its site key is configured (off until then; the
// honeypot and the server's rate limits work without it).

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

type Values = {
  schoolName: string;
  city: string;
  stateCode: string;
  board: string;
  approxStudents: string;
  principalName: string;
  email: string;
  mobile: string;
};
const EMPTY: Values = { schoolName: '', city: '', stateCode: '', board: '', approxStudents: '', principalName: '', email: '', mobile: '' };

type Step = { kind: 'form' } | { kind: 'code'; applicationId: string; maskedEmail: string } | { kind: 'done' } | { kind: 'already' };

const ERRORS: Record<string, string> = {
  rate_limited: 'We received several applications from here in the last hour. Please try again later, or contact us.',
  challenge_failed: 'Please complete the check above the button, then submit again.',
  rejected: 'This submission could not be accepted.',
  unavailable: 'We could not save your application just now. Please try again in a few minutes.',
  wrong_code: 'That code is not right. Type the 6-digit code from the newest email we sent.',
  expired: 'That code has expired. Send a new code and use that one.',
  too_many_attempts: 'Too many wrong codes. Please start the application again later.',
  wait: 'We sent a code a moment ago. Wait a minute before asking for another.',
  too_many_codes: 'We have sent the most codes we can for this application. Please contact us.',
  not_found: 'This application is no longer waiting for a code. Please start again.',
};
const NETWORK = 'We could not reach the server. Check your connection and try again.';

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

declare global {
  interface Window {
    ncaTurnstileDone?: (token: string) => void;
  }
}

export function RegisterSchoolForm() {
  const [step, setStep] = useState<Step>({ kind: 'form' });
  const [values, setValues] = useState<Values>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [website, setWebsite] = useState('');
  const [token, setToken] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.ncaTurnstileDone = (t: string) => setToken(t);
    return () => {
      delete window.ncaTurnstileDone;
    };
  }, []);

  const update = (key: keyof Values, value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const { ok, data } = await post('/api/public/school-applications', { ...values, website, turnstileToken: token });
      if (!ok) {
        if (data.error === 'invalid') setFieldErrors((data.fields ?? {}) as Partial<Record<keyof Values, string>>);
        else setError(ERRORS[String(data.error)] ?? ERRORS.unavailable);
        return;
      }
      if (data.status === 'already_received') return setStep({ kind: 'already' });
      setCode('');
      setNotice(data.codeSent === false ? ERRORS.wait : null);
      setStep({ kind: 'code', applicationId: String(data.applicationId), maskedEmail: String(data.maskedEmail) });
    } catch {
      setError(NETWORK);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (step.kind !== 'code') return;
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await post('/api/public/school-applications/verify', { applicationId: step.applicationId, code });
      if (!ok) {
        const left = typeof data.attemptsLeft === 'number' ? ` ${data.attemptsLeft} tries left.` : '';
        return setError((ERRORS[String(data.error)] ?? ERRORS.unavailable) + (data.error === 'wrong_code' ? left : ''));
      }
      setStep({ kind: 'done' });
    } catch {
      setError(NETWORK);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (step.kind !== 'code') return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { ok, data } = await post('/api/public/school-applications/resend', { applicationId: step.applicationId });
      if (!ok) return setError(ERRORS[String(data.error)] ?? ERRORS.unavailable);
      const at = new Date();
      setNotice(`New code sent at ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}. Only the newest code works.`);
    } catch {
      setError(NETWORK);
    } finally {
      setBusy(false);
    }
  }

  if (step.kind === 'done' || step.kind === 'already') {
    return (
      <div role="status" className="rounded-lg border border-emerald/30 bg-emerald/5 p-6">
        <h2 className="text-lg font-bold text-slate">{step.kind === 'done' ? 'Application received' : 'We already have this application'}</h2>
        <p className="mt-2 text-slate/80">
          {step.kind === 'done'
            ? 'Your email is confirmed. Our team reviews every application. Once your school is approved, the principal gets an email invitation to set a password and sign in.'
            : 'An application for this school from this email is already with our team. The principal gets an email invitation once it is approved.'}
        </p>
      </div>
    );
  }

  if (step.kind === 'code') {
    return (
      <form onSubmit={verify} className="flex flex-col gap-4 rounded-lg border border-slate/10 bg-white p-6">
        <p className="text-sm font-bold text-royal">Step 2 of 2</p>
        <h2 className="-mt-2 text-xl font-extrabold text-slate">Confirm your email</h2>
        <Input
          id="application-code"
          label={`6-digit code from the email we just sent to ${step.maskedEmail}`}
          helperText="The code works for 15 minutes. Check spam if it has not arrived."
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Checking…' : 'Confirm and send application'}
        </Button>
        <p className="text-sm text-slate/70">
          No email?{' '}
          <button type="button" disabled={busy} onClick={resend} className="font-semibold text-royal underline disabled:opacity-50">
            Send a new code
          </button>
        </p>
        {notice && !error && (
          <p role="status" className="text-sm text-slate/80">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-red-800">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="relative flex flex-col gap-4 rounded-lg border border-slate/10 bg-white p-6" noValidate>
      <p className="text-sm font-bold text-royal">Step 1 of 2</p>
      <h2 className="-mt-2 text-xl font-extrabold text-slate">About your school</h2>
      <Honeypot value={website} onChange={setWebsite} />
      <Input id="reg-school-name" label="School name" required value={values.schoolName} error={fieldErrors.schoolName} onChange={(e) => update('schoolName', e.target.value)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input id="reg-city" label="City or town" required value={values.city} error={fieldErrors.city} onChange={(e) => update('city', e.target.value)} />
        <Select id="reg-state" label="State" required value={values.stateCode} error={fieldErrors.stateCode} onChange={(e) => update('stateCode', e.target.value)}>
          <option value="">Choose…</option>
          {INDIAN_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select id="reg-board" label="Board" required value={values.board} error={fieldErrors.board} onChange={(e) => update('board', e.target.value)}>
          <option value="">Choose…</option>
          {BOARDS.map((b) => (
            <option key={b} value={b}>
              {BOARD_LABELS[b]}
            </option>
          ))}
        </Select>
        <Input
          id="reg-students"
          label="Approximate number of students"
          helperText="Optional"
          inputMode="numeric"
          value={values.approxStudents}
          error={fieldErrors.approxStudents}
          onChange={(e) => update('approxStudents', e.target.value)}
        />
      </div>
      <Input id="reg-principal" label="Principal’s name" required value={values.principalName} error={fieldErrors.principalName} onChange={(e) => update('principalName', e.target.value)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id="reg-email"
          label="Principal’s email"
          type="email"
          autoComplete="email"
          required
          helperText="We send a code here, and later the invitation."
          value={values.email}
          error={fieldErrors.email}
          onChange={(e) => update('email', e.target.value)}
        />
        <Input
          id="reg-mobile"
          label="Principal’s mobile"
          type="tel"
          autoComplete="tel"
          required
          value={values.mobile}
          error={fieldErrors.mobile}
          onChange={(e) => update('mobile', e.target.value)}
        />
      </div>
      {TURNSTILE_SITE_KEY && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
          <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} data-callback="ncaTurnstileDone" />
        </>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Sending…' : 'Continue: email me a code'}
      </Button>
      <p className="text-xs text-slate/70">
        We use these details only to review your application and contact the principal. Parents and students never need an account.
      </p>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-800">
          {error}
        </p>
      )}
    </form>
  );
}
