'use client';

// Staff sign-in. C89: password, a one-time code sent to the account's
// email, or "set or reset your password" with an emailed code, all ending in
// the same authenticator and school-choice steps. C90: email or mobile number.
// C96 (founder, 2026-09-30, reverses C90/C95 where they conflict): an
// account with an authenticator app signs in with password, then that app's
// code, and gets no email code; everyone else gets the email code. Every
// code is named by where it comes from, and a guide beside the form (or
// folded under it on phones) follows the current step: src/app/login/guidance.ts.

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';
import { Input } from '@/components/ui/Input';
import { AuthenticatorEnrolment, type EnrolmentView } from '@/components/account/AuthenticatorEnrolment';
import {
  AUTHENTICATOR_NOT_EMAIL,
  EMAIL_CODE_NOT_AUTHENTICATOR,
  ERROR_TEXT,
  authenticatorCodeLabel,
  emailCodeLabel,
  guidanceFor,
  humanError,
  newestCodeLine,
  type Guidance,
} from './guidance';

const NETWORK_ERROR = 'We could not reach the server. Check your connection and try again.';

// Supabase sends people back with #error_code=... when an emailed link fails.
const LINK_ERROR_TEXT: Record<string, string> = {
  otp_expired: ERROR_TEXT.link_invalid,
  access_denied: ERROR_TEXT.link_invalid,
};

type Membership = { membershipId: string; schoolId: string; schoolName: string; role: string };

type Step =
  | { kind: 'credentials' }
  | { kind: 'code_request' }
  | { kind: 'code_verify' }
  | { kind: 'reset_request' }
  | { kind: 'reset_verify' }
  | { kind: 'reset_mfa' }
  | { kind: 'link_password' }
  | { kind: 'link_checking' }
  | { kind: 'email_step'; maskedEmail: string; setupNext: boolean }
  | { kind: 'mfa' }
  | { kind: 'mfa_setup'; enrolment: EnrolmentView | null }
  | { kind: 'select_school'; memberships: Membership[] }
  | { kind: 'done'; role: string; schoolId: string | null };

function formatRole(role: string): string {
  return role
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function LoginPage() {
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [remember, setRemember] = useState(false);
  // When the newest emailed code was sent (C96): shown in the guide.
  const [codeSentAt, setCodeSentAt] = useState<Date | null>(null);
  // Resend is paused while the email service would refuse it anyway (C91),
  // with the seconds shown, instead of an error after every tap.
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  function startCooldown(seconds: number) {
    setNow(Date.now());
    setCooldownUntil(Date.now() + seconds * 1000);
  }

  // Links such as /login?mode=reset (sent to first-time staff) open the
  // right step directly. Links from emails land here too (C91): Supabase's
  // own (#access_token=... or #error_code=...) and our own (?th=...&type=...).
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const mode = search.get('mode');
    const tokenHash = search.get('th');
    const linkError = hash.get('error_code') ?? (hash.get('error') ? 'access_denied' : null);
    const accessToken = hash.get('access_token');
    if (tokenHash || accessToken || linkError) window.history.replaceState(null, '', '/login');

    if (linkError) {
      setStep({ kind: 'code_request' });
      setError(LINK_ERROR_TEXT[linkError] ?? ERROR_TEXT.link_invalid);
    } else if (tokenHash || accessToken) {
      const body = tokenHash
        ? { tokenHash, type: search.get('type') }
        : { accessToken, refreshToken: hash.get('refresh_token'), type: hash.get('type') };
      setStep({ kind: 'link_checking' });
      setSubmitting(true);
      post('/api/auth/link', body)
        .then(({ ok, data }) => {
          if (!ok) {
            setStep({ kind: 'code_request' });
            setError(humanError(data.error, ERROR_TEXT.link_invalid));
          } else if (data.status === 'set_password') {
            setPassword('');
            setConfirm('');
            setStep({ kind: 'link_password' });
          } else {
            signedIn(data);
          }
        })
        .catch(() => {
          setStep({ kind: 'code_request' });
          setError(NETWORK_ERROR);
        })
        .finally(() => setSubmitting(false));
    } else if (mode === 'reset') setStep({ kind: 'reset_request' });
    else if (mode === 'code') setStep({ kind: 'code_request' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go(next: Step) {
    setError(null);
    setNotice(null);
    setStep(next);
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await action();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  // Every way in ends here: the same answers as password sign-in.
  function signedIn(data: Record<string, unknown>) {
    if (data.status === 'email_step') {
      setEmailCode('');
      setCodeSentAt(new Date());
      setStep({ kind: 'email_step', maskedEmail: String(data.maskedEmail ?? 'your email'), setupNext: data.setupNext === true });
    } else if (data.status === 'mfa_required') {
      setCode('');
      setStep({ kind: 'mfa' });
    } else if (data.status === 'mfa_setup') {
      // A platform admin with no authenticator yet enrols one here (C95).
      setStep({ kind: 'mfa_setup', enrolment: null });
    } else if (data.status === 'select_school') {
      setStep({ kind: 'select_school', memberships: data.memberships as Membership[] });
    } else if (data.status === 'ok') {
      const role = data.role as string;
      setStep({ kind: 'done', role, schoolId: (data.schoolId as string | null) ?? null });
      // Each role lands on its own home (C230-D): the founder on Control, a parent on the family app, staff on the school app.
      window.location.href = role === 'super_admin' ? '/control' : role === 'parent' ? '/parent' : '/app';
    }
  }

  const submitCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { ok, data } = await post('/api/auth/login', { identifier: email, password });
      if (!ok) return setError(humanError(data.error, 'Sign-in failed. Please try again.'));
      signedIn(data);
    });
  };

  const submitEmailStep = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { ok, data } = await post('/api/auth/email-step', { code: emailCode, rememberDevice: remember });
      if (!ok) return setError(humanError(data.error, 'That code did not work. Please try again.'));
      signedIn(data);
    });
  };

  // A refused send is not a dead end: the person may already have a code or
  // link from an earlier email, so they are taken to where they can use it.
  function sendRefused(data: Record<string, unknown>): boolean {
    if (data.error === 'rate_limited') {
      const wait = Number(data.retryAfter) || 60;
      startCooldown(wait);
      setNotice(
        `We already sent an email a moment ago. Type the code from the newest one. You can ask for another in ${wait} seconds.`
      );
      return true;
    }
    if (data.error === 'email_limit') {
      startCooldown(60);
      setError(ERROR_TEXT.email_limit);
      return true;
    }
    return false;
  }

  const resendEmailStep = () =>
    run(async () => {
      const { ok, data } = await post('/api/auth/email-step', { resend: true });
      if (!ok) {
        if (sendRefused(data)) return;
        return setError(humanError(data.error, 'We could not send a new code. Please try again.'));
      }
      startCooldown(60);
      const at = new Date();
      setCodeSentAt(at);
      setNotice(newestCodeLine(at));
    });

  const sendCode = (purpose: 'login' | 'reset') => (e?: React.FormEvent) => {
    e?.preventDefault();
    return run(async () => {
      const { ok, data } = await post('/api/auth/code/request', { identifier: email, purpose });
      const next: Step = { kind: purpose === 'login' ? 'code_verify' : 'reset_verify' };
      if (!ok) {
        if (sendRefused(data)) return setStep(next);
        return setError(humanError(data.error, 'We could not send a code. Check the email and try again.'));
      }
      setEmailCode('');
      setStep(next);
      startCooldown(60);
      const at = new Date();
      setCodeSentAt(at);
      setNotice(`${newestCodeLine(at)} It can take a minute; check spam too.`);
    });
  };

  // "I already have a code": go straight to entering it, without sending
  // another email (which would replace the code already sent).
  const haveCode = (purpose: 'login' | 'reset') => () => {
    if (!email.trim()) {
      setError('Enter your email or mobile number first.');
      return;
    }
    go({ kind: purpose === 'login' ? 'code_verify' : 'reset_verify' });
  };

  const submitLinkPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    return run(async () => {
      const { ok, data } = await post('/api/auth/password/reset', { continue: true, newPassword: password, rememberDevice: remember });
      if (!ok) {
        if (data.error === 'mfa_required') {
          setCode('');
          setStep({ kind: 'reset_mfa' });
          return;
        }
        return setError(humanError(data.error, 'We could not save that password. Please try again.'));
      }
      signedIn(data);
    });
  };

  const submitEmailCode = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { ok, data } = await post('/api/auth/code/verify', { identifier: email, code: emailCode, rememberDevice: remember });
      if (!ok) return setError(humanError(data.error, 'That code did not work. Please try again.'));
      signedIn(data);
    });
  };

  const submitReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    return run(async () => {
      const { ok, data } = await post('/api/auth/password/reset', {
        identifier: email,
        code: emailCode,
        newPassword: password,
        rememberDevice: remember,
      });
      if (!ok) return setError(humanError(data.error, 'We could not save that password. Please try again.'));
      if (data.status === 'mfa_required') {
        setCode('');
        setStep({ kind: 'reset_mfa' });
        return;
      }
      signedIn(data);
    });
  };

  const submitResetMfa = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { ok, data } = await post('/api/auth/password/reset', {
        continue: true,
        newPassword: password,
        mfaCode: code,
        rememberDevice: remember,
      });
      if (!ok) return setError(humanError(data.error, 'That code did not work. Please try again.'));
      signedIn(data);
    });
  };

  const submitMfa = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { ok, data } = await post('/api/auth/mfa/verify', { code });
      if (!ok) return setError(humanError(data.error, 'That code did not work. Check your authenticator app and try again.'));
      signedIn(data);
    });
  };

  // C95: enrolment starts as soon as the step opens; the QR code and setup
  // key come back to this screen only.
  const startSetup = () =>
    run(async () => {
      const { ok, data } = await post('/api/auth/mfa/setup/start', {});
      if (!ok) return setError(humanError(data.error, ERROR_TEXT.mfa_enroll_failed));
      setStep({
        kind: 'mfa_setup',
        enrolment: { factorId: String(data.factorId), qrCode: String(data.qrCode), setupKey: String(data.setupKey), uri: String(data.uri) },
      });
    });

  // One enrolment per visit to this step: React runs effects twice in
  // development, and each start would enrol a new factor (C95).
  const setupStarted = useRef(false);
  useEffect(() => {
    if (step.kind !== 'mfa_setup') {
      setupStarted.current = false;
      return;
    }
    if (step.enrolment || setupStarted.current) return;
    setupStarted.current = true;
    void startSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind]);

  const submitSetup = (factorId: string) => (setupCode: string) =>
    run(async () => {
      const { ok, data } = await post('/api/auth/mfa/setup/verify', { factorId, code: setupCode });
      if (!ok) return setError(humanError(data.error, 'That code did not work. Check the app and try the current code.'));
      signedIn(data);
    });

  const chooseSchool = (membershipId: string) =>
    run(async () => {
      const { ok, data } = await post('/api/auth/select-school', { membershipId });
      if (!ok) return setError(humanError(data.error, 'We could not open that school. Please try again.'));
      setStep({ kind: 'done', role: data.role as string, schoolId: (data.schoolId as string | null) ?? null });
      window.location.href = data.role === 'parent' ? '/parent' : '/app';
    });

  // Where the emailed code went: the masked address from the server, or
  // what the person typed on this screen.
  const typedTarget = email.trim() || 'your email';
  const guide = guidanceFor(step.kind, {
    emailTarget: step.kind === 'email_step' ? step.maskedEmail : typedTarget,
    setupNext: step.kind === 'email_step' && step.setupNext,
    codeSentAt,
  });

  const emailInput = (
    <Input
      id="email"
      label="Email, mobile number or username"
      type="text"
      autoComplete="username"
      autoCapitalize="none"
      spellCheck={false}
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      required
    />
  );
  const emailCodeInput = (target: string) => (
    <Input
      id="email-code"
      label={emailCodeLabel(target)}
      helperText={EMAIL_CODE_NOT_AUTHENTICATOR}
      inputMode="numeric"
      autoComplete="one-time-code"
      value={emailCode}
      onChange={(e) => setEmailCode(e.target.value)}
      required
    />
  );
  const authenticatorInput = (
    <Input
      id="mfa-code"
      label={authenticatorCodeLabel()}
      helperText={AUTHENTICATOR_NOT_EMAIL}
      inputMode="numeric"
      autoComplete="one-time-code"
      value={code}
      onChange={(e) => setCode(e.target.value)}
      required
    />
  );
  const rememberBox = (
    <label className="flex min-h-[44px] items-center gap-3 text-sm text-slate">
      <input type="checkbox" className="h-5 w-5" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
      Remember this device for 30 days (skip the email code here)
    </label>
  );
  const linkButton =
    'font-semibold text-royal underline disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';
  const resendLine = (onClick: () => void) => (
    <p className="text-sm text-slate/70">
      No email?{' '}
      <button type="button" className={linkButton} disabled={submitting || cooldown > 0} onClick={onClick}>
        {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
      </button>
    </p>
  );

  return (
    <div className="grid grid-cols-1 lg:min-h-[80vh] lg:grid-cols-2">
      <section aria-label="Sign-in guide" className="relative hidden overflow-hidden bg-midnight text-white lg:block">
        <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
        <div aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1" />
        <div className="relative flex h-full flex-col justify-center gap-6 p-12">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold uppercase tracking-wide opacity-80">{guide.position}</p>
            <p className="max-w-md text-3xl font-extrabold tracking-tight">{guide.title}</p>
          </div>
          <div className="nca-glass flex max-w-md flex-col gap-4 rounded-2xl p-5" aria-live="polite">
            <GuideBody guide={guide} />
          </div>
          <p className="max-w-md text-sm opacity-80">For school staff, and for parents whose school has given them a login.</p>
        </div>
      </section>

      <div className="flex flex-col items-center gap-4 bg-off-white px-4 py-4 lg:justify-center lg:py-10">
        <Card className="w-full max-w-md">
          {/* The compact step line on phones; the full guide is beside or under the form. */}
          <p className="text-sm font-bold text-royal">{guide.position}</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate">{guide.title}</h1>

          {step.kind === 'select_school' && (
            <div className="mt-6 flex flex-col gap-3">
              {step.memberships.map((m) => (
                <button
                  key={m.membershipId}
                  type="button"
                  disabled={submitting}
                  onClick={() => chooseSchool(m.membershipId)}
                  className="min-h-[44px] w-full rounded-md border-2 border-sapphire/20 bg-white px-4 py-3 text-left transition-colors hover:border-sapphire hover:bg-sapphire/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire disabled:opacity-50"
                >
                  <span className="block font-semibold text-slate">{m.schoolName}</span>
                  <span className="block text-sm text-slate/70">as {formatRole(m.role)}</span>
                </button>
              ))}
            </div>
          )}

          {step.kind === 'credentials' && (
            <form onSubmit={submitCredentials} className="mt-5 flex flex-col gap-4">
              {emailInput}
              <Input
                id="password"
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="button" className={`-mt-2 min-h-[44px] self-start text-base ${linkButton}`} onClick={() => go({ kind: 'reset_request' })}>
                Forgot password?
              </button>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
              <Button type="button" variant="secondary" disabled={submitting} className="w-full" onClick={() => go({ kind: 'code_request' })}>
                Email me a sign-in code instead
              </Button>
            </form>
          )}

          {(step.kind === 'code_request' || step.kind === 'reset_request') && (
            <form onSubmit={sendCode(step.kind === 'code_request' ? 'login' : 'reset')} className="mt-5 flex flex-col gap-4">
              {emailInput}
              <Button type="submit" disabled={submitting || cooldown > 0} className="w-full">
                {submitting ? 'Sending…' : cooldown > 0 ? `Send code (wait ${cooldown}s)` : 'Send code'}
              </Button>
              <p className="text-sm text-slate/70">
                Already have a code from us?{' '}
                <button type="button" className={linkButton} onClick={haveCode(step.kind === 'code_request' ? 'login' : 'reset')}>
                  Enter it
                </button>
              </p>
            </form>
          )}

          {step.kind === 'link_checking' && (
            <p role="status" className="mt-6 text-sm text-slate/80">
              One moment…
            </p>
          )}

          {step.kind === 'link_password' && (
            <form onSubmit={submitLinkPassword} className="mt-5 flex flex-col gap-4">
              <Input
                id="new-password"
                label="New password"
                type="password"
                autoComplete="new-password"
                helperText="8 to 72 characters. A short sentence is easy to remember and hard to guess."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                id="confirm-password"
                label="Type the new password again"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              {rememberBox}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Saving…' : 'Save password and sign in'}
              </Button>
            </form>
          )}

          {step.kind === 'code_verify' && (
            <form onSubmit={submitEmailCode} className="mt-5 flex flex-col gap-4">
              {emailCodeInput(typedTarget)}
              {rememberBox}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Checking…' : 'Sign in'}
              </Button>
              {resendLine(() => sendCode('login')())}
            </form>
          )}

          {step.kind === 'reset_verify' && (
            <form onSubmit={submitReset} className="mt-5 flex flex-col gap-4">
              {emailCodeInput(typedTarget)}
              <Input
                id="new-password"
                label="New password"
                type="password"
                autoComplete="new-password"
                helperText="8 to 72 characters. A short sentence is easy to remember and hard to guess."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                id="confirm-password"
                label="Type the new password again"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              {rememberBox}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Saving…' : 'Save password and sign in'}
              </Button>
              {resendLine(() => sendCode('reset')())}
            </form>
          )}

          {step.kind === 'reset_mfa' && (
            <form onSubmit={submitResetMfa} className="mt-5 flex flex-col gap-4">
              {authenticatorInput}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Saving…' : 'Save password and sign in'}
              </Button>
            </form>
          )}

          {step.kind === 'email_step' && (
            <form onSubmit={submitEmailStep} className="mt-5 flex flex-col gap-4">
              {emailCodeInput(step.maskedEmail)}
              {/* A platform admin still to set up an authenticator always gets this step. */}
              {!step.setupNext && rememberBox}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Checking…' : 'Continue'}
              </Button>
              {resendLine(resendEmailStep)}
            </form>
          )}

          {step.kind === 'mfa_setup' && (
            <div className="mt-5">
              {step.enrolment ? (
                <AuthenticatorEnrolment
                  enrolment={step.enrolment}
                  submitting={submitting}
                  submitLabel="Turn on and sign in"
                  onSubmit={submitSetup(step.enrolment.factorId)}
                />
              ) : error ? (
                <Button type="button" variant="outline" disabled={submitting} className="w-full" onClick={startSetup}>
                  Try again
                </Button>
              ) : (
                <p role="status" className="text-sm text-slate/80">
                  Preparing your QR code…
                </p>
              )}
            </div>
          )}

          {step.kind === 'mfa' && (
            <form onSubmit={submitMfa} className="mt-5 flex flex-col gap-4">
              {authenticatorInput}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Verifying…' : 'Verify and sign in'}
              </Button>
            </form>
          )}

          {notice && !error && (
            <p role="status" className="mt-4 text-sm text-slate/80">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-4 text-sm font-medium text-red-800">
              {error}
            </p>
          )}

          {step.kind !== 'credentials' && step.kind !== 'done' && (
            <p className="mt-5 border-t border-slate/10 pt-4 text-sm">
              <button type="button" className={linkButton} onClick={() => go({ kind: 'credentials' })}>
                Back to sign in with password
              </button>
            </p>
          )}

          {step.kind === 'credentials' && (
            <p className="mt-5 border-t border-slate/10 pt-4 text-sm text-slate/70">
              First time signing in?{' '}
              <button type="button" className={linkButton} onClick={() => go({ kind: 'reset_request' })}>
                Set your password
              </button>
              . New to NetCyberAI?{' '}
              <Link href="/get-started" className="font-semibold text-royal underline">
                Get started
              </Link>
              .
            </p>
          )}
        </Card>

        {/* Phones: the full guide folds under the form, so the form stays in view. */}
        <details className="w-full max-w-md rounded-lg border-2 border-slate/10 bg-white p-4 text-slate lg:hidden">
          <summary className="min-h-[44px] cursor-pointer py-2 font-semibold text-royal">How sign-in works</summary>
          <div className="mt-2 flex flex-col gap-4" aria-live="polite">
            <GuideBody guide={guide} />
            <p className="text-sm text-slate/80">For school staff, and for parents whose school has given them a login.</p>
          </div>
        </details>
      </div>
    </div>
  );
}

function GuideBody({ guide }: { guide: Guidance }) {
  return (
    <>
      <div>
        <p className="text-sm font-bold">What to do now</p>
        <p className="mt-1 text-sm opacity-90">{guide.doNow}</p>
      </div>
      {guide.next && (
        <div>
          <p className="text-sm font-bold">What happens next</p>
          <p className="mt-1 text-sm opacity-90">{guide.next}</p>
        </div>
      )}
      {guide.stuck.length > 0 && (
        <div>
          <p className="text-sm font-bold">If you are stuck</p>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm opacity-90">
            {guide.stuck.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm opacity-90">
            Still stuck? Ask your school admin, or{' '}
            <Link href="/support" className="font-semibold underline">
              contact support
            </Link>
            .
          </p>
        </div>
      )}
    </>
  );
}
